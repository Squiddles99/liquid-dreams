// src/frontend/conditionsSource.test.ts
import { describe, expect, it } from 'vitest';
import type { BreakBest } from '../breaks/breakData';
import { breakToday, conditionsNow, daySeed, inArc, nowOf, tideOf, todaysSetup } from './conditionsSource';
import { offeredSetup, presetById } from './sessionSetup';

const BEST: BreakBest = { swellFromDeg: [225, 270], sizeFt: [4, 10], windFromDeg: [45, 135], tide: ['mid'], level: 'advanced' };
const base = presetById('winterOffshore')!.setup;
const now = (o: Partial<ReturnType<typeof nowOf>>) => ({ ...nowOf(base), ...o });

describe('today', () => {
  it('is the same all day in WA and different the next day', () => {
    const a = new Date('2026-10-09T00:30:00+08:00'), b = new Date('2026-10-09T23:30:00+08:00'), c = new Date('2026-10-10T00:30:00+08:00');
    expect(daySeed(a)).toBe(daySeed(b)); expect(daySeed(a)).not.toBe(daySeed(c));
    expect(todaysSetup(a)).toEqual(todaysSetup(b));
  });
  it('only rolls a setup the Womb offers (it breaks)', () => {
    for (let d = 1; d <= 28; d++) { const s = todaysSetup(new Date(`2026-02-${String(d).padStart(2, '0')}T09:00:00+08:00`)); expect(offeredSetup(s)).toEqual(s); }
  });
});

describe('conditionsNow', () => {
  it('reads the forecast or the custom setup, and refuses real-time for now', () => {
    const custom = { ...base, swellFt: 9 };
    expect(conditionsNow('custom', { forecast: base, custom }).swellFt).toBe(9);
    expect(conditionsNow('forecast', { forecast: base, custom }).swellFt).toBe(base.swellFt);
    expect(() => conditionsNow('realtime', { forecast: base, custom })).toThrow(/real-time conditions are not available yet/);
  });
  it('says glassy with no direction (Review Focus 3)', () => {
    const c = nowOf({ ...base, wind: 0 });
    expect(c.windFromDeg).toBeNull(); expect(c.windLabel).toBe('Glassy');
  });
});

describe('inArc', () => {
  it('handles plain arcs and arcs across north (Review Focus 4)', () => {
    expect(inArc(250, [225, 270])).toBe(true); expect(inArc(200, [225, 270])).toBe(false);
    expect(inArc(350, [315, 45])).toBe(true); expect(inArc(10, [315, 45])).toBe(true); expect(inArc(180, [315, 45])).toBe(false);
    expect(inArc(225, [225, 270])).toBe(true); expect(inArc(270, [225, 270])).toBe(true);
  });
});

describe('tideOf', () => {
  it('splits the game tides into low / mid / high', () => {
    expect(tideOf(-0.5)).toBe('low'); expect(tideOf(-0.25)).toBe('low'); expect(tideOf(0)).toBe('mid'); expect(tideOf(0.5)).toBe('high');
  });
});

describe('breakToday', () => {
  it('is On with all four in range, and says why', () => {
    const r = breakToday(now({ swellFromDeg: 247, swellFt: 6, windFromDeg: 90, windMs: 3, tideM: 0 }), BEST);
    expect(r).toEqual({ verdict: 'on', reason: 'WSW swell and an offshore E wind' });
  });
  it('counts glassy as good wind', () => {
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 6, windFromDeg: null, windMs: 0.5, tideM: 0 }), BEST)).toEqual({ verdict: 'on', reason: 'WSW swell and glassy' });
  });
  it('is Fair with one miss and names it', () => {
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 6, windFromDeg: 270, windMs: 9, tideM: 0 }), BEST)).toEqual({ verdict: 'fair', reason: 'Wind onshore from the W' });
  });
  it('is Off with two or more misses and names them', () => {
    expect(breakToday(now({ swellFromDeg: 202, swellFt: 2, windFromDeg: 90, windMs: 3, tideM: 0 }), BEST))
      .toEqual({ verdict: 'off', reason: 'Swell from the SSW · Swell too small' });
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 12, windFromDeg: 90, windMs: 3, tideM: 0.5 }), BEST))
      .toEqual({ verdict: 'off', reason: 'Swell too big · Tide too high' });
  });
  it('treats the size range as inclusive at both ends', () => {
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 4, windFromDeg: 90, windMs: 3, tideM: 0 }), BEST).verdict).toBe('on');
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 10, windFromDeg: 90, windMs: 3, tideM: 0 }), BEST).verdict).toBe('on');
  });
});
