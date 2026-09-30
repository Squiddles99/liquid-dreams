import { describe, expect, it } from 'vitest';
import { EXPOSURE_KNOTS, SUN_IN_VIEW_MAX_STOPS, UNDERWATER_EXPOSURE_GAIN, computeExposure, exposureStopsForSun, sunInViewStops, withUnderwater } from './exposure';

describe('exposure', () => {
  it('underwater the eye opens up by a fixed gain (the water is far darker than the sky the auto-exposure is set for); above water it is unchanged', () => {
    expect(withUnderwater(0.35, false)).toBe(0.35);
    expect(UNDERWATER_EXPOSURE_GAIN).toBeGreaterThan(1);
    expect(withUnderwater(0.35, true)).toBeCloseTo(0.35 * UNDERWATER_EXPOSURE_GAIN, 12);
  });
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

describe('sun-in-view metering', () => {
  const cosDeg = (d: number) => Math.cos((d * Math.PI) / 180);
  it('looking straight at a low sun stops down by the full amount', () => {
    expect(sunInViewStops(1, 6)).toBeCloseTo(SUN_IN_VIEW_MAX_STOPS);
  });
  it('facing away from the sun (the morning moments) changes nothing', () => {
    expect(sunInViewStops(cosDeg(90), 8.5)).toBe(0);
    expect(sunInViewStops(-1, 8.5)).toBe(0);
  });
  it('fades smoothly as the sun leaves the middle of the view', () => {
    const near = sunInViewStops(cosDeg(20), 6), far = sunInViewStops(cosDeg(40), 6);
    expect(near).toBeLessThan(SUN_IN_VIEW_MAX_STOPS);
    expect(far).toBeLessThan(near);
    expect(far).toBeGreaterThan(0);
    expect(sunInViewStops(cosDeg(60), 6)).toBe(0);
  });
  it('fades out as the sun sets, so twilight exposure is untouched', () => {
    expect(sunInViewStops(1, -3)).toBe(0);
    expect(sunInViewStops(1, 0)).toBeGreaterThan(0);
    expect(sunInViewStops(1, 0)).toBeLessThan(SUN_IN_VIEW_MAX_STOPS);
  });
  it('computeExposure adds the cloud stops in auto mode only', () => {
    expect(computeExposure(45, 1, 0, true, -1, 1.5)).toBeCloseTo(2 ** 1.5);
    expect(computeExposure(45, 1, 0, false, -1, 1.5)).toBeCloseTo(1);
  });
  it('a sun hidden by cloud does not stop the exposure down', () => {
    expect(computeExposure(6, 1, 0, true, 1, 0, 0)).toBeCloseTo(2 ** exposureStopsForSun(6));
    expect(computeExposure(6, 1, 0, true, 1, 0, 0.5)).toBeCloseTo(2 ** (exposureStopsForSun(6) - 0.5 * SUN_IN_VIEW_MAX_STOPS));
  });
  it('computeExposure subtracts it in auto mode only', () => {
    expect(computeExposure(6, 1, 0, true, 1)).toBeCloseTo(2 ** (exposureStopsForSun(6) - SUN_IN_VIEW_MAX_STOPS));
    expect(computeExposure(6, 1, 0, false, 1)).toBeCloseTo(1);
    expect(computeExposure(6, 1, 0, true)).toBeCloseTo(2 ** exposureStopsForSun(6));
  });
});
