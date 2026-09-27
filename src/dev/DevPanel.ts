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
  setStatus: { nextSet: string; wave: string; face: string };
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
  troughDrain: { label: 'trough drain', min: 0, max: 1, step: 0.01 },
  hFloorM: { label: 'depth floor h₀ (m)', min: 0.05, max: 2, step: 0.05 },
  faceWidth: { label: 'face width (×H)', min: 0.1, max: 3, step: 0.05 },
  drainEnd: { label: 'drain end (stage)', min: 0.01, max: 1, step: 0.01 },
  collapseStart: { label: 'collapse start (stage)', min: 0, max: 0.95, step: 0.01 },
  throwStrength: { label: 'throw strength (×c)', min: 0.1, max: 1.5, step: 0.01 },
  lipThickness: { label: 'lip thickness (×H)', min: 0.03, max: 0.3, step: 0.005 },
  collapseTime: { label: 'collapse time (×τ land)', min: 0.3, max: 3, step: 0.05 },
  ribbonOnset: { label: 'ribbon onset r', min: 0.3, max: 0.9, step: 0.01 },
} as const;

/** Debug overlay toggles (Reef folder), one per DebugOverlays field, checked by DevPanel.test.ts. */
export const OVERLAY_BINDINGS: Record<keyof DebugOverlays, { label: string }> = {
  depthContours: { label: 'depth contours' },
  crestLines: { label: 'crest lines' },
  ribbonTint: { label: 'ribbon tint' },
};

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

    const sets = this.pane.addFolder({ title: 'Sets' });
    const readouts = new Set<BladeApi>([
      sets.addBinding(m.setStatus, 'nextSet', { label: 'next set', readonly: true, interval: 250 }),
      sets.addBinding(m.setStatus, 'wave', { label: 'at the peak', readonly: true, interval: 250 }),
      sets.addBinding(m.setStatus, 'face', { label: 'face at the peak', readonly: true, interval: 250 }),
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

    const reef = this.pane.addFolder({ title: 'Reef', expanded: false });
    reef.addBinding(m.reef, 'ledgeDepthM', { label: 'ledge depth (m)', min: 2, max: 12, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'deepDepthM', { label: 'deep water (m)', min: 8, max: 25, step: 0.5 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'ledgeWidthM', { label: 'ledge width (m)', min: 3, max: 40, step: 1 }).on('change', h.onReef);
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
    this.syncNightFloorProxy();
    this.syncWindSpeedProxy();
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

  private syncWindSpeedProxy(): void {
    this.windSpeedProxy.kmh = msToKmh(this.m.conditions.wind.speedMs);
  }
}
