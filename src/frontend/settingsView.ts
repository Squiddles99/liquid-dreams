// src/frontend/settingsView.ts
import { type FrontSettings, safeAreaFraction } from './frontSettings';

export type SettingRow = 'textScale' | 'calmMenus' | 'opaqueBackplates' | 'safeArea' | 'displayMode' | 'glyphs';
export const SETTING_ROWS: SettingRow[] = ['textScale', 'calmMenus', 'opaqueBackplates', 'safeArea', 'displayMode', 'glyphs'];
const LABELS: Record<SettingRow, string> = { textScale: 'Text size', calmMenus: 'Calm menus', opaqueBackplates: 'Opaque backplates', safeArea: 'Safe area', displayMode: 'Display mode', glyphs: 'Glyphs' };
const GLYPHS: FrontSettings['glyphs'][] = ['auto', 'xbox', 'playstation', 'keyboard'];
const GLYPH_WORDS: Record<FrontSettings['glyphs'], string> = { auto: 'Auto', xbox: 'Xbox', playstation: 'PlayStation', keyboard: 'Keyboard' };
const round = (v: number): number => Math.round(v * 100) / 100;

export function settingsView(s: FrontSettings, focus: SettingRow): { row: SettingRow; label: string; value: string; small: string; focused: boolean }[] {
  const value: Record<SettingRow, [string, string]> = {
    textScale: [`${Math.round(s.textScale * 100)}%`, ''],
    calmMenus: [s.calmMenus ? 'On' : 'Off', s.calmMenus ? 'no slides or swings' : ''],
    opaqueBackplates: [s.opaqueBackplates ? 'On' : 'Off', ''],
    safeArea: [s.safeArea === null ? 'Auto' : `${Math.round(s.safeArea * 100)}%`, `${Math.round(safeAreaFraction(s) * 100)}% in use`],
    displayMode: [s.displayMode === 'pc' ? 'PC' : 'TV', s.displayMode === 'pc' ? 'desk distance' : 'couch distance'],
    glyphs: [GLYPH_WORDS[s.glyphs], s.glyphs === 'auto' ? 'follows your last device' : ''],
  };
  return SETTING_ROWS.map((row) => ({ row, label: LABELS[row], value: value[row][0], small: value[row][1], focused: row === focus }));
}

export function stepSetting(s: FrontSettings, row: SettingRow, dir: -1 | 1): { settings: FrontSettings; atEnd: boolean } {
  switch (row) {
    case 'textScale': {
      const v = round(s.textScale + 0.1 * dir);
      return v < 1 || v > 2 ? { settings: s, atEnd: true } : { settings: { ...s, textScale: v }, atEnd: false };
    }
    case 'safeArea': {
      const v = round(safeAreaFraction(s) + 0.01 * dir);
      return v < 0.02 || v > 0.1 ? { settings: s, atEnd: true } : { settings: { ...s, safeArea: v }, atEnd: false };
    }
    case 'calmMenus': return { settings: { ...s, calmMenus: !s.calmMenus }, atEnd: false };
    case 'opaqueBackplates': return { settings: { ...s, opaqueBackplates: !s.opaqueBackplates }, atEnd: false };
    case 'displayMode': return { settings: { ...s, displayMode: s.displayMode === 'pc' ? 'tv' : 'pc' }, atEnd: false };
    case 'glyphs': return { settings: { ...s, glyphs: GLYPHS[(GLYPHS.indexOf(s.glyphs) + dir + GLYPHS.length) % GLYPHS.length] }, atEnd: false };
  }
}
