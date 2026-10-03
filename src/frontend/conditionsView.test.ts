// src/frontend/conditionsView.test.ts
import { describe, expect, it } from 'vitest';
import { conditionsView, lineFor, rollFrames, tideCurve } from './conditionsView';
import { type FrontState, focusTo, initialFront } from './frontEnd';
import { DEFAULT_CHOICES } from './frontSettings';
import { rollSetup, rowDisplay } from './sessionSetup';
import { SKY_GLYPHS } from './ui/skyGlyphs';
import { WEATHER_PRESET_NAMES } from '../weather/weather';

const today = new Date('2026-07-10T09:00:00+08:00');
const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), ...patch });

describe('the Conditions rows (spec §4.1)', () => {
  it('lists Preset, Month, Time, Sky, Wind, Swell, From, Tide, a gap under Preset, the focus on one row', () => {
    const v = conditionsView(front(), today);
    expect(v.map((r) => r.label)).toEqual(['Preset', 'Month', 'Time', 'Sky', 'Wind', 'Swell', 'From', 'Tide']);
    expect(v[0].gapAfter).toBe(true);
    expect(v.filter((r) => r.focused).length).toBe(1);
  });
  it('opens Period under Swell with the details', () => {
    expect(conditionsView(front({ detailsOpen: true }), today).map((r) => r.row)).toContain('period');
  });
  it('shows what rowDisplay says, word first and the number small', () => {
    const s = front(), v = conditionsView(s, today).find((r) => r.row === 'swell')!;
    expect(v).toMatchObject(rowDisplay(s.setup, 'swell', today));
  });
});

describe('the roll, the rider\'s lines and the tide curve', () => {
  it('ticks each row through 3–4 values and lands on the rolled one', () => {
    for (const row of ['sky', 'wind', 'swell', 'tide'] as const) {
      const f = rollFrames(42, row, today);
      expect(f.length).toBeGreaterThanOrEqual(3);
      expect(f.length).toBeLessThanOrEqual(4);
      expect(f[f.length - 1]).toBe(rowDisplay(rollSetup(42), row, today).value);
    }
  });
  it('rotates the speaker and never says an empty line', () => {
    const speakers = new Set([0, 1, 2, 3, 4, 5].map((k) => lineFor(front(), 'swell', k).speaker));
    expect(speakers.size).toBe(3);
    for (let k = 0; k < 30; k++) expect(lineFor(front(), 'wind', k).text.length).toBeGreaterThan(3);
  });
  it('has a sky glyph for every sky', () => { for (const n of WEATHER_PRESET_NAMES) expect(SKY_GLYPHS[n]).toMatch(/^<svg/); });
  it('draws the tide over the day as a path inside its box', () => {
    const d = tideCurve(2);
    expect(d.startsWith('M')).toBe(true);
    for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(120); }
  });
});

describe('focusTo (the mouse: hover moves focus, spec §5.4)', () => {
  it('focuses a row, a rider or a gear row, with a focus tick only when it moves', () => {
    const s = front();
    expect(focusTo(s, { row: 'tide' }).state.rowFocus).toBe('tide');
    expect(focusTo(s, { row: 'tide' }).events).toEqual([{ kind: 'focus' }]);
    expect(focusTo(s, { row: s.rowFocus }).events).toEqual([]);
    expect(focusTo(front({ beat: 'rider' }), { rider: 'grommet' }).events).toContainEqual({ kind: 'riderFocus', rider: 'grommet' });
    expect(focusTo(front({ beat: 'gear' }), { gear: 1 }).state.gearFocus).toBe(1);
  });
});
