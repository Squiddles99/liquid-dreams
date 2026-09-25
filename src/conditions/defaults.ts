import type { Conditions } from './types';

export const WOMB_LOCATION = { latDeg: -33.8972366, lonDeg: 114.9832508 } as const;
export const AWST_UTC_OFFSET_HOURS = 8;

/** A winter morning session: sun low behind the dunes, light easterly offshore. */
export const DEFAULT_CONDITIONS: Readonly<Conditions> = Object.freeze({
  date: '2026-07-15',
  timeOfDay: 8.25,
  swell: Object.freeze({ sizeFt: 4, periodS: 15, directionDeg: 225 }),
  wind: Object.freeze({ speedMs: 3, directionDeg: 80 }),
  tideM: 0,
  seed: 2002,
}) as Readonly<Conditions>;

export function cloneConditions(c: Readonly<Conditions>): Conditions {
  return { ...c, swell: { ...c.swell }, wind: { ...c.wind } };
}
