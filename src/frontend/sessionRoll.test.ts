// src/frontend/sessionRoll.test.ts
import { describe, expect, it } from 'vitest';
import {
  FIRST_PRESET, FROM_WINDOW, ROLL_SKIES, ROLL_WINDS, SESSION_PRESETS, SWELL_BANDS, TIDE_STOPS, TIME_STOPS,
  dateForMonth, excludedBy, fineRow, offered, presetById, rollSetup, stepPreset, stepRow, sunTimes, swellBand, timeOfDayFor,
} from './sessionSetup';

const TODAY = new Date('2026-10-03T10:00:00+08:00');
const winter = presetById(FIRST_PRESET)!.setup;

describe('editing the rows (dune select spec §5.4, §6)', () => {
  it('wraps the month', () => {
    expect(stepRow({ ...winter, month: 11 }, 'month', 1, TODAY).setup.month).toBe(0);
    expect(stepRow({ ...winter, month: 0 }, 'month', -1, TODAY).setup.month).toBe(11);
  });
  it('wraps the time stops, clearing the fine offset', () => {
    const r = stepRow({ ...winter, timeStop: TIME_STOPS.length - 1, timeFineMin: 30 }, 'time', 1, TODAY);
    expect(r.setup.timeStop).toBe(0);
    expect(r.setup.timeFineMin).toBe(0);
  });
  it('wraps the swell direction within its window', () => {
    expect(stepRow({ ...winter, fromDeg: 292 }, 'from', 1, TODAY).setup.fromDeg).toBe(202);
    expect(stepRow({ ...winter, fromDeg: 202 }, 'from', -1, TODAY).setup.fromDeg).toBe(292);
  });
  it('stops the sky, wind, swell, period and tide at their ends with a nudge', () => {
    expect(stepRow({ ...winter, wind: 0 }, 'wind', -1, TODAY)).toMatchObject({ changed: false, atEnd: true });
    expect(stepRow({ ...winter, tide: TIDE_STOPS.length - 1 }, 'tide', 1, TODAY)).toMatchObject({ changed: false, atEnd: true });
    expect(stepRow({ ...winter, sky: 'clear' }, 'sky', -1, TODAY)).toMatchObject({ changed: false, atEnd: true });
    expect(stepRow({ ...winter, periodS: 20 }, 'period', 1, TODAY)).toMatchObject({ changed: false, atEnd: true });
    expect(stepRow({ ...winter, swellFt: 12, periodS: 17 }, 'swell', 1, TODAY)).toMatchObject({ changed: false, atEnd: true });
  });
  it('steps the swell a band at a time, taking the band\'s size and period', () => {
    const r = stepRow(winter, 'swell', 1, TODAY).setup;
    expect(SWELL_BANDS[swellBand(r.swellFt)].label).toBe('Pumping');
    expect(r.swellFt).toBe(7);
    expect(r.periodS).toBe(15);
  });
  it('fine-tunes the swell in half feet, the word following the size, the period kept', () => {
    const r = fineRow({ ...winter, swellFt: 4.5, periodS: 15 }, 'swell', 1, TODAY).setup;
    expect(r.swellFt).toBe(5);
    expect(SWELL_BANDS[swellBand(r.swellFt)].label).toBe('Solid');
    expect(r.periodS).toBe(15);
    expect(fineRow({ ...winter, swellFt: 1 }, 'swell', -1, TODAY)).toMatchObject({ changed: false, atEnd: true });
  });
  it('fine-scrubs the time in 15 minutes, re-naming it by the nearest stop, never into the dark', () => {
    let s = { ...winter, timeStop: 2, timeFineMin: 0 };
    for (let k = 0; k < 6; k++) s = fineRow(s, 'time', 1, TODAY).setup;
    const date = dateForMonth(s.month, TODAY);
    expect(timeOfDayFor(s, date)).toBeCloseTo(12, 6);
    expect(TIME_STOPS[s.timeStop].label).toBe('Midday');
    let late = { ...winter, timeStop: TIME_STOPS.length - 1, timeFineMin: 0 };
    const r = fineRow(late, 'time', 1, TODAY);
    expect(r.atEnd).toBe(true);
    late = r.setup;
    expect(timeOfDayFor(late, date)).toBeLessThanOrEqual(sunTimes(date).sunsetH - 1 / 3 + 1e-9);
  });
  it('has no fine scale on the other rows', () => {
    expect(fineRow(winter, 'month', 1, TODAY).changed).toBe(false);
  });
  it('cycles the presets', () => {
    const ids = SESSION_PRESETS.map((p) => p.id);
    expect(stepPreset(ids[ids.length - 1], 1)).toBe(ids[0]);
    expect(stepPreset(null, 1)).toBe(ids[0]);
    expect(stepPreset(null, -1)).toBe(ids[ids.length - 1]);
  });
});

describe('Roll the dice (spec §6.9)', () => {
  it('is a pure function of the seed', () => {
    expect(rollSetup(1234)).toEqual(rollSetup(1234));
    expect(rollSetup(1234)).not.toEqual(rollSetup(1235));
  });
  it('over 10 000 seeds never rolls an excluded combination, and rolls every allowed value', () => {
    const seen = { month: new Set<number>(), time: new Set<number>(), sky: new Set<string>(), wind: new Set<number>(), band: new Set<number>(), from: new Set<number>(), tide: new Set<number>() };
    for (let seed = 1; seed <= 10000; seed++) {
      const s = rollSetup(seed);
      expect(excludedBy(s), `seed ${seed}`).toBeNull();
      seen.month.add(s.month); seen.time.add(s.timeStop); seen.sky.add(s.sky); seen.wind.add(s.wind);
      seen.band.add(swellBand(s.swellFt)); seen.from.add(s.fromDeg); seen.tide.add(s.tide);
    }
    expect(seen.month.size).toBe(12);
    expect(seen.time.size).toBe(TIME_STOPS.length);
    expect([...seen.sky].sort()).toEqual([...ROLL_SKIES].sort());
    expect([...seen.wind].sort()).toEqual([...ROLL_WINDS].sort());
    // Every band the select screen offers (small-swell Task 4: Flat-ish and Small do not break at the Womb).
    expect(seen.band.size).toBe(SWELL_BANDS.filter((_, b) => TIDE_STOPS.some((_, t) => offered(b, t))).length);
    expect(seen.from.size).toBe(FROM_WINDOW.length);
    expect(seen.tide.size).toBe(TIDE_STOPS.length);
  });
  it('names each exclusion', () => {
    expect(excludedBy({ ...winter, sky: 'storm' })).toBe('storm, rain or sea mist');
    expect(excludedBy({ ...winter, wind: 6 })).toBe('blown out');
    expect(excludedBy({ ...winter, swellFt: 12, tide: 0 })).toBe('huge at low tide');
    expect(excludedBy({ ...winter, swellFt: 1.5, wind: 5 })).toBe('flat-ish and onshore');
    expect(excludedBy(winter)).toBeNull();
  });
  it('rolls big winters and small summers', () => {
    let winterBig = 0, winterN = 0, summerSmall = 0, summerN = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const s = rollSetup(seed);
      if (s.month >= 5 && s.month <= 8) { winterN++; if (s.swellFt >= 5) winterBig++; }
      if (s.month === 11 || s.month <= 2) { summerN++; if (s.swellFt <= 4) summerSmall++; }
    }
    expect(winterBig / winterN).toBeGreaterThan(0.9);
    expect(summerSmall / summerN).toBeGreaterThan(0.9);
  });
});
