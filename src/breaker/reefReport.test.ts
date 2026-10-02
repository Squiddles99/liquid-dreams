import { describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { computeReefField } from './reefField';
import { firstBreak, firstBreakSeaward, furthestBreak, northLedgeBreakTimes, peakPsi, peelSpeed, rayProfile, setWaveHeight } from './reefReport';

// Reef-independent invariants: they hold on the softened ramp today and on the new reef after Task 3.
const bathy = buildBathymetry();
const mid = computeReefField({ bed: downsample(bathy, 2), periodS: 15, fromDeg: 225, tideM: 0 });

describe('the reef report (plan 2026-10-02 Task 1)', () => {
  it('a bigger swell has a bigger biggest set wave', () => {
    const h = [4, 6, 8, 10, 12].map(setWaveHeight);
    for (let i = 1; i < h.length; i++) expect(h[i]).toBeGreaterThan(h[i - 1]);
  });
  it('a bigger wave first breaks no further inshore on the peak’s ray (0.5 m steps)', () => {
    let prev = -Infinity;
    for (let H = 2; H <= 8; H += 0.5) {
      const d = firstBreakSeaward(mid, H);
      expect(d).toBeGreaterThanOrEqual(prev - 0.5);
      prev = Math.max(prev, d);
    }
  });
  it('a 5 cm wave breaks nowhere: no first break, no furthest break, no ψ', () => {
    expect(firstBreak(mid, 0.05)).toBeNull();
    expect(firstBreakSeaward(mid, 0.05)).toBe(-Infinity);
    expect(furthestBreak(mid, 0.05)).toBeNull();
    expect(peakPsi(mid, 0.05, false)).toBeNaN();
  });
  it('the north ledge is read every 5 m over its first 40 m; peel speed is span ÷ time', () => {
    expect(northLedgeBreakTimes(mid, setWaveHeight(6))).toHaveLength(9);
    expect(peelSpeed([0, 1, 2], 5)).toBe(5);
    expect(peelSpeed([3, 3.5, 4, 4.5, 5], 5)).toBe(10);
  });
  it('a lull drains the reef: ψ after a lull is above ψ inside a set', () => {
    const H = setWaveHeight(8);
    expect(peakPsi(mid, H, true)).toBeGreaterThan(peakPsi(mid, H, false));
  });
  it('the ray profile runs from inshore to seaward, 1 m apart, with the peak at s = 0', () => {
    const r = rayProfile(bathy, mid, 0, 0, 100, 20);
    expect(r).toHaveLength(121);
    expect(r[0][0]).toBe(-20);
    expect(r[20]).toEqual([0, expect.closeTo(6, 1)]);
    expect(r[120][0]).toBe(100);
  });
});
