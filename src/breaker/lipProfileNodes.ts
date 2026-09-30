import * as THREE from 'three/webgpu';
import { If, atan, cos, float, length, max, min, mix, normalize, select, sin, smoothstep, sqrt, storage, uniform, vec2, vec4 } from 'three/tsl';
import { type BreakParams, RIBBON_FULL_OFFSET, normalizeBreakParams, steepeningStart } from './breaking';
import {
  BACK_EDGE_H, BACK_OFF_DROP_H, EDGE_MARGIN_M, FOOT_WIDTHS, GRAVITY_MS2, HAND_BACK_S, LANDING_FOAM_RISE, LANDING_REFINE, LAND_CLEARANCE_M, LIP_GROW_PROGRESS, LIP_SPRAY, LIP_SPRAY_FROM, LIP_SPRAY_PROGRESS,
  MAX_THICKNESS_OF_RADIUS, MIN_LIP_THICKNESS_M, PROFILE_SAMPLES, type ProfileFrame, type ProfileSegment, SEGMENT_ID, TIP_THICKNESS_RATIO,
  WALL_HEIGHT, sampleSegment,
} from './lipProfile';

type N = any;

/**
 * The TSL mirror of lipProfile.ts, term by term: the station's frame (profileFrame) and each sample's point
 * (sampleHome, profilePoint, lipThicknessAt). lipProfile.ts stays the source of truth; lipProfileNodes.test.ts checks
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
    case 'under': return [0.6 - 0.3 * s, 0, 0];
    case 'cap': return [0.3 - 0.05 * s, 0, 0];
    case 'outer': return [0.25 * (1 - s), 0, 0];
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
  const u = {
    lipReach: uniform(0), lipThickness: uniform(0), wallBack: uniform(0.25), collapseTime: uniform(1), ribbonOnset: uniform(0), faceWidth: uniform(1), steepFrom: uniform(0),
    drainGrowth: uniform(1),
  };
  updateLipUniforms(u, p);
  return u;
}
export type LipUniforms = ReturnType<typeof createLipUniforms>;

/** Uploads a normalized copy of `params` (the caller's object is left alone). */
export function updateLipUniforms(u: LipUniforms, params: BreakParams): void {
  const p = { ...params };
  normalizeBreakParams(p);
  u.lipReach.value = p.lipReach;
  u.lipThickness.value = p.lipThickness;
  u.wallBack.value = p.wallBack;
  u.collapseTime.value = p.collapseTime;
  u.ribbonOnset.value = p.ribbonOnset;
  u.faceWidth.value = p.faceWidth;
  u.steepFrom.value = steepeningStart(p);
  u.drainGrowth.value = 1 + p.troughDrain * p.delta;
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
export interface ProfileInputNodes { H: N; c: N; r: N; tb: N }

/** ProfileFrame as nodes (vec2 for the points, float for the rest). */
export interface ProfileFrameNodes {
  K: N; F: N; tF: N; W: N; R: N;
  uFoot: N; uFront: N; uBack: N; tauLand: N; vj: N; prog: N; reach: N; eRoot: N; weight: N; collapse: N; landing: N; rho: N;
  /** The base samples at uFoot − 0.1 and the landing guess (vec2 each; profileFrameNode sets them, the stored frame
   * keeps them for the self-test's mirror check; the samples don't need them). */
  Fb?: N; landing0?: N;
}

/** A station's frame is stored as this many vec4s (packFrameNodes): FRAME_LAYOUT, then the base samples. */
export const FRAME_VEC4S = 7;
/** vec4s of the stored frame that the samples read (FRAME_LAYOUT); the last holds the base samples. */
export const FRAME_PROFILE_VEC4S = 6;
/** Float offset of the stored base samples within a frame: Fb (x, y), then the landing guess (x, y). */
export const FRAME_BASE_OFFSET = 4 * FRAME_PROFILE_VEC4S;
/** The packed frame's components in order (4 per vec4; the last two slots are 0). */
export const FRAME_LAYOUT = [
  'K.x', 'K.y', 'F.x', 'F.y', 'tF.x', 'tF.y', 'W.x', 'W.y', 'R.x', 'R.y', 'uFoot', 'uFront',
  'uBack', 'tauLand', 'vj', 'prog', 'reach', 'eRoot', 'weight', 'collapse', 'landing', 'rho',
] as const;

/** The CPU frame in FRAME_LAYOUT order (for comparing with the GPU's). */
export function packFrameCpu(f: ProfileFrame): number[] {
  return [
    f.K[0], f.K[1], f.F[0], f.F[1], f.tF[0], f.tF[1], f.W[0], f.W[1], f.R[0], f.R[1], f.uFoot, f.uFront,
    f.uBack, f.tauLand, f.vj, f.prog, f.reach, f.eRoot, f.weight, f.collapse, f.landing, f.rho,
  ];
}

/** The frame as FRAME_VEC4S vec4s: FRAME_LAYOUT order, then vec4(Fb, landing0). */
export function packFrameNodes(f: ProfileFrameNodes): N[] {
  if (!f.Fb || !f.landing0) throw new Error('packFrameNodes needs the base samples (profileFrameNode sets them)');
  return [
    vec4(f.K, f.F), vec4(f.tF, f.W), vec4(f.R, f.uFoot, f.uFront), vec4(f.uBack, f.tauLand, f.vj, f.prog),
    vec4(f.reach, f.eRoot, f.weight, f.collapse), vec4(f.landing, f.rho, 0.0, 0.0), vec4(f.Fb, f.landing0),
  ];
}

/** The frame back from its first FRAME_PROFILE_VEC4S vec4s (pass vars: every field is a swizzle of them). */
export function unpackFrameNodes(v: readonly N[]): ProfileFrameNodes {
  return {
    K: v[0].xy, F: v[0].zw, tF: v[1].xy, W: v[1].zw, R: v[2].xy, uFoot: v[2].z, uFront: v[2].w,
    uBack: v[3].x, tauLand: v[3].y, vj: v[3].z, prog: v[3].w, reach: v[4].x, eRoot: v[4].y, weight: v[4].z, collapse: v[4].w,
    landing: v[5].x, rho: v[5].y,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The frame (profileFrame)
// ---------------------------------------------------------------------------------------------------------------

/** lipProfile's norm2: v / |v|, or (0, 1) for |v| ≤ 1e-9. */
const norm2 = (v: N): N => {
  const l = length(v);
  return select(l.greaterThan(1e-9), v.div(max(l, 1e-30)), vec2(0.0, 1.0));
};

/** landingTime: √(2·max(drop, 0.05)/g). */
const landingTimeNode = (drop: N): N => sqrt(max(drop, 0.05).mul(2 / GRAVITY_MS2));

/**
 * profileFrame on the GPU. `baseAt(u)` returns the base's displaced vec2(x, y) at undisplaced u (it is called
 * 4 + LANDING_REFINE times, in profileFrame's order: 0, uFoot, uFoot − 0.1, the landing guess, then each landing
 * refinement; each result is made a var here, so each base sample is evaluated once). Must be called inside an Fn.
 */
export function profileFrameNode(baseAt: (u: N) => N, input: ProfileInputNodes, u: LipUniforms): ProfileFrameNodes {
  const H = float(input.H).toVar(), c = float(input.c).toVar(), r = float(input.r).toVar(), tb = float(input.tb).toVar();
  const uFoot = float(FOOT_WIDTHS).mul(u.faceWidth).mul(H).toVar();
  const K = vec2(baseAt(float(0.0))).toVar();
  const F = vec2(baseAt(uFoot)).toVar();
  const Fb = vec2(baseAt(uFoot.sub(0.1))).toVar();
  const tF = norm2(Fb.sub(F)).toVar();
  const tau0 = landingTimeNode(K.y.sub(F.y)).toVar();
  const vj0 = max(u.lipReach.mul(c), F.x.sub(K.x).add(LAND_CLEARANCE_M).div(tau0)).toVar();
  const landing0 = vec2(baseAt(uFoot.add(K.x.add(vj0.mul(tau0)).sub(F.x)))).toVar();
  const tipBelow = float(TIP_THICKNESS_RATIO).mul(u.lipThickness).mul(H);
  const tauLand = landingTimeNode(K.y.sub(max(F.y, landing0.y)).sub(tipBelow)).toVar();
  const vj = max(u.lipReach.mul(c), F.x.sub(K.x).add(LAND_CLEARANCE_M).div(tauLand)).toVar();
  // The water where the lip then lands (lipProfile.profileFrame): each step moves u by the miss in x.
  const uLand = uFoot.add(K.x.add(vj0.mul(tau0)).sub(F.x)).toVar();
  const land = vec2(landing0).toVar();
  for (let i = 0; i < LANDING_REFINE; i++) {
    uLand.addAssign(K.x.add(vj.mul(tauLand)).sub(land.x));
    land.assign(baseAt(uLand));
    tauLand.assign(landingTimeNode(K.y.sub(max(F.y, land.y)).sub(tipBelow)));
    vj.assign(max(u.lipReach.mul(c), F.x.sub(K.x).add(LAND_CLEARANCE_M).div(tauLand)));
  }
  const pre = tb.lessThan(0.0);
  const t = select(pre, float(0.0), min(max(tb, 0.0), tauLand)).toVar();
  const prog = t.div(tauLand).toVar();
  const reach = vj.mul(t).toVar();
  // The back-off edges scale with H: floored so a zero-height row (never drawn) can't give smoothstep equal edges.
  const Hs = max(H, 1e-6);
  const steep = select(pre, smoothstep(u.steepFrom, 1.0, r).mul(smoothstep(u.ribbonOnset, u.ribbonOnset.add(RIBBON_FULL_OFFSET), r)), smoothstep(Hs.mul(BACK_OFF_DROP_H[0]), Hs.mul(BACK_OFF_DROP_H[1]), K.y.sub(F.y)));
  // breaking.landingEstimate: landingTime(H·(1 + troughDrain·δ)), the fall floored at 0.05 m as landingTime floors it;
  // settleSpan is collapseTime × that. The curl collapses from the later of it and the lip's own landing.
  const landEstimate = max(H.mul(u.drainGrowth), 0.05).mul(2 / GRAVITY_MS2).sqrt().toVar();
  const span = u.collapseTime.mul(landEstimate).toVar();
  const settleFrom = max(tauLand, landEstimate).toVar();
  const collapse = select(pre, float(0.0), smoothstep(settleFrom, settleFrom.add(span), tb)).toVar();
  const landing = select(pre, float(0.0), smoothstep(tauLand, tauLand.add(span.mul(LANDING_FOAM_RISE)), tb)).toVar();
  const grow = smoothstep(0.0, LIP_GROW_PROGRESS, prog);
  const eRoot = max(MIN_LIP_THICKNESS_M, min(u.lipThickness.mul(H), vj.mul(vj).mul(MAX_THICKNESS_OF_RADIUS / GRAVITY_MS2))).mul(grow).toVar();
  const R = vec2(K.x, K.y.sub(eRoot)).toVar();
  const W = vec2(K.x.sub(H.mul(u.wallBack).mul(prog)), F.y.add(R.y.sub(F.y).mul(WALL_HEIGHT))).toVar();
  const uFront = max(uFoot, K.x.add(vj.mul(tauLand))).add(LAND_CLEARANCE_M + EDGE_MARGIN_M).toVar();
  const uBack = H.mul(BACK_EDGE_H).add(EDGE_MARGIN_M).negate().toVar();
  // ribbonWeight
  const end = settleFrom.add(span);
  const rho = select(pre, smoothstep(u.ribbonOnset, u.ribbonOnset.add(RIBBON_FULL_OFFSET), r), float(1.0).sub(smoothstep(end, end.add(HAND_BACK_S), tb))).toVar();
  const weight = steep.mul(float(1.0).sub(collapse)).toVar();
  return { K, F, tF, W, R, uFoot, uFront, uBack, tauLand, vj, prog, reach, eRoot, weight, collapse, landing, rho, Fb, landing0 };
}

// ---------------------------------------------------------------------------------------------------------------
// The samples (sampleSegment, sampleHome, profilePoint)
// ---------------------------------------------------------------------------------------------------------------

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

function hermiteNode(p0: N, t0: N, p1: N, t1: N, s: N): N {
  const s2 = s.mul(s), s3 = s2.mul(s);
  const h00 = s3.mul(2.0).sub(s2.mul(3.0)).add(1.0), h10 = s3.sub(s2.mul(2.0)).add(s);
  const h01 = s3.mul(-2.0).add(s2.mul(3.0)), h11 = s3.sub(s2);
  return p0.mul(h00).add(t0.mul(h10)).add(p1.mul(h01)).add(t1.mul(h11));
}

/** The lip's outer surface at σ (root to tip): the ballistic arc from K. */
function outerNode(f: ProfileFrameNodes, sigma: N): N {
  const du = f.reach.mul(sigma), tp = du.div(f.vj);
  return vec2(f.K.x.add(du), f.K.y.sub(tp.mul(tp).mul(0.5 * GRAVITY_MS2)));
}
/** The arc's outward (upper) unit normal at σ (its length is ≥ 1, so norm2's fallback never applies). */
function outerNormalNode(f: ProfileFrameNodes, sigma: N): N {
  const tp = f.reach.mul(sigma).div(f.vj);
  return normalize(vec2(tp.mul(GRAVITY_MS2).div(f.vj), 1.0));
}
/** lipThicknessAt. */
export function lipThicknessNode(f: ProfileFrameNodes, sigma: N): N {
  const e = f.eRoot.mul(float(1.0).sub(float(sigma).mul(1 - TIP_THICKNESS_RATIO)));
  return select(f.eRoot.greaterThan(0.0), max(e, smoothstep(0.0, LIP_GROW_PROGRESS, f.prog).mul(MIN_LIP_THICKNESS_M)), float(0.0));
}

export interface ProfilePointNodes {
  /** vec2(u, y). */
  pos: N;
  thickness: N;
  curlFoam: N;
  lipness: N;
}

/**
 * profilePoint on the GPU: sample j (an int node) of the profile, given its frame and the base at its home
 * (vec2(home + d·n, d.y)). `home` is sampleHomeNode(j, f); pass it when the caller already has it. Must be called
 * inside an Fn. The segment picks its constructed point through an If chain on the table's segment id.
 */
export function profilePointNode(j: N, f: ProfileFrameNodes, baseHome: N, home: N = sampleHomeNode(j, f)): ProfilePointNodes {
  const { seg, s } = sampleSegmentNode(j);
  const sv = float(s).toVar();
  const bh = vec2(baseHome).toVar();
  const h = float(home).toVar();
  // constructed(): front and back are the base itself.
  const pos = vec2(bh).toVar();
  const thickness = float(0.0).toVar();
  const lipness = float(0.0).toVar();
  If(seg.equal(float(SEGMENT_ID.face)), () => {
    const L = length(f.W.sub(f.F));
    pos.assign(hermiteNode(f.F, f.tF.mul(L), f.W, vec2(0.0, L), sv));
  }).ElseIf(seg.equal(float(SEGMENT_ID.wall)), () => {
    const L: N = max(length(f.R.sub(f.W)), 0.05);
    pos.assign(hermiteNode(f.W, vec2(0.0, L), f.R, vec2(L.mul(f.prog), L.mul(float(1.0).sub(f.prog))), sv));
  }).ElseIf(seg.equal(float(SEGMENT_ID.under)), () => {
    const e = lipThicknessNode(f, sv).toVar();
    pos.assign(outerNode(f, sv).sub(outerNormalNode(f, sv).mul(e)));
    thickness.assign(e);
    lipness.assign(1.0);
  }).ElseIf(seg.equal(float(SEGMENT_ID.cap)), () => {
    const P = outerNode(f, float(1.0)).toVar();
    const n = outerNormalNode(f, float(1.0)).toVar();
    const e = lipThicknessNode(f, float(1.0)).toVar();
    const centre = P.sub(n.mul(e).div(2.0));
    const a = atan(n.y.negate(), n.x.negate()).add(sv.mul(Math.PI));
    pos.assign(centre.add(vec2(cos(a), sin(a)).mul(e).div(2.0)));
    thickness.assign(e);
    lipness.assign(1.0);
  }).ElseIf(seg.equal(float(SEGMENT_ID.outer)), () => {
    const sigma = float(1.0).sub(sv).toVar();
    pos.assign(outerNode(f, sigma));
    thickness.assign(lipThicknessNode(f, sigma));
    lipness.assign(1.0);
  });
  // Landing foam: the curl (wall, lip) and the front out to just past where the lip lands.
  const landAt = f.K.x.add(f.vj.mul(f.tauLand));
  const region = select(seg.equal(float(SEGMENT_ID.back)), float(0.0),
    select(seg.equal(float(SEGMENT_ID.front)), float(1.0).sub(smoothstep(landAt, landAt.add(1.5), h)),
      select(seg.equal(float(SEGMENT_ID.face)), float(0.5), float(1.0))));
  const landed = f.landing.mul(region);
  // lipProfile.profilePoint's foam zones: in the air the outside sprays (by σ, the cap its tip) and the tube's inside is
  // clean (< 0); once the lip lands, the landing foam.
  const isOuter = seg.equal(float(SEGMENT_ID.outer)), isCap = seg.equal(float(SEGMENT_ID.cap));
  const isInside = seg.equal(float(SEGMENT_ID.face)).or(seg.equal(float(SEGMENT_ID.wall))).or(seg.equal(float(SEGMENT_ID.under)));
  const sigma = select(isOuter, float(1.0).sub(sv), select(isCap, float(1.0), float(0.0)));
  const spray = smoothstep(LIP_SPRAY_PROGRESS[0], LIP_SPRAY_PROGRESS[1], f.prog).mul(LIP_SPRAY).mul(smoothstep(LIP_SPRAY_FROM, 1.0, sigma));
  const air = f.weight.mul(float(1.0).sub(f.landing));
  const curlFoam = select(isOuter.or(isCap), max(landed, spray.mul(air)), select(isInside, landed.sub(air), landed));
  return { pos: mix(bh, pos, f.weight), thickness: thickness.mul(f.weight), curlFoam, lipness: lipness.mul(f.weight) };
}
