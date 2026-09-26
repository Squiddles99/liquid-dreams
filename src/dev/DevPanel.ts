import { type BladeApi, type ListBladeApi, Pane } from 'tweakpane';
import { CONDITION_RANGES } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
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
  setStatus: { nextSet: string; wave: string };
  /** The settings switch's value when the panel is built (it only changes through the switch). */
  settingsMode: SettingsMode;
}

export interface DevPanelHandlers {
  onConditions(): void;
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
 * Conditions bindings. Tweakpane clamps to min/max and snaps to `step` on every refresh and writes the result back,
 * so each range contains everything sanitize allows and none has a step: a loaded moment (07:35 is 7.58333 h) must
 * come back exactly. `format` only rounds the display.
 */
export const CONDITION_BINDINGS = {
  timeOfDay: { label: 'time (h)', ...CONDITION_RANGES.timeOfDay, format: fixed(2) },
  swellSizeFt: { label: 'size (surfer ft)', ...CONDITION_RANGES.swellSizeFt, format: fixed(1) },
  swellPeriodS: { label: 'period (s)', ...CONDITION_RANGES.swellPeriodS, format: fixed(1) },
  swellDirectionDeg: { label: 'from (°)', ...CONDITION_RANGES.swellDirectionDeg, format: fixed(0) },
  windSpeedMs: { label: 'speed (m/s)', ...CONDITION_RANGES.windSpeedMs, format: fixed(1) },
  windDirectionDeg: { label: 'from (°)', ...CONDITION_RANGES.windDirectionDeg, format: fixed(0) },
  tideM: { label: 'tide (m)', ...CONDITION_RANGES.tideM, format: fixed(2) },
};

export class DevPanel {
  private readonly pane = new Pane({ title: 'Liquid Dreams', expanded: true });
  private readonly nightFloorProxy = { log10: 0 };
  /** True inside refresh(): the proxy's slider snaps to its step there, which must not overwrite nightFloor. */
  private refreshing = false;

  constructor(private readonly m: DevPanelModel, h: DevPanelHandlers) {
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
    ref.on('change', (e) => h.onReferenceMoment(e.value));
    moment.addBinding(m.conditions, 'date').on('change', h.onConditions);
    moment.addBinding(m.conditions, 'timeOfDay', CONDITION_BINDINGS.timeOfDay).on('change', h.onConditions);
    moment.addBinding(m.conditions, 'tideM', CONDITION_BINDINGS.tideM).on('change', h.onConditions);
    moment.addBinding(m.conditions, 'seed', { min: 0, step: 1 }).on('change', h.onConditions);
    moment.addButton({ title: 'Copy moment link (L)' }).on('click', h.onCopyLink);
    moment.addButton({ title: 'Pause / resume (P)' }).on('click', h.onTogglePause);
    moment.addButton({ title: 'Screenshot (K)' }).on('click', h.onScreenshot);
    moment.addButton({ title: 'Reset settings' }).on('click', h.onResetSettings);

    const swell = this.pane.addFolder({ title: 'Swell' });
    swell.addBinding(m.conditions.swell, 'sizeFt', CONDITION_BINDINGS.swellSizeFt).on('change', h.onConditions);
    swell.addBinding(m.conditions.swell, 'periodS', CONDITION_BINDINGS.swellPeriodS).on('change', h.onConditions);
    swell.addBinding(m.conditions.swell, 'directionDeg', CONDITION_BINDINGS.swellDirectionDeg).on('change', h.onConditions);

    const wind = this.pane.addFolder({ title: 'Wind' });
    wind.addBinding(m.conditions.wind, 'speedMs', CONDITION_BINDINGS.windSpeedMs).on('change', h.onConditions);
    wind.addBinding(m.conditions.wind, 'directionDeg', CONDITION_BINDINGS.windDirectionDeg).on('change', h.onConditions);

    const sets = this.pane.addFolder({ title: 'Sets' });
    const readouts = new Set<BladeApi>([
      sets.addBinding(m.setStatus, 'nextSet', { label: 'next set', readonly: true, interval: 250 }),
      sets.addBinding(m.setStatus, 'wave', { label: 'at the peak', readonly: true, interval: 250 }),
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
    reef.addBinding(m.overlays, 'depthContours', { label: 'depth contours' }).on('change', h.onOverlays);
    reef.addBinding(m.overlays, 'crestLines', { label: 'crest lines' }).on('change', h.onOverlays);

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
      if (!readouts.has(e.target)) h.onAnySettingChanged();
    });
  }

  refresh(): void {
    this.syncNightFloorProxy();
    const outer = this.refreshing; // handlers may refresh again from inside a refresh
    this.refreshing = true;
    try {
      this.pane.refresh();
    } finally {
      this.refreshing = outer;
    }
  }

  setVisible(visible: boolean): void {
    this.pane.hidden = !visible;
  }

  private syncNightFloorProxy(): void {
    this.nightFloorProxy.log10 = Math.log10(Math.max(this.m.atmosphere.nightFloor, 10 ** NIGHT_FLOOR_LOG10_MIN));
  }
}
