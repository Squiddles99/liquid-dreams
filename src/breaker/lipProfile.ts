import { smoothstep } from '../math/smoothstep';
import { type BreakParams, GRAVITY_MS2, RIBBON_FULL_OFFSET, landingEstimate, landingTime, settleSpan, steepening } from './breaking';

export { GRAVITY_MS2, landingTime, settleSpan };

/**
 * The breaking ribbon's cross-section (breaking-ribbon spec §6): the water's surface outline in the vertical plane
 * across one crest station, as PROFILE_SAMPLES points in one unbroken line from the front edge (the trough ahead) up the
 * face, round the tube, out along the underside of the lip, round its tip, back over its top to the crest and down the
 * back to the back edge. u is metres ahead of the crest's undisplaced position along the station's travel normal, y
 * metres up from still water. The source of truth: lipProfileNodes.ts mirrors it term by term on the GPU.
 *
 * The curve is built on the sheet's own cross-section `base(u)`: the displaced sheet point for undisplaced u (the sheet
 * is Phase 1 + drain + bore + the front sharpening, spec R8 as amended by Q1). Every sample has a "home" u on the base,
 * monotone along the curve, and ends up at lerp(base(home), constructed, steep·(1 − collapse)): before the wave
 * steepens, and again once it has collapsed, the ribbon is exactly the sheet.
 */

export type Vec2 = [number, number];

/** Samples per segment, front edge to back edge (spec §6.6, R7). */
export const PROFILE_SEGMENTS = { front: 12, face: 16, wall: 12, under: 28, cap: 12, outer: 40, back: 40 } as const;
export type ProfileSegment = keyof typeof PROFILE_SEGMENTS;
const SEGMENT_ORDER: readonly ProfileSegment[] = ['front', 'face', 'wall', 'under', 'cap', 'outer', 'back'];
export const PROFILE_SAMPLES = SEGMENT_ORDER.reduce((n, s) => n + PROFILE_SEGMENTS[s], 0); // 160
/** Segment ids in PROFILE_SEGMENTS order (the GPU mirror uses the numbers). */
export const SEGMENT_ID: Record<ProfileSegment, number> = { front: 0, face: 1, wall: 2, under: 3, cap: 4, outer: 5, back: 6 };

/** The face's foot sits this many face widths ahead of the crest: where the sheet's front sharpening has sunk 97% of
 * the way to the trough (1 − exp(−1.9²) ≈ 0.97). */
export const FOOT_WIDTHS = 1.9;
/** The lip lands at least this far ahead of the foot, so the tip never meets the face before it lands. */
export const LAND_CLEARANCE_M = 0.3;
/** The front and back edges sit this far beyond the constructed curve (the sheet's own shape out there). */
export const EDGE_MARGIN_M = 2;
/** The back edge: this many H behind the crest, plus EDGE_MARGIN_M. */
export const BACK_EDGE_H = 0.5;
export const MIN_LIP_THICKNESS_M = 0.02;
/** The lip's thickness at the tip, as a fraction of its thickness at the root (Andrew's photo: a thick lip all the way out). */
export const TIP_THICKNESS_RATIO = 0.4;
/** The lip grows to its full thickness over this fraction of the throw (at onset it has no length, so no thickness). */
export const LIP_GROW_PROGRESS = 0.3;
/** The underside is the outer arc offset inward; its thickness never exceeds this fraction of the arc's smallest radius
 * of curvature (v_j²/g, at the root), so the offset curve never folds. */
export const MAX_THICKNESS_OF_RADIUS = 0.8;
/** The tube's back wall W: this many H behind the crest at full throw (a round tube, spec 2026-09-29 §3.1)… */
export const WALL_BACK_H = 0.25;
/** …at this fraction of the way from the trough up to the lip's root. */
export const WALL_HEIGHT = 0.45;
/** After the collapse ends the ribbon fades out (hands back to the sheet) over this long (s). */
export const HAND_BACK_S = 0.5;
/** The foam from the lip's landing rises over this fraction of the collapse. */
export const LANDING_FOAM_RISE = 0.3;
/** A broken section whose crest stands less than BACK_OFF_DROP_H[1]·H above its foot (it has run into deeper water and
 * the sheet has stopped sharpening it) relaxes back to the sheet, fully by BACK_OFF_DROP_H[0]·H. */
export const BACK_OFF_DROP_H: readonly [number, number] = [0.3, 0.6];

/** The BreakParams the profile reads (breaking.ts documents each). */
export type LipParams = Pick<BreakParams, 'throwStrength' | 'lipThickness' | 'collapseTime' | 'ribbonOnset' | 'faceWidth' | 'troughDrain' | 'delta'>;

/** What the profile needs from its station. */
export interface ProfileInput {
  /** Local wave height (m), capped and tapered as the sheet's (setWaveModel.localHeight × lateral). */
  H: number;
  /** Crest speed ω/k (m/s). */
  c: number;
  /** The crest's breaking ratio (breaking.breakingRatio, uncapped H). */
  r: number;
  /** Time since onset (s): null before the section breaks, Infinity once it is past the hand-back (crestTrace). */
  tb: number | null;
}

/** Everything about one station's profile that does not depend on the sample: computed once per station. */
export interface ProfileFrame {
  K: Vec2;
  F: Vec2;
  /** Unit tangent of the base at F, pointing back toward the crest (the direction the curve runs). */
  tF: Vec2;
  uFoot: number;
  uFront: number;
  uBack: number;
  tauLand: number;
  vj: number;
  /** Throw progress t/τ_land, clamped to [0, 1]. */
  prog: number;
  /** How far the lip has thrown (m, ahead of K). */
  reach: number;
  /** Root thickness (m), grown in over the throw. */
  eRoot: number;
  /** The weight of the constructed curve against the base: steep × (1 − collapse). */
  weight: number;
  collapse: number;
  /** Landing foam [0, 1]. */
  landing: number;
  /** Ribbon weight ρ [0, 1] (0: the station is dropped). */
  rho: number;
  W: Vec2;
  R: Vec2;
}

const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const norm2 = (v: Vec2): Vec2 => { const l = Math.hypot(v[0], v[1]); return l > 1e-9 ? [v[0] / l, v[1] / l] : [0, 1]; };

function hermite(p0: Vec2, t0: Vec2, p1: Vec2, t1: Vec2, s: number): Vec2 {
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return [h00 * p0[0] + h10 * t0[0] + h01 * p1[0] + h11 * t1[0], h00 * p0[1] + h10 * t0[1] + h01 * p1[1] + h11 * t1[1]];
}

/** ρ: fades in over [ribbonOnset, ribbonOnset + RIBBON_FULL_OFFSET] before breaking, 1 from onset, out over HAND_BACK_S
 * after the collapse (which runs from settleFrom for span). */
export function ribbonWeight(r: number, tb: number | null, settleFrom: number, span: number, p: LipParams): number {
  if (tb === null) return smoothstep(p.ribbonOnset, p.ribbonOnset + RIBBON_FULL_OFFSET, r);
  const end = settleFrom + span;
  return 1 - smoothstep(end, end + HAND_BACK_S, tb);
}

/**
 * The station's frame, from four base points: the crest K = base(0), the foot F = base(uFoot), base(uFoot − 0.1) for the
 * face's tangent there, and the sheet where the lip lands. The lip lands when the underside of its tip reaches the
 * higher of the foot and the water at the landing spot.
 */
export function profileFrame(base: (u: number) => Vec2, input: ProfileInput, p: LipParams): ProfileFrame {
  const { H, c, r, tb } = input;
  const uFoot = FOOT_WIDTHS * p.faceWidth * H;
  const K = base(0), F = base(uFoot), Fb = base(uFoot - 0.1);
  const tF = norm2([Fb[0] - F[0], Fb[1] - F[1]]);
  const tau0 = landingTime(K[1] - F[1]);
  const vj0 = Math.max(p.throwStrength * c, (F[0] - K[0] + LAND_CLEARANCE_M) / tau0);
  const landing0 = base(uFoot + (K[0] + vj0 * tau0 - F[0]));
  const tipBelow = TIP_THICKNESS_RATIO * p.lipThickness * H;
  const tauLand = landingTime(K[1] - Math.max(F[1], landing0[1]) - tipBelow);
  const vj = Math.max(p.throwStrength * c, (F[0] - K[0] + LAND_CLEARANCE_M) / tauLand);
  const t = tb === null ? 0 : Math.min(Math.max(tb, 0), tauLand);
  const prog = t / tauLand;
  const reach = vj * t;
  // Before the break the constructed curve follows the sheet's sharpening, but only inside the ribbon: the sharpening
  // starts before the ribbon fades in (SHEET_SHARPENING_LEAD), and there the sheet draws it itself.
  const steep = tb === null
    ? steepening(r, p) * smoothstep(p.ribbonOnset, p.ribbonOnset + RIBBON_FULL_OFFSET, r)
    : smoothstep(BACK_OFF_DROP_H[0] * H, BACK_OFF_DROP_H[1] * H, K[1] - F[1]);
  const span = settleSpan(H, p);
  // The curl collapses as the sheet under it does (breaking.lifecycle, from landingEstimate), but never before its own
  // lip has landed.
  const settleFrom = Math.max(tauLand, landingEstimate(H, p));
  const collapse = tb === null ? 0 : smoothstep(settleFrom, settleFrom + span, tb);
  const landing = tb === null ? 0 : smoothstep(tauLand, tauLand + LANDING_FOAM_RISE * span, tb);
  const grow = smoothstep(0, LIP_GROW_PROGRESS, prog);
  const eRoot = Math.max(MIN_LIP_THICKNESS_M, Math.min(p.lipThickness * H, (MAX_THICKNESS_OF_RADIUS * vj * vj) / GRAVITY_MS2)) * grow;
  const R: Vec2 = [K[0], K[1] - eRoot];
  const W: Vec2 = [K[0] - WALL_BACK_H * H * prog, F[1] + WALL_HEIGHT * (R[1] - F[1])];
  // Beyond where the lip will land (fixed over the throw, so the front edge doesn't move).
  const uFront = Math.max(uFoot, K[0] + vj * tauLand) + LAND_CLEARANCE_M + EDGE_MARGIN_M;
  return {
    K, F, tF, uFoot, uFront, uBack: -(BACK_EDGE_H * H + EDGE_MARGIN_M), tauLand, vj, prog, reach, eRoot,
    weight: steep * (1 - collapse), collapse, landing, rho: ribbonWeight(r, tb, settleFrom, span, p), W, R,
  };
}

/** Which segment sample j is in, and its position s ∈ [0, 1) within it (s = j' / count; the back's last sample is 1). */
export function sampleSegment(j: number): { seg: ProfileSegment; s: number } {
  let i = j;
  for (const seg of SEGMENT_ORDER) {
    const n = PROFILE_SEGMENTS[seg];
    if (i < n) return { seg, s: seg === 'back' ? i / (n - 1) : i / n };
    i -= n;
  }
  return { seg: 'back', s: 1 };
}

/** The home u of sample j: monotone from uFront (j = 0) to uBack (the last sample), through uFoot and the crest (0). */
export function sampleHome(j: number, f: ProfileFrame): number {
  const { seg, s } = sampleSegment(j);
  const uF = f.uFoot;
  switch (seg) {
    case 'front': return f.uFront + (uF - f.uFront) * s;
    case 'face': return uF * (1 - 0.25 * s);
    case 'wall': return uF * (0.75 - 0.15 * s);
    case 'under': return uF * (0.6 - 0.3 * s);
    case 'cap': return uF * (0.3 - 0.05 * s);
    case 'outer': return uF * 0.25 * (1 - s);
    default: return f.uBack * s;
  }
}

/** The outer surface of the lip at arc parameter σ ∈ [0, 1] (root to tip): the ballistic arc from K. */
function outer(f: ProfileFrame, sigma: number): Vec2 {
  const du = f.reach * sigma, tp = du / f.vj;
  return [f.K[0] + du, f.K[1] - 0.5 * GRAVITY_MS2 * tp * tp];
}
/** The arc's outward (upper) unit normal at σ. */
function outerNormal(f: ProfileFrame, sigma: number): Vec2 {
  const tp = (f.reach * sigma) / f.vj;
  return norm2([(GRAVITY_MS2 * tp) / f.vj, 1]);
}
/** Lip thickness at σ: eRoot at the root, TIP_THICKNESS_RATIO of it at the tip, never below the minimum once grown. */
export function lipThicknessAt(f: ProfileFrame, sigma: number): number {
  const e = f.eRoot * (1 - (1 - TIP_THICKNESS_RATIO) * sigma);
  return f.eRoot > 0 ? Math.max(e, MIN_LIP_THICKNESS_M * smoothstep(0, LIP_GROW_PROGRESS, f.prog)) : 0;
}
function under(f: ProfileFrame, sigma: number): Vec2 {
  const o = outer(f, sigma), n = outerNormal(f, sigma), e = lipThicknessAt(f, sigma);
  return [o[0] - n[0] * e, o[1] - n[1] * e];
}

export interface ProfilePoint {
  pos: Vec2;
  /** The lip's thickness here (m); 0 off the lip (segments under, cap, outer carry it). Keys the turquoise glow. */
  thickness: number;
  /** Foam from the lip's landing [0, 1] (spec D4: where the wave turns inside out). Composed with the sheet's by max. */
  curlFoam: number;
  /** 1 on the lip (under, cap, outer), 0 elsewhere: the FFT chop fades out over it (spec R6). */
  lipness: number;
}

/** The constructed (unblended) point for sample j. */
function constructed(j: number, f: ProfileFrame, baseHome: Vec2): { pos: Vec2; thickness: number; lipness: number } {
  const { seg, s } = sampleSegment(j);
  switch (seg) {
    case 'front':
    case 'back':
      return { pos: baseHome, thickness: 0, lipness: 0 };
    case 'face': {
      const L = Math.hypot(f.W[0] - f.F[0], f.W[1] - f.F[1]);
      return { pos: hermite(f.F, [f.tF[0] * L, f.tF[1] * L], f.W, [0, L], s), thickness: 0, lipness: 0 };
    }
    case 'wall': {
      const L = Math.max(Math.hypot(f.R[0] - f.W[0], f.R[1] - f.W[1]), 0.05);
      return { pos: hermite(f.W, [0, L], f.R, [L * f.prog, L * (1 - f.prog)], s), thickness: 0, lipness: 0 };
    }
    case 'under':
      return { pos: under(f, s), thickness: lipThicknessAt(f, s), lipness: 1 };
    case 'cap': {
      const P = outer(f, 1), n = outerNormal(f, 1), e = lipThicknessAt(f, 1);
      const cx = P[0] - (n[0] * e) / 2, cy = P[1] - (n[1] * e) / 2;
      const a = Math.atan2(-n[1], -n[0]) + Math.PI * s;
      return { pos: [cx + (Math.cos(a) * e) / 2, cy + (Math.sin(a) * e) / 2], thickness: e, lipness: 1 };
    }
    default: // outer, tip → root
      return { pos: outer(f, 1 - s), thickness: lipThicknessAt(f, 1 - s), lipness: 1 };
  }
}

/** Sample j of the profile, given its frame and the base at its home (base(sampleHome(j, f))). */
export function profilePoint(j: number, f: ProfileFrame, baseHome: Vec2): ProfilePoint {
  const c = constructed(j, f, baseHome);
  const { seg } = sampleSegment(j);
  // Landing foam: the curl (wall, lip) and the front out to just past where the lip lands.
  const home = sampleHome(j, f);
  const landAt = f.K[0] + f.vj * f.tauLand;
  const region = seg === 'back' ? 0 : seg === 'front' ? 1 - smoothstep(landAt, landAt + 1.5, home) : seg === 'face' ? 0.5 : 1;
  return { pos: lerp2(baseHome, c.pos, f.weight), thickness: c.thickness * f.weight, curlFoam: f.landing * region, lipness: c.lipness * f.weight };
}

export interface Profile {
  frame: ProfileFrame;
  points: Vec2[];
  homes: number[];
  thickness: number[];
  curlFoam: number[];
  lipness: number[];
}

/**
 * The whole profile for one station (CPU reference and tests). The frame (where and when the lip lands, how fast it
 * throws) is measured on `frameBase`, the sheet without the whitewater pile: the lip is thrown from the wave as it stood,
 * and the whitewater rising under the curl must not pull it back. The points settle onto `base`, the sheet with it.
 */
export function buildProfile(base: (u: number) => Vec2, input: ProfileInput, p: LipParams, frameBase: (u: number) => Vec2 = base): Profile {
  const frame = profileFrame(frameBase, input, p);
  const out: Profile = { frame, points: [], homes: [], thickness: [], curlFoam: [], lipness: [] };
  for (let j = 0; j < PROFILE_SAMPLES; j++) {
    const home = sampleHome(j, frame);
    const pt = profilePoint(j, frame, base(home));
    out.points.push(pt.pos); out.homes.push(home); out.thickness.push(pt.thickness); out.curlFoam.push(pt.curlFoam); out.lipness.push(pt.lipness);
  }
  return out;
}

/** The barrel's proportions at one moment (spec 2026-09-29 §3.1; tests and the gallery). Lengths are × H. */
export interface BarrelMetrics {
  /** The lip's thickness at its root (× H), and at its tip as a fraction of the root. */
  rootThickness: number;
  tipRatio: number;
  /** Where the lip lands, ahead of the crest (× H). */
  landAhead: number;
  /** The tube's width at half its height (the wall to the underside of the falling lip) ÷ its height (the foot to the
   * lip's underside at the root). NaN until the lip has fallen below half the tube's height. */
  tubeRatio: number;
  /** How far the back wall stands behind the crest (× H). */
  wallBack: number;
  /** How far the water in front of the face is drawn below still water (× H). */
  troughBelow: number;
  /** The most the wall bulges behind the straight line from W to the lip's root R (m; > 0: concave up into the lip). */
  wallBulge: number;
}

export function barrelMetrics(p: Profile, H: number): BarrelMetrics {
  const f = p.frame, n = PROFILE_SEGMENTS;
  const faceStart = n.front, wallStart = n.front + n.face, wallEnd = wallStart + n.wall, capEnd = wallEnd + n.under + n.cap;
  let wallX = Infinity, trough = Infinity, bulge = -Infinity;
  for (let j = faceStart; j < wallEnd; j++) wallX = Math.min(wallX, p.points[j][0]);
  for (let j = 0; j < wallStart; j++) trough = Math.min(trough, p.points[j][1]);
  for (let j = wallStart; j < wallEnd; j++) {
    const [x, y] = p.points[j];
    const chordX = f.W[0] + ((f.R[0] - f.W[0]) * (y - f.W[1])) / (f.R[1] - f.W[1] || 1e-9);
    bulge = Math.max(bulge, chordX - x);
  }
  const mid = (f.F[1] + f.R[1]) / 2;
  const crossAt = (a: number, b: number): number => {
    for (let j = a; j < b; j++) {
      const [x0, y0] = p.points[j], [x1, y1] = p.points[j + 1];
      if ((y0 - mid) * (y1 - mid) <= 0 && y0 !== y1) return x0 + ((x1 - x0) * (mid - y0)) / (y1 - y0);
    }
    return NaN;
  };
  const width = crossAt(wallEnd, capEnd - 1) - crossAt(faceStart, wallEnd - 1);
  return {
    rootThickness: f.eRoot / H,
    tipRatio: f.eRoot > 0 ? lipThicknessAt(f, 1) / f.eRoot : 0,
    landAhead: (f.vj * f.tauLand) / H,
    tubeRatio: width / (f.R[1] - f.F[1]),
    wallBack: (f.K[0] - wallX) / H,
    troughBelow: -trough / H,
    wallBulge: bulge,
  };
}

/**
 * How many pairs of non-adjacent segments of the polyline cross properly (0 for a simple curve). Touching at an end
 * (within 1e-6 of either segment's ends, as the unthrown lip's root touches the crest) and zero-length segments don't
 * count. Test helper.
 */
export function crossings(pts: readonly Vec2[]): number {
  const EPS = 1e-6;
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], rx = pts[i + 1][0] - ax, ry = pts[i + 1][1] - ay;
    const lr = Math.hypot(rx, ry);
    if (lr <= EPS) continue;
    for (let j = i + 2; j + 1 < pts.length; j++) {
      const [cx, cy] = pts[j], sx = pts[j + 1][0] - cx, sy = pts[j + 1][1] - cy;
      const ls = Math.hypot(sx, sy);
      if (ls <= EPS) continue;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-15) continue; // parallel
      const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
      if (t * lr > EPS && (1 - t) * lr > EPS && u * ls > EPS && (1 - u) * ls > EPS) n++;
    }
  }
  return n;
}
