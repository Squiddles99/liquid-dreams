import * as THREE from 'three/webgpu';
import { sunForConditions } from '../astro/sunForConditions';
import { BreakingRibbon, FOOTPRINT_GRID, modelRibbonSurface } from '../breaker/BreakingRibbon';
import { type BreakParams, DEFAULT_BREAK_PARAMS, normalizeBreakParams } from '../breaker/breaking';
import { type StationEntry, minRibbonHeight, traceStations } from '../breaker/crestTrace';
import { formatPeakFace, peakFace } from '../breaker/peakFace';
import { type ReefField, sampleField } from '../breaker/reefField';
import { BOMBIE_X, BOMBIE_Z, type BombieWaves, type Burst, burstAt, burstWidthM, burstsAt, setIndicesFrom, setWindow } from '../bombie/bombieModel';
import { BombieMesh } from '../bombie/BombieMesh';
import { surferFeetToHs } from '../conditions/units';
import { DEFAULT_BOMBIE_PARAMS, type BombieParams, normalizeBombieParams } from '../bombie/bombieParams';
import { DEFAULT_SOUND_PARAMS, type SoundParams, normalizeSoundParams } from '../sound/soundParams';
import { SoundSystem } from '../sound/SoundSystem';
import { ticksToHear } from '../sound/hits';
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
import { type CameraPose, type Moment, encodeMoment, momentFromHash, momentHashProblem } from '../dev/momentLink';
import { PerfOverlay } from '../dev/perf';
import { DEFAULT_MOMENT_NAME, defaultMoment, findReferenceMoment, referenceKind } from '../dev/referenceMoments';
import { HeightProbe } from '../ocean/HeightProbe';
import { DEFAULT_OCEAN_SIM, type OceanSimParams, OceanSimulation } from '../ocean/OceanSimulation';
import { DEFAULT_DEBUG_OVERLAYS, type DebugOverlays, OceanSurface } from '../ocean/OceanSurface';
import { DEFAULT_SPECTRUM_PARAMS, type OceanSpectrumParams, spectrumInputsKey } from '../ocean/spectrum';
import { DEFAULT_WATER_OPTICS, type WaterOpticsParams } from '../ocean/waterOptics';
import { nextUnderwater } from '../ocean/underwaterOptics';
import { LensWater } from '../render/lensWater';
import { WaterVolume } from '../ocean/WaterVolume';
import { createWaterOpticsUniforms, updateWaterOpticsUniforms } from '../ocean/waterShading';
import { DEFAULT_SHALLOW_SWELL, type ShallowSwellParams, WaterSurfaceModel } from '../ocean/waterSurface';
import { DEFAULT_PICTURE, type PictureParams, PicturePipeline } from '../render/PicturePipeline';
import { bedHeightAt, buildBathymetry, downsample } from '../seabed/bathymetry';
import { SHORE_X } from '../seabed/coastProfile';
import { Seabed, WATERLINE_STEP_M } from '../seabed/Seabed';
import { DEFAULT_REEF_PARAMS, type ReefParams } from '../seabed/wombReef';
import { type AtmosphereParams, DEFAULT_ATMOSPHERE, type Rgb } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { Clouds } from '../weather/Clouds';
import { CloudMeter } from '../weather/cloudMeter';
import { combineSunlight } from '../weather/CloudShadow';
import { DEFAULT_SET_PARAMS, type SetParams, type WaveEvent, callSetTime, nextSetArrivalS, normalizeSetParams, wavesBetween, wavesNear } from '../swell/sets';
import { CoastalSurf } from '../surf/CoastalSurf';
import { DEFAULT_SURF_PARAMS, type SurfParams, normalizeSurfParams } from '../surf/surfModel';
import { formatNextSet, waveStatus } from '../swell/setStatus';
import { FoamField } from '../whitewater/FoamField';
import { SprayParticles } from '../whitewater/SprayParticles';
import {
  DEFAULT_IMPACT_PARAMS, DEFAULT_SPRAY_PARAMS, bombieImpactEmitters, IMPACT_MAX_LIFE_S, type ImpactEmitter, type ImpactParams, type SprayEmitter, type SprayParams, breakEmitters,
  impactBirths, normalizeImpactParams, normalizeSprayParams, sprayBirths, sprayCanEmit, windToVector,
} from '../whitewater/sprayEmitters';
import { IMPACT_KIND } from '../whitewater/particleKinds';
import { Land } from '../land/Land';
import { GroundPatch } from '../beach/GroundPatchMesh';
import { PatchTracker, buildPatchGrids, patchVisible } from '../beach/groundPatch';
import { Rocks } from '../beach/RockMeshes';
import { PlantField, patchCasters, type Plant } from '../heath/plants';
import { PlantMeshes } from '../heath/PlantMeshes';
import { uniform } from 'three/tsl';
import { type Rock, RockField } from '../beach/rocks';
import { buildGroundShadows } from '../beach/rockShadows';
import { DEFAULT_LAND_PARAMS, type LandParams, normalizeLandParams } from '../land/landParams';
import { DEFAULT_FOAM_PARAMS, type FoamParams, normalizeFoamParams, tickTime, FOAM_TICKS_PER_S } from '../whitewater/foamStep';
import { FrameLimiter, SimClock, clampFrameDt, viewportSize } from './clock';
import { showOverlay } from './overlay';

const SPECTRUM_REBUILD_DEBOUNCE_MS = 150;
const REEF_REBUILD_DEBOUNCE_MS = 300;
const SETTINGS_SAVE_DEBOUNCE_MS = 500;
/** The rocks are relaid (from the cached cells) once the camera has moved this far (Phase 4c-1). */
const ROCK_RELAY_M = 2;
/** The plants are relaid once the camera has moved this far (Phase 4c-2 §3.7). */
const PLANT_RELAY_M = 3;
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
  readonly foamParams: FoamParams = { ...DEFAULT_FOAM_PARAMS };
  readonly sprayParams: SprayParams = { ...DEFAULT_SPRAY_PARAMS };
  readonly impactParams: ImpactParams = { ...DEFAULT_IMPACT_PARAMS };
  readonly landParams: LandParams = { ...DEFAULT_LAND_PARAMS };
  readonly surfParams: SurfParams = { ...DEFAULT_SURF_PARAMS };
  /** Ellensbrook Bombie (Phase 4c-3): its folder, its white water, its arrival time from the reef field. */
  readonly bombieParams: BombieParams = { ...DEFAULT_BOMBIE_PARAMS };
  readonly bombie: BombieMesh;
  private bombieTauS: number | null = null;
  private bombieTauField: ReefField | null = null;
  /** Dev readout (window.liquidDreams.bombieBurst): the Bombie's current burst, or null. */
  bombieBurst: { n: number; ageS: number; heightM: number } | null = null;
  /** The Sound folder (Phase 5): the volumes and mute, persisted with the look. */
  readonly soundParams: SoundParams = { ...DEFAULT_SOUND_PARAMS };
  /** The sound (Phase 5): silent until the first click or key press. */
  readonly sound = new SoundSystem(this.soundParams);
  private lastSoundTick: number | null = null;
  private readonly soundDir = new THREE.Vector3();
  /** The coastal surf along the whole shore (Phase 4b spec 2026-09-28-the-waterline-design.md). */
  readonly surf = new CoastalSurf();
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
  /** The weather's clouds (spec 2026-09-30), marched into the sky's map before any material reads it. */
  readonly clouds = new Clouds(this.sky);
  /** The exposure's cloud term: meters the light under the clouds (spec 2026-09-30 §4.6). */
  readonly cloudMeter = new CloudMeter(this.sky.luts.skyLightAttr, this.sky.cloudSunAttr);
  readonly ocean = new OceanSimulation(this.simParams);
  readonly seabed = new Seabed(buildBathymetry(this.reefParams));
  /** The land behind the Womb (Phase 4a spec 2026-09-28-the-view-back-design.md); landless until its file loads. */
  readonly land = new Land(this.sky);
  /** The sun reaching a point: the ridge's shade (the land's sunlight map) times the clouds' shadow. */
  readonly sunlight = combineSunlight(this.land.sunlight, this.clouds.shadow);
  private landTimer: number | undefined;
  /** On the beach (Phase 4c-1): the fine ground at your feet and the 3D rocks, from the land once it loads. */
  readonly patch: GroundPatch;
  readonly rocks: Rocks;
  private rockField: RockField | null = null;
  private readonly patchTracker = new PatchTracker();
  private patchGrids: ReturnType<typeof buildPatchGrids> | undefined;
  /** The rocks near the camera, relaid when it has moved ROCK_RELAY_M (or the field changed). */
  private rocksNear: Rock[] = [];
  private rocksAt: [number, number] | null = null;
  private readonly shadowSun = new THREE.Vector3(0, -1, 0);
  /** The heath's plants (Phase 4c-2): from the land once it loads, refreshed every PLANT_RELAY_M. */
  readonly plants: PlantMeshes;
  private plantField: PlantField | null = null;
  private plantsNear: Plant[] = [];
  private plantsAt: [number, number] | null = null;
  /** The plant layout's patch state at the last refresh (a patch recentre or show/hide re-seats the plants). */
  private plantPatchKey = '';
  /** 1 while the plants stand near the camera: the painted heath fades to its floor there. */
  private readonly plantFloor = uniform(0);
  /** Dev readout (window.liquidDreams.plantStats): plants drawn and dropped (a full mesh) at the last refresh. */
  plantStats = { drawn: 0, dropped: 0 };
  /** A walk pose applied before the land loaded (it became a free pose): walked into once the ground exists. */
  private pendingWalk: CameraPose | null = null;
  private builtReefKey = JSON.stringify(this.reefParams);
  readonly setWaves = new SetWaves(this.ocean.time);
  readonly surfaceModel = new WaterSurfaceModel(this.ocean, this.seabed, this.setWaves);
  readonly probe = new HeightProbe(this.surfaceModel);
  /** Breaking foam that lingers and drifts (spec 2026-09-27-foam-field-design.md), stepped at 20 Hz of sim time. */
  readonly foamField = new FoamField({
    foamNode: (xz) => this.setWaves.breakingFoamNode(xz),
    dirNode: (xz) => this.setWaves.sample(xz, true).dir,
  });
  private foamTimer: number | undefined;
  private sprayTimer: number | undefined;
  private foamOnlyTimer: number | undefined;
  /** Offshore spray off the throwing lips (spec 2026-09-27-offshore-spray-design.md). */
  readonly spray = new SprayParticles(this.sky, undefined, this.sunlight);
  /** The impact explosion where each lip lands (spec 2026-09-28-impact-explosion-design.md), on the same particle system. */
  readonly impact = new SprayParticles(this.sky, IMPACT_KIND, this.sunlight);
  private impactTimer: number | undefined;
  /** This frame's emitters per tick, shared by the spray and the explosion (their replays cover different tick counts). */
  private readonly tickEmitters = new Map<number, { spray: SprayEmitter[]; impact: ImpactEmitter[] }>();
  private readonly fieldClient = new ReefFieldClient();
  private fieldKey = '';
  /** The reef field once solved (null until then): the face readout has nothing to read before it arrives. */
  private field: ReefField | null = null;
  readonly waterOptics = createWaterOpticsUniforms(this.waterParams);
  /** The water around an underwater eye, in place of the sky dome (hidden above water). */
  readonly waterVolume = new WaterVolume(this.seabed, this.sky, this.waterOptics);
  /** The eye is below the water surface (with hysteresis: underwaterOptics.nextUnderwater). */
  private underwater = false;
  /** After a moment jump: set the lineup camera on the water at the probe's first reading of the new spot. */
  private reseedLineup = false;
  /** Water on the lens as the camera breaks the surface. */
  private readonly lensWater = new LensWater();
  /** After a moment jump, the first crossing is the jump itself, not the camera breaking the surface: no water on the lens. */
  private lensQuiet = false;
  private lensClockS = 0;
  /** The breaking part of each set wave as its own mesh (breaking-ribbon spec); the sheet steps aside under its footprint. */
  readonly ribbon = new BreakingRibbon(modelRibbonSurface(this.surfaceModel), this.breakParams, { model: this.surfaceModel, sky: this.sky, optics: this.waterOptics, foamMap: this.foamField, sunlight: this.sunlight, skyline: this.land.skyline });
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
  /** Set only inside captureFrame: this frame renders there instead of to the canvas. */
  private captureTarget: THREE.RenderTarget | null = null;
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
    this.oceanSurface = new OceanSurface(this.surfaceModel, this.sky, this.waterOptics, { footprint: { texture: this.ribbon.footprint, ...FOOTPRINT_GRID }, foamMap: this.foamField, sunlight: this.sunlight, skyline: this.land.skyline, surf: this.surf, rain: (xz) => this.clouds.field.rainRate(xz) });
    this.land.setWetHeight((xz) => this.seabed.tide.add(this.surf.wetLevelNode(xz.y)));
    // The land's own material reads the ridge's shade; the clouds' shadow falls on it too.
    this.land.setSunVisibility((xz) => this.sunlight.visibilityNode(xz));
    this.scene.add(this.oceanSurface.mesh);
    this.bombie = new BombieMesh(this.surfaceModel, this.sky, (xz) => this.sunlight.visibilityNode(xz));
    this.scene.add(this.bombie.mesh);
    this.scene.add(this.ribbon.mesh);
    this.scene.add(this.spray.mesh);
    this.impact.setMaxLifeS(IMPACT_MAX_LIFE_S);
    this.scene.add(this.impact.mesh);
    this.scene.add(this.land.mesh);
    this.patch = new GroundPatch(this.sky, this.land.look, {
      sunVisibility: (xz) => this.sunlight.visibilityNode(xz),
      wetHeight: (xz) => this.seabed.tide.add(this.surf.wetLevelNode(xz.y)),
      plantFloor: this.plantFloor,
    });
    this.land.setHole(this.patch.hole);
    this.rocks = new Rocks(this.sky, (xz) => this.sunlight.visibilityNode(xz));
    this.plants = new PlantMeshes(this.sky, (xz) => this.sunlight.visibilityNode(xz));
    for (const m of this.plants.meshes) this.scene.add(m);
    this.land.setPlantFloor(this.plantFloor);
    this.scene.add(this.patch.mesh);
    for (const m of this.rocks.meshes) this.scene.add(m);
    void this.land.load().then(() => this.onLandBuilt(), (e: unknown) => {
      console.warn(`The land didn't load (${e instanceof Error ? e.message : String(e)}); running without it.`);
    });
    this.picture = new PicturePipeline(renderer, this.scene, this.camera, this.pictureParams);
    this.perf = new PerfOverlay(renderer);
    this.panel = new DevPanel(
      {
        conditions: this.conditions, spectrum: this.spectrumParams, sim: this.simParams, water: this.waterParams, atmosphere: this.atmosphereParams,
        picture: this.pictureParams, frameLimiter: this.frameLimiter, sets: this.setParams, reef: this.reefParams, shallow: this.shallowParams,
        overlays: this.overlays, breaking: this.breakParams, foam: this.foamParams, spray: this.sprayParams, impact: this.impactParams, land: this.landParams, surf: this.surfParams, bombie: this.bombieParams, sound: this.soundParams, soundStatus: this.sound.status, setStatus: this.setStatus, settingsMode: this.settingsMode,
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
          this.surf.invalidate();
          this.panel.refresh();
          this.scheduleParticleReplay();
        },
        onReef: () => this.scheduleReefRebuild(),
        onShallow: () => this.surfaceModel.setParams(this.shallowParams),
        onOverlays: () => {
          this.oceanSurface.setOverlays(this.overlays);
          this.ribbon.setOverlays(this.overlays);
          this.spray.setOverlays(this.overlays);
          this.impact.setOverlays(this.overlays);
          this.land.setOverlays(this.overlays);
        },
        onCallSet: () => this.callSetNow(),
        onBreak: () => {
          normalizeBreakParams(this.breakParams);
          this.setWaves.setBreakParams(this.breakParams);
          this.onRibbonInputs();
          this.panel.refresh();
          this.scheduleParticleReplay();
        },
        onSpray: () => {
          normalizeSprayParams(this.sprayParams);
          this.spray.setParams(this.sprayParams);
          this.panel.refresh();
          this.scheduleSprayReplay();
        },
        onImpact: () => {
          normalizeImpactParams(this.impactParams);
          this.panel.refresh();
          this.scheduleImpactReplay();
        },
        onSurf: () => {
          normalizeSurfParams(this.surfParams);
          this.panel.refresh();
          this.surf.invalidate();
        },
        onBombie: () => {
          normalizeBombieParams(this.bombieParams);
          this.panel.refresh();
        },
        onSound: () => {
          normalizeSoundParams(this.soundParams);
          this.panel.refresh();
          this.sound.applyParams();
        },
        onMusicPlayPause: () => this.sound.toggleMusic(),
        onMusicNext: () => this.sound.nextTrack(),
        onLand: () => {
          normalizeLandParams(this.landParams);
          this.panel.refresh();
          this.applyLandParams();
        },
        onFoam: () => {
          normalizeFoamParams(this.foamParams);
          this.foamField.setParams(this.foamParams);
          this.panel.refresh();
          this.scheduleFoamOnlyReplay();
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
      this.invalidateParticles();
      this.onRibbonInputs();
      // The set waves appear (or change) with the field, so the water under the camera jumps: read it afresh and set
      // the lineup camera back on it (on load the probe read flat water until now, and the lineup sat a crest's height low).
      this.probe.invalidate();
      this.reseedLineup = true;
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
    this.sound.arm();
  }

  applyMoment(m: Moment): void {
    this.surf.invalidate();
    assignConditions(this.conditions, m.conditions);
    this.seabed.setTide(this.conditions.tideM);
    this.clock.setTime(m.simTime);
    this.setPaused(m.paused);
    // The probe still holds the old spot's water: seed the lineup at the still-water level, forget the old readings, and
    // snap the lineup onto the water at the first reading of the new spot (reseedLineup). Seeded from the stale reading,
    // the lineup camera could start a metre under a crest or the tide and flash the underwater view.
    this.rig.setPose(m.camera, this.conditions.tideM);
    this.pendingWalk = m.camera.mode === 'walk' && this.rig.mode !== 'walk' ? m.camera : null;
    this.probe.invalidate();
    this.reseedLineup = true;
    this.lensQuiet = true;
    this.lensWater.submerged();
    this.rebuildSpectrumIfNeeded(true);
    this.requestFieldIfNeeded(true);
    // The rebuild clears foam too, but a moment is a jump in sim time even when the sea is unchanged.
    this.ocean.resetFoam();
    this.invalidateParticles();
    // The sky is part of the moment: march all of it, and meter it afresh (no easing from the sky before).
    this.clouds.invalidate();
    this.cloudMeter.snapNext();
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
    // The lineup camera too: a steep face can outrun its float and bury it for a second or two as a set passes.
    const under = water === null ? this.underwater : nextUnderwater(this.underwater, this.camera.position.y, water);
    const quiet = this.lensQuiet;
    if (water !== null) this.lensQuiet = false;
    if (under === this.underwater) return;
    this.underwater = under;
    if (under) this.lensWater.submerged();
    else if (!quiet) this.lensWater.surfaced();
    this.oceanSurface.setUnderwater(under);
    this.sky.dome.visible = !under;
    this.waterVolume.mesh.visible = under;
    this.picture.setUnderwater(under);
    this.ribbonKey = null;
  }

  /**
   * Runs the foam field's ticks for this frame (none while paused; a replay after a jump). Each tick points the ocean's
   * time uniform and the waves buffer at its own time; both are restored for the frame's render and probe.
   */
  private stepFoam(events: readonly WaveEvent[]): void {
    const steps = this.foamField.advance(this.renderer, this.clock.simTime, (t) => this.pointFoamSourceAt(t));
    if (steps === 0) return;
    this.ocean.time.value = this.clock.simTime;
    this.setWaves.setEvents(events);
  }

  /** The foam field's source at sim time t: the ocean's time uniform and the set waves in flight then. */
  private pointFoamSourceAt(t: number): void {
    this.ocean.time.value = t;
    this.setWaves.setEvents(wavesNear(t, this.conditions, this.setParams));
  }

  /** Dev (plan Task 5, spec §3.4): times a forced replay to the GPU's completion. ms / steps is one step's cost. */
  async measureFoamReplay(): Promise<{ ms: number; steps: number }> {
    const device = (this.renderer.backend as unknown as { device: GPUDevice }).device;
    await device.queue.onSubmittedWorkDone();
    this.foamField.invalidate();
    const start = performance.now();
    const steps = this.foamField.advance(this.renderer, this.clock.simTime, (t) => this.pointFoamSourceAt(t));
    await device.queue.onSubmittedWorkDone();
    const ms = performance.now() - start;
    this.pointFoamSourceAt(this.clock.simTime);
    return { ms, steps };
  }

  /** The Bombie's waves now (4c-3 §3.2), or null while the reef field is missing (Review Focus 1). */
  private bombieWaves(t: number): BombieWaves | null {
    if (!this.bombieParams.enabled || !this.field) return null;
    if (this.bombieTauField !== this.field) { this.bombieTauS = sampleField(this.field, BOMBIE_X, BOMBIE_Z).tau; this.bombieTauField = this.field; } // Review Focus 3
    const T = this.conditions.swell.periodS;
    // The Womb's set waves around the bursting waves' peak arrivals (final review I1: the window was centred on t).
    const win = setWindow(t, this.bombieTauS!, T);
    const setIndices = setIndicesFrom(wavesBetween(win.t0, win.t1, this.conditions, this.setParams), T);
    return { tauS: this.bombieTauS!, periodS: T, hs: surferFeetToHs(this.conditions.swell.sizeFt), thresholdHs: surferFeetToHs(this.bombieParams.thresholdFt), seed: this.conditions.seed, setIndices };
  }

  /**
   * This frame's particle ticks: each tick's emitters (the lip tips mid-throw and the landing points at t_k, one shared
   * trace) give the spray's and the explosion's births.
   */
  private stepSpray(): void {
    this.tickEmitters.clear();
    const w = windToVector(this.conditions.wind.directionDeg), s = this.conditions.wind.speedMs;
    this.spray.setWind(w[0] * s, w[1] * s);
    this.impact.setWind(w[0] * s, w[1] * s);
    this.spray.advance(this.renderer, this.clock.simTime, (k) => this.sprayBirthsAt(k));
    this.impact.advance(this.renderer, this.clock.simTime, (k) => impactBirths(this.emittersAt(k).impact, k));
  }

  /** Tick k's emitters, computed once per frame (both systems ask for the same ticks). */
  private emittersAt(k: number): { spray: SprayEmitter[]; impact: ImpactEmitter[] } {
    let e = this.tickEmitters.get(k);
    if (!e) {
      const t = tickTime(k);
      e = breakEmitters({
        field: this.field, ctx: this.waveCtx, events: wavesNear(t, this.conditions, this.setParams), t, params: this.breakParams,
        minHeightM: this.ribbonMinHeightM, wind: { speedMs: this.conditions.wind.speedMs, fromDeg: this.conditions.wind.directionDeg },
        tideM: this.conditions.tideM, amount: this.sprayParams.amount, impactAmount: this.impactParams.amount,
      });
          const bb = burstAt(t, this.bombieWaves(t));
          e.impact.push(...bombieImpactEmitters(bb, bb ? burstWidthM(bb.heightM, surferFeetToHs(this.bombieParams.thresholdFt), this.bombieParams.size) : 0, this.conditions.tideM, this.bombieParams.size));
      this.tickEmitters.set(k, e);
    }
    return e;
  }

  private sprayBirthsAt(k: number) {
    // When the spray can't emit, don't compute the tick's emitters for it: on a calm day its replay would run the
    // shared trace for all its ticks just for the explosion's sake (final review).
    if (!sprayCanEmit(this.sprayParams.amount, this.conditions.wind.speedMs)) return [];
    return sprayBirths(this.emittersAt(k).spray, k, this.sprayParams);
  }

  /** Dev (3c plan Task 4): a forced impact replay, timed to the GPU's completion; cpuMs is the emitter work alone. */
  async measureImpactReplay(): Promise<{ ms: number; steps: number; cpuMs: number }> {
    const device = (this.renderer.backend as unknown as { device: GPUDevice }).device;
    await device.queue.onSubmittedWorkDone();
    this.tickEmitters.clear();
    let cpuMs = 0;
    this.impact.invalidate();
    const start = performance.now();
    const steps = this.impact.advance(this.renderer, this.clock.simTime, (k) => {
      const c0 = performance.now();
      const b = impactBirths(this.emittersAt(k).impact, k);
      cpuMs += performance.now() - c0;
      return b;
    });
    await device.queue.onSubmittedWorkDone();
    return { ms: performance.now() - start, steps, cpuMs };
  }

  /** Dev (plan Task 5): a forced spray replay, timed to the GPU's completion; cpuMs is the emitter work alone. */
  async measureSprayReplay(): Promise<{ ms: number; steps: number; cpuMs: number }> {
    const device = (this.renderer.backend as unknown as { device: GPUDevice }).device;
    await device.queue.onSubmittedWorkDone();
    this.tickEmitters.clear();
    let cpuMs = 0;
    this.spray.invalidate();
    const start = performance.now();
    const steps = this.spray.advance(this.renderer, this.clock.simTime, (k) => {
      const c0 = performance.now();
      const b = this.sprayBirthsAt(k);
      cpuMs += performance.now() - c0;
      return b;
    });
    await device.queue.onSubmittedWorkDone();
    return { ms: performance.now() - start, steps, cpuMs };
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
    this.surf.invalidate();
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

  /** A jump (or new conditions or field): the foam map and the spray replay their windows. */
  private invalidateParticles(): void {
    this.foamField.invalidate();
    this.spray.invalidate();
    this.impact.invalidate();
  }

  /** Slider edits change the foam the map would hold: replay once the drag stops (Review Focus 3), not on every event. */
  private scheduleParticleReplay(): void {
    clearTimeout(this.foamTimer);
    this.foamTimer = window.setTimeout(() => this.invalidateParticles(), SPECTRUM_REBUILD_DEBOUNCE_MS);
  }

  /** Foam slider edits replay only the foam map (final review I2). */
  private scheduleFoamOnlyReplay(): void {
    clearTimeout(this.foamOnlyTimer);
    this.foamOnlyTimer = window.setTimeout(() => this.foamField.invalidate(), SPECTRUM_REBUILD_DEBOUNCE_MS);
  }

  /** Spray slider edits replay only the spray (final review I2: they also replayed the foam map, +41 ms). */
  private scheduleSprayReplay(): void {
    clearTimeout(this.sprayTimer);
    this.sprayTimer = window.setTimeout(() => this.spray.invalidate(), SPECTRUM_REBUILD_DEBOUNCE_MS);
  }

  /** Impact slider edits replay only the explosion. */
  private scheduleImpactReplay(): void {
    clearTimeout(this.impactTimer);
    this.impactTimer = window.setTimeout(() => this.impact.invalidate(), SPECTRUM_REBUILD_DEBOUNCE_MS);
  }

  /** The land was (re)built: the seabed outside the reef map follows its waterline (spec §4.4). */
  private onLandBuilt(): void {
    const lh = this.land.height;
    if (!lh) return;
    this.seabed.setWaterline(lh.waterlineSamples(WATERLINE_STEP_M));
    // Where walking stands (Phase 4c-1 §3.1): the land, or seaward of its waterline the seabed (the reef and the beach
    // bed, one surface since 4b), or the top of a rock; the water is the still tide.
    const field = new RockField(lh, this.landParams.rockDensity);
    this.rockField = field;
    this.plantField = new PlantField(lh, field, this.landParams.bushDensity);
    this.rig.setGround({
      groundAt: (x, z) => {
        const seaward = SHORE_X + this.seabed.shiftAt(z) - x > 0;
        const base = seaward ? bedHeightAt(this.seabed.bathymetry, x, z, (zz) => this.seabed.shiftAt(zz)) : lh.heightAt(x, z);
        return Math.max(base, field.topAt(x, z));
      },
      waterLevel: () => this.conditions.tideM,
    });
    this.invalidateBeach();
    if (this.pendingWalk && this.rig.mode === 'free') this.rig.setPose(this.pendingWalk, this.conditions.tideM);
    this.pendingWalk = null;
  }

  /** The Land folder's params to the land and the rocks (from the panel, and from settings: final review I3). */
  private applyLandParams(): void {
    if (this.land.setParams(this.landParams)) this.scheduleLandRebuild();
    const rocksChanged = this.rockField?.setDensity(this.landParams.rockDensity) ?? false;
    this.plantField?.setDensity(this.landParams.bushDensity);
    // Only when the rocks changed do the plants re-place around them (Review Focus 2); other Land edits keep the cells
    // (regenerating them stalled 50–120 ms per slider event: final review I3).
    if (rocksChanged) this.plantField?.clear();
    this.invalidateBeach();
  }

  /** The land or the rock density changed: rebuild the patch's grids and relay the rocks. */
  private invalidateBeach(): void {
    this.patchTracker.centre = null;
    this.patchGrids = undefined;
    this.rocksAt = null;
    this.plantsAt = null;
  }

  /** The sound's frame (Phase 5): the spray ticks since the last frame, the Bombie's bursts, the camera and what's around it. */
  private updateSound(realDt: number, bursts: readonly Burst[]): void {
    const nowTick = Math.floor(this.clock.simTime * FOAM_TICKS_PER_S);
    const ks = this.clock.paused ? [] : ticksToHear(this.lastSoundTick, nowTick);
    this.lastSoundTick = nowTick;
    const cam = this.camera.position;
    this.sound.update({
      simTime: this.clock.simTime, paused: this.clock.paused,
      camera: { x: cam.x, y: cam.y, z: cam.z, mode: this.rig.mode }, underwater: this.underwater,
      windSpeedMs: this.conditions.wind.speedMs, tideM: this.conditions.tideM,
      ticks: ks.map((k) => ({ k, t: tickTime(k), impact: this.emittersAt(k).impact })),
      bursts, bombieSize: this.bombieParams.size,
      surf: this.surf.state, waterlineX: this.land.height?.waterlineAt(cam.z) ?? null, waterY: this.probe.heightAt(0),
      plants: this.plantsNear, rocks: this.rocksNear,
    }, { position: cam, forward: this.camera.getWorldDirection(this.soundDir), up: { x: 0, y: 1, z: 0 } }, realDt);
  }

  /**
   * The fine patch and the rocks follow the camera (Phase 4c-1 §3.2–3.4): the rocks are relaid every ROCK_RELAY_M; the
   * patch shows in walk mode or near the ground, refreshing its grids after an 8 m move and its shadows then or when the
   * sun has moved half a degree.
   */
  private updateBeach(): void {
    const lh = this.land.height;
    if (!this.rockField || !this.plantField || !lh) {
      this.patch.setVisible(false);
      this.rocks.setVisible(false);
      this.plants.setVisible(false);
      this.plantFloor.value = 0;
      return;
    }
    this.rocks.setVisible(true);
    this.plants.setVisible(true);
    const cam = this.camera.position;
    if (!this.rocksAt || Math.hypot(cam.x - this.rocksAt[0], cam.z - this.rocksAt[1]) > ROCK_RELAY_M) {
      this.rocksNear = this.rockField.near(cam.x, cam.z);
      this.rocks.update(this.rocksNear, cam.x, cam.z);
      this.rocksAt = [cam.x, cam.z];
    }
    const show = patchVisible(this.rig.mode, cam.y, this.rig.groundAt(cam.x, cam.z)) && !this.underwater;
    this.patch.setVisible(show);
    const moved = show && this.patchTracker.update(cam.x, cam.z);
    const c = show ? this.patchTracker.centre : null;
    if (moved && c) {
      this.patchGrids = buildPatchGrids(lh, c, this.patchGrids);
      this.patch.setGrids(this.patchGrids);
    }
    // The plants (Phase 4c-2): relaid every PLANT_RELAY_M, and whenever the patch recentres, shows or hides (each plant
    // sits on the surface drawn under it). With density 0 the painted heath stands near the camera again.
    this.plantFloor.value = this.landParams.bushDensity > 0 ? 1 : 0;
    const patchKey = c ? `${c[0]},${c[1]}` : 'off';
    if (!this.plantsAt || patchKey !== this.plantPatchKey || Math.hypot(cam.x - this.plantsAt[0], cam.z - this.plantsAt[1]) > PLANT_RELAY_M) {
      this.plantsNear = this.plantField.near(cam.x, cam.z);
      this.plantStats = this.plants.update(this.plantsNear, cam.x, cam.z, { cx: c ? c[0] : 0, cz: c ? c[1] : 0, on: !!c });
      this.plantsAt = [cam.x, cam.z];
      this.plantPatchKey = patchKey;
    }
    this.plants.tick(this.clock.simTime, this.conditions.wind.speedMs);
    if (c && (moved || this.sunDir.angleTo(this.shadowSun) > (0.5 * Math.PI) / 180)) {
      const inSquare = (x: number, z: number): boolean => Math.abs(x - c[0]) < 42 && Math.abs(z - c[1]) < 42;
      const casters = [...this.rocksNear.filter((r) => inSquare(r.x, r.z)), ...patchCasters(this.plantsNear, c, cam.x, cam.z)];
      this.patch.setShadows(buildGroundShadows(casters, c[0] - 32, c[1] - 32, [this.sunDir.x, this.sunDir.y, this.sunDir.z]));
      this.shadowSun.copy(this.sunDir);
    }
  }

  /** Beach-shape edits rebuild the mesh (about half a second), debounced like the reef. */
  private scheduleLandRebuild(): void {
    clearTimeout(this.landTimer);
    this.landTimer = window.setTimeout(() => { this.land.rebuild(); this.onLandBuilt(); }, SPECTRUM_REBUILD_DEBOUNCE_MS);
  }

  private rebuildSpectrumIfNeeded(force: boolean): void {
    const key = spectrumInputsKey(this.conditions, this.spectrumParams);
    if (!force && key === this.spectrumKey) return;
    this.spectrumKey = key;
    this.ocean.setConditions(this.conditions, this.spectrumParams);
    this.invalidateParticles();
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
    this.invalidateParticles();
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
      breaking: this.breakParams, foam: this.foamParams, spray: this.sprayParams, impact: this.impactParams, land: this.landParams, surf: this.surfParams, bombie: this.bombieParams, sound: this.soundParams,
    };
  }

  /**
   * Copy a look into the params objects in place (the panel binds them). Not the sound: its volumes and mute are a
   * listening preference, kept the same in both settings modes and across picks (final review I2).
   */
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
    assignParams(this.foamParams, look.foam);
    assignParams(this.sprayParams, look.spray);
    assignParams(this.impactParams, look.impact);
    assignParams(this.landParams, look.land);
    assignParams(this.surfParams, look.surf);
    assignParams(this.bombieParams, look.bombie);
  }

  /** Assign a look and push it into every subsystem. Callers then apply a moment, which rebuilds the spectrum and re-solves the field. */
  private restoreLook(look: DevLookParams): void {
    this.assignLook(look);
    this.applyAllParams();
  }

  /** Every subsystem update handler, once, from the current params objects. */
  private applyAllParams(): void {
    normalizeSetParams(this.setParams);
    normalizeSurfParams(this.surfParams);
    normalizeBombieParams(this.bombieParams);
    normalizeSoundParams(this.soundParams);
    this.sound.applyParams();
    this.surf.invalidate();
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
    normalizeFoamParams(this.foamParams);
    this.foamField.setParams(this.foamParams);
    normalizeSprayParams(this.sprayParams);
    this.spray.setParams(this.sprayParams);
    this.spray.setOverlays(this.overlays);
    normalizeImpactParams(this.impactParams);
    this.impact.setOverlays(this.overlays);
    this.land.setOverlays(this.overlays);
    normalizeLandParams(this.landParams);
    this.applyLandParams();
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
    assignParams(this.soundParams, stored.sound); // in either mode (a preference, not the look)
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
    else {
      this.profile.profile.reference = this.currentReference;
      this.profile.profile.sound = { ...this.soundParams }; // the sound is saved in either mode
    }
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
    assignParams(this.soundParams, this.lookDefaults.sound);
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
   * occluded window pauses requestAnimationFrame), and return it as a PNG, read back from an offscreen target.
   */
  async captureFrame(): Promise<Blob | null> {
    // Rendered into an offscreen target and read back: a hidden or covered window never presents the canvas, so a
    // canvas toBlob there returns the last frame it did present (captures were silently stale).
    const { width, height } = this.renderer.domElement;
    const target = new THREE.RenderTarget(width, height, { type: THREE.UnsignedByteType, depthBuffer: false });
    const maxFps = this.frameLimiter.maxFps;
    this.frameLimiter.maxFps = 0;
    this.captureTarget = target;
    // Start a new node frame, as the renderer's animation loop does before each frame (Animation.update): passes that
    // render once per frame (the scene pass) otherwise re-use the last frame's render, so a capture showed the frame
    // before it (one capture late), or the same frame over and over while the window was hidden.
    const r = this.renderer as unknown as { _nodes: { nodeFrame: { update(): void; frameId: number } }; info: { frame: number } };
    r._nodes.nodeFrame.update();
    r.info.frame = r._nodes.nodeFrame.frameId;
    try {
      this.frame();
    } finally {
      this.captureTarget = null;
      this.frameLimiter.maxFps = maxFps;
    }
    const padded = (await this.renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)) as Uint8Array;
    target.dispose();
    // The readback's rows are padded to 256 bytes.
    const rowBytes = Math.ceil((width * 4) / 256) * 256;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) pixels.set(padded.subarray(y * rowBytes, y * rowBytes + width * 4), y * width * 4);
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
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
      toggleMute: () => {
        this.sound.toggleMute();
        this.panel.refresh();
        this.scheduleSave();
        this.perf.flash(this.soundParams.muted ? 'Sound muted (M)' : 'Sound on');
      },
    });
    if (this.reseedLineup) {
      const water = this.probe.heightAt(0);
      if (water !== null) {
        if (this.rig.mode === 'lineup') this.rig.setPose(this.rig.getPose(), water);
        this.reseedLineup = false;
      }
    }
    this.rig.update(realDt, this.input, this.waterHeightAtCamera());

    const sun = sunForConditions(this.conditions);
    this.sunDir.set(...sun.direction);
    this.clouds.setWeather(this.conditions.weather, this.conditions.seed);
    // Brings the sky's tables up to date first, then marches the clouds through them.
    this.clouds.update(this.renderer, this.sunDir, this.camera.position, this.clock.simTime);
    this.cloudMeter.update(this.renderer, realDt, this.sunDir.y, this.clouds.hasClouds);
    this.picture.setCloud(this.cloudMeter.stops, this.cloudMeter.sunVisible, this.cloudMeter.gains);
    this.land.update(this.renderer, sun.direction, this.camera.position);
    this.updateBeach();
    this.sky.followCamera(this.camera.position);

    this.ocean.update(this.renderer, this.clock.simTime, simDt);
    const events = wavesNear(this.clock.simTime, this.conditions, this.setParams);
        this.surf.update(this.clock.simTime, this.conditions, (t0, t1) => wavesBetween(t0, t1, this.conditions, this.setParams), this.field, this.surfParams);
    this.setWaves.setEvents(events);
    this.stepFoam(events);
    this.stepSpray();
    this.updateUnderwater();
    // The Bombie (4c-3): its latest two bursts (final review I4), hidden underwater.
    const bursts = burstsAt(this.clock.simTime, this.bombieWaves(this.clock.simTime));
    this.bombieBurst = bursts[0] ?? null;
    const thresholdHs = surferFeetToHs(this.bombieParams.thresholdFt);
    this.bombie.show(this.underwater ? [] : bursts.map((b) => ({ ageS: b.ageS, widthM: burstWidthM(b.heightM, thresholdHs, this.bombieParams.size), heightM: b.heightM })));
    this.updateSound(realDt, bursts);
    this.updateRibbon(events);
    // The ribbon is single-sided and the sheet is cut away under it only above water: hidden underwater.
    if (this.underwater) this.ribbon.mesh.visible = false;
    this.spray.mesh.visible = !this.underwater;
    this.impact.mesh.visible = !this.underwater;
    this.land.mesh.visible = this.land.height !== null && !this.underwater;
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
    this.lensWater.step(realDt);
    this.lensClockS += realDt;
    this.picture.setLensWater(this.lensWater.state(), this.lensClockS);
    this.ribbon.setDisplayExposure(this.picture.exposureValue);
    this.spray.setDisplayExposure(this.picture.exposureValue);
    this.impact.setDisplayExposure(this.picture.exposureValue);
    this.picture.render(this.captureTarget);
    if (this.screenshotRequested) {
      this.screenshotRequested = false;
      captureScreenshot(this.renderer.domElement, screenshotFilename(this.conditions));
    }
    // GPU timestamp readback only matters while the stats are on screen.
    if (this.devUiVisible) this.perf.update();
  };
}
