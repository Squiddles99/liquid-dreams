import * as THREE from 'three/webgpu';
import { sunForConditions } from '../astro/sunForConditions';
import { BreakingRibbon, FOOTPRINT_GRID, modelRibbonSurface } from '../breaker/BreakingRibbon';
import { type BreakParams, DEFAULT_BREAK_PARAMS, normalizeBreakParams } from '../breaker/breaking';
import { type StationEntry, minRibbonHeight, traceStations } from '../breaker/crestTrace';
import { formatPeakFace, peakFace } from '../breaker/peakFace';
import type { ReefField } from '../breaker/reefField';
import { ReefFieldClient } from '../breaker/ReefFieldClient';
import { SetWaves } from '../breaker/SetWaves';
import { type WaveContext, fieldBreakingHeight, toActiveWave } from '../breaker/setWaveModel';
import { CameraRig } from '../camera/CameraRig';
import { Input } from '../camera/Input';
import { DEFAULT_CONDITIONS, assignConditions, cloneConditions } from '../conditions/defaults';
import { sanitizeConditions } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
import { DevPanel } from '../dev/DevPanel';
import {
  CustomProfile, type DevLookParams, type DevSettings, type SettingsMode, type SettingsStorage, assignParams, clearDevSettings,
  cloneDevSettings, cloneLook, loadDevSettings, pickMoment, referenceNameFromHash, saveDevSettings,
} from '../dev/devSettings';
import { captureScreenshot, handleHotkeys, screenshotFilename } from '../dev/hotkeys';
import { type Moment, encodeMoment, momentFromHash, momentHashProblem } from '../dev/momentLink';
import { PerfOverlay } from '../dev/perf';
import { DEFAULT_MOMENT_NAME, defaultMoment, findReferenceMoment, referenceKind } from '../dev/referenceMoments';
import { HeightProbe } from '../ocean/HeightProbe';
import { DEFAULT_OCEAN_SIM, type OceanSimParams, OceanSimulation } from '../ocean/OceanSimulation';
import { DEFAULT_DEBUG_OVERLAYS, type DebugOverlays, OceanSurface } from '../ocean/OceanSurface';
import { DEFAULT_SPECTRUM_PARAMS, type OceanSpectrumParams, spectrumInputsKey } from '../ocean/spectrum';
import { DEFAULT_WATER_OPTICS, type WaterOpticsParams } from '../ocean/waterOptics';
import { nextUnderwater } from '../ocean/underwaterOptics';
import { WaterVolume } from '../ocean/WaterVolume';
import { createWaterOpticsUniforms, updateWaterOpticsUniforms } from '../ocean/waterShading';
import { DEFAULT_SHALLOW_SWELL, type ShallowSwellParams, WaterSurfaceModel } from '../ocean/waterSurface';
import { DEFAULT_PICTURE, type PictureParams, PicturePipeline } from '../render/PicturePipeline';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { DEFAULT_REEF_PARAMS, type ReefParams } from '../seabed/wombReef';
import { type AtmosphereParams, DEFAULT_ATMOSPHERE, type Rgb } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { DEFAULT_SET_PARAMS, type SetParams, type WaveEvent, callSetTime, nextSetArrivalS, normalizeSetParams, wavesNear } from '../swell/sets';
import { formatNextSet, waveStatus } from '../swell/setStatus';
import { FrameLimiter, SimClock, clampFrameDt, viewportSize } from './clock';
import { showOverlay } from './overlay';

const SPECTRUM_REBUILD_DEBOUNCE_MS = 150;
const REEF_REBUILD_DEBOUNCE_MS = 300;
const SETTINGS_SAVE_DEBOUNCE_MS = 500;
/** The crest trace's timing readout is an exponential moving average with this weight on each new frame. */
const TRACE_MS_ALPHA = 0.1;

/** localStorage, reached lazily: the getter itself can throw (blocked site data), and the devSettings functions catch that. */
const browserStorage: SettingsStorage = {
  getItem: (k) => window.localStorage.getItem(k),
  setItem: (k, v) => window.localStorage.setItem(k, v),
  removeItem: (k) => window.localStorage.removeItem(k),
};

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
  readonly atmosphereParams: AtmosphereParams = {
    ...DEFAULT_ATMOSPHERE,
    rayleighScatteringPerKm: [...DEFAULT_ATMOSPHERE.rayleighScatteringPerKm] as Rgb,
    ozoneAbsorptionPerKm: [...DEFAULT_ATMOSPHERE.ozoneAbsorptionPerKm] as Rgb,
  };
  readonly pictureParams: PictureParams = { ...DEFAULT_PICTURE };
  readonly reefParams: ReefParams = { ...DEFAULT_REEF_PARAMS };
  readonly setParams: SetParams = { ...DEFAULT_SET_PARAMS };
  readonly shallowParams: ShallowSwellParams = { ...DEFAULT_SHALLOW_SWELL };
  readonly overlays: DebugOverlays = { ...DEFAULT_DEBUG_OVERLAYS };
  readonly breakParams: BreakParams = { ...DEFAULT_BREAK_PARAMS };
  readonly setStatus = { nextSet: '', wave: '', face: '' };
  /** The look as constructed (deep clones): what "Reset settings" and default mode restore. */
  private readonly lookDefaults: DevLookParams = cloneLook(this.lookParams());
  private settingsMode: SettingsMode = 'custom';
  /**
   * The reference moment last picked (or opened by a #ref= link): what a settings-mode switch re-applies, and
   * what the reference list displays on a reload. Declared before `profile` below: restoreSettings() (which runs
   * as part of building it) may overwrite this from the stored settings, and nothing after it touches this field.
   */
  private currentReference = DEFAULT_MOMENT_NAME;
  /** `?fresh` starts from the defaults and leaves the stored profile untouched (no load, no save). */
  private readonly persist = !new URLSearchParams(location.search).has('fresh');
  /**
   * The custom profile (and whether the moment on screen is a link's visit). Restoring it assigns the stored look
   * into the params objects above, before the subsystems below are built from them.
   */
  private readonly profile = new CustomProfile(this.restoreSettings());
  readonly sky = new Sky(this.atmosphereParams);
  readonly ocean = new OceanSimulation(this.simParams);
  readonly seabed = new Seabed(buildBathymetry(this.reefParams));
  private builtReefKey = JSON.stringify(this.reefParams);
  readonly setWaves = new SetWaves(this.ocean.time);
  readonly surfaceModel = new WaterSurfaceModel(this.ocean, this.seabed, this.setWaves);
  readonly probe = new HeightProbe(this.surfaceModel);
  private readonly fieldClient = new ReefFieldClient();
  private fieldKey = '';
  /** The reef field once solved (null until then): the face readout has nothing to read before it arrives. */
  private field: ReefField | null = null;
  readonly waterOptics = createWaterOpticsUniforms(this.waterParams);
  /** The water around an underwater eye, in place of the sky dome (hidden above water). */
  readonly waterVolume = new WaterVolume(this.seabed, this.sky, this.waterOptics);
  /** The eye is below the water surface (with hysteresis: underwaterOptics.nextUnderwater). */
  private underwater = false;
  /** The breaking part of each set wave as its own mesh (breaking-ribbon spec); the sheet steps aside under its footprint. */
  readonly ribbon = new BreakingRibbon(modelRibbonSurface(this.surfaceModel), this.breakParams, { model: this.surfaceModel, sky: this.sky, optics: this.waterOptics });
  /** Waves no taller than this never reach the ribbon's onset (minRibbonHeight): recomputed when the field or the break params change. */
  private ribbonMinHeightM = Infinity;
  /** The field's wave context (made once per field, outside the timed trace). */
  private waveCtx: WaveContext | null = null;
  /**
   * What the ribbon last traced and computed from (sim time, camera xz, whether it traces). A frame with the same key
   * (paused, a captureFrame) skips the trace, the upload, the compute and the footprint. null forces a recompute: the
   * field, the break params, a moment or any panel edit (the sea, the tide or the reef may have changed) reset it.
   */
  private ribbonKey: string | null = null;
  /**
   * Dev readout (window.liquidDreams.traceMs in dev builds): the crest trace's CPU time per frame (ms), an exponential
   * moving average over the frames that trace (plan Q7's 2 ms target is measured here).
   */
  traceMs = 0;
  readonly oceanSurface: OceanSurface;
  readonly picture: PicturePipeline;
  private readonly perf: PerfOverlay;
  private readonly panel: DevPanel;
  private readonly sunDir = new THREE.Vector3();
  private readonly viewDir = new THREE.Vector3();
  private lastMs = performance.now();
  private spectrumKey = '';
  private spectrumTimer: number | undefined;
  private reefTimer: number | undefined;
  private saveTimer: number | undefined;
  private statusAge = 0;
  private screenshotRequested = false;
  private devUiVisible = true;

  /** `hashMoment` is the moment a #m= / #ref= link opened, or null to open the saved (or default) moment. */
  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly container: HTMLElement,
    hashMoment: Moment | null,
  ) {
    this.input = new Input(renderer.domElement);
    this.scene.add(this.sky.dome);
    this.scene.add(this.waterVolume.mesh);
    this.oceanSurface = new OceanSurface(this.surfaceModel, this.sky, this.waterOptics, { footprint: { texture: this.ribbon.footprint, ...FOOTPRINT_GRID } });
    this.scene.add(this.oceanSurface.mesh);
    this.scene.add(this.ribbon.mesh);
    this.picture = new PicturePipeline(renderer, this.scene, this.camera, this.pictureParams);
    this.perf = new PerfOverlay(renderer);
    this.panel = new DevPanel(
      {
        conditions: this.conditions, spectrum: this.spectrumParams, sim: this.simParams, water: this.waterParams, atmosphere: this.atmosphereParams,
        picture: this.pictureParams, frameLimiter: this.frameLimiter, sets: this.setParams, reef: this.reefParams, shallow: this.shallowParams,
        overlays: this.overlays, breaking: this.breakParams, setStatus: this.setStatus, settingsMode: this.settingsMode,
      },
      {
        onConditions: () => this.onConditionsEdited(),
        onUserConditionEdit: () => this.profile.own(),
        onSpectrum: () => this.scheduleSpectrumRebuild(),
        onSim: () => this.ocean.setParams(this.simParams),
        onWater: () => updateWaterOpticsUniforms(this.waterOptics, this.waterParams),
        onAtmosphere: () => this.sky.setParams(this.atmosphereParams),
        onPicture: () => this.picture.setParams(this.pictureParams),
        onReferenceMoment: (name) => this.goToReferenceMoment(name),
        onCopyLink: () => void this.copyLink(),
        onScreenshot: () => { this.screenshotRequested = true; },
        onTogglePause: () => this.setPaused(!this.clock.paused),
        onSets: () => {
          normalizeSetParams(this.setParams);
          this.panel.refresh();
        },
        onReef: () => this.scheduleReefRebuild(),
        onShallow: () => this.surfaceModel.setParams(this.shallowParams),
        onOverlays: () => {
          this.oceanSurface.setOverlays(this.overlays);
          this.ribbon.setOverlays(this.overlays);
        },
        onCallSet: () => this.callSetNow(),
        onBreak: () => {
          normalizeBreakParams(this.breakParams);
          this.setWaves.setBreakParams(this.breakParams);
          this.onRibbonInputs();
          this.panel.refresh();
        },
        onSettingsMode: (mode) => this.setSettingsMode(mode),
        onResetSettings: () => this.resetSettings(),
        onAnySettingChanged: () => {
          this.ribbonKey = null;
          this.scheduleSave();
        },
      },
    );
    renderer.onDeviceLost = (info) => this.onDeviceLost(info);
    this.fieldClient.onField = (f) => {
      this.field = f;
      this.setWaves.setField(f);
      this.onRibbonInputs();
    };
    this.applyAllParams();
    if (hashMoment) this.visitLink(hashMoment);
    else {
      // Display only: show the stored reference name without re-applying its moment (startupMoment already
      // carries the stored conditions and camera in custom mode; a #ref=/#m= link is handled by visitLink above).
      this.panel.setReference(this.currentReference);
      this.applyMoment(this.startupMoment());
    }
    window.addEventListener('resize', this.onResize);
    window.addEventListener('hashchange', this.onHashChange);
    window.addEventListener('pagehide', this.onPageHide);
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
    this.seabed.setTide(this.conditions.tideM);
    this.clock.setTime(m.simTime);
    this.setPaused(m.paused);
    this.rig.setPose(m.camera, this.waterHeightAtCamera());
    this.rebuildSpectrumIfNeeded(true);
    this.requestFieldIfNeeded(true);
    // The rebuild clears foam too, but a moment is a jump in sim time even when the sea is unchanged.
    this.ocean.resetFoam();
    this.ribbonKey = null;
    this.panel.refresh();
  }

  currentMoment(): Moment {
    return { conditions: cloneConditions(this.conditions), camera: this.rig.getPose(), simTime: this.clock.simTime, paused: this.clock.paused };
  }

  /** Latest GPU-sampled water height under the camera (holds while a readback is in flight). */
  protected waterHeightAtCamera(): number {
    return this.probe.heightAt(0) ?? 0;
  }

  /** The field or the break params changed: the ribbon's params and the trace's height cut-off follow. */
  private onRibbonInputs(): void {
    this.ribbon.setParams(this.breakParams);
    this.ribbonMinHeightM = this.field ? minRibbonHeight(fieldBreakingHeight(this.field, this.breakParams), this.breakParams) : Infinity;
    this.waveCtx = this.field ? { omega: this.field.omega, travelX: this.field.far.dirX, travelZ: this.field.far.dirZ } : null;
    this.ribbonKey = null;
  }

  /**
   * This frame's crest stations (crestTrace), timed into traceMs; none with no field yet or breaking off. The ribbon
   * then uploads them, computes its vertices and renders the footprint the sheet reads, all before the frame renders.
   */
  /**
   * Switches the view when the eye crosses the water surface (the probe under the camera, one frame behind): the sheet
   * seen from below, the water volume in place of the sky dome, the ribbon hidden. A crossing redraws the ribbon's
   * stations so its visibility comes back on surfacing.
   */
  private updateUnderwater(): void {
    this.waterVolume.followCamera(this.camera.position);
    const water = this.probe.heightAt(0);
    const under = water === null ? this.underwater : nextUnderwater(this.underwater, this.camera.position.y, water);
    if (under === this.underwater) return;
    this.underwater = under;
    this.oceanSurface.setUnderwater(under);
    this.sky.dome.visible = !under;
    this.waterVolume.mesh.visible = under;
    this.picture.setUnderwater(under);
    this.ribbonKey = null;
  }

  private updateRibbon(events: readonly WaveEvent[]): void {
    const field = this.field, ctx = this.waveCtx, cam = this.camera.position;
    const tracing = field !== null && ctx !== null && this.breakParams.enabled;
    const key = `${tracing}|${this.clock.simTime}|${cam.x}|${cam.z}`;
    if (key === this.ribbonKey) return;
    this.ribbonKey = key;
    let entries: StationEntry[] = [];
    if (tracing) {
      const waves = events.map(toActiveWave);
      const input = { cameraX: cam.x, cameraZ: cam.z, params: this.breakParams, minHeightM: this.ribbonMinHeightM };
      const start = performance.now();
      entries = traceStations(field, waves, this.clock.simTime, ctx, input);
      this.traceMs += TRACE_MS_ALPHA * (performance.now() - start - this.traceMs);
    }
    this.ribbon.setStations(entries, cam);
    this.ribbon.compute(this.renderer);
    this.ribbon.renderFootprint(this.renderer);
  }

  private onConditionsEdited(): void {
    const clean = sanitizeConditions(this.conditions);
    if (JSON.stringify(clean) !== JSON.stringify(this.conditions)) {
      assignConditions(this.conditions, clean);
      this.panel.refresh();
    }
    this.seabed.setTide(this.conditions.tideM);
    this.scheduleSpectrumRebuild();
  }

  private scheduleSpectrumRebuild(): void {
    clearTimeout(this.spectrumTimer);
    // The field shares the spectrum's debounce, so dragging a slider solves once when you stop. It is checked
    // separately because the spectrum key has no tide in it (a tide-only edit must still re-solve the field).
    this.spectrumTimer = window.setTimeout(() => {
      this.rebuildSpectrumIfNeeded(false);
      this.requestFieldIfNeeded(false);
    }, SPECTRUM_REBUILD_DEBOUNCE_MS);
  }

  private rebuildSpectrumIfNeeded(force: boolean): void {
    const key = spectrumInputsKey(this.conditions, this.spectrumParams);
    if (!force && key === this.spectrumKey) return;
    this.spectrumKey = key;
    this.ocean.setConditions(this.conditions, this.spectrumParams);
    this.ribbonKey = null;
  }

  /** Re-solve the reef wave field (off-thread) when the swell period or direction, the tide or the reef changes. */
  private requestFieldIfNeeded(force: boolean): void {
    const c = this.conditions;
    const key = JSON.stringify([c.swell.periodS, c.swell.directionDeg, c.tideM, this.reefParams]);
    if (!force && key === this.fieldKey) return;
    this.fieldKey = key;
    this.fieldClient.request({ bed: downsample(this.seabed.bathymetry, 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM });
  }

  /** Reef sliders rebuild the bathymetry (~2M cells) once you stop dragging, then re-solve the field on it. */
  private scheduleReefRebuild(): void {
    clearTimeout(this.reefTimer);
    this.reefTimer = window.setTimeout(() => {
      if (this.rebuildReefIfChanged()) this.requestFieldIfNeeded(true);
    }, REEF_REBUILD_DEBOUNCE_MS);
  }

  /** Rebuild the seabed if the reef params differ from the ones it was built from. The caller re-solves the field. */
  private rebuildReefIfChanged(): boolean {
    const key = JSON.stringify(this.reefParams);
    if (key === this.builtReefKey) return false;
    this.builtReefKey = key;
    this.seabed.setBathymetry(buildBathymetry(this.reefParams));
    this.ribbonKey = null;
    return true;
  }

  /** Jump sim time to just before the next set reaches the peak (reproducible: a moment link records the time). */
  private callSetNow(): void {
    const t = callSetTime(this.clock.simTime, this.conditions, this.setParams);
    if (t === null) {
      this.perf.flash('Flat: no sets to call');
      return;
    }
    this.clock.setTime(t);
    this.ocean.resetFoam();
    this.perf.flash('Set incoming');
  }

  /**
   * A reference picked in the panel. Default mode shows the moment as designed; custom mode carries it over by
   * kind (see pickMoment): a time moment keeps (or, after a visit, restores) Andrew's own conditions and camera;
   * a view or set moment is a visit, so it doesn't overwrite his own profile. Hash links still apply the full
   * moment (onHashChange).
   */
  private goToReferenceMoment(name: string): void {
    const picked = findReferenceMoment(name);
    if (!picked) return;
    // Flush a pending debounced save first (with the reference as it stood before this pick), so a condition edit
    // made just before the pick is in the stored profile, and this pick's own name isn't attributed to it early.
    if (this.settingsMode === 'custom') this.saveSettings();
    this.currentReference = name;
    if (this.settingsMode === 'default') this.restoreLook(this.lookDefaults);
    const { moment, visit } = pickMoment(
      this.settingsMode, referenceKind(name), this.profile.visiting,
      this.conditions, this.profile.profile, this.rig.getPose(), picked,
    );
    if (visit) this.profile.visitLink(); else this.profile.own();
    this.applyMoment(moment);
    // No hash: a reload would re-apply the full reference moment over the carried-over conditions.
    history.replaceState(null, '', location.pathname + location.search);
    this.saveSettings();
  }

  // ----- Dev settings: the custom profile, the custom/default switch, persistence -----

  /** Live references to the look params objects (maxFps by value). */
  private lookParams(): DevLookParams {
    return {
      spectrum: this.spectrumParams, sim: this.simParams, water: this.waterParams, atmosphere: this.atmosphereParams, picture: this.pictureParams,
      maxFps: this.frameLimiter.maxFps, sets: this.setParams, reef: this.reefParams, shallow: this.shallowParams, overlays: this.overlays,
      breaking: this.breakParams,
    };
  }

  /** Copy a look into the params objects in place (the panel binds them). */
  private assignLook(look: DevLookParams): void {
    assignParams(this.spectrumParams, look.spectrum);
    assignParams(this.simParams, look.sim);
    assignParams(this.waterParams, look.water);
    assignParams(this.atmosphereParams, look.atmosphere);
    assignParams(this.pictureParams, look.picture);
    this.frameLimiter.maxFps = look.maxFps;
    assignParams(this.setParams, look.sets);
    assignParams(this.reefParams, look.reef);
    assignParams(this.shallowParams, look.shallow);
    assignParams(this.overlays, look.overlays);
    assignParams(this.breakParams, look.breaking);
  }

  /** Assign a look and push it into every subsystem. Callers then apply a moment, which rebuilds the spectrum and re-solves the field. */
  private restoreLook(look: DevLookParams): void {
    this.assignLook(look);
    this.applyAllParams();
  }

  /** Every subsystem update handler, once, from the current params objects. */
  private applyAllParams(): void {
    normalizeSetParams(this.setParams);
    this.ocean.setParams(this.simParams);
    updateWaterOpticsUniforms(this.waterOptics, this.waterParams);
    this.sky.setParams(this.atmosphereParams);
    this.picture.setParams(this.pictureParams);
    this.surfaceModel.setParams(this.shallowParams);
    this.oceanSurface.setOverlays(this.overlays);
    this.ribbon.setOverlays(this.overlays);
    normalizeBreakParams(this.breakParams);
    this.setWaves.setBreakParams(this.breakParams);
    this.onRibbonInputs();
    clearTimeout(this.reefTimer);
    this.rebuildReefIfChanged();
  }

  private defaultSettings(): DevSettings {
    return cloneDevSettings({ mode: 'custom', conditions: cloneConditions(DEFAULT_CONDITIONS), camera: defaultMoment().camera, reference: DEFAULT_MOMENT_NAME, ...this.lookDefaults });
  }

  private snapshotSettings(): DevSettings {
    return cloneDevSettings({ mode: 'custom', conditions: this.conditions, camera: this.rig.getPose(), reference: this.currentReference, ...this.lookParams() });
  }

  /** Runs during field initialisation: loads the stored profile and, in custom mode, assigns its look in place. */
  private restoreSettings(): DevSettings {
    const stored = this.persist ? loadDevSettings(browserStorage, this.defaultSettings()) : null;
    if (!stored) return this.defaultSettings();
    this.settingsMode = stored.mode;
    this.currentReference = stored.reference;
    if (stored.mode === 'custom') this.assignLook(stored);
    return { ...stored, mode: 'custom' };
  }

  /** With no link: custom mode reopens the stored conditions and camera (running from t = 0); default mode opens the default moment. */
  private startupMoment(): Moment {
    const m = defaultMoment();
    if (this.settingsMode === 'default') return m;
    const p = cloneDevSettings(this.profile.profile);
    return { ...m, conditions: p.conditions, camera: p.camera };
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveSettings(), SETTINGS_SAVE_DEBOUNCE_MS);
  }

  /**
   * Custom mode folds the current state into the profile (keeping the stored conditions and camera during a link
   * visit); default mode leaves the profile alone and records only the mode.
   */
  private saveSettings(): void {
    clearTimeout(this.saveTimer);
    if (this.settingsMode === 'custom') this.profile.capture(this.snapshotSettings());
    // Default mode never visits: every pick there is shown in full, so its name always belongs in the reference list.
    else this.profile.profile.reference = this.currentReference;
    if (this.persist) saveDevSettings(browserStorage, { ...this.profile.profile, mode: this.settingsMode });
  }

  private setSettingsMode(mode: SettingsMode): void {
    if (mode === this.settingsMode) return;
    const reference = findReferenceMoment(this.currentReference) ?? defaultMoment();
    if (mode === 'default') {
      this.saveSettings(); // still custom: store the profile (a link visit still kept out of it) before the look goes back to defaults
      this.profile.own();
      this.settingsMode = 'default';
      this.restoreLook(this.lookDefaults);
      this.applyMoment(reference);
    } else {
      const stored = this.persist ? loadDevSettings(browserStorage, this.defaultSettings()) : null;
      if (stored) this.profile.profile = { ...stored, mode: 'custom' };
      const wasVisiting = this.profile.visiting;
      this.settingsMode = 'custom';
      this.restoreLook(this.profile.profile);
      // A view or set reference is a visit here too, so it doesn't immediately overwrite the profile just loaded.
      const { moment, visit } = pickMoment(
        'custom', referenceKind(this.currentReference), wasVisiting,
        this.profile.profile.conditions, this.profile.profile, this.rig.getPose(), reference,
      );
      if (visit) this.profile.visitLink(); else this.profile.own();
      this.applyMoment(moment);
    }
    this.saveSettings();
  }

  /** The custom profile back to defaults, in either mode (the mode itself is kept). */
  private resetSettings(): void {
    clearDevSettings(browserStorage);
    this.profile.profile = this.defaultSettings();
    this.profile.own();
    this.restoreLook(this.lookDefaults);
    this.currentReference = DEFAULT_MOMENT_NAME;
    this.panel.setReference(DEFAULT_MOMENT_NAME);
    this.applyMoment(defaultMoment());
    history.replaceState(null, '', location.pathname + location.search);
    // The refresh above reported the restored values as edits; storage stays clear (default mode keeps its mode).
    clearTimeout(this.saveTimer);
    if (this.settingsMode === 'default' && this.persist) saveDevSettings(browserStorage, { ...this.profile.profile, mode: 'default' });
    this.perf.flash('Settings reset to defaults');
  }

  private onPageHide = (): void => {
    this.saveSettings();
  };

  // ----- Links, pause, UI -----

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

  /**
   * A #m= / #ref= link applies its full moment, conditions and camera included, in either settings mode. It is a
   * visit, not an edit: saves keep the stored profile's conditions and camera until the user takes the moment over.
   * A #ref= link also shows its name in the reference list; a #m= link leaves the list as it is.
   */
  private visitLink(m: Moment): void {
    const name = referenceNameFromHash(location.hash);
    if (name) {
      this.currentReference = name;
      this.panel.setReference(name);
    }
    this.profile.visitLink();
    this.applyMoment(m);
  }

  private onHashChange = (): void => {
    const m = momentFromHash(location.hash);
    if (m) this.visitLink(m);
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

  /**
   * Dev automation (gallery captures): render one frame now, even when the page isn't animating (a hidden or
   * occluded window pauses requestAnimationFrame), and return it as a PNG. toBlob runs in the same task as the
   * render, so the WebGPU canvas still holds the frame.
   */
  captureFrame(): Promise<Blob | null> {
    const maxFps = this.frameLimiter.maxFps;
    this.frameLimiter.maxFps = 0;
    this.frame();
    this.frameLimiter.maxFps = maxFps;
    return new Promise((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'));
  }

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
      callSet: () => this.callSetNow(),
    });
    this.rig.update(realDt, this.input, this.waterHeightAtCamera());

    const sun = sunForConditions(this.conditions);
    this.sunDir.set(...sun.direction);
    this.sky.update(this.renderer, this.sunDir, this.camera.position.y);
    this.sky.followCamera(this.camera.position);

    this.ocean.update(this.renderer, this.clock.simTime, simDt);
    const events = wavesNear(this.clock.simTime, this.conditions, this.setParams);
    this.setWaves.setEvents(events);
    this.updateUnderwater();
    this.updateRibbon(events);
    // The ribbon is single-sided and the sheet is cut away under it only above water: hidden underwater.
    if (this.underwater) this.ribbon.mesh.visible = false;
    this.statusAge += realDt;
    if (this.statusAge > 0.25) {
      this.statusAge = 0;
      this.setStatus.nextSet = formatNextSet(nextSetArrivalS(this.clock.simTime, this.conditions, this.setParams), this.clock.simTime);
      this.setStatus.wave = waveStatus(this.clock.simTime, events);
      this.setStatus.face = formatPeakFace(peakFace(this.field, events, this.clock.simTime, this.breakParams), this.field !== null);
    }
    const probeXZ = this.rig.probeXZ;
    this.probe.setProbe(0, probeXZ.x, probeXZ.z);
    this.probe.update(this.renderer);
    this.oceanSurface.update(this.camera.position, this.ocean);

    this.picture.setSun(sun.elevationDeg, this.camera.getWorldDirection(this.viewDir).dot(this.sunDir));
    this.ribbon.setDisplayExposure(this.picture.exposureValue);
    this.picture.render();
    if (this.screenshotRequested) {
      this.screenshotRequested = false;
      captureScreenshot(this.renderer.domElement, screenshotFilename(this.conditions));
    }
    // GPU timestamp readback only matters while the stats are on screen.
    if (this.devUiVisible) this.perf.update();
  };
}
