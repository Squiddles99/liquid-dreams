import * as THREE from 'three/webgpu';
import { Break, If, Loop, abs, atan, clamp, dot, float, int, length, max, min, mix, select, smoothstep, sqrt, vec2, vec3, vec4 } from 'three/tsl';
import {
  CREST_KNOT, CURVE_SAMPLES, FRONT_KNOT, KNOTS, PROFILE_KEYS, SPAN_SAMPLES, STAGES, TIP_KNOT, TIP_PULL, TIP_ROUND, TROUGH_KNOT, TURN_COST_H, keyTable,
} from './wombProfile';
import {
  COLLAPSE_BASE_S, COLLAPSE_PER_M, CURL_KNOTS, CURL_PHASE, EDGE_OUTER_UNITS, FLIGHT_DROP_A, HOLD_BASE_S, HOLD_PER_M, ONSET_HEIGHT_UNITS, SECTION_HAND_BACK_S,
  JOIN_SLOPE_UNITS, SECTION_KNOTS, SECTION_MARKED, SEAT_DIP_UNITS, SEAT_SHIFT_MAX, SHEET_ENDS, SHEET_KNOTS, STOOD_PHASE, SWELL_CURL_U,
} from './wombSection';

type N = any;

/** wombSection.boreWeight for a broken section (tb ≥ 0), H its crest's height (m), periodS the swell's period. */
export const boreWeightNode = (tb: N, H: N, periodS: N): N => {
  const h = max(H, 0.0), power = h.mul(periodS.div(15.0));
  const t0 = sqrt(h.div(ONSET_HEIGHT_UNITS).mul((2 * FLIGHT_DROP_A) / 9.81)).add(power.mul(HOLD_PER_M).add(HOLD_BASE_S));
  return smoothstep(t0, t0.add(power.mul(COLLAPSE_PER_M).add(COLLAPSE_BASE_S)), tb);
};

/**
 * The TSL mirror of wombProfile.profileSamples and wombSection's station numbers, step by step (plan
 * 2026-10-05-womb-profile-step3 3c): the frame pass runs it once per station, writing the station's CURVE_SAMPLES
 * profile samples (units of A, the station's plane) front edge to back edge, and its numbers. wombProfile.ts and
 * wombSection.ts stay the source of truth; ribbon.selftest.ts checks the GPU against them.
 */

const GRAVITY_MS2 = 9.81;
/** The most samples one dense segment can hold (wombSectionNodes.test checks the CPU never needs more). */
export const SAMPLES_PER_SEGMENT_MAX = 4;
/** vec4s per station in the frame buffer: [A, phase, hollow, curl weight (wombSection.curlWeight)], [tip, crest, floor
 * samples (front → back), tip life], [tip u, tip y, crest u, floor u] (units of A, the section's knots). */
export const WOMB_FRAME_VEC4S = 3;
/** vec4s per station in the knots scratch buffer: per section knot (wombSection.SectionKnot) its (u, y, home, t),
 * (sheet u, sheet y, tangent u, tangent y) and (tangent home, tangent sheet u, tangent sheet y, 0) (sectionTangents). */
export const KNOT_VEC4S = 3;
export const WOMB_KNOT_VEC4S = KNOT_VEC4S * SECTION_KNOTS;
/** The section's dense points (wombSection.sectionSamples). */
export const SECTION_DENSE_POINTS = (SECTION_KNOTS - 1) * SPAN_SAMPLES + 1;

/** The keyframe table (wombProfile.keyTable) as a read-only storage buffer's attribute, built once. */
export function createKeyTable(): THREE.StorageBufferAttribute {
  return new THREE.StorageBufferAttribute(keyTable(), 4);
}

export interface WombFrameNodes {
  A: N; phase: N; hollow: N; rho: N;
  /** wombSection.curlWeight. */
  curl: N;
  /** Front → back sample indices (float) of the tip, the crest and the floor. */
  tip: N; crest: N; floor: N; life: N;
  /** The section's tip, crest and floor knots (units of A: u, y, home). */
  tipKnot: N; crestKnot: N; floorKnot: N;
}

const smoothNode = (t: N): N => t.mul(t).mul(float(3.0).sub(t.mul(2.0)));

/** wombSection's numbers from the station: H, r, tb (encoded: < 0 none, ≥ 1e8 long past), ψ. */
export function sectionNumbersNode(st: { H: N; r: N; tb: N; psi: N }, u: { periodS: N; ribbonOnset: N }): { A: N; phase: N; hollow: N; rho: N } {
  const A = max(st.H, 0.0).div(ONSET_HEIGHT_UNITS).toVar();
  const fly: N = sqrt(A.mul(2 * FLIGHT_DROP_A / GRAVITY_MS2)).toVar();
  const power = max(st.H, 0.0).mul(u.periodS.div(15.0));
  const hold: N = power.mul(HOLD_PER_M).add(HOLD_BASE_S).toVar();
  const span = power.mul(COLLAPSE_PER_M).add(COLLAPSE_BASE_S).toVar();
  const unbroken = st.tb.lessThan(0.0), past = st.tb.greaterThanEqual(1e8);
  const t: N = max(st.tb, 0.0).toVar();
  const before = smoothstep(u.ribbonOnset, 1.0, st.r).mul(STOOD_PHASE);
  const flying: N = t.div(max(fly, 1e-6)).mul(STAGES.barrel - STOOD_PHASE).add(STOOD_PHASE);
  const collapsing: N = min(t.sub(fly).sub(hold).div(span).add(STAGES.barrel), 2.0);
  const after: N = select(t.lessThan(fly), flying, select(t.lessThan(fly.add(hold)), float(STAGES.barrel) as N, collapsing));
  const phase = select(unbroken, before, select(past, float(2.0), after)).toVar();
  const hollow = clamp(st.psi.sub(0.035).div(0.055), 0.0, 1.0).toVar();
  const end = fly.add(hold).add(span);
  const rhoAfter = float(1.0).sub(smoothstep(0.0, SECTION_HAND_BACK_S, t.sub(end)));
  const rho = select(unbroken, float(1.0), select(past, float(0.0), rhoAfter)).toVar();
  return { A, phase, hollow, rho };
}

/**
 * The station's frame and samples (wombSection.sectionSamples, front → back). `keys` is the key table (read-only vec4),
 * `knots(k)` the station's scratch vec4 element k (read and written), `write(j, v)` sample j's vec4 (its offset from the
 * sheet u − su, y − sy, its home, 0: the vertex pass adds the sheet at the home), front edge first, units of A; `sheetAt(h)`
 * the sheet at home h (units of A) as wombSection.SheetAlong reads it, in units of A: vec3(u, y, h).
 */
/** The drawing at the station's (phase, hollow) (wombProfile.profileKnots from the key table), its curl's knots with the
 * lip's end rounded (wombSection's roundedCurl), and the tip's life. */
export function drawnNode(numbers: { phase: N; hollow: N }, keys: N): { knot: N[]; drawn: N[]; life: N } {
  const ph = clamp(numbers.phase, 0.0, 2.0).toVar(), hv = clamp(numbers.hollow, 0.0, 1.0).toVar();
  const K = PROFILE_KEYS, last = K.length - 1;
  // The span: keys i and i + 1 with i the count of keys after the first whose phase ph has passed (profileKnots' while).
  let iSum: N = int(0);
  for (let k = 0; k < last - 1; k++) iSum = iSum.add(select(ph.greaterThan(K[k + 1].phase), int(1), int(0)));
  const i = iSum.toVar();
  let pa: N = float(K[0].phase), pb: N = float(K[1].phase);
  for (let k = 1; k < last; k++) {
    pa = select(i.equal(int(k)), float(K[k].phase), pa);
    pb = select(i.equal(int(k)), float(K[k + 1].phase), pb);
  }
  const phA = float(pa).toVar(), spanP = float(pb).sub(phA).toVar();
  const t = ph.sub(phA).div(spanP).toVar(), t2 = t.mul(t), t3 = t2.mul(t);
  const h00 = t3.mul(2.0).sub(t2.mul(3.0)).add(1.0).toVar(), h10 = t3.sub(t2.mul(2.0)).add(t).toVar();
  const h01 = t3.mul(-2.0).add(t2.mul(3.0)).toVar(), h11 = t3.sub(t2).toVar();
  const knot: N[] = [];
  for (let m = 0; m < KNOTS; m++) {
    const pA = keys.element(i.mul(KNOTS).add(m).mul(2)), vA = keys.element(i.mul(KNOTS).add(m).mul(2).add(1));
    const pB = keys.element(i.add(1).mul(KNOTS).add(m).mul(2)), vB = keys.element(i.add(1).mul(KNOTS).add(m).mul(2).add(1));
    // (hollow x, y, open x, y) by the Hermite in phase, then blended by hollowness.
    const q = pA.mul(h00).add(vA.mul(h10.mul(spanP))).add(pB.mul(h01)).add(vB.mul(h11.mul(spanP))).toVar();
    knot.push(vec2(q.z.add(q.x.sub(q.z).mul(hv)), q.w.add(q.y.sub(q.w).mul(hv))).toVar());
  }
  // The rounded tip (wombProfile.roundedTip with tipLife).
  const life = smoothNode(clamp(ph.sub(STAGES.standing).div(0.25), 0.0, 1.0)).mul(float(1.0).sub(smoothNode(clamp(ph.sub(STAGES.tubeFilling).div(0.25), 0.0, 1.0)))).toVar();
  const T = knot[TIP_KNOT], Ak = knot[TIP_KNOT - 1], Bk = knot[TIP_KNOT + 1];
  const dA = length(Ak.sub(T)).toVar(), dB = length(Bk.sub(T)).toVar();
  const dd = min(dA, dB).mul(TIP_ROUND);
  const rA = select(dA.greaterThan(0.0), dd.div(max(dA, 1e-30)), float(0.0)), rB = select(dB.greaterThan(0.0), dd.div(max(dB, 1e-30)), float(0.0));
  const tA = T.add(Ak.sub(T).mul(rA)).toVar(), tB = T.add(Bk.sub(T).mul(rB)).toVar();
  const tT = T.add(tA.add(tB).mul(0.5).sub(T).mul(life.mul(TIP_PULL))).toVar();
  const drawn = [...knot.slice(CREST_KNOT, TIP_KNOT), tA, tT, tB, ...knot.slice(TIP_KNOT + 1, TROUGH_KNOT + 1)];

  return { knot, drawn, life };
}

/** The sheet's reads per station (wombSection.sectionFrameKnots), at index: the back's SHEET_KNOTS, the front's, the four
 * beyond, the curl's from the swell drawing's homes, then the curl's at their own homes (they depend on the rest). */
export const SHEET_READ = { back: 0, front: SHEET_KNOTS, beyond: 2 * SHEET_KNOTS, swell: 2 * SHEET_KNOTS + 4, own: 2 * SHEET_KNOTS + 4 + CURL_KNOTS } as const;
export const SHEET_READS_FIRST = SHEET_READ.own;
export const SHEET_READS = SHEET_READ.own + CURL_KNOTS;

/** Pick element `i` (a node) of a list of nodes. */
const pick = (list: N[], i: N): N => {
  let out: N = list[0];
  for (let k = 1; k < list.length; k++) out = select(i.equal(int(k)), list[k], out);
  return out;
};

/** The home (units of A) of first-round sheet read r (< SHEET_READS_FIRST). */
export function sheetReadHomeNode(r: N, numbers: { phase: N; hollow: N }, keys: N): N {
  const { knot } = drawnNode(numbers, keys);
  const b0 = -EDGE_OUTER_UNITS, b1 = knot[CREST_KNOT - 1].x.toVar(), f0 = knot[FRONT_KNOT].x.toVar(), f1 = EDGE_OUTER_UNITS;
  const db = b1.sub(b0).div(SHEET_KNOTS - 1), df = float(f1).sub(f0).div(SHEET_KNOTS - 1);
  const homes: N[] = [];
  for (let k = 0; k < SHEET_KNOTS; k++) homes.push(db.mul(k).add(b0));
  for (let k = 0; k < SHEET_KNOTS; k++) homes.push(df.mul(k).add(f0));
  homes.push(db.negate().add(b0), b1.sub(JOIN_SLOPE_UNITS), f0.add(JOIN_SLOPE_UNITS), df.add(f1));
  for (let k = 0; k < CURL_KNOTS; k++) homes.push(float(SWELL_CURL_U[k]));
  return pick(homes, r);
}

/** The curl's knots on the station's plane (vec3 u, y, home: wombSection.sectionFrameKnots), from the drawing and the
 * first round of sheet reads (`read(r)`, r a JS index). */
function curlKnotsNode(numbers: { phase: N; rho: N }, drawn: N[], knot: N[], read: (r: number) => N): N[] {
  const curl = smoothstep(0.0, CURL_PHASE, numbers.phase).mul(numbers.rho).toVar();
  const front0 = read(SHEET_READ.front), shoulder = read(SHEET_READ.back + SHEET_KNOTS - 1);
  const shift = clamp(front0.y.sub(SEAT_DIP_UNITS).sub(knot[TROUGH_KNOT].y), -SEAT_SHIFT_MAX, SEAT_SHIFT_MAX).toVar();
  const oBack = shoulder.x.sub(shoulder.z).toVar(), oFront = front0.x.sub(front0.z).toVar();
  return drawn.map((d: N, k: number) => {
    const sh = read(SHEET_READ.swell + k), f = (k + 1) / (CURL_KNOTS + 1);
    const dh = d.x.sub(oBack.add(oFront.sub(oBack).mul(f)));
    return mix(sh, vec3(d.x, d.y.add(shift), dh), curl).toVar();
  });
}

/** The home of second-round sheet read k (the curl's knot k at its own home). */
export function curlReadHomeNode(k: N, numbers: { phase: N; hollow: N; rho: N }, keys: N, read: (r: number) => N): N {
  const { knot, drawn } = drawnNode(numbers, keys);
  return pick(curlKnotsNode(numbers, drawn, knot, read).map((p) => p.z), k);
}

export function wombFrameNode(numbers: { A: N; phase: N; hollow: N; rho: N }, keys: N, knots: (k: N) => N, write: (j: N, v: N) => void, read: (r: number) => N): WombFrameNodes {
  const ph = clamp(numbers.phase, 0.0, 2.0).toVar();
  // (write(j, v): sample j's vec4 (a u, a y, home, w): wombSection.SectionSample; the vertex pass places it at w × the sheet
  // at the home + A × a.)
  const { knot, drawn, life } = drawnNode(numbers, keys);
  // wombSection.sectionFrameKnots: the sheet at its ends, the curl from the sheet toward the drawing (the sheet read in
  // the passes before: SHEET_READ). A knot is a pair: vec3 (u, y, home) and vec2 (the sheet at its home).
  const sheetKnot = (r: number): { p: N; s: N } => { const v = vec3(read(r)).toVar(); return { p: v, s: v.xy }; };
  const back: { p: N; s: N }[] = [], front: { p: N; s: N }[] = [];
  for (let k = 0; k < SHEET_KNOTS; k++) { back.push(sheetKnot(SHEET_READ.back + k)); front.push(sheetKnot(SHEET_READ.front + k)); }
  const beyond = [0, 1, 2, 3].map((k) => sheetKnot(SHEET_READ.beyond + k));
  const curl = smoothstep(0.0, CURL_PHASE, numbers.phase).mul(numbers.rho).toVar();
  const curlKnots = curlKnotsNode(numbers, drawn, knot, read).map((p: N, k: number) => ({ p, s: vec3(read(SHEET_READ.own + k)).xy.toVar() }));
  const all = [...back, ...curlKnots, ...front];

  // wombSection.sectionTangents: the parameters, and each knot's tangent (at the joins, the sheet's own slope).
  const step = (a: N, b: N): N => sqrt(max(length(b.xy.sub(a.xy)), 1e-6));
  const tk: N[] = [float(0.0)];
  for (let k = 1; k < all.length; k++) tk.push(tk[k - 1].add(step(all[k - 1].p, all[k].p)).toVar());
  const lastKnot = all.length - 1;
  all.forEach((q, k: number) => {
    let mp: N, ms: N;
    if (k === SHEET_ENDS[1] || k === SHEET_ENDS[2]) {
      const shoulder = k === SHEET_ENDS[1], near = beyond[shoulder ? 1 : 2], o = all[shoulder ? k + 1 : k - 1];
      const dp = shoulder ? q.p.sub(near.p) : near.p.sub(q.p), ds = shoulder ? q.s.sub(near.s) : near.s.sub(q.s);
      const speed = length(o.p.xy.sub(q.p.xy)).div(abs(tk[shoulder ? k + 1 : k - 1].sub(tk[k])));
      const scale = speed.div(max(length(dp.xy), 1e-9));
      mp = dp.mul(scale); ms = ds.mul(scale);
    } else {
      const a = k === 0 ? beyond[0] : all[k - 1], b = k === lastKnot ? beyond[3] : all[k + 1];
      const ta = k === 0 ? tk[k].sub(step(a.p, q.p)) : tk[k - 1], tb = k === lastKnot ? tk[k].add(step(q.p, b.p)) : tk[k + 1];
      const cr = (pa: N, pp: N, pb: N): N => pp.sub(pa).div(tk[k].sub(ta)).sub(pb.sub(pa).div(tb.sub(ta))).add(pb.sub(pp).div(tb.sub(tk[k])));
      mp = cr(a.p, q.p, b.p); ms = cr(a.s, q.s, b.s);
    }
    knots(int(KNOT_VEC4S * k)).assign(vec4(q.p, tk[k]));
    knots(int(KNOT_VEC4S * k + 1)).assign(vec4(q.s, mp.xy));
    knots(int(KNOT_VEC4S * k + 2)).assign(vec4(mp.z, ms, 0.0));
  });

  /** wombProfile.hermitePoint over the section's knots: (u, y, home), the sheet weight w (wombSection.sampleWeight: 1 at the
   * sheet knots, 1 − the curl's weight at the curl knots, eased between over the join spans) and a = (u − w·su, y − w·sy)
   * (wombSection.SectionSample: the vertex pass places the sample at w × the sheet at its home + A × a). */
  const isSheetKnot = (k: N): N => k.lessThan(int(SHEET_KNOTS)).or(k.greaterThanEqual(int(SHEET_KNOTS + CURL_KNOTS)));
  const curlW = float(1.0).sub(curl).toVar();
  const dense = (d: N): { p: N; off: N; w: N } => {
    const lastE = int(KNOT_VEC4S * (SECTION_KNOTS - 1));
    const p = vec3(knots(lastE).xyz).toVar(), off = vec2(knots(lastE).xy.sub(knots(lastE.add(1)).xy)).toVar(), w = float(1.0).toVar();
    If(d.lessThan(int((SECTION_KNOTS - 1) * SPAN_SAMPLES)), () => {
      const sp = d.div(int(SPAN_SAMPLES)).toVar(), s = float(d.sub(sp.mul(int(SPAN_SAMPLES)))).div(SPAN_SAMPLES).toVar();
      const ea = sp.mul(KNOT_VEC4S), eb = sp.add(1).mul(KNOT_VEC4S);
      const a0 = knots(ea).toVar(), a1 = knots(ea.add(1)).toVar(), a2 = knots(ea.add(2)).toVar();
      const b0n = knots(eb).toVar(), b1n = knots(eb.add(1)).toVar(), b2n = knots(eb.add(2)).toVar();
      const dt = b0n.w.sub(a0.w), s2 = s.mul(s), s3 = s2.mul(s);
      const h00 = s3.mul(2.0).sub(s2.mul(3.0)).add(1.0), h10 = dt.mul(s3.sub(s2.mul(2.0)).add(s)), h01 = s2.mul(3.0).sub(s3.mul(2.0)), h11 = dt.mul(s3.sub(s2));
      p.assign(a0.xyz.mul(h00).add(vec3(a1.zw, a2.x).mul(h10)).add(b0n.xyz.mul(h01)).add(vec3(b1n.zw, b2n.x).mul(h11)));
      const sv = a1.xy.mul(h00).add(a2.yz.mul(h10)).add(b1n.xy.mul(h01)).add(b2n.yz.mul(h11));
      const wa = select(isSheetKnot(sp), float(1.0), curlW), wb = select(isSheetKnot(sp.add(1)), float(1.0), curlW);
      w.assign(wa.add(wb.sub(wa).mul(smoothNode(s))));
      off.assign(p.xy.sub(sv.mul(w)));
    });
    return { p, off, w };
  };
  /** wombProfile.turnAngle, on (u, y). */
  const turn = (a: N, b: N): N => {
    const cr = a.x.mul(b.y).sub(a.y.mul(b.x)), dt = a.x.mul(b.x).add(a.y.mul(b.y));
    return select(dot(a.xy, a.xy).greaterThan(1e-12).and(dot(b.xy, b.xy).greaterThan(1e-12)), abs(atan(cr, dt)), float(0.0));
  };

  // The walk (wombProfile.curveSamples): the total, then the samples.
  // The walk's points: (u, y, home) and the offset, as one vec4 (u, y, home) + vec2 pair; the spread is on (u, y).
  const pointOf = (d: N): { p: N; off: N; w: N } => { const q = dense(d); return { p: vec3(q.p).toVar(), off: vec2(q.off).toVar(), w: float(q.w).toVar() }; };
  const prev = vec3(pointOf(int(0)).p).toVar(), cur = vec3(pointOf(int(1)).p).toVar();
  const s0 = float(0.0).toVar(), s1 = length(cur.xy.sub(prev.xy)).toVar();
  Loop({ start: 2, end: SECTION_DENSE_POINTS, name: 'd' } as N, ({ d }: N) => {
    const next = vec3(pointOf(d).p).toVar();
    s1.addAssign(length(next.xy.sub(cur.xy)).add(turn(cur.sub(prev), next.sub(cur)).mul(TURN_COST_H)));
    prev.assign(cur); cur.assign(next);
  });
  const total = float(s1).toVar();
  const n = CURVE_SAMPLES, count: N = int(0).toVar();
  const mark = { crest: int(n - 1).toVar(), tip: int(n - 1).toVar(), floor: int(n - 1).toVar() };
  const seen = { crest: int(0).toVar(), tip: int(0).toVar(), floor: int(0).toVar() };
  /** Sample j: (a.xy, home, w) between two dense points by f (wombSection.SectionSample's a, h, w). */
  const at = (j: N, o: N): void => write(int(n - 1).sub(j), vec4(o));
  const prevO = vec4(0.0).toVar(), curO = vec4(0.0).toVar();
  /** One segment of the walk: dense point dIdx − 1 (q0, spread a) to dIdx (q1, spread b). */
  const visit = (q0: N, q1: N, a: N, b: N, dIdx: N): void => {
    for (const key of ['crest', 'tip', 'floor'] as const) {
      If(seen[key].equal(int(0)).and(dIdx.greaterThanEqual(int(SECTION_MARKED[key] * SPAN_SAMPLES))), () => {
        seen[key].assign(int(1));
        mark[key].assign(min(count as N, int(n - 1) as N));
      });
    }
    Loop(SAMPLES_PER_SEGMENT_MAX, () => {
      const target = total.mul(float(count)).div(n - 1).toVar();
      If(count.greaterThanEqual(int(n - 1)).or(target.greaterThan(b)), () => { Break(); });
      const f = select(b.greaterThan(a), clamp(target.sub(a).div(max(b.sub(a), 1e-30)), 0.0, 1.0), float(0.0));
      at(count, prevO.add(curO.sub(prevO).mul(f)));
      count.addAssign(int(1));
    });
  };
  /** (a u, a y, home, w) of a dense point. */
  const oh = (q: { p: N; off: N; w: N }): N => vec4(q.off, q.p.z, q.w);
  {
    const q0 = pointOf(int(0)), q1 = pointOf(int(1));
    prev.assign(q0.p); cur.assign(q1.p); prevO.assign(oh(q0)); curO.assign(oh(q1));
  }
  s0.assign(0.0); s1.assign(length(cur.xy.sub(prev.xy)));
  visit(prev, cur, s0, s1, int(1));
  Loop({ start: 2, end: SECTION_DENSE_POINTS, name: 'd' } as N, ({ d }: N) => {
    const q = pointOf(d), next = q.p;
    const tn = turn(cur.sub(prev), next.sub(cur));
    s0.assign(s1);
    s1.assign(s0.add(length(next.xy.sub(cur.xy))).add(tn.mul(TURN_COST_H)));
    prev.assign(cur); cur.assign(next);
    prevO.assign(curO); curO.assign(oh(q));
    visit(prev, cur, s0, s1, d);
  });
  // Any sample the walk did not reach (none, by the test), then the last: the last knot.
  Loop(SAMPLES_PER_SEGMENT_MAX, () => {
    If(count.greaterThanEqual(int(n - 1)), () => { Break(); });
    at(count, curO);
    count.addAssign(int(1));
  });
  at(int(n - 1), oh(pointOf(int(SECTION_DENSE_POINTS - 1))));
  const fb = (m: N): N => float(int(n - 1).sub(m));
  return {
    ...numbers, curl, life,
    tip: fb(mark.tip), crest: fb(mark.crest), floor: fb(mark.floor),
    tipKnot: all[SECTION_MARKED.tip].p, crestKnot: all[SECTION_MARKED.crest].p, floorKnot: all[SECTION_MARKED.floor].p,
  };
}

