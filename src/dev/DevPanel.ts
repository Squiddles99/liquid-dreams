import { type ListBladeApi, Pane } from 'tweakpane';
import { CONDITION_RANGES } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
import type { OceanSimParams } from '../ocean/OceanSimulation';
import type { OceanSpectrumParams } from '../ocean/spectrum';
import type { WaterOpticsParams } from '../ocean/waterOptics';
import type { PictureParams } from '../render/PicturePipeline';
import type { AtmosphereParams } from '../sky/atmosphereParams';
import { DEFAULT_MOMENT_NAME, REFERENCE_MOMENTS } from './referenceMoments';

export interface DevPanelModel {
  conditions: Conditions;
  spectrum: OceanSpectrumParams;
  sim: OceanSimParams;
  water: WaterOpticsParams;
  atmosphere: AtmosphereParams;
  picture: PictureParams;
  frameLimiter: { maxFps: number };
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
};

export class DevPanel {
  private readonly pane = new Pane({ title: 'Liquid Dreams', expanded: true });
  private readonly nightFloorProxy = { log10: 0 };

  constructor(private readonly m: DevPanelModel, h: DevPanelHandlers) {
    const moment = this.pane.addFolder({ title: 'Moment' });
    const ref = moment.addBlade({
      view: 'list', label: 'reference',
      options: REFERENCE_MOMENTS.map((r) => ({ text: r.name, value: r.name })),
      value: DEFAULT_MOMENT_NAME,
    }) as ListBladeApi<string>;
    ref.on('change', (e) => h.onReferenceMoment(e.value));
    moment.addBinding(m.conditions, 'date').on('change', h.onConditions);
    moment.addBinding(m.conditions, 'timeOfDay', CONDITION_BINDINGS.timeOfDay).on('change', h.onConditions);
    moment.addBinding(m.conditions, 'seed', { min: 0, step: 1 }).on('change', h.onConditions);
    moment.addButton({ title: 'Copy moment link (L)' }).on('click', h.onCopyLink);
    moment.addButton({ title: 'Pause / resume (P)' }).on('click', h.onTogglePause);
    moment.addButton({ title: 'Screenshot (K)' }).on('click', h.onScreenshot);

    const swell = this.pane.addFolder({ title: 'Swell' });
    swell.addBinding(m.conditions.swell, 'sizeFt', CONDITION_BINDINGS.swellSizeFt).on('change', h.onConditions);
    swell.addBinding(m.conditions.swell, 'periodS', CONDITION_BINDINGS.swellPeriodS).on('change', h.onConditions);
    swell.addBinding(m.conditions.swell, 'directionDeg', CONDITION_BINDINGS.swellDirectionDeg).on('change', h.onConditions);

    const wind = this.pane.addFolder({ title: 'Wind' });
    wind.addBinding(m.conditions.wind, 'speedMs', CONDITION_BINDINGS.windSpeedMs).on('change', h.onConditions);
    wind.addBinding(m.conditions.wind, 'directionDeg', CONDITION_BINDINGS.windDirectionDeg).on('change', h.onConditions);

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
  }

  refresh(): void {
    this.syncNightFloorProxy();
    this.pane.refresh();
  }

  setVisible(visible: boolean): void {
    this.pane.hidden = !visible;
  }

  private syncNightFloorProxy(): void {
    this.nightFloorProxy.log10 = Math.log10(Math.max(this.m.atmosphere.nightFloor, 10 ** NIGHT_FLOOR_LOG10_MIN));
  }
}
