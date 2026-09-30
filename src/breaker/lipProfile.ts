import { smoothstep } from '../math/smoothstep';
import { type BreakParams, GRAVITY_MS2, RIBBON_FULL_OFFSET, landingEstimate, landingTime, settleSpan, steepening } from './breaking';
import { type Overturn, PSI_MIN, PSI_NONE, PSI_NORMAL, overturnShape, sheetShape, windUC } from './overturn';
import { type Tube, tubeAxes, tubeBackMostX, tubeLower, tubeTopXi, tubeUpper, tubeUpperArc, tubeUpperNormal } from './tube';

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
/** The lip's thickness at the tip, as a fraction of its thickness over the tube's top, in the air (× (1 − the throw's
 * progress): 0 as it lands, where it meets the water). Andrew's photo: a thick lip all the way out. */
export const TIP_THICKNESS_RATIO = 0.4;
/** The tip grows its thickness in over this fraction of the throw (at onset the lip has no length, so no thickness). */
export const TIP_GROW_PROGRESS = 0.3;
/** The tube's round back sits this many H ahead of the crest's vertical (Pick & Feddersen Fig. 6b: just ahead of it). */
export const TUBE_BACK_AHEAD_H = 0.03;
/** The lip thins from its thickest (over the tube's top) to its tip as (1 − u)^LIP_TAPER_POWER (plan ruling 4). */
export const LIP_TAPER_POWER = 0.8;
/** Where the lip lands beyond the wave's foot, the face below it rejoins the sheet at least this far past it (m). */
export const FACE_JOIN_MIN_M = 1;
/** Of ψ's fade-in (PSI_NONE to PSI_MIN, over which the tube grows from nothing), the share over which it is also blended in. */
export const PRESENCE_FADE = 0.3;
/** The face's join steps out by this many H (at most FACE_CONCAVE_STEPS times) until the sheet there is flatter than the
 * face's chord by FACE_CONCAVE_MARGIN (rad). */
export const FACE_CONCAVE_STEP_H = 0.15;
export const FACE_CONCAVE_STEPS = 4;
export const FACE_CONCAVE_MARGIN = 0.03;
/** Steps placing that join in the sheet's displaced x. */
export const FACE_JOIN_STEPS = 3;
/** The outer samples' share on the lip's band (the rest run level from the tube's top to the crest). */
export const OUTER_LIP_SHARE = 0.85;
/** The face leaves the landing point toward the tube's lower side this far back along it (ξ). */
export const FACE_DIR_STEP = 0.02;
/** After the collapse ends the ribbon fades out (hands back to the sheet) over this long (s). */
export const HAND_BACK_S = 0.5;
/** The foam from the lip's landing rises over this fraction of the collapse. */
export const LANDING_FOAM_RISE = 0.3;
/** A broken section whose crest stands less than BACK_OFF_DROP_H[1]·H above its foot (it has run into deeper water and
 * the sheet has stopped sharpening it) relaxes back to the sheet, fully by BACK_OFF_DROP_H[0]·H. */
export const BACK_OFF_DROP_H: readonly [number, number] = [0.3, 0.6];

/** The BreakParams the profile reads (breaking.ts documents each). */
export type LipParams = Pick<BreakParams, 'collapseTime' | 'ribbonOnset' | 'faceWidth' | 'troughDrain' | 'delta'>;

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
  /** The crest's ψ (setWaveModel.Crest.psi): the tube's shape. Absent: PSI_NORMAL. */
  psi?: number;
  /** The wind's offshore speed (m/s, overturn.offshoreSpeed): the tube's wind factors. Absent: 0. */
  offshoreMs?: number;
}

/** Everything about one station's profile that does not depend on the sample: computed once per station. */
export interface ProfileFrame {
  /** The crest top on the frame's sheet (u = 0). */
  K: Vec2;
  /** Where the face leaves the sheet (u = uFoot): the wave's foot, or past the landing if the lip lands beyond it; the
   * sheet's direction there, back up toward the crest. */
  F: Vec2;
  tF: Vec2;
  uFoot: number;
  uFront: number;
  uBack: number;
  /** The free fall from the crest top to the landing point (s); the throw's progress t/τ_land in [0, 1]. */
  tauLand: number;
  prog: number;
  /** The constructed curve's share against the sheet: steep × (1 − collapse) × the tube's presence (its first PRESENCE_FADE). */
  weight: number;
  collapse: number;
  /** Landing foam [0, 1]. */
  landing: number;
  /** Ribbon weight ρ [0, 1] (0: the station is dropped). */
  rho: number;
  /** The pile's landing knot (PileLift): the face's join. */
  uLand: number;
  /** The fits' wave height (m): the crest's height above the water the lip lands on (impactHeight). */
  HI: number;
  /** The tube at impact (overturn.overturnShape at HI), and as it stands now (its width grown to W·prog, clipped at P.y). */
  shape: Overturn;
  tube: Tube;
  /** The upper side's top (ξ), the lip's tip now (ξ), where it lands (ξ: 1, or where the water cuts the tube). */
  xiTop: number;
  xiTip: number;
  xiEnd: number;
  /** The lip's thickness over the tube's top, and at its tip now (m). */
  tTop: number;
  tipE: number;
  /** The lip's tip now (on the tube's upper side) and where it lands. */
  tip: Vec2;
  P: Vec2;
  /** The tip's mean speed across (m/s) and how far ahead of the crest it is now (m): the emitters read them. */
  vj: number;
  reach: number;
  /** The whitewater pile's lift under the curl (pileLift): absent, none (the frame's own sheet is the profile's). */
  lift?: PileLift;
}

/**
 * The whitewater pile's lift under the curl, at PILE_LIFT_KNOTS: at each knot the sheet with the pile minus the sheet
 * without it (the frame's), both displaced, keyed by the frame sheet's x. Once the lip lands the pile rises under it (up
 * to ~2.5 m in half a second); the front and back of the profile ride on it (they are the sheet with the pile), so the
 * curl between them rides on it too: otherwise a step stood where the back joins the lip's root, and the risen water
 * folded through the landed tip (Andrew, 2026-09-30). Zero before the pile rises, so the throw is the wave as it stood.
 */
export interface PileLift {
  /** The knots' undisplaced u (the collapse target's lookup, uAtX). */
  u: number[];
  x: number[];
  dx: number[];
  dy: number[];
}
/** The knots' u, as fractions of the frame's: behind the crest, the crest, half way to the nearer of the foot and the
 * landing, that one, the farther, half way to the front edge, the front edge (in order along u, as uAtX reads them). */
export function pileLiftKnots(f: ProfileFrame): number[] {
  const a = Math.min(f.uFoot, f.uLand), b = Math.max(f.uFoot, f.uLand);
  return [f.uBack, 0, 0.5 * a, a, b, 0.5 * (b + f.uFront), f.uFront];
}
export function pileLift(base: (u: number) => Vec2, frameBase: (u: number) => Vec2, f: ProfileFrame): PileLift {
  const out: PileLift = { u: [], x: [], dx: [], dy: [] };
  for (const u of pileLiftKnots(f)) {
    const a = base(u), b = frameBase(u);
    out.u.push(u); out.x.push(b[0]); out.dx.push(a[0] - b[0]); out.dy.push(a[1] - b[1]);
  }
  return out;
}
/** The lift at x: linear between the knots (sorted by x here), constant past the ends. */
export function liftAt(l: PileLift, x: number): Vec2 {
  const order = l.x.map((_, i) => i).sort((a, b) => l.x[a] - l.x[b]);
  const first = order[0], last = order[order.length - 1];
  if (x <= l.x[first]) return [l.dx[first], l.dy[first]];
  if (x >= l.x[last]) return [l.dx[last], l.dy[last]];
  for (let k = 0; k + 1 < order.length; k++) {
    const i = order[k], j = order[k + 1];
    if (x <= l.x[j]) {
      const w = l.x[j] > l.x[i] ? (x - l.x[i]) / (l.x[j] - l.x[i]) : 1;
      return [l.dx[i] + w * (l.dx[j] - l.dx[i]), l.dy[i] + w * (l.dy[j] - l.dy[i])];
    }
  }
  return [l.dx[last], l.dy[last]];
}

/**
 * The u whose sheet (with the pile) stands at x: linear between the knots (by their x on that sheet, x + dx), clamped to
 * the end knots. The collapse target of a curl point: the landed curl sinks straight down into the whitewater under it.
 */
export function uAtX(l: PileLift, x: number): number {
  const n = l.u.length, X = (i: number) => l.x[i] + l.dx[i];
  if (x <= X(0)) return l.u[0];
  for (let i = 0; i + 1 < n; i++) {
    if (x <= X(i + 1)) return X(i + 1) > X(i) ? l.u[i] + ((x - X(i)) / (X(i + 1) - X(i))) * (l.u[i + 1] - l.u[i]) : l.u[i + 1];
  }
  return l.u[n - 1];
}

const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const add2 = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
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
 * The station's frame (spec 2026-09-30-barrel-from-maths §3.2–3.3): the tube at impact from ψ, H and the wind, placed
 * with its round back just ahead of the crest and its top the lip's thickness under it; where the lip lands (the tube's
 * point, or where its upper side first reaches the water in front); the free-fall clock; and the throw's progress, over
 * which the tube's width grows and the tip runs along its upper side (plan rulings 1–5).
 */
export function profileFrame(base: (u: number) => Vec2, input: ProfileInput, lp: LipParams): ProfileFrame {
  const { H, c, r, tb } = input;
  const psi = input.psi ?? PSI_NORMAL, uc = windUC(input.offshoreMs ?? 0, c);
  // The curl collapses on its own crest's drain clock, as the sheet under it does (overturn.withSheetShape at its ψ).
  const p: LipParams = { ...lp, troughDrain: sheetShape(psi).troughDrain };
  // The wave's own foot: where the sheet's front sharpening has sunk to the trough.
  const uFootWave = FOOT_WIDTHS * p.faceWidth * H;
  const K = base(0), F0 = base(uFootWave);
  // Below PSI_MIN the tube fades out (plan ruling 7): it shrinks to nothing at PSI_NONE, and is drawn fainter only over
  // the first PRESENCE_FADE of that, where it is already tiny (a full-size lip half blended into the sheet folded: its two
  // surfaces blend toward different sheet points).
  const HI = impactHeight(base, K, H, psi, uc) * smoothstep(PSI_NONE, PSI_MIN, psi);
  const shape = overturnShape(psi, HI, uc);
  const { d, n } = tubeAxes(shape.theta);
  const at0: Tube = { O: [0, 0], d, n, L: shape.L, W: shape.W, clipY: -Infinity };
  const xiTop = tubeTopXi(at0), top0 = tubeUpper(at0, xiTop);
  const tTop = (shape.AJ * (1 + LIP_TAPER_POWER)) / Math.max(tubeUpperArc(at0, xiTop, 1), 1e-3);
  const O0: Vec2 = [K[0] + TUBE_BACK_AHEAD_H * H - tubeBackMostX(at0), K[1] - tTop - top0[1]];
  // The lip lands on the water (impactHeight sized the tube so its point meets it). A point still hanging over the water
  // drops onto it, the lip over the tube's top thickening by as much (plan ruling 3); one under it lands on the face,
  // which hollows to meet it.
  const point0 = tubeUpper({ ...at0, O: O0 }, 1), under = sheetYAt(base, K, point0[0]);
  const drop = Math.max(0, point0[1] - under);
  const full: Tube = { ...at0, O: [O0[0], O0[1] - drop] };
  const xiEnd = 1;
  const P = tubeUpper(full, xiEnd);
  const tauLand = landingTime(K[1] - P[1]);
  // The face leaves the sheet at the wave's foot, or FACE_JOIN_MIN_M past where the lip lands beyond it (in the sheet's
  // displaced x: over the drained trough the water is drawn back, so u alone put the join behind the landing).
  let uFoot = uFootWave, F = F0;
  if (P[0] > F0[0] - FACE_JOIN_MIN_M) {
    const x = P[0] + FACE_JOIN_MIN_M;
    uFoot += x - F0[0];
    for (let i = 0; i < FACE_JOIN_STEPS; i++) { F = base(uFoot); uFoot += x - F[0]; }
    F = base(uFoot);
  }
  // The face must leave the sheet where the sheet is flatter than the face's chord up to the landing, or it bulges
  // (a lip landing just short of the foot, on the softened ramp): step the join out toward the trough.
  let Fb = base(uFoot - 0.1);
  const ang = (v: Vec2): number => Math.atan2(v[1], -v[0]);
  for (let i = 0; i < FACE_CONCAVE_STEPS && ang([Fb[0] - F[0], Fb[1] - F[1]]) > ang([P[0] - F[0], P[1] - F[1]]) - FACE_CONCAVE_MARGIN; i++) {
    uFoot += FACE_CONCAVE_STEP_H * H; F = base(uFoot); Fb = base(uFoot - 0.1);
  }
  const tF = norm2([Fb[0] - F[0], Fb[1] - F[1]]);
  const t = tb === null ? 0 : Math.min(Math.max(tb, 0), tauLand);
  const prog = t / tauLand;
  const tube: Tube = { ...full, W: shape.W * prog, clipY: P[1] };
  const xiTip = prog * prog * xiEnd;
  const tip = tubeUpper(tube, xiTip);
  // Before the break the constructed curve follows the sheet's sharpening, but only inside the ribbon: the sharpening
  // starts before the ribbon fades in (SHEET_SHARPENING_LEAD), and there the sheet draws it itself.
  const steep = tb === null
    ? steepening(r, p) * smoothstep(p.ribbonOnset, p.ribbonOnset + RIBBON_FULL_OFFSET, r)
    : smoothstep(BACK_OFF_DROP_H[0] * H, BACK_OFF_DROP_H[1] * H, K[1] - F0[1]);
  const span = settleSpan(H, p);
  // The curl collapses as the sheet under it does (breaking.lifecycle, from landingEstimate), but never before its own
  // lip has landed.
  const settleFrom = Math.max(tauLand, landingEstimate(H, p));
  const collapse = tb === null ? 0 : smoothstep(settleFrom, settleFrom + span, tb);
  // No tube (ψ below PSI_NONE), no curl to land: its weight and its landing (foam, settling) fade in together.
  const present = smoothstep(PSI_NONE, PSI_NONE + PRESENCE_FADE * (PSI_MIN - PSI_NONE), psi);
  const landing = tb === null ? 0 : smoothstep(tauLand, tauLand + LANDING_FOAM_RISE * span, tb) * present;
  return {
    K, F, tF, uFoot, uFront: uFoot + LAND_CLEARANCE_M + EDGE_MARGIN_M, uBack: -(BACK_EDGE_H * H + EDGE_MARGIN_M),
    tauLand, prog, weight: steep * (1 - collapse) * present, collapse, landing, rho: ribbonWeight(r, tb, settleFrom, span, p),
    uLand: uFoot, HI, shape, tube, xiTop, xiTip, xiEnd, tTop: tTop + drop, tipE: TIP_THICKNESS_RATIO * (tTop + drop) * (1 - prog) * smoothstep(0, TIP_GROW_PROGRESS, prog), tip, P,
    vj: (P[0] - K[0]) / tauLand, reach: tip[0] - K[0],
  };
}

/** impactHeight's scan (× the wave's H: the first place the tube's point comes down onto the water) and bisections. */
export const IMPACT_SCAN: readonly number[] = [1, 1.25, 1.5, 1.75, 2];
export const IMPACT_BISECT = 10;

/**
 * The fits' wave height H_I for this crest: Pick & Feddersen normalise by the crest's height above the water the jet
 * lands on (their H_I, the maximum elevation over the still water in front of a solitary wave). Here the water in front
 * is drawn down by the drain, 1.2–1.4 H under the crest on a heavy wave, so the sheet's own H sized a tube whose point
 * hung metres above it. Every length of the tube (and the lip's thickness over its top) scales with H_I, so its point
 * runs out along one line from the crest as H_I grows: H_I is where that point first comes down onto the sheet, scanned
 * up over IMPACT_SCAN × H and bisected. A point already under the water at the sheet's H (a steep tube landing on the
 * face: there the wave's own height is the one over the water it lands on) keeps H, and the face hollows to meet it
 * (spec §3.2: the face below the landing point carries the tube's floor on down). Still over the water at 2 H: the
 * sheet's H, and profileFrame drops the tube onto it (plan ruling 3).
 */
export function impactHeight(base: (u: number) => Vec2, K: Vec2, H: number, psi: number, uc: number): number {
  if (!(H > 0)) return H;
  const unit = overturnShape(psi, 1, uc), { d, n } = tubeAxes(unit.theta);
  const t1: Tube = { O: [0, 0], d, n, L: unit.L, W: unit.W, clipY: -Infinity };
  const xiTop = tubeTopXi(t1), top1 = tubeUpper(t1, xiTop), pt1 = tubeUpper(t1, 1);
  const tTop1 = (unit.AJ * (1 + LIP_TAPER_POWER)) / Math.max(tubeUpperArc(t1, xiTop, 1), 1e-9);
  const px = pt1[0] - tubeBackMostX(t1), py = pt1[1] - top1[1] - tTop1, x0 = K[0] + TUBE_BACK_AHEAD_H * H;
  const above = (hi: number): number => K[1] + hi * py - sheetYAt(base, K, x0 + hi * px);
  let lo = -1, hi = -1, prev = above(IMPACT_SCAN[0] * H);
  for (let i = 1; i < IMPACT_SCAN.length && lo < 0; i++) {
    const g = above(IMPACT_SCAN[i] * H);
    if (prev > 0 && g <= 0) { lo = IMPACT_SCAN[i - 1] * H; hi = IMPACT_SCAN[i] * H; }
    prev = g;
  }
  if (lo < 0) return H;
  for (let i = 0; i < IMPACT_BISECT; i++) { const m = (lo + hi) / 2; if (above(m) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** The frame sheet's undisplaced u at x (the sheet is single-valued in x in front of the crest): u from x − K.x, four
 * steps of u += x − base(u).x (base(u) is displaced from u). */
export function sheetUAt(base: (u: number) => Vec2, K: Vec2, x: number): number {
  let u = x - K[0], q = base(u);
  for (let i = 0; i < 4; i++) { u += x - q[0]; q = base(u); }
  return u;
}
/** The frame sheet's height at x: the same four steps, read at the last u. */
export function sheetYAt(base: (u: number) => Vec2, K: Vec2, x: number): number {
  let u = x - K[0], q = base(u);
  for (let i = 0; i < 4; i++) { u += x - q[0]; q = base(u); }
  return q[1];
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

/** The lip's thickness at ξ on its band (the tube's top to its tip): t_top there, the tip's now at the tip, tapering as
 * (1 − u)^LIP_TAPER_POWER between; t_top behind the top; the tip's alone before the tip has reached the top. */
export function lipThicknessAt(f: ProfileFrame, xi: number): number {
  if (f.xiTip <= f.xiTop) return f.tipE;
  if (xi <= f.xiTop) return f.tTop;
  const u = Math.min(1, (xi - f.xiTop) / (f.xiTip - f.xiTop));
  return f.tipE + (f.tTop - f.tipE) * (1 - u) ** LIP_TAPER_POWER;
}

export interface ProfilePoint {
  pos: Vec2;
  /** The lip's thickness here (m); 0 off the lip (segments under, cap, outer carry it). Keys the turquoise glow. */
  thickness: number;
  /**
   * The curl's foam, signed (Andrew's photo, 2026-09-29: white water on the lip as it peels, the tube behind it clean,
   * full foam once it has imploded). > 0: foam of its own, composed with the sheet's by max: the lip's outside whitens as
   * it throws (LIP_SPRAY, most at the tip), and once the lip lands the curl turns to foam (spec D4). < 0: the tube's
   * inside (the face, wall and ceiling under the thrown lip) is clean while the lip is in the air, so the sheet's foam
   * there is hidden by that share.
   */
  curlFoam: number;
  /** 1 on the lip (under, cap, outer), 0 elsewhere: the FFT chop fades out over it (spec R6). */
  lipness: number;
}

/** The throwing lip's outside whitens up to this at its tip (its spray), from LIP_SPRAY_PROGRESS[0] to [1] of the throw… */
export const LIP_SPRAY = 0.6;
export const LIP_SPRAY_PROGRESS: readonly [number, number] = [0.2, 0.7];
/** …from nothing at this fraction of the way from the lip's root to its tip. */
export const LIP_SPRAY_FROM = 0.3;

/** The face's tangent arriving at P (length Lf), going back: see constructed's face. */
function faceArrival(f: ProfileFrame, Lf: number): Vec2 {
  const back = tubeLower(f.tube, f.xiEnd * (1 - FACE_DIR_STEP));
  const dP = norm2([back[0] - f.P[0], back[1] - f.P[1]]);
  // Angles measured going back (toward −x), up positive.
  const ang = (v: Vec2): number => Math.atan2(v[1], -v[0]);
  const aF = ang(f.tF), aC = ang([f.P[0] - f.F[0], f.P[1] - f.F[1]]), aL = ang(dP);
  const a = Math.max(2 * aC - aF, aL);
  return [-Math.cos(a) * Lf, Math.sin(a) * Lf];
}

/** The constructed (unblended) point for sample j, its lip thickness, lipness, and the x its lift is read at. */
function constructed(j: number, f: ProfileFrame, baseHome: Vec2): { pos: Vec2; thickness: number; lipness: number; liftX: number } {
  const { seg, s } = sampleSegment(j);
  const on = (pos: Vec2, thickness = 0, lipness = 0, liftX = pos[0]) => ({ pos, thickness, lipness, liftX });
  switch (seg) {
    case 'front':
    case 'back':
      return on(baseHome);
    case 'face': {
      // From where the face leaves the sheet up to where the lip lands: one concave curve. It arrives along the tube's lower
      // side where that is steeper than the arc mirroring the foot's direction about the chord; else along that arc, and
      // the face meets the tube's floor at the lip's contact point (the Longuet-Higgins floor runs back from its point at
      // the tilt less the cusp's half angle, ~26° in state 4, shallower than the face under it).
      const Lf = Math.hypot(f.P[0] - f.F[0], f.P[1] - f.F[1]);
      return on(hermite(f.F, [f.tF[0] * Lf, f.tF[1] * Lf], f.P, faceArrival(f, Lf), s));
    }
    case 'wall': // the tube's lower side, from where the lip lands back up to its round end
      return on(s === 0 ? f.P : tubeLower(f.tube, f.xiEnd * (1 - s)));
    case 'under': { // the tube's upper side, the lip's underside, from the round end out to the tip
      const xi = s * f.xiTip, pt = tubeUpper(f.tube, xi);
      return on(pt, lipThicknessAt(f, xi), 1, pt[0]);
    }
    case 'cap': { // round the tip, from the underside to the outer surface
      const no = tubeUpperNormal(f.tube, f.xiTip), e = f.tipE;
      const cx = f.tip[0] + (no[0] * e) / 2, cy = f.tip[1] + (no[1] * e) / 2;
      const a = Math.atan2(-no[1], -no[0]) + Math.PI * s;
      return on([cx + (Math.cos(a) * e) / 2, cy + (Math.sin(a) * e) / 2], e, 1, f.tip[0]);
    }
    default: { // outer: the lip's band from the tip back to the tube's top, then level to the crest
      if (f.xiTip > f.xiTop && s <= OUTER_LIP_SHARE) {
        const xi = f.xiTip + (f.xiTop - f.xiTip) * (s / OUTER_LIP_SHARE);
        const u = tubeUpper(f.tube, xi), no = tubeUpperNormal(f.tube, xi), e = lipThicknessAt(f, xi);
        return on([u[0] + no[0] * e, u[1] + no[1] * e], e, 1, u[0]);
      }
      const fromXi = f.xiTip > f.xiTop ? f.xiTop : f.xiTip, e = f.xiTip > f.xiTop ? f.tTop : f.tipE;
      const u = tubeUpper(f.tube, fromXi), no = tubeUpperNormal(f.tube, fromXi), a: Vec2 = [u[0] + no[0] * e, u[1] + no[1] * e];
      const k = f.xiTip > f.xiTop ? (s - OUTER_LIP_SHARE) / (1 - OUTER_LIP_SHARE) : s;
      return on(lerp2(a, f.K, k), e * (1 - k), 1, u[0] + (f.K[0] - u[0]) * k);
    }
  }
}

/**
 * Sample j as it stands while the curl does, riding the whitewater pile (PileLift) up to the crest's own rise: the whole
 * wave's surge lifts the curl, the water in front and the back, and the rest of the mound (the pile standing above the
 * crest's rise, tallest under the tube and at its foot) fills in as the curl collapses (profilePoint's settling onto the
 * sheet). The front and back are the sheet less that rest, so they join the curl at every stage and are the sheet
 * exactly where the pile rises no more than the crest (at the edges). Andrew, 2026-09-30: under the curl, the whitewater
 * mound rises with the collapse. Lifting the curl by the whole pile stood a horn over the wave; the floor lifted by it
 * humped and pocketed, and by +0.75 s the pile at the foot stood as tall as the crest, through the standing tube.
 *
 * The lip's surfaces take the lift at the tube's upper side's x (liftX), so the thin lip is lifted whole, never sheared
 * through itself; the floor (the face) runs evenly from its foot's lift to the landing's.
 */
/** The front and back are lowered where the pile stands above the crest's own rise, easing in over this share of their
 * samples from the edge, so that the edges stay the sheet (the pile included) and stitch to it. */
export const EDGE_LOWER_FADE = 0.25;

function riding(j: number, f: ProfileFrame, c: { pos: Vec2; liftX: number }): Vec2 {
  if (!f.lift) return c.pos;
  const { seg, s } = sampleSegment(j);
  const crest = liftAt(f.lift, f.K[0])[1];
  const capped = (x: number): Vec2 => { const l = liftAt(f.lift!, x); return [l[0], Math.min(l[1], crest)]; };
  if (seg === 'front' || seg === 'back') {
    const k = smoothstep(0, EDGE_LOWER_FADE, seg === 'front' ? s : 1 - s);
    return [c.pos[0], c.pos[1] - k * Math.max(0, liftAt(f.lift, c.pos[0])[1] - crest)];
  }
  if (seg === 'face') return add2(c.pos, lerp2(capped(f.F[0]), capped(f.P[0]), s));
  return add2(c.pos, capped(c.liftX));
}

/** Over this part of the collapse the curl's settling point slides along the sheet from under it back to its home. */
export const HOME_SETTLE: readonly [number, number] = [0.8, 1];

/**
 * The u where sample j settles as the curl collapses: its home before the lip lands; once it lands, blending in with the
 * landing foam, the sheet straight under the point (uAtX), so the landed tip stays in the water it landed in and the curl
 * sinks into the whitewater. Settling to the homes drew the tip back up through the air toward the crest (Andrew,
 * 2026-09-30, normal +0.5 s). At the end of the collapse (HOME_SETTLE, the curl nearly flat on the sheet) it slides back
 * to the home, so the settled ribbon is the sheet at its own homes, as the hand-back needs.
 */
export function sampleTarget(j: number, f: ProfileFrame): number {
  const home = sampleHome(j, f), { seg } = sampleSegment(j);
  const w = f.landing * (1 - smoothstep(HOME_SETTLE[0], HOME_SETTLE[1], f.collapse));
  if (seg === 'front' || seg === 'back' || !f.lift || w <= 0) return home;
  const p = riding(j, f, constructed(j, f, [0, 0]));
  return home + (uAtX(f.lift, p[0]) - home) * w;
}

/** Sample j of the profile, given its frame and the base where it settles (base(sampleTarget(j, f))). */
export function profilePoint(j: number, f: ProfileFrame, baseHome: Vec2): ProfilePoint {
  const c = constructed(j, f, baseHome);
  const { seg, s } = sampleSegment(j);
  // Landing foam: the curl (wall, lip) and the front out to just past where the lip lands.
  const home = sampleHome(j, f);
  const landAt = f.P[0];
  const region = seg === 'back' ? 0 : seg === 'front' ? 1 - smoothstep(landAt, landAt + 1.5, home) : seg === 'face' ? 0.5 : 1;
  const landed = f.landing * region;
  // In the air: the outside's spray (by σ, the tube's top 0 to the tip 1; the cap is the tip), and the tube's inside clean.
  const sigma = seg === 'outer' ? (f.xiTip > 0 ? Math.max(0, Math.min(1, 1 - s / OUTER_LIP_SHARE)) : 0) : seg === 'cap' ? 1 : 0;
  const spray = LIP_SPRAY * smoothstep(LIP_SPRAY_PROGRESS[0], LIP_SPRAY_PROGRESS[1], f.prog) * smoothstep(LIP_SPRAY_FROM, 1, sigma);
  const air = f.weight * (1 - f.landing);
  const curlFoam = seg === 'outer' || seg === 'cap' ? Math.max(landed, spray * air)
    : seg === 'face' || seg === 'wall' || seg === 'under' ? landed - air
      : landed;
  const lifted = riding(j, f, c);
  return { pos: lerp2(baseHome, lifted, f.weight), thickness: c.thickness * f.weight, curlFoam, lipness: c.lipness * f.weight };
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
  frame.lift = pileLift(base, frameBase, frame);
  const out: Profile = { frame, points: [], homes: [], thickness: [], curlFoam: [], lipness: [] };
  for (let j = 0; j < PROFILE_SAMPLES; j++) {
    const home = sampleHome(j, frame);
    const pt = profilePoint(j, frame, base(sampleTarget(j, frame)));
    out.points.push(pt.pos); out.homes.push(home); out.thickness.push(pt.thickness); out.curlFoam.push(pt.curlFoam); out.lipness.push(pt.lipness);
  }
  return out;
}

/** The tube's measurements off a profile at the lip's landing (tests): its area (the wall and underside samples, closed),
 * width ÷ length and tilt about its farthest point from where the lip lands, and the lip's band area. */
export function tubeMetrics(p: Profile): { area: number; aspect: number; tiltDeg: number; lipArea: number } {
  const n = PROFILE_SEGMENTS, w0 = n.front + n.face, u0 = w0 + n.wall, c0 = u0 + n.under, o0 = c0 + n.cap;
  const shoelace = (q: readonly Vec2[]): number => { let a = 0; for (let i = 0; i < q.length; i++) { const x = q[i], y = q[(i + 1) % q.length]; a += x[0] * y[1] - y[0] * x[1]; } return Math.abs(a) / 2; };
  const tube = p.points.slice(w0, c0), P = p.frame.P;
  let far = tube[0], best = -1;
  for (const q of tube) { const d = Math.hypot(q[0] - P[0], q[1] - P[1]); if (d > best) { best = d; far = q; } }
  const ax: Vec2 = norm2([far[0] - P[0], far[1] - P[1]]), across: Vec2 = [-ax[1], ax[0]];
  const w = tube.map((q) => (q[0] - P[0]) * across[0] + (q[1] - P[1]) * across[1]);
  // The lip's band: its underside from over the tube's top out to the tip, then its outer surface from the tip back.
  const fromTop = Math.ceil((n.under * p.frame.xiTop) / Math.max(p.frame.xiTip, 1e-9));
  const band = [...p.points.slice(u0 + Math.min(fromTop, n.under - 1), c0), ...p.points.slice(o0, o0 + Math.round(n.outer * OUTER_LIP_SHARE) + 1)];
  return { area: shoelace(tube), aspect: (Math.max(...w) - Math.min(...w)) / best, tiltDeg: (Math.atan2(ax[1], -ax[0]) * 180) / Math.PI, lipArea: shoelace(band) };
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

/**
 * How deep the polyline folds through itself (m): over every pair of non-adjacent segments that cross, the least distance
 * any of their four ends lies from the other's line, the largest such. A tip grazing the water it lies on as it collapses
 * folds by millimetres; the landed tip in the risen water folded by ~0.3 m and the crest step stood ~2.5 m (Andrew's
 * circles, 2026-09-30). Test helper.
 */
export function foldDepth(pts: readonly Vec2[]): number {
  const off = (p: Vec2, a: Vec2, b: Vec2) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L; };
  let worst = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    for (let j = i + 2; j + 1 < pts.length; j++) {
      const [a, b, c, d] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
      if (crossings([a, b, c, d]) === 0) continue; // segments a→b and c→d (b→c is only a joiner here)
      worst = Math.max(worst, Math.min(off(c, a, b), off(d, a, b), off(a, c, d), off(b, c, d)));
    }
  }
  return worst;
}
