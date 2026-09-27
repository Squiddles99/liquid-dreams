import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import {
  CALL_SET_LEAD_S, DEFAULT_SET_PARAMS, LONG_TAIL_CHANCE, MAX_ACTIVE_WAVES, WAVE_WINDOW_AFTER_S, WAVE_WINDOW_BEFORE_S,
  callSetTime, nextSetArrivalS, normalizeSetParams, setStartS, straysAfterSet, wavesNear, wavesOfSet,
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
  it('about one set wave in twelve leaves a long tail, never a set’s last wave or a stray, from its own stream', () => {
    let tails = 0, eligible = 0;
    for (let k = 0; k < 500; k++) {
      const set = wavesOfSet(k, c, p);
      set.forEach((w, i) => {
        if (i === set.length - 1) { expect(w.longTail).toBe(false); return; }
        eligible++;
        if (w.longTail) tails++;
      });
      for (const s of straysAfterSet(k, c, p)) expect(s.longTail).toBe(false);
    }
    expect(tails / eligible).toBeGreaterThan(LONG_TAIL_CHANCE * 0.7);
    expect(tails / eligible).toBeLessThan(LONG_TAIL_CHANCE * 1.3);
  });
  it('the long-tail draw leaves every other value of a set as it was (moments and links keep their waves)', () => {
    // Set 7 before long tails existed: arrival, height, period, direction.
    const before = [
      [6899.703634344041, 1.766931265481613, 14.869197402731515, 227.4528657440096],
      [6914.625778103946, 2.118789523277451, 15.00914928072598, 226.6081442590803],
      [6930.266002947232, 2.2602365973122005, 15.046715603442864, 228.80985841341317],
      [6944.835977240698, 2.702212658119099, 15.670435182633808, 227.51483340747654],
      [6958.517069519497, 2.7354583967470147, 15.647995336912572, 226.1670537739992],
      [6972.3907607879955, 1.8402944039459577, 14.849221127922647, 221.01972636952996],
    ];
    const set = wavesOfSet(7, c, p);
    expect(set.length).toBe(before.length);
    set.forEach((w, i) => {
      expect(w.arrivalS).toBeCloseTo(before[i][0], 9);
      expect(w.heightM).toBeCloseTo(before[i][1], 9);
      expect(w.periodS).toBeCloseTo(before[i][2], 9);
      expect(w.fromDeg).toBeCloseTo(before[i][3], 9);
    });
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
  it('answers instantly at huge times (moment links), even far past the link clamp', () => {
    for (const t of [1e6, 1e7, 1e12]) {
      const start = performance.now();
      const near = wavesNear(t, c, p);
      const next = nextSetArrivalS(t, c, p);
      expect(performance.now() - start).toBeLessThan(50);
      expect(Number.isFinite(next)).toBe(true);
      near.forEach((w) => expect(Number.isFinite(w.arrivalS)).toBe(true));
    }
  });
  it('finds the next set and the call-a-set jump time', () => {
    const t = 100;
    const next = nextSetArrivalS(t, c, p);
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThan(t);
    expect(callSetTime(t, c, p)).toBeCloseTo(next! - CALL_SET_LEAD_S, 9);
    expect(nextSetArrivalS(next! + 1, c, p)).toBeGreaterThan(next! + 500);
  });
  it('has no next set, and no call-a-set jump, for a flat swell', () => {
    const flat = cloneConditions(c);
    flat.swell.sizeFt = 0;
    expect(nextSetArrivalS(1000, flat, p)).toBeNull();
    expect(callSetTime(1000, flat, p)).toBeNull();
  });
  it('clamps interval jitter to at most half the mean interval, so sets stay in slot order', () => {
    const wild = { ...p, meanIntervalS: 200, intervalJitterS: 500 };
    normalizeSetParams(wild);
    expect(wild.intervalJitterS).toBe(100);
    const fine = { ...p, meanIntervalS: 900, intervalJitterS: 150 };
    normalizeSetParams(fine);
    expect(fine.intervalJitterS).toBe(150); // already within bounds: untouched
  });
});
