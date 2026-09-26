import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { CONDITION_RANGES, sanitizeConditions } from '../conditions/sanitize';
import { msToKmh } from '../conditions/units';
import { CONDITION_BINDINGS, WIND_SPEED_KMH_BINDING } from './DevPanel';

describe('dev panel condition bindings never rewrite a loaded moment', () => {
  // windSpeedMs has no widget of its own: it's edited in km/h through WIND_SPEED_KMH_BINDING instead, checked below.
  const keys = (Object.keys(CONDITION_RANGES) as (keyof typeof CONDITION_RANGES)[]).filter((k) => k !== 'windSpeedMs');
  it('has a binding for every sanitised numeric condition besides wind speed', () => {
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
  it('windSpeedMs: the km/h widget range contains everything sanitize allows, with no step snapping', () => {
    const r = CONDITION_RANGES.windSpeedMs;
    expect(WIND_SPEED_KMH_BINDING.min).toBeLessThanOrEqual(msToKmh(r.min));
    expect(WIND_SPEED_KMH_BINDING.max).toBeGreaterThanOrEqual(msToKmh(r.max));
    expect('step' in WIND_SPEED_KMH_BINDING).toBe(false);
  });
  it('whatever a link carries, the sanitised values sit inside the slider ranges', () => {
    for (const v of [-1e9, -359.5, -0.001, 0, 7 + 35 / 60, 22.5, 359.5, 1e9]) {
      const c = sanitizeConditions({ ...DEFAULT_CONDITIONS, timeOfDay: v, tideM: v, swell: { sizeFt: v, periodS: v, directionDeg: v }, wind: { speedMs: v, directionDeg: v } });
      const values: Record<Exclude<keyof typeof CONDITION_RANGES, 'windSpeedMs'>, number> = {
        timeOfDay: c.timeOfDay, swellSizeFt: c.swell.sizeFt, swellPeriodS: c.swell.periodS,
        swellDirectionDeg: c.swell.directionDeg, windDirectionDeg: c.wind.directionDeg,
        tideM: c.tideM,
      };
      for (const key of keys) {
        expect(values[key]).toBeGreaterThanOrEqual(CONDITION_BINDINGS[key].min);
        expect(values[key]).toBeLessThanOrEqual(CONDITION_BINDINGS[key].max);
      }
      const kmh = msToKmh(c.wind.speedMs);
      expect(kmh).toBeGreaterThanOrEqual(WIND_SPEED_KMH_BINDING.min);
      expect(kmh).toBeLessThanOrEqual(WIND_SPEED_KMH_BINDING.max);
    }
  });
});
