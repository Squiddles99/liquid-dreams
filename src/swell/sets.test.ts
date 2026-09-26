import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import {
  CALL_SET_LEAD_S, DEFAULT_SET_PARAMS, MAX_ACTIVE_WAVES, WAVE_WINDOW_AFTER_S, WAVE_WINDOW_BEFORE_S,
  callSetTime, nextSetArrivalS, setStartS, straysAfterSet, wavesNear, wavesOfSet,
} from './sets';

const c = DEFAULT_CONDITIONS, p = DEFAULT_SET_PARAMS;

describe('set timeline', () => {
  it('is deterministic and depends on the seed', () => {
    expect(wavesOfSet(3, c, p)).toEqual(wavesOfSet(3, c, p));
    const other = cloneConditions(c);
    other.seed = 7;
    expect(wavesOfSet(3, other, p)[0].arrivalS).not.toBe(wavesOfSet(3, c, p)[0].arrivalS);
  });
  it('spaces sets 10–20 minutes apart (Andrew)', () => {
    for (let k = 0; k < 300; k++) {
      const gap = setStartS(k + 1, c, p) - setStartS(k, c, p);
      expect(gap).toBeGreaterThanOrEqual(600 - 1e-9);
      expect(gap).toBeLessThanOrEqual(1200 + 1e-9);
    }
  });
  it('has 4–8 waves spaced about one period apart', () => {
    for (let k = 0; k < 200; k++) {
      const set = wavesOfSet(k, c, p);
      expect(set.length).toBeGreaterThanOrEqual(4);
      expect(set.length).toBeLessThanOrEqual(8);
      for (let i = 1; i < set.length; i++) {
        const dt = set[i].arrivalS - set[i - 1].arrivalS;
        expect(dt).toBeGreaterThanOrEqual(c.swell.periodS * (1 - p.spacingJitter) - 1e-9);
        expect(dt).toBeLessThanOrEqual(c.swell.periodS * (1 + p.spacingJitter) + 1e-9);
      }
    }
  });
  it('puts the biggest wave mid-set most of the time (Andrew)', () => {
    let mid = 0;
    const sets = 400;
    for (let k = 0; k < sets; k++) {
      const set = wavesOfSet(k, c, p);
      let best = 0;
      set.forEach((w, i) => { if (w.heightM > set[best].heightM) best = i; });
      const pos = (best + 0.5) / set.length;
      if (pos > 0.25 && pos < 0.75) mid++;
    }
    expect(mid / sets).toBeGreaterThan(0.6);
  });
  it('keeps set heights within the swell-derived bounds', () => {
    const hs = surferFeetToHs(c.swell.sizeFt);
    for (let k = 0; k < 200; k++) for (const w of wavesOfSet(k, c, p)) {
      expect(w.heightM).toBeGreaterThan(0);
      expect(w.heightM).toBeLessThanOrEqual(hs * p.heightFactorMax * (1 + 2 * p.waveHeightJitter) + 1e-9);
    }
  });
  it('has no waves for a flat swell', () => {
    const flat = cloneConditions(c);
    flat.swell.sizeFt = 0;
    expect(wavesOfSet(2, flat, p)).toEqual([]);
    expect(wavesNear(1000, flat, p)).toEqual([]);
  });
  it('places strays in the lull, smaller than the set', () => {
    for (let k = 0; k < 100; k++) {
      const set = wavesOfSet(k, c, p);
      const next = setStartS(k + 1, c, p);
      const meanSet = set.reduce((a, w) => a + w.heightM, 0) / set.length;
      for (const s of straysAfterSet(k, c, p)) {
        expect(s.indexInSet).toBe(-1);
        expect(s.arrivalS).toBeGreaterThan(set[set.length - 1].arrivalS);
        expect(s.arrivalS).toBeLessThan(next);
        expect(s.heightM).toBeLessThan(meanSet);
      }
    }
  });
  it('returns the waves in flight around a time, sorted and capped', () => {
    const t = wavesOfSet(4, c, p)[2].arrivalS;
    const near = wavesNear(t, c, p);
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThanOrEqual(MAX_ACTIVE_WAVES);
    for (const w of near) {
      expect(w.arrivalS).toBeGreaterThanOrEqual(t - WAVE_WINDOW_AFTER_S);
      expect(w.arrivalS).toBeLessThanOrEqual(t + WAVE_WINDOW_BEFORE_S);
    }
    for (let i = 1; i < near.length; i++) expect(near[i].arrivalS).toBeGreaterThanOrEqual(near[i - 1].arrivalS);
    expect(near.some((w) => w.id === wavesOfSet(4, c, p)[2].id)).toBe(true);
  });
  it('answers instantly at huge times (moment links)', () => {
    const start = performance.now();
    const near = wavesNear(1e7, c, p);
    const next = nextSetArrivalS(1e7, c, p);
    expect(performance.now() - start).toBeLessThan(50);
    expect(Number.isFinite(next)).toBe(true);
    near.forEach((w) => expect(Number.isFinite(w.arrivalS)).toBe(true));
  });
  it('finds the next set and the call-a-set jump time', () => {
    const t = 100;
    const next = nextSetArrivalS(t, c, p);
    expect(next).toBeGreaterThan(t);
    expect(callSetTime(t, c, p)).toBeCloseTo(next - CALL_SET_LEAD_S, 9);
    expect(nextSetArrivalS(next + 1, c, p)).toBeGreaterThan(next + 500);
  });
});
