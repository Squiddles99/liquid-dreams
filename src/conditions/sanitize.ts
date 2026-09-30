import { DEFAULT_CONDITIONS } from './defaults';
import type { Conditions } from './types';
import { WEATHER_PRESETS, type WeatherConditions, sanitizeWeather } from '../weather/weather';

/** Valid range of every numeric condition the panel edits. Directions wrap into [0, 360) rather than clamp. */
export const CONDITION_RANGES = {
  timeOfDay: { min: 0, max: 23.999 },
  swellSizeFt: { min: 0, max: 12 },
  swellPeriodS: { min: 4, max: 25 },
  swellDirectionDeg: { min: 0, max: 360 },
  windSpeedMs: { min: 0, max: 30 },
  windDirectionDeg: { min: 0, max: 360 },
  tideM: { min: -1.5, max: 1.5 },
} as const;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const clampTo = (v: number, r: { min: number; max: number }): number => clamp(v, r.min, r.max);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

export function wrapDegrees(d: number): number {
  return ((d % 360) + 360) % 360;
}

function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Turn untrusted input (moment links, panel edits) into valid Conditions. Never throws. Conditions saved before weather
 * existed get `legacyWeather`: clear for a link (the sky it was made under), the default for a stored profile.
 */
export function sanitizeConditions(input: unknown, legacyWeather: Readonly<WeatherConditions> = WEATHER_PRESETS.clear): Conditions {
  const d = DEFAULT_CONDITIONS, R = CONDITION_RANGES;
  const o = obj(input);
  const swell = obj(o.swell);
  const wind = obj(o.wind);
  const seed = o.seed;
  return {
    date: isValidDate(o.date) ? o.date : d.date,
    timeOfDay: clampTo(num(o.timeOfDay, d.timeOfDay), R.timeOfDay),
    swell: {
      sizeFt: clampTo(num(swell.sizeFt, d.swell.sizeFt), R.swellSizeFt),
      periodS: clampTo(num(swell.periodS, d.swell.periodS), R.swellPeriodS),
      directionDeg: wrapDegrees(num(swell.directionDeg, d.swell.directionDeg)),
    },
    wind: {
      speedMs: clampTo(num(wind.speedMs, d.wind.speedMs), R.windSpeedMs),
      directionDeg: wrapDegrees(num(wind.directionDeg, d.wind.directionDeg)),
    },
    tideM: clampTo(num(o.tideM, d.tideM), R.tideM),
    seed: typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : d.seed,
    weather: sanitizeWeather(o.weather, legacyWeather),
  };
}
