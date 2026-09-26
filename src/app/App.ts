import * as THREE from 'three/webgpu';
import { sunForConditions } from '../astro/sunForConditions';
import { CameraRig } from '../camera/CameraRig';
import { Input } from '../camera/Input';
import { DEFAULT_CONDITIONS, assignConditions, cloneConditions } from '../conditions/defaults';
import { sanitizeConditions } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
import { DevPanel } from '../dev/DevPanel';
import { captureScreenshot, handleHotkeys, screenshotFilename } from '../dev/hotkeys';
import { type Moment, encodeMoment, momentFromHash, momentHashProblem } from '../dev/momentLink';
import { PerfOverlay } from '../dev/perf';
import { HeightProbe } from '../ocean/HeightProbe';
import { DEFAULT_OCEAN_SIM, type OceanSimParams, OceanSimulation } from '../ocean/OceanSimulation';
import { OceanSurface } from '../ocean/OceanSurface';
import { DEFAULT_SPECTRUM_PARAMS, type OceanSpectrumParams, spectrumInputsKey } from '../ocean/spectrum';
import { DEFAULT_WATER_OPTICS, type WaterOpticsParams } from '../ocean/waterOptics';
import { createWaterOpticsUniforms, updateWaterOpticsUniforms } from '../ocean/waterShading';
import { DEFAULT_PICTURE, type PictureParams, PicturePipeline } from '../render/PicturePipeline';
import { type AtmosphereParams, DEFAULT_ATMOSPHERE, type Rgb } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { FrameLimiter, SimClock, clampFrameDt, viewportSize } from './clock';
import { showOverlay } from './overlay';

const SPECTRUM_REBUILD_DEBOUNCE_MS = 150;

export class App {
  readonly scene = new THREE.Scene();
  readonly clock = new SimClock();
  private readonly frameLimiter = new FrameLimiter();
  readonly rig = new CameraRig();
  readonly input: Input;
  /** Stable objects: the dev panel binds to them, so values are copied in, never swapped. */
  readonly conditions: Conditions = cloneConditions(DEFAULT_CONDITIONS);
  readonly spectrumParams: OceanSpectrumParams = { ...DEFAULT_SPECTRUM_PARAMS };
  readonly simParams: OceanSimParams = { ...DEFAULT_OCEAN_SIM };
  readonly waterParams: WaterOpticsParams = {
    ...DEFAULT_WATER_OPTICS,
    absorptionPerM: [...DEFAULT_WATER_OPTICS.absorptionPerM] as Rgb,
    backscatterPerM: [...DEFAULT_WATER_OPTICS.backscatterPerM] as Rgb,
  };
  readonly atmosphereParams: AtmosphereParams = { ...DEFAULT_ATMOSPHERE };
  readonly pictureParams: PictureParams = { ...DEFAULT_PICTURE };
  readonly sky = new Sky(this.atmosphereParams);
  readonly ocean = new OceanSimulation(this.simParams);
  readonly probe = new HeightProbe(this.ocean);
  readonly waterOptics = createWaterOpticsUniforms(this.waterParams);
  readonly oceanSurface: OceanSurface;
  readonly picture: PicturePipeline;
  private readonly perf: PerfOverlay;
  private readonly panel: DevPanel;
  private readonly sunDir = new THREE.Vector3();
  private readonly viewDir = new THREE.Vector3();
  private lastMs = performance.now();
  private spectrumKey = '';
  private spectrumTimer: number | undefined;
  private screenshotRequested = false;
  private devUiVisible = true;

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly container: HTMLElement,
    initial: Moment,
  ) {
    this.input = new Input(renderer.domElement);
    this.scene.add(this.sky.dome);
    this.oceanSurface = new OceanSurface(this.ocean, this.sky, this.waterOptics);
    this.scene.add(this.oceanSurface.mesh);
    this.picture = new PicturePipeline(renderer, this.scene, this.camera, this.pictureParams);
    this.perf = new PerfOverlay(renderer);
    this.panel = new DevPanel(
      { conditions: this.conditions, spectrum: this.spectrumParams, sim: this.simParams, water: this.waterParams, atmosphere: this.atmosphereParams, picture: this.pictureParams, frameLimiter: this.frameLimiter },
      {
        onConditions: () => this.onConditionsEdited(),
        onSpectrum: () => this.scheduleSpectrumRebuild(),
        onSim: () => this.ocean.setParams(this.simParams),
        onWater: () => updateWaterOpticsUniforms(this.waterOptics, this.waterParams),
        onAtmosphere: () => this.sky.setParams(this.atmosphereParams),
        onPicture: () => this.picture.setParams(this.pictureParams),
        onReferenceMoment: (name) => this.goToReferenceMoment(name),
        onCopyLink: () => void this.copyLink(),
        onScreenshot: () => { this.screenshotRequested = true; },
        onTogglePause: () => this.setPaused(!this.clock.paused),
      },
    );
    renderer.onDeviceLost = (info) => this.onDeviceLost(info);
    this.applyMoment(initial);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('hashchange', this.onHashChange);
    this.onResize();
  }

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  applyMoment(m: Moment): void {
    assignConditions(this.conditions, m.conditions);
    this.clock.setTime(m.simTime);
    this.setPaused(m.paused);
    this.rig.setPose(m.camera, this.waterHeightAtCamera());
    this.rebuildSpectrumIfNeeded(true);
    // The rebuild clears foam too, but a moment is a jump in sim time even when the sea is unchanged.
    this.ocean.resetFoam();
    this.panel.refresh();
  }

  currentMoment(): Moment {
    return { conditions: cloneConditions(this.conditions), camera: this.rig.getPose(), simTime: this.clock.simTime, paused: this.clock.paused };
  }

  /** Latest GPU-sampled water height under the camera (holds while a readback is in flight). */
  protected waterHeightAtCamera(): number {
    return this.probe.heightAt(0) ?? 0;
  }

  private onConditionsEdited(): void {
    const clean = sanitizeConditions(this.conditions);
    if (JSON.stringify(clean) !== JSON.stringify(this.conditions)) {
      assignConditions(this.conditions, clean);
      this.panel.refresh();
    }
    this.scheduleSpectrumRebuild();
  }

  private scheduleSpectrumRebuild(): void {
    clearTimeout(this.spectrumTimer);
    this.spectrumTimer = window.setTimeout(() => this.rebuildSpectrumIfNeeded(false), SPECTRUM_REBUILD_DEBOUNCE_MS);
  }

  private rebuildSpectrumIfNeeded(force: boolean): void {
    const key = spectrumInputsKey(this.conditions, this.spectrumParams);
    if (!force && key === this.spectrumKey) return;
    this.spectrumKey = key;
    this.ocean.setConditions(this.conditions, this.spectrumParams);
  }

  /** Re-selecting the reference already in the hash fires no hashchange, so apply it directly then. */
  private goToReferenceMoment(name: string): void {
    const hash = `#ref=${encodeURIComponent(name)}`;
    if (location.hash === hash) this.onHashChange();
    else location.hash = hash;
  }

  private async copyLink(): Promise<void> {
    history.replaceState(null, '', encodeMoment(this.currentMoment()));
    try {
      await navigator.clipboard.writeText(location.href);
      this.perf.flash('Moment link copied');
    } catch {
      this.perf.flash('Moment link is in the address bar (clipboard unavailable)');
    }
  }

  /** Every pause change goes through here so the paused badge always matches the clock. */
  private setPaused(paused: boolean): void {
    this.clock.paused = paused;
    this.perf.setPaused(paused);
  }

  private toggleDevUi(): void {
    this.devUiVisible = !this.devUiVisible;
    this.panel.setVisible(this.devUiVisible);
    this.perf.setVisible(this.devUiVisible);
  }

  private onDeviceLost(info: { message?: string }): void {
    // Nothing more can be drawn on a lost device; stop the loop rather than keep submitting to it.
    this.renderer.setAnimationLoop(null);
    const hash = encodeMoment(this.currentMoment());
    showOverlay('The GPU connection was lost', info?.message || 'The graphics device stopped responding.', [
      { label: 'Reload this moment', onClick: () => { history.replaceState(null, '', hash); location.reload(); } },
    ]);
  }

  private onHashChange = (): void => {
    const m = momentFromHash(location.hash);
    if (m) this.applyMoment(m);
    else {
      const problem = momentHashProblem(location.hash);
      if (problem) console.warn(`Moment link ignored (${problem}); keeping the current moment.`);
    }
  };

  private onResize = (): void => {
    const { width, height } = viewportSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private frame = (): void => {
    const now = performance.now();
    if (!this.frameLimiter.shouldRender(now)) return;
    const realDt = clampFrameDt((now - this.lastMs) / 1000);
    this.lastMs = now;
    const simDt = this.clock.tick(realDt);

    handleHotkeys(this.input, {
      copyLink: () => void this.copyLink(),
      togglePause: () => this.setPaused(!this.clock.paused),
      screenshot: () => { this.screenshotRequested = true; },
      toggleDevUi: () => this.toggleDevUi(),
    });
    this.rig.update(realDt, this.input, this.waterHeightAtCamera());

    const sun = sunForConditions(this.conditions);
    this.sunDir.set(...sun.direction);
    this.sky.update(this.renderer, this.sunDir, this.camera.position.y);
    this.sky.followCamera(this.camera.position);

    this.ocean.update(this.renderer, this.clock.simTime, simDt);
    const probeXZ = this.rig.probeXZ;
    this.probe.setProbe(0, probeXZ.x, probeXZ.z);
    this.probe.update(this.renderer);
    this.oceanSurface.update(this.camera.position, this.ocean);

    this.picture.setSun(sun.elevationDeg, this.camera.getWorldDirection(this.viewDir).dot(this.sunDir));
    this.picture.render();
    if (this.screenshotRequested) {
      this.screenshotRequested = false;
      captureScreenshot(this.renderer.domElement, screenshotFilename(this.conditions));
    }
    // GPU timestamp readback only matters while the stats are on screen.
    if (this.devUiVisible) this.perf.update();
  };
}
