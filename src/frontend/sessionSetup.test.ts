// src/frontend/sessionSetup.test.ts
import { describe, expect, it } from 'vitest';
import { sunForConditions } from '../astro/sunForConditions';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { CONDITION_RANGES } from '../conditions/sanitize';
import { WEATHER_PRESETS } from '../weather/weather';
import {
  FIRST_PRESET, FROM_WINDOW, SESSION_PRESETS, SKY_ROWS, SWELL_BANDS, TIDE_STOPS, TIME_STOPS, WIND_ROWS,
  type SessionSetup, dateForMonth, presetById, presetOfSetup, rowDisplay, sunTimes, swellBand, timeOfDayFor, toConditions,
} from './sessionSetup';

const TODAY = new Date('2026-10-03T10:00:00+08:00');
const winter = presetById(FIRST_PRESET)!.setup;

describe('the conditions model (dune select spec §6)', () => {
  it('starts on Winter offshore', () => {
    expect(FIRST_PRESET).toBe('winterOffshore');
    expect(presetById(FIRST_PRESET)!.label).toBe('Winter offshore');
  });
  it('puts a month on the 15th of its next occurrence', () => {
    expect(dateForMonth(9, TODAY)).toBe('2026-10-15');
    expect(dateForMonth(11, TODAY)).toBe('2026-12-15');
    expect(dateForMonth(6, TODAY)).toBe('2027-07-15');
  });
  it('finds sunrise and sunset at the Womb (AWST, no daylight saving)', () => {
    const jul = sunTimes('2027-07-15'), jan = sunTimes('2027-01-15');
    expect(jul.sunriseH).toBeGreaterThan(7.0); expect(jul.sunriseH).toBeLessThan(7.6);
    expect(jul.sunsetH).toBeGreaterThan(17.2); expect(jul.sunsetH).toBeLessThan(17.8);
    expect(jan.sunriseH).toBeGreaterThan(5.0); expect(jan.sunriseH).toBeLessThan(5.6);
    expect(jan.sunsetH).toBeGreaterThan(19.2); expect(jan.sunsetH).toBeLessThan(19.8);
  });
  it('keeps every time stop in daylight, every month', () => {
    for (let month = 0; month < 12; month++) {
      const date = dateForMonth(month, TODAY);
      for (let stop = 0; stop < TIME_STOPS.length; stop++) {
        const h = timeOfDayFor({ ...winter, month, timeStop: stop, timeFineMin: 0 }, date);
        expect(sunForConditions({ date, timeOfDay: h }).elevationDeg, `${month} ${TIME_STOPS[stop].label}`).toBeGreaterThan(0);
      }
    }
  });
  it('turns Winter offshore into the world\'s conditions', () => {
    const c = toConditions(winter, DEFAULT_CONDITIONS, TODAY);
    expect(c.date).toBe('2027-07-15');
    expect(c.timeOfDay).toBeCloseTo(10.5, 6);
    expect(c.weather).toEqual(WEATHER_PRESETS.clear);
    expect(c.wind.speedMs).toBeCloseTo(6 * 0.514444, 4);
    expect(c.wind.directionDeg).toBe(90);
    expect(c.swell).toEqual({ sizeFt: 5.5, periodS: 14, directionDeg: 225 });
    expect(c.tideM).toBe(-0.25);
    expect(c.seed).toBe(DEFAULT_CONDITIONS.seed);
  });
  it('keeps glassy\'s wind direction from the base conditions', () => {
    const c = toConditions({ ...winter, wind: 0 }, DEFAULT_CONDITIONS, TODAY);
    expect(c.wind.directionDeg).toBe(DEFAULT_CONDITIONS.wind.directionDeg);
    expect(c.wind.speedMs).toBeCloseTo(0.514444, 4);
  });
  it('writes every value of every row inside CONDITION_RANGES, the tide within ±0.5 m', () => {
    const vary: Partial<SessionSetup>[] = [
      ...Array.from({ length: 12 }, (_, month) => ({ month })),
      ...TIME_STOPS.map((_, timeStop) => ({ timeStop })),
      ...SKY_ROWS.map((r) => ({ sky: r.id })),
      ...WIND_ROWS.map((_, wind) => ({ wind })),
      ...SWELL_BANDS.map((b) => ({ swellFt: b.ft, periodS: b.periodS })),
      ...[8, 14, 20].map((periodS) => ({ periodS })),
      ...FROM_WINDOW.map((fromDeg) => ({ fromDeg })),
      ...TIDE_STOPS.map((_, tide) => ({ tide })),
    ];
    for (const v of vary) {
      const c = toConditions({ ...winter, ...v }, DEFAULT_CONDITIONS, TODAY);
      expect(c.swell.sizeFt).toBeGreaterThanOrEqual(CONDITION_RANGES.swellSizeFt.min);
      expect(c.swell.sizeFt).toBeLessThanOrEqual(CONDITION_RANGES.swellSizeFt.max);
      expect(c.swell.periodS).toBeGreaterThanOrEqual(CONDITION_RANGES.swellPeriodS.min);
      expect(c.swell.periodS).toBeLessThanOrEqual(CONDITION_RANGES.swellPeriodS.max);
      expect(c.wind.speedMs).toBeLessThanOrEqual(CONDITION_RANGES.windSpeedMs.max);
      expect(Math.abs(c.tideM)).toBeLessThanOrEqual(0.5);
      expect(c.timeOfDay).toBeGreaterThan(0);
      expect(c.timeOfDay).toBeLessThan(24);
    }
  });
  it('round-trips every row: each value it holds is the one the world gets', () => {
    for (const [tide, stop] of TIDE_STOPS.entries()) expect(toConditions({ ...winter, tide }, DEFAULT_CONDITIONS, TODAY).tideM).toBe(stop.m);
    for (const fromDeg of FROM_WINDOW) expect(toConditions({ ...winter, fromDeg }, DEFAULT_CONDITIONS, TODAY).swell.directionDeg).toBe(fromDeg);
    for (const r of SKY_ROWS) expect(toConditions({ ...winter, sky: r.id }, DEFAULT_CONDITIONS, TODAY).weather).toEqual(WEATHER_PRESETS[r.id]);
    for (const ft of [1, 1.5, 4, 7.5, 12]) expect(toConditions({ ...winter, swellFt: ft }, DEFAULT_CONDITIONS, TODAY).swell.sizeFt).toBe(ft);
  });
  it('names the swell band a size falls in', () => {
    expect(SWELL_BANDS[swellBand(1)].label).toBe('Flat-ish');
    expect(SWELL_BANDS[swellBand(2)].label).toBe('Small');
    expect(SWELL_BANDS[swellBand(3.5)].label).toBe('Fun');
    expect(SWELL_BANDS[swellBand(4.5)].label).toBe('Fun');
    expect(SWELL_BANDS[swellBand(5)].label).toBe('Solid');
    expect(SWELL_BANDS[swellBand(12)].label).toBe('Huge');
  });
  it('reads like a surf report: a word, then the number small', () => {
    expect(rowDisplay(winter, 'preset', TODAY)).toEqual({ value: 'Winter offshore', small: '' });
    expect(rowDisplay(winter, 'month', TODAY)).toEqual({ value: 'July', small: 'Winter · big swell season' });
    expect(rowDisplay({ ...winter, month: 0 }, 'month', TODAY)).toEqual({ value: 'January', small: 'Summer · sea breeze season' });
    expect(rowDisplay({ ...winter, month: 8 }, 'month', TODAY)).toEqual({ value: 'September', small: 'Winter' });
    expect(rowDisplay(winter, 'time', TODAY)).toEqual({ value: 'Mid-morning', small: '10:30 am' });
    expect(rowDisplay(winter, 'sky', TODAY)).toEqual({ value: 'Clear', small: '0% cloud' });
    expect(rowDisplay(winter, 'wind', TODAY)).toEqual({ value: 'Light offshore', small: '6 kn E' });
    expect(rowDisplay({ ...winter, wind: 0 }, 'wind', TODAY)).toEqual({ value: 'Glassy', small: '1 kn' });
    expect(rowDisplay(winter, 'swell', TODAY)).toEqual({ value: 'Solid 5–6 ft', small: '5½ ft · 14 s' });
    expect(rowDisplay(winter, 'period', TODAY)).toEqual({ value: 'Groundswell', small: '14 s' });
    expect(rowDisplay({ ...winter, periodS: 9 }, 'period', TODAY)).toEqual({ value: 'Wind swell', small: '9 s' });
    expect(rowDisplay(winter, 'from', TODAY)).toEqual({ value: 'South-west', small: 'SW 225°' });
    expect(rowDisplay(winter, 'tide', TODAY)).toEqual({ value: 'Low, pushing', small: '−0.3 m' });
    expect(rowDisplay({ ...winter, tide: 2 }, 'tide', TODAY)).toEqual({ value: 'Mid', small: '0.0 m' });
  });
  it('labels scattered cloud "Few clouds", with its cover as a percentage', () => {
    expect(rowDisplay({ ...winter, sky: 'scattered' }, 'sky', TODAY).value).toBe('Few clouds');
    expect(rowDisplay({ ...winter, sky: 'overcast' }, 'sky', TODAY).small).toMatch(/^\d+% cloud$/);
  });
  it('has the six presets of §6.8, each recognised as itself', () => {
    expect(SESSION_PRESETS.map((p) => p.label)).toEqual(['Dawn glass', 'Winter offshore', 'Big winter swell', 'Fun arvo', 'Summer sea breeze', 'Moody and grey']);
    for (const p of SESSION_PRESETS) expect(presetOfSetup(p.setup)).toBe(p.id);
    expect(presetOfSetup({ ...winter, tide: 3 })).toBeNull();
    expect(rowDisplay({ ...winter, tide: 3 }, 'preset', TODAY).value).toBe('Custom');
  });
});
