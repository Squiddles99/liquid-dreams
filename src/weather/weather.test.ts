import { describe, expect, it } from 'vitest';
import { WEATHER_PRESETS, WEATHER_PRESET_NAMES, WEATHER_RANGES, presetOf, sanitizeWeather } from './weather';

describe('weather presets', () => {
  it('run from clear to sea mist, one per name', () => {
    expect(WEATHER_PRESET_NAMES[0]).toBe('clear');
    expect(WEATHER_PRESET_NAMES).toHaveLength(11);
    expect(Object.keys(WEATHER_PRESETS).sort()).toEqual([...WEATHER_PRESET_NAMES].sort());
  });

  it('lie inside the ranges and survive sanitising unchanged', () => {
    for (const name of WEATHER_PRESET_NAMES) {
      const w = WEATHER_PRESETS[name];
      for (const [k, r] of Object.entries(WEATHER_RANGES)) {
        const v = w[k as keyof typeof w];
        expect(v, `${name}.${k}`).toBeGreaterThanOrEqual(r.min);
        expect(v, `${name}.${k}`).toBeLessThanOrEqual(r.max);
      }
      expect(sanitizeWeather(w, WEATHER_PRESETS.clear)).toEqual(w);
    }
  });

  it('clear has no cloud, no rain and no extra haze', () => {
    const c = WEATHER_PRESETS.clear;
    expect([c.lowCover, c.midCover, c.highCover, c.rain, c.storm]).toEqual([0, 0, 0, 0, 0]);
    expect(c.visibilityKm).toBe(WEATHER_RANGES.visibilityKm.max);
  });

  it('are told apart by presetOf, and an edited preset is custom (null)', () => {
    for (const name of WEATHER_PRESET_NAMES) expect(presetOf(WEATHER_PRESETS[name])).toBe(name);
    expect(presetOf({ ...WEATHER_PRESETS.overcast, lowCover: 0.5 })).toBeNull();
  });
});

describe('sanitizeWeather', () => {
  it('gives the fallback for a missing or non-object block', () => {
    expect(sanitizeWeather(undefined, WEATHER_PRESETS.scattered)).toEqual(WEATHER_PRESETS.scattered);
    expect(sanitizeWeather('rainy', WEATHER_PRESETS.clear)).toEqual(WEATHER_PRESETS.clear);
  });

  it('fills missing and junk fields from the fallback, clamps and wraps the rest', () => {
    const w = sanitizeWeather({ lowCover: 3, rain: Number.NaN, visibilityKm: -1, windAloftDeg: 450, convection: 'tall' }, WEATHER_PRESETS.fair);
    expect(w.lowCover).toBe(1);
    expect(w.rain).toBe(WEATHER_PRESETS.fair.rain);
    expect(w.visibilityKm).toBe(WEATHER_RANGES.visibilityKm.min);
    expect(w.windAloftDeg).toBe(90);
    expect(w.convection).toBe(WEATHER_PRESETS.fair.convection);
    expect(w.midCover).toBe(WEATHER_PRESETS.fair.midCover);
  });

  it('returns a fresh object (never the fallback itself)', () => {
    expect(sanitizeWeather(undefined, WEATHER_PRESETS.clear)).not.toBe(WEATHER_PRESETS.clear);
  });
});
