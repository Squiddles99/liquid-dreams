import { describe, expect, it } from 'vitest';
import { surferFeetToHs } from '../conditions/units';
import { BOMBIE_X, BOMBIE_Z, BURST_LIFE_S, MOUND_BASE_Y, MOUND_CREST_Y, MOUND_HALF_X_M, MOUND_HALF_Z_M, type BombieWaves, breaks, burstAt, burstWidthM, moundY, waveFactor } from './bombieModel';

const waves = (ft: number, thresholdFt = 6, setIndices: number[] = []): BombieWaves => ({
  tauS: 7.5, periodS: 15, hs: surferFeetToHs(ft), thresholdHs: surferFeetToHs(thresholdFt), seed: 2002, setIndices: new Set(setIndices),
});
const fraction = (w: BombieWaves) => { let k = 0; for (let n = 0; n < 20000; n++) if (breaks(n, w)) k++; return k / 20000; };

describe('the mound', () => {
  it('crests 5 m below mean sea level at the centre and meets the bed at its oval edge', () => {
    expect(moundY(BOMBIE_X, BOMBIE_Z)).toBeCloseTo(MOUND_CREST_Y, 6);
    expect(moundY(BOMBIE_X + MOUND_HALF_X_M * 0.999, BOMBIE_Z)).toBeCloseTo(MOUND_BASE_Y, 1);
    expect(moundY(BOMBIE_X + MOUND_HALF_X_M + 1, BOMBIE_Z)).toBe(-Infinity);
    expect(moundY(BOMBIE_X, BOMBIE_Z + MOUND_HALF_Z_M + 1)).toBe(-Infinity);
    expect(moundY(BOMBIE_X, BOMBIE_Z + 30)).toBeGreaterThan(moundY(BOMBIE_X + 20, BOMBIE_Z)); // long along z
  });
});

describe('the Bombie’s waves', () => {
  it('each wave has its own factor, near 1 with the odd big one', () => {
    expect(waveFactor(12, 2002)).toBe(waveFactor(12, 2002));
    const f = Array.from({ length: 5000 }, (_, n) => waveFactor(n, 2002)).sort((a, b) => a - b);
    expect(f[2500]).toBeGreaterThan(0.9); expect(f[2500]).toBeLessThan(1.1);
    expect(f[4990]).toBeGreaterThan(2);
  });
  it('never breaks below the threshold; a few percent at 6 ft; about half at 12 ft', () => {
    expect(fraction(waves(5.9))).toBe(0);
    expect(fraction(waves(6))).toBeGreaterThan(0.02);
    expect(fraction(waves(6))).toBeLessThan(0.1);
    expect(fraction(waves(12))).toBeGreaterThan(0.35);
    expect(fraction(waves(12))).toBeLessThan(0.65);
    expect(fraction(waves(0))).toBe(0);
  });
  it('never breaks on a Womb set wave', () => {
    const all = waves(12);
    const setIdx = Array.from({ length: 200 }, (_, n) => n).filter((n) => breaks(n, all));
    const withSets = waves(12, 6, setIdx);
    for (const n of setIdx) expect(breaks(n, withSets)).toBe(false);
  });
  it('the threshold is read per call', () => {
    const lowered = Array.from({ length: 2000 }, (_, n) => n).filter((n) => breaks(n, waves(8, 4))).length;
    const raised = Array.from({ length: 2000 }, (_, n) => n).filter((n) => breaks(n, waves(8, 10))).length;
    expect(lowered).toBeGreaterThan(0);
    expect(raised).toBe(0);
  });
});

describe('burstAt', () => {
  const w = waves(12);
  const n = Array.from({ length: 400 }, (_, k) => k + 100).find((k) => breaks(k, w) && !breaks(k + 1, w) && !breaks(k + 2, w))!;
  const tn = w.tauS + n * w.periodS;
  it('is the latest break for 40 s, with its age and height, then nothing', () => {
    expect(burstAt(tn + 3, w)).toEqual({ n, ageS: 3, heightM: 0.55 * w.hs * waveFactor(n, w.seed) });
    // Past the next two (non-breaking) waves, still this one, until BURST_LIFE_S.
    const later = burstAt(tn + 2.5 * w.periodS, w);
    expect(later?.n).toBe(n);
    const k = Array.from({ length: 10 }, (_, j) => n + 3 + j).find((j) => breaks(j, w));
    if (k === undefined || (k - n) * w.periodS > BURST_LIFE_S) expect(burstAt(tn + BURST_LIFE_S + 0.01, w)).toBeNull();
  });
  it('is a pure function of time (Review Focus 2), and null without waves (Review Focus 1)', () => {
    expect(burstAt(tn + 5, w)).toEqual(burstAt(tn + 5, w));
    expect(burstAt(tn - 0.01, w)?.n ?? -1).not.toBe(n);
    expect(burstAt(tn + 5, null)).toBeNull();
    expect(burstAt(tn + 5, { ...w, hs: 0 })).toBeNull();
  });
  it('bursts are 30 m wide at the threshold break height, up to 60 m, times the size', () => {
    const t = surferFeetToHs(6);
    expect(burstWidthM(0.55 * t * 1.8, t, 1)).toBeCloseTo(30, 6);
    expect(burstWidthM(0.55 * t * 1.8 * 2, t, 1)).toBeCloseTo(60, 6);
    expect(burstWidthM(0.55 * t * 1.8 * 5, t, 1)).toBeCloseTo(60, 6);
    expect(burstWidthM(0.55 * t * 1.8, t, 2)).toBeCloseTo(60, 6);
  });
});
