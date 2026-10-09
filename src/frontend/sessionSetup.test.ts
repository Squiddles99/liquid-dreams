// src/frontend/sessionSetup.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sunForConditions } from '../astro/sunForConditions';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { CONDITION_RANGES } from '../conditions/sanitize';
import { WEATHER_PRESETS } from '../weather/weather';
import {
  FIRST_PRESET, FROM_WINDOW, SESSION_PRESETS, SKY_ROWS, SWELL_BANDS, TIDE_STOPS, TIME_STOPS, WIND_ROWS,
  type SessionSetup, BREAKS, BREAKS_TIDES_M, dateForMonth, fineRow, offered, offeredSetup, presetById, presetOfSetup, rollSetup, rowDisplay, rowWords,
  stepRow, sunTimes, swellBand, timeOfDayFor, toConditions,
} from './sessionSetup';
import { sanitizeSetup } from './frontSettings';

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
    expect(rowDisplay(winter, 'month', TODAY)).toEqual({ value: 'July', small: 'Winter · big swells' });
    expect(rowDisplay({ ...winter, month: 0 }, 'month', TODAY)).toEqual({ value: 'January', small: 'Summer · sea breezes' });
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

describe('every word a row can show (the value box is sized to the longest, so the arrows stay put)', () => {
  const today = new Date('2026-07-10T09:00:00+08:00');
  it('lists each row\'s shown value for every value the row can take', () => {
    const base = presetById(SESSION_PRESETS[0].id)!.setup;
    const setups: SessionSetup[] = [...SESSION_PRESETS.map((p) => p.setup)];
    for (let k = 0; k < 300; k++) setups.push(rollSetup(k));
    for (let m = 0; m < 12; m++) setups.push({ ...base, month: m });
    for (let t = 0; t < TIME_STOPS.length; t++) setups.push({ ...base, timeStop: t });
    for (const r of SKY_ROWS) setups.push({ ...base, sky: r.id });
    for (let w = 0; w < WIND_ROWS.length; w++) setups.push({ ...base, wind: w });
    for (let ft = 1; ft <= 12; ft += 0.5) setups.push({ ...base, swellFt: ft });
    for (let p = 8; p <= 20; p++) setups.push({ ...base, periodS: p });
    for (const f of FROM_WINDOW) setups.push({ ...base, fromDeg: f });
    for (let t = 0; t < TIDE_STOPS.length; t++) setups.push({ ...base, tide: t });
    for (const row of ['preset', 'month', 'time', 'sky', 'wind', 'swell', 'period', 'from', 'tide'] as const) {
      const words = rowWords(row);
      for (const s of setups) expect(words, row).toContain(rowDisplay(s, row, today).value);
    }
  });
});

// Small-swell plan Task 4 (Andrew, 2026-10-09: "not offering a swell and tide option that won't break").
describe('only swell × tide pairs that break at the Womb are offered', () => {
  const bandOf = (s: SessionSetup): number => swellBand(s.swellFt);
  it('the table is the measured matrix (docs/superpowers/evidence/small-swell/t4-matrix.txt)', () => {
    const txt = readFileSync(resolve(__dirname, '../../docs/superpowers/evidence/small-swell/t4-matrix.txt'), 'utf8');
    const tides = JSON.parse(/^# tides \(m\): (.*)$/m.exec(txt)![1]), breaks = JSON.parse(/^# BREAKS: (.*)$/m.exec(txt)![1]);
    expect(BREAKS_TIDES_M).toEqual(tides);
    expect(BREAKS).toEqual(breaks);
    expect(Object.keys(BREAKS)).toEqual(SWELL_BANDS.map((b) => b.label));
    for (const t of TIDE_STOPS) expect(BREAKS_TIDES_M).toContain(t.m);
  });
  it('Flat-ish and Small are never offered; Fun and up are at every tide', () => {
    for (let tide = 0; tide < TIDE_STOPS.length; tide++) {
      expect(offered(0, tide)).toBe(false);
      expect(offered(1, tide)).toBe(false);
      for (let band = 2; band < SWELL_BANDS.length; band++) expect(offered(band, tide)).toBe(true);
    }
  });
  it('every pair Random rolls is offered (1 000 rolls)', () => {
    for (let k = 0; k < 1000; k++) {
      const s = rollSetup(k);
      expect(offered(bandOf(s), s.tide), `seed ${k}: ${s.swellFt} ft, tide ${s.tide}`).toBe(true);
    }
  });
  it('every preset is offered', () => {
    for (const p of SESSION_PRESETS) expect(offered(bandOf(p.setup), p.setup.tide), p.id).toBe(true);
  });
  it('left on the swell row stops at the first offered band; LT stops at its bottom half-foot', () => {
    const fun = { ...winter, swellFt: SWELL_BANDS[2].ft, periodS: SWELL_BANDS[2].periodS };
    expect(stepRow(fun, 'swell', -1, TODAY)).toEqual({ setup: fun, changed: false, atEnd: true });
    const three = { ...fun, swellFt: 3 };
    expect(fineRow(three, 'swell', -1, TODAY).atEnd).toBe(true);
    expect(stepRow(winter, 'swell', -1, TODAY).setup.swellFt).toBe(3.5);
  });
  it('a stored swell below the first offered band moves to it (the tide row and old saves)', () => {
    const flat = { ...winter, swellFt: 1.5, periodS: 9 };
    expect(offeredSetup(flat)).toEqual({ ...flat, swellFt: 3.5, periodS: 13 });
    expect(stepRow(flat, 'tide', 1, TODAY).setup.swellFt).toBe(3.5);
    expect(sanitizeSetup({ ...flat }).swellFt).toBe(3.5);
    expect(sanitizeSetup({ ...flat }).periodS).toBe(13);
    expect(sanitizeSetup({ ...winter }).swellFt).toBe(winter.swellFt);
  });
});
