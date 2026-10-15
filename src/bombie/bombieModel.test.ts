import { describe, expect, it } from 'vitest';
import { surferFeetToHs } from '../conditions/units';
import { BOMBIE_CENTRE } from '../seabed/coastFeatures';
import { BOMBIE_X, BOMBIE_Z, BURST_LIFE_S, type BombieWaves, breaks, burstAt, burstWidthM, burstsAt, setIndicesFrom, setWindow, waveFactor } from './bombieModel';

const waves = (ft: number, thresholdFt = 6, setIndices: number[] = []): BombieWaves => ({
  tauS: 7.5, periodS: 15, hs: surferFeetToHs(ft), thresholdHs: surferFeetToHs(thresholdFt), seed: 2002, setIndices: new Set(setIndices),
});
const fraction = (w: BombieWaves) => { let k = 0; for (let n = 0; n < 20000; n++) if (breaks(n, w)) k++; return k / 20000; };

// The old mound's tests went with it (shelf-polish §7: one Bombie, the coast's; its bed is the coast map's).
describe('one Bombie', () => {
  it('the bursts sit on the coast map’s Bombie', () => {
    expect([BOMBIE_X, BOMBIE_Z]).toEqual([...BOMBIE_CENTRE]);
  });
});

describe('the Bombie’s waves', () => {
  it('each wave has its own factor, near 1 with the odd big one', () => {
    expect(waveFactor(12, 2002)).toBe(waveFactor(12, 2002));
    const f = Array.from({ length: 5000 }, (_, n) => waveFactor(n, 2002)).sort((a, b) => a - b);
    expect(f[2500]).toBeGreaterThan(0.9); expect(f[2500]).toBeLessThan(1.1);
    expect(f[4990]).toBeGreaterThan(2);
  });
  // With the dial set by the face (2026-10-02) 12 ft carries 2.2× 6 ft's swell (was 2×): it breaks on 50–75% of waves.
  it('never breaks below the threshold; a few percent at 6 ft; half or more at 12 ft', () => {
    expect(fraction(waves(5.9))).toBe(0);
    expect(fraction(waves(6))).toBeGreaterThan(0.02);
    expect(fraction(waves(6))).toBeLessThan(0.1);
    expect(fraction(waves(12))).toBeGreaterThan(0.35);
    expect(fraction(waves(12))).toBeLessThan(0.75);
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

describe('final review fixes', () => {
  it('the Womb set waves to skip are found around each wave’s peak arrival, whatever the sign of τ_B (I1)', () => {
    // Wave n passes the Bombie at τ_B + nT and the Womb's peak at about nT: with τ_B = −36.5 s, the waves bursting now
    // (age 0–40 s) reach the peak between t − 3.5 and t + 36.5.
    const T = 15, tauS = -36.5, t = 1000;
    const window = setWindow(t, tauS, T);
    expect(window.t0).toBeLessThanOrEqual(t - BURST_LIFE_S - tauS - T + 1e-9);
    expect(window.t1).toBeGreaterThanOrEqual(t - tauS + T - 1e-9);
    const idx = setIndicesFrom([{ arrivalS: 1030 }, { arrivalS: 1044.9 }, { arrivalS: 1200 }], T);
    expect([...idx].sort((a, b) => a - b)).toEqual([69, 70, 80]);
  });
  it('the latest two bursts are both kept, so a new break doesn’t wipe the last one’s roll (I4)', () => {
    const w = waves(12);
    const pairs = Array.from({ length: 2000 }, (_, n) => n).filter((n) => breaks(n, w) && breaks(n + 1, w));
    expect(pairs.length).toBeGreaterThan(0);
    const n = pairs[0], t = w.tauS + (n + 1) * w.periodS + 2;
    const both = burstsAt(t, w);
    expect(both.map((b) => b.n)).toEqual([n + 1, n]);
    expect(burstAt(t, w)).toEqual(both[0]);
    expect(burstsAt(t + BURST_LIFE_S, w).every((b) => b.ageS <= BURST_LIFE_S)).toBe(true);
    expect(burstsAt(t, null)).toEqual([]);
  });
});
