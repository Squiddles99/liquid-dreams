import * as THREE from 'three/webgpu';
import { Break, If, Loop, abs, atan, clamp, dot, float, int, length, max, min, mix, select, smoothstep, sqrt, uniform, vec2, vec3, vec4 } from 'three/tsl';
import {
  CREST_KNOT, CURVE_SAMPLES, FLOOR_KNOT, FRONT_KNOT, KNOTS, PROFILE_KEYS, SPAN_SAMPLES, STAGES, TIP_KNOT, TIP_PULL, TIP_ROUND, TROUGH_KNOT, TURN_COST_H, KEY_VEC4S, SPILL_FULL, SPILL_TO, keyTable,
} from './wombProfile';
import {
  COLLAPSE_BASE_S, COLLAPSE_PER_M, CURL_KNOTS, CURL_PHASE, EDGE_OUTER_UNITS, FLIGHT_DROP_A, HOLD_BASE_S, HOLD_PER_M, ONSET_HEIGHT_UNITS, SECTION_HAND_BACK_S,
  JOIN_SLOPE_UNITS, SECTION_KNOTS, SECTION_MARKED, SEAT_DIP_UNITS, SEAT_SHIFT_MAX, SHEET_ENDS, SHEET_KNOTS, STOOD_PHASE, SWELL_CURL_U,
  SURGE_FALL_BASE_S, SURGE_FALL_PER_M, surgeLift, CREST_SHARE, TROUGH_SHARE, SEAT_HELD_PHASE, SEAT_HELD_KNOTS, setSeatShares,
  FOOT_DEEPEST, FOOT_FLAT_RELIEF, FOOT_PHASES, SECTION_FLOOR, SECTION_TROUGH, setFlightDropA,
  CREST_EDGE_SHARE, CREST_JOIN_SPEED, ONE_JOIN_UNITS, ONE_SURFACE, ROOT_BY_U_PHASES, ROOT_MIN_AHEAD, SECTION_CREST, SECTION_ROOT, setOneSurface,
} from './wombSection';

type N = any;

/** The seat's dials on the GPU (wombSection.setSeatShares' mirror). */
export const seatUniforms = { crest: uniform(CREST_SHARE), trough: uniform(TROUGH_SHARE) };
/** The dials crestShare / troughShare, for the CPU twins and the ribbon alike. */
export function applySeatShares(crest: number, trough: number): void {
  setSeatShares(crest, trough);
  seatUniforms.crest.value = crest; seatUniforms.trough.value = trough;
}
/** The lip's flight dial on the GPU (wombSection.setFlightDropA's mirror): the free fall's drop in A. */
export const flightUniforms = { dropA: uniform(FLIGHT_DROP_A) };
/** The dial flightDropA, for the CPU twins and every GPU reader alike. */
export function applyFlightDropA(a: number): void {
  setFlightDropA(a);
  flightUniforms.dropA.value = a;
}
/** wombSection.ONE_SURFACE's dial on the GPU (the one-surface law, womb-story Task 10). */
export const oneSurfaceUniform = uniform(ONE_SURFACE);
/** The dial oneSurface, for the CPU twins and the ribbon alike. */
export function applyOneSurface(v: number): void {
  setOneSurface(v);
  oneSurfaceUniform.value = v;
}
/** wombSection.flightTime from A (m): the lip's free fall from flightDropA × A. */
export const flightTimeNodeA = (A: N): N => sqrt(A.mul(flightUniforms.dropA).mul(2 / GRAVITY_MS2));
/** wombSection.seatOf: the seat (s, b), y → s·y + b, from the family's unlifted knots and the sheet's crest (units of A). */
function seatNode(phase: N, hollow: N, knot: N[], sheetCrest: N): { s: N; b: N } {
  const hv = clamp(hollow, 0.0, 1.0), H = SEAT_HELD_KNOTS, held = phase.greaterThan(SEAT_HELD_PHASE);
  const c = select(held, hv.mul(H[1] - H[0]).add(H[0]), knot[CREST_KNOT].y).toVar();
  const f = select(held, hv.mul(H[3] - H[2]).add(H[2]), knot[FLOOR_KNOT].y).toVar();
  const s1 = seatUniforms.crest.add(seatUniforms.trough).div(max(c.sub(f), 0.2)).toVar(), b1 = seatUniforms.crest.sub(s1.mul(c)).toVar();
  const w = smoothstep(0.0, STOOD_PHASE, phase), b0 = sheetCrest.sub(c);
  const sc = s1.sub(1.0).mul(w).add(1.0).toVar();
  const bLow = max(b1.sub(b0).mul(w).add(b0), sheetCrest.sub(sc.mul(c)));
  const stood = phase.greaterThanEqual(STOOD_PHASE);
  return { s: select(stood, s1, sc), b: select(stood, b1, bLow) };
}

/** wombSection.boreWeight for a broken section (tb ≥ 0), H its crest's height (m), periodS the swell's period. */
export const boreWeightNode = (tb: N, H: N, periodS: N): N => {
  const h = max(H, 0.0), power = h.mul(periodS.div(15.0));
  const t0 = flightTimeNodeA(h.div(ONSET_HEIGHT_UNITS)).add(power.mul(HOLD_PER_M).add(HOLD_BASE_S));
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
// 6 since 2026-10-15 (womb-story Task 10: the one-surface law's sharper turns at the crest and the root put 5 in one).
export const SAMPLES_PER_SEGMENT_MAX = 6;
/** vec4s per station in the frame buffer: [A, phase, hollow, curl weight (wombSection.curlWeight)], [tip, crest, floor
 * samples (front → back), tip life], [tip u, tip y, crest u, floor u] (units of A, the section's knots). */
export const WOMB_FRAME_VEC4S = 3;
/** vec4s per station in the knots scratch buffer: per section knot (wombSection.SectionKnot) its (u, y, home, t),
 * (sheet u, sheet y, tangent u, tangent y) and (tangent home, tangent sheet u, tangent sheet y, 0) (sectionTangents). */
export const KNOT_VEC4S = 3;
export const WOMB_KNOT_VEC4S = KNOT_VEC4S * SECTION_KNOTS;
/** The section's dense points (wombSection.sectionSamples). */
export const SECTION_DENSE_POINTS = (SECTION_KNOTS - 1) * SPAN_SAMPLES + 1;

/** The profile knot each drawn curl knot comes from (crest … trough, the tip as three: wombSection's roundedCurl). */
const DRAWN_FROM: readonly number[] = [
  ...Array.from({ length: TIP_KNOT - CREST_KNOT }, (_, i) => CREST_KNOT + i), TIP_KNOT, TIP_KNOT, TIP_KNOT,
  ...Array.from({ length: TROUGH_KNOT - TIP_KNOT }, (_, i) => TIP_KNOT + 1 + i),
];

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
export function sectionNumbersNode(st: { H: N; r: N; tb: N; psi: N }, u: { periodS: N; ribbonOnset: N; surge?: N }): { A: N; phase: N; hollow: N; rho: N; surge: N } {
  const A = max(st.H, 0.0).div(ONSET_HEIGHT_UNITS).toVar();
  const fly: N = flightTimeNodeA(A).toVar();
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
  // Under the law (oneSurface) a section waiting its turn draws nothing (wombSection.sectionWeight).
  const rho = select(unbroken, select(oneSurfaceUniform.greaterThan(0.5), float(0.0), float(1.0)), select(past, float(0.0), rhoAfter)).toVar();
  // wombSection.surgeWeight × the dial: in over phases 1.25–1.5, out over SURGE_FALL_* after phase 1.5, × hollow.
  const t15 = fly.add(hold).add(span.mul(0.5));
  const fall = power.mul(SURGE_FALL_PER_M).add(SURGE_FALL_BASE_S);
  const surgeW = smoothstep(1.25, 1.5, phase).mul(float(1.0).sub(smoothstep(t15, t15.add(fall), t))).mul(hollow);
  const surge = select(unbroken.or(past), float(0.0), surgeW).mul(u.surge ?? 0.0).toVar();
  return { A, phase, hollow, rho, surge };
}

/**
 * The station's frame and samples (wombSection.sectionSamples, front → back). `keys` is the key table (read-only vec4),
 * `knots(k)` the station's scratch vec4 element k (read and written), `write(j, v)` sample j's vec4 (its offset from the
 * sheet u − su, y − sy, its home, 0: the vertex pass adds the sheet at the home), front edge first, units of A; `sheetAt(h)`
 * the sheet at home h (units of A) as wombSection.SheetAlong reads it, in units of A: vec3(u, y, h).
 */
/** The drawing at the station's (phase, hollow) (wombProfile.profileKnots from the key table), its curl's knots with the
 * lip's end rounded (wombSection's roundedCurl), and the tip's life. */
export function drawnNode(numbers: { phase: N; hollow: N; surge?: N }, keys: N): { knot: N[]; drawn: N[]; drawn0: N[]; life: N } {
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
  // Below SPILL_TO the approved blend at SPILL_TO eases into the spill (wombProfile.profileKnots, womb-story Task 3b).
  const low = hv.lessThan(SPILL_TO), hb = select(low, float(SPILL_TO), hv).toVar();
  const ws = smoothNode(clamp(hv.sub(SPILL_FULL).div(SPILL_TO - SPILL_FULL), 0.0, 1.0)).toVar();
  for (let m = 0; m < KNOTS; m++) {
    const at = (j: N, e: number): N => keys.element(j.mul(KNOTS).add(m).mul(KEY_VEC4S).add(e));
    const pA = at(i, 0), vA = at(i, 1), sA = at(i, 2), pB = at(i.add(1), 0), vB = at(i.add(1), 1), sB = at(i.add(1), 2);
    // (hollow x, y, open x, y) by the Hermite in phase, then blended by hollowness; the spill (x, y, its velocities) the same.
    const q = pA.mul(h00).add(vA.mul(h10.mul(spanP))).add(pB.mul(h01)).add(vB.mul(h11.mul(spanP))).toVar();
    const sp = sA.xy.mul(h00).add(sA.zw.mul(h10.mul(spanP))).add(sB.xy.mul(h01)).add(sB.zw.mul(h11.mul(spanP))).toVar();
    const base = vec2(q.z.add(q.x.sub(q.z).mul(hb)), q.w.add(q.y.sub(q.w).mul(hb))).toVar();
    knot.push(select(low, sp.add(base.sub(sp).mul(ws)), base).toVar());
  }
  // The rounded tip (wombProfile.roundedTip with tipLife).
  const life = smoothNode(clamp(ph.sub(STAGES.standing).div(0.25), 0.0, 1.0)).mul(float(1.0).sub(smoothNode(clamp(ph.sub(STAGES.tubeFilling).div(0.25), 0.0, 1.0)))).toVar();
  const T = knot[TIP_KNOT], Ak = knot[TIP_KNOT - 1], Bk = knot[TIP_KNOT + 1];
  const dA = length(Ak.sub(T)).toVar(), dB = length(Bk.sub(T)).toVar();
  const dd = min(dA, dB).mul(TIP_ROUND);
  const rA = select(dA.greaterThan(0.0), dd.div(max(dA, 1e-30)), float(0.0)), rB = select(dB.greaterThan(0.0), dd.div(max(dB, 1e-30)), float(0.0));
  const tA = T.add(Ak.sub(T).mul(rA)).toVar(), tB = T.add(Bk.sub(T).mul(rB)).toVar();
  const tT = T.add(tA.add(tB).mul(0.5).sub(T).mul(life.mul(TIP_PULL))).toVar();
  const drawn0 = [...knot.slice(CREST_KNOT, TIP_KNOT), tA, tT, tB, ...knot.slice(TIP_KNOT + 1, TROUGH_KNOT + 1)];
  // The surge (wombSection.surgeLift, dial folded into it): each drawn knot lifted by its profile knot's share. The knots
  // themselves stay the family's (the seat is set from the unlifted trough, as sectionFrameKnots does).
  const from = [...DRAWN_FROM];
  const drawn = numbers.surge === undefined ? drawn0
    : drawn0.map((p, j) => { const s = surgeLift(from[j], 1, 1); return s === 0 ? p : vec2(p.x, p.y.add(numbers.surge!.mul(s))).toVar(); });

  return { knot, drawn, drawn0, life };
}

/** The sheet's reads per station (wombSection.sectionFrameKnots), at index: the back's SHEET_KNOTS, the front's, the four
 * beyond, the curl's from the swell drawing's homes, then the curl's at their own homes (they depend on the rest). */
export const SHEET_READ = { back: 0, front: SHEET_KNOTS, beyond: 2 * SHEET_KNOTS, swell: 2 * SHEET_KNOTS + 4, own: 2 * SHEET_KNOTS + 4 + CURL_KNOTS, third: 2 * SHEET_KNOTS + 4 + 2 * CURL_KNOTS } as const;
export const SHEET_READS_FIRST = SHEET_READ.own;
/** Under the law (oneSurface) the second round is the crest edge's probe (slot 0), the lip's knots at their homes (1-6) and
 * the root's probe (ROOT_DRAWN); the third (THIRD) the crest knot, the root, the face's three knots below it and the joins. */
export const SHEET_READS_SECOND = SHEET_READ.third;
export const THIRD = { crest: 0, root: 1, face: 2, crestJoin: 5, rootJoin: 6 } as const;
export const THIRD_READS = 7;
export const SHEET_READS = SHEET_READ.third + THIRD_READS;
/** The root among the drawn curl's knots (wombSection.ROOT_DRAWN). */
const ROOT_DRAWN = SECTION_ROOT - SHEET_KNOTS;

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
function curlKnotsNode(numbers: { phase: N; hollow: N; rho: N }, drawn: N[], drawn0: N[], knot: N[], read: (r: number) => N): N[] {
  const curl = smoothstep(0.0, CURL_PHASE, numbers.phase).mul(numbers.rho).toVar();
  const front0 = read(SHEET_READ.front), shoulder = read(SHEET_READ.back + SHEET_KNOTS - 1);
  let sheetCrest: N = read(SHEET_READ.swell).y;
  for (let k = 1; k < CURL_KNOTS; k++) sheetCrest = max(sheetCrest, read(SHEET_READ.swell + k).y);
  const seat = seatNode(numbers.phase, numbers.hollow, knot, sheetCrest);
  const oBack = shoulder.x.sub(shoulder.z).toVar(), oFront = front0.x.sub(front0.z).toVar();
  // The curtain's foot (wombSection.footY / footWeight / footFloorWeight): the floor and trough knots onto the front sheet's
  // lowest point, from the front knots already read.
  let low: N = front0.y, high: N = front0.y;
  for (let k = 1; k < SHEET_KNOTS; k++) { const y = read(SHEET_READ.front + k).y; low = min(low, y); high = max(high, y); }
  for (let k = 0; k < SHEET_KNOTS; k++) high = max(high, read(SHEET_READ.back + k).y);
  const foot = mix(seatUniforms.trough.negate(), max(low, -FOOT_DEEPEST), smoothstep(0.0, FOOT_FLAT_RELIEF, high.sub(low))).toVar();
  const fw = smoothstep(FOOT_PHASES[0], FOOT_PHASES[1], numbers.phase).toVar();
  const fwFloor = fw.mul(float(1.0).sub(smoothstep(FOOT_PHASES[2], FOOT_PHASES[3], numbers.phase))).toVar();
  const FLOOR_DRAWN = SECTION_FLOOR - SHEET_KNOTS, TROUGH_DRAWN = SECTION_TROUGH - SHEET_KNOTS;
  return drawn.map((d: N, k: number) => {
    const sh = read(SHEET_READ.swell + k), f = (k + 1) / (CURL_KNOTS + 1);
    const dh = d.x.sub(oBack.add(oFront.sub(oBack).mul(f)));
    // The seat scales the family's own curl; the foot, then the surge's lift go on after it (sectionFrameKnots).
    const seated = drawn0[k].y.mul(seat.s).add(seat.b);
    const footed = k === FLOOR_DRAWN ? mix(seated, foot, fwFloor) : k === TROUGH_DRAWN ? mix(seated, foot, fw) : seated;
    return mix(sh, vec3(d.x, footed.add(d.y.sub(drawn0[k].y)), dh), curl).toVar();
  });
}


const lerp3 = (a: N, b: N, f: N): N => a.add(b.sub(a).mul(f));
/** The lerp factor of the criterion's 0 between two values (1 where they are equal: wombSection's rootBracket / rootRefine). */
const zeroAt = (va: N, vb: N): N => select(vb.equal(va), float(1.0), clamp(va.negate().div(select(vb.equal(va), float(1.0), vb.sub(va))), 0.0, 1.0));

/**
 * The law's numbers from the first round of reads (wombSection.oneSurfaceKnots, topHome, rootBracket): the face's reads (the
 * shoulder, then the swell homes), the crest's edge (its estimate and bracket), the seat, the drawing moved onto the crest
 * (the lip's knots with their homes), the root's criterion and its first estimate.
 */
function oneRound1(numbers: { phase: N; hollow: N; rho: N }, knot: N[], drawn: N[], drawn0: N[], read: (r: number) => N) {
  const phase = numbers.phase;
  const g = smoothstep(0.0, CURL_PHASE, phase).mul(numbers.rho).toVar();
  const R: N[] = [vec3(read(SHEET_READ.back + SHEET_KNOTS - 1)).toVar()];
  for (let k = 0; k < CURL_KNOTS; k++) R.push(vec3(read(SHEET_READ.swell + k)).toVar());
  const n = R.length;
  // The low in front (frontLow: the swell homes' and the front's reads) and the high (the front's and the back's).
  let low: N = R[1].y, high: N = read(SHEET_READ.front).y;
  for (let k = 2; k < n; k++) low = min(low, R[k].y);
  for (let k = 0; k < SHEET_KNOTS; k++) { const y = read(SHEET_READ.front + k).y; low = min(low, y); high = max(high, y); }
  for (let k = 0; k < SHEET_KNOTS; k++) high = max(high, read(SHEET_READ.back + k).y);
  const lowV = float(low).toVar(), highV = float(high).toVar();
  // topHome: the highest read at or ahead of the station's own home (the swell homes, index 1 on), then the edge forward of it.
  const bestY = float(R[1].y).toVar(), bestI = int(1).toVar(), bestR = vec3(R[1]).toVar();
  for (let k = 2; k < n; k++) {
    const better = R[k].y.greaterThan(bestY);
    bestY.assign(select(better, R[k].y, bestY)); bestI.assign(select(better, int(k), bestI)); bestR.assign(select(better, R[k], bestR));
  }
  const share = float(CREST_EDGE_SHARE).mul(float(1.0).sub(smoothstep(ROOT_BY_U_PHASES[0], ROOT_BY_U_PHASES[1], phase)));
  const edge = bestY.sub(share.mul(max(bestY.sub(lowV), 0.0))).toVar();
  const found = int(0).toVar(), ta = vec3(bestR).toVar(), tb = vec3(bestR).toVar(), tIdx = int(bestI).toVar();
  for (let k = 2; k < n; k++) {
    const hit = found.equal(int(0)).and(int(k).greaterThan(bestI)).and(R[k].y.lessThan(edge));
    ta.assign(select(hit, R[k - 1], ta)); tb.assign(select(hit, R[k], tb)); tIdx.assign(select(hit, int(k - 1), tIdx));
    found.assign(select(hit, int(1), found));
  }
  const hasTop = found.equal(int(1)).toVar();
  const tf = clamp(edge.sub(ta.y).div(select(tb.y.equal(ta.y), float(1.0), tb.y.sub(ta.y))), 0.0, 1.0);
  const topP = vec3(select(hasTop, lerp3(ta, tb, tf), bestR)).toVar();
  // The seat: the family's crest on the edge, its floor on the sheet's low in front (footY), scaled between.
  const hv = clamp(numbers.hollow, 0.0, 1.0), H = SEAT_HELD_KNOTS, held = phase.greaterThan(SEAT_HELD_PHASE);
  const c = select(held, hv.mul(H[1] - H[0]).add(H[0]), knot[CREST_KNOT].y);
  const f = select(held, hv.mul(H[3] - H[2]).add(H[2]), knot[FLOOR_KNOT].y);
  const foot = mix(seatUniforms.trough.negate(), max(lowV, -FOOT_DEEPEST), smoothstep(0.0, FOOT_FLAT_RELIEF, highV.sub(lowV)));
  const scale = max(topP.y.sub(foot), 0.0).div(max(c.sub(f), 0.2)).toVar();
  const shift = topP.y.sub(scale.mul(drawn0[0].y)).toVar(), du = topP.x.sub(drawn0[0].x).toVar();
  const one: N[] = drawn.map((d: N) => vec2(d.x.add(du), d.y.mul(scale).add(shift)).toVar());
  // The lip's knots (1 … ROOT_DRAWN − 1) from the swell homes toward the drawing by g, homes as sectionFrameKnots'.
  const front0 = read(SHEET_READ.front), shoulder = read(SHEET_READ.back + SHEET_KNOTS - 1);
  const oBack = shoulder.x.sub(shoulder.z).toVar(), oFront = front0.x.sub(front0.z).toVar();
  const lip: N[] = one.map((d: N, k: number) => {
    if (k === 0 || k >= ROOT_DRAWN) return null;
    const sh = read(SHEET_READ.swell + k), fk = (k + 1) / (CURL_KNOTS + 1);
    const dh = d.x.sub(oBack.add(oFront.sub(oBack).mul(fk)));
    return mix(sh, vec3(d.x, d.y, dh), g).toVar();
  });
  // The root's criterion and its first estimate, forward of the edge's read (rootCriterion, rootBracket).
  const byU = smoothstep(ROOT_BY_U_PHASES[0], ROOT_BY_U_PHASES[1], phase).toVar();
  const ry = one[ROOT_DRAWN].y, ru = one[ROOT_DRAWN].x;
  const phi = (q: N): N => float(1.0).sub(byU).mul(ry.sub(q.y)).add(byU.mul(q.x.sub(ru)));
  const rFound = int(0).toVar(), ra = vec3(R[n - 1]).toVar(), rb = vec3(R[n - 1]).toVar();
  for (let k = 1; k < n; k++) {
    const hit = rFound.equal(int(0)).and(int(k).greaterThan(tIdx)).and(phi(R[k]).greaterThanEqual(0.0));
    ra.assign(select(hit, R[k - 1], ra)); rb.assign(select(hit, R[k], rb)); rFound.assign(select(hit, int(1), rFound));
  }
  const hasRoot = rFound.equal(int(1)).toVar();
  const h0 = max(select(hasRoot, ra.z.add(rb.z.sub(ra.z).mul(zeroAt(phi(ra), phi(rb)))), R[n - 1].z), topP.z.add(ROOT_MIN_AHEAD)).toVar();
  return { g, R, edge, ta, tb, hasTop, topP, one, lip, phi, ra, rb, hasRoot, h0 };
}

/** rootRefine on the GPU: the lerp in the half bracket (a, probe) or (probe, b) that holds the criterion's 0, at least `min0`. */
function refineNode(has: N, h0: N, a: N, b: N, probe: N, phi: (q: N) => N, min0: N): N {
  const left = phi(probe).greaterThanEqual(0.0);
  const qa: N = vec3(select(left, a, probe)), qb: N = vec3(select(left, probe, b));
  return select(has, max(qa.z.add(qb.z.sub(qa.z).mul(zeroAt(phi(qa), phi(qb)))), min0), h0);
}

/** The law's third-round homes (THIRD order), from the first two rounds: the crest's (its edge refined by the second round's
 * probe, from the first swell home by g), the root's (refined, the same), the face's three below it, the two joins. */
function oneThirdHomes(r1: ReturnType<typeof oneRound1>, read: (r: number) => N): N[] {
  const edgeProbe = vec3(read(SHEET_READ.own)).toVar(), rootProbe = vec3(read(SHEET_READ.own + ROOT_DRAWN)).toVar();
  const edgeHome = refineNode(r1.hasTop, r1.topP.z, r1.ta, r1.tb, edgeProbe, (q: N) => r1.edge.sub(q.y), float(-1e30)).toVar();
  const s0 = r1.R[1].z, hC = s0.add(edgeHome.sub(s0).mul(r1.g)).toVar();
  const hR = refineNode(r1.hasRoot, r1.h0, r1.ra, r1.rb, rootProbe, r1.phi, edgeHome.add(ROOT_MIN_AHEAD)).toVar();
  const f0 = read(SHEET_READ.front).z;
  const blended = (i: number, to: N): N => { const sh = read(SHEET_READ.swell + i).z; return sh.add(to.sub(sh).mul(r1.g)); };
  const hRb = blended(ROOT_DRAWN, hR).toVar();
  const face = [1, 2, 3].map((j) => blended(ROOT_DRAWN + j, hR.add(f0.sub(hR).mul(j / (CURL_KNOTS - ROOT_DRAWN)))));
  return [hC, hRb, ...face, hC.sub(ONE_JOIN_UNITS), hRb.add(ONE_JOIN_UNITS)];
}

/** The second round's homes under the law: the crest edge's probe, the lip's knots, the root's probe (the rest unread: 0). */
function oneSecondHomes(r1: ReturnType<typeof oneRound1>): N[] {
  return Array.from({ length: CURL_KNOTS }, (_, k) => (k === 0 ? r1.topP.z : k === ROOT_DRAWN ? r1.h0 : k < ROOT_DRAWN ? r1.lip[k].z : float(0.0)));
}

/** The home of second-round sheet read k (the curl's knot k at its own home; under the law oneSecondHomes). */
export function curlReadHomeNode(k: N, numbers: { phase: N; hollow: N; rho: N; surge?: N }, keys: N, read: (r: number) => N): N {
  const { knot, drawn, drawn0 } = drawnNode(numbers, keys);
  const old = pick(curlKnotsNode(numbers, drawn, drawn0, knot, read).map((p) => p.z), k);
  return select(oneSurfaceUniform.greaterThan(0.5), pick(oneSecondHomes(oneRound1(numbers, knot, drawn, drawn0, read)), k), old);
}

/** The home of third-round sheet read k (THIRD; under the law only, 0 off it). */
export function thirdReadHomeNode(k: N, numbers: { phase: N; hollow: N; rho: N; surge?: N }, keys: N, read: (r: number) => N): N {
  const { knot, drawn, drawn0 } = drawnNode(numbers, keys);
  return select(oneSurfaceUniform.greaterThan(0.5), pick(oneThirdHomes(oneRound1(numbers, knot, drawn, drawn0, read), read), k), float(0.0));
}

export function wombFrameNode(numbers: { A: N; phase: N; hollow: N; rho: N; surge?: N }, keys: N, knots: (k: N) => N, write: (j: N, v: N) => void, read: (r: number) => N): WombFrameNodes {
  const ph = clamp(numbers.phase, 0.0, 2.0).toVar();
  // (write(j, v): sample j's vec4 (a u, a y, home, w): wombSection.SectionSample; the vertex pass places it at w × the sheet
  // at the home + A × a.)
  const { knot, drawn, drawn0, life } = drawnNode(numbers, keys);
  // wombSection.sectionFrameKnots: the sheet at its ends, the curl from the sheet toward the drawing (the sheet read in
  // the passes before: SHEET_READ). A knot is a pair: vec3 (u, y, home) and vec2 (the sheet at its home).
  const sheetKnot = (r: number): { p: N; s: N } => { const v = vec3(read(r)).toVar(); return { p: v, s: v.xy }; };
  const back: { p: N; s: N }[] = [], front: { p: N; s: N }[] = [];
  for (let k = 0; k < SHEET_KNOTS; k++) { back.push(sheetKnot(SHEET_READ.back + k)); front.push(sheetKnot(SHEET_READ.front + k)); }
  const beyond = [0, 1, 2, 3].map((k) => sheetKnot(SHEET_READ.beyond + k));
  const curl = smoothstep(0.0, CURL_PHASE, numbers.phase).mul(numbers.rho).toVar();
  const oneOn = oneSurfaceUniform.greaterThan(0.5).toVar();
  // Under the law (wombSection.oneSurfaceKnots): the crest, the root and the face below it the third round's sheet points,
  // the lip the drawing on the crest with the second round's reads under it.
  const r1 = oneRound1(numbers, knot, drawn, drawn0, read);
  const third = (j: number): N => vec3(read(SHEET_READ.third + j)).toVar();
  const curlKnots = curlKnotsNode(numbers, drawn, drawn0, knot, read).map((p: N, k: number) => {
    const sOld = vec3(read(SHEET_READ.own + k)).xy.toVar();
    const pOne: N = k === 0 ? third(THIRD.crest) : k === ROOT_DRAWN ? third(THIRD.root) : k > ROOT_DRAWN ? third(THIRD.face + k - ROOT_DRAWN - 1) : r1.lip[k];
    const sOne: N = k === 0 || k >= ROOT_DRAWN ? pOne.xy : sOld;
    return { p: vec3(select(oneOn, pOne, p)).toVar(), s: vec2(select(oneOn, sOne, sOld)).toVar() };
  });
  const joinsOne = [third(THIRD.crestJoin), third(THIRD.rootJoin)].map((v) => ({ p: v, s: v.xy }));
  const all = [...back, ...curlKnots, ...front];

  // wombSection.sectionTangents: the parameters, and each knot's tangent (at the joins, the sheet's own slope).
  const step = (a: N, b: N): N => sqrt(max(length(b.xy.sub(a.xy)), 1e-6));
  const tk: N[] = [float(0.0)];
  for (let k = 1; k < all.length; k++) tk.push(tk[k - 1].add(step(all[k - 1].p, all[k].p)).toVar());
  const lastKnot = all.length - 1;
  all.forEach((q, k: number) => {
    let mp: N, ms: N;
    /** A join's tangent: along the sheet from `near` (behind: q − near; ahead: near − q), at the curl span's speed × `share`. */
    const join = (behind: boolean, near: { p: N; s: N }, share: number): [N, N] => {
      const o = all[behind ? k + 1 : k - 1];
      const dp = behind ? q.p.sub(near.p) : near.p.sub(q.p), ds = behind ? q.s.sub(near.s) : near.s.sub(q.s);
      const speed = length(o.p.xy.sub(q.p.xy)).div(abs(tk[behind ? k + 1 : k - 1].sub(tk[k]))).mul(share);
      const scale = speed.div(max(length(dp.xy), 1e-9));
      return [dp.mul(scale), ds.mul(scale)];
    };
    const crTan = (): [N, N] => {
      const a = k === 0 ? beyond[0] : all[k - 1], b = k === lastKnot ? beyond[3] : all[k + 1];
      const ta = k === 0 ? tk[k].sub(step(a.p, q.p)) : tk[k - 1], tb = k === lastKnot ? tk[k].add(step(q.p, b.p)) : tk[k + 1];
      const cr = (pa: N, pp: N, pb: N): N => pp.sub(pa).div(tk[k].sub(ta)).sub(pb.sub(pa).div(tb.sub(ta))).add(pb.sub(pp).div(tb.sub(tk[k])));
      return [cr(a.p, q.p, b.p), cr(a.s, q.s, b.s)];
    };
    // Off the law the joins are the shoulder and the front knot; under it the crest (the sheet behind it, at CREST_JOIN_SPEED)
    // and the root (the sheet ahead of it), and the shoulder and the front knot are plain sheet knots.
    const old: [N, N] = k === SHEET_ENDS[1] || k === SHEET_ENDS[2] ? join(k === SHEET_ENDS[1], beyond[k === SHEET_ENDS[1] ? 1 : 2], 1) : crTan();
    const one: [N, N] = k === SECTION_CREST ? join(true, joinsOne[0], CREST_JOIN_SPEED) : k === SECTION_ROOT ? join(false, joinsOne[1], 1) : crTan();
    if (k === SHEET_ENDS[1] || k === SHEET_ENDS[2] || k === SECTION_CREST || k === SECTION_ROOT) {
      mp = select(oneOn, one[0], old[0]); ms = select(oneOn, one[1], old[1]);
    } else {
      [mp, ms] = old;
    }
    knots(int(KNOT_VEC4S * k)).assign(vec4(q.p, tk[k]));
    knots(int(KNOT_VEC4S * k + 1)).assign(vec4(q.s, mp.xy));
    knots(int(KNOT_VEC4S * k + 2)).assign(vec4(mp.z, ms, 0.0));
  });

  /** wombProfile.hermitePoint over the section's knots: (u, y, home), the sheet weight w (wombSection.sampleWeight: 1 at the
   * sheet knots, 1 − the curl's weight at the curl knots, eased between over the join spans) and a = (u − w·su, y − w·sy)
   * (wombSection.SectionSample: the vertex pass places the sample at w × the sheet at its home + A × a). */
  // Under the law the crest and from the root on are the sheet's own too (wombSection.isSheetKnot), and the spans from the crest
  // into the lip and from the roof into its root take the curl's weight whole (sampleWeight).
  const isSheetKnot = (k: N): N => k.lessThan(int(SHEET_KNOTS)).or(k.greaterThanEqual(int(SHEET_KNOTS + CURL_KNOTS)))
    .or(oneOn.and(k.equal(int(SECTION_CREST)).or(k.greaterThanEqual(int(SECTION_ROOT)))));
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
      // Typed N: tsc's overload pick for select() here depends on the program's file order (it read never once the old Bombie
      // mound left the bathymetry's imports, shelf-polish Task 7).
      const wa: N = select(isSheetKnot(sp), float(1.0), curlW), wb: N = select(isSheetKnot(sp.add(1)), float(1.0), curlW);
      const whole = oneOn.and(sp.equal(int(SECTION_CREST)).or(sp.add(1).equal(int(SECTION_ROOT))));
      w.assign(select(whole, curlW, wa.add(wb.sub(wa).mul(smoothNode(s)))));
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

