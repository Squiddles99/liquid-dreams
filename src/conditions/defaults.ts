import type { Conditions } from './types';
import { WEATHER_PRESETS } from '../weather/weather';

/** The Womb's peak (corrected by Andrew on 2026-09-26 from satellite references; ~190 m off the beach). */
export const WOMB_LOCATION = { latDeg: -33.895216, lonDeg: 114.983359 } as const;
export const AWST_UTC_OFFSET_HOURS = 8;

/** A winter morning session: sun low behind the dunes, light easterly offshore, scattered cumulus as the ridge builds after a front. */
export const DEFAULT_CONDITIONS: Readonly<Conditions> = Object.freeze({
  date: '2026-07-15',
  timeOfDay: 8.25,
  swell: Object.freeze({ sizeFt: 4, periodS: 15, directionDeg: 225 }),
  wind: Object.freeze({ speedMs: 3, directionDeg: 80 }),
  tideM: 0,
  seed: 2002,
  weather: WEATHER_PRESETS.scattered,
}) as Readonly<Conditions>;

export function cloneConditions(c: Readonly<Conditions>): Conditions {
  return { ...c, swell: { ...c.swell }, wind: { ...c.wind }, weather: { ...c.weather } };
}

/** Copy values in place, keeping target/target.swell/target.wind/target.weather identities (UI bindings hold them). */
export function assignConditions(target: Conditions, source: Readonly<Conditions>): void {
  target.date = source.date;
  target.timeOfDay = source.timeOfDay;
  target.tideM = source.tideM;
  target.seed = source.seed;
  Object.assign(target.swell, source.swell);
  Object.assign(target.wind, source.wind);
  Object.assign(target.weather, source.weather);
}
