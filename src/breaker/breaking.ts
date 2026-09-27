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
  /** Δ, the stage span: s = smoothstep(1, 1 + Δ, r). */
  stageSpan: number;
  /** The visible drain: the trough ahead of the face drops by troughDrain·δ·H. */
  troughDrain: number;
  /** β: a collapsed wave settles to a bore of height β·hmin. */
  beta: number;
  /** The sheet's steepened front face spans this much, crest to foot (× H). */
  faceWidth: number;
  /** Stage windows: the drain ramps over [0, drainEnd] and the wave collapses over [collapseStart, 1]. */
  drainEnd: number;
  collapseStart: number;
  /** The lip leaves the crest at throwStrength × crest speed (relative to the wave), floored so it lands clear of the face. */
  throwStrength: number;
  /** The lip's thickness at its root (× H). */
  lipThickness: number;
  /** The curl collapses over collapseTime × τ_land after the lip lands. */
  collapseTime: number;
  /** The ribbon fades in from this breaking ratio, full at ribbonOnset + RIBBON_FULL_OFFSET; the sheet's front sharpening
   * ramps from there to r = 1. */
  ribbonOnset: number;
}

export const DEFAULT_BREAK_PARAMS: BreakParams = {
  enabled: true,
  gamma: 0.78,
  delta: 1.0,
  hFloorM: 0.3,
  stageSpan: 1.0,
  troughDrain: 0.35,
  beta: 0.4,
  faceWidth: 0.5,
  drainEnd: 0.25,
  collapseStart: 0.75,
  throwStrength: 0.55,
  lipThickness: 0.12,
  collapseTime: 1.0,
  ribbonOnset: 0.5,
};

/** Foam starts once the collapse has run this far (s ≈ 0.82 at the defaults): the lip has landed. */
export const FOAM_ONSET_COLLAPSE = 0.2;
/** From this collapse on the foam's front edge moves off the crest and down the bore's face (the tube is gone). */
export const FOAM_SETTLE_COLLAPSE = 0.6;

/** smoothstep(1, 1, r) is undefined, so the stage span never goes below this. */
export const MIN_STAGE_SPAN = 0.05;
/** Waves lower than this (m) never break (the shape's H-scaled smoothsteps would divide by ~0). */
export const MIN_BREAKING_HEIGHT_M = 1e-3;
/** The ribbon is full this far (in breaking ratio) above its onset, and the sheet's front sharpening starts there. */
export const RIBBON_FULL_OFFSET = 0.2;
/**
 * The front sharpening always ramps over at least this much breaking ratio below r = 1. The ribbon onset's slider top
 * (0.9) puts ribbonOnset + RIBBON_FULL_OFFSET at 1.1, past r = 1: the ramp would run backwards (and on the GPU,
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

/** r = H / (γ·max(hmin − δ·H, h_floor)): the wave breaks where r ≥ 1. H is the uncapped crest height (m). */
export function breakingRatio(H: number, hmin: number, p: BreakParams): number {
  if (!(H > 0)) return 0;
  return H / (p.gamma * Math.max(hmin - p.delta * H, p.hFloorM));
}

/**
 * The wave height (m) above which a point with amplification `amp` and minimum depth `hmin` breaks: r(height·amp, hmin)
 * > 1 exactly when height > this (P2: the criterion's H is uncapped). Infinity where amp ≤ 0. r grows with the height
 * and with amp and falls as hmin grows, so the threshold of a region's largest amp and smallest hmin bounds every point
 * interpolated from it from below.
 */
export function breakingHeightThreshold(amp: number, hmin: number, p: BreakParams): number {
  if (!(amp > 0)) return Infinity;
  const gd = 1 + p.gamma * p.delta;
  // Where the drained depth hmin − δ·H is still above the floor at the root, r = 1 at H = γ·hmin / (1 + γδ); else the
  // floor holds there and r = 1 at H = γ·h_floor.
  return (hmin / gd >= p.hFloorM ? (p.gamma * hmin) / gd : p.gamma * p.hFloorM) / amp;
}

/** The breaking stage s ∈ [0, 1]: 0 until r = 1, 1 from r = 1 + Δ. */
export function breakingStage(r: number, p: BreakParams): number {
  if (!(r > 1)) return 0;
  return smoothstep(1, 1 + Math.max(p.stageSpan, MIN_STAGE_SPAN), r);
}

/** The breaking ratio from which the sheet's front sharpening ramps up: ribbonOnset + RIBBON_FULL_OFFSET, kept below 1. */
export function steepeningStart(p: Pick<BreakParams, 'ribbonOnset'>): number {
  return Math.min(p.ribbonOnset + RIBBON_FULL_OFFSET, 1 - MIN_STEEPENING_SPAN);
}

/** The front sharpening's weight: 0 below ribbonOnset + RIBBON_FULL_OFFSET, 1 from r = 1. */
export function steepening(r: number, p: Pick<BreakParams, 'ribbonOnset'>): number {
  return smoothstep(steepeningStart(p), 1, r);
}

export interface StageCurves {
  drain: number;
  collapse: number;
}

export function stageCurves(s: number, p: BreakParams): StageCurves {
  return {
    drain: smoothstep(0, p.drainEnd, s),
    collapse: smoothstep(p.collapseStart, 1, s),
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

/** Where the drain acts: 1 just ahead of the face (phase −π/2 … −π/4), 0 at the crest and half a wavelength ahead. θ < 0 is ahead. */
export function drainShape(theta: number): number {
  return smoothstep(0, -Math.PI / 4, theta) * smoothstep(-Math.PI, -Math.PI / 2, theta);
}

/** d drainShape / dθ. */
export function drainShapeSlope(theta: number): number {
  return smoothstepSlope(0, -Math.PI / 4, theta) * smoothstep(-Math.PI, -Math.PI / 2, theta)
    + smoothstep(0, -Math.PI / 4, theta) * smoothstepSlope(-Math.PI, -Math.PI / 2, theta);
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
 * rises over the collapse from FOAM_ONSET_COLLAPSE and trails to half a wavelength behind the crest (θ > 0 is behind).
 * Its front edge sits just behind the crest while the tube is still open, so the tube's inside (the face ahead of the
 * crest) stays clear, and moves down the bore's face once the lip lies flat (FOAM_SETTLE_COLLAPSE on). `ahead` is the
 * along-travel distance from the crest (m), H the local height and env the envelope × lateral taper.
 */
export function foamWeight(theta: number, ahead: number, H: number, env: number, c: StageCurves, p: BreakParams): number {
  const land = smoothstep(FOAM_ONSET_COLLAPSE, 1, c.collapse);
  if (!(land > 0) || !(H > 0)) return 0;
  const edge = 0.5 * p.faceWidth * H;
  const reach = 2 * edge * smoothstep(FOAM_SETTLE_COLLAPSE, 1, c.collapse);
  const front = 1 - smoothstep(reach - edge, reach, ahead);
  const trail = 1 - smoothstep(Math.PI / 2, Math.PI, theta);
  return land * env * front * trail;
}

/** Crest to drained trough (m) of a wave of local height H at stage s: the calibration readout (spec §3.7). */
export function faceHeight(H: number, s: number, p: BreakParams): number {
  return H + drainDepth(H, stageCurves(s, p).drain, p);
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
}

export interface BreakPointResult {
  /** The final height (replaces the Phase 1 height). */
  eta: number;
  foam: number;
  /** ∂(eta − the Phase 1 height)/∂ahead: what breaking adds to the Phase 1 slope along travel. */
  dEtaDAhead: number;
}

/**
 * Breaking at one point, for a crest with breaking ratio r and stage s: the front sharpening (by steepening(r), before
 * and through the break), the drain and the bore. Neither steepening nor breaking (or H too small) returns the Phase 1
 * point exactly. With D the sharpening, R = drainDepth·drainShape(θ)·env the drain and S the bore scale (constant along
 * the cross-section), eta = (η − D − R)·S, and what breaking adds is eta − η = η·(S − 1) − (D + R)·S, differentiated
 * term by term along ahead.
 */
export function breakPoint(i: BreakPointInput, s: number, r: number, p: BreakParams): BreakPointResult {
  const steep = steepening(r, p);
  if (!(steep > 0 || s > 0) || !(i.H > MIN_BREAKING_HEIGHT_M)) return { eta: i.eta, foam: 0, dEtaDAhead: 0 };
  const c = stageCurves(s, p);
  const ahead = i.uUnbroken - i.uCrest;
  const drop = sharpenDrop(ahead, i.eta, i.etaCrest, i.H, i.k, steep, p);
  const dDrop = sharpenDropSlope(ahead, i.eta, i.slope, i.etaCrest, i.H, i.k, steep, p);
  const depth = drainDepth(i.H, c.drain, p);
  const drain = depth * drainShape(i.theta) * i.env;
  const dDrain = depth * (drainShapeSlope(i.theta) * i.dThetaDAhead * i.env + drainShape(i.theta) * i.dEnvDAhead);
  const scale = boreScale(i.H, i.hmin, c.collapse, p);
  return {
    eta: (i.eta - drop - drain) * scale,
    foam: foamWeight(i.theta, ahead, i.H, i.env, c, p),
    dEtaDAhead: i.slope * (scale - 1) - (dDrop + dDrain) * scale,
  };
}
