// src/frontend/settingsView.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_FRONT_SETTINGS, sanitizeFrontSettings } from './frontSettings';
import { SETTING_ROWS, settingsView, stepSetting } from './settingsView';

describe('the Settings overlay (spec §11)', () => {
  it('has Experience, Text size, Calm menus, Opaque backplates, Safe area, Display mode, Glyphs', () => {
    expect(settingsView(DEFAULT_FRONT_SETTINGS, 'textScale').map((r) => r.label)).toEqual(['Experience', 'Text size', 'Calm menus', 'Opaque backplates', 'Safe area', 'Display mode', 'Glyphs']);
    expect(SETTING_ROWS.length).toBe(7);
  });
  it('steps text size 100–200% in 10% steps and stops at the ends', () => {
    let s = DEFAULT_FRONT_SETTINGS;
    expect(stepSetting(s, 'textScale', -1).atEnd).toBe(true);
    for (let k = 0; k < 10; k++) s = stepSetting(s, 'textScale', 1).settings;
    expect(s.textScale).toBeCloseTo(2, 9);
    expect(stepSetting(s, 'textScale', 1).atEnd).toBe(true);
  });
  it('steps the safe area 2–10%, starting from the display mode\'s default, and shows Auto until set', () => {
    expect(settingsView(DEFAULT_FRONT_SETTINGS, 'safeArea').find((r) => r.row === 'safeArea')!.value).toBe('Auto');
    const s = stepSetting(DEFAULT_FRONT_SETTINGS, 'safeArea', 1).settings;
    expect(s.safeArea).toBeCloseTo(0.04, 9);
    expect(stepSetting({ ...s, safeArea: 0.1 }, 'safeArea', 1).atEnd).toBe(true);
  });
  it('flips the switches and cycles display mode and glyphs, every result a valid setting', () => {
    let s = DEFAULT_FRONT_SETTINGS;
    for (const row of SETTING_ROWS) for (const dir of [1, -1, 1] as const) {
      s = stepSetting(s, row, dir).settings;
      expect(sanitizeFrontSettings(s)).toEqual(s);
    }
    expect(stepSetting(DEFAULT_FRONT_SETTINGS, 'calmMenus', 1).settings.calmMenus).toBe(!DEFAULT_FRONT_SETTINGS.calmMenus);
    expect(stepSetting(DEFAULT_FRONT_SETTINGS, 'glyphs', 1).settings.glyphs).toBe('xbox');
  });
  it('cycles experience intermediate → expert → beginner → intermediate (R1 §3)', () => {
    let s = DEFAULT_FRONT_SETTINGS;
    const seen = [s.experience];
    for (let i = 0; i < 3; i++) { s = stepSetting(s, 'experience', 1).settings; seen.push(s.experience); }
    expect(seen).toEqual(['intermediate', 'expert', 'beginner', 'intermediate']);
  });
});
