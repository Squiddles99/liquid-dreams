// src/frontend/frontSettings.ts
import type { BoardKind } from '../board/boardSpec';
import type { SettingsStorage } from '../dev/devSettings';
import type { Experience } from '../ride/ridePhysics';
import { PRESETS, type PresetName, type Stance, boardsFor } from '../surfer/presets';
import { type OutfitChoice, presetOutfits } from '../surfer/wardrobe';
import { WEATHER_PRESET_NAMES } from '../weather/weather';
import { FIRST_PRESET, FROM_WINDOW, type SessionSetup, TIDE_STOPS, TIME_STOPS, WIND_ROWS, offeredSetup, presetById } from './sessionSetup';

/** The player's front-end settings (spec §11), in a player-facing key beside the dev settings. */
export interface FrontSettings {
  /** 1–2 (100–200%). */
  textScale: number;
  calmMenus: boolean;
  opaqueBackplates: boolean;
  /** 0.02–0.10, or null for the display mode's (PC 3%, TV 5%). */
  safeArea: number | null;
  displayMode: 'pc' | 'tv';
  /** Where the surf map's conditions come from (surf-map hub spec §7); real-time is locked, so never saved. */
  conditionsSource: 'forecast' | 'custom';
  glyphs: 'auto' | 'xbox' | 'playstation' | 'keyboard';
  /** How much help catching waves (R1 §3): the paddle assist and the face slope that catches you. */
  experience: Experience;
}

export const DEFAULT_FRONT_SETTINGS: Readonly<FrontSettings> = { textScale: 1, calmMenus: false, opaqueBackplates: false, safeArea: null, displayMode: 'pc', glyphs: 'auto', experience: 'intermediate', conditionsSource: 'forecast' };
export const FRONT_SETTINGS_KEY = 'liquid-dreams.front-settings.v1';
export const FRONT_CHOICES_KEY = 'liquid-dreams.front-choices.v1';

export const safeAreaFraction = (s: FrontSettings): number => s.safeArea ?? (s.displayMode === 'tv' ? 0.05 : 0.03);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const int = (v: unknown, lo: number, hi: number, fallback: number): number => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : fallback);

export function sanitizeFrontSettings(raw: unknown): FrontSettings {
  const d = DEFAULT_FRONT_SETTINGS;
  if (!isObj(raw)) return { ...d };
  return {
    textScale: num(raw.textScale, 1, 2, d.textScale),
    calmMenus: bool(raw.calmMenus, d.calmMenus),
    opaqueBackplates: bool(raw.opaqueBackplates, d.opaqueBackplates),
    safeArea: raw.safeArea === null || raw.safeArea === undefined ? null : num(raw.safeArea, 0.02, 0.1, 0.03),
    displayMode: oneOf(raw.displayMode, ['pc', 'tv'] as const, d.displayMode),
    glyphs: oneOf(raw.glyphs, ['auto', 'xbox', 'playstation', 'keyboard'] as const, d.glyphs),
    experience: oneOf(raw.experience, ['beginner', 'intermediate', 'expert'] as const, d.experience),
    conditionsSource: oneOf(raw.conditionsSource, ['forecast', 'custom'] as const, d.conditionsSource),
  };
}

/** What the front end remembers across sessions (spec §3). */
export interface SavedChoices {
  setup: SessionSetup;
  rider: PresetName;
  /** A board the player swapped to, per rider (absent: the rider's pick). */
  boards: Partial<Record<PresetName, BoardKind>>;
  outfits: Partial<Record<PresetName, OutfitChoice>>;
  /** A stance the player swapped to, per rider (absent: the rider's own). */
  stances: Partial<Record<PresetName, Stance>>;
}

export const DEFAULT_CHOICES: Readonly<SavedChoices> = { setup: presetById(FIRST_PRESET)!.setup, rider: 'female', boards: {}, outfits: {}, stances: {} };

export function sanitizeSetup(raw: unknown): SessionSetup {
  const d = DEFAULT_CHOICES.setup;
  if (!isObj(raw)) return { ...d };
  const ft = typeof raw.swellFt === 'number' && Number.isFinite(raw.swellFt) ? Math.min(12, Math.max(1, Math.round(raw.swellFt * 2) / 2)) : d.swellFt;
  const periodS = typeof raw.periodS === 'number' && Number.isFinite(raw.periodS) ? Math.min(20, Math.max(8, Math.round(raw.periodS))) : d.periodS;
  const fine = typeof raw.timeFineMin === 'number' && Number.isFinite(raw.timeFineMin) && Math.abs(raw.timeFineMin) <= 600 ? Math.round(raw.timeFineMin / 15) * 15 : 0;
  // A save from before small-swell (a Flat-ish or Small day) loads as the nearest band that breaks on its tide.
  return offeredSetup({
    month: int(raw.month, 0, 11, d.month),
    timeStop: int(raw.timeStop, 0, TIME_STOPS.length - 1, d.timeStop),
    timeFineMin: fine,
    sky: oneOf(raw.sky, WEATHER_PRESET_NAMES, d.sky),
    wind: int(raw.wind, 0, WIND_ROWS.length - 1, d.wind),
    swellFt: ft,
    periodS,
    fromDeg: oneOf(raw.fromDeg, FROM_WINDOW as readonly number[], d.fromDeg),
    tide: int(raw.tide, 0, TIDE_STOPS.length - 1, d.tide),
  });
}

const RIDERS: readonly PresetName[] = ['female', 'male', 'grommet'];

export function sanitizeChoices(raw: unknown): SavedChoices {
  if (!isObj(raw)) return { ...DEFAULT_CHOICES, boards: {}, outfits: {}, stances: {} };
  const boards: Partial<Record<PresetName, BoardKind>> = {}, outfits: Partial<Record<PresetName, OutfitChoice>> = {}, stances: Partial<Record<PresetName, Stance>> = {};
  for (const n of RIDERS) {
    const b = isObj(raw.boards) ? raw.boards[n] : undefined;
    if (boardsFor(PRESETS[n]).includes(b as BoardKind)) boards[n] = b as BoardKind;
    const o = isObj(raw.outfits) ? raw.outfits[n] : undefined;
    const allowed: OutfitChoice[] = ['season', ...presetOutfits(PRESETS[n]).filter((x) => x !== 'walking')];
    if (allowed.includes(o as OutfitChoice)) outfits[n] = o as OutfitChoice;
    const st = isObj(raw.stances) ? raw.stances[n] : undefined;
    if (st === 'regular' || st === 'goofy') stances[n] = st;
  }
  return { setup: sanitizeSetup(raw.setup), rider: oneOf(raw.rider, RIDERS, DEFAULT_CHOICES.rider), boards, outfits, stances };
}

/** JSON from storage, or null (missing, unreadable, or a storage that throws). */
export function loadJson(storage: SettingsStorage, key: string): unknown {
  try {
    const s = storage.getItem(key);
    return s === null ? null : JSON.parse(s);
  } catch {
    return null;
  }
}

export function saveJson(storage: SettingsStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage: the choices just aren't remembered.
  }
}
