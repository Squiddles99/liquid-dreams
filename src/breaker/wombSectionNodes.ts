import * as THREE from 'three/webgpu';
import { Break, If, Loop, abs, atan, clamp, dot, float, int, length, max, min, select, smoothstep, sqrt, vec2, vec4 } from 'three/tsl';
import {
  CREST_KNOT, CURVE_SAMPLES, DENSE_POINTS, KNOTS, MARKED_KNOTS, PROFILE_KEYS, ROUNDED_KNOTS, SPANS, SPAN_SAMPLES, STAGES, TIP_KNOT, TIP_PULL, TIP_ROUND,
  TURN_COST_H, keyTable,
} from './wombProfile';
import {
  COLLAPSE_BASE_S, COLLAPSE_PER_M, BACK_BLEND_UNITS, FLIGHT_DROP_A, HOLD_BASE_S, HOLD_PER_M, ONSET_HEIGHT_UNITS, RHO_FULL_RATIO,
  FRONT_BLEND_UNITS, SECTION_HAND_BACK_S, STOOD_PHASE,
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
/** vec4s per station in the frame buffer: [A, phase, hollow, ρ], [tip, crest, floor samples (front → back), tip life],
 * [tip u, tip y, crest u, crest y] (units of A). */
export const WOMB_FRAME_VEC4S = 3;
/** vec4s per station in the knots scratch buffer (the rounded knots). */
export const WOMB_KNOT_VEC4S = ROUNDED_KNOTS;

/** The keyframe table (wombProfile.keyTable) as a read-only storage buffer's attribute, built once. */
export function createKeyTable(): THREE.StorageBufferAttribute {
  return new THREE.StorageBufferAttribute(keyTable(), 4);
}

export interface WombFrameNodes {
  A: N; phase: N; hollow: N; rho: N;
  /** Front → back sample indices (float) of the tip, the crest and the floor. */
  tip: N; crest: N; floor: N; life: N;
  tipKnot: N; crestKnot: N;
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
  const rho = select(unbroken, smoothstep(u.ribbonOnset, RHO_FULL_RATIO, st.r), select(past, float(0.0), rhoAfter)).toVar();
  return { A, phase, hollow, rho };
}

/**
 * The station's frame and samples (wombProfile.profileSamples, front → back). `keys` is the key table (read-only vec4),
 * `knots(k)` the station's scratch vec4 element k (read and written), `write(j, v)` sample j's vec4 (u, y, 0, 0), front
 * edge first.
 */
export function wombFrameNode(numbers: { A: N; phase: N; hollow: N; rho: N }, keys: N, knots: (k: N) => N, write: (j: N, v: N) => void): WombFrameNodes {
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
  const rounded = [...knot.slice(0, TIP_KNOT), tA, tT, tB, ...knot.slice(TIP_KNOT + 1)];
  rounded.forEach((p, k) => knots(int(k)).assign(vec4(p, 0.0, 0.0)));

  const lastK = ROUNDED_KNOTS - 1;
  const KN = (k: N): N => knots(k.clamp(int(0), int(lastK))).xy;
  /** wombProfile.densePoint. */
  const dense = (d: N): N => {
    const out = vec2(KN(int(lastK))).toVar();
    If(d.lessThan(int(SPANS * SPAN_SAMPLES)), () => {
      const sp = d.div(int(SPAN_SAMPLES)).toVar(), ii = d.sub(sp.mul(int(SPAN_SAMPLES)));
      const p0 = KN(sp.sub(1)).toVar(), p1 = KN(sp).toVar(), p2 = KN(sp.add(1)).toVar(), p3 = KN(sp.add(2)).toVar();
      const tj = (ti: N, a: N, b: N): N => ti.add(sqrt(max(length(b.sub(a)), 1e-6)));
      const t0 = float(0.0), t1 = tj(t0, p0, p1).toVar(), tt2 = tj(t1, p1, p2).toVar(), tt3 = tj(tt2, p2, p3).toVar();
      const tt = t1.add(tt2.sub(t1).mul(float(ii)).div(SPAN_SAMPLES)).toVar();
      const L = (a: N, b: N, ta: N, tb: N): N => a.mul(tb.sub(tt)).add(b.mul(tt.sub(ta))).div(tb.sub(ta));
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, tt2).toVar(), A3 = L(p2, p3, tt2, tt3);
      out.assign(L(L(A1, A2, t0, tt2), L(A2, A3, t1, tt3), t1, tt2));
    });
    return out;
  };
  /** wombProfile.turnAngle. */
  const turn = (a: N, b: N): N => {
    const cr = a.x.mul(b.y).sub(a.y.mul(b.x)), dt = a.x.mul(b.x).add(a.y.mul(b.y));
    return select(dot(a, a).greaterThan(1e-12).and(dot(b, b).greaterThan(1e-12)), abs(atan(cr, dt)), float(0.0));
  };

  // The walk (wombProfile.profileSamples): the total, then the samples.
  const prev = vec2(dense(int(0))).toVar(), cur = vec2(dense(int(1))).toVar();
  const s0 = float(0.0).toVar(), s1 = length(cur.sub(prev)).toVar();
  Loop({ start: 2, end: DENSE_POINTS, name: 'd' } as N, ({ d }: N) => {
    const next = vec2(dense(d)).toVar();
    s1.addAssign(length(next.sub(cur)).add(turn(cur.sub(prev), next.sub(cur)).mul(TURN_COST_H)));
    prev.assign(cur); cur.assign(next);
  });
  const total = float(s1).toVar();
  const n = CURVE_SAMPLES, count: N = int(0).toVar();
  const mark = { crest: int(n - 1).toVar(), tip: int(n - 1).toVar(), floor: int(n - 1).toVar() };
  const seen = { crest: int(0).toVar(), tip: int(0).toVar(), floor: int(0).toVar() };
  const at = (j: N, q: N): void => write(int(n - 1).sub(j), vec4(q, 0.0, 0.0));
  /** One segment of the walk: dense point dIdx − 1 (q0, spread a) to dIdx (q1, spread b). */
  const visit = (q0: N, q1: N, a: N, b: N, dIdx: N): void => {
    for (const key of ['crest', 'tip', 'floor'] as const) {
      If(seen[key].equal(int(0)).and(dIdx.greaterThanEqual(int(MARKED_KNOTS[key] * SPAN_SAMPLES))), () => {
        seen[key].assign(int(1));
        mark[key].assign(min(count as N, int(n - 1) as N));
      });
    }
    Loop(SAMPLES_PER_SEGMENT_MAX, () => {
      const target = total.mul(float(count)).div(n - 1).toVar();
      If(count.greaterThanEqual(int(n - 1)).or(target.greaterThan(b)), () => { Break(); });
      const f = select(b.greaterThan(a), clamp(target.sub(a).div(max(b.sub(a), 1e-30)), 0.0, 1.0), float(0.0));
      at(count, q0.add(q1.sub(q0).mul(f)));
      count.addAssign(int(1));
    });
  };
  prev.assign(dense(int(0))); cur.assign(dense(int(1)));
  s0.assign(0.0); s1.assign(length(cur.sub(prev)));
  visit(prev, cur, s0, s1, int(1));
  Loop({ start: 2, end: DENSE_POINTS, name: 'd' } as N, ({ d }: N) => {
    const next = vec2(dense(d)).toVar();
    const tn = turn(cur.sub(prev), next.sub(cur));
    s0.assign(s1);
    s1.assign(s0.add(length(next.sub(cur))).add(tn.mul(TURN_COST_H)));
    prev.assign(cur); cur.assign(next);
    visit(prev, cur, s0, s1, d);
  });
  // Any sample the walk did not reach (none, by the test), then the last: the last knot.
  Loop(SAMPLES_PER_SEGMENT_MAX, () => {
    If(count.greaterThanEqual(int(n - 1)), () => { Break(); });
    at(count, cur);
    count.addAssign(int(1));
  });
  at(int(n - 1), KN(int(lastK)));
  const fb = (m: N): N => float(int(n - 1).sub(m));
  return {
    ...numbers, life,
    tip: fb(mark.tip), crest: fb(mark.crest), floor: fb(mark.floor),
    tipKnot: tT, crestKnot: knot[CREST_KNOT],
  };
}

/** wombSection.interiorWeight. */
export const interiorWeightNode = (uUnits: N, crestU: N): N => float(1.0).sub(select(uUnits.lessThan(crestU),
  smoothstep(BACK_BLEND_UNITS[0], BACK_BLEND_UNITS[1], crestU.sub(uUnits)), smoothstep(FRONT_BLEND_UNITS[0], FRONT_BLEND_UNITS[1], uUnits)));
