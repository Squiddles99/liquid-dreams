import type { WeatherConditions } from './weather';

/**
 * Where it rains, and the storm's strikes (spec 2026-09-30 §4.8). Andrew: the Capes' grey rain sky is very often dry
 * at the lineup; the rain mostly falls once the clouds have crossed the coastline. cloudNodes.rainRateNode mirrors
 * rainRate on the GPU.
 */

/** The beach runs north–south here (world x, m); the land lies to +x (east). */
export const COAST_X_M = 200;
/** Rain over the open sea, as a fraction of the rain the same cloud drops over the land. */
export const SEA_RAIN = 0.3;
/**
 * The coastal factor rises from SEA_RAIN to 1 over this span around the coast (m): it starts at the beach and builds
 * over the dunes and the ridge (the air lifting over the land). Andrew: the rain falls once the clouds have passed the
 * coastline, so the lineup, 225 m offshore, gets only the sea's rain.
 */
export const COAST_RISE_M: readonly [number, number] = [-200, 2000];

const saturate = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export function coastFactor(x: number): number {
  return SEA_RAIN + (1 - SEA_RAIN) * smoothstep(COAST_X_M + COAST_RISE_M[0], COAST_X_M + COAST_RISE_M[1], x);
}

/**
 * Where the cloud rains (0..1), from the weather map's rain-cell noise and the low cloud's coverage there: showers and
 * storms rain from the strongest few cells; a flat deck (drizzle, frontal rain) from broad patches. No cloud, no rain.
 */
export function rainMask(cellNoise: number, coverage: number, convection: number): number {
  const convective = smoothstep(0.35, 0.65, convection);
  const cells = smoothstep(0.55, 0.9, cellNoise);
  const broad = smoothstep(0.3, 0.7, cellNoise);
  return (broad + (cells - broad) * convective) * saturate(coverage);
}

/** The rain rate (0..1) at world x under cloud with this cell noise and coverage. */
export function rainRate(w: Readonly<WeatherConditions>, x: number, cellNoise: number, coverage: number): number {
  return w.rain * rainMask(cellNoise, coverage, w.convection) * coastFactor(x);
}

/** Extinction (per m) of falling rain: a downpour (rate 1) leaves ~2 km of visibility, drizzle (0.2) ~5 km. */
export function rainExtinctionPerM(rate: number): number {
  return rate > 0 ? 2e-3 * rate ** 0.6 : 0;
}

/** Strikes a second in a full storm (storm = 1), within ~30 km: about five a minute. */
export const STRIKES_PER_S = 5 / 60;

export interface Strike {
  /** Sim time of the strike (s). */
  t: number;
  /** Compass bearing from the break (degrees true). */
  bearingDeg: number;
  distanceM: number;
  cloudToGround: boolean;
}

/** A well-mixed hash of three integers to [0, 1). */
function hash01(a: number, b: number, c: number): number {
  let h = (a * 0x9e3779b1) ^ (b * 0x85ebca77) ^ (c * 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The strikes in [t0, t1) for a seed and storm strength: whole seconds each hold at most one strike, decided by a hash
 * of the seed and the second, so any split of an interval gives the same strikes (a paused or scrubbed clock never
 * doubles or drops one).
 */
export function strikesBetween(seed: number, storm: number, t0: number, t1: number): Strike[] {
  const out: Strike[] = [];
  if (!(storm > 0) || !(t1 > t0)) return out;
  const p = 1 - Math.exp(-storm * STRIKES_PER_S);
  for (let k = Math.floor(t0); k < t1; k++) {
    if (hash01(seed, k, 0) >= p) continue;
    const t = k + hash01(seed, k, 1);
    if (t < t0 || t >= t1) continue;
    out.push({
      t,
      bearingDeg: hash01(seed, k, 2) * 360,
      distanceM: 1500 + 28_500 * hash01(seed, k, 3) ** 1.5,
      cloudToGround: hash01(seed, k, 4) < 0.3,
    });
  }
  return out;
}

export const SPEED_OF_SOUND_MS = 343;

export function thunderDelayS(distanceM: number): number {
  return distanceM / SPEED_OF_SOUND_MS;
}
