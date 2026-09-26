import { describe, expect, it } from 'vitest';
import { computeExposure, exposureStopsForSun } from './exposure';

describe('exposure', () => {
  it('daylight uses the base exposure', () => {
    expect(computeExposure(45, 0.35, 0, true)).toBeCloseTo(0.35);
  });
  it('opens up as the sun sets, never decreasing', () => {
    let prev = 0;
    for (let el = 60; el >= -30; el -= 1) {
      const s = exposureStopsForSun(el);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
  it('deep night is capped at +6 stops (no runaway)', () => {
    expect(exposureStopsForSun(-90)).toBe(6);
    expect(computeExposure(-90, 0.35, 0, true)).toBeCloseTo(0.35 * 64);
  });
  it('EV offset doubles per stop; manual mode ignores the sun', () => {
    expect(computeExposure(45, 0.35, 1, true)).toBeCloseTo(0.7);
    expect(computeExposure(-20, 0.35, 0, false)).toBeCloseTo(0.35);
  });
});
