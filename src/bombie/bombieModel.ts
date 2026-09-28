import { hash3 } from '../beach/procedural';
import { smoothstep } from '../math/smoothstep';

/**
 * Ellensbrook Bombie (spec 2026-09-28-the-bombie-design.md): a reef mound 450 m south-west of the Womb's peak that, on big
 * days, bursts into white water on its own waves. Atmospheric background, never surfable.
 */
export const BOMBIE_X = -300;
export const BOMBIE_Z = 340;
/** The mound's oval: long along z (the crests), 80 × 50 m; crest 5 m below mean sea level, meeting the ~25 m bed. */
export const MOUND_HALF_X_M = 25;
export const MOUND_HALF_Z_M = 40;
export const MOUND_CREST_Y = -5;
export const MOUND_BASE_Y = -26;
export const BURST_LIFE_S = 40;
export const BURST_GROW_S = 3;
export const ROLL_SPEED_MS = 4;
/** Shoreward, east-north-east (unit). */
export const ROLL_DIR = [0.94, -0.34] as const;
const FACTOR_SPREAD = 0.35;
const BREAK_RATIO = 1.8;
const BREAK_HEIGHT = 0.55;

export function moundY(x: number, z: number): number {
  const r = Math.hypot((x - BOMBIE_X) / MOUND_HALF_X_M, (z - BOMBIE_Z) / MOUND_HALF_Z_M);
  if (r >= 1) return -Infinity;
  return MOUND_CREST_Y + (MOUND_BASE_Y - MOUND_CREST_Y) * smoothstep(0, 1, r);
}

/** Wave n's own size factor at the Bombie: exp(0.35 g), g standard normal (Box–Muller on two hashes of n and the seed). */
export function waveFactor(n: number, seed: number): number {
  const u1 = Math.max(1e-9, hash3(n, seed, 0xb0b1)), u2 = hash3(n, seed, 0xb0b2);
  const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(FACTOR_SPREAD * g);
}

export interface BombieWaves {
  /** The far field's arrival time at the Bombie; wave n passes at tauS + n·periodS. */
  tauS: number;
  periodS: number;
  hs: number;
  thresholdHs: number;
  seed: number;
  /** Womb set-wave indices (round(arrivalS / T)): never the Bombie's. */
  setIndices: ReadonlySet<number>;
}

export function breaks(n: number, w: BombieWaves): boolean {
  if (w.hs <= 0 || w.hs < w.thresholdHs) return false;
  if (w.setIndices.has(n)) return false;
  return w.hs * waveFactor(n, w.seed) >= BREAK_RATIO * w.thresholdHs;
}

/** The latest break within BURST_LIFE_S of t (its wave, age and breaking height), or null. */
export function burstAt(t: number, w: BombieWaves | null): { n: number; ageS: number; heightM: number } | null {
  if (!w || w.hs <= 0 || w.periodS <= 0) return null;
  const last = Math.floor((t - w.tauS) / w.periodS);
  for (let n = last; (t - (w.tauS + n * w.periodS)) <= BURST_LIFE_S; n--) {
    if (breaks(n, w)) return { n, ageS: t - (w.tauS + n * w.periodS), heightM: BREAK_HEIGHT * w.hs * waveFactor(n, w.seed) };
  }
  return null;
}

/** The burst's full width: 30 m at the threshold's breaking height, growing to 60 m at twice it, × size. */
export function burstWidthM(heightM: number, thresholdHs: number, size: number): number {
  const h0 = BREAK_HEIGHT * BREAK_RATIO * thresholdHs;
  return 30 * Math.min(2, Math.max(1, heightM / h0)) * size;
}
