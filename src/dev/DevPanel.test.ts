import { describe, expect, it } from 'vitest';
import { type BreakParams, DEFAULT_BREAK_PARAMS, normalizeBreakParams } from '../breaker/breaking';
import { PER_CREST_BREAK_KEYS } from '../breaker/overturn';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { CONDITION_RANGES, sanitizeConditions } from '../conditions/sanitize';
import { msToKmh } from '../conditions/units';
import { DEFAULT_DEBUG_OVERLAYS } from '../ocean/OceanSurface';
import { DEFAULT_FOAM_PARAMS, FOAM_PARAM_RANGES, type FoamParams } from '../whitewater/foamStep';
import { DEFAULT_IMPACT_PARAMS, DEFAULT_SPRAY_PARAMS, IMPACT_PARAM_RANGES, SPRAY_PARAM_RANGES, type ImpactParams, type SprayParams } from '../whitewater/sprayEmitters';
import { DEFAULT_LAND_PARAMS, LAND_PARAM_RANGES, type LandParams } from '../land/landParams';
import { DEFAULT_SURF_PARAMS, SURF_PARAM_RANGES, type SurfParams } from '../surf/surfModel';
import { WEATHER_PRESETS, WEATHER_PRESET_NAMES, WEATHER_RANGES, sanitizeWeather } from '../weather/weather';
import { WEATHER_BINDINGS, WEATHER_PRESET_OPTIONS, BOMBIE_BINDINGS, BREAK_BINDINGS, SOUND_BINDINGS, CONDITION_BINDINGS, FOAM_BINDINGS, IMPACT_BINDINGS, LAND_BINDINGS, OVERLAY_BINDINGS, SURF_BINDINGS, SPRAY_BINDINGS, WIND_SPEED_KMH_BINDING } from './DevPanel';

describe('dev panel condition bindings never rewrite a loaded moment', () => {
  // windSpeedMs has no widget of its own: it's edited in km/h through WIND_SPEED_KMH_BINDING instead, checked below.
  const keys = (Object.keys(CONDITION_RANGES) as (keyof typeof CONDITION_RANGES)[]).filter((k) => k !== 'windSpeedMs');
  it('has a binding for every sanitised numeric condition besides wind speed', () => {
    expect(Object.keys(CONDITION_BINDINGS).sort()).toEqual([...keys].sort());
  });
  for (const key of keys) {
    it(`${key}: the slider range contains everything sanitize allows, with no step snapping`, () => {
      const b = CONDITION_BINDINGS[key], r = CONDITION_RANGES[key];
      expect(b.min).toBeLessThanOrEqual(r.min);
      expect(b.max).toBeGreaterThanOrEqual(r.max);
      expect('step' in b).toBe(false);
    });
  }
  it('windSpeedMs: the km/h widget range contains everything sanitize allows, with no step snapping', () => {
    const r = CONDITION_RANGES.windSpeedMs;
    expect(WIND_SPEED_KMH_BINDING.min).toBeLessThanOrEqual(msToKmh(r.min));
    expect(WIND_SPEED_KMH_BINDING.max).toBeGreaterThanOrEqual(msToKmh(r.max));
    expect('step' in WIND_SPEED_KMH_BINDING).toBe(false);
  });
  it('whatever a link carries, the sanitised values sit inside the slider ranges', () => {
    for (const v of [-1e9, -359.5, -0.001, 0, 7 + 35 / 60, 22.5, 359.5, 1e9]) {
      const c = sanitizeConditions({ ...DEFAULT_CONDITIONS, timeOfDay: v, tideM: v, swell: { sizeFt: v, periodS: v, directionDeg: v }, wind: { speedMs: v, directionDeg: v } });
      const values: Record<Exclude<keyof typeof CONDITION_RANGES, 'windSpeedMs'>, number> = {
        timeOfDay: c.timeOfDay, swellSizeFt: c.swell.sizeFt, swellPeriodS: c.swell.periodS,
        swellDirectionDeg: c.swell.directionDeg, windDirectionDeg: c.wind.directionDeg,
        tideM: c.tideM,
      };
      for (const key of keys) {
        expect(values[key]).toBeGreaterThanOrEqual(CONDITION_BINDINGS[key].min);
        expect(values[key]).toBeLessThanOrEqual(CONDITION_BINDINGS[key].max);
      }
      const kmh = msToKmh(c.wind.speedMs);
      expect(kmh).toBeGreaterThanOrEqual(WIND_SPEED_KMH_BINDING.min);
      expect(kmh).toBeLessThanOrEqual(WIND_SPEED_KMH_BINDING.max);
    }
  });
});

describe('Weather folder', () => {
  it('has a slider for every weather field, with exactly the sanitised range and no step snapping', () => {
    expect(Object.keys(WEATHER_BINDINGS).sort()).toEqual(Object.keys(WEATHER_RANGES).sort());
    for (const [k, r] of Object.entries(WEATHER_RANGES)) {
      const b = WEATHER_BINDINGS[k as keyof typeof WEATHER_BINDINGS];
      expect([b.min, b.max], k).toEqual([r.min, r.max]);
      expect('step' in b, k).toBe(false);
    }
  });
  it('lists every preset in spectrum order, then custom', () => {
    expect(WEATHER_PRESET_OPTIONS.map((o) => o.value)).toEqual([...WEATHER_PRESET_NAMES, 'custom']);
  });
  it('whatever a link carries, the sanitised weather sits inside the sliders', () => {
    for (const v of [-1e9, -0.5, 0, 0.5, 250, 1e9]) {
      const junk = Object.fromEntries(Object.keys(WEATHER_RANGES).map((k) => [k, v]));
      const w = sanitizeWeather(junk, WEATHER_PRESETS.clear);
      for (const k of Object.keys(WEATHER_RANGES) as (keyof typeof WEATHER_BINDINGS)[]) {
        expect(w[k]).toBeGreaterThanOrEqual(WEATHER_BINDINGS[k].min);
        expect(w[k]).toBeLessThanOrEqual(WEATHER_BINDINGS[k].max);
      }
    }
  });
});

describe('Break folder sliders', () => {
  // Every BreakParams field normalizeBreakParams clamps to a numeric range gets a slider here (only the `enabled`
  // toggle is excluded); a slider missing from BREAK_BINDINGS would let a field go untuned from the panel with no
  // test failure to say so.
  // The per-crest keys (overturn.PER_CREST_BREAK_KEYS) are set from each crest's ψ, not the panel.
  const clampedKeys = (Object.keys(DEFAULT_BREAK_PARAMS) as (keyof BreakParams)[]).filter((k) => k !== 'enabled' && !(PER_CREST_BREAK_KEYS as readonly string[]).includes(k));
  it('has a slider for every BreakParams field normalizeBreakParams clamps', () => {
    expect(Object.keys(BREAK_BINDINGS).sort()).toEqual([...clampedKeys].sort());
  });
  it('every Break slider range survives normalizeBreakParams (no fight between the panel and the model)', () => {
    for (const [key, b] of Object.entries(BREAK_BINDINGS) as [keyof typeof BREAK_BINDINGS, { min: number; max: number }][]) {
      for (const v of [b.min, b.max]) {
        const p: BreakParams = { ...DEFAULT_BREAK_PARAMS };
        p[key] = v;
        normalizeBreakParams(p);
        expect(p[key]).toBe(v);
      }
    }
  });
});

describe('debug overlay toggles', () => {
  it('has a toggle for every DebugOverlays field, the ribbon tint among them', () => {
    expect(Object.keys(OVERLAY_BINDINGS).sort()).toEqual(Object.keys(DEFAULT_DEBUG_OVERLAYS).sort());
    expect(OVERLAY_BINDINGS.ribbonTint.label).toBe('ribbon tint');
  });
});

describe('Foam folder sliders', () => {
  it('has a slider for every FoamParams field, each inside what normalizeFoamParams keeps', () => {
    expect(Object.keys(FOAM_BINDINGS).sort()).toEqual((Object.keys(DEFAULT_FOAM_PARAMS) as (keyof FoamParams)[]).sort());
    for (const k of Object.keys(FOAM_BINDINGS) as (keyof FoamParams)[]) {
      expect(FOAM_BINDINGS[k].min).toBe(FOAM_PARAM_RANGES[k].min);
      expect(FOAM_BINDINGS[k].max).toBe(FOAM_PARAM_RANGES[k].max);
    }
  });
});

describe('Spray folder sliders', () => {
  it('has a slider for every SprayParams field, with exactly normalizeSprayParams ranges', () => {
    expect(Object.keys(SPRAY_BINDINGS).sort()).toEqual((Object.keys(DEFAULT_SPRAY_PARAMS) as (keyof SprayParams)[]).sort());
    for (const k of Object.keys(SPRAY_BINDINGS) as (keyof SprayParams)[]) {
      expect(SPRAY_BINDINGS[k].min).toBe(SPRAY_PARAM_RANGES[k].min);
      expect(SPRAY_BINDINGS[k].max).toBe(SPRAY_PARAM_RANGES[k].max);
    }
  });
});

describe('Impact folder sliders', () => {
  it('has a slider for every ImpactParams field, with exactly normalizeImpactParams ranges', () => {
    expect(Object.keys(IMPACT_BINDINGS).sort()).toEqual((Object.keys(DEFAULT_IMPACT_PARAMS) as (keyof ImpactParams)[]).sort());
    for (const k of Object.keys(IMPACT_BINDINGS) as (keyof ImpactParams)[]) {
      expect(IMPACT_BINDINGS[k].min).toBe(IMPACT_PARAM_RANGES[k].min);
      expect(IMPACT_BINDINGS[k].max).toBe(IMPACT_PARAM_RANGES[k].max);
    }
  });
});

describe('Land folder sliders', () => {
  it('has a slider for every numeric LandParams field, with exactly normalizeLandParams ranges', () => {
    const numeric = (Object.keys(DEFAULT_LAND_PARAMS) as (keyof LandParams)[]).filter((k) => typeof DEFAULT_LAND_PARAMS[k] === 'number');
    expect(Object.keys(LAND_BINDINGS).sort()).toEqual(numeric.sort());
    for (const k of Object.keys(LAND_BINDINGS) as (keyof typeof LAND_BINDINGS)[]) {
      expect(LAND_BINDINGS[k].min).toBe(LAND_PARAM_RANGES[k].min);
      expect(LAND_BINDINGS[k].max).toBe(LAND_PARAM_RANGES[k].max);
    }
  });
});

describe('Surf folder sliders', () => {
  it('has a slider for every numeric SurfParams field, with exactly normalizeSurfParams ranges', () => {
    const numeric = (Object.keys(DEFAULT_SURF_PARAMS) as (keyof SurfParams)[]).filter((k) => typeof DEFAULT_SURF_PARAMS[k] === 'number');
    expect(Object.keys(SURF_BINDINGS).sort()).toEqual(numeric.sort());
    expect(SURF_BINDINGS.amount.min).toBe(SURF_PARAM_RANGES.amount.min);
    expect(SURF_BINDINGS.amount.max).toBe(SURF_PARAM_RANGES.amount.max);
  });
});

import { BOMBIE_PARAM_RANGES } from '../bombie/bombieParams';
describe('the Bombie folder (4c-3)', () => {
  it('binds size and threshold with exactly normalizeBombieParams’s ranges', () => {
    for (const k of ['size', 'thresholdFt'] as const) {
      expect(BOMBIE_BINDINGS[k].min).toBe(BOMBIE_PARAM_RANGES[k].min);
      expect(BOMBIE_BINDINGS[k].max).toBe(BOMBIE_PARAM_RANGES[k].max);
    }
  });
});

import { SOUND_PARAM_RANGES, SOUND_VOLUME_KEYS } from '../sound/soundParams';
describe('the Sound folder (Phase 5)', () => {
  it('has a slider for every volume, with exactly normalizeSoundParams’s ranges', () => {
    expect(Object.keys(SOUND_BINDINGS).sort()).toEqual([...SOUND_VOLUME_KEYS].sort());
    for (const k of SOUND_VOLUME_KEYS) {
      expect(SOUND_BINDINGS[k].min).toBe(SOUND_PARAM_RANGES[k].min);
      expect(SOUND_BINDINGS[k].max).toBe(SOUND_PARAM_RANGES[k].max);
    }
  });
});

import { SURFER_PARAM_RANGES } from '../surfer/surferParams';
import { SURFER_BINDINGS } from './DevPanel';

describe('Surfer folder bindings', () => {
  it('match normalizeSurferParams’s ranges exactly', () => {
    for (const k of Object.keys(SURFER_PARAM_RANGES) as (keyof typeof SURFER_PARAM_RANGES)[]) {
      expect(SURFER_BINDINGS[k].min).toBe(SURFER_PARAM_RANGES[k].min);
      expect(SURFER_BINDINGS[k].max).toBe(SURFER_PARAM_RANGES[k].max);
    }
  });
});

import { SURFER_PRESET_OPTIONS, surferBoardOptions } from './DevPanel';

describe('the Surfer folder names the crew and lists only what each can ride (grommet spec §6)', () => {
  it('labels the presets by nickname and real name', () => {
    expect(SURFER_PRESET_OPTIONS).toEqual({ 'Shazza (Sharon)': 'female', 'T-Bone (Tom)': 'male', 'Grommet (Bradley)': 'grommet' });
  });
  it('lists the whole quiver for Shazza and T-Bone, only the bodyboard for Grommet', () => {
    expect(Object.values(surferBoardOptions('male'))).toEqual(['thruster', 'stepUp', 'bodyboard']);
    expect(surferBoardOptions('grommet')).toEqual({ bodyboard: 'bodyboard' });
  });
});
