import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from './defaults';
import { CONDITION_RANGES, sanitizeConditions, wrapDegrees } from './sanitize';
import { WEATHER_PRESETS } from '../weather/weather';

/** What a moment made before weather existed gets: the defaults under a clear sky. */
const legacy = { ...DEFAULT_CONDITIONS, weather: WEATHER_PRESETS.clear };

describe('sanitizeConditions', () => {
  it('returns defaults for non-objects', () => {
    expect(sanitizeConditions(undefined)).toEqual(legacy);
    expect(sanitizeConditions(null)).toEqual(legacy);
    expect(sanitizeConditions('nope')).toEqual(legacy);
  });
  it('gives conditions with no weather the legacy weather: clear unless told otherwise', () => {
    expect(sanitizeConditions({}).weather).toEqual(WEATHER_PRESETS.clear);
    expect(sanitizeConditions({}, WEATHER_PRESETS.scattered).weather).toEqual(WEATHER_PRESETS.scattered);
  });
  it('keeps and sanitises a weather block', () => {
    expect(sanitizeConditions({ weather: WEATHER_PRESETS.showers }).weather).toEqual(WEATHER_PRESETS.showers);
    expect(sanitizeConditions({ weather: { ...WEATHER_PRESETS.rain, lowCover: 7 } }).weather.lowCover).toBe(1);
  });
  it('keeps valid values', () => {
    const c = {
      date: '2026-04-20', timeOfDay: 9.5,
      swell: { sizeFt: 5, periodS: 17, directionDeg: 230 },
      wind: { speedMs: 0, directionDeg: 90 }, tideM: 0.4, seed: 7, weather: { ...WEATHER_PRESETS.broken },
    };
    expect(sanitizeConditions(c)).toEqual(c);
  });
  it('clamps out-of-range numbers', () => {
    const c = sanitizeConditions({ swell: { sizeFt: 50, periodS: 1 }, wind: { speedMs: -3 }, tideM: 9, timeOfDay: 30 });
    expect(c.swell.sizeFt).toBe(12);
    expect(c.swell.periodS).toBe(4);
    expect(c.wind.speedMs).toBe(0);
    expect(c.tideM).toBe(0.8);
    expect(c.timeOfDay).toBe(23.999);
  });
  it('replaces NaN / non-numbers with defaults', () => {
    const c = sanitizeConditions({ timeOfDay: Number.NaN, swell: { sizeFt: 'big' } });
    expect(c.timeOfDay).toBe(DEFAULT_CONDITIONS.timeOfDay);
    expect(c.swell.sizeFt).toBe(DEFAULT_CONDITIONS.swell.sizeFt);
  });
  it('wraps directions into [0, 360)', () => {
    const c = sanitizeConditions({ swell: { directionDeg: 370 }, wind: { directionDeg: -90 } });
    expect(c.swell.directionDeg).toBe(10);
    expect(c.wind.directionDeg).toBe(270);
    expect(wrapDegrees(360)).toBe(0);
  });
  it('rejects impossible dates', () => {
    expect(sanitizeConditions({ date: '2026-02-30' }).date).toBe(DEFAULT_CONDITIONS.date);
    expect(sanitizeConditions({ date: 'hello' }).date).toBe(DEFAULT_CONDITIONS.date);
  });
  it('rejects non-uint32 seeds', () => {
    expect(sanitizeConditions({ seed: 1.5 }).seed).toBe(DEFAULT_CONDITIONS.seed);
    expect(sanitizeConditions({ seed: 2 ** 32 }).seed).toBe(DEFAULT_CONDITIONS.seed);
    expect(sanitizeConditions({ seed: -1 }).seed).toBe(DEFAULT_CONDITIONS.seed);
  });
  it('does not share nested objects with DEFAULT_CONDITIONS', () => {
    const c = sanitizeConditions({});
    c.swell.sizeFt = 9;
    expect(DEFAULT_CONDITIONS.swell.sizeFt).toBe(4);
  });
});

describe('tide', () => {
  it('is clamped to the coast’s real range, ±0.8 m (small-swell Task 3: below that the shelf surfaces)', () => {
    expect(CONDITION_RANGES.tideM).toEqual({ min: -0.8, max: 0.8 });
    expect(sanitizeConditions({ ...DEFAULT_CONDITIONS, tideM: 9 }).tideM).toBe(0.8);
    expect(sanitizeConditions({ ...DEFAULT_CONDITIONS, tideM: -9 }).tideM).toBe(-0.8);
    expect(sanitizeConditions({ ...DEFAULT_CONDITIONS, tideM: 0.37 }).tideM).toBe(0.37);
  });
  it('opens Andrew’s link (tide −1.5 m) at −0.8 m', () => {
    expect(sanitizeConditions({ ...DEFAULT_CONDITIONS, tideM: -1.5 }).tideM).toBe(-0.8);
  });
});
