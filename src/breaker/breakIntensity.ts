import { travelDirectionXZ } from '../conditions/directions';
import { smoothstep } from '../math/smoothstep';
import type { BreakParams } from './breaking';

/**
 * Break intensity (spec 2026-09-30-condition-driven-barrel §3.2–3.3): one number per crest point, 0 gentle, 1 a normal
 * good day, 2 heavy, from the reef's step where the point breaks, the wind, the period, the wave's drain and a random
 * dial; and the barrel's shape from it, blended between three anchors. The source of truth: breakIntensityNodes.ts
 * mirrors it term by term on the GPU.
 */

/** The step (depth where a section starts to break ÷ the shallowest depth over 1.5 depths ahead) is clamped here. */
export const STEP_MIN = 1;
export const STEP_MAX = 3;
/** Step → intensity, piecewise linear through these (step, intensity) points; extrapolated past both ends. Fitted to the
 * baked reef (Andrew's ruling, 2026-09-30): the step at the peak tops out near 2.3 (low tide, 6–8 ft); 12 ft at mid tide
 * reads 1.8 (normal); a set too big for the tide breaks outside over the flat and reads 1.0–1.5. */
export const STEP_POINTS: readonly (readonly [number, number])[] = [[1.3, 0], [1.85, 1], [2.25, 2]];
/** The step a normal day's break reads (intensity 1). */
export const STEP_NORMAL = 1.85;
/** Offshore wind adds WIND_WEIGHT × clamp(offshore ÷ WIND_FULL_MS, −1, 1). */
export const WIND_WEIGHT = 0.25;
export const WIND_FULL_MS = 8;
/** The period adds PERIOD_WEIGHT × clamp((T − PERIOD_MID_S) ÷ PERIOD_SPAN_S, −1, 1). */
export const PERIOD_WEIGHT = 0.15;
export const PERIOD_MID_S = 12;
export const PERIOD_SPAN_S = 6;
/** The drain bonus: + LULL_BONUS after a long gap, − STACK_PENALTY close behind the wave before. */
export const LULL_BONUS = 0.1;
export const STACK_PENALTY = 0.3;
export const RANDOM_DIAL_MAX = 0.3;
export const INTENSITY_MAX = 2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function stepToIntensity(step: number): number {
  const s = clamp(step, STEP_MIN, STEP_MAX);
  const [[s0, i0], [s1, i1], [s2, i2]] = STEP_POINTS;
  return s <= s1 ? i0 + ((s - s0) * (i1 - i0)) / (s1 - s0) : i1 + ((s - s1) * (i2 - i1)) / (s2 - s1);
}

/** The wind's speed against the waves' travel (m/s): positive offshore (blowing into the waves' faces), negative onshore. */
export function offshoreSpeed(windSpeedMs: number, windFromDeg: number, travelX: number, travelZ: number): number {
  const toward = travelDirectionXZ(windFromDeg);
  return -windSpeedMs * (toward.x * travelX + toward.z * travelZ);
}

/** How drained the reef is when a wave arrives `gapS` after the one before it (Infinity: after a lull). */
export function drainBonus(gapS: number, periodS: number): number {
  const g = Number.isNaN(gapS) ? Infinity : Math.max(gapS, 0);
  return LULL_BONUS * smoothstep(periodS, 2 * periodS, g) - STACK_PENALTY * (1 - smoothstep(0.6 * periodS, periodS, g));
}

export interface IntensityInput {
  step: number;
  offshoreMs: number;
  periodS: number;
  /** The wave's drain bonus (drainBonus). */
  waveBonus: number;
  /** The wave's random draw in [−1, 1] (sets.WaveEvent.throwDraw). */
  throwDraw: number;
}

/** The crest point's intensity, clamped to [0, INTENSITY_MAX]. */
export function breakIntensity(i: IntensityInput, p: Pick<BreakParams, 'intensityNudge' | 'randomDial'>): number {
  const I = stepToIntensity(i.step)
    + WIND_WEIGHT * clamp(i.offshoreMs / WIND_FULL_MS, -1, 1)
    + PERIOD_WEIGHT * clamp((i.periodS - PERIOD_MID_S) / PERIOD_SPAN_S, -1, 1)
    + i.waveBonus + p.randomDial * i.throwDraw + p.intensityNudge;
  return clamp(I, 0, INTENSITY_MAX);
}

/** The shape inputs intensity sets (BreakParams' per-crest keys). */
export interface BarrelShape {
  throwStrength: number;
  lipThickness: number;
  /** The tube's back wall stands this many H behind the crest at full throw (negative: ahead of it). */
  wallBack: number;
  troughDrain: number;
  pileSurge: number;
}
export const PER_CREST_BREAK_KEYS: readonly (keyof BarrelShape)[] = ['throwStrength', 'lipThickness', 'wallBack', 'troughDrain', 'pileSurge'];

/**
 * The anchors (gentle, normal, heavy), calibrated 2026-09-30 by barrelAnchors.test.ts against the spec's measured
 * targets (§3.3: the biggest 12 ft set wave on the peak, at the lip's landing).
 */
export const ANCHORS: readonly [BarrelShape, BarrelShape, BarrelShape] = [
  { throwStrength: 0.7303, lipThickness: 0.1, wallBack: 0.7412, troughDrain: 0.2229, pileSurge: 0 },
  { throwStrength: 1.0696, lipThickness: 0.2, wallBack: 0.0282, troughDrain: 0.638, pileSurge: 0.3 },
  { throwStrength: 1.2571, lipThickness: 0.3, wallBack: -0.3, troughDrain: 0.8178, pileSurge: 0.45 },
];

/** The shape at `intensity`: anchor k at k, smoothstep-eased between neighbours (zero slope at each anchor). */
export function barrelShape(intensity: number, anchors: readonly BarrelShape[] = ANCHORS): BarrelShape {
  const I = clamp(intensity, 0, INTENSITY_MAX);
  const k = I < 1 ? 0 : 1;
  const t = smoothstep(0, 1, I - k);
  const a = anchors[k], b = anchors[k + 1];
  const out = {} as BarrelShape;
  for (const key of PER_CREST_BREAK_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}

/** `p` with its per-crest keys from shape `s` (a copy). */
export function withShape(p: BreakParams, s: BarrelShape): BreakParams {
  return { ...p, throwStrength: s.throwStrength, lipThickness: s.lipThickness, wallBack: s.wallBack, troughDrain: s.troughDrain, pileSurge: s.pileSurge };
}
