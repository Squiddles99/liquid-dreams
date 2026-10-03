import * as THREE from 'three/webgpu';
import { If, Loop, abs, atan, clamp, cos, dot, exp, float, int, length, max, min, mix, pow, select, sin, smoothstep, sqrt, storage, uniform, vec2, vec4 } from 'three/tsl';
import { type BreakParams, RIBBON_FULL_OFFSET, TUBE_HOLD_S, TUBE_THROWN_PSI, normalizeBreakParams, steepeningStart } from './breaking';
import {
  TUBE_SHADE_SOFT_RAD, BACK_EDGE_H, BACK_OFF_DROP_H, EDGE_LOWER_FADE, EDGE_MARGIN_M, LIP_EMERGE_PROGRESS, FACE_JOIN_MIN_M, FACE_JOIN_STEPS, HOLLOW_FLOOR_SOFT, LIP_JET_SHARE,
  CEILING_START_XI, FOOT_WIDTHS, TUBE_OPEN_POWER, HOLLOW_BACK_H, HOLLOW_EPS, HOLLOW_FOOT_DIP, HOLLOW_MIN_WEIGHT, HOLLOW_SETTLE, HOLLOW_THROAT, GRAVITY_MS2, HAND_BACK_S, HOME_SETTLE, IMPACT_BISECT, IMPACT_SCAN, SHEET_WARM_STEPS, LANDING_FOAM_RISE, LAND_CLEARANCE_M, CLIMB_SOFT, LIP_STREAK, LIP_TIP_BAND, LIP_TOP_BAND,
  LIP_SPRAY_PROGRESS, LIP_TAPER_POWER, OUTER_LIP_SHARE, PRESENCE_FADE, PROFILE_SAMPLES, PROFILE_SEGMENTS, type ProfileFrame, type ProfileSegment, SEGMENT_ID,
  TIP_GROW_PROGRESS, TIP_THICKNESS_RATIO, TUBE_BACK_AHEAD_H, sampleSegment,
} from './lipProfile';
import { LH82_K, PSI_MIN, PSI_NONE } from './overturn';
import { overturnShapeNode, sheetShapeNode, windUCNode } from './overturnNodes';
import { TUBE_ARC_STEPS, TUBE_SEARCH_STEPS, TUBE_XI_EPS } from './tube';

type N = any;

/**
 * The TSL mirror of lipProfile.ts and tube.ts, term by term: the station's frame (profileFrame, impactHeight, sheetYAt,
 * pileLift) and each sample's point (sampleHome, constructed, riding, sampleTarget, profilePoint, lipThicknessAt), with
 * the same constants and fixed iteration counts. lipProfile.ts stays the source of truth; lipProfileNodes.test.ts checks
 * the tables below on the CPU and ribbon.selftest.ts checks the GPU against buildProfile.
 *
 * The segment logic is data, not branches on j: per sample, a table gives its segment id, its position s within the
 * segment, and three coefficients with home = a·uFoot + b·uFront + c·uBack (sampleHome depends on the frame through
 * those three lengths only).
 */

// ---------------------------------------------------------------------------------------------------------------
// The sample tables (CPU; uploaded once as a storage buffer)
// ---------------------------------------------------------------------------------------------------------------

/** sampleHome's weights on (uFoot, uFront, uBack) for a sample at position s in segment seg. */
function homeCoeffs(seg: ProfileSegment, s: number): [number, number, number] {
  switch (seg) {
    case 'front': return [s, 1 - s, 0];
    case 'face': return [1 - 0.25 * s, 0, 0];
    case 'wall': return [0.75 - 0.15 * s, 0, 0];
    case 'under': return [0.6 - 0.01 * s, 0, 0];
    case 'cap': return [0.59 - 0.005 * s, 0, 0];
    case 'outer': return [0.585 * (1 - s), 0, 0];
    default: return [0, 0, s];
  }
}

/** Per sample j: SEGMENT_ID of its segment. */
export const SEGMENT_OF_SAMPLE = new Uint8Array(PROFILE_SAMPLES);
/** Per sample j: its position s within its segment (sampleSegment's s). Float64 so the CPU check is exact; the GPU gets f32. */
export const SAMPLE_S = new Float64Array(PROFILE_SAMPLES);
/** Per sample j: (a, b, c) at [3j, 3j + 1, 3j + 2], with home = a·uFoot + b·uFront + c·uBack. */
export const HOME_COEFFS = new Float64Array(3 * PROFILE_SAMPLES);
for (let j = 0; j < PROFILE_SAMPLES; j++) {
  const { seg, s } = sampleSegment(j);
  SEGMENT_OF_SAMPLE[j] = SEGMENT_ID[seg];
  SAMPLE_S[j] = s;
  HOME_COEFFS.set(homeCoeffs(seg, s), 3 * j);
}

/** sampleHome from the table (CPU): what the GPU computes, in f64. */
export function homeFromTable(j: number, f: Pick<ProfileFrame, 'uFoot' | 'uFront' | 'uBack'>): number {
  return HOME_COEFFS[3 * j] * f.uFoot + HOME_COEFFS[3 * j + 1] * f.uFront + HOME_COEFFS[3 * j + 2] * f.uBack;
}

/** The tables packed for the GPU: per sample, vec4(a, b, c, s) then vec4(segment id, 0, 0, 0). */
export function sampleTableData(): Float32Array {
  const d = new Float32Array(8 * PROFILE_SAMPLES);
  for (let j = 0; j < PROFILE_SAMPLES; j++) {
    d.set([HOME_COEFFS[3 * j], HOME_COEFFS[3 * j + 1], HOME_COEFFS[3 * j + 2], SAMPLE_S[j], SEGMENT_OF_SAMPLE[j], 0, 0, 0], 8 * j);
  }
  return d;
}

let tableNode: N = null;
/** The tables on the GPU (one read-only storage buffer, built on first use and shared by every pass). */
function sampleTable(): N {
  return (tableNode ??= storage(new THREE.StorageBufferAttribute(sampleTableData(), 4), 'vec4', 2 * PROFILE_SAMPLES).toReadOnly());
}

// ---------------------------------------------------------------------------------------------------------------
// Uniforms and the station's input
// ---------------------------------------------------------------------------------------------------------------

/** One uniform per BreakParams number the profile reads, plus the steepening's start (breaking.steepeningStart). */
export function createLipUniforms(p: BreakParams) {
  const u = { collapseTime: uniform(1), ribbonOnset: uniform(0), faceWidth: uniform(1), steepFrom: uniform(0), delta: uniform(0) };
  updateLipUniforms(u, p);
  return u;
}
export type LipUniforms = ReturnType<typeof createLipUniforms>;

/** Uploads a normalized copy of `params` (the caller's object is left alone). The trough drain is each crest's own (its ψ). */
export function updateLipUniforms(u: LipUniforms, params: BreakParams): void {
  const p = { ...params };
  normalizeBreakParams(p);
  u.collapseTime.value = p.collapseTime;
  u.ribbonOnset.value = p.ribbonOnset;
  u.faceWidth.value = p.faceWidth;
  u.steepFrom.value = steepeningStart(p);
  u.delta.value = p.delta;
}

/** The time since onset as the GPU stores it: TB_NULL before breaking, TB_INFINITY past the hand-back. */
export const TB_NULL = -1;
export const TB_INFINITY = 1e9;
/**
 * Encodes ProfileInput.tb for the GPU. A negative tb is stored as 0 (profileFrame clamps t to ≥ 0, and every other use
 * of tb gives the same result at 0 as below it). TB_INFINITY goes through the same formulas as Infinity does on the CPU
 * (min(tb, τ_land) = τ_land; every smoothstep of it is 1), so the frame needs no special case for it.
 */
export function encodeTb(tb: number | null): number {
  if (tb === null) return TB_NULL;
  return Number.isFinite(tb) ? Math.max(tb, 0) : TB_INFINITY;
}

/** ProfileInput as nodes; tb encoded (encodeTb): < 0 means null. */
/** lipH: the throw height (m; ≤ 0: none, the CPU's null). */
export interface ProfileInputNodes { H: N; c: N; r: N; tb: N; psi: N; offshoreMs: N; lipH: N }

/** The tube (tube.Tube) as nodes: n is (−d.y, d.x). */
export interface TubeNodes { O: N; d: N; n: N; L: N; W: N; clipY: N }

/** One pile-lift knot (lipProfile.PileLift at one of pileLiftKnots' u): vec4(u, x on the frame's sheet, dx, dy). */
export const PILE_KNOTS = 7;

/** ProfileFrame as nodes (vec2 for the points, float for the rest), and the pile's knots. */
export interface ProfileFrameNodes {
  K: N; F: N; tF: N; P: N; tip: N; tube: TubeNodes;
  xiTop: N; xiTip: N; xiEnd: N; tTop: N; tipE: N; uFoot: N; uFront: N; uBack: N;
  tauLand: N; prog: N; weight: N; collapse: N; landing: N; rho: N; vj: N; reach: N; uLand: N; HI: N; crestLift: N; floorY: N; curlTurn: N;
  /** PILE_KNOTS vec4(u, x, dx, dy), in pileLiftKnots' order (monotone in u, and so in x along the ray). */
  knots: N[];
}

/** A station's frame is stored as this many vec4s (packFrameNodes, FRAME_LAYOUT order); the samples read all of them. */
export const FRAME_VEC4S = 17;
export const FRAME_PROFILE_VEC4S = FRAME_VEC4S;
/** The packed frame's components in order (4 per vec4). */
export const FRAME_LAYOUT = [
  'K.x', 'K.y', 'F.x', 'F.y', 'tF.x', 'tF.y', 'P.x', 'P.y', 'tip.x', 'tip.y', 'O.x', 'O.y', 'd.x', 'd.y', 'L', 'W',
  'clipY', 'xiTop', 'xiTip', 'xiEnd', 'tTop', 'tipE', 'uFoot', 'uFront', 'uBack', 'tauLand', 'prog', 'weight',
  'collapse', 'landing', 'rho', 'vj', 'reach', 'uLand', 'HI', 'crestLift', 'floorY', 'curlTurn', 'pad1', 'pad2',
  ...Array.from({ length: PILE_KNOTS }, (_, k) => [`k${k}.u`, `k${k}.x`, `k${k}.dx`, `k${k}.dy`]).flat(),
] as const;

/** The CPU frame in FRAME_LAYOUT order (for comparing with the GPU's): the pile's knots from f.lift, zeros if absent. */
export function packFrameCpu(f: ProfileFrame): number[] {
  const knots: number[] = [];
  for (let k = 0; k < PILE_KNOTS; k++) knots.push(...(f.lift ? [f.lift.u[k], f.lift.x[k], f.lift.dx[k], f.lift.dy[k]] : [0, 0, 0, 0]));
  return [
    f.K[0], f.K[1], f.F[0], f.F[1], f.tF[0], f.tF[1], f.P[0], f.P[1], f.tip[0], f.tip[1], f.tube.O[0], f.tube.O[1],
    f.tube.d[0], f.tube.d[1], f.tube.L, f.tube.W, f.tube.clipY, f.xiTop, f.xiTip, f.xiEnd, f.tTop, f.tipE, f.uFoot, f.uFront,
    f.uBack, f.tauLand, f.prog, f.weight, f.collapse, f.landing, f.rho, f.vj, f.reach, f.uLand, f.HI, f.crestLift, f.floorY, f.curlTurn, 0, 0,
    ...knots,
  ];
}

/** The frame as its first 10 vec4s (FRAME_LAYOUT order); the knots, vec4s 10 to 16, are stored by profileFrameNode's storeKnot. */
export function packFrameNodes(f: ProfileFrameNodes): N[] {
  return [
    vec4(f.K, f.F), vec4(f.tF, f.P), vec4(f.tip, f.tube.O), vec4(f.tube.d, f.tube.L, f.tube.W),
    vec4(f.tube.clipY, f.xiTop, f.xiTip, f.xiEnd), vec4(f.tTop, f.tipE, f.uFoot, f.uFront), vec4(f.uBack, f.tauLand, f.prog, f.weight),
    vec4(f.collapse, f.landing, f.rho, f.vj), vec4(f.reach, f.uLand, f.HI, f.crestLift), vec4(f.floorY, f.curlTurn, 0.0, 0.0),
  ];
}
/** The index of the first knot's vec4 in a stored frame. */
export const FRAME_KNOT_VEC4 = 10;

/**
 * The stored frame read into FRAME_VEC4S vars, each declared and assigned here, at the top of the pass. A `.toVar()` of
 * the storage read is initialised where TSL first uses it: for the tube's fields that was inside one branch of the
 * samples' segment If chain, and every other branch read them as 0 (the tube at the origin). The tube's n, derived
 * from d, is a var assigned here too: as a shared expression TSL declared it where first built (inside the wall branch)
 * and every other branch read it as (0, 0). Inside an Fn.
 */
export function readFrameNodes(read: (k: number) => N): ProfileFrameNodes {
  const v = Array.from({ length: FRAME_VEC4S }, () => vec4(0.0).toVar());
  v.forEach((x, k) => { x.assign(read(k)); });
  const n = vec2(0.0).toVar();
  n.assign(vec2(v[3].y.negate(), v[3].x));
  return unpackFrameNodes(v, n);
}

/** The frame back from its FRAME_VEC4S vec4s and the tube's n (pass vars: every field is a swizzle of them). */
function unpackFrameNodes(v: readonly N[], n: N): ProfileFrameNodes {
  return {
    K: v[0].xy, F: v[0].zw, tF: v[1].xy, P: v[1].zw, tip: v[2].xy,
    tube: { O: v[2].zw, d: v[3].xy, n, L: v[3].z, W: v[3].w, clipY: v[4].x },
    xiTop: v[4].y, xiTip: v[4].z, xiEnd: v[4].w, tTop: v[5].x, tipE: v[5].y, uFoot: v[5].z, uFront: v[5].w,
    uBack: v[6].x, tauLand: v[6].y, prog: v[6].z, weight: v[6].w, collapse: v[7].x, landing: v[7].y, rho: v[7].z, vj: v[7].w,
    reach: v[8].x, uLand: v[8].y, HI: v[8].z, crestLift: v[8].w, floorY: v[9].x, curlTurn: v[9].y,
    knots: v.slice(FRAME_KNOT_VEC4, FRAME_KNOT_VEC4 + PILE_KNOTS),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The tube (tube.ts)
// ---------------------------------------------------------------------------------------------------------------

/** No clip: the lower side free (tube.ts's clipY −Infinity). */
const NO_CLIP = -1e9;

/** tube.tubeAxes: d down and forward, n up and forward. */
export function tubeAxesNode(theta: N): { d: N; n: N } {
  const c = cos(theta), s = sin(theta);
  return { d: vec2(c, s.negate()), n: vec2(s, c) };
}
export function tubeHalfNode(t: TubeNodes, xi: N): N {
  const x = clamp(float(xi), 0.0, 1.0);
  return t.W.mul(LH82_K).mul(sqrt(x)).mul(float(1.0).sub(x));
}
export function tubeAxisNode(t: TubeNodes, xi: N): N {
  return t.O.add(t.d.mul(float(xi).mul(t.L)));
}
export function tubeUpperNode(t: TubeNodes, xi: N): N {
  return tubeAxisNode(t, xi).add(t.n.mul(tubeHalfNode(t, xi)));
}
export function tubeLowerNode(t: TubeNodes, xi: N): N {
  const p = tubeAxisNode(t, xi).sub(t.n.mul(tubeHalfNode(t, xi)));
  return vec2(p.x, max(p.y, t.clipY));
}
/** The upper side's unit normal at ξ, pointing out of the tube. */
export function tubeUpperNormalNode(t: TubeNodes, xi: N): N {
  const x = clamp(float(xi), TUBE_XI_EPS, 1.0);
  const sx = sqrt(x);
  const dh = t.W.mul(LH82_K).mul(float(1.0).sub(x).div(sx.mul(2.0)).sub(sx));
  const T = t.d.mul(t.L).add(t.n.mul(dh)).toVar();
  const l = length(T);
  const lSafe = select(l.greaterThan(0.0), l, float(1.0));
  const nr = vec2(T.y.negate(), T.x).div(lSafe).toVar();
  // A tube of no size: the tube's own n (tube.tubeUpperNormal).
  return select(l.greaterThan(0.0), select(dot(nr, t.n).lessThan(0.0), nr.negate(), nr), vec2(t.n));
}
/** tube's ternary search for the maximum of a unimodal f on [a, b], TUBE_SEARCH_STEPS steps. */
function argmaxNode(f: (x: N) => N, a: number, b: number): N {
  const lo = float(a).toVar(), hi = float(b).toVar();
  for (let i = 0; i < TUBE_SEARCH_STEPS; i++) {
    const m1 = lo.add(hi.sub(lo).div(3.0)).toVar(), m2 = hi.sub(hi.sub(lo).div(3.0)).toVar();
    const up = f(m1).lessThan(f(m2));
    lo.assign(select(up, m1, lo));
    hi.assign(select(up, hi, m2));
  }
  return lo.add(hi).mul(0.5);
}
export function tubeTopXiNode(t: TubeNodes): N {
  return argmaxNode((xi) => tubeUpperNode(t, xi).y, 0, 1).toVar();
}
export function tubeBackMostXNode(t: TubeNodes): N {
  const free: TubeNodes = { ...t, clipY: float(NO_CLIP) };
  const xi = argmaxNode((x) => tubeLowerNode(free, x).x.negate(), 0, 1);
  return min(t.O.x, tubeLowerNode(free, xi).x).toVar();
}
/** The upper side's arc length from ξ = a to b (TUBE_ARC_STEPS chords). */
export function tubeUpperArcNode(t: TubeNodes, a: N, b: N): N {
  const s = float(0.0).toVar(), prev = vec2(tubeUpperNode(t, a)).toVar();
  for (let i = 1; i <= TUBE_ARC_STEPS; i++) {
    const q = vec2(tubeUpperNode(t, float(a).add(float(b).sub(a).mul(i / TUBE_ARC_STEPS)))).toVar();
    s.addAssign(length(q.sub(prev)));
    prev.assign(q);
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// The frame (profileFrame, impactHeight, sheetYAt, pileLift)
// ---------------------------------------------------------------------------------------------------------------

/** lipProfile's norm2: v / |v|, or (0, 1) for |v| ≤ 1e-9. */
const norm2 = (v: N): N => {
  const l = length(v);
  return select(l.greaterThan(1e-9), v.div(max(l, 1e-30)), vec2(0.0, 1.0));
};
/** landingTime: √(2·max(drop, 0.05)/g). */
const landingTimeNode = (drop: N): N => sqrt(max(drop, 0.05).mul(2 / GRAVITY_MS2));
/** The angle going back (toward −x), up positive: atan2(v.y, −v.x). */
const angBack = (v: N): N => atan(v.y, v.x.negate());

/** lipProfile.sheetYAt: the frame sheet's height at x, u from x − K.x then four steps of u += x − base(u).x. Inside an Fn. */
function sheetYAtNode(baseAt: (u: N) => N, K: N, x: N): N {
  const xx = float(x).toVar();
  const u = xx.sub(K.x).toVar(), q = vec2(0.0).toVar();
  Loop(5, ({ i }: N) => {
    q.assign(baseAt(u));
    If(i.lessThan(int(4)), () => { u.addAssign(xx.sub(q.x)); });
  });
  return q.y;
}

/** The unit tube's pieces impactHeight needs (overturnShape at H = 1): its point relative to the placement anchor. */
function unitReachNode(psi: N, uc: N): { px: N; py: N } {
  const unit = overturnShapeNode(psi, 1.0, uc), ax = tubeAxesNode(unit.theta);
  const t1: TubeNodes = { O: vec2(0.0), d: ax.d, n: ax.n, L: unit.L, W: unit.W, clipY: float(NO_CLIP) };
  const xiTop = tubeTopXiNode(t1), top1 = vec2(tubeUpperNode(t1, xiTop)).toVar(), pt1 = vec2(tubeUpperNode(t1, 1.0)).toVar();
  const tTop1 = unit.AJ.mul(LIP_JET_SHARE * (1 + LIP_TAPER_POWER)).div(max(tubeUpperArcNode(t1, xiTop, float(1.0)), 1e-9));
  return { px: pt1.x.sub(tubeBackMostXNode(t1)).toVar(), py: pt1.y.sub(top1.y).sub(tTop1).toVar() };
}

/**
 * lipProfile.impactHeight on the GPU: the scan over IMPACT_SCAN × H and the bisections in one loop (one sheet read per
 * iteration: the scan's first IMPACT_SCAN.length iterations, then IMPACT_BISECT bisections once a crossing is found).
 */
function impactHeightNode(baseAt: (u: N) => N, K: N, H: N, psi: N, uc: N): N {
  const { px, py } = unitReachNode(psi, uc);
  const x0 = K.x.add(H.mul(TUBE_BACK_AHEAD_H)).toVar();
  // lipProfile.impactHeight's warm-started sheet reads: the first cold (four steps), the rest SHEET_WARM_STEPS from the
  // last read's u.
  const wu = float(0.0).toVar(), wx = float(0.0).toVar(), warm = float(0.0).toVar();
  const yAt = (x: N): N => {
    const xx = float(x).toVar();
    const uu = select(warm.greaterThan(0.5), wu.add(xx.sub(wx)), xx.sub(K.x)).toVar(), q = vec2(0.0).toVar();
    const steps = select(warm.greaterThan(0.5), int(SHEET_WARM_STEPS), int(4)).toVar();
    Loop(5, ({ i }: N) => {
      If(i.lessThanEqual(steps), () => {
        q.assign(baseAt(uu));
        If(i.lessThan(steps), () => { uu.addAssign(xx.sub(q.x)); });
      });
    });
    wu.assign(uu); wx.assign(xx); warm.assign(1.0);
    return q.y;
  };
  const above = (hi: N): N => K.y.add(hi.mul(py)).sub(yAt(x0.add(hi.mul(px))));
  const nScan = IMPACT_SCAN.length;
  const lo = float(-1.0).toVar(), hi = float(-1.0).toVar(), prev = float(0.0).toVar(), prevAt = float(0.0).toVar();
  // under: the point is under the water at the sheet's H, so H, and the scan stops (lipProfile.impactHeight).
  const found = float(0.0).toVar(), under = float(0.0).toVar();
  Loop(nScan + IMPACT_BISECT, ({ i }: N) => {
    const scanning = i.lessThan(int(nScan));
    // The scan's factor at step i (IMPACT_SCAN is evenly spaced from 1 to 2: 1 + i/4), or the bisection's midpoint.
    const at = select(scanning, H.mul(float(i).mul((IMPACT_SCAN[nScan - 1] - IMPACT_SCAN[0]) / (nScan - 1)).add(IMPACT_SCAN[0])), lo.add(hi).mul(0.5)).toVar();
    // As the CPU: the scan stops at its crossing, and the bisection reads only once one is found.
    If(scanning.and(found.lessThan(0.5)).and(under.lessThan(0.5)).or(scanning.not().and(found.greaterThan(0.5))), () => {
      const g = above(at).toVar();
      If(scanning, () => {
        If(i.greaterThan(int(0)).and(found.lessThan(0.5)).and(prev.greaterThan(0.0)).and(g.lessThanEqual(0.0)), () => {
          lo.assign(prevAt); hi.assign(at); found.assign(1.0);
        });
        If(i.equal(int(0)).and(g.lessThanEqual(0.0)), () => { under.assign(1.0); });
        prev.assign(g); prevAt.assign(at);
      }).Else(() => {
        If(g.greaterThan(0.0), () => { lo.assign(at); }).Else(() => { hi.assign(at); });
      });
    });
  });
  return select(found.greaterThan(0.5).and(H.greaterThan(0.0)), lo.add(hi).mul(0.5), H);
}

/** lipProfile's curlTurn: the angle the fading-in curl turns about the round end to carry on from the blended back wall. */
function curlTurnNode(f: ProfileFrameNodes, baseAt: (u: N) => N): N {
  const iW = PROFILE_SEGMENTS.front + PROFILE_SEGMENTS.face + PROFILE_SEGMENTS.wall - 1, iU = iW + 1;
  const keep = float(1.0).sub(f.collapse).toVar();
  const w = select(keep.greaterThan(1e-6), f.weight.div(max(keep, 1e-6)), float(1.0)).toVar();
  const cW = vec2(hollowCurveNode(f, float(1.0).greaterThan(0.5), float(SAMPLE_S[iW]))).toVar();
  const R = vec2(tubeUpperNode(f.tube, 0.0)).toVar(), cU = vec2(tubeUpperNode(f.tube, f.xiTip.div(PROFILE_SEGMENTS.under))).toVar();
  const hW = vec2(baseAt(f.uFoot.mul(HOME_COEFFS[3 * iW]))).toVar(), hU = vec2(baseAt(f.uFoot.mul(HOME_COEFFS[3 * iU]))).toVar();
  const Wb = mix(hW, cW, w), Jb = mix(hU, R, w);
  const wrap = (a: N): N => atan(sin(a), cos(a));
  const aW = atan(R.y.sub(cW.y), R.x.sub(cW.x)).toVar();
  const bend = select(length(cU.sub(R)).greaterThan(1e-9), wrap(atan(cU.y.sub(R.y), cU.x.sub(R.x)).sub(aW)), float(0.0));
  const turn = wrap(atan(Jb.y.sub(Wb.y), Jb.x.sub(Wb.x)).sub(aW).sub(float(1.0).sub(w).mul(bend))).mul(keep);
  const valid = w.greaterThan(0.0).and(w.lessThan(1.0)).and(length(R.sub(cW)).greaterThan(1e-6));
  return select(valid, turn, float(0.0));
}

/** A curl point turned about the tube's round end by curlTurn × share (lipProfile's turned). */
function turnedNode(f: ProfileFrameNodes, p: N, share: N | number = 1): N {
  const a = f.curlTurn.mul(share).toVar(), R = vec2(tubeUpperNode(f.tube, 0.0)).toVar(), d = vec2(p).sub(R).toVar();
  return R.add(vec2(d.x.mul(cos(a)).sub(d.y.mul(sin(a))), d.x.mul(sin(a)).add(d.y.mul(cos(a)))));
}

/**
 * profileFrame on the GPU (lipProfile.profileFrame, term by term), with pileLift's knots: `baseAt(u)` is the frame's sheet
 * (without the pile) and `pileAt(u)` the sheet with it, each the displaced vec2(x, y) at undisplaced u; `storeKnot(k, v)`
 * stores knot k (an int node) as vec4(u, x, dx, dy). Must be called inside an Fn.
 */
export function profileFrameNode(baseAt: (u: N) => N, pileAt: (u: N) => N, input: ProfileInputNodes, u: LipUniforms, storeKnot: (k: N, v: N) => void): ProfileFrameNodes {
  const H = float(input.H).toVar(), c = float(input.c).toVar(), r = float(input.r).toVar(), tb = float(input.tb).toVar();
  const psi = float(input.psi).toVar(), uc = windUCNode(input.offshoreMs, c).toVar();
  // The curl collapses on its own crest's drain clock (overturn.withSheetShape at its ψ).
  const drainGrowth = sheetShapeNode(psi).troughDrain.mul(u.delta).add(1.0).toVar();
  const uFootWave = float(FOOT_WIDTHS).mul(u.faceWidth).mul(H).toVar();
  const K = vec2(baseAt(float(0.0))).toVar();
  const F0 = vec2(baseAt(uFootWave)).toVar();
  // lipProfile: the tube hangs from the crest the lip was thrown from (K × lipH / H), sized × the throw height.
  const lipH = select(float(input.lipH).greaterThan(0.0), float(input.lipH), H).toVar();
  const crestLift = max(K.y, 0.0).mul(max(lipH.div(max(H, 1e-6)).sub(1.0), 0.0)).toVar();
  const Kt = vec2(K.x, K.y.add(crestLift)).toVar();
  const HI = impactHeightNode(baseAt, Kt, max(H, lipH), psi, uc).mul(smoothstep(PSI_NONE, PSI_MIN, psi)).toVar();
  const shape = overturnShapeNode(psi, HI, uc);
  const ax = tubeAxesNode(shape.theta);
  const d = vec2(ax.d).toVar(), n = vec2(ax.n).toVar();
  const at0: TubeNodes = { O: vec2(0.0), d, n, L: shape.L, W: shape.W, clipY: float(NO_CLIP) };
  const xiTop = tubeTopXiNode(at0), top0 = vec2(tubeUpperNode(at0, xiTop)).toVar();
  const tTop = shape.AJ.mul(LIP_JET_SHARE * (1 + LIP_TAPER_POWER)).div(max(tubeUpperArcNode(at0, xiTop, float(1.0)), 1e-3)).toVar();
  const O0 = vec2(Kt.x.add(H.mul(TUBE_BACK_AHEAD_H)).sub(tubeBackMostXNode(at0)), Kt.y.sub(tTop).sub(top0.y)).toVar();
  const point0 = vec2(tubeUpperNode({ ...at0, O: O0 }, 1.0)).toVar();
  const under = sheetYAtNode(baseAt, K, point0.x).toVar();
  const drop = max(point0.y.sub(under), 0.0).toVar();
  const full: TubeNodes = { ...at0, O: vec2(O0.x, O0.y.sub(drop)).toVar() };
  const xiEnd = float(1.0);
  const P = vec2(tubeUpperNode(full, xiEnd)).toVar();
  const tauLand = landingTimeNode(Kt.y.sub(P.y)).toVar();
  // The face's join: the wave's foot, or FACE_JOIN_MIN_M past a landing beyond it, in the sheet's displaced x.
  const uFoot = float(uFootWave).toVar(), F = vec2(F0).toVar();
  If(P.x.greaterThan(F0.x.sub(FACE_JOIN_MIN_M)), () => {
    const x = P.x.add(FACE_JOIN_MIN_M).toVar();
    uFoot.addAssign(x.sub(F0.x));
    Loop(FACE_JOIN_STEPS + 1, ({ i }: N) => {
      F.assign(baseAt(uFoot));
      If(i.lessThan(int(FACE_JOIN_STEPS)), () => { uFoot.addAssign(x.sub(F.x)); });
    });
  });
  // The face leaves along the sheet there (lipProfile.profileFrame: the join no longer steps out toward the trough).
  const Fb = vec2(baseAt(uFoot.sub(0.1))).toVar();
  const tF = norm2(Fb.sub(F)).toVar();
  const pre = tb.lessThan(0.0);
  const t = select(pre, float(0.0), min(max(tb, 0.0), tauLand)).toVar();
  const prog = t.div(tauLand).toVar();
  // lipProfile's growing curl: the tube at impact scaled by the throw about an origin sliding from the crest to its place.
  // lipProfile: it opens out as it is thrown, scaled by 1 − (1 − prog)^TUBE_OPEN_POWER.
  const g = float(1.0).sub(pow(max(float(1.0).sub(prog), 1e-6), TUBE_OPEN_POWER)).toVar(); // pow(0, y) is not finite on every GPU
  const tube: TubeNodes = { O: vec2(mix(Kt, full.O, g) as N).toVar(), d, n, L: shape.L.mul(g).toVar(), W: shape.W.mul(g).toVar(), clipY: P.y };
  const Pnow = vec2(tubeUpperNode(tube, xiEnd)).toVar();
  const xiTip = prog.mul(xiEnd).toVar();
  const tip = vec2(tubeUpperNode(tube, xiTip)).toVar();
  // The back-off edges scale with H: floored so a zero-height row (never drawn) can't give smoothstep equal edges.
  const Hs = max(H, 1e-6);
  // lipProfile: the water before the break; from it, the curl peels out over LIP_EMERGE_PROGRESS of the throw.
  const steep: N = select(pre, float(0.0),
    smoothstep(Hs.mul(BACK_OFF_DROP_H[0]), Hs.mul(BACK_OFF_DROP_H[1]), K.y.sub(F0.y)).mul(smoothstep(0.0, LIP_EMERGE_PROGRESS, prog)));
  // breaking.landingEstimate and settleSpan on the crest's drain.
  const landEstimate = max(H.mul(drainGrowth), 0.05).mul(2 / GRAVITY_MS2).sqrt().toVar();
  const span = u.collapseTime.mul(landEstimate).toVar();
  // ...and once landed a thrown tube stays open TUBE_HOLD_S × how thrown (lipProfile, breaking.lifecycle).
  const settleFrom = max(tauLand, landEstimate).add(smoothstep(TUBE_THROWN_PSI[0], TUBE_THROWN_PSI[1], psi).mul(TUBE_HOLD_S)).toVar();
  const collapse: N = select(pre, float(0.0), smoothstep(settleFrom, settleFrom.add(span), tb)).toVar();
  const present: N = smoothstep(PSI_NONE, PSI_NONE + PRESENCE_FADE * (PSI_MIN - PSI_NONE), psi).toVar();
  const landing = select(pre, float(0.0), smoothstep(tauLand, tauLand.add(span.mul(LANDING_FOAM_RISE)), tb)).mul(present).toVar();
  const end = settleFrom.add(span);
  const rho = select(pre, smoothstep(u.ribbonOnset, u.ribbonOnset.add(RIBBON_FULL_OFFSET), r), float(1.0).sub(smoothstep(end, end.add(HAND_BACK_S), tb))).toVar();
  const uFront = uFoot.add(LAND_CLEARANCE_M + EDGE_MARGIN_M).toVar();
  const uBack = H.mul(BACK_EDGE_H).add(EDGE_MARGIN_M).negate().toVar();
  const drop2 = tTop.add(drop).mul(g).toVar();
  const f: ProfileFrameNodes = {
    K, F, tF, P: Pnow, tip, tube, xiTop, xiTip, xiEnd, tTop: drop2,
    tipE: drop2.mul(TIP_THICKNESS_RATIO).mul(float(1.0).sub(prog)).mul(smoothstep(0.0, TIP_GROW_PROGRESS, prog)),
    uFoot, uFront, uBack, tauLand, prog, weight: steep.mul(float(1.0).sub(collapse)).mul(present), collapse, landing, rho,
    vj: P.x.sub(K.x).div(tauLand), reach: tip.x.sub(K.x), uLand: uFoot, HI, crestLift, floorY: min(P.y, min(F.y, F0.y)).toVar(), curlTurn: float(0.0), knots: [],
  };
  f.curlTurn = curlTurnNode(f, baseAt).toVar();
  // pileLift at pileLiftKnots' u: behind the crest, the crest, half way to the foot, the foot (twice: uLand is the
  // foot), half way to the front edge, the front edge.
  Loop(PILE_KNOTS, ({ i }: N) => {
    const ku = select(i.equal(int(0)), uBack, select(i.equal(int(1)), float(0.0), select(i.equal(int(2)), uFoot.mul(0.5),
      select(i.lessThan(int(5)), uFoot, select(i.equal(int(5)), uFoot.add(uFront).mul(0.5), uFront))))).toVar();
    const a = vec2(pileAt(ku)).toVar(), b = vec2(baseAt(ku)).toVar();
    storeKnot(i, vec4(ku, b.x, a.x.sub(b.x), a.y.sub(b.y)));
  });
  return f;
}

// ---------------------------------------------------------------------------------------------------------------
// The samples (sampleSegment, sampleHome, constructed, riding, sampleTarget, profilePoint)
// ---------------------------------------------------------------------------------------------------------------

/**
 * A new var of `zero`'s type, assigned `v` here. An expression node shared by several branches of an If chain is
 * declared by TSL where it is first built, inside one branch, and the other branches read it as 0: anything the
 * segment branches share goes through a var assigned before them.
 */
function fresh(zero: N, v: N): N {
  const x = zero.toVar();
  x.assign(v);
  return x;
}

/** Sample j's table row: its segment id (float), its s, and its home coefficients vec3(a, b, c). Inside an Fn. */
export function sampleSegmentNode(j: N): { seg: N; s: N; coeffs: N } {
  const t = sampleTable();
  const row = t.element(j.mul(2)).toVar();
  const seg = t.element(j.mul(2).add(1)).x.toVar();
  return { seg, s: row.w, coeffs: row.xyz };
}

/** sampleHome: a·uFoot + b·uFront + c·uBack from the table. Inside an Fn. */
export function sampleHomeNode(j: N, f: ProfileFrameNodes): N {
  const { coeffs } = sampleSegmentNode(j);
  return coeffs.x.mul(f.uFoot).add(coeffs.y.mul(f.uFront)).add(coeffs.z.mul(f.uBack));
}

/** lipProfile.lipThicknessAt. */
export function lipThicknessNode(f: ProfileFrameNodes, xi: N): N {
  const u = min(float(xi).sub(f.xiTop).div(max(f.xiTip.sub(f.xiTop), 1e-9)), 1.0);
  const tapered = f.tipE.add(f.tTop.sub(f.tipE).mul(pow(max(float(1.0).sub(u), 0.0), LIP_TAPER_POWER)));
  return select(f.xiTip.lessThanEqual(f.xiTop), f.tipE, select(float(xi).lessThanEqual(f.xiTop), f.tTop, tapered));
}

/**
 * lipProfile.hollowCurve: the face and the tube's back as one hollow curve (Andrew's red line, 2026-10-03), a conic from
 * F to the tube's round end R through where the lip lands, rounding over into the ceiling's start over the wall's last
 * HOLLOW_THROAT. `wall` (bool) picks the second piece; s ∈ [0, 1] along it. The CPU's early returns are selects here.
 * Inside an Fn, inside one branch of the segment If chain (every var it builds is its own).
 */
function hollowCurveNode(f: ProfileFrameNodes, wall: N, s: N): N {
  const R = vec2(tubeUpperNode(f.tube, 0.0)).toVar();
  const dR = vec2(norm2(vec2(tubeUpperNode(f.tube, CEILING_START_XI)).sub(R))).toVar();
  const FP = vec2(f.P.sub(f.F)).toVar(), rr = vec2(R.sub(f.F)).toVar();
  // The face leaves the foot along the sheet, unless the landing point lies under that line; then just under P.
  const above: N = FP.x.mul(f.tF.y).sub(FP.y.mul(f.tF.x));
  const toP = norm2(FP), cd = Math.cos(HOLLOW_FOOT_DIP), sd = Math.sin(HOLLOW_FOOT_DIP);
  const dipped = norm2(vec2(toP.x.mul(cd).sub(toP.y.mul(sd)), toP.x.mul(sd).add(toP.y.mul(cd))));
  const tF = vec2(select(above.greaterThanEqual(0.0), f.tF, dipped)).toVar();
  const det = tF.x.mul(dR.y).sub(tF.y.mul(dR.x)).toVar();
  const detS = select(abs(det).greaterThan(1e-6), det, 1.0);
  const a = rr.x.mul(dR.y).sub(rr.y.mul(dR.x)).div(detS).toVar(), b = tF.x.mul(rr.y).sub(tF.y.mul(rr.x)).div(detS);
  const w = smoothstep(0.0, HOLLOW_SETTLE, f.prog).toVar();
  const chord = abs(det).lessThanEqual(1e-6).or(a.lessThanEqual(1e-3)).or(b.lessThanEqual(1e-3)).toVar();
  // The straight chord (the two directions don't meet ahead of both ends), the landing on it.
  const tPc = clamp(dot(FP, rr).div(max(dot(rr, rr), 1e-9)), 0.0, 1.0);
  const tSc = float(0.5).add(tPc.sub(0.5).mul(w)).toVar();
  const chordPos = f.F.add(rr.mul(select(wall, tSc.add(s.mul(float(1.0).sub(tSc))), s.mul(tSc))));
  // The back wall no further behind the round end than HOLLOW_BACK_H × H_I.
  const aMax = R.x.sub(f.HI.mul(HOLLOW_BACK_H)).sub(f.F.x).div(min(tF.x, -1e-6));
  const X = vec2(f.F.add(tF.mul(min(a, aMax)))).toVar();
  // P in barycentric coordinates over (F, X, R), kept inside the triangle.
  const v0 = vec2(X.sub(f.F)).toVar();
  const d = v0.x.mul(rr.y).sub(v0.y.mul(rr.x)), dS = select(abs(d).greaterThan(1e-12), d, 1.0).toVar();
  const be = FP.x.mul(rr.y).sub(FP.y.mul(rr.x)).div(dS).toVar(), ga = v0.x.mul(FP.y).sub(v0.y.mul(FP.x)).div(dS).toVar();
  const al0 = max(float(1.0).sub(be).sub(ga), HOLLOW_EPS), be0 = max(be, HOLLOW_EPS), ga0 = max(ga, HOLLOW_EPS);
  const sum = al0.add(be0).add(ga0).toVar();
  const al = al0.div(sum).toVar(), beN = be0.div(sum).toVar(), gaN = ga0.div(sum).toVar();
  const tP = sqrt(gaN).div(sqrt(al).add(sqrt(gaN))), omP = beN.div(sqrt(al.mul(gaN)).mul(2.0));
  const om = float(1.0).add(max(omP, HOLLOW_MIN_WEIGHT).sub(1.0).mul(w)).toVar(), tS = float(0.5).add(tP.sub(0.5).mul(w)).toVar();
  const conic = (t: N): N => {
    const tt = float(t), u = float(1.0).sub(tt), k0 = u.mul(u), k1 = om.mul(2.0).mul(tt).mul(u), k2 = tt.mul(tt);
    return f.F.mul(k0).add(X.mul(k1)).add(R.mul(k2)).div(k0.add(k1).add(k2));
  };
  const onConic = vec2(conic(select(wall, tS.add(s.mul(float(1.0).sub(tS))), s.mul(tS)))).toVar();
  // The throat: a parabola from A (the conic at the throat's start) along its direction to R along the ceiling's start.
  const tA = tS.add(float(1.0 - HOLLOW_THROAT).mul(float(1.0).sub(tS))).toVar();
  const A = vec2(conic(tA)).toVar(), dA = vec2(norm2(vec2(conic(min(tA.add(1e-4), 1.0))).sub(A))).toVar();
  const q = s.sub(1.0 - HOLLOW_THROAT).div(HOLLOW_THROAT).toVar();
  const dt = dA.x.mul(dR.y).sub(dA.y.mul(dR.x)).toVar(), dtS = select(abs(dt).greaterThan(1e-6), dt, 1.0);
  const ax = R.x.sub(A.x), ay = R.y.sub(A.y);
  const ya = ax.mul(dR.y).sub(ay.mul(dR.x)).div(dtS).toVar(), yb = dA.x.mul(ay).sub(dA.y.mul(ax)).div(dtS);
  const Y = A.add(dA.mul(ya)), v = float(1.0).sub(q);
  const parabola = A.mul(v.mul(v)).add(Y.mul(v.mul(q).mul(2.0))).add(R.mul(q.mul(q)));
  const throatOk = abs(dt).greaterThan(1e-6).and(ya.greaterThan(0.0)).and(yb.greaterThan(0.0));
  const throatPos = select(throatOk, parabola, mix(A, R, q));
  const inThroat = wall.and(s.greaterThan(1.0 - HOLLOW_THROAT));
  const sel: N = select(chord, chordPos, select(inThroat, throatPos, onConic));
  const q0 = vec2(sel).toVar();
  // lipProfile.hollowCurve's floor: what dips below the trough's floor eases onto it (tanh, as 1 − 2/(e^2x + 1)).
  const under = f.floorY.sub(q0.y).div(HOLLOW_FLOOR_SOFT).toVar();
  const th = float(1.0).sub(float(2.0).div(exp(under.mul(2.0)).add(1.0)));
  return select(q0.y.greaterThanEqual(f.floorY), q0, vec2(q0.x, f.floorY.sub(th.mul(HOLLOW_FLOOR_SOFT))));
}

/** lipProfile's constructed point for sample j: { pos, thickness, lipness, liftX }. Inside an Fn. */
function constructedNode(j: N, f: ProfileFrameNodes, baseHome: N): { pos: N; thickness: N; lipness: N; liftX: N } {
  const { seg, s } = sampleSegmentNode(j);
  // Fresh vars, the inputs assigned here, before the segment If chain (see fresh).
  const sv = fresh(float(0.0), s);
  const pos = fresh(vec2(0.0), baseHome), thickness = fresh(float(0.0), 0.0), lipness = fresh(float(0.0), 0.0), liftX = fresh(float(0.0), pos.x);
  If(seg.equal(float(SEGMENT_ID.face)).or(seg.equal(float(SEGMENT_ID.wall))), () => {
    // From the foot up the face, up the back wall to the tube's round end (lipProfile's face and wall: hollowCurve).
    pos.assign(hollowCurveNode(f, seg.equal(float(SEGMENT_ID.wall)), sv));
    liftX.assign(pos.x);
  }).ElseIf(seg.equal(float(SEGMENT_ID.under)), () => {
    const xi = sv.mul(f.xiTip).toVar();
    pos.assign(turnedNode(f, tubeUpperNode(f.tube, xi)));
    thickness.assign(lipThicknessNode(f, xi)); lipness.assign(1.0); liftX.assign(pos.x);
  }).ElseIf(seg.equal(float(SEGMENT_ID.cap)), () => {
    const no = vec2(tubeUpperNormalNode(f.tube, f.xiTip)).toVar(), e = float(f.tipE).toVar();
    const centre = f.tip.add(no.mul(e).mul(0.5));
    const a = atan(no.y.negate(), no.x.negate()).add(sv.mul(Math.PI));
    pos.assign(turnedNode(f, centre.add(vec2(cos(a), sin(a)).mul(e).mul(0.5))));
    thickness.assign(e); lipness.assign(1.0); liftX.assign(f.tip.x);
  }).ElseIf(seg.equal(float(SEGMENT_ID.outer)), () => {
    const band = f.xiTip.greaterThan(f.xiTop);
    If(band.and(sv.lessThanEqual(OUTER_LIP_SHARE)), () => {
      const xi = f.xiTip.add(f.xiTop.sub(f.xiTip).mul(sv.div(OUTER_LIP_SHARE))).toVar();
      const uu = vec2(tubeUpperNode(f.tube, xi)).toVar(), no = tubeUpperNormalNode(f.tube, xi), e = lipThicknessNode(f, xi).toVar();
      pos.assign(turnedNode(f, uu.add(no.mul(e))));
      thickness.assign(e); liftX.assign(uu.x);
    }).Else(() => {
      const fromXi = select(band, f.xiTop, f.xiTip).toVar(), e = select(band, f.tTop, f.tipE).toVar();
      const uu = vec2(tubeUpperNode(f.tube, fromXi)).toVar(), no = tubeUpperNormalNode(f.tube, fromXi);
      const a = uu.add(no.mul(e));
      const k = select(band, sv.sub(OUTER_LIP_SHARE).div(1 - OUTER_LIP_SHARE), sv).toVar();
      const Kt: N = vec2(f.K.x, f.K.y.add(f.crestLift));
      pos.assign(turnedNode(f, mix(a, Kt, k), float(1.0).sub(k)));
      thickness.assign(e.mul(float(1.0).sub(k))); liftX.assign(uu.x.add(f.K.x.sub(uu.x).mul(k)));
    });
    lipness.assign(1.0);
  });
  return { pos, thickness, lipness, liftX };
}

/** lipProfile.liftAt over the stored knots (monotone in x): linear between them, constant past the ends. */
function liftAtNode(f: ProfileFrameNodes, x: N): N {
  const kn = f.knots, last = kn[PILE_KNOTS - 1];
  const res = vec2(last.zw).toVar();
  for (let k = PILE_KNOTS - 2; k >= 0; k--) {
    const a = kn[k], b = kn[k + 1];
    const w = select(b.y.greaterThan(a.y), float(x).sub(a.y).div(max(b.y.sub(a.y), 1e-9)), float(1.0));
    If(float(x).lessThanEqual(b.y), () => { res.assign(mix(a.zw, b.zw, w)); });
  }
  If(float(x).lessThanEqual(kn[0].y), () => { res.assign(kn[0].zw); });
  return res;
}
/** lipProfile.uAtX over the stored knots: the u whose sheet (with the pile, x + dx) stands at x. */
function uAtXNode(f: ProfileFrameNodes, x: N): N {
  const kn = f.knots, X = (k: number): N => kn[k].y.add(kn[k].z);
  const res = float(kn[PILE_KNOTS - 1].x).toVar();
  for (let k = PILE_KNOTS - 2; k >= 0; k--) {
    const a = X(k), b = X(k + 1);
    const lerp = kn[k].x.add(float(x).sub(a).div(max(b.sub(a), 1e-9)).mul(kn[k + 1].x.sub(kn[k].x)));
    If(float(x).lessThanEqual(b), () => { res.assign(select(b.greaterThan(a), lerp, kn[k + 1].x)); });
  }
  If(float(x).lessThanEqual(X(0)), () => { res.assign(kn[0].x); });
  return res;
}

/** lipProfile's rootLift: crestLift, less what the pile has filled under the lip's root. */
function rootLiftNode(f: ProfileFrameNodes): N {
  return max(f.crestLift.sub(max(liftAtNode(f, f.K.x).y, 0.0)), 0.0);
}

/** lipProfile's riding: the constructed point lifted by the pile, up to the crest's own rise, less what fills under the
 * lip's root (fading out toward the tip). */
function ridingNode(seg: N, s: N, f: ProfileFrameNodes, c: { pos: N; liftX: N }): N {
  const crest = liftAtNode(f, f.K.x).y.toVar();
  const under = min(f.crestLift, max(crest, 0.0)).toVar(), wide = f.P.x.sub(f.K.x).greaterThan(1e-3);
  const capped = (x: N): N => {
    const l = liftAtNode(f, x), root = select(wide, float(1.0).sub(smoothstep(f.K.x, max(f.P.x, f.K.x.add(1e-3)), x)), float(1.0));
    return vec2(l.x, min(l.y, crest).sub(under.mul(root)));
  };
  const edge = seg.equal(float(SEGMENT_ID.front)).or(seg.equal(float(SEGMENT_ID.back)));
  const out = vec2(0.0).toVar();
  If(edge, () => {
    const k = smoothstep(0.0, EDGE_LOWER_FADE, select(seg.equal(float(SEGMENT_ID.front)), float(s), float(1.0).sub(s)));
    out.assign(vec2(c.pos.x, c.pos.y.sub(k.mul(max(liftAtNode(f, c.pos.x).y.sub(crest), 0.0)))));
  }).ElseIf(seg.equal(float(SEGMENT_ID.face)), () => {
    out.assign(c.pos.add(mix(capped(f.F.x), capped(f.P.x), s)));
  }).Else(() => {
    out.assign(c.pos.add(capped(c.liftX)));
  });
  return out;
}

/**
 * lipProfile.sampleTarget on the GPU: the u where sample j settles. Returns the target and the constructed point (its
 * pos is the front and back's base placeholder: profilePointNode replaces it with the base at the target). Inside an Fn.
 */
export function sampleTargetNode(j: N, f: ProfileFrameNodes, home: N): { target: N; c: { pos: N; thickness: N; lipness: N; liftX: N } } {
  const { seg, s } = sampleSegmentNode(j);
  const c = constructedNode(j, f, vec2(0.0));
  const w = f.landing.mul(float(1.0).sub(smoothstep(HOME_SETTLE[0], HOME_SETTLE[1], f.collapse))).toVar();
  const edge = seg.equal(float(SEGMENT_ID.front)).or(seg.equal(float(SEGMENT_ID.back)));
  const target = fresh(float(0.0), home);
  If(edge.not().and(w.greaterThan(0.0)), () => {
    const p = ridingNode(seg, float(s), f, c);
    target.assign(float(home).add(uAtXNode(f, p.x).sub(home).mul(w)));
  });
  return { target, c };
}

export interface ProfilePointNodes {
  /** vec2(u, y). */
  pos: N;
  thickness: N;
  curlFoam: N;
  lipness: N;
}

/**
 * profilePoint on the GPU: sample j (an int node), given its frame, the base where it settles (vec2(target + d·n, d.y))
 * and its home. `c` is sampleTargetNode's constructed point (computed there already); absent, it is built here. Must
 * be called inside an Fn.
 */
export function profilePointNode(j: N, f: ProfileFrameNodes, baseTarget: N, home: N, c0?: { pos: N; thickness: N; lipness: N; liftX: N }): ProfilePointNodes {
  const { seg, s } = sampleSegmentNode(j);
  const sv = fresh(float(0.0), s), bt = fresh(vec2(0.0), baseTarget), h = fresh(float(0.0), home);
  const edge = seg.equal(float(SEGMENT_ID.front)).or(seg.equal(float(SEGMENT_ID.back)));
  const built = c0 ?? constructedNode(j, f, bt);
  // The front and back are the base at the target itself (constructed's front/back). Vars assigned here: as shared
  // expressions TSL declared them in the first riding branch that used them, and the others read (0, 0).
  // The back eases down from the crest the lip was thrown from (lipProfile's constructed back: rootLift).
  const back = seg.equal(float(SEGMENT_ID.back)), ease = float(1.0).sub(sv.mul(sv).mul(float(3.0).sub(sv.mul(2.0))));
  const backLift = select(back, rootLiftNode(f).mul(ease), float(0.0));
  const c = { pos: fresh(vec2(0.0), select(edge, bt.add(vec2(0.0, backLift)), built.pos)), thickness: built.thickness, lipness: built.lipness, liftX: fresh(float(0.0), select(edge, bt.x, built.liftX)) };
  // Landing foam: the curl (wall, lip) and the front out to just past where the lip lands.
  const landAt = f.P.x;
  const region = select(seg.equal(float(SEGMENT_ID.back)), float(0.0),
    select(seg.equal(float(SEGMENT_ID.front)), float(1.0).sub(smoothstep(landAt, landAt.add(1.5), h)),
      select(seg.equal(float(SEGMENT_ID.face)), float(0.5), float(1.0))));
  const landed = f.landing.mul(region);
  const isOuter = seg.equal(float(SEGMENT_ID.outer)), isCap = seg.equal(float(SEGMENT_ID.cap));
  const isInside = seg.equal(float(SEGMENT_ID.face)).or(seg.equal(float(SEGMENT_ID.wall))).or(seg.equal(float(SEGMENT_ID.under)));
  const sigma = select(isOuter, select(f.xiTip.greaterThan(0.0), clamp(float(1.0).sub(sv.div(OUTER_LIP_SHARE)), 0.0, 1.0), float(0.0)), select(isCap, float(1.0), float(0.0)));
  // lipProfile.profilePoint: streaks at the tip and the top edge (the lip's band), foam climbing from where it hit.
  const band = select(isCap, float(1.0), select(isOuter.and(f.xiTip.greaterThan(0.0)), float(1.0).sub(smoothstep(OUTER_LIP_SHARE, 1.0, sv)), float(0.0)));
  const streakAt = max(smoothstep(LIP_TIP_BAND, 1.0, sigma), float(1.0).sub(smoothstep(0.0, LIP_TOP_BAND, sigma)));
  const streak = smoothstep(LIP_SPRAY_PROGRESS[0], LIP_SPRAY_PROGRESS[1], f.prog).mul(LIP_STREAK).mul(streakAt).mul(band).mul(mix(f.weight, float(1.0), f.landing));
  const climb = smoothstep(0.0, LANDING_FOAM_RISE, f.collapse);
  const up = smoothstep(float(1.0).sub(climb).sub(CLIMB_SOFT), float(1.0).sub(climb), sigma);
  const air = f.weight.mul(float(1.0).sub(f.landing));
  // The tube's inside stays clean while it is held open and foams as it collapses (lipProfile.profilePoint).
  const filled = landed.mul(smoothstep(0.0, LANDING_FOAM_RISE, f.collapse));
  const curlFoam = select(isOuter.or(isCap), max(landed.mul(up), streak), select(isInside, filled.sub(air), landed));
  const lifted = ridingNode(seg, sv, f, c);
  return { pos: mix(bt, lifted, f.weight), thickness: c.thickness.mul(f.weight), curlFoam, lipness: c.lipness.mul(f.weight) };
}

/** lipProfile's fromDown: an angle measured from straight down, in [−π/2, 3π/2). */
const fromDownNode = (a: N): N => select(a.lessThan(-Math.PI / 2), a.add(2 * Math.PI), a);

/** lipProfile.tubeLightAt: one point's shade, the sun at angle `a`, against the tip T and the lip's root R. */
export function tubeLightAtNode(p: N, T: N, R: N, a: N): { sLip: N; sBody: N; o: N } {
  const aT = fromDownNode(atan(T.y.sub(p.y), T.x.sub(p.x))).toVar(), aR = fromDownNode(atan(R.y.sub(p.y), R.x.sub(p.x))).toVar();
  const lo = min(aT, aR).toVar(), hi = max(aT, aR).toVar(), as = fromDownNode(a).toVar(), e = TUBE_SHADE_SOFT_RAD;
  const pastLo = smoothstep(lo.sub(e), lo.add(e), as), pastHi = smoothstep(hi.sub(e), hi.add(e), as);
  return { sLip: pastLo.mul(float(1.0).sub(pastHi)), sBody: pastHi, o: clamp(lo, 0.0, Math.PI).div(Math.PI) };
}
