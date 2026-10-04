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
  /** The curl collapses over collapseTime × τ_land after the lip lands. */
  collapseTime: number;
  /** The ribbon fades in from this breaking ratio, full at ribbonOnset + RIBBON_FULL_OFFSET; the sheet's front sharpening
   * ramps from there to ρ = 1. */
  ribbonOnset: number;
  /** The whitewater pile halves its height above its floor every this many metres it rolls past the landing (m). */
  pileHalfM: number;
  /** How far the pile surges above the lip right after the landing, on the heaviest breaks (× the lip; 0 on a shoulder). */
  pileSurge: number;
  /** Nudge on the crest's ψ (a factor 1 + psiNudge), in [−0.5, 0.5]; 0 by default (spec 2026-09-30-barrel-from-maths §5). */
  psiNudge: number;
  /** The random dial: each wave's ψ moves by up to ± this fraction (its seeded draw); 0 is pure physics. */
  randomDial: number;
  /** The peel stretch (spec 2026-10-04, Andrew: "the wave is simply breaking too fast for the surfer to ride"): each part
   * of the line breaks this much later after the part up the line than the reef alone says; 1 is physics. Baked into the
   * reef field's onset record (a change re-bakes it). */
  peel: number;
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
  troughDrain: 0.6544,
  beta: 0.4,
  faceWidth: 0.5,
  drainEnd: 0.4,
  collapseStart: 0.5,
  collapseTime: 1.8,
  ribbonOnset: 0.7,
  pileHalfM: 50,
  pileSurge: 0.3,
  psiNudge: 0,
  randomDial: 0,
  peel: 1.7,
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
  p.collapseTime = clampTo(p.collapseTime, 0.3, 3, d.collapseTime);
  p.ribbonOnset = clampTo(p.ribbonOnset, 0.3, 0.9, d.ribbonOnset);
  p.pileHalfM = clampTo(p.pileHalfM, 10, 150, d.pileHalfM);
  p.pileSurge = clampTo(p.pileSurge, 0, 0.6, d.pileSurge);
  p.psiNudge = clampTo(p.psiNudge, -0.5, 0.5, d.psiNudge);
  p.randomDial = clampTo(p.randomDial, 0, 0.15, d.randomDial);
  p.peel = clampTo(p.peel, 1, 3, d.peel);
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
 * The onset record (reefField.ReefField.onset): per field node, the running maximum `run` of amp/hminBreak along the ray
 * through it, then, for each breaking level q_k (ONSET_LEVEL_Q, amp/hminBreak), the time since the section on that ray
 * first reached q_k (0 if it hasn't) and the throw's height there: the tallest the crest stood (its height capped by the
 * depth, as the sheet caps it) in the LIP_THROW_S after that, as a multiple of the deep-water height (the amplification,
 * where the cap doesn't bind). A wave of deep-water height h breaks
 * where h·onsetGain·amp/hminBreak ≥ 1, at the level q* = 1/(h·onsetGain): between two of the record's levels, and read
 * there (onsetLevel). The running maximum never falls along a ray, so a section that has broken stays broken wherever the
 * reef goes deeper after it. The times and amplifications are carried along the rays (reefField.computeOnsetRecord):
 * exact, never running backwards, with no reach limit. (Sampled instead at fixed times back up the ray, the lags straddled
 * the ledge 25–40 m apart where the ratio climbs 0.8 → 3.4 in metres, and the time since onset ran at 0.5–2× real time.)
 */
/** The record's breaking levels: ONSET_LEVELS geometric steps from ONSET_LEVEL_Q0 (a 12 ft set's biggest wave breaks
 * near 0.05; the γ and δ sliders take it to ~0.03) to ONSET_LEVEL_TOP (the field's largest running ratio is 1.34). */
export const ONSET_LEVELS = 12;
export const ONSET_LEVEL_Q0 = 0.025;
export const ONSET_LEVEL_TOP = 1.4;
export const ONSET_LEVEL_RATIO = (ONSET_LEVEL_TOP / ONSET_LEVEL_Q0) ** (1 / (ONSET_LEVELS - 1));
export const ONSET_LEVEL_Q: readonly number[] = Array.from({ length: ONSET_LEVELS }, (_, k) => ONSET_LEVEL_Q0 * ONSET_LEVEL_RATIO ** k);
/** A wave breaks when its height reaches about 0.78 × depth; Phase 1 caps it there (the "fade"). */
export const BREAKING_RATIO = 0.78;
/** The lip's height is the tallest the crest stands in this long after its section breaks (s): while it throws and lands
 * (at the peak the crest grows until ~1.75 s, past the lip's landing at ~1.05 s). */
export const LIP_THROW_S = 2;
/** Each level's wave height (m) at the default γ and δ (ρ = height·onsetGain·q = 1): the record caps the throw's height by
 * the depth with it (as the sheet caps a crest), since the record has no params. */
export function onsetLevelHeight(k: number): number {
  return 1 / (ONSET_LEVEL_Q[k] * onsetGain(DEFAULT_BREAK_PARAMS));
}
/** Values per record sample: the running maximum; per level (time since onset, the throw's height ÷ the level's
 * deep-water height); then per level ψ₀ where that level broke (reefField.psiFromStep, plan 2026-10-02); then per level
 * the peel stretch's delay (s, spec 2026-10-04 §1). The time since onset is the stretched one: negative while the section
 * waits its turn. */
export const ONSET_RECORD_LENGTH = 1 + 4 * ONSET_LEVELS;
/** Offset of level 0's ψ₀ in a record sample. */
export const ONSET_PSI_OFFSET = 1 + 2 * ONSET_LEVELS;
/** Offset of level 0's peel delay in a record sample. */
export const ONSET_DELAY_OFFSET = 1 + 3 * ONSET_LEVELS;

/**
 * ρ per metre of wave height per unit amp/hminBreak: (1 + γδ)/γ, breakingRatio without its floor. The record leaves the
 * floor out (it has no params), so onsetTime agrees with breakingRatio wherever hminBreak ≥ hFloorM·(1 + γδ): 0.53 m at
 * the defaults, below the field's shallowest breaking depth.
 */
export function onsetGain(p: Pick<BreakParams, 'gamma' | 'delta'>): number {
  return (1 + p.gamma * p.delta) / p.gamma;
}

/**
 * Where a wave of deep-water height `heightM` reads the record `rec` (from `offset`): from level k toward level k + 1 by
 * w, log-linearly in q; where level k + 1 is above the running maximum (it hasn't broken there) toward the running maximum
 * itself instead, where the section breaks now (`toRun`: time 0, today's amplification, which the record keeps for an
 * unbroken level). null if the section hasn't broken for this wave.
 */
function onsetLevel(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): { k: number; w: number; toRun: boolean } | null {
  const g = heightM * onsetGain(p), run = rec[offset];
  if (!(g > 0) || !(g * run >= 1)) return null;
  const logR = Math.log(ONSET_LEVEL_RATIO);
  const lq = Math.log(1 / (g * ONSET_LEVEL_Q0)) / logR;
  const k = Math.min(ONSET_LEVELS - 2, Math.max(0, Math.floor(lq)));
  const toRun = run < ONSET_LEVEL_Q[k + 1];
  const hi = toRun ? Math.log(run / ONSET_LEVEL_Q0) / logR : k + 1;
  return { k, w: Math.min(1, Math.max(0, (lq - k) / Math.max(hi - k, 1e-9))), toRun };
}

/** The time (s) since the section at a crest first broke, from the onset record there, for a wave of deep-water height
 * `heightM`: null if it hasn't broken. The peel stretch's (spec 2026-10-04 §2): negative while the section, broken by the
 * reef, waits its turn; just broken by the reef (toRun), it runs to −D, its turn D seconds off. */
export function onsetTime(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number | null {
  const l = onsetLevel(rec, offset, heightM, p);
  if (!l) return null;
  const lo = rec[offset + 1 + 2 * l.k], hi = l.toRun ? -rec[offset + ONSET_DELAY_OFFSET + l.k] : rec[offset + 3 + 2 * l.k];
  return lo + l.w * (hi - lo);
}

/** The peel stretch's delay (s) of the section at a crest (level k toward k + 1 as onsetTime reads; level k's own where
 * toRun): 0 if it hasn't broken. */
export function onsetDelay(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number {
  const l = onsetLevel(rec, offset, heightM, p);
  if (!l) return 0;
  const lo = rec[offset + ONSET_DELAY_OFFSET + l.k], hi = l.toRun ? lo : rec[offset + ONSET_DELAY_OFFSET + l.k + 1];
  return lo + l.w * (hi - lo);
}

/**
 * The height (m) the section's crest stood at while it threw its lip: heightM × the record's factor for its level (the
 * tallest in the LIP_THROW_S after onset, capped by the depth), interpolated as onsetTime interpolates the time; null if
 * it hasn't broken.
 */
export function onsetHeight(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number | null {
  const l = onsetLevel(rec, offset, heightM, p);
  if (!l) return null;
  const lo = rec[offset + 2 + 2 * l.k], hi = rec[offset + 4 + 2 * l.k];
  return heightM * (lo + l.w * (hi - lo));
}

/**
 * ψ₀ where the section broke, for a wave of deep-water height `heightM`: levels k and k + 1 around its breaking level,
 * log-linearly (w = lq − k, clamped). It reads a value whether or not the wave has broken: an unbroken level holds the
 * node's own ψ₀ (a section breaking there now).
 */
export function onsetPsi(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number {
  const g = heightM * onsetGain(p), s = offset + ONSET_PSI_OFFSET;
  if (!(g > 0)) return rec[s];
  const lq = Math.log(1 / (g * ONSET_LEVEL_Q0)) / Math.log(ONSET_LEVEL_RATIO);
  const k = Math.min(ONSET_LEVELS - 2, Math.max(0, Math.floor(lq)));
  const w = Math.min(1, Math.max(0, lq - k));
  return rec[s + k] + w * (rec[s + k + 1] - rec[s + k]);
}

/** The pile rises this long after the lip lands (s): where the lip hits the water, the whitewater stands up. */
export const PILE_RISE_S = 0.5;
/** The pile's decay runs on the time since it rose, as metres at this crest speed (m/s): the reef top's (spec: half height
 * ~50 m ≈ 7 s). On the crest's speed now, a crest slowing into shallower water rolled "back" and its pile grew. */
export const PILE_SPEED_MS = 7;
/** The impact's surge rises over SURGE_RISE_S from the landing and eases back over SURGE_FALL_S… */
export const SURGE_RISE_S = 0.5;
export const SURGE_FALL_S = 1.5;
/** …in full on a section whose crest reached this breaking ratio (the peak's), not at all at ρ = 1. */
export const SURGE_FULL_RATIO = 3.4;

/**
 * The slurp's pull on a shoulder: how far its face stands up and its water is drawn in, from the slurp's ratio
 * (FieldSample.hminSlurp: the strongest ratio along its crest line nearby, fading with distance). From where its own
 * sharpening would start to full at SLURP_FULL_RATIO: a wider ramp than the sharpening's own (to ρ = 1), so it fades out
 * along the line over tens of metres, not in a wall (with the sharpening's ramp the drawn water climbed 0.7 m in 5 m where
 * it ended), and a neighbour's pull is weaker than the peak's own.
 */
export const SLURP_FULL_RATIO = 2;
export function slurp(rSlurp: number, p: Pick<BreakParams, 'ribbonOnset'>): number {
  return smoothstep(steepeningStart(p), SLURP_FULL_RATIO, rSlurp);
}

/** A crest's breaking state: how far the face sharpens, the stage (readout, gate), the drain, the collapse and the pile. */
export interface Lifecycle {
  steep: number;
  stage: number;
  drain: number;
  collapse: number;
  /** The whitewater pile's weight [0, 1]: 0 until the lip lands and its tube's hold is over, full PILE_RISE_S later, ×
   * the section's extent. */
  pile: number;
  /** How long (s) after the landing the section holds its tube open before it settles (TUBE_HOLD_S × its plunge). */
  hold: number;
  /** The collapse on the landing's own clock, without the tube's hold: the shoaling front's lean lets go on it (held on
   * over the inside reef, its squeeze folded the water beside the peak). */
  release: number;
  /** How far the pile's top has moved from the crest to where the lip landed [0, 1]: the settle's progress. */
  pileReach: number;
  /** The impact's surge on the pile's height (≥ 1): 1 + pileSurge·smoothstep(1, SURGE_FULL_RATIO, rMax)·rise·fall. */
  surge: number;
  /** The pile's decay: 0.5^(d / pileHalfM), d the metres rolled since it rose (the time past the landing and PILE_RISE_S,
   * × PILE_SPEED_MS): it stands at the lip's height first. */
  decay: number;
}
const NO_PILE = { pile: 0, pileReach: 0, surge: 1, decay: 1, hold: 0 } as const;

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
 * H is the crest's local height (setWaveModel.localHeight, no lateral taper), as the ribbon's stations carry. rSlurp is
 * the crest's ratio over the slurp's breaking depth (FieldSample.hminSlurp, ≥ r): the face's sharpening and the drain
 * follow it, so the shoulders beside a section standing up are drawn in with it (the slurp); the stage and the collapse
 * follow r, so they don't break any earlier.
 * From the landing the section turns into a whitewater pile (breakPoint): its weight, where its top is, its surge and its
 * decay. plunge is the tube's presence at the crest's ψ (overturn.overturnShape; 0 without one): a section the maths
 * throws a tube for breaks whole from onset, however slowly its ratio climbs. On the steep ledge the ratio jumped past
 * the stage's range at once; on the softened ramp it creeps, and the sheet broke a sliver while the lip threw a full tube
 * (plan 2026-09-30-barrel-from-maths, Task 5).
 */
/** A section that throws a tube holds it open this long (s) after its lip lands, before the wave settles and the
 * whitewater rises (the ribbon's curl holds as long: lipProfile.profileFrame), × how thrown its tube is: tubeThrown. */
export const TUBE_HOLD_S = 1.5;
/** How thrown a tube is at ψ, the hold's weight: 0 at ψ_a (an oval, 4 ft's 0.03 ≈ 0.2), 1 by ψ_b (a thrown barrel, 8 ft up). */
export const TUBE_THROWN_PSI: readonly [number, number] = [0.02, 0.065];
/** A plunging section breaks whole, and surges as its ψ says, once its ratio has passed breaking by this much (one that
 * just grazes it stays a partial break). */
export const PLUNGE_FULL_RATIO = 1.05;
/** A delayed section's ratio past 1 fades in over the landing from its turn, weighted in by its delay over this (s), so an
 * undelayed section (and every section at peel 1) reads its ratio exactly as before (spec 2026-10-04 §3). */
export const PEEL_RAMP_DELAY_S = 0.2;

/**
 * The ratio a crest stands at under the peel stretch (spec 2026-10-04 §3): a held section (broken by the reef, its stretched
 * time since onset still negative) stands as the wave at r = 1, the moment it pitches; once its turn comes its ratio past 1
 * fades in over the landing τ_land (no jump), weighted in by its delay. Undelayed (and at peel 1), the ratio as it is. The
 * sheet's lifecycle and the ribbon's stations both read it, so the lip stands as the water under it does.
 */
export function peelRatio(r: number, tb: number | null | undefined, delay: number, land: number): number {
  if (typeof tb !== 'number') return r;
  if (tb < 0) return Math.min(r, 1);
  return delay > 0 ? r - smoothstep(0, PEEL_RAMP_DELAY_S, delay) * (r - Math.min(r, 1 + (r - 1) * smoothstep(0, land, tb))) : r;
}

export function lifecycle(r: number, tb: number | null | undefined, H: number, p: BreakParams, rMax = r, rSlurp = r, plunge = 0, thrown = 0, delay = 0): Lifecycle {
  const land = landingEstimate(H, p);
  const waiting = typeof tb === 'number' && tb < 0, rE = peelRatio(r, tb, delay, land);
  const own = stageCurves(rE, p), pulled = slurp(rSlurp, p);
  const c0 = { drain: Math.max(own.drain, pulled), collapse: own.collapse };
  const steep = Math.max(steepening(rE, p), pulled), stage = breakingStage(rE, p);
  if (tb === undefined) return { steep, stage, drain: c0.drain, collapse: c0.collapse, release: c0.collapse, ...NO_PILE };
  const t = waiting ? null : tb ?? (r >= 1 ? 0 : null);
  if (t === null) return { steep, stage, drain: c0.drain, collapse: 0, release: 0, ...NO_PILE };
  const extent = Math.max(breakingStage(Math.max(r, rMax), p), plunge * smoothstep(1, PLUNGE_FULL_RATIO, Math.max(r, rMax)));
  const span = settleSpan(H, p);
  const thrownBy = smoothstep(0, land, t) * extent;
  // A section that throws a tube holds it open TUBE_HOLD_S after the lip lands (Andrew, 2026-10-03, down the line), × how
  // thrown its tube is (`thrown`: 0 for an oval that closes as it lands, 1 for a thrown barrel): the wave settles and the
  // whitewater rises from then.
  const plunged = plunge * smoothstep(1, PLUNGE_FULL_RATIO, Math.max(r, rMax)), held = land + TUBE_HOLD_S * plunged * thrown;
  const rolled = Math.max(0, t - held - PILE_RISE_S) * PILE_SPEED_MS;
  const surgeWeight = p.pileSurge * Math.max(smoothstep(1, SURGE_FULL_RATIO, Math.max(r, rMax)), plunged);
  return {
    steep: Math.max(steep, thrownBy),
    stage: Math.max(stage, thrownBy),
    drain: Math.max(c0.drain, thrownBy),
    collapse: smoothstep(held, held + span, t) * extent,
    hold: held - land,
    release: smoothstep(land, land + span, t) * extent,
    pile: smoothstep(held, held + PILE_RISE_S, t) * extent,
    pileReach: smoothstep(held, held + span, t),
    surge: 1 + surgeWeight * smoothstep(held, held + SURGE_RISE_S, t) * (1 - smoothstep(held + SURGE_RISE_S, held + SURGE_RISE_S + SURGE_FALL_S, t)),
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
 * …at the steep top of the face. From SHARPEN_FLOOR_START face widths ahead the floor runs on down to the wave's own
 * trough (etaCrest − H) over SHARPEN_FLOOR_REACH more, a smooth concave sweep: a level floor cut a flat terrace into
 * every front still above it, and the face dropped twice, to the terrace and later into the trough (Andrew, 2026-10-02,
 * "the step in front"). The trench the full-depth floor dug (above) ran half a wavelength ahead; this one ends at the
 * foot, where the lean (setWaveModel.LEAN_RATIO) has brought the trough in. Over 4 face widths the lowest water at 12 ft
 * sat 20 m ahead of the foot; over 1, the drained trough stood 0.77 H below still water. Started at two face widths
 * (where the sink is full), the face held level from about 1.5 to 2 widths and then fell again: a shelf at the foot as
 * it broke at the peak (0.1 m per metre between stretches of 0.4 at 12 ft; Andrew's Gate 2 cuts). From one width, where
 * the sink is two-thirds in, the face only gets gentler down to the foot (ending at 3.5 widths, the drained trough at
 * 12 ft just touched 0.75 H; at 3.75 it is back under).
 */
export const SHARPEN_FLOOR_START = 1;
export const SHARPEN_FLOOR_REACH = 2.75;

/** How far below the crest (× H) the sharpened face is cut at `ahead` m: SHARPEN_DEPTH, running down to 1 (the trough). */
function sharpenFloor(ahead: number, width: number): { depth: number; dDepth: number } {
  const a0 = SHARPEN_FLOOR_START * width, a1 = (SHARPEN_FLOOR_START + SHARPEN_FLOOR_REACH) * width;
  return { depth: SHARPEN_DEPTH + (1 - SHARPEN_DEPTH) * smoothstep(a0, a1, ahead), dDepth: (1 - SHARPEN_DEPTH) * smoothstepSlope(a0, a1, ahead) };
}

/**
 * The face steepening: how far to lower a point ahead of the crest to sharpen it into a peak. `ahead` is its
 * along-travel position relative to the crest (m), `eta` its height and etaCrest the crest's. Within faceWidth·H ahead
 * the profile stays near the crest height; beyond, it sinks toward etaCrest − SHARPEN_DEPTH·H, running down to the
 * trough over SHARPEN_FLOOR_REACH face widths, fading back to the
 * unbroken wave by half a wavelength. Behind the crest nothing changes (the back of the wave is its unbroken back).
 * Only heights change, so nothing folds and the height probe's horizontal search is unaffected.
 */
export function sharpenDrop(ahead: number, eta: number, etaCrest: number, H: number, k: number, steep: number, p: BreakParams): number {
  if (!(steep > 0) || !(H > 0) || ahead < 0) return 0;
  const width = p.faceWidth * H;
  const quarter = Math.PI / (2 * k);
  const sink = 1 - Math.exp(-((ahead / width) ** 2));
  return steep * sink * smoothstep(2 * quarter, quarter, ahead) * Math.max(eta - (etaCrest - sharpenFloor(ahead, width).depth * H), 0);
}

/**
 * ∂sharpenDrop/∂ahead at a fixed crest, where `slope` is ∂eta/∂ahead. With sink = 1 − exp(−(a/w)²), fade =
 * smoothstep(2q, q, a) and m = max(η − (η_c − f(a)·H), 0) (f the floor, sharpenFloor): steep·(sink′·fade·m + sink·fade′·m +
 * sink·fade·m′), m′ = slope + f′(a)·H where m > 0. 0 behind the crest, and continuous at it: sink and sink′ both vanish at a = 0.
 */
export function sharpenDropSlope(ahead: number, eta: number, slope: number, etaCrest: number, H: number, k: number, steep: number, p: BreakParams): number {
  if (!(steep > 0) || !(H > 0) || ahead < 0) return 0;
  const width = p.faceWidth * H;
  const quarter = Math.PI / (2 * k);
  const g = Math.exp(-((ahead / width) ** 2));
  const sink = 1 - g, dSink = (2 * ahead * g) / (width * width);
  const fade = smoothstep(2 * quarter, quarter, ahead), dFade = smoothstepSlope(2 * quarter, quarter, ahead);
  const floor = sharpenFloor(ahead, width);
  const above = eta - (etaCrest - floor.depth * H);
  const m = Math.max(above, 0), dM = above > 0 ? slope + floor.dDepth * H : 0;
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
 * The pile's floor, the settled bore's crest above still water: the bore's height β × the breaking depth `hmin`, with the
 * crest's shape (etaCrest / H, the crest's share of its height) and the lateral taper. Not the crest's own height settled
 * (boreScale): that follows the crest's height, which spikes along the crest where the reef focuses the swell (capped by
 * the unsmoothed depth), and the floor drew those spikes into the pile as steps.
 */
export function settledCrestTop(etaCrest: number, H: number, hmin: number, lateral: number, p: BreakParams): number {
  return (etaCrest / Math.max(H, MIN_BREAKING_HEIGHT_M)) * boreHeight(hmin, p) * lateral;
}

/**
 * The pile's top above still water (spec §3.2): the lip's height, surged, halving every pileHalfM it rolls (Andrew: half
 * height about 50 m in), never below its floor (the bore). It follows the floor only once it has decayed onto it: where
 * the reef deepens behind the ledge the bore grows, and floor + (lip − floor) × decay grew with it.
 */
export function pileTop(lipTop: number, floorTop: number, lc: Lifecycle): number {
  return Math.max(floorTop, lipTop * lc.surge * lc.decay);
}

/** The pile's top sits this many H ahead of the crest once the curl has collapsed: where the lip landed (spec §3.1). */
export const PILE_LAND_H = 1.2;
/** Its steep front falls away over this many H (a Gaussian's width)… */
export const PILE_FRONT_H = 0.5;
/** …its back slopes away over this many. */
export const PILE_BACK_H = 1.5;
/** The pile is full within PILE_REACH[0] periods of its crest in phase and gone from PILE_REACH[1], as the crest's height
 * (setWaveModel.CREST_HEIGHT_REACH): out there the crest lookup lands metres apart for neighbouring points, and the pile's
 * back drew those jumps as steps along the crest. */
export const PILE_REACH: readonly [number, number] = [1 / 8, 1 / 4];
/** The pile meets the wave under it over this many H (smoothMax's k), so the join has no crease. */
export const PILE_BLEND_H = 0.1;
/** No pile where the lip stands no higher than the settled bore; full once it is this much (×) higher. */
export const PILE_MIN_LIFT: readonly [number, number] = [1, 1.2];
/** The pile's foam thins to this as it decays to its floor… */
export const PILE_FOAM_THIN = 0.5;
/** …and covers the pile out to where its shape falls to these (smoothstep over g, front and back). */
export const PILE_FOAM_EDGE: readonly [number, number] = [0.02, 0.25];

/** A polynomial smooth maximum: exactly max(a, b) where they differ by k or more, C1 everywhere; dA = ∂/∂a (∂/∂b = 1 − dA). */
export function smoothMax(a: number, b: number, k: number): { value: number; dA: number } {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return { value: Math.max(a, b) + (h * h * k) / 4, dA: Math.min(1, Math.max(0, 0.5 + (a - b) / (2 * k))) };
}

/** The pile's shape g(v) ∈ (0, 1] at v metres ahead of its top (negative behind), and dg/dv: a steep front, a long back. */
export function pileShape(v: number, H: number): { g: number; dg: number } {
  const w = (v >= 0 ? PILE_FRONT_H : PILE_BACK_H) * H;
  const x = v / w, g = Math.exp(-x * x);
  return { g, dg: ((-2 * x) / w) * g };
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
  /** How high the crest stood above still water when the section broke (m, with the lateral taper; spec §3.2's lip): the
   * whitewater pile's height. 0: no pile (unbroken, off the record, or the ribbon frame's sheet). */
  lipTop: number;
  /** The lateral taper at the point (setWaveModel.waveAtCrest): the floor's share of it. */
  lateral: number;
  /** The section's wave height while it threw (m, with the lateral taper; breaking.onsetHeight): the pile's size and where
   * it lands. The crest's own H spikes along the crest where the reef focuses the swell, and the pile's long back drew
   * those spikes as ridges behind the crest. */
  lipHeight: number;
  /**
   * Where the front leans (setWaveModel.LEAN_RATIO, leanPhase): the leaned Phase 1 height here and its slope along ahead.
   * eta and slope above are then the unleaned wave's. The result is relative to the leaned one (it is the Phase 1 the
   * caller has); absent, the unleaned is Phase 1.
   */
  lean?: { eta: number; slope: number };
}

/**
 * The leaned front meets the drained hollow over this many H, so the join has no crease: where the leaned wave lies d
 * under the unleaned one the sheet goes down by leanRamp(d) (0 for d ≤ 0, d²/2k up to k, d − k/2 beyond), so it is the
 * unleaned wave exactly where that is the lower or they are equal (at the crest, and where the lean ends at the
 * trough), and the leaned one k/2 higher where it is clearly lower. A smooth minimum dipped k/4 below both where they
 * are equal: a 1.5 cm step along every leaning crest (θ = 0⁻ leans, 0 does not).
 */
export const LEAN_BLEND_H = 0.02;

/** How far the sheet goes down toward a leaned wave lying d under it, and its slope ∂/∂d ([0, 1]); LEAN_BLEND_H. */
export function leanRamp(d: number, k: number): { value: number; dD: number } {
  if (!(d > 0)) return { value: 0, dD: 0 };
  return d < k ? { value: (d * d) / (2 * k), dD: d / k } : { value: d - k / 2, dD: 1 };
}

export interface BreakPointResult {
  /** The final height (replaces the Phase 1 height). */
  eta: number;
  foam: number;
  /** ∂(eta − the Phase 1 height)/∂ahead: what breaking adds to the Phase 1 slope along travel (the leaned one's, i.lean). */
  dEtaDAhead: number;
  /** The pile's height (m) where it is the surface, 0 elsewhere: the churn's scale (render). */
  pile: number;
}

/**
 * Breaking at one point, for a crest in breaking state `lc` (lifecycle): the front sharpening (lc.steep × the crest
 * lookup's confidence), the drain and the bore. Neither steepening nor breaking (or H too small) returns the Phase 1
 * point exactly. With D the sharpening, R = drainDepth·drainShape(θ)·env the drain and S the bore scale (constant along
 * the cross-section), eta = (η − D − R)·S, and what breaking adds is eta − η = η·(S − 1) − (D + R)·S, differentiated
 * term by term along ahead; and the whitewater pile on top (spec 2026-09-29 §3.2), which lifts it toward the pile's height
 * by a smooth maximum.
 * Where the front leans (i.lean) the sheet is the lower of two, joined over LEAN_BLEND_H·H (leanRamp): the unleaned wave
 * sharpened and drained as above (so the drained hollow at the foot is where Andrew's traced anchors put it, 0.2 / 0.55 /
 * 0.7 H below still water), and the leaned wave sharpened, undrained (beyond the hollow, the trough the lean brings in to
 * the foot: the shelf the unleaned front left there, the "first swell", is gone). Drained on the leaned wave instead, the
 * water at 12 ft stood 0.85–0.93 H below still water; drained less to match, the hollow stood too high wherever the leaned
 * trough is not a full H under the crest (a settling crest, a shoulder) and the lip cut through the water there.
 */
export function breakPoint(i: BreakPointInput, lc: Lifecycle, p: BreakParams): BreakPointResult {
  const steep = lc.steep;
  if (!(steep > 0 || lc.stage > 0 || lc.drain > 0) || !(i.H > MIN_BREAKING_HEIGHT_M)) return { eta: i.lean?.eta ?? i.eta, foam: 0, dEtaDAhead: 0, pile: 0 };
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
  let base = (i.eta - drop - drain) * scale;
  // The base's whole slope along ahead (Phase 1's included).
  let slopeBase = (i.slope - dDrop - dDrain) * scale;
  if (i.lean) {
    const dropL = sharpenDrop(ahead, i.lean.eta, i.etaCrest, i.H, i.k, sharpen, p);
    const dDropL = sharpenDropSlope(ahead, i.lean.eta, i.lean.slope, i.etaCrest, i.H, i.k, sharpen, p);
    const leaned = (i.lean.eta - dropL) * scale, slopeLeaned = (i.lean.slope - dDropL) * scale;
    const r = leanRamp(base - leaned, LEAN_BLEND_H * i.H);
    base -= r.value;
    slopeBase -= r.dD * (slopeBase - slopeLeaned);
  }
  const dBase = slopeBase - (i.lean?.slope ?? i.slope);
  const out: BreakPointResult = { eta: base, foam: foamWeight(i.theta, ahead, i.H, i.env, c, p), dEtaDAhead: dBase, pile: 0 };
  // The whitewater pile (spec §3.2): the sheet lifted toward the pile's top T, most at its top (PILE_LAND_H·H ahead once
  // the curl has collapsed), fading over its front and back: eta = base + w·(smoothMax(base, T) − base), w = weight·g(v).
  // Where the wave under it is higher (the crest before it settles) the pile adds nothing.
  const floorTop = settledCrestTop(i.etaCrest, i.H, i.hmin, i.lateral, p);
  // Near its crest in phase (PILE_REACH): θ changes along ahead, so this weight's slope counts too.
  const phase = Math.abs(i.theta) / (2 * Math.PI);
  const near = 1 - smoothstep(PILE_REACH[0], PILE_REACH[1], phase);
  const dNear = (-smoothstepSlope(PILE_REACH[0], PILE_REACH[1], phase) * Math.sign(i.theta) * i.dThetaDAhead) / (2 * Math.PI);
  const crestWeight = lc.pile * i.crestConfidence * smoothstep(PILE_MIN_LIFT[0], PILE_MIN_LIFT[1], i.lipTop / Math.max(floorTop, 1e-6));
  const weight = crestWeight * near;
  if (weight > 0) {
    const T = pileTop(i.lipTop, floorTop, lc);
    const size = Math.max(i.lipHeight, MIN_BREAKING_HEIGHT_M);
    const { g, dg } = pileShape(ahead - PILE_LAND_H * size * lc.pileReach, size);
    const m = smoothMax(base, T, PILE_BLEND_H * size);
    const lift = m.value - base, w = weight * g;
    out.eta = base + w * lift;
    // d/dahead: the base's slope, + (weight·g)′·lift, + w·(dA − 1)·(the base's whole slope, Phase 1's included).
    out.dEtaDAhead = dBase + crestWeight * (dNear * g + near * dg) * lift + w * (m.dA - 1) * slopeBase;
    out.pile = w * (1 - m.dA) * T;
    out.foam = Math.max(out.foam, weight * smoothstep(PILE_FOAM_EDGE[0], PILE_FOAM_EDGE[1], g) * (1 - m.dA) * (PILE_FOAM_THIN + (1 - PILE_FOAM_THIN) * lc.decay));
  }
  return out;
}
