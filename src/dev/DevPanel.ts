import { type BladeApi, type ListBladeApi, Pane } from 'tweakpane';
import type { BreakParams } from '../breaker/breaking';
import { compassPoint } from '../conditions/compass';
import { CONDITION_RANGES } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
import { kmhToMs, msToKmh } from '../conditions/units';
import type { OceanSimParams } from '../ocean/OceanSimulation';
import type { DebugOverlays } from '../ocean/OceanSurface';
import type { OceanSpectrumParams } from '../ocean/spectrum';
import type { WaterOpticsParams } from '../ocean/waterOptics';
import type { ShallowSwellParams } from '../ocean/waterSurface';
import type { PictureParams } from '../render/PicturePipeline';
import type { ReefParams } from '../seabed/wombReef';
import type { AtmosphereParams } from '../sky/atmosphereParams';
import type { SetParams } from '../swell/sets';
import { FOAM_PARAM_RANGES, type FoamParams } from '../whitewater/foamStep';
import { IMPACT_PARAM_RANGES, type ImpactParams, SPRAY_PARAM_RANGES, type SprayParams } from '../whitewater/sprayEmitters';
import { LAND_PARAM_RANGES, type LandParams } from '../land/landParams';
import { SURF_PARAM_RANGES, type SurfParams } from '../surf/surfModel';
import { BOMBIE_PARAM_RANGES, type BombieParams } from '../bombie/bombieParams';
import { SOUND_PARAM_RANGES, type SoundParams } from '../sound/soundParams';
import type { BoardKind } from '../board/boardSpec';
import { ALL_POSES } from '../surfer/poseNames';
import { PRESETS, type PresetName, boardsFor } from '../surfer/presets';
import { SURFER_PARAM_RANGES, type SurferParams } from '../surfer/surferParams';
import { WEATHER_PRESETS, WEATHER_PRESET_NAMES, WEATHER_RANGES, type WeatherConditions, type WeatherPresetName, presetOf } from '../weather/weather';
import type { SettingsMode } from './devSettings';
import { DEFAULT_MOMENT_NAME, REFERENCE_MOMENTS } from './referenceMoments';

export interface DevPanelModel {
  conditions: Conditions;
  spectrum: OceanSpectrumParams;
  sim: OceanSimParams;
  water: WaterOpticsParams;
  atmosphere: AtmosphereParams;
  picture: PictureParams;
  frameLimiter: { maxFps: number };
  sets: SetParams;
  reef: ReefParams;
  shallow: ShallowSwellParams;
  overlays: DebugOverlays;
  breaking: BreakParams;
  foam: FoamParams;
  spray: SprayParams;
  impact: ImpactParams;
  land: LandParams;
  surf: SurfParams;
  bombie: BombieParams;
  sound: SoundParams;
  soundStatus: { track: string };
  surfer: SurferParams;
  surferStatus: { outfit: string };
  setStatus: { nextSet: string; wave: string; face: string; psi: string };
  /** The settings switch's value when the panel is built (it only changes through the switch). */
  settingsMode: SettingsMode;
}

export interface DevPanelHandlers {
  onConditions(): void;
  /** A condition binding changed because the user edited it (not a refresh showing a moment applied elsewhere). */
  onUserConditionEdit(): void;
  onSpectrum(): void;
  onSim(): void;
  onWater(): void;
  onAtmosphere(): void;
  onPicture(): void;
  onReferenceMoment(name: string): void;
  onCopyLink(): void;
  onScreenshot(): void;
  onTogglePause(): void;
  onSets(): void;
  onReef(): void;
  onShallow(): void;
  onOverlays(): void;
  onCallSet(): void;
  onBreak(): void;
  onFoam(): void;
  onSpray(): void;
  onImpact(): void;
  onLand(): void;
  onSurf(): void;
  onBombie(): void;
  onSurfer(): void;
  onSurferPlaceAhead(): void;
  onSurferChase(): void;
  /** Stands the rider at a named spot on land (walking spec §4), walking, carrying the board. */
  onSurferSpot(spot: 'duneCrest' | 'beach'): void;
  /** Puts the beach pile (walking spec §5) ahead of the camera or beside the beach spot, and shows it. */
  onSurferPile(where: 'ahead' | 'beach'): void;
  onSound(): void;
  onMusicPlayPause(): void;
  onMusicNext(): void;
  onSettingsMode(mode: SettingsMode): void;
  onResetSettings(): void;
  /** Any user-editable value changed (every binding and list; not the read-only readouts). */
  onAnySettingChanged(): void;
}

/** nightFloor spans decades (default 7e-7), so the panel edits its log10 through a proxy. */
const NIGHT_FLOOR_LOG10_MIN = -8;
const NIGHT_FLOOR_LOG10_MAX = -4;

const fixed = (digits: number) => (v: number): string => v.toFixed(digits);

/**
 * A direction reads as "225° SW": tweakpane's number-text controller only ever parses a *typed* edit back into
 * the value (the ECMA-expression parser it runs on blur rejects any text with trailing non-numeric characters,
 * so "225° SW" itself never round-trips through it); `format` is display-only, same as everywhere else here.
 */
const withCompass = (v: number): string => `${fixed(0)(v)}° ${compassPoint(v)}`;

/**
 * Conditions bindings. Tweakpane clamps to min/max and snaps to `step` on every refresh and writes the result back,
 * so each range contains everything sanitize allows and none has a step: a loaded moment (07:35 is 7.58333 h) must
 * come back exactly. `format` only rounds the display.
 */
export const CONDITION_BINDINGS = {
  timeOfDay: { label: 'time (h)', ...CONDITION_RANGES.timeOfDay, format: fixed(2) },
  swellSizeFt: { label: 'size (surfer ft)', ...CONDITION_RANGES.swellSizeFt, format: fixed(1) },
  swellPeriodS: { label: 'period (s between waves)', ...CONDITION_RANGES.swellPeriodS, format: fixed(1) },
  swellDirectionDeg: { label: 'from', ...CONDITION_RANGES.swellDirectionDeg, format: withCompass },
  windDirectionDeg: { label: 'from', ...CONDITION_RANGES.windDirectionDeg, format: withCompass },
  tideM: { label: 'tide (m)', ...CONDITION_RANGES.tideM, format: fixed(2) },
};

/** The Weather folder's sliders: exactly the sanitised ranges, no step (a loaded moment's values round-trip). */
export const WEATHER_BINDINGS: Record<keyof WeatherConditions, { label: string; min: number; max: number; format: (v: number) => string }> = {
  lowCover: { label: 'low cloud cover', ...WEATHER_RANGES.lowCover, format: fixed(2) },
  convection: { label: 'convection (flat → towering)', ...WEATHER_RANGES.convection, format: fixed(2) },
  lowBaseM: { label: 'cloud base (m)', ...WEATHER_RANGES.lowBaseM, format: fixed(0) },
  midCover: { label: 'mid cloud cover', ...WEATHER_RANGES.midCover, format: fixed(2) },
  highCover: { label: 'high cloud cover', ...WEATHER_RANGES.highCover, format: fixed(2) },
  rain: { label: 'rain', ...WEATHER_RANGES.rain, format: fixed(2) },
  storm: { label: 'storm', ...WEATHER_RANGES.storm, format: fixed(2) },
  visibilityKm: { label: 'visibility (km)', ...WEATHER_RANGES.visibilityKm, format: fixed(1) },
  fogTopM: { label: 'haze depth (m)', ...WEATHER_RANGES.fogTopM, format: fixed(0) },
  windAloftDeg: { label: 'clouds from', ...WEATHER_RANGES.windAloftDeg, format: withCompass },
  windAloftMs: { label: 'clouds speed (m/s)', ...WEATHER_RANGES.windAloftMs, format: fixed(1) },
};

export const WEATHER_PRESET_OPTIONS: { text: string; value: WeatherPresetName | 'custom' }[] = [
  ...WEATHER_PRESET_NAMES.map((n) => ({ text: n, value: n })),
  { text: 'custom', value: 'custom' },
];

/**
 * The live wind-speed widget (bound to windSpeedProxy below, not to conditions.wind.speedMs directly): edited
 * in km/h, no step, so a loaded moment's m/s value round-trips exactly (same rule as CONDITION_BINDINGS above).
 */
export const WIND_SPEED_KMH_BINDING = { label: 'speed (km/h)', min: 0, max: msToKmh(CONDITION_RANGES.windSpeedMs.max), format: fixed(0) };

/**
 * Break folder sliders. Each range sits inside what normalizeBreakParams keeps, so a slider can never fight it.
 * Every numeric BreakParams field (everything but the `enabled` toggle) has one here, checked by DevPanel.test.ts.
 */
export const BREAK_BINDINGS = {
  gamma: { label: 'breaker index γ', min: 0.5, max: 1.2, step: 0.01 },
  delta: { label: 'drain δ (criterion)', min: 0, max: 2, step: 0.05 },
  stageSpan: { label: 'stage span Δ', min: 0.2, max: 4, step: 0.05 },
  beta: { label: 'bore height β', min: 0.1, max: 0.8, step: 0.01 },
  hFloorM: { label: 'depth floor h₀ (m)', min: 0.05, max: 2, step: 0.05 },
  faceWidth: { label: 'face width (×H)', min: 0.1, max: 3, step: 0.05 },
  drainEnd: { label: 'drain full (× Δ past ρ 1)', min: 0.01, max: 1, step: 0.01 },
  collapseStart: { label: 'collapse from (× Δ past ρ 1)', min: 0, max: 0.95, step: 0.01 },
  collapseTime: { label: 'collapse time (×τ land)', min: 0.3, max: 3, step: 0.05 },
  ribbonOnset: { label: 'ribbon onset ρ', min: 0.3, max: 0.9, step: 0.01 },
  pileHalfM: { label: 'pile half distance (m)', min: 10, max: 150, step: 1 },
  psiNudge: { label: 'ψ nudge (×)', min: -0.5, max: 0.5, step: 0.01 },
  randomDial: { label: 'random dial', min: 0, max: 0.15, step: 0.01 },
  churnSize: { label: 'churn size (× pile)', min: 0, max: 0.4, step: 0.01 },
  churnSpeed: { label: 'churn speed', min: 0, max: 3, step: 0.05 },
} as const;

/** Debug overlay toggles (Reef folder), one per DebugOverlays field, checked by DevPanel.test.ts. */
export const OVERLAY_BINDINGS: Record<keyof DebugOverlays, { label: string }> = {
  depthContours: { label: 'depth contours' },
  crestLines: { label: 'crest lines' },
  ribbonTint: { label: 'ribbon tint' },
  foamMap: { label: 'foam map' },
  sprayTint: { label: 'spray tint' },
  coverMap: { label: 'cover map' },
  sunlightMap: { label: 'sunlight map' },
};

/** Foam folder sliders (spec 2026-09-27-foam-field-design.md §3.1), ranges exactly normalizeFoamParams's (DevPanel.test.ts). */
export const FOAM_BINDINGS = {
  clearTimeS: { label: 'clear time (s)', ...FOAM_PARAM_RANGES.clearTimeS, step: 0.5 },
  driftMps: { label: 'foam drift (m/s)', ...FOAM_PARAM_RANGES.driftMps, step: 0.05 },
} as const;

/** Spray folder sliders (spec 2026-09-27-offshore-spray-design.md §3.2), ranges exactly normalizeSprayParams's (DevPanel.test.ts). */
export const SPRAY_BINDINGS = {
  amount: { label: 'spray amount', ...SPRAY_PARAM_RANGES.amount, step: 0.05 },
  lifeS: { label: 'spray life (s)', ...SPRAY_PARAM_RANGES.lifeS, step: 0.1 },
} as const;

/** Impact folder slider (spec 2026-09-28-impact-explosion-design.md §3.4), range exactly normalizeImpactParams's. */
export const IMPACT_BINDINGS = {
  amount: { label: 'impact amount', ...IMPACT_PARAM_RANGES.amount, step: 0.05 },
} as const;

/** Surf folder (Phase 4b spec §3.5), range exactly normalizeSurfParams's. */
export const SURF_BINDINGS = {
  amount: { label: 'surf amount', ...SURF_PARAM_RANGES.amount, step: 0.05 },
} as const;

/** Surfer folder sliders (spec §6), ranges exactly normalizeSurferParams's (DevPanel.test.ts). */
export const SURFER_BINDINGS = {
  phaseT: { label: 'phase', ...SURFER_PARAM_RANGES.phaseT, step: 0.01 },
  compression: { label: 'compression', ...SURFER_PARAM_RANGES.compression, step: 0.01 },
  lean: { label: 'lean (heels … toes)', ...SURFER_PARAM_RANGES.lean, step: 0.01 },
  twist: { label: 'twist', ...SURFER_PARAM_RANGES.twist, step: 0.01 },
  reach: { label: 'reach', ...SURFER_PARAM_RANGES.reach, step: 0.01 },
  balanceAmount: { label: 'balance amount', ...SURFER_PARAM_RANGES.balanceAmount, step: 0.05 },
  x: { label: 'x (m)', ...SURFER_PARAM_RANGES.x, step: 0.1 },
  z: { label: 'z (m)', ...SURFER_PARAM_RANGES.z, step: 0.1 },
  heightNudgeM: { label: 'height nudge (m)', ...SURFER_PARAM_RANGES.heightNudgeM, step: 0.01 },
  pitchNudgeDeg: { label: 'pitch nudge (°)', ...SURFER_PARAM_RANGES.pitchNudgeDeg, step: 0.5 },
} as const;
/** The On land sub-folder's sliders (walking spec §4, §5), ranges exactly normalizeSurferParams's (DevPanel.test.ts). */
export const SURFER_LAND_BINDINGS = {
  pileX: { label: 'pile x (m)', ...SURFER_PARAM_RANGES.pileX, step: 0.1 },
  pileZ: { label: 'pile z (m)', ...SURFER_PARAM_RANGES.pileZ, step: 0.1 },
} as const;
/** The Face sub-folder's dials (closeup spec §5.2), ranges exactly normalizeSurferParams's (DevPanel.test.ts). */
export const FACE_BINDINGS = {
  faceBlink: { label: 'blink', ...SURFER_PARAM_RANGES.faceBlink, step: 0.01 },
  faceSmile: { label: 'smile', ...SURFER_PARAM_RANGES.faceSmile, step: 0.01 },
  faceJaw: { label: 'jaw', ...SURFER_PARAM_RANGES.faceJaw, step: 0.01 },
  faceBrows: { label: 'brows', ...SURFER_PARAM_RANGES.faceBrows, step: 0.01 },
  faceSquint: { label: 'squint', ...SURFER_PARAM_RANGES.faceSquint, step: 0.01 },
  gazeYawDeg: { label: 'gaze yaw (°)', ...SURFER_PARAM_RANGES.gazeYawDeg, step: 0.5 },
  gazePitchDeg: { label: 'gaze pitch (°)', ...SURFER_PARAM_RANGES.gazePitchDeg, step: 0.5 },
} as const;
const BOARD_LABELS: Record<BoardKind, string> = { thruster: 'thruster', stepUp: 'step-up', bodyboard: 'bodyboard' };
/** The crew by nickname and real name (grommet spec §6): Shazza (Sharon), T-Bone (Tom), Grommet (Bradley). */
export const SURFER_PRESET_OPTIONS = Object.fromEntries((Object.keys(PRESETS) as PresetName[]).map((k) => [`${PRESETS[k].nickname} (${PRESETS[k].realName})`, k]));
/** The boards the preset may ride (Grommet: only his bodyboard). */
export const surferBoardOptions = (preset: PresetName): Record<string, BoardKind> => Object.fromEntries(boardsFor(PRESETS[preset]).map((k) => [BOARD_LABELS[k], k]));
const SURFER_OPTIONS = {
  preset: SURFER_PRESET_OPTIONS,
  stance: { regular: 'regular', goofy: 'goofy' },
  outfit: { season: 'season', boardies: 'boardies', bikini: 'bikini', springsuit: 'springsuit', 'bikini bottoms + rash vest': 'rashieAndBottoms', 'short-arm steamer': 'shortArmSteamer', 'boardies + rash vest': 'rashieAndBoardies', 'walking clothes': 'walking' },
  carrySide: { auto: 'auto', left: 'l', right: 'r' },
  pose: Object.fromEntries(ALL_POSES.map((p) => [p, p])),
};

/** Bombie folder sliders (Phase 4c-3 §3.5), ranges exactly normalizeBombieParams's (DevPanel.test.ts). */
export const BOMBIE_BINDINGS = {
  size: { label: 'bombie size', ...BOMBIE_PARAM_RANGES.size, step: 0.05 },
  thresholdFt: { label: 'bombie threshold (ft)', ...BOMBIE_PARAM_RANGES.thresholdFt, step: 0.5 },
} as const;

/** Sound folder sliders (Phase 5 §3.5), ranges exactly normalizeSoundParams's (DevPanel.test.ts). */
export const SOUND_BINDINGS = {
  master: { label: 'master', ...SOUND_PARAM_RANGES.master, step: 0.01 },
  waves: { label: 'waves', ...SOUND_PARAM_RANGES.waves, step: 0.01 },
  ambience: { label: 'ambience', ...SOUND_PARAM_RANGES.ambience, step: 0.01 },
  nearWater: { label: 'near water', ...SOUND_PARAM_RANGES.nearWater, step: 0.01 },
  music: { label: 'music', ...SOUND_PARAM_RANGES.music, step: 0.01 },
} as const;

/** Land folder sliders (Phase 4a spec §4.11), ranges exactly normalizeLandParams's (DevPanel.test.ts). */
export const LAND_BINDINGS = {
  sandBrightness: { label: 'sand brightness', ...LAND_PARAM_RANGES.sandBrightness, step: 0.01 },
  heathBrightness: { label: 'heath brightness', ...LAND_PARAM_RANGES.heathBrightness, step: 0.01 },
  heathSilver: { label: 'heath silver', ...LAND_PARAM_RANGES.heathSilver, step: 0.01 },
  heathOrange: { label: 'heath orange', ...LAND_PARAM_RANGES.heathOrange, step: 0.01 },
  beachWidthM: { label: 'beach width (m)', ...LAND_PARAM_RANGES.beachWidthM, step: 1 },
  toeHeightM: { label: 'rock band top (m)', ...LAND_PARAM_RANGES.toeHeightM, step: 0.1 },
  rockDensity: { label: 'rock density', ...LAND_PARAM_RANGES.rockDensity, step: 0.05 },
  bushDensity: { label: 'bush density', ...LAND_PARAM_RANGES.bushDensity, step: 0.05 },
} as const;

export class DevPanel {
  private readonly pane = new Pane({ title: 'Liquid Dreams', expanded: true });
  private readonly nightFloorProxy = { log10: 0 };
  /** Wind speed is stored in m/s; the panel edits it in km/h through this proxy (same pattern as nightFloorProxy). */
  private readonly windSpeedProxy = { kmh: 0 };
  /** True inside refresh(): the proxies' bindings snap to their steps (or just get set) there, which must not write back. */
  private refreshing = false;
  /** True while setReference() moves the reference list, which is not a pick. */
  private settingReference = false;
  private readonly reference: ListBladeApi<string>;
  private readonly weatherPreset: ListBladeApi<WeatherPresetName | 'custom'>;
  /** True while syncWeatherPreset() moves the preset list to match the sliders, which is not a pick. */
  private settingPreset = false;
  /** Rebuilds the Surfer folder's board list for the chosen preset (set up with the folder). */
  private refreshSurferBoards: () => void = () => {};

  constructor(private readonly m: DevPanelModel, h: DevPanelHandlers) {
    // Every condition binding: refresh() also fires these, for a moment applied by a link, pick or reset.
    const onConditions = (): void => {
      if (!this.refreshing) h.onUserConditionEdit();
      h.onConditions();
    };
    const moment = this.pane.addFolder({ title: 'Moment' });
    const settings = moment.addBlade({
      view: 'list', label: 'settings',
      options: [{ text: 'custom', value: 'custom' }, { text: 'default', value: 'default' }],
      value: m.settingsMode,
    }) as ListBladeApi<SettingsMode>;
    settings.on('change', (e) => h.onSettingsMode(e.value));
    const ref = moment.addBlade({
      view: 'list', label: 'reference',
      options: REFERENCE_MOMENTS.map((r) => ({ text: r.name, value: r.name })),
      value: DEFAULT_MOMENT_NAME,
    }) as ListBladeApi<string>;
    ref.on('change', (e) => {
      if (!this.settingReference) h.onReferenceMoment(e.value);
    });
    this.reference = ref;
    moment.addBinding(m.conditions, 'date').on('change', onConditions);
    moment.addBinding(m.conditions, 'timeOfDay', CONDITION_BINDINGS.timeOfDay).on('change', onConditions);
    moment.addBinding(m.conditions, 'tideM', CONDITION_BINDINGS.tideM).on('change', onConditions);
    moment.addBinding(m.conditions, 'seed', { min: 0, step: 1 }).on('change', onConditions);
    moment.addButton({ title: 'Copy moment link (L)' }).on('click', h.onCopyLink);
    moment.addButton({ title: 'Pause / resume (P)' }).on('click', h.onTogglePause);
    moment.addButton({ title: 'Screenshot (K)' }).on('click', h.onScreenshot);
    moment.addButton({ title: 'Reset settings' }).on('click', h.onResetSettings);

    const swell = this.pane.addFolder({ title: 'Swell' });
    swell.addBinding(m.conditions.swell, 'sizeFt', CONDITION_BINDINGS.swellSizeFt).on('change', onConditions);
    swell.addBinding(m.conditions.swell, 'periodS', CONDITION_BINDINGS.swellPeriodS).on('change', onConditions);
    swell.addBinding(m.conditions.swell, 'directionDeg', CONDITION_BINDINGS.swellDirectionDeg).on('change', onConditions);

    const wind = this.pane.addFolder({ title: 'Wind' });
    this.syncWindSpeedProxy();
    wind.addBinding(this.windSpeedProxy, 'kmh', WIND_SPEED_KMH_BINDING)
      .on('change', (e) => {
        // A refresh shows a wind speed set elsewhere (a moment load, reset); only editing the field writes it back.
        if (this.refreshing) return;
        m.conditions.wind.speedMs = kmhToMs(e.value);
        onConditions();
      });
    wind.addBinding(m.conditions.wind, 'directionDeg', CONDITION_BINDINGS.windDirectionDeg).on('change', onConditions);

    const weather = this.pane.addFolder({ title: 'Weather' });
    this.weatherPreset = weather.addBlade({
      view: 'list', label: 'sky', options: WEATHER_PRESET_OPTIONS, value: presetOf(m.conditions.weather) ?? 'custom',
    }) as ListBladeApi<WeatherPresetName | 'custom'>;
    this.weatherPreset.on('change', (e) => {
      if (this.settingPreset || e.value === 'custom') return;
      // A pick writes the preset into the bound object (the sliders hold it) and shows it.
      Object.assign(m.conditions.weather, WEATHER_PRESETS[e.value]);
      this.refresh();
      onConditions();
    });
    for (const k of Object.keys(WEATHER_BINDINGS) as (keyof WeatherConditions)[]) {
      weather.addBinding(m.conditions.weather, k, WEATHER_BINDINGS[k]).on('change', () => {
        if (this.refreshing) return;
        this.syncWeatherPreset();
        onConditions();
      });
    }

    const sets = this.pane.addFolder({ title: 'Sets' });
    const readouts = new Set<BladeApi>([
      sets.addBinding(m.setStatus, 'nextSet', { label: 'next set', readonly: true, interval: 250 }),
      sets.addBinding(m.setStatus, 'wave', { label: 'at the peak', readonly: true, interval: 250 }),
      sets.addBinding(m.setStatus, 'face', { label: 'face at the peak', readonly: true, interval: 250 }),
      sets.addBinding(m.setStatus, 'psi', { label: 'barrel at the peak', readonly: true, interval: 250 }),
    ]);
    sets.addButton({ title: 'Call a set now (N)' }).on('click', h.onCallSet);
    sets.addBinding(m.sets, 'meanIntervalS', { label: 'mean interval (s)', min: 120, max: 3600, step: 10 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'intervalJitterS', { label: 'interval jitter (s)', min: 0, max: 600, step: 10 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'minWaves', { label: 'min waves', min: 1, max: 12, step: 1 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'maxWaves', { label: 'max waves', min: 1, max: 12, step: 1 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'heightFactorMin', { label: 'height × Hs (min)', min: 0.5, max: 3, step: 0.05 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'heightFactorMax', { label: 'height × Hs (max)', min: 0.5, max: 3, step: 0.05 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'waveHeightJitter', { label: 'wave height jitter', min: 0, max: 0.5, step: 0.01 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'straysPerLull', { label: 'strays per lull', min: 0, max: 5, step: 0.1 }).on('change', h.onSets);
    sets.addBinding(m.spectrum, 'backgroundSwellFactor', { label: 'background swell', min: 0, max: 1, step: 0.01 }).on('change', h.onSpectrum);

    const brk = this.pane.addFolder({ title: 'Break' });
    brk.addBinding(m.breaking, 'enabled', { label: 'breaking' }).on('change', h.onBreak);
    for (const [key, opts] of Object.entries(BREAK_BINDINGS) as [keyof typeof BREAK_BINDINGS, (typeof BREAK_BINDINGS)[keyof typeof BREAK_BINDINGS]][]) {
      brk.addBinding(m.breaking, key, opts).on('change', h.onBreak);
    }

    const foam = this.pane.addFolder({ title: 'Foam' });
    for (const [key, opts] of Object.entries(FOAM_BINDINGS) as [keyof FoamParams, (typeof FOAM_BINDINGS)[keyof typeof FOAM_BINDINGS]][]) {
      foam.addBinding(m.foam, key, opts).on('change', h.onFoam);
    }

    const spray = this.pane.addFolder({ title: 'Spray' });
    for (const [key, opts] of Object.entries(SPRAY_BINDINGS) as [keyof SprayParams, (typeof SPRAY_BINDINGS)[keyof typeof SPRAY_BINDINGS]][]) {
      spray.addBinding(m.spray, key, opts).on('change', h.onSpray);
    }

    const impact = this.pane.addFolder({ title: 'Impact' });
    for (const [key, opts] of Object.entries(IMPACT_BINDINGS) as [keyof ImpactParams, (typeof IMPACT_BINDINGS)[keyof typeof IMPACT_BINDINGS]][]) {
      impact.addBinding(m.impact, key, opts).on('change', h.onImpact);
    }

    const landFolder = this.pane.addFolder({ title: 'Land', expanded: false });
    for (const [key, opts] of Object.entries(LAND_BINDINGS) as [keyof typeof LAND_BINDINGS, (typeof LAND_BINDINGS)[keyof typeof LAND_BINDINGS]][]) {
      landFolder.addBinding(m.land, key, opts).on('change', h.onLand);
    }
    landFolder.addBinding(m.land, 'shadow', { label: 'land shadow' }).on('change', h.onLand);

    const surfFolder = this.pane.addFolder({ title: 'Surf', expanded: false });
    surfFolder.addBinding(m.surf, 'amount', SURF_BINDINGS.amount).on('change', h.onSurf);
    surfFolder.addBinding(m.surf, 'enabled', { label: 'surf' }).on('change', h.onSurf);
    const bombieFolder = this.pane.addFolder({ title: 'Bombie', expanded: false });
    bombieFolder.addBinding(m.bombie, 'enabled', { label: 'bombie' }).on('change', h.onBombie);
    bombieFolder.addBinding(m.bombie, 'size', BOMBIE_BINDINGS.size).on('change', h.onBombie);
    bombieFolder.addBinding(m.bombie, 'thresholdFt', BOMBIE_BINDINGS.thresholdFt).on('change', h.onBombie);
    const surferFolder = this.pane.addFolder({ title: 'Surfer', expanded: false });
    surferFolder.addBinding(m.surfer, 'enabled', { label: 'surfer' }).on('change', h.onSurfer);
    for (const key of ['preset', 'stance'] as const) {
      surferFolder.addBinding(m.surfer, key, { label: key, options: SURFER_OPTIONS[key] }).on('change', h.onSurfer);
    }
    // The board list follows the preset: App's onSurfer repairs the board first, then refresh() rebuilds the list.
    const boardIndex = surferFolder.children.length;
    let boardBinding = surferFolder.addBinding(m.surfer, 'board', { label: 'board', options: surferBoardOptions(m.surfer.preset) }).on('change', h.onSurfer);
    // Only when the preset changed: a board pick refreshes the panel from inside its own change event, and disposing
    // the binding there throws in Tweakpane (the folder's handler still runs) and loses the save.
    let listedFor = m.surfer.preset;
    this.refreshSurferBoards = (): void => {
      if (m.surfer.preset === listedFor) return;
      listedFor = m.surfer.preset;
      boardBinding.dispose();
      boardBinding = surferFolder.addBinding(m.surfer, 'board', { label: 'board', index: boardIndex, options: surferBoardOptions(m.surfer.preset) }).on('change', h.onSurfer);
    };
    for (const key of ['outfit', 'pose'] as const) {
      surferFolder.addBinding(m.surfer, key, { label: key, options: SURFER_OPTIONS[key] }).on('change', h.onSurfer);
    }
    readouts.add(surferFolder.addBinding(m.surferStatus, 'outfit', { label: 'wearing', readonly: true, interval: 500 }));
    surferFolder.addBinding(m.surfer, 'headingDeg', { label: 'heading', min: 0, max: 360, format: withCompass }).on('change', h.onSurfer);
    for (const [key, opts] of Object.entries(SURFER_BINDINGS) as [keyof typeof SURFER_BINDINGS, (typeof SURFER_BINDINGS)[keyof typeof SURFER_BINDINGS]][]) {
      surferFolder.addBinding(m.surfer, key, opts).on('change', h.onSurfer);
    }
    surferFolder.addBinding(m.surfer, 'play', { label: 'play (paddle, pop-up)' }).on('change', h.onSurfer);
    surferFolder.addBinding(m.surfer, 'onLand', { label: 'on land (dry; carry, walking clothes)' }).on('change', h.onSurfer);
    surferFolder.addBinding(m.surfer, 'carrySide', { label: 'carry side', options: SURFER_OPTIONS.carrySide }).on('change', h.onSurfer);
    surferFolder.addBinding(m.surfer, 'balance', { label: 'balance layer' }).on('change', h.onSurfer);
    const face = surferFolder.addFolder({ title: 'Face', expanded: false });
    face.addBinding(m.surfer, 'idle', { label: 'idle life' }).on('change', h.onSurfer);
    face.addBinding(m.surfer, 'faceManual', { label: 'manual face' }).on('change', h.onSurfer);
    for (const [key, opts] of Object.entries(FACE_BINDINGS) as [keyof typeof FACE_BINDINGS, (typeof FACE_BINDINGS)[keyof typeof FACE_BINDINGS]][]) {
      face.addBinding(m.surfer, key, opts).on('change', h.onSurfer);
    }
    surferFolder.addButton({ title: 'Place ahead of camera' }).on('click', h.onSurferPlaceAhead);
    surferFolder.addButton({ title: 'Chase view' }).on('click', h.onSurferChase);
    const land = surferFolder.addFolder({ title: 'On land', expanded: false });
    land.addButton({ title: 'dune crest (above the Womb)' }).on('click', () => h.onSurferSpot('duneCrest'));
    land.addButton({ title: 'beach (in front of the Womb)' }).on('click', () => h.onSurferSpot('beach'));
    land.addBinding(m.surfer, 'pile', { label: 'beach pile' }).on('change', h.onSurfer);
    land.addButton({ title: 'Place pile ahead of camera' }).on('click', () => h.onSurferPile('ahead'));
    land.addButton({ title: 'Pile beside the beach spot' }).on('click', () => h.onSurferPile('beach'));
    for (const [key, opts] of Object.entries(SURFER_LAND_BINDINGS) as [keyof typeof SURFER_LAND_BINDINGS, (typeof SURFER_LAND_BINDINGS)[keyof typeof SURFER_LAND_BINDINGS]][]) {
      land.addBinding(m.surfer, key, opts).on('change', h.onSurfer);
    }
    land.addBinding(m.surfer, 'pileHeadingDeg', { label: 'pile heading', min: 0, max: 360, format: withCompass }).on('change', h.onSurfer);
    const soundFolder = this.pane.addFolder({ title: 'Sound', expanded: false });
    for (const [key, opts] of Object.entries(SOUND_BINDINGS) as [keyof typeof SOUND_BINDINGS, (typeof SOUND_BINDINGS)[keyof typeof SOUND_BINDINGS]][]) {
      soundFolder.addBinding(m.sound, key, opts).on('change', h.onSound);
    }
    soundFolder.addBinding(m.sound, 'muted', { label: 'mute (M)' }).on('change', h.onSound);
    readouts.add(soundFolder.addBinding(m.soundStatus, 'track', { label: 'music', readonly: true, interval: 500 }));
    soundFolder.addButton({ title: 'Music play / pause' }).on('click', h.onMusicPlayPause);
    soundFolder.addButton({ title: 'Next track' }).on('click', h.onMusicNext);

    const reef = this.pane.addFolder({ title: 'Reef', expanded: false });
    reef.addBinding(m.reef, 'ledgeDepthM', { label: 'ledge depth (m)', min: 2, max: 12, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'deepDepthM', { label: 'deep water (m)', min: 8, max: 25, step: 0.5 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'ledgeWidthM', { label: 'ledge ramp width (m)', min: 40, max: 300, step: 5 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'shelfDepthM', { label: 'shelf depth (m)', min: 1, max: 8, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'headReliefM', { label: 'reef head relief (m)', min: 0, max: 4, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'minDepthM', { label: 'shallowest (m)', min: 0.3, max: 4, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'pocketDepthM', { label: 'sand pockets (m)', min: 2, max: 10, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.shallow, 'fadeFromM', { label: 'swell fade from (m)', min: 0, max: 20, step: 0.5 }).on('change', h.onShallow);
    reef.addBinding(m.shallow, 'fadeToM', { label: 'swell fade to (m)', min: 1, max: 30, step: 0.5 }).on('change', h.onShallow);
    for (const [key, opts] of Object.entries(OVERLAY_BINDINGS) as [keyof DebugOverlays, { label: string }][]) {
      reef.addBinding(m.overlays, key, opts).on('change', h.onOverlays);
    }

    const ocean = this.pane.addFolder({ title: 'Ocean', expanded: false });
    ocean.addBinding(m.spectrum, 'offshoreFetchM', { label: 'offshore fetch (m)', min: 50, max: 5000, step: 10 }).on('change', h.onSpectrum);
    ocean.addBinding(m.spectrum, 'onshoreFetchM', { label: 'onshore fetch (m)', min: 500, max: 50000, step: 100 }).on('change', h.onSpectrum);
    ocean.addBinding(m.spectrum, 'windSpread', { min: 1, max: 20, step: 0.5 }).on('change', h.onSpectrum);
    ocean.addBinding(m.spectrum, 'swellSpread', { min: 5, max: 100, step: 1 }).on('change', h.onSpectrum);
    ocean.addBinding(m.spectrum, 'windGamma', { min: 1, max: 7, step: 0.1 }).on('change', h.onSpectrum);
    ocean.addBinding(m.spectrum, 'swellGamma', { min: 1, max: 10, step: 0.1 }).on('change', h.onSpectrum);
    ocean.addBinding(m.sim, 'choppiness', { min: 0, max: 2, step: 0.01 }).on('change', h.onSim);
    ocean.addBinding(m.sim, 'foamThreshold', { min: -0.5, max: 1, step: 0.01 }).on('change', h.onSim);
    ocean.addBinding(m.sim, 'foamGain', { min: 0, max: 5, step: 0.05 }).on('change', h.onSim);
    ocean.addBinding(m.sim, 'foamDecayS', { min: 0.2, max: 10, step: 0.1 }).on('change', h.onSim);

    const water = this.pane.addFolder({ title: 'Water', expanded: false });
    water.addBinding(m.water, 'bodyScale', { min: 0, max: 4, step: 0.01 }).on('change', h.onWater);
    water.addBinding(m.water, 'transmissionThicknessM', { min: 0.2, max: 6, step: 0.1 }).on('change', h.onWater);
    water.addBinding(m.water, 'transmissionIntensity', { min: 0, max: 3, step: 0.01 }).on('change', h.onWater);
    water.addBinding(m.water, 'lipSkyTransmission', { label: 'lip skylight', min: 0, max: 2, step: 0.01 }).on('change', h.onWater);
    water.addBinding(m.water, 'lipSideSkylight', { label: 'lip side skylight', min: 0, max: 2, step: 0.01 }).on('change', h.onWater);
    water.addBinding(m.water, 'baseRoughness', { min: 0.005, max: 0.2, step: 0.001 }).on('change', h.onWater);
    water.addBinding(m.water, 'foamAlbedo', { min: 0, max: 1, step: 0.01 }).on('change', h.onWater);

    const sky = this.pane.addFolder({ title: 'Sky', expanded: false });
    sky.addBinding(m.atmosphere, 'hazeFactor', { min: 0, max: 8, step: 0.05 }).on('change', h.onAtmosphere);
    sky.addBinding(m.atmosphere, 'sunIlluminance', { min: 1, max: 100, step: 0.5 }).on('change', h.onAtmosphere);
    this.syncNightFloorProxy();
    sky.addBinding(this.nightFloorProxy, 'log10', { label: 'nightFloor (log10)', min: NIGHT_FLOOR_LOG10_MIN, max: NIGHT_FLOOR_LOG10_MAX, step: 0.05 })
      .on('change', (e) => {
        // A refresh shows a nightFloor set elsewhere (reset, a settings switch); only a slider drag writes it back.
        if (this.refreshing) return;
        m.atmosphere.nightFloor = 10 ** e.value;
        h.onAtmosphere();
      });
    sky.addBinding(m.atmosphere, 'groundAlbedo', { min: 0, max: 1, step: 0.01 }).on('change', h.onAtmosphere);

    const picture = this.pane.addFolder({ title: 'Picture', expanded: false });
    picture.addBinding(m.picture, 'agx', { label: 'AgX (vs Neutral)' }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'autoExposure').on('change', h.onPicture);
    picture.addBinding(m.picture, 'baseExposure', { min: 0.01, max: 5, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'evOffset', { label: 'EV offset', min: -5, max: 5, step: 0.1 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'bloomStrength', { min: 0, max: 1, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'bloomRadius', { min: 0, max: 1, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'bloomThreshold', { min: 0, max: 5, step: 0.05 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'lift', { min: -0.2, max: 0.2, step: 0.005 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'gamma', { min: 0.5, max: 2, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'gain', { min: 0.5, max: 2, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.picture, 'saturation', { min: 0, max: 2, step: 0.01 }).on('change', h.onPicture);
    picture.addBinding(m.frameLimiter, 'maxFps', { label: 'max fps (0 = display)', min: 0, max: 240, step: 1 });

    // Every binding and list reports here (refresh() too, when it changes a value). The readouts tick every 250 ms
    // and would otherwise look like edits.
    this.pane.on('change', (e) => {
      if (!readouts.has(e.target) && !this.settingReference) h.onAnySettingChanged();
    });
  }

  refresh(): void {
    this.refreshSurferBoards();
    this.syncNightFloorProxy();
    this.syncWindSpeedProxy();
    this.syncWeatherPreset();
    const outer = this.refreshing; // handlers may refresh again from inside a refresh
    this.refreshing = true;
    try {
      this.pane.refresh();
    } finally {
      this.refreshing = outer;
    }
  }

  /** Show which reference moment is on screen (a #ref= link, a reset) without it counting as a pick. */
  setReference(name: string): void {
    if (this.reference.value === name) return;
    this.settingReference = true;
    try {
      this.reference.value = name;
    } finally {
      this.settingReference = false;
    }
  }

  setVisible(visible: boolean): void {
    this.pane.hidden = !visible;
  }

  private syncNightFloorProxy(): void {
    this.nightFloorProxy.log10 = Math.log10(Math.max(this.m.atmosphere.nightFloor, 10 ** NIGHT_FLOOR_LOG10_MIN));
  }

  /** Show the preset the weather sliders now match, or custom, without it counting as a pick. */
  private syncWeatherPreset(): void {
    const name = presetOf(this.m.conditions.weather) ?? 'custom';
    if (this.weatherPreset.value === name) return;
    this.settingPreset = true;
    try {
      this.weatherPreset.value = name;
    } finally {
      this.settingPreset = false;
    }
  }

  private syncWindSpeedProxy(): void {
    this.windSpeedProxy.kmh = msToKmh(this.m.conditions.wind.speedMs);
  }
}
