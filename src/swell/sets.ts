import { createRng, deriveSeed } from '../conditions/rng';
import type { Conditions } from '../conditions/types';
import { surferFeetToHs } from '../conditions/units';

export interface SetParams {
  /** Mean time between set starts; one set per slot of this length. */
  meanIntervalS: number;
  /** A set starts this far either side of its slot's centre (±150 s gives 10–20 min between sets). */
  intervalJitterS: number;
  minWaves: number;
  maxWaves: number;
  /** Set waves are the biggest of the swell: deep-water height = Hs × a per-set factor in [min, max]. */
  heightFactorMin: number;
  heightFactorMax: number;
  /** Per-wave height variation (standard deviation, fraction); clipped at ±2σ. */
  waveHeightJitter: number;
  /** Wave spacing = period × (1 ± this). */
  spacingJitter: number;
  directionJitterDeg: number;
  periodJitter: number;
  /** Mean number of lone stray waves between sets. */
  straysPerLull: number;
  /** Stray height as a fraction of the smallest set factor. */
  strayHeightMin: number;
  strayHeightMax: number;
  crestLengthMinM: number;
  crestLengthMaxM: number;
}

export const DEFAULT_SET_PARAMS: SetParams = {
  meanIntervalS: 900,
  intervalJitterS: 150,
  minWaves: 4,
  maxWaves: 8,
  heightFactorMin: 1.3,
  heightFactorMax: 1.8,
  waveHeightJitter: 0.15,
  spacingJitter: 0.1,
  directionJitterDeg: 4,
  periodJitter: 0.05,
  straysPerLull: 1.5,
  strayHeightMin: 0.5,
  strayHeightMax: 0.7,
  crestLengthMinM: 300,
  crestLengthMaxM: 600,
};

/**
 * Keeps a SetParams internally consistent: min ≤ max for wave count and height factor, and the jitter no more than
 * half the mean interval, so a set can never start after the next one's (nextSetArrivalS assumes sets are in slot
 * order). Applied to panel edits and to a stored profile loaded from settings alike.
 */
export function normalizeSetParams(p: SetParams): void {
  if (p.minWaves > p.maxWaves) p.maxWaves = p.minWaves;
  if (p.heightFactorMin > p.heightFactorMax) p.heightFactorMax = p.heightFactorMin;
  p.intervalJitterS = Math.min(p.intervalJitterS, p.meanIntervalS / 2);
}

export interface WaveEvent {
  /** Stable per (slot, index): slot·64 + index; strays use 32 + n. */
  id: number;
  slot: number;
  /** −1 for strays. */
  indexInSet: number;
  /** Waves in this set; 0 for strays. */
  waveCount: number;
  /** Sim time (s) when this wave's crest reaches the peak. */
  arrivalS: number;
  /** Wave height (m) at the 30 m reference depth, before the reef shapes it. */
  heightM: number;
  periodS: number;
  /** Direction the wave comes FROM, degrees true. */
  fromDeg: number;
  crestLengthM: number;
  /** Sideways offset (m) of the crest's centre from the ray through the peak (matters in deep water only). */
  crestOffsetM: number;
  /** This wave leaves water a period behind it for the next to step on (setWaveModel.LONG_TAIL_WIDTH). */
  longTail: boolean;
}

/** A wave is in flight from this long before it reaches the peak (on the horizon)… */
export const WAVE_WINDOW_BEFORE_S = 300;
/** …until this long after (faded over the shelf). */
export const WAVE_WINDOW_AFTER_S = 60;
export const MAX_ACTIVE_WAVES = 12;
/** "Call a set now" lands this long before the set's first wave reaches the peak. */
export const CALL_SET_LEAD_S = 45;
/** Second guard against a runaway slot search (e.g. a corrupted SetParams with a near-zero meanIntervalS): the
 * clamp on a moment link's simTime keeps normal use far under this, but the search itself must never spin forever. */
const MAX_SLOT_SEARCH_ITERATIONS = 10_000;

const SET_SALT = 7000;
const STRAY_SALT = 9000;
const TAIL_SALT = 11000;
/** The share of set waves (all but each set's last, which has no wave behind it) that leave a long tail. */
export const LONG_TAIL_CHANCE = 1 / 12;
const uniformIn = (u: number, lo: number, hi: number): number => lo + u * (hi - lo);
const signed = (u: number): number => u * 2 - 1;

function slotRng(slot: number, c: Conditions, salt: number) {
  return createRng(deriveSeed(c.seed, salt + slot));
}

/** Start time of slot k's set (its first wave reaches the peak then). O(1) in k. */
export function setStartS(slot: number, c: Conditions, p: SetParams): number {
  const rng = slotRng(slot, c, SET_SALT);
  return slot * p.meanIntervalS + p.meanIntervalS / 2 + signed(rng.next()) * p.intervalJitterS;
}

export function wavesOfSet(slot: number, c: Conditions, p: SetParams): WaveEvent[] {
  const hs = surferFeetToHs(c.swell.sizeFt);
  if (hs <= 0) return [];
  const rng = slotRng(slot, c, SET_SALT);
  rng.next(); // the start offset, drawn by setStartS
  let t = setStartS(slot, c, p);
  const count = p.minWaves + Math.min(p.maxWaves - p.minWaves, Math.floor(rng.next() * (p.maxWaves - p.minWaves + 1)));
  const factor = uniformIn(rng.next(), p.heightFactorMin, p.heightFactorMax);
  const waves: WaveEvent[] = [];
  for (let i = 0; i < count; i++) {
    // Mid-set peaked envelope: the biggest waves arrive in the middle of the set (Andrew).
    const envelope = 0.72 + 0.28 * Math.sin((Math.PI * (i + 0.5)) / count);
    const jitter = Math.max(-2 * p.waveHeightJitter, Math.min(2 * p.waveHeightJitter, rng.gaussian() * p.waveHeightJitter));
    waves.push({
      id: slot * 64 + i,
      slot,
      indexInSet: i,
      waveCount: count,
      arrivalS: t,
      heightM: hs * factor * envelope * (1 + jitter),
      periodS: c.swell.periodS * (1 + signed(rng.next()) * p.periodJitter),
      fromDeg: c.swell.directionDeg + signed(rng.next()) * p.directionJitterDeg,
      crestLengthM: uniformIn(rng.next(), p.crestLengthMinM, p.crestLengthMaxM),
      crestOffsetM: signed(rng.next()) * 60,
      // Its own stream, so the draw leaves every other value of the set as it was.
      longTail: i < count - 1 && createRng(deriveSeed(c.seed, TAIL_SALT + slot * 64 + i)).next() < LONG_TAIL_CHANCE,
    });
    t += c.swell.periodS * (1 + signed(rng.next()) * p.spacingJitter);
  }
  return waves;
}

/** Lone waves in the lull after slot k's set, at least 90 s clear of either set. */
export function straysAfterSet(slot: number, c: Conditions, p: SetParams): WaveEvent[] {
  const set = wavesOfSet(slot, c, p);
  if (set.length === 0) return [];
  const rng = slotRng(slot, c, STRAY_SALT);
  const from = set[set.length - 1].arrivalS + 90;
  const to = setStartS(slot + 1, c, p) - 90;
  if (to <= from) return [];
  const count = Math.floor(p.straysPerLull + rng.next());
  const hs = surferFeetToHs(c.swell.sizeFt);
  const strays: WaveEvent[] = [];
  for (let n = 0; n < count; n++) {
    strays.push({
      id: slot * 64 + 32 + n,
      slot,
      indexInSet: -1,
      waveCount: 0,
      arrivalS: uniformIn(rng.next(), from, to),
      heightM: hs * p.heightFactorMin * uniformIn(rng.next(), p.strayHeightMin, p.strayHeightMax),
      periodS: c.swell.periodS * (1 + signed(rng.next()) * p.periodJitter),
      fromDeg: c.swell.directionDeg + signed(rng.next()) * p.directionJitterDeg,
      crestLengthM: uniformIn(rng.next(), p.crestLengthMinM, p.crestLengthMaxM),
      crestOffsetM: signed(rng.next()) * 60,
      longTail: false,
    });
  }
  return strays.sort((a, b) => a.arrivalS - b.arrivalS);
}

/** Every wave whose crest reaches the peak within [t − AFTER, t + BEFORE], sorted, capped (nearest first). */
export function wavesNear(t: number, c: Conditions, p: SetParams): WaveEvent[] {
  if (surferFeetToHs(c.swell.sizeFt) <= 0) return [];
  const setSpan = p.maxWaves * c.swell.periodS * (1 + p.spacingJitter);
  const k0 = Math.floor((t - WAVE_WINDOW_AFTER_S - setSpan - p.intervalJitterS - p.meanIntervalS) / p.meanIntervalS);
  const k1 = Math.ceil((t + WAVE_WINDOW_BEFORE_S + p.intervalJitterS) / p.meanIntervalS);
  const out: WaveEvent[] = [];
  for (let k = k0, tries = 0; k <= k1 && tries < MAX_SLOT_SEARCH_ITERATIONS; k++, tries++) {
    for (const w of [...wavesOfSet(k, c, p), ...straysAfterSet(k, c, p)]) {
      if (w.arrivalS >= t - WAVE_WINDOW_AFTER_S && w.arrivalS <= t + WAVE_WINDOW_BEFORE_S) out.push(w);
    }
  }
  out.sort((a, b) => a.arrivalS - b.arrivalS);
  if (out.length <= MAX_ACTIVE_WAVES) return out;
  return [...out].sort((a, b) => Math.abs(a.arrivalS - t) - Math.abs(b.arrivalS - t)).slice(0, MAX_ACTIVE_WAVES).sort((a, b) => a.arrivalS - b.arrivalS);
}

/**
 * Every wave whose crest reaches the peak within [t0, t1], sorted, uncapped (the coastal surf's height table spans
 * many sets; spec 2026-09-28-the-waterline-design.md §3.1). Empty for a flat swell.
 */
export function wavesBetween(t0: number, t1: number, c: Conditions, p: SetParams): WaveEvent[] {
  if (surferFeetToHs(c.swell.sizeFt) <= 0) return [];
  const setSpan = p.maxWaves * c.swell.periodS * (1 + p.spacingJitter);
  const k0 = Math.floor((t0 - setSpan - p.intervalJitterS - p.meanIntervalS) / p.meanIntervalS);
  const k1 = Math.ceil((t1 + p.intervalJitterS) / p.meanIntervalS);
  const out: WaveEvent[] = [];
  for (let k = k0; k <= k1; k++) {
    for (const w of [...wavesOfSet(k, c, p), ...straysAfterSet(k, c, p)]) if (w.arrivalS >= t0 && w.arrivalS <= t1) out.push(w);
  }
  return out.sort((a, b) => a.arrivalS - b.arrivalS);
}

/** When the first wave of the next set (starting after t) reaches the peak; null when the swell is flat (no sets). */
export function nextSetArrivalS(t: number, c: Conditions, p: SetParams): number | null {
  if (surferFeetToHs(c.swell.sizeFt) <= 0) return null;
  let k = Math.floor(t / p.meanIntervalS) - 1;
  for (let tries = 0; setStartS(k, c, p) <= t && tries < MAX_SLOT_SEARCH_ITERATIONS; tries++) k++;
  return setStartS(k, c, p);
}

/** The sim time "call a set now" jumps to; null when the swell is flat (no sets to call). */
export function callSetTime(t: number, c: Conditions, p: SetParams): number | null {
  const next = nextSetArrivalS(t, c, p);
  return next === null ? null : next - CALL_SET_LEAD_S;
}
