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
  /** The whitewater pile halves its height above its floor every this many metres it rolls past the landing (m). */
  pileHalfM: number;
  /** How far the pile surges above the lip right after the landing, on the heaviest breaks (× the lip; 0 on a shoulder). */
  pileSurge: number;
  /** The pile's churn (render only; the CPU model ignores it): lumps up to this fraction of the pile's height… */
  churnSize: number;
  /** …churning at this rate (× CHURN_RATE_PER_S, pileChurn.ts). */
  churnSpeed: number;
}

export const DEFAULT_BREAK_PARAMS: BreakParams = {
  enabled: true,
  gamma: 0.78,
  delta: 1.0,
  hFloorM: 0.3,
  stageSpan: 0.7,
  troughDrain: 0.7,
  beta: 0.4,
  faceWidth: 0.5,
  drainEnd: 0.4,
  collapseStart: 0.5,
  throwStrength: 0.6,
  lipThickness: 0.25,
  collapseTime: 1.8,
  ribbonOnset: 0.7,
  pileHalfM: 50,
  pileSurge: 0.3,
  churnSize: 0.2,
  churnSpeed: 1,
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
  p.pileHalfM = clampTo(p.pileHalfM, 10, 150, d.pileHalfM);
  p.pileSurge = clampTo(p.pileSurge, 0, 0.6, d.pileSurge);
  p.churnSize = clampTo(p.churnSize, 0, 0.4, d.churnSize);
  p.churnSpeed = clampTo(p.churnSpeed, 0, 3, d.churnSpeed);
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

export const GRAVITY_MS2 = 9.81;

/** The landing time for a crest `drop` metres above the trough it lands in: a fall from rest, √(2·drop/g). */
export function landingTime(drop: number): number {
  return Math.sqrt((2 * Math.max(drop, 0.05)) / GRAVITY_MS2);
}

/** When a section's lip has landed, s after onset: a fall from the crest to the drained trough, H + the full drain. The
 * sheet starts collapsing then; the ribbon at the later of this and its own measured landing. */
export function landingEstimate(H: number, p: Pick<BreakParams, 'troughDrain' | 'delta'>): number {
  return landingTime(H + p.troughDrain * p.delta * H);
}

/**
 * How long (s) the curl takes to collapse after the lip lands: collapseTime × the fall from the crest to the fully drained
 * trough, H·(1 + troughDrain·δ), which depends on the local height only. It used to be collapseTime × τ_land, but τ_land
 * is re-measured every frame from the live crest, and the sheet's own settling lowers that crest: the window shrank as the
 * curl collapsed and the barrel dropped in about half a second after the lip landed (Andrew's "trap door").
 */
export function settleSpan(H: number, p: Pick<BreakParams, 'collapseTime' | 'troughDrain' | 'delta'>): number {
  return p.collapseTime * landingEstimate(H, p);
}

/**
 * The onset record (reefField.ReefField.onset, onsetAmp): per field node, ONSET_LAGS values of the running maximum of
 * amp/hminBreak along the ray through it, at the node itself and at the lag times ONSET_LAG_TIMES_S upstream (the water
 * the crest was over that long ago), then the wave's amplification at each (onsetHeight). The running maximum never
 * falls along a ray, so a section that has broken stays broken wherever the reef goes deeper after it, and the time since
 * its onset is where the lagged maxima cross the wave's breaking level (onsetTime). One record serves every wave height:
 * ρ = height·onsetGain·amp/hminBreak.
 */
/** The lags' times (s upstream of the node): fine while the lip throws and the curl collapses, coarse over the pile's
 * slow decay, 13 s (≈ 90 m) back at the far end. */
export const ONSET_LAG_TIMES_S: readonly number[] = [0, 0.4, 0.8, 1.2, 2, 3.5, 7, 13];
export const ONSET_LAGS = ONSET_LAG_TIMES_S.length;
/** How far back the record reaches (s): a section broken longer ago reads Infinity. */
export const ONSET_REACH_S = ONSET_LAG_TIMES_S[ONSET_LAGS - 1];
/** Values per record sample: ONSET_LAGS running maxima, then ONSET_LAGS amplifications (reefField.sampleOnset). */
export const ONSET_RECORD_LENGTH = 2 * ONSET_LAGS;

/**
 * ρ per metre of wave height per unit amp/hminBreak: (1 + γδ)/γ, breakingRatio without its floor. The record leaves the
 * floor out (it has no params), so onsetTime agrees with breakingRatio wherever hminBreak ≥ hFloorM·(1 + γδ): 0.53 m at
 * the defaults, below the field's shallowest breaking depth.
 */
export function onsetGain(p: Pick<BreakParams, 'gamma' | 'delta'>): number {
  return (1 + p.gamma * p.delta) / p.gamma;
}

/** Where the lags cross the breaking level: the first lag j below it and the fraction phi of the way from j − 1; j =
 * ONSET_LAGS once every lag is at or above it; null if the section hasn't broken. */
function onsetCrossing(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): { j: number; phi: number } | null {
  const g = heightM * onsetGain(p);
  if (!(g > 0) || !(g * rec[offset] >= 1)) return null;
  for (let j = 1; j < ONSET_LAGS; j++) {
    const a = g * rec[offset + j - 1], b = g * rec[offset + j];
    if (b < 1) return { j, phi: Math.min(1, Math.max(0, (a - 1) / Math.max(a - b, 1e-9))) };
  }
  return { j: ONSET_LAGS, phi: 0 };
}

/**
 * The time (s) since the section at a crest first broke, from the onset record there (`rec`, its values from `offset`)
 * for a wave of deep-water height `heightM`: null if it hasn't broken, Infinity if it broke longer ago than the record
 * reaches (ONSET_REACH_S). Linear between the lags' times, stopping at the first lag below the breaking level.
 */
export function onsetTime(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number | null {
  const c = onsetCrossing(rec, offset, heightM, p);
  if (!c) return null;
  if (c.j === ONSET_LAGS) return Infinity;
  const t0 = ONSET_LAG_TIMES_S[c.j - 1];
  return t0 + c.phi * (ONSET_LAG_TIMES_S[c.j] - t0);
}

/**
 * The wave's height (m) where the section broke: heightM × the amplification the record carries (rec[offset +
 * ONSET_LAGS + j]), interpolated where the lags cross the breaking level as onsetTime interpolates the time; the far lag's
 * once the section broke beyond the record's reach; null if it hasn't broken. At onset ρ = 1, so this height is the
 * breaking height there, uncapped by the depth (it is below 0.78·hmin wherever hminBreak is hmin).
 */
export function onsetHeight(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number | null {
  const c = onsetCrossing(rec, offset, heightM, p);
  if (!c) return null;
  const amp = offset + ONSET_LAGS;
  if (c.j === ONSET_LAGS) return heightM * rec[amp + ONSET_LAGS - 1];
  return heightM * (rec[amp + c.j - 1] + c.phi * (rec[amp + c.j] - rec[amp + c.j - 1]));
}

/** The pile rises this long after the lip lands (s): where the lip hits the water, the whitewater stands up. */
export const PILE_RISE_S = 0.5;
/** The impact's surge rises over SURGE_RISE_S from the landing and eases back over SURGE_FALL_S… */
export const SURGE_RISE_S = 0.5;
export const SURGE_FALL_S = 1.5;
/** …in full on a section whose crest reached this breaking ratio (the peak's), not at all at ρ = 1. */
export const SURGE_FULL_RATIO = 3.4;

/** A crest's breaking state: how far the face sharpens, the stage (readout, gate), the drain, the collapse and the pile. */
export interface Lifecycle {
  steep: number;
  stage: number;
  drain: number;
  collapse: number;
  /** The whitewater pile's weight [0, 1]: 0 until the lip lands, full PILE_RISE_S later, × the section's extent. */
  pile: number;
  /** How far the pile's top has moved from the crest to where the lip landed [0, 1]: the settle's progress. */
  pileReach: number;
  /** The impact's surge on the pile's height (≥ 1): 1 + pileSurge·smoothstep(1, SURGE_FULL_RATIO, rMax)·rise·fall. */
  surge: number;
  /** The pile's decay toward its floor: 0.5^(d / pileHalfM), d the metres rolled since the landing (the time past it,
   * capped at ONSET_REACH_S since onset, × the crest speed c). */
  decay: number;
}
const NO_PILE = { pile: 0, pileReach: 0, surge: 1, decay: 1 } as const;

/**
 * One section's breaking state, on one clock. Before it breaks (tb null) the wave stands up with its crest's breaking
 * ratio r: the front sharpens and the reef drains, as it shoals. From onset on everything runs on the time since then
 * (tb): the sharpening, the drain and the stage reach their full by the time the lip lands (landingEstimate), and the
 * wave collapses to its bore over the settle span after that, which is when the ribbon's curl collapses. How full is how
 * far the section ever got into its breaking stage: breakingStage(rMax), rMax the largest ratio its crest has reached
 * (the onset record's running maximum, onsetRatio). A section that only just reached ρ = 1 on a shoulder spills a little
 * and runs on; one that stood well past it (the peak reaches 3.4) turns wholly to whitewater. Each is the larger of its
 * ratio value and its time value, and every time value is 0 at tb = 0 and at rMax = 1, so the state is continuous across
 * the onset and wherever the record's running maximum dips back under the level (its upwind march averages
 * neighbouring rays; up to ~2%). It never runs backwards: a section that runs into deeper water after breaking stays
 * broken (the ratio falls there, and when the stage and collapse followed it the broken wave stood back up as a second,
 * unbroken one: Andrew's "second wave"). r ≥ 1 counts as broken at tb 0 where the record lags it.
 * tb undefined: no onset record here (outside the field grid): the ratio alone, as before the record.
 * H is the crest's local height (setWaveModel.localHeight, no lateral taper), as the ribbon's stations carry. c is the
 * crest speed (m/s): the pile's decay runs on the metres it has rolled.
 * From the landing the section turns into a whitewater pile (breakPoint): its weight, where its top is, its surge and its
 * decay.
 */
export function lifecycle(r: number, tb: number | null | undefined, H: number, p: BreakParams, rMax = r, c = 0): Lifecycle {
  const c0 = stageCurves(r, p);
  const steep = steepening(r, p), stage = breakingStage(r, p);
  if (tb === undefined) return { steep, stage, drain: c0.drain, collapse: c0.collapse, ...NO_PILE };
  const t = tb ?? (r >= 1 ? 0 : null);
  if (t === null) return { steep, stage, drain: c0.drain, collapse: 0, ...NO_PILE };
  const extent = breakingStage(Math.max(r, rMax), p);
  const land = landingEstimate(H, p);
  const span = settleSpan(H, p);
  const thrown = smoothstep(0, land, t) * extent;
  const rolled = Math.max(0, Math.min(t, ONSET_REACH_S) - land) * c;
  const surgeWeight = p.pileSurge * smoothstep(1, SURGE_FULL_RATIO, Math.max(r, rMax));
  return {
    steep: Math.max(steep, thrown),
    stage: Math.max(stage, thrown),
    drain: Math.max(c0.drain, thrown),
    collapse: smoothstep(land, land + span, t) * extent,
    pile: smoothstep(land, land + PILE_RISE_S, t) * extent,
    pileReach: smoothstep(land, land + span, t),
    surge: 1 + surgeWeight * smoothstep(land, land + SURGE_RISE_S, t) * (1 - smoothstep(land + SURGE_RISE_S, land + SURGE_RISE_S + SURGE_FALL_S, t)),
    decay: 0.5 ** (rolled / p.pileHalfM),
  };
}

/** The largest breaking ratio the section at a record ever reached, for a wave of deep-water height `heightM`. */
export function onsetRatio(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number {
  return heightM * onsetGain(p) * rec[offset];
}

/**
 * The collapse (the wave settling to its bore) is complete at ρ = 1 + COLLAPSE_END·Δ (4.2 at the defaults; at 2.5 the
 * peak's crest halved within ~1 s of the lip landing, and the ribbon collapsed onto it): well after the tube has closed
 * (s = 0.75 at ρ ≈ 1 + 0.66·Δ), as the whitewater runs on over the shallower reef. Settling by the stage's end (ρ = 1 +
 * Δ) dropped a broken section to its bore within half a second of breaking, lower than the unbroken wave either side of
 * it: a sunken, square-sided bowl. Whitewater stays nearly as tall as the wave that made it and settles over the reef.
 */
export const COLLAPSE_END = 4.5;

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
 * The sharpened face drops SHARPEN_DEPTH × H below the crest; below that the wave keeps its own lower face. Sinking the
 * whole front to the trough (etaCrest − H) flattened up to half a wavelength ahead of every steepened section (80 m at
 * 12 ft), several metres below a less steepened neighbour's sloping face: a trench whose side walls ran far out ahead of
 * the break, the channels Andrew kept seeing. A real breaking face is steep at the top and runs out into a gentler apron;
 * any level between crest and trough keeps the profile descending (no hump), and this one roughly halves the trench's
 * depth and length. The drain still draws a hollow at the foot.
 */
export const SHARPEN_DEPTH = 0.7;

/**
 * The face steepening: how far to lower a point ahead of the crest to sharpen it into a peak. `ahead` is its
 * along-travel position relative to the crest (m), `eta` its height and etaCrest the crest's. Within faceWidth·H ahead
 * the profile stays near the crest height; beyond, it sinks toward etaCrest − SHARPEN_DEPTH·H, fading back to the
 * unbroken wave by half a wavelength. Behind the crest nothing changes (the back of the wave is its unbroken back).
 * Only heights change, so nothing folds and the height probe's horizontal search is unaffected.
 */
export function sharpenDrop(ahead: number, eta: number, etaCrest: number, H: number, k: number, steep: number, p: BreakParams): number {
  if (!(steep > 0) || !(H > 0) || ahead < 0) return 0;
  const width = p.faceWidth * H;
  const quarter = Math.PI / (2 * k);
  const sink = 1 - Math.exp(-((ahead / width) ** 2));
  return steep * sink * smoothstep(2 * quarter, quarter, ahead) * Math.max(eta - (etaCrest - SHARPEN_DEPTH * H), 0);
}

/**
 * ∂sharpenDrop/∂ahead at a fixed crest, where `slope` is ∂eta/∂ahead. With sink = 1 − exp(−(a/w)²), fade =
 * smoothstep(2q, q, a) and m = max(η − (η_c − SHARPEN_DEPTH·H), 0): steep·(sink′·fade·m + sink·fade′·m + sink·fade·m′), m′ = slope
 * where m > 0. 0 behind the crest, and continuous at it: sink and sink′ both vanish at a = 0.
 */
export function sharpenDropSlope(ahead: number, eta: number, slope: number, etaCrest: number, H: number, k: number, steep: number, p: BreakParams): number {
  if (!(steep > 0) || !(H > 0) || ahead < 0) return 0;
  const width = p.faceWidth * H;
  const quarter = Math.PI / (2 * k);
  const g = Math.exp(-((ahead / width) ** 2));
  const sink = 1 - g, dSink = (2 * ahead * g) / (width * width);
  const fade = smoothstep(2 * quarter, quarter, ahead), dFade = smoothstepSlope(2 * quarter, quarter, ahead);
  const above = eta - (etaCrest - SHARPEN_DEPTH * H);
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
  /** The breaking depth (m): the collapse settles to a bore of β·hmin. */
  hmin: number;
  /**
   * The height (m) the bore is a share of: the crest's uncapped height capped at BREAKING_RATIO·hmin (not at the Phase 1
   * cap's raw hmin), with the lateral taper. hmin carries the uncapped height's focusing spikes (it is amp over the
   * smoothed amp/depth), so the share β·hmin / boreH is smooth along the crest; over the capped height it was not, and
   * every point behind the crest shares its bore: each spike drew a trench along the travel (Andrew, 12 ft).
   */
  boreH: number;
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
 * Breaking at one point, for a crest in breaking state `lc` (lifecycle): the front sharpening (lc.steep × the crest
 * lookup's confidence), the drain and the bore. Neither steepening nor breaking (or H too small) returns the Phase 1
 * point exactly. With D the sharpening, R = drainDepth·drainShape(θ)·env the drain and S the bore scale (constant along
 * the cross-section), eta = (η − D − R)·S, and what breaking adds is eta − η = η·(S − 1) − (D + R)·S, differentiated
 * term by term along ahead.
 */
export function breakPoint(i: BreakPointInput, lc: Lifecycle, p: BreakParams): BreakPointResult {
  const steep = lc.steep;
  if (!(steep > 0 || lc.stage > 0) || !(i.H > MIN_BREAKING_HEIGHT_M)) return { eta: i.eta, foam: 0, dEtaDAhead: 0 };
  const c: StageCurves = { drain: lc.drain, collapse: lc.collapse };
  const ahead = i.uUnbroken - i.uCrest;
  const sharpen = steep * i.crestConfidence;
  const drop = sharpenDrop(ahead, i.eta, i.etaCrest, i.H, i.k, sharpen, p);
  const dDrop = sharpenDropSlope(ahead, i.eta, i.slope, i.etaCrest, i.H, i.k, sharpen, p);
  const depth = drainDepth(i.H, c.drain, p);
  const shape = drainShape(ahead, i.theta, i.H, i.k, p);
  const drain = depth * shape * i.env;
  const dDrain = depth * (drainShapeSlope(ahead, i.theta, i.dThetaDAhead, i.H, i.k, p) * i.env + shape * i.dEnvDAhead);
  const scale = boreScale(i.boreH, i.hmin, c.collapse, p);
  return {
    eta: (i.eta - drop - drain) * scale,
    foam: foamWeight(i.theta, ahead, i.H, i.env, c, p),
    dEtaDAhead: i.slope * (scale - 1) - (dDrop + dDrain) * scale,
  };
}
