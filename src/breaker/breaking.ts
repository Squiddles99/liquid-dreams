import { smoothstep } from '../math/smoothstep';

/**
 * How a set wave breaks (Phase 2 spec §3). The source of truth for the shape: setWaveModel applies it per wave and
 * point, and SetWaves mirrors it term by term in TSL (breakingNodes.ts). Every length is scaled by the local wave
 * height H, so the shape is the same at every size.
 */
export interface BreakParams {
  /** false: the Phase 1 surface exactly (the panel's "breaking" toggle). */
  enabled: boolean;
  /** γ, the breaker index: the wave breaks where H ≥ γ·h_eff. */
  gamma: number;
  /** δ, the drain in the criterion: the crest feels the depth hmin − δ·H. */
  delta: number;
  /** Floor on that drained depth (m). */
  hFloorM: number;
  /** Δ, the stage span: s = smoothstep(1, 1 + Δ, ρ), the wave Δ × its breaking height taller than it. */
  stageSpan: number;
  /** The visible drain: the trough ahead of the face drops by troughDrain·δ·H. */
  troughDrain: number;
  /** β: a collapsed wave settles to a bore of height β·hmin. */
  beta: number;
  /** The sheet's steepened front face spans this much, crest to foot (× H). */
  faceWidth: number;
  /** The drain ramps from the front sharpening's start to ρ = 1 + drainEnd·Δ (it begins as the wave stands up, before
   * it breaks); the wave settles to its bore from ρ = 1 + collapseStart·Δ to 1 + COLLAPSE_END·Δ. */
  drainEnd: number;
  collapseStart: number;
  /** The lip leaves the crest at throwStrength × crest speed (relative to the wave), floored so it lands clear of the face. */
  throwStrength: number;
  /** The lip's thickness at its root (× H). */
  lipThickness: number;
  /** The curl collapses over collapseTime × τ_land after the lip lands. */
  collapseTime: number;
  /** The ribbon fades in from this breaking ratio, full at ribbonOnset + RIBBON_FULL_OFFSET; the sheet's front sharpening
   * ramps from there to ρ = 1. */
  ribbonOnset: number;
}

export const DEFAULT_BREAK_PARAMS: BreakParams = {
  enabled: true,
  gamma: 0.78,
  delta: 1.0,
  hFloorM: 0.3,
  stageSpan: 0.7,
  troughDrain: 0.35,
  beta: 0.4,
  faceWidth: 0.5,
  drainEnd: 0.4,
  collapseStart: 0.5,
  throwStrength: 0.55,
  lipThickness: 0.12,
  collapseTime: 1.8,
  ribbonOnset: 0.7,
};

/** Foam starts once the collapse has run this far (s ≈ 0.64 at the defaults): the lip has landed. */
export const FOAM_ONSET_COLLAPSE = 0.2;
/** From this collapse on the foam's front edge moves off the crest and down the bore's face (the tube is gone). */
export const FOAM_SETTLE_COLLAPSE = 0.6;

/** The collapsed wave's foam is dense to this many H behind the crest… */
export const FOAM_DENSE_BEHIND_H = 1;
/** …and gone this many H behind it (foamWeight). */
export const FOAM_TRAIL_H = 3;

/** smoothstep(1, 1, r) is undefined, so the stage span never goes below this. */
export const MIN_STAGE_SPAN = 0.05;
/** Waves lower than this (m) never break (the shape's H-scaled smoothsteps would divide by ~0). */
export const MIN_BREAKING_HEIGHT_M = 1e-3;
/**
 * The ribbon is full this far (in breaking ratio) above its onset, and the sheet's front sharpening starts there. Below
 * the sharpening the ribbon draws the sheet itself, so its fade-in only needs to be short; and the onset (0.7) sits
 * above the deep water's ρ at 6.6 ft (~0.68), so the ribbon covers the reef's sections, not every crest in the set
 * (110 stations instead of 421 at 6.6 ft; each is a 160-sample cross-section through five compute passes).
 */
export const RIBBON_FULL_OFFSET = 0.05;
/**
 * The front sharpening always ramps over at least this much breaking ratio below ρ = 1. The ribbon onset's slider top
 * (0.9) puts ribbonOnset + RIBBON_FULL_OFFSET at 1.05, past ρ = 1: the ramp would run backwards (and on the GPU,
 * smoothstep with its edges reversed is undefined), so its start is floored at 1 − this.
 */
export const MIN_STEEPENING_SPAN = 0.05;

const clampTo = (v: number, lo: number, hi: number, fallback: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Keeps a BreakParams usable, in place: every value finite and in range. */
export function normalizeBreakParams(p: BreakParams): void {
  const d = DEFAULT_BREAK_PARAMS;
  p.enabled = typeof p.enabled === 'boolean' ? p.enabled : d.enabled;
  p.gamma = clampTo(p.gamma, 0.3, 1.5, d.gamma);
  p.delta = clampTo(p.delta, 0, 2, d.delta);
  p.hFloorM = clampTo(p.hFloorM, 0.05, 2, d.hFloorM);
  p.stageSpan = clampTo(p.stageSpan, MIN_STAGE_SPAN, 10, d.stageSpan);
  p.troughDrain = clampTo(p.troughDrain, 0, 1, d.troughDrain);
  p.beta = clampTo(p.beta, 0.05, 1, d.beta);
  p.faceWidth = clampTo(p.faceWidth, 0.1, 3, d.faceWidth);
  p.drainEnd = clampTo(p.drainEnd, 0.01, 1, d.drainEnd);
  p.collapseStart = clampTo(p.collapseStart, 0, 0.95, d.collapseStart);
  p.throwStrength = clampTo(p.throwStrength, 0.1, 1.5, d.throwStrength);
  p.lipThickness = clampTo(p.lipThickness, 0.03, 0.3, d.lipThickness);
  p.collapseTime = clampTo(p.collapseTime, 0.3, 3, d.collapseTime);
  p.ribbonOnset = clampTo(p.ribbonOnset, 0.3, 0.9, d.ribbonOnset);
}

/**
 * The criterion's depth is hmin up to REEF_TOP_DEPTH_M and deepens beyond it as hmin·(hmin/REEF_TOP_DEPTH_M)^
 * DEEP_WATER_EXPONENT (breakingDepth). The δ drain in the criterion is water sucked off the reef top in front of the
 * wave: over the reef (6 m) a wave breaks at 0.44 × depth, but over the 13 m shelf there is no drain, and with the same
 * rule a 9.9 ft set wave (~6 m) broke across the whole shelf (ρ 1.04) before it reached the reef, and every big crest
 * stood up out there. Deepened, the shelf reads 21 m: a wave breaks there at ~0.72 × depth (9.3 m), so nothing short of
 * the slider's top stands up on it. It is a pure function of hmin (no sliders), so the field bakes it in before its
 * along-crest smoothing, and the reef-to-shelf change reaches the crest as smoothly as the rest of the breaking.
 */
export const REEF_TOP_DEPTH_M = 7;
export const DEEP_WATER_EXPONENT = 0.8;
/**
 * Water shallower than this (m) counts as this deep: a wave is long broken there, and the reef flat's ratio (hmin
 * 0.6 m, ten times the ledge's) otherwise dominates the field's smoothing around it and drags the break seaward.
 */
export const SHALLOW_BREAKING_DEPTH_M = 3;

/** The depth the breaking criterion reads for minimum depth hmin (m): hmin on the reef (at least 3 m), deeper over deep water. */
export function breakingDepth(hmin: number): number {
  return Math.max(hmin, SHALLOW_BREAKING_DEPTH_M) * Math.max(1, hmin / REEF_TOP_DEPTH_M) ** DEEP_WATER_EXPONENT;
}

/**
 * The height (m) at which a wave breaks over minimum depth hmin: the root of H = γ·max(hmin − δ·H, h_floor), the crest
 * feeling the depth drained by δ·H. Where the drained depth is still above the floor there, H_b = γ·hmin / (1 + γδ);
 * else the floor holds and H_b = γ·h_floor. Together: γ·max(hmin / (1 + γδ), h_floor).
 */
export function breakingHeight(hmin: number, p: BreakParams): number {
  return p.gamma * Math.max(hmin / (1 + p.gamma * p.delta), p.hFloorM);
}

/**
 * ρ = H / breakingHeight(hmin): how many times its breaking height the crest is; it breaks where ρ ≥ 1. H is the
 * uncapped crest height (m). Linear in H and in amp/hmin (above the floor), so the windows it drives (the front
 * sharpening, the stage, the drain and the collapse) keep their widths along the crest. The old ratio
 * H / (γ·max(hmin − δ·H, h_floor)) crossed 1 at the same place but grew without bound as hmin − δ·H neared the floor,
 * squeezing the drain into 1–2 m of crest and the collapse into under a metre (square-walled channels, a right-angled
 * break).
 */
export function breakingRatio(H: number, hmin: number, p: BreakParams): number {
  if (!(H > 0)) return 0;
  return H / breakingHeight(hmin, p);
}

/**
 * The wave height (m) above which a point with amplification `amp` and minimum depth `hmin` breaks: ρ(height·amp, hmin)
 * > 1 exactly when height > this (P2: the criterion's H is uncapped). Infinity where amp ≤ 0. ρ is proportional to the
 * height (ρ(λ·height) = λ·ρ(height)), grows with amp and falls as hmin grows, so the threshold of a region's largest amp
 * and smallest hmin bounds every point interpolated from it from below.
 */
export function breakingHeightThreshold(amp: number, hmin: number, p: BreakParams): number {
  if (!(amp > 0)) return Infinity;
  return breakingHeight(hmin, p) / amp;
}

/** The breaking stage s ∈ [0, 1]: 0 until ρ = 1, 1 from ρ = 1 + Δ. */
export function breakingStage(r: number, p: BreakParams): number {
  if (!(r > 1)) return 0;
  return smoothstep(1, 1 + Math.max(p.stageSpan, MIN_STAGE_SPAN), r);
}

/**
 * The sheet's front sharpening starts this much breaking ratio before the ribbon is full (at ρ 0.65 by default, the
 * ribbon fading in over 0.7–0.75). Up to there the sharpening is mild (a fifth of full at the ribbon's full ratio), and
 * the sheet draws it itself; the wider window keeps its ramp along the crest over about a wave height at 9.9 ft, where
 * the reef-to-shelf change in ρ is largest, without the ribbon redrawing the shelf's crests.
 */
export const SHEET_SHARPENING_LEAD = 0.1;

/** The breaking ratio from which the sheet's front sharpening ramps up: ribbonOnset + RIBBON_FULL_OFFSET − SHEET_SHARPENING_LEAD, kept below 1. */
export function steepeningStart(p: Pick<BreakParams, 'ribbonOnset'>): number {
  return Math.min(p.ribbonOnset + RIBBON_FULL_OFFSET - SHEET_SHARPENING_LEAD, 1 - MIN_STEEPENING_SPAN);
}

/** The front sharpening's weight: 0 below steepeningStart, 1 from ρ = 1. */
export function steepening(r: number, p: Pick<BreakParams, 'ribbonOnset'>): number {
  return smoothstep(steepeningStart(p), 1, r);
}

export interface StageCurves {
  drain: number;
  collapse: number;
}

/**
 * The collapse (the wave settling to its bore) is complete at ρ = 1 + COLLAPSE_END·Δ: well after the tube has closed
 * (s = 0.75 at ρ ≈ 1 + 0.66·Δ), as the whitewater runs on over the shallower reef. Settling by the stage's end (ρ = 1 +
 * Δ) dropped a broken section to its bore within half a second of breaking, lower than the unbroken wave either side of
 * it: a sunken, square-sided bowl. Whitewater stays nearly as tall as the wave that made it and settles over the reef.
 */
export const COLLAPSE_END = 2.5;

/** Where the drain is full: ρ = 1 + drainEnd·Δ (Δ floored as breakingStage floors it). */
export function drainFullRatio(p: BreakParams): number {
  return 1 + p.drainEnd * Math.max(p.stageSpan, MIN_STAGE_SPAN);
}

/**
 * The drain and the collapse for a crest at breaking ratio r. The drain ramps from the front sharpening's start
 * (steepeningStart) to drainFullRatio: the reef starts draining as the wave stands up, so the drained hollow fades in
 * along the crest over the whole steepening, not over the few metres where the stage first rises. The collapse runs from
 * ρ = 1 + collapseStart·Δ to 1 + COLLAPSE_END·Δ (see COLLAPSE_END).
 */
export function stageCurves(r: number, p: BreakParams): StageCurves {
  const span = Math.max(p.stageSpan, MIN_STAGE_SPAN);
  return {
    drain: smoothstep(steepeningStart(p), drainFullRatio(p), r),
    collapse: smoothstep(1 + p.collapseStart * span, 1 + COLLAPSE_END * span, r),
  };
}

/** d/dx of smoothstep(e0, e1, x) (either edge order, as smoothstep): 0 outside the ramp. */
function smoothstepSlope(e0: number, e1: number, x: number): number {
  const t = (x - e0) / (e1 - e0);
  return t > 0 && t < 1 ? (6 * t * (1 - t)) / (e1 - e0) : 0;
}

/**
 * The face steepening: how far to lower a point ahead of the crest to sharpen it into a peak. `ahead` is its
 * along-travel position relative to the crest (m), `eta` its height and etaCrest the crest's. Within faceWidth·H ahead
 * the profile stays near the crest height; beyond, it sinks toward the trough level etaCrest − H, fading back to the
 * unbroken wave by half a wavelength. Behind the crest nothing changes (the back of the wave is its unbroken back).
 * Only heights change, so nothing folds and the height probe's horizontal search is unaffected.
 */
export function sharpenDrop(ahead: number, eta: number, etaCrest: number, H: number, k: number, steep: number, p: BreakParams): number {
  if (!(steep > 0) || !(H > 0) || ahead < 0) return 0;
  const width = p.faceWidth * H;
  const quarter = Math.PI / (2 * k);
  const sink = 1 - Math.exp(-((ahead / width) ** 2));
  return steep * sink * smoothstep(2 * quarter, quarter, ahead) * Math.max(eta - (etaCrest - H), 0);
}

/**
 * ∂sharpenDrop/∂ahead at a fixed crest, where `slope` is ∂eta/∂ahead. With sink = 1 − exp(−(a/w)²), fade =
 * smoothstep(2q, q, a) and m = max(η − (η_c − H), 0): steep·(sink′·fade·m + sink·fade′·m + sink·fade·m′), m′ = slope
 * where m > 0. 0 behind the crest, and continuous at it: sink and sink′ both vanish at a = 0.
 */
export function sharpenDropSlope(ahead: number, eta: number, slope: number, etaCrest: number, H: number, k: number, steep: number, p: BreakParams): number {
  if (!(steep > 0) || !(H > 0) || ahead < 0) return 0;
  const width = p.faceWidth * H;
  const quarter = Math.PI / (2 * k);
  const g = Math.exp(-((ahead / width) ** 2));
  const sink = 1 - g, dSink = (2 * ahead * g) / (width * width);
  const fade = smoothstep(2 * quarter, quarter, ahead), dFade = smoothstepSlope(2 * quarter, quarter, ahead);
  const above = eta - (etaCrest - H);
  const m = Math.max(above, 0), dM = above > 0 ? slope : 0;
  return steep * (dSink * fade * m + sink * dFade * m + sink * fade * dM);
}

/** How far the trough ahead of the face has dropped (m, ≥ 0) at drain progress `drain` ∈ [0, 1]. */
export function drainDepth(H: number, drain: number, p: BreakParams): number {
  return p.troughDrain * p.delta * H * drain;
}

/** The drain's hollow fades ahead over a Gaussian this many quarter wavelengths wide. */
export const HOLLOW_REACH_Q = 0.5;

/**
 * Where the drain acts: a hollow at the foot of the face. 0 at the crest, full from about two face widths ahead (the
 * front sharpening's sink), fading back over HOLLOW_REACH_Q quarter wavelengths, and gone by half a wavelength ahead
 * (θ ≤ −π; θ < 0 is ahead), so a point far ahead whose crest lookup landed on another crest is never drained. It used
 * to be a plateau a quarter wavelength across (θ ∈ [−π/2, −π/4], 15–31 m ahead at 15 s): a flat-bottomed channel.
 * `ahead` is metres ahead of the crest, H the local height and k the crest's wavenumber.
 */
export function drainShape(ahead: number, theta: number, H: number, k: number, p: BreakParams): number {
  if (!(ahead > 0) || !(H > 0)) return 0;
  const width = p.faceWidth * H, reach = (HOLLOW_REACH_Q * Math.PI) / (2 * k);
  return (1 - Math.exp(-((ahead / width) ** 2))) * Math.exp(-((ahead / reach) ** 2)) * smoothstep(-Math.PI, -Math.PI / 2, theta);
}

/** ∂drainShape/∂ahead at a fixed crest, where dThetaDAhead is ∂θ/∂ahead. 0 behind the crest, continuous at it. */
export function drainShapeSlope(ahead: number, theta: number, dThetaDAhead: number, H: number, k: number, p: BreakParams): number {
  if (!(ahead > 0) || !(H > 0)) return 0;
  const width = p.faceWidth * H, reach = (HOLLOW_REACH_Q * Math.PI) / (2 * k);
  const g = Math.exp(-((ahead / width) ** 2)), sink = 1 - g, dSink = (2 * ahead * g) / (width * width);
  const decay = Math.exp(-((ahead / reach) ** 2)), dDecay = ((-2 * ahead) / (reach * reach)) * decay;
  const past = smoothstep(-Math.PI, -Math.PI / 2, theta), dPast = smoothstepSlope(-Math.PI, -Math.PI / 2, theta) * dThetaDAhead;
  return (dSink * decay + sink * dDecay) * past + sink * decay * dPast;
}

/** The bore a collapsed wave settles to (m). */
export function boreHeight(hmin: number, p: BreakParams): number {
  return p.beta * Math.max(hmin, 0);
}

/** Height scale during the collapse: 1 until the lip lands, then toward boreHeight / H. Never grows a wave. */
export function boreScale(H: number, hmin: number, collapse: number, p: BreakParams): number {
  if (!(H > 0)) return 1;
  return 1 + (Math.min(1, boreHeight(hmin, p) / H) - 1) * collapse;
}

/**
 * Whitewater placeholder: only once the lip has landed, and only on the collapsed surface at and behind the crest. It
 * rises over the collapse from FOAM_ONSET_COLLAPSE, is dense at the bore's front and down to FOAM_DENSE_BEHIND_H·H
 * behind the crest, and has faded out by FOAM_TRAIL_H·H behind it (and never beyond half a wavelength, θ > 0 behind).
 * Its front edge sits just behind the crest while the tube is still open, so the tube's inside (the face ahead of the
 * crest) stays clear, and moves down the bore's face once the lip lies flat (FOAM_SETTLE_COLLAPSE on). `ahead` is the
 * along-travel distance from the crest (m), H the local height and env the envelope × lateral taper. (It used to trail
 * half a wavelength, ≈ 55 m at 15 s, at weight ~1: seen from behind, its thresholded gaps were the hard-edged
 * turquoise patches.)
 */
export function foamWeight(theta: number, ahead: number, H: number, env: number, c: StageCurves, p: BreakParams): number {
  const land = smoothstep(FOAM_ONSET_COLLAPSE, 1, c.collapse);
  if (!(land > 0) || !(H > 0)) return 0;
  const edge = 0.5 * p.faceWidth * H;
  const reach = 2 * edge * smoothstep(FOAM_SETTLE_COLLAPSE, 1, c.collapse);
  const front = 1 - smoothstep(reach - edge, reach, ahead);
  const trail = (1 - smoothstep(Math.PI / 2, Math.PI, theta)) * (1 - smoothstep(FOAM_DENSE_BEHIND_H * H, FOAM_TRAIL_H * H, -ahead));
  return land * env * front * trail;
}

/** Crest to drained trough (m) of a wave of local height H at breaking ratio r: the calibration readout (spec §3.7). */
export function faceHeight(H: number, r: number, p: BreakParams): number {
  return H + drainDepth(H, stageCurves(r, p).drain, p);
}

/**
 * One wave at one point, in the vertical plane along its travel (see setWaveModel.waveAtCrest). The derivatives are per
 * metre of the displaced surface along travel (Phase 1's Jacobian applied), which is per metre of `ahead` at a fixed
 * crest: ahead is the point's displaced position relative to the crest's.
 */
export interface BreakPointInput {
  /** The Phase 1 phase ω·ξ; negative ahead of the crest. */
  theta: number;
  /** Envelope × lateral taper at the point. */
  env: number;
  /** Along-travel position relative to the crest's undisplaced spot: distance ahead (negative behind) plus the Phase 1
   * horizontal displacement (m). */
  uUnbroken: number;
  /** The Phase 1 height (m). */
  eta: number;
  /** Where the crest itself sits after its Phase 1 displacement (pitch × crest height). */
  uCrest: number;
  /** The crest's height here: A·lateral·(1 + B). */
  etaCrest: number;
  /** Local wave height including the lateral taper: 2·A·lateral. */
  H: number;
  k: number;
  hmin: number;
  /** ∂eta/∂ahead: the Phase 1 slope along travel. */
  slope: number;
  /** ∂theta/∂ahead. */
  dThetaDAhead: number;
  /** ∂env/∂ahead. */
  dEnvDAhead: number;
  /**
   * The crest lookup's confidence (setWaveModel.Crest.confidence): 1 where it found the crest, 0 where the point is too
   * far from it for two half-wavelength steps (more than about a wavelength). The front sharpening scales with it: its
   * drop is not scaled by the envelope, so from an unfound "crest" a wave several periods away would sink the sheet.
   * Treated as constant along ahead (it is 1 wherever the sharpening is meant to act, within half a wavelength ahead).
   */
  crestConfidence: number;
}

export interface BreakPointResult {
  /** The final height (replaces the Phase 1 height). */
  eta: number;
  foam: number;
  /** ∂(eta − the Phase 1 height)/∂ahead: what breaking adds to the Phase 1 slope along travel. */
  dEtaDAhead: number;
}

/**
 * Breaking at one point, for a crest with breaking ratio r and stage s: the front sharpening (by steepening(r) × the
 * crest lookup's confidence, before and through the break), the drain and the bore. Neither steepening nor breaking (or H too small) returns the Phase 1
 * point exactly. With D the sharpening, R = drainDepth·drainShape(θ)·env the drain and S the bore scale (constant along
 * the cross-section), eta = (η − D − R)·S, and what breaking adds is eta − η = η·(S − 1) − (D + R)·S, differentiated
 * term by term along ahead.
 */
export function breakPoint(i: BreakPointInput, s: number, r: number, p: BreakParams): BreakPointResult {
  const steep = steepening(r, p);
  if (!(steep > 0 || s > 0) || !(i.H > MIN_BREAKING_HEIGHT_M)) return { eta: i.eta, foam: 0, dEtaDAhead: 0 };
  const c = stageCurves(r, p);
  const ahead = i.uUnbroken - i.uCrest;
  const sharpen = steep * i.crestConfidence;
  const drop = sharpenDrop(ahead, i.eta, i.etaCrest, i.H, i.k, sharpen, p);
  const dDrop = sharpenDropSlope(ahead, i.eta, i.slope, i.etaCrest, i.H, i.k, sharpen, p);
  const depth = drainDepth(i.H, c.drain, p);
  const shape = drainShape(ahead, i.theta, i.H, i.k, p);
  const drain = depth * shape * i.env;
  const dDrain = depth * (drainShapeSlope(ahead, i.theta, i.dThetaDAhead, i.H, i.k, p) * i.env + shape * i.dEnvDAhead);
  const scale = boreScale(i.H, i.hmin, c.collapse, p);
  return {
    eta: (i.eta - drop - drain) * scale,
    foam: foamWeight(i.theta, ahead, i.H, i.env, c, p),
    dEtaDAhead: i.slope * (scale - 1) - (dDrop + dDrain) * scale,
  };
}
