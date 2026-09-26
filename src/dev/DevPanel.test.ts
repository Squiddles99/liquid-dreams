import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { CONDITION_RANGES, sanitizeConditions } from '../conditions/sanitize';
import { CONDITION_BINDINGS } from './DevPanel';

describe('dev panel condition bindings never rewrite a loaded moment', () => {
  const keys = Object.keys(CONDITION_RANGES) as (keyof typeof CONDITION_RANGES)[];
  it('has a binding for every sanitised numeric condition', () => {
    expect(Object.keys(CONDITION_BINDINGS).sort()).toEqual([...keys].sort());
  });
  for (const key of keys) {
    it(`${key}: the slider range contains everything sanitize allows, with no step snapping`, () => {
      const b = CONDITION_BINDINGS[key], r = CONDITION_RANGES[key];
      expect(b.min).toBeLessThanOrEqual(r.min);
      expect(b.max).toBeGreaterThanOrEqual(r.max);
      expect('step' in b).toBe(false);
    });
  }
  it('whatever a link carries, the sanitised values sit inside the slider ranges', () => {
    for (const v of [-1e9, -359.5, -0.001, 0, 7 + 35 / 60, 22.5, 359.5, 1e9]) {
      const c = sanitizeConditions({ ...DEFAULT_CONDITIONS, timeOfDay: v, swell: { sizeFt: v, periodS: v, directionDeg: v }, wind: { speedMs: v, directionDeg: v } });
      const values: Record<keyof typeof CONDITION_RANGES, number> = {
        timeOfDay: c.timeOfDay, swellSizeFt: c.swell.sizeFt, swellPeriodS: c.swell.periodS,
        swellDirectionDeg: c.swell.directionDeg, windSpeedMs: c.wind.speedMs, windDirectionDeg: c.wind.directionDeg,
      };
      for (const key of keys) {
        expect(values[key]).toBeGreaterThanOrEqual(CONDITION_BINDINGS[key].min);
        expect(values[key]).toBeLessThanOrEqual(CONDITION_BINDINGS[key].max);
      }
    }
  });
});
