// src/frontend/frontSettings.test.ts
import { describe, expect, it } from 'vitest';
import { FIRST_PRESET, presetById } from './sessionSetup';
import {
  DEFAULT_CHOICES, DEFAULT_FRONT_SETTINGS, FRONT_CHOICES_KEY, loadJson, safeAreaFraction, sanitizeChoices, sanitizeFrontSettings, sanitizeSetup, saveJson,
} from './frontSettings';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('x'); } };

describe('settings and remembered choices (dune select spec §3, §11; Review Focus 5)', () => {
  it('defaults to Winter offshore and Shazza', () => {
    expect(DEFAULT_CHOICES.setup).toEqual(presetById(FIRST_PRESET)!.setup);
    expect(DEFAULT_CHOICES.rider).toBe('female');
  });
  it('defaults the settings', () => {
    expect(DEFAULT_FRONT_SETTINGS).toEqual({ textScale: 1, calmMenus: false, opaqueBackplates: false, safeArea: null, displayMode: 'pc', glyphs: 'auto', experience: 'intermediate' });
  });
  it('takes the safe area from the display mode unless overridden', () => {
    expect(safeAreaFraction(DEFAULT_FRONT_SETTINGS)).toBe(0.03);
    expect(safeAreaFraction({ ...DEFAULT_FRONT_SETTINGS, displayMode: 'tv' })).toBe(0.05);
    expect(safeAreaFraction({ ...DEFAULT_FRONT_SETTINGS, safeArea: 0.08 })).toBe(0.08);
  });
  it('sanitises garbage, wrong types and out-of-range values to the defaults, value by value', () => {
    for (const raw of [null, undefined, 42, 'x', [], { textScale: 'big' }]) expect(sanitizeFrontSettings(raw)).toEqual(DEFAULT_FRONT_SETTINGS);
    expect(sanitizeFrontSettings({ textScale: 9, safeArea: 0.5, displayMode: 'phone', glyphs: 'nintendo', calmMenus: 1 }))
      .toEqual({ ...DEFAULT_FRONT_SETTINGS, textScale: 2, safeArea: 0.1 });
    expect(sanitizeFrontSettings({ textScale: 1.5, calmMenus: true, displayMode: 'tv' })).toEqual({ ...DEFAULT_FRONT_SETTINGS, textScale: 1.5, calmMenus: true, displayMode: 'tv' });
  });
  it('sanitises a setup row by row', () => {
    const w = presetById(FIRST_PRESET)!.setup;
    expect(sanitizeSetup({ ...w, month: 14, sky: 'tornado', swellFt: 30, periodS: 3.3, fromDeg: 180, tide: -1, wind: 2.5, timeStop: 9, timeFineMin: 1e6 }))
      .toEqual({ ...w, month: w.month, sky: w.sky, swellFt: 12, periodS: 8, fromDeg: w.fromDeg, tide: w.tide, wind: w.wind, timeStop: w.timeStop, timeFineMin: 0 });
    // 4.3 ft is below the first offered band on the real shelf (Solid, womb-retune): it moves there.
    expect(sanitizeSetup({ ...w, swellFt: 4.3 }).swellFt).toBe(5.5);
    expect(sanitizeSetup({ ...w, swellFt: 6.3 }).swellFt).toBe(6.5);
  });
  it('drops boards a rider doesn\'t own and outfits that aren\'t theirs', () => {
    const c = sanitizeChoices({ setup: {}, rider: 'grommet', boards: { grommet: 'thruster', female: 'stepUp' }, outfits: { female: 'boardies', male: 'season' } });
    expect(c.rider).toBe('grommet');
    expect(c.boards).toEqual({ female: 'stepUp' });
    expect(c.outfits).toEqual({ male: 'season' });
    expect(sanitizeChoices({ stances: { female: 'goofy', male: 'sideways', grommet: 'regular' } }).stances).toEqual({ female: 'goofy', grommet: 'regular' });
    expect(c.setup).toEqual(DEFAULT_CHOICES.setup);
    expect(sanitizeChoices('{broken').rider).toBe('female');
  });
  it('saves and loads through storage, and survives one that throws', () => {
    const s = memory();
    saveJson(s, FRONT_CHOICES_KEY, { rider: 'male' });
    expect(sanitizeChoices(loadJson(s, FRONT_CHOICES_KEY)).rider).toBe('male');
    s.setItem(FRONT_CHOICES_KEY, '{not json');
    expect(loadJson(s, FRONT_CHOICES_KEY)).toBeNull();
    expect(() => saveJson(throwing, FRONT_CHOICES_KEY, {})).not.toThrow();
    expect(loadJson(throwing, FRONT_CHOICES_KEY)).toBeNull();
  });
});
