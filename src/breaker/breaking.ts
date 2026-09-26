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
  /** Θmax (degrees): how far the lip rotates forward and down. */
  thetaMaxDeg: number;
  /** The curl's pivot sits this far below the crest (× H)… */
  pivotDrop: number;
  /** …and this far ahead of it (× H), on the steepened front face. */
  pivotAhead: number;
  /** The top fraction of H that curls: w(η) ramps from 0 to 1 over it. */
  lipZone: number;
  /** The visible drain: the trough ahead of the face drops by troughDrain·δ·H. */
  troughDrain: number;
  /** β: a collapsed wave settles to a bore of height β·hmin. */
  beta: number;
  /** The steepened front face spans this much, crest to foot (× H)… */
  faceWidth: number;
  /** …and the back of the crest this much (× H). */
  backWidth: number;
  /** Stage windows: the drain ramps over [0, drainEnd], the face steepens over [0, steepEnd], the lip curls over
   * [curlStart, curlEnd] and the wave collapses over [collapseStart, 1]. */
  drainEnd: number;
  steepEnd: number;
  curlStart: number;
  curlEnd: number;
  collapseStart: number;
}

export const DEFAULT_BREAK_PARAMS: BreakParams = {
  enabled: true,
  gamma: 0.78,
  delta: 1.0,
  hFloorM: 0.3,
  stageSpan: 1.0,
  thetaMaxDeg: 160,
  pivotDrop: 0.65,
  pivotAhead: 0.65,
  lipZone: 0.4,
  troughDrain: 0.35,
  beta: 0.4,
  faceWidth: 0.5,
  backWidth: 1.2,
  drainEnd: 0.25,
  steepEnd: 0.3,
  curlStart: 0.15,
  curlEnd: 0.8,
  collapseStart: 0.75,
};

/**
 * The lip's rotation fades out over this distance behind the crest (× H). The thrown lip is the crest's front, not its
 * whole cap: rotating the broad back of the crest with it lifts it up to 1.3·H over the still water and makes the lip as
 * thick as the tube is tall. With 0.3·H the lip is about 40% thinner (mean 0.68·H → 0.42·H at s = 0.6) and the back of
 * the wave keeps its shape. Not a BreakParams field (no panel slider yet).
 */
export const LIP_BACK_REACH = 0.3;
/** Foam starts once the collapse has run this far (s ≈ 0.82 at the defaults): the lip has landed. */
export const FOAM_ONSET_COLLAPSE = 0.2;
/** From this collapse on the foam's front edge moves off the crest and down the bore's face (the tube is gone). */
export const FOAM_SETTLE_COLLAPSE = 0.6;
/** A point still turned by this fraction of Θmax or more is lip in the air: it carries no foam. */
export const FOAM_LIP_TOLERANCE = 0.1;

/** smoothstep(1, 1, r) is undefined, so the stage span never goes below this. */
export const MIN_STAGE_SPAN = 0.05;
/** Waves lower than this (m) never break (the shape's H-scaled smoothsteps would divide by ~0). */
export const MIN_BREAKING_HEIGHT_M = 1e-3;

const clampTo = (v: number, lo: number, hi: number, fallback: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Keeps a BreakParams usable, in place: every value finite and in range, and the stage windows ordered. */
export function normalizeBreakParams(p: BreakParams): void {
  const d = DEFAULT_BREAK_PARAMS;
  p.enabled = typeof p.enabled === 'boolean' ? p.enabled : d.enabled;
  p.gamma = clampTo(p.gamma, 0.3, 1.5, d.gamma);
  p.delta = clampTo(p.delta, 0, 2, d.delta);
  p.hFloorM = clampTo(p.hFloorM, 0.05, 2, d.hFloorM);
  p.stageSpan = clampTo(p.stageSpan, MIN_STAGE_SPAN, 10, d.stageSpan);
  p.thetaMaxDeg = clampTo(p.thetaMaxDeg, 0, 180, d.thetaMaxDeg);
  p.pivotDrop = clampTo(p.pivotDrop, 0.1, 1, d.pivotDrop);
  p.pivotAhead = clampTo(p.pivotAhead, 0, 1, d.pivotAhead);
  p.lipZone = clampTo(p.lipZone, 0.05, 1, d.lipZone);
  p.troughDrain = clampTo(p.troughDrain, 0, 1, d.troughDrain);
  p.beta = clampTo(p.beta, 0.05, 1, d.beta);
  p.faceWidth = clampTo(p.faceWidth, 0.1, 3, d.faceWidth);
  p.backWidth = clampTo(p.backWidth, 0.1, 3, d.backWidth);
  p.drainEnd = clampTo(p.drainEnd, 0.01, 1, d.drainEnd);
  p.steepEnd = clampTo(p.steepEnd, 0.01, 1, d.steepEnd);
  p.curlStart = clampTo(p.curlStart, 0, 0.9, d.curlStart);
  p.curlEnd = clampTo(p.curlEnd, p.curlStart + 0.05, 1, d.curlEnd);
  p.collapseStart = clampTo(p.collapseStart, 0, 0.95, d.collapseStart);
}

/** r = H / (γ·max(hmin − δ·H, h_floor)): the wave breaks where r ≥ 1. H is the uncapped crest height (m). */
export function breakingRatio(H: number, hmin: number, p: BreakParams): number {
  if (!(H > 0)) return 0;
  return H / (p.gamma * Math.max(hmin - p.delta * H, p.hFloorM));
}

/** The breaking stage s ∈ [0, 1]: 0 until r = 1, 1 from r = 1 + Δ. */
export function breakingStage(r: number, p: BreakParams): number {
  if (!(r > 1)) return 0;
  return smoothstep(1, 1 + Math.max(p.stageSpan, MIN_STAGE_SPAN), r);
}

export interface StageCurves {
  steep: number;
  drain: number;
  curl: number;
  collapse: number;
}

export function stageCurves(s: number, p: BreakParams): StageCurves {
  return {
    steep: smoothstep(0, p.steepEnd, s),
    drain: smoothstep(0, p.drainEnd, s),
    curl: smoothstep(p.curlStart, p.curlEnd, s),
    collapse: smoothstep(p.collapseStart, 1, s),
  };
}

/**
 * The face steepening: how far to lower a point to sharpen the crest into a peak. `ahead` is its along-travel position
 * relative to the crest (m), `eta` its height and etaCrest the crest's. Within faceWidth·H ahead (backWidth·H behind) the
 * profile stays near the crest height; beyond, it sinks toward the trough level etaCrest − H, fading back to the unbroken
 * wave by half a wavelength. Only heights change, so nothing folds.
 */
export function sharpenDrop(ahead: number, eta: number, etaCrest: number, H: number, k: number, steep: number, p: BreakParams): number {
  if (!(steep > 0) || !(H > 0)) return 0;
  const width = (ahead >= 0 ? p.faceWidth : p.backWidth) * H;
  const quarter = Math.PI / (2 * k);
  const sink = 1 - Math.exp(-((ahead / width) ** 2));
  return steep * sink * smoothstep(2 * quarter, quarter, Math.abs(ahead)) * Math.max(eta - (etaCrest - H), 0);
}

/** How far the trough ahead of the face has dropped (m, ≥ 0) at drain progress `drain` ∈ [0, 1]. */
export function drainDepth(H: number, drain: number, p: BreakParams): number {
  return p.troughDrain * p.delta * H * drain;
}

/** Where the drain acts: 1 just ahead of the face (phase −π/2 … −π/4), 0 at the crest and half a wavelength ahead. θ < 0 is ahead. */
export function drainShape(theta: number): number {
  return smoothstep(0, -Math.PI / 4, theta) * smoothstep(-Math.PI, -Math.PI / 2, theta);
}

/** The turquoise-lip mask: thin curling lip, sin(φ)·w (spec §3.5). */
export function lipMask(phi: number, w: number): number {
  return Math.max(Math.sin(phi), 0) * w;
}

export interface CurlResult {
  du: number;
  dy: number;
  lip: number;
}

const NO_CURL: CurlResult = { du: 0, dy: 0, lip: 0 };

/**
 * The lip weight w ∈ [0, 1]: the top lipZone of the wave (by height η), and only near the crest: out to the steepened
 * face width ahead (fading by twice it) and LIP_BACK_REACH·H behind, so a high point elsewhere on a long wave never
 * swings about the pivot and the back of the crest stays behind the lip. `ahead` is the along-travel distance from the
 * crest (m), η and etaCrest heights (m), H the local height.
 */
export function lipWeight(ahead: number, eta: number, etaCrest: number, H: number, p: BreakParams): number {
  const near = (1 - smoothstep(p.faceWidth * H, 2 * p.faceWidth * H, ahead)) * (1 - smoothstep(0, LIP_BACK_REACH * H, -ahead));
  return smoothstep(etaCrest - p.lipZone * H, etaCrest, eta) * near;
}

/**
 * The throw and the curl (spec §3.2): the point (u, η) rotates forward and down (clockwise, travel to the right) about
 * the pivot, by φ = Θmax·curl(s)·w·(1 − collapse(s)), w its lipWeight. u and uCrest are along-travel positions, η and
 * etaCrest heights (m); H is the local height.
 */
export function curlDisplacement(u: number, eta: number, uCrest: number, etaCrest: number, H: number, w: number, c: StageCurves, p: BreakParams): CurlResult {
  const phi = ((p.thetaMaxDeg * Math.PI) / 180) * c.curl * w * (1 - c.collapse);
  if (phi === 0) return NO_CURL;
  const ru = u - (uCrest + p.pivotAhead * H), re = eta - (etaCrest - p.pivotDrop * H);
  const cs = Math.cos(phi), sn = Math.sin(phi);
  return { du: cs * ru + sn * re - ru, dy: -sn * ru + cs * re - re, lip: lipMask(phi, w) };
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
 * Whitewater placeholder (spec §3.6): only once the lip has landed, and only on the collapsed surface at and behind the
 * crest. It rises over the collapse from FOAM_ONSET_COLLAPSE and trails to half a wavelength behind the crest (θ > 0 is
 * behind). Its front edge sits just behind the crest while the tube is still open, so the tube's inside (the face ahead
 * of the crest) stays clear, and moves down the bore's face once the lip lies flat (FOAM_SETTLE_COLLAPSE on). A point
 * still turned by FOAM_LIP_TOLERANCE·Θmax or more (the curled lip, top and underside) carries none. `ahead` is the
 * along-travel distance from the crest (m), H the local height, env the envelope × lateral taper and w the lipWeight.
 */
export function foamWeight(theta: number, ahead: number, H: number, env: number, w: number, c: StageCurves, p: BreakParams): number {
  const land = smoothstep(FOAM_ONSET_COLLAPSE, 1, c.collapse);
  if (!(land > 0) || !(H > 0)) return 0;
  const edge = 0.5 * p.faceWidth * H;
  const reach = 2 * edge * smoothstep(FOAM_SETTLE_COLLAPSE, 1, c.collapse);
  const front = 1 - smoothstep(reach - edge, reach, ahead);
  const trail = 1 - smoothstep(Math.PI / 2, Math.PI, theta);
  const notLip = 1 - smoothstep(0, FOAM_LIP_TOLERANCE, c.curl * w * (1 - c.collapse));
  return land * env * front * trail * notLip;
}

/** Crest to drained trough (m) of a wave of local height H at stage s: the calibration readout (spec §3.7). */
export function faceHeight(H: number, s: number, p: BreakParams): number {
  return H + drainDepth(H, stageCurves(s, p).drain, p);
}

/** One wave at one point, in the vertical plane along its travel (see setWaveModel.waveAtCrest). */
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
}

export interface BreakPointResult {
  /** Added to the Phase 1 displacement along travel (m). */
  du: number;
  /** The final height (replaces the Phase 1 height). */
  eta: number;
  foam: number;
  lip: number;
}

/**
 * Breaking at one point for crest stage s. s = 0 returns the Phase 1 point exactly. includeCurl = false (the height
 * probe) keeps the drain and the bore but leaves out the crest sharpening and the curl: the surface stays single-valued
 * and the probe's fixed-point search keeps converging.
 */
export function breakPoint(i: BreakPointInput, s: number, p: BreakParams, includeCurl: boolean): BreakPointResult {
  if (!(s > 0) || !(i.H > MIN_BREAKING_HEIGHT_M)) return { du: 0, eta: i.eta, foam: 0, lip: 0 };
  const c = stageCurves(s, p);
  const ahead = i.uUnbroken - i.uCrest;
  const sharpened = includeCurl ? i.eta - sharpenDrop(ahead, i.eta, i.etaCrest, i.H, i.k, c.steep, p) : i.eta;
  const eta = sharpened - drainDepth(i.H, c.drain, p) * drainShape(i.theta) * i.env;
  const w = lipWeight(ahead, eta, i.etaCrest, i.H, p);
  const curl = includeCurl ? curlDisplacement(i.uUnbroken, eta, i.uCrest, i.etaCrest, i.H, w, c, p) : NO_CURL;
  const scale = boreScale(i.H, i.hmin, c.collapse, p);
  return { du: curl.du * scale, eta: (eta + curl.dy) * scale, foam: foamWeight(i.theta, ahead, i.H, i.env, w, c, p), lip: curl.lip };
}
