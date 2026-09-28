import { smoothstep } from '../math/smoothstep';
import { SHORE_X } from '../seabed/coastProfile';
import { shoreReefWidth } from '../seabed/shoreReef';

/**
 * The coastal surf (spec 2026-09-28-the-waterline-design.md): one breaker per swell period at the shore platform's
 * edge, all along the coast, timed from the reef field's arrival time there, bigger when the Womb's sets come through;
 * each breaks into a bore that runs to the sand and up the beach. The CPU reference of CoastalSurf's TSL nodes.
 */
export const SURF_Z0 = -15000;
export const SURF_DZ = 25;
export const SURF_NZ = 1201;
export const SURF_TABLE = 256;
export const BORE_SPEED_MS = 3.5;
export const BORE_DECAY = 0.6;
export const H_REF_M = 1.5;
export const LULL_FACTOR = 0.45;
export const LULL_SPREAD = 0.2;
export const SET_FACTOR = 0.55;
export const RUNUP_PER_H = 0.25;
export const RUNUP_BASE_M = 0.05;
export const SWASH_FRACTION = 0.6;
export const SWASH_RISE = 0.25;
export const WET_DRY_S = 90;
export const WET_ARRIVALS = 6;
export const SURF_BEHIND_M = 5;
export const SURF_AHEAD_M = 30;
export const BURST_S = 1.5;
export const LIFT_REACH_M = 40;
export const FRONT_M = 2.5;
export const TRAIL_M = 12;
export const TRAIL_WEIGHT = 0.6;
export const LACE_WEIGHT = 0.25;
/** The time-average of a bore's front and trail over the zone, per unit strength (the band at a distance). */
export const DUTY = 0.3;
/** The widest platform plus a margin (m): how long a bore can take to reach the sand, for the tables' history. */
export const MAX_PLATFORM_M = 100;

export interface SurfParams {
  /** Scales every breaker's height. */
  amount: number;
  /** The surf on/off (for comparison captures). */
  enabled: boolean;
}

export const DEFAULT_SURF_PARAMS: Readonly<SurfParams> = { amount: 1, enabled: true };
export const SURF_PARAM_RANGES = { amount: { min: 0, max: 2 } } as const;

export function normalizeSurfParams(p: SurfParams): void {
  const r = SURF_PARAM_RANGES.amount;
  p.amount = Number.isFinite(p.amount) ? Math.min(r.max, Math.max(r.min, p.amount)) : DEFAULT_SURF_PARAMS.amount;
  p.enabled = p.enabled !== false;
}

/** τ_coast every SURF_DZ from SURF_Z0: the arrival time at the platform's edge, in field coordinates (x = 190 − W). */
export function buildTauTable(tauAt: (x: number, z: number) => number): Float32Array {
  const out = new Float32Array(SURF_NZ);
  for (let k = 0; k < SURF_NZ; k++) {
    const z = SURF_Z0 + k * SURF_DZ;
    out[k] = tauAt(SHORE_X - shoreReefWidth(z), z);
  }
  return out;
}

export function tableAt(tau: Float32Array, z: number): number {
  const f = Math.min(SURF_NZ - 1.001, Math.max(0, (z - SURF_Z0) / SURF_DZ));
  const i = Math.floor(f), u = f - i;
  return tau[i] * (1 - u) + tau[i + 1] * u;
}

/** Integer hash → [0, 1). */
export function hash01(n: number): number {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function lullHeight(n: number, hs: number): number {
  return LULL_FACTOR * hs * (1 - LULL_SPREAD + 2 * LULL_SPREAD * hash01(n));
}

/**
 * The wave indices the height table must cover at time t: from the sixth-latest arrival anywhere on the coast (the wet
 * line's history) to the latest break anywhere; at most SURF_TABLE, keeping the newest.
 */
export function heightRange(t: number, periodS: number, tauMin: number, tauMax: number): { lo: number; hi: number } {
  const hi = Math.floor((t - tauMin) / periodS) + 1;
  const lo = Math.floor((t - tauMax - MAX_PLATFORM_M / BORE_SPEED_MS) / periodS) - WET_ARRIVALS - 1;
  return { lo: Math.max(lo, hi - SURF_TABLE + 1), hi };
}

export interface SurfTable {
  base: number;
  heights: Float32Array;
  /** The mean height over the covered range (the far band's strength). */
  meanHeight: number;
}

export function buildHeights(r: { lo: number; hi: number }, periodS: number, hs: number, events: readonly { arrivalS: number; heightM: number }[], amount: number): SurfTable {
  const heights = new Float32Array(SURF_TABLE);
  for (let i = 0; i < SURF_TABLE; i++) heights[i] = lullHeight(r.lo + i, hs);
  for (const e of events) {
    const i = Math.round(e.arrivalS / periodS) - r.lo;
    if (i >= 0 && i < SURF_TABLE) heights[i] = Math.max(heights[i], SET_FACTOR * e.heightM);
  }
  let sum = 0;
  const count = Math.min(SURF_TABLE, r.hi - r.lo + 1);
  for (let i = 0; i < SURF_TABLE; i++) {
    heights[i] *= amount;
    if (i < count) sum += heights[i];
  }
  return { base: r.lo, heights, meanHeight: count > 0 ? sum / count : 0 };
}

export function heightOf(t: SurfTable, n: number): number {
  return t.heights[Math.min(SURF_TABLE - 1, Math.max(0, n - t.base))];
}

export interface SurfState {
  tau: Float32Array;
  table: SurfTable;
  periodS: number;
  enabled: boolean;
}

export function boreStrength(H: number, df: number, W: number): number {
  return (H / H_REF_M) * (1 - BORE_DECAY * (1 - df / W));
}

const zoneOf = (d: number, W: number): number => smoothstep(-SURF_BEHIND_M, 0, d) * (1 - smoothstep(W, W + 10, d));

/** The surf's foam weight d m seaward of the waterline at z, time t (CoastalSurf.foamNode's near branch). */
export function surfFoam(d: number, z: number, t: number, s: SurfState): number {
  if (!s.enabled) return 0;
  const W = shoreReefWidth(z);
  if (d < -SURF_BEHIND_M || d > W + SURF_AHEAD_M) return 0;
  const tau = tableAt(s.tau, z), T = s.periodS, nL = Math.floor((t - tau) / T);
  let foam = 0, recent = 0;
  for (let k = 0; k < 3; k++) {
    const n = nL - k, H = heightOf(s.table, n), age = t - (n * T + tau), df = W - BORE_SPEED_MS * age;
    if (k < 2) recent += (0.5 * H) / H_REF_M;
    if (df < 0) continue;
    const str = boreStrength(H, df, W);
    const front = Math.exp(-(((d - df) / FRONT_M) ** 2));
    const trail = d > df ? TRAIL_WEIGHT * Math.exp(-(d - df) / TRAIL_M) : 0;
    const burst = age < BURST_S ? (1 - age / BURST_S) * Math.exp(-(((d - W) / 6) ** 2)) : 0;
    foam = Math.max(foam, str * (front + trail + burst));
  }
  return Math.min(1, Math.max(foam, LACE_WEIGHT * recent * zoneOf(d, W)));
}

/** The steady band a distant pixel shows (the time-average), CoastalSurf.foamNode's far branch. */
export function surfFoamFar(d: number, z: number, s: SurfState): number {
  if (!s.enabled) return 0;
  return Math.min(1, ((DUTY * s.table.meanHeight) / H_REF_M) * zoneOf(d, shoreReefWidth(z)));
}

export function swashShape(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return u < SWASH_RISE ? smoothstep(0, SWASH_RISE, u) : 1 - smoothstep(SWASH_RISE, 1, u);
}

export function runupOf(H: number): number {
  return H > 0.01 ? RUNUP_PER_H * H + RUNUP_BASE_M : 0;
}

/** The time a wave's bore reaches the sand at z (its break time plus the crossing). */
const arrivalOffset = (s: SurfState, z: number): number => tableAt(s.tau, z) + shoreReefWidth(z) / BORE_SPEED_MS;

/** The swash's height above the tide at the shoreline at z: the max of the two latest arrivals. */
export function swashLevel(z: number, t: number, s: SurfState): number {
  if (!s.enabled) return 0;
  const off = arrivalOffset(s, z), T = s.periodS, Ts = SWASH_FRACTION * T, nL = Math.floor((t - off) / T);
  let r = 0;
  for (let k = 0; k < 2; k++) {
    const n = nL - k;
    r = Math.max(r, runupOf(heightOf(s.table, n)) * swashShape((t - (n * T + off)) / Ts));
  }
  return r;
}

/** How high up the beach the sand is still wet (m above the tide): the last six runups, drying over WET_DRY_S. */
export function wetLevel(z: number, t: number, s: SurfState): number {
  if (!s.enabled) return 0;
  const off = arrivalOffset(s, z), T = s.periodS, nL = Math.floor((t - off) / T);
  let w = 0;
  for (let k = 0; k < WET_ARRIVALS; k++) {
    const n = nL - k, age = t - (n * T + off);
    if (age >= 0) w = Math.max(w, runupOf(heightOf(s.table, n)) * Math.exp(-age / WET_DRY_S));
  }
  return w;
}

/** The share of the swash level the water surface takes d m seaward of the waterline (all of it on the beach). */
export function swashLift(d: number): number {
  return 1 - smoothstep(0, LIFT_REACH_M, d);
}
