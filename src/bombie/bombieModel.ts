import { hash3 } from '../beach/procedural';
import { BOMBIE_CENTRE } from '../seabed/coastFeatures';

/**
 * Ellensbrook Bombie (spec 2026-09-28-the-bombie-design.md): on big days it bursts into white water on its own waves.
 * Atmospheric background, never surfable. One Bombie, the coast's (shelf-polish spec §7): the bursts sit on the coast
 * map's Bombie (coastFeatures.BOMBIE_CENTRE, 360 m off Ellensbrook) and fire only when the coast's breaking map breaks a
 * set there (App.bombieWaves: from 8 ft); its seabed is the coast map's. The old atmospheric mound at (−300, 340), inside
 * the reef map's south fade and breaking nowhere on the coast map, is gone.
 */
export const BOMBIE_X = BOMBIE_CENTRE[0];
export const BOMBIE_Z = BOMBIE_CENTRE[1];
export const BURST_LIFE_S = 40;
export const BURST_GROW_S = 3;
export const ROLL_SPEED_MS = 4;
/** Shoreward, east-north-east (unit). */
export const ROLL_DIR = [0.94, -0.34] as const;
const FACTOR_SPREAD = 0.35;
const BREAK_RATIO = 1.8;
const BREAK_HEIGHT = 0.55;

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

export interface Burst {
  n: number;
  ageS: number;
  heightM: number;
}

/**
 * The latest two breaks within BURST_LIFE_S of t, newest first: on a big day a new break comes before the last one's roll
 * has faded, and both show (final review I4).
 */
export function burstsAt(t: number, w: BombieWaves | null): Burst[] {
  const out: Burst[] = [];
  if (!w || w.hs <= 0 || w.periodS <= 0 || !Number.isFinite(w.tauS)) return out;
  const last = Math.floor((t - w.tauS) / w.periodS);
  for (let n = last; out.length < 2 && (t - (w.tauS + n * w.periodS)) <= BURST_LIFE_S; n--) {
    if (breaks(n, w)) out.push({ n, ageS: t - (w.tauS + n * w.periodS), heightM: BREAK_HEIGHT * w.hs * waveFactor(n, w.seed) });
  }
  return out;
}

/** The latest break within BURST_LIFE_S of t (its wave, age and breaking height), or null. */
export function burstAt(t: number, w: BombieWaves | null): Burst | null {
  return burstsAt(t, w)[0] ?? null;
}

/**
 * The sim-time window whose Womb set waves could share an index with a wave bursting the Bombie at t: wave n passes the
 * Bombie at τ_B + nT and the Womb's peak at about nT, so the bursting waves (age 0 to BURST_LIFE_S) reach the peak between
 * t − τ_B − BURST_LIFE_S and t − τ_B (± a period for the rounding). (Final review I1: the window was centred on t.)
 */
export function setWindow(t: number, tauS: number, periodS: number): { t0: number; t1: number } {
  return { t0: t - tauS - BURST_LIFE_S - periodS, t1: t - tauS + periodS };
}

/** The wave indices of the Womb's set waves (their arrival rounded to the swell period). */
export function setIndicesFrom(events: readonly { arrivalS: number }[], periodS: number): Set<number> {
  return new Set(events.map((e) => Math.round(e.arrivalS / periodS)));
}

/** The burst's full width: 30 m at the threshold's breaking height, growing to 60 m at twice it, × size. */
export function burstWidthM(heightM: number, thresholdHs: number, size: number): number {
  const h0 = BREAK_HEIGHT * BREAK_RATIO * thresholdHs;
  return 30 * Math.min(2, Math.max(1, heightM / h0)) * size;
}
