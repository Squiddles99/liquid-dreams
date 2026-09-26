import { type ListBladeApi, Pane } from 'tweakpane';
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
    moment.addBinding(m.conditions, 'timeOfDay', { label: 'time (h)', min: 0, max: 23.999, step: 0.01 }).on('change', h.onConditions);
    moment.addBinding(m.conditions, 'seed', { min: 0, step: 1 }).on('change', h.onConditions);
    moment.addButton({ title: 'Copy moment link (L)' }).on('click', h.onCopyLink);
    moment.addButton({ title: 'Pause / resume (P)' }).on('click', h.onTogglePause);
    moment.addButton({ title: 'Screenshot (K)' }).on('click', h.onScreenshot);

    const swell = this.pane.addFolder({ title: 'Swell' });
    swell.addBinding(m.conditions.swell, 'sizeFt', { label: 'size (surfer ft)', min: 0, max: 12, step: 0.1 }).on('change', h.onConditions);
    swell.addBinding(m.conditions.swell, 'periodS', { label: 'period (s)', min: 4, max: 25, step: 0.5 }).on('change', h.onConditions);
    swell.addBinding(m.conditions.swell, 'directionDeg', { label: 'from (°)', min: 150, max: 300, step: 1 }).on('change', h.onConditions);

    const wind = this.pane.addFolder({ title: 'Wind' });
    wind.addBinding(m.conditions.wind, 'speedMs', { label: 'speed (m/s)', min: 0, max: 20, step: 0.1 }).on('change', h.onConditions);
    wind.addBinding(m.conditions.wind, 'directionDeg', { label: 'from (°)', min: 0, max: 359, step: 1 }).on('change', h.onConditions);

    const ocean = this.pane.addFolder({ title: 'Ocean', expanded: false });
    ocean.addBinding(m.spectrum, 'windFetchM', { label: 'fetch (m)', min: 500, max: 50000, step: 100 }).on('change', h.onSpectrum);
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
