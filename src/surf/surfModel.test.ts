import { describe, expect, it } from 'vitest';
import { shoreReefWidth } from '../seabed/shoreReef';
import {
  BORE_SPEED_MS, SURF_NZ, SURF_TABLE, SURF_Z0, SURF_DZ, SWASH_FRACTION, type SurfState, buildHeights, buildTauTable, heightOf, heightRange,
  lullHeight, runupOf, surfFoam, surfFoamFar, swashLevel, swashLift, swashShape, tableAt, wetLevel,
} from './surfModel';

const T = 15;
/** A coast whose τ grows 0.02 s per m of z (an oblique swell), with a set wave at n = 10. */
function state(amount = 1, hs = 1.6, enabled = true): SurfState {
  const tau = buildTauTable((_x, z) => 0.02 * z);
  const tauMin = tau[0], tauMax = tau[SURF_NZ - 1];
  const table = buildHeights(heightRange(150, T, tauMin, tauMax), T, hs, [{ arrivalS: 150.4, heightM: 2.6 }], amount);
  return { tau, table, periodS: T, enabled };
}

describe('the τ table', () => {
  it('samples the field at the platform edge every 25 m, and interpolates between', () => {
    const seen: [number, number][] = [];
    const tau = buildTauTable((x, z) => { seen.push([x, z]); return x + z; });
    expect(tau.length).toBe(SURF_NZ);
    expect(seen[0]).toEqual([190 - shoreReefWidth(SURF_Z0), SURF_Z0]);
    expect(tableAt(tau, SURF_Z0 + SURF_DZ / 2)).toBeCloseTo((tau[0] + tau[1]) / 2, 3);
  });
});

describe('the heights', () => {
  it('a set wave breaks at 0.55 × its height at the index its arrival rounds to; lulls vary ±20%', () => {
    const s = state();
    expect(heightOf(s.table, 10)).toBeCloseTo(0.55 * 2.6, 6);
    for (let n = s.table.base; n < s.table.base + SURF_TABLE; n++) {
      if (n === 10) continue;
      const h = heightOf(s.table, n);
      expect(h).toBeGreaterThanOrEqual(0.45 * 1.6 * 0.8 - 1e-6);
      expect(h).toBeLessThanOrEqual(0.45 * 1.6 * 1.2 + 1e-6);
    }
    expect(lullHeight(7, 1.6)).toBe(lullHeight(7, 1.6));
  });
  it('surf amount scales every height; a flat swell or amount 0 gives none', () => {
    expect(heightOf(state(2).table, 10)).toBeCloseTo(2 * 0.55 * 2.6, 6);
    const flat = state(1, 0);
    expect(heightOf(flat.table, 3)).toBe(0);
    const off = state(0);
    for (let n = off.table.base; n < off.table.base + SURF_TABLE; n += 17) expect(heightOf(off.table, n)).toBe(0);
  });
  it('the range covers every break and arrival along the coast, even at t = 4163 s and T = 8 s', () => {
    for (const [t, period] of [[4163, 15], [4163, 8], [150, 20]]) {
      const tauMin = 0.02 * -15000, tauMax = 0.02 * 15000;
      const r = heightRange(t, period, tauMin, tauMax);
      expect(r.hi - r.lo + 1).toBeLessThanOrEqual(SURF_TABLE);
      // the latest break anywhere, and the sixth-latest arrival anywhere (the wet line's history)
      expect(r.hi).toBeGreaterThanOrEqual(Math.floor((t - tauMin) / period));
      expect(r.lo).toBeLessThanOrEqual(Math.floor((t - tauMax - 100 / BORE_SPEED_MS) / period) - 5);
    }
  });
});

describe('the bores', () => {
  const s = state();
  const z = 0, W = shoreReefWidth(z);
  const tBreak = 10 * T + tableAt(s.tau, z); // the set wave breaks here
  it('no foam outside the surf zone', () => {
    expect(surfFoam(W + 31, z, tBreak + 3, s)).toBe(0);
    expect(surfFoam(-6, z, tBreak + 3, s)).toBe(0);
  });
  it('a bore bursts at the break line when it breaks, then its front runs shoreward at 3.5 m/s', () => {
    expect(surfFoam(W, z, tBreak + 0.2, s)).toBeGreaterThan(surfFoam(W, z, tBreak - 0.2, s));
    const age = 8, df = W - BORE_SPEED_MS * age;
    expect(surfFoam(df, z, tBreak + age, s)).toBeGreaterThan(surfFoam(df - 6, z, tBreak + age, s));
    expect(surfFoam(df, z, tBreak + age, s)).toBeGreaterThan(0.5);
  });
  it('even a between-sets bore front reads as solid white water (tuned in captures)', () => {
    const tb = 9 * T + tableAt(s.tau, z); // a lull wave
    const age = 6, df = W - BORE_SPEED_MS * age;
    expect(surfFoam(df, z, tb + age, s)).toBeGreaterThan(0.8);
  });
  it('the far band is boosted at grazing views (white water stands up; seen side-on it covers more than its footprint)', () => {
    expect(surfFoamFar(W / 2, z, s, 0.005)).toBeGreaterThan(3 * surfFoamFar(W / 2, z, s, 1));
    expect(surfFoamFar(W / 2, z, s, 0.5)).toBeCloseTo(surfFoamFar(W / 2, z, s, 1), 6);
  });
  it('surf off gives no foam; the far band is steady and inside the zone', () => {
    expect(surfFoam(W / 2, z, tBreak + 5, state(1, 1.6, false))).toBe(0);
    expect(surfFoamFar(W / 2, z, s)).toBeGreaterThan(0);
    expect(surfFoamFar(W + 20, z, s)).toBe(0);
  });
});

describe('the swash and the wet line', () => {
  const s = state();
  const z = 0, W = shoreReefWidth(z);
  const tArrive = 10 * T + tableAt(s.tau, z) + W / BORE_SPEED_MS;
  const Ts = SWASH_FRACTION * T;
  it('the swash shape rises then drains, and is 0 outside its time', () => {
    expect(swashShape(-0.1)).toBe(0);
    expect(swashShape(0.25)).toBe(1);
    expect(swashShape(1)).toBe(0);
  });
  it('the set bore runs up to its runup, and is gone by the end of the swash', () => {
    const R = runupOf(0.55 * 2.6);
    expect(swashLevel(z, tArrive + 0.25 * Ts, s)).toBeCloseTo(R, 3);
    expect(swashLevel(z, tArrive - 0.01, s)).toBeLessThan(R);
    expect(runupOf(0)).toBe(0);
    // Long-period swell on a steepish beach runs up about half the breaker height plus 0.1 m (Stockdon-type estimate).
    expect(runupOf(1)).toBeCloseTo(0.6, 6);
  });
  it('the wet line holds the latest runup right after, decays after, never negative; the lift reaches 40 m out', () => {
    const R = runupOf(0.55 * 2.6);
    expect(wetLevel(z, tArrive + 0.01, s)).toBeGreaterThanOrEqual(R * 0.99);
    expect(wetLevel(z, tArrive + 60, s)).toBeLessThan(R);
    expect(wetLevel(z, tArrive + 60, s)).toBeGreaterThan(0);
    expect(swashLift(-3)).toBe(1);
    expect(swashLift(40)).toBe(0);
    expect(swashLevel(z, tArrive + 1, state(1, 1.6, false))).toBe(0);
    expect(wetLevel(z, tArrive + 1, state(0))).toBe(0);
  });
});
