// src/frontend/sessionSetup.ts
import { sunForConditions } from '../astro/sunForConditions';
import type { Conditions } from '../conditions/types';
import { sanitizeConditions } from '../conditions/sanitize';
import { WEATHER_PRESETS, type WeatherPresetName } from '../weather/weather';

/** One row of Conditions (dune select spec §4.1, §6); 'period' shows under Swell when the details are open. */
export type RowId = 'preset' | 'month' | 'time' | 'sky' | 'wind' | 'swell' | 'period' | 'from' | 'tide';

/** The player's choice, one value per row (spec §6). Indices are into the tables below. */
export interface SessionSetup {
  /** 0 = January. */
  month: number;
  /** Index into TIME_STOPS, and minutes either side of it (LT/RT scrub in 15-minute steps). */
  timeStop: number;
  timeFineMin: number;
  sky: WeatherPresetName;
  /** Index into WIND_ROWS. */
  wind: number;
  /** Surfer feet, in ½ ft steps, 1–12. */
  swellFt: number;
  /** Seconds, 8–20. */
  periodS: number;
  /** One of FROM_WINDOW. */
  fromDeg: number;
  /** Index into TIDE_STOPS. */
  tide: number;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** The named times (spec §6.2). First light and Sunset are found from the sun; the rest are clock hours. */
export const TIME_STOPS: readonly { id: string; label: string; hours: number | 'firstLight' | 'sunset' }[] = [
  { id: 'firstLight', label: 'First light', hours: 'firstLight' },
  { id: 'morning', label: 'Morning', hours: 8 },
  { id: 'midMorning', label: 'Mid-morning', hours: 10.5 },
  { id: 'midday', label: 'Midday', hours: 12.5 },
  { id: 'arvo', label: 'Arvo', hours: 15 },
  { id: 'lateArvo', label: 'Late arvo', hours: 16.5 },
  { id: 'sunset', label: 'Sunset', hours: 'sunset' },
];

/** The game's weather presets in the row's order, labelled in sentence case (spec §6.3). */
export const SKY_ROWS: readonly { id: WeatherPresetName; label: string }[] = [
  { id: 'clear', label: 'Clear' }, { id: 'fair', label: 'Fair' }, { id: 'scattered', label: 'Few clouds' },
  { id: 'broken', label: 'Broken cloud' }, { id: 'high cloud', label: 'High cloud' }, { id: 'overcast', label: 'Overcast' },
  { id: 'grey', label: 'Grey' }, { id: 'drizzle', label: 'Drizzle' }, { id: 'showers', label: 'Showers' },
  { id: 'rain', label: 'Rain' }, { id: 'storm', label: 'Storm' }, { id: 'sea mist', label: 'Sea mist' },
];

/** The coast faces west, so offshore is easterly (spec §6.4). `fromDeg` null: glassy, the direction irrelevant. */
export const WIND_ROWS: readonly { label: string; fromDeg: number | null; compass: string; kn: number }[] = [
  { label: 'Glassy', fromDeg: null, compass: '', kn: 1 },
  { label: 'Light offshore', fromDeg: 90, compass: 'E', kn: 6 },
  { label: 'Strong offshore', fromDeg: 90, compass: 'E', kn: 18 },
  { label: 'Cross-offshore', fromDeg: 135, compass: 'SE', kn: 10 },
  { label: 'Cross-shore', fromDeg: 180, compass: 'S', kn: 12 },
  { label: 'Onshore', fromDeg: 225, compass: 'SW', kn: 15 },
  { label: 'Blown out', fromDeg: 270, compass: 'W', kn: 22 },
];

/** The swell's words (spec §6.5): a size belongs to the last band whose minimum it reaches. */
export const SWELL_BANDS: readonly { label: string; minFt: number; maxFt: number; ft: number; periodS: number }[] = [
  { label: 'Flat-ish', minFt: 1, maxFt: 2, ft: 1.5, periodS: 9 },
  { label: 'Small', minFt: 2, maxFt: 3, ft: 2.5, periodS: 11 },
  { label: 'Fun', minFt: 3, maxFt: 4, ft: 3.5, periodS: 13 },
  { label: 'Solid', minFt: 5, maxFt: 6, ft: 5.5, periodS: 14 },
  { label: 'Pumping', minFt: 6, maxFt: 8, ft: 7, periodS: 15 },
  { label: 'Big', minFt: 8, maxFt: 10, ft: 9, periodS: 16 },
  { label: 'Huge', minFt: 10, maxFt: 12, ft: 12, periodS: 17 },
];

/** The break's sane swell window (spec §6.6). */
export const FROM_WINDOW = [202, 225, 247, 270, 292] as const;
const FROM_NAMES: Record<number, { label: string; compass: string }> = {
  202: { label: 'South-south-west', compass: 'SSW' }, 225: { label: 'South-west', compass: 'SW' },
  247: { label: 'West-south-west', compass: 'WSW' }, 270: { label: 'West', compass: 'W' }, 292: { label: 'West-north-west', compass: 'WNW' },
};

/** The tide stops (spec §6.7; the real coast's ~1 m range). Rising and falling are display-only. */
export const TIDE_STOPS: readonly { label: string; m: number; trend: 'rising' | 'falling' | 'slack' }[] = [
  { label: 'Low', m: -0.5, trend: 'slack' },
  { label: 'Low, pushing', m: -0.25, trend: 'rising' },
  { label: 'Mid', m: 0, trend: 'rising' },
  { label: 'High', m: 0.5, trend: 'slack' },
  { label: 'Mid, dropping', m: 0, trend: 'falling' },
  { label: 'Low, dropping', m: -0.25, trend: 'falling' },
];

const KN_TO_MS = 0.514444;

const setup = (month: number, timeStop: number, sky: WeatherPresetName, wind: number, band: number, fromDeg: number, tide: number): SessionSetup => ({
  month, timeStop, timeFineMin: 0, sky, wind, swellFt: SWELL_BANDS[band].ft, periodS: SWELL_BANDS[band].periodS, fromDeg, tide,
});

/** The presets (spec §6.8). */
export const SESSION_PRESETS: readonly { id: string; label: string; setup: SessionSetup }[] = [
  { id: 'dawnGlass', label: 'Dawn glass', setup: setup(3, 0, 'clear', 0, 2, 225, 2) },
  { id: 'winterOffshore', label: 'Winter offshore', setup: setup(6, 2, 'clear', 1, 3, 225, 1) },
  { id: 'bigWinterSwell', label: 'Big winter swell', setup: setup(6, 3, 'scattered', 1, 5, 247, 2) },
  { id: 'funArvo', label: 'Fun arvo', setup: setup(2, 4, 'fair', 3, 2, 225, 3) },
  { id: 'summerSeaBreeze', label: 'Summer sea breeze', setup: setup(0, 5, 'fair', 5, 1, 225, 4) },
  { id: 'moodyGrey', label: 'Moody and grey', setup: setup(7, 1, 'grey', 1, 4, 270, 2) },
];

export const FIRST_PRESET = 'winterOffshore';

export const presetById = (id: string): (typeof SESSION_PRESETS)[number] | undefined => SESSION_PRESETS.find((p) => p.id === id);

const sameSetup = (a: SessionSetup, b: SessionSetup): boolean =>
  a.month === b.month && a.timeStop === b.timeStop && a.timeFineMin === b.timeFineMin && a.sky === b.sky && a.wind === b.wind &&
  a.swellFt === b.swellFt && a.periodS === b.periodS && a.fromDeg === b.fromDeg && a.tide === b.tide;

/** The preset a setup is, or null ("Custom"). */
export function presetOfSetup(s: SessionSetup): string | null {
  return SESSION_PRESETS.find((p) => sameSetup(p.setup, s))?.id ?? null;
}

/** The 15th of the month's next occurrence (this month counts), AWST. */
export function dateForMonth(month: number, today: Date): string {
  const awst = new Date(today.getTime() + 8 * 3600e3);
  const y = awst.getUTCFullYear(), m = awst.getUTCMonth();
  const year = month >= m ? y : y + 1;
  return `${year}-${String(month + 1).padStart(2, '0')}-15`;
}

/** Sunrise and sunset (AWST hours, the sun's centre on the horizon) at the Womb, by bisection on its elevation. */
export function sunTimes(dateISO: string): { sunriseH: number; sunsetH: number } {
  const el = (h: number): number => sunForConditions({ date: dateISO, timeOfDay: h }).elevationDeg;
  const cross = (lo: number, hi: number): number => {
    const rising = el(hi) > el(lo);
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if ((el(mid) > 0) === rising) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  return { sunriseH: cross(3, 12), sunsetH: cross(12, 22) };
}

/** The setup's time of day (AWST hours) on its date: the stop plus the fine offset, kept between First light and Sunset. */
export function timeOfDayFor(s: SessionSetup, dateISO: string): number {
  const { sunriseH, sunsetH } = sunTimes(dateISO);
  const first = sunriseH + 0.25, last = sunsetH - 1 / 3;
  const stop = TIME_STOPS[s.timeStop].hours;
  const base = stop === 'firstLight' ? first : stop === 'sunset' ? last : stop;
  return Math.min(last, Math.max(first, base + s.timeFineMin / 60));
}

export function swellBand(ft: number): number {
  let i = 0;
  for (let k = 0; k < SWELL_BANDS.length; k++) if (ft >= SWELL_BANDS[k].minFt) i = k;
  return i;
}

/** The world's conditions for a setup, everything else (the seed) from `base`. Always inside CONDITION_RANGES. */
export function toConditions(s: SessionSetup, base: Readonly<Conditions>, today: Date): Conditions {
  const date = dateForMonth(s.month, today), wind = WIND_ROWS[s.wind];
  return sanitizeConditions({
    date,
    timeOfDay: timeOfDayFor(s, date),
    swell: { sizeFt: s.swellFt, periodS: s.periodS, directionDeg: s.fromDeg },
    wind: { speedMs: wind.kn * KN_TO_MS, directionDeg: wind.fromDeg ?? base.wind.directionDeg },
    tideM: TIDE_STOPS[s.tide].m,
    seed: base.seed,
    weather: { ...WEATHER_PRESETS[s.sky] },
  });
}

/** The sky's cloud cover, 0–1: the layers' covers combined. */
export function cloudCover(sky: WeatherPresetName): number {
  const w = WEATHER_PRESETS[sky];
  return 1 - (1 - w.lowCover) * (1 - w.midCover) * (1 - w.highCover);
}

const SEASONS = ['Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Winter', 'Winter', 'Winter', 'Winter', 'Spring', 'Spring', 'Summer'];
const HINTS: Record<number, string> = { 5: 'big swell season', 6: 'big swell season', 7: 'big swell season', 11: 'sea breeze season', 0: 'sea breeze season', 1: 'sea breeze season' };

/** "5½", "4": feet in halves. */
const feet = (ft: number): string => (Number.isInteger(ft) ? `${ft}` : `${Math.floor(ft)}½`);
const clock = (h: number): string => {
  const mins = Math.round(h * 60), hh = Math.floor(mins / 60) % 24, mm = mins % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
};
const metres = (m: number): string => `${m < 0 ? '−' : ''}${Math.abs(m).toFixed(1)} m`;

/** A row's word and its small number (spec §6). */
export function rowDisplay(s: SessionSetup, row: RowId, today: Date): { value: string; small: string } {
  switch (row) {
    case 'preset': {
      const id = presetOfSetup(s);
      return { value: id ? presetById(id)!.label : 'Custom', small: '' };
    }
    case 'month': {
      const hint = HINTS[s.month];
      return { value: MONTHS[s.month], small: hint ? `${SEASONS[s.month]} · ${hint}` : SEASONS[s.month] };
    }
    case 'time': {
      const date = dateForMonth(s.month, today);
      return { value: TIME_STOPS[s.timeStop].label, small: clock(timeOfDayFor(s, date)) };
    }
    case 'sky':
      return { value: SKY_ROWS.find((r) => r.id === s.sky)!.label, small: `${Math.round(cloudCover(s.sky) * 100)}% cloud` };
    case 'wind': {
      const w = WIND_ROWS[s.wind];
      return { value: w.label, small: w.compass ? `${w.kn} kn ${w.compass}` : `${w.kn} kn` };
    }
    case 'swell': {
      const b = SWELL_BANDS[swellBand(s.swellFt)];
      return { value: `${b.label} ${b.minFt}–${b.maxFt} ft`, small: `${feet(s.swellFt)} ft · ${s.periodS} s` };
    }
    case 'period':
      return { value: s.periodS < 10 ? 'Wind swell' : s.periodS < 14 ? 'Mid' : 'Groundswell', small: `${s.periodS} s` };
    case 'from': {
      const f = FROM_NAMES[s.fromDeg];
      return { value: f.label, small: `${f.compass} ${s.fromDeg}°` };
    }
    case 'tide': {
      const t = TIDE_STOPS[s.tide];
      return { value: t.label, small: metres(t.m) };
    }
  }
}
