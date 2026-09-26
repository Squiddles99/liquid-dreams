import { describe, expect, it } from 'vitest';
import { EXPOSURE_KNOTS, computeExposure, exposureStopsForSun } from './exposure';

describe('exposure', () => {
  it('daylight uses the base exposure', () => {
    expect(computeExposure(45, 0.35, 0, true)).toBeCloseTo(0.35);
    expect(exposureStopsForSun(35)).toBe(0);
  });
  it('knots are ordered from high sun to low sun and never decrease in stops', () => {
    for (let i = 1; i < EXPOSURE_KNOTS.length; i++) {
      expect(EXPOSURE_KNOTS[i][0]).toBeLessThan(EXPOSURE_KNOTS[i - 1][0]);
      expect(EXPOSURE_KNOTS[i][1]).toBeGreaterThanOrEqual(EXPOSURE_KNOTS[i - 1][1]);
    }
  });
  it('opens up as the sun sets, never decreasing', () => {
    let prev = 0;
    for (let el = 60; el >= -30; el -= 0.5) {
      const s = exposureStopsForSun(el);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
  it('interpolates linearly between knots', () => {
    expect(exposureStopsForSun(-3)).toBeCloseTo(4.6); // halfway between (0, 2.2) and (-6, 7)
  });
  it('a low morning sun (the 08:15 hero moment) opens up about a stop, as a meter reading the dimmer sky would', () => {
    expect(exposureStopsForSun(8.5)).toBeGreaterThan(1);
    expect(exposureStopsForSun(8.5)).toBeLessThan(1.4);
  });
  it('deep night is capped at +11 stops (no runaway)', () => {
    expect(exposureStopsForSun(-90)).toBe(11);
    expect(computeExposure(-90, 0.35, 0, true)).toBeCloseTo(0.35 * 2 ** 11);
  });
  it('EV offset doubles per stop; manual mode ignores the sun', () => {
    expect(computeExposure(45, 0.35, 1, true)).toBeCloseTo(0.7);
    expect(computeExposure(-20, 0.35, 0, false)).toBeCloseTo(0.35);
  });
});
