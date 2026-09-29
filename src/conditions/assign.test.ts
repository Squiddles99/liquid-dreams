import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, assignConditions, cloneConditions } from './defaults';
import { WEATHER_PRESETS } from '../weather/weather';

describe('the default conditions', () => {
  it('are a scattered-cumulus morning, and cloning copies the weather', () => {
    expect(DEFAULT_CONDITIONS.weather).toEqual(WEATHER_PRESETS.scattered);
    const c = cloneConditions(DEFAULT_CONDITIONS);
    expect(c.weather).toEqual(DEFAULT_CONDITIONS.weather);
    expect(c.weather).not.toBe(DEFAULT_CONDITIONS.weather);
  });
});

describe('assignConditions', () => {
  it('copies values while preserving object identities', () => {
    const target = cloneConditions(DEFAULT_CONDITIONS);
    const swell = target.swell, wind = target.wind, weather = target.weather;
    const source = { ...cloneConditions(DEFAULT_CONDITIONS), timeOfDay: 17, swell: { sizeFt: 6, periodS: 18, directionDeg: 230 }, wind: { speedMs: 0, directionDeg: 90 }, weather: { ...WEATHER_PRESETS.storm } };
    assignConditions(target, source);
    expect(target).toEqual(source);
    expect(target.swell).toBe(swell);
    expect(target.wind).toBe(wind);
    expect(target.weather).toBe(weather);
    expect(target.weather).not.toBe(source.weather);
    expect(target.swell).not.toBe(source.swell);
  });
});
