import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import {
  CALL_SET_LEAD_S, DEFAULT_SET_PARAMS, MAX_ACTIVE_WAVES, WAVE_WINDOW_AFTER_S, WAVE_WINDOW_BEFORE_S,
  callSetTime, nextSetArrivalS, normalizeSetParams, selectScreenSetParams, setStartS, straysAfterSet, wavesNear, wavesOfSet,
  type WaveEvent, wavesBetween,
} from './sets';
import { toActiveWave } from '../breaker/setWaveModel';

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
  it('set 7 keeps its waves (moments and links keep their waves): long tails came and went on their own stream', () => {
    // Set 7 before long tails existed (2026-09) and after they were removed (2026-10-01): arrival, height, period, direction.
    // Heights as they were at Hs 1.6 m, scaled to the dial set by the face (2026-10-02): the timeline itself stays put.
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
      expect(w.heightM).toBeCloseTo((before[i][1] * surferFeetToHs(c.swell.sizeFt)) / 1.6, 9);
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
  it('on the select screen, rolls in a set of the chosen swell every 120 s, each clear of the next (Andrew)', () => {
    const into = { ...p };
    const custom = { ...p, meanIntervalS: 1800, intervalJitterS: 300, maxWaves: 6 };
    const dune = selectScreenSetParams(custom, into);
    expect(dune).toBe(into);
    expect(dune).toEqual({ ...custom, meanIntervalS: 120, intervalJitterS: 0 });
    expect(custom.meanIntervalS).toBe(1800); // the dev panel's own sets untouched
    for (const [ft, periodS] of [[3, 10], [5.5, 13]]) {
      const cc = cloneConditions(c);
      cc.swell.sizeFt = ft;
      cc.swell.periodS = periodS;
      for (let k = 0; k < 200; k++) {
        expect(setStartS(k + 1, cc, dune) - setStartS(k, cc, dune)).toBeCloseTo(120, 9);
        const set = wavesOfSet(k, cc, dune);
        expect(wavesOfSet(k + 1, cc, dune)[0].arrivalS - set[set.length - 1].arrivalS).toBeGreaterThan(periodS);
      }
      for (const t of [0, 777, 5000]) expect(nextSetArrivalS(t, cc, dune)! - t).toBeLessThanOrEqual(120 + 1e-9);
    }
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

describe('wavesBetween', () => {
  it('lists every wave arriving in the window, sorted and uncapped, including those wavesNear returns', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    const t0 = 1000, t1 = 3000;
    const all = wavesBetween(t0, t1, c, DEFAULT_SET_PARAMS);
    for (let i = 1; i < all.length; i++) expect(all[i].arrivalS).toBeGreaterThanOrEqual(all[i - 1].arrivalS);
    for (const w of all) { expect(w.arrivalS).toBeGreaterThanOrEqual(t0); expect(w.arrivalS).toBeLessThanOrEqual(t1); }
    for (const w of wavesNear(2000, c, DEFAULT_SET_PARAMS)) {
      if (w.arrivalS >= t0 && w.arrivalS <= t1) expect(all.some((a) => a.arrivalS === w.arrivalS)).toBe(true);
    }
    expect(all.length).toBeGreaterThan(8);
  });
  it('is empty for a flat swell', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = 0;
    expect(wavesBetween(0, 5000, c, DEFAULT_SET_PARAMS)).toEqual([]);
  });
});

describe('the set timeline stays put', () => {
  it('adding the throw draw and the gap leaves every other value of a set and its strays as it was', () => {
    const pick = (w: WaveEvent) => ({ id: w.id, arrivalS: +w.arrivalS.toFixed(6), heightM: +w.heightM.toFixed(6), periodS: +w.periodS.toFixed(6), fromDeg: +w.fromDeg.toFixed(6), crestLengthM: +w.crestLengthM.toFixed(3), crestOffsetM: +w.crestOffsetM.toFixed(3) });
    const all = [1, 2].flatMap((slot) => [...wavesOfSet(slot, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS), ...straysAfterSet(slot, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)]);
    expect(all.map(pick)).toMatchInlineSnapshot(`
      [
        {
          "arrivalS": 1406.339834,
          "crestLengthM": 6047.865,
          "crestOffsetM": 39.174,
          "fromDeg": 227.871434,
          "heightM": 1.488601,
          "id": 64,
          "periodS": 14.604369,
        },
        {
          "arrivalS": 1422.463099,
          "crestLengthM": 6566.946,
          "crestOffsetM": 56.692,
          "fromDeg": 223.814987,
          "heightM": 1.89544,
          "id": 65,
          "periodS": 15.247412,
        },
        {
          "arrivalS": 1438.044562,
          "crestLengthM": 6523.825,
          "crestOffsetM": 7.695,
          "fromDeg": 224.726223,
          "heightM": 1.936171,
          "id": 66,
          "periodS": 15.116214,
        },
        {
          "arrivalS": 1453.410468,
          "crestLengthM": 6966.987,
          "crestOffsetM": -28.178,
          "fromDeg": 221.939184,
          "heightM": 1.411958,
          "id": 67,
          "periodS": 15.12678,
        },
        {
          "arrivalS": 1467.485806,
          "crestLengthM": 5170.663,
          "crestOffsetM": 56.875,
          "fromDeg": 228.76911,
          "heightM": 1.9855,
          "id": 68,
          "periodS": 15.172427,
        },
        {
          "arrivalS": 1482.416242,
          "crestLengthM": 6246.521,
          "crestOffsetM": 44.335,
          "fromDeg": 221.040722,
          "heightM": 1.698431,
          "id": 69,
          "periodS": 14.505866,
        },
        {
          "arrivalS": 1497.666617,
          "crestLengthM": 6533.537,
          "crestOffsetM": -5.639,
          "fromDeg": 226.977551,
          "heightM": 1.389631,
          "id": 70,
          "periodS": 14.489902,
        },
        {
          "arrivalS": 1512.600005,
          "crestLengthM": 5038.609,
          "crestOffsetM": 32.03,
          "fromDeg": 226.115449,
          "heightM": 1.840774,
          "id": 71,
          "periodS": 15.301902,
        },
        {
          "arrivalS": 2230.54306,
          "crestLengthM": 5272.406,
          "crestOffsetM": -21.227,
          "fromDeg": 223.92009,
          "heightM": 0.935957,
          "id": 96,
          "periodS": 15.019401,
        },
        {
          "arrivalS": 2349.661137,
          "crestLengthM": 5726.816,
          "crestOffsetM": -44.067,
          "fromDeg": 225.8108,
          "heightM": 1.887734,
          "id": 128,
          "periodS": 14.92051,
        },
        {
          "arrivalS": 2365.735593,
          "crestLengthM": 6127.504,
          "crestOffsetM": 7.857,
          "fromDeg": 222.522179,
          "heightM": 1.834931,
          "id": 129,
          "periodS": 15.695873,
        },
        {
          "arrivalS": 2382.057724,
          "crestLengthM": 5833.808,
          "crestOffsetM": -34.335,
          "fromDeg": 224.30329,
          "heightM": 2.690853,
          "id": 130,
          "periodS": 14.843674,
        },
        {
          "arrivalS": 2397.87825,
          "crestLengthM": 6759.179,
          "crestOffsetM": -59.918,
          "fromDeg": 225.892682,
          "heightM": 2.252301,
          "id": 131,
          "periodS": 15.267188,
        },
        {
          "arrivalS": 2412.023509,
          "crestLengthM": 6928.98,
          "crestOffsetM": -27.939,
          "fromDeg": 224.25146,
          "heightM": 1.991813,
          "id": 132,
          "periodS": 14.755169,
        },
        {
          "arrivalS": 2427.817214,
          "crestLengthM": 6719.476,
          "crestOffsetM": -20.434,
          "fromDeg": 221.048811,
          "heightM": 1.426725,
          "id": 133,
          "periodS": 15.319954,
        },
        {
          "arrivalS": 2443.566801,
          "crestLengthM": 6428.932,
          "crestOffsetM": -32.442,
          "fromDeg": 223.750652,
          "heightM": 1.908112,
          "id": 134,
          "periodS": 14.432573,
        },
        {
          "arrivalS": 2535.543163,
          "crestLengthM": 6111.043,
          "crestOffsetM": 35.001,
          "fromDeg": 222.275557,
          "heightM": 0.976579,
          "id": 160,
          "periodS": 14.638017,
        },
      ]
    `);
  });
});

describe('the throw draw and the gap (condition-driven barrel)', () => {
  const set = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
  it('the first wave of a set follows a lull; each later one the gap to the one before', () => {
    expect(set[0].gapS).toBe(Infinity);
    for (let i = 1; i < set.length; i++) expect(set[i].gapS).toBeCloseTo(set[i].arrivalS - set[i - 1].arrivalS, 9);
  });
  it('strays follow a lull', () => {
    for (const s of straysAfterSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)) expect(s.gapS).toBe(Infinity);
  });
  it('each wave has its own repeatable draw in [−1, 1], not all the same', () => {
    const again = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
    set.forEach((w, i) => { expect(w.throwDraw).toBeGreaterThanOrEqual(-1); expect(w.throwDraw).toBeLessThanOrEqual(1); expect(again[i].throwDraw).toBe(w.throwDraw); });
    expect(new Set(set.map((w) => w.throwDraw)).size).toBeGreaterThan(1);
  });
  it('toActiveWave carries a finite drain factor (Infinity → ×1.1) and the draw', () => {
    const a = toActiveWave(set[0]);
    expect(a.drainFactor).toBeCloseTo(1.1, 9);
    expect(a.throwDraw).toBe(set[0].throwDraw);
    for (const w of set) expect(Number.isFinite(toActiveWave(w).drainFactor!)).toBe(true);
  });
});
