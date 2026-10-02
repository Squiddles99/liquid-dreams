import { describe, expect, it } from 'vitest';
import { computeFarField, farSample } from '../breaker/coastFarField';
import { beachHeight } from '../land/landHeight';
import { shoreReefWidth } from '../seabed/shoreReef';
import {
  BORE_RAMP_S, BORE_SPEED_MS, SURF_DZ, SURF_NZ, SURF_TABLE, SURF_Z0, SWASH_FRACTION, type SurfState, buildHeights, buildTauTable, heightOf, heightRange,
  lullHeight, runupOf, surfFoam, surfFoamFar, swashLevel, swashLift, swashShape, tableAt, waterEdgeOffset, wetLevel,
} from './surfModel';

const T = 15;
/** A coast whose τ grows 0.02 s per m of z (an oblique swell), with a set wave at n = 10. */
function state(amount = 1, hs = 1.6, enabled = true, tideM = 0, periodS = T): SurfState {
  const tau = buildTauTable((_x, z) => 0.02 * z);
  const tauMin = tau[0], tauMax = tau[SURF_NZ - 1];
  const table = buildHeights(heightRange(150, periodS, tauMin, tauMax), periodS, hs, [{ arrivalS: 150.4, heightM: 2.6 }], amount);
  return { tau, table, periodS, enabled, edgeM: waterEdgeOffset(tideM) };
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

describe('the water edge (final review I2: the surf follows the tide)', () => {
  it('is where the beach, or the seabed, meets the still water', () => {
    for (const tide of [-1.5, -0.5, 0, 0.8, 1.5]) {
      const e = waterEdgeOffset(tide);
      expect(beachHeight(-e)).toBeCloseTo(tide, 3); // beachHeight takes metres landward; e is metres seaward
    }
    expect(waterEdgeOffset(0)).toBeLessThan(0); // at mean tide the water meets the sand a few metres up the beach
    expect(waterEdgeOffset(-1.5)).toBeGreaterThan(20); // at low tide, well out on the platform
    expect(waterEdgeOffset(1.5)).toBeLessThan(-15); // at high tide, well up the beach
  });
});

describe('the heights', () => {
  it('a set wave breaks at 0.55 × its height at the index its arrival rounds to; lulls vary ±20%', () => {
    const s = state();
    expect(heightOf(s.table, 10)).toBeCloseTo(0.55 * 2.6, 6);
    for (let n = s.table.base; n < s.table.base + 300; n++) {
      if (n === 10) continue;
      const h = heightOf(s.table, n);
      expect(h).toBeGreaterThanOrEqual(0.45 * 1.6 * 0.8 - 1e-6);
      expect(h).toBeLessThanOrEqual(0.45 * 1.6 * 1.2 + 1e-6);
    }
    expect(lullHeight(7, 1.6)).toBe(lullHeight(7, 1.6));
  });
  it('surf amount scales every height; a flat swell or amount 0 gives none', () => {
    expect(heightOf(state(2).table, 10)).toBeCloseTo(2 * 0.55 * 2.6, 6);
    expect(heightOf(state(1, 0).table, 3)).toBe(0);
    const off = state(0);
    for (let n = off.table.base; n < off.table.base + 300; n += 17) expect(heightOf(off.table, n)).toBe(0);
  });
  it('the table covers the real coast at every period and swell direction the sliders allow (final review I1)', () => {
    for (const period of [4, 6, 8, 15, 20]) {
      for (const fromDeg of [180, 200, 225, 250, 270, 300, 330]) {
        const far = computeFarField(period, fromDeg, 0);
        const tau = buildTauTable((x, z) => farSample(far, x, z).tau);
        let tauMin = Infinity, tauMax = -Infinity;
        for (const v of tau) { tauMin = Math.min(tauMin, v); tauMax = Math.max(tauMax, v); }
        for (const t of [150, 4163]) {
          const r = heightRange(t, period, tauMin, tauMax);
          // Unclamped: the latest break anywhere and the sixth-latest arrival anywhere both inside the table.
          expect(r.hi).toBeGreaterThanOrEqual(Math.floor((t - tauMin) / period));
          expect(r.lo).toBeLessThanOrEqual(Math.floor((t - tauMax - 130 / BORE_SPEED_MS) / period) - 5);
          expect(r.hi - r.lo + 1, `T ${period} from ${fromDeg}`).toBeLessThanOrEqual(SURF_TABLE);
        }
      }
    }
  });
});

describe('the bores', () => {
  const s = state();
  const z = 0, W = shoreReefWidth(z), e = s.edgeM;
  const tBreak = 10 * T + tableAt(s.tau, z); // the set wave breaks here
  it('no foam outside the surf zone', () => {
    expect(surfFoam(W + 31, z, tBreak + 3, s)).toBe(0);
    expect(surfFoam(e - 6, z, tBreak + 3, s)).toBe(0);
  });
  it('a bore bursts at the break line when it breaks, then its front runs shoreward at 3.5 m/s', () => {
    expect(surfFoam(W, z, tBreak + 0.2, s)).toBeGreaterThan(surfFoam(W, z, tBreak - 0.2, s));
    const age = 8, df = W - BORE_SPEED_MS * age;
    expect(surfFoam(df, z, tBreak + age, s)).toBeGreaterThan(surfFoam(df - 6, z, tBreak + age, s));
    expect(surfFoam(df, z, tBreak + age, s)).toBeGreaterThan(0.5);
  });
  it('a bore\'s white water builds over its first moments, so the line thins out where the break has just reached (Andrew: no hard end)', () => {
    const tb = 9 * T + tableAt(s.tau, z); // a lull wave
    const front = (age: number): number => surfFoam(W - BORE_SPEED_MS * age, z, tb + age, s);
    expect(front(0.05)).toBeLessThan(0.3);
    expect(front(0.5)).toBeLessThan(front(1.0));
    expect(front(BORE_RAMP_S + 0.1)).toBeGreaterThan(0.8);
  });
  it('no foam trails seaward of where a bore broke (Andrew: no wedge out the back)', () => {
    const tb = 9 * T + tableAt(s.tau, z);
    expect(surfFoam(W + 8, z, tb + 3, s)).toBeLessThan(0.03);
    expect(surfFoam(W - 3, z, tb + 3, s)).toBeGreaterThan(0.1); // the trail behind the front is still there
  });
  it('even a between-sets bore front reads as solid white water (tuned in captures)', () => {
    const tb = 9 * T + tableAt(s.tau, z); // a lull wave
    const age = 6, df = W - BORE_SPEED_MS * age;
    expect(surfFoam(df, z, tb + age, s)).toBeGreaterThan(0.8);
  });
  it('at a short period every bore still reaches the water\'s edge (final review I3)', () => {
    const s6 = state(1, 1.6, true, 0, 6);
    const tb = 20 * 6 + tableAt(s6.tau, z);
    const age = (W - (e + 3)) / BORE_SPEED_MS; // its front 3 m from the water's edge, several periods after breaking
    expect(surfFoam(e + 3, z, tb + age, s6)).toBeGreaterThan(0.25); // a decayed front, well above the 0.18 lace alone
  });
  it('at low tide the bores run on to the water\'s edge out on the platform (final review I2)', () => {
    const lo = state(1, 1.6, true, -1.5);
    const tb = 9 * T + tableAt(lo.tau, z);
    const age = (W - (lo.edgeM + 2)) / BORE_SPEED_MS;
    expect(surfFoam(lo.edgeM + 2, z, tb + age, lo)).toBeGreaterThan(0.25);
    expect(surfFoam(lo.edgeM - 6, z, tb + age, lo)).toBe(0); // nothing on the exposed flat behind the water's edge
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
  const z = 0, W = shoreReefWidth(z), e = s.edgeM;
  const tArrive = 10 * T + tableAt(s.tau, z) + (W - e) / BORE_SPEED_MS;
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
  it('the wet line holds the latest runup right after, decays after, never negative; the lift is full at the water\'s edge and gone 40 m out', () => {
    const R = runupOf(0.55 * 2.6);
    expect(wetLevel(z, tArrive + 0.01, s)).toBeGreaterThanOrEqual(R * 0.99);
    expect(wetLevel(z, tArrive + 60, s)).toBeLessThan(R);
    expect(wetLevel(z, tArrive + 60, s)).toBeGreaterThan(0);
    expect(swashLift(e - 3, e)).toBe(1);
    expect(swashLift(e, e)).toBe(1);
    expect(swashLift(e + 40, e)).toBe(0);
    expect(swashLevel(z, tArrive + 1, state(1, 1.6, false))).toBe(0);
    expect(wetLevel(z, tArrive + 1, state(0))).toBe(0);
  });
});
