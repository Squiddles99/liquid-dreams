import { buttonDown } from '../input/padButton';
import type { GangStaging } from '../frontend/staging';
import * as THREE from 'three/webgpu';
import { sunForConditions } from '../astro/sunForConditions';
import { BreakingRibbon, FOOTPRINT_GRID, modelRibbonSurface } from '../breaker/BreakingRibbon';
import { withSections } from '../ride/sectionWater';
import { TAKEOFF_ANCHOR, takeoffSpot } from '../ride/takeoff';
import { type BreakParams, DEFAULT_BREAK_PARAMS, normalizeBreakParams } from '../breaker/breaking';
import { type StationEntry, minRibbonHeight, traceStations } from '../breaker/crestTrace';
import { formatPeakFace, formatPeakPsi, peakFace, peakPsi } from '../breaker/peakFace';
import { offshoreSpeed } from '../breaker/overturn';
import { REFRACT_FLOOR_M, type ReefField, sampleField } from '../breaker/reefField';
import { BOMBIE_X, BOMBIE_Z, type BombieWaves, type Burst, burstAt, burstWidthM, burstsAt, setIndicesFrom, setWindow } from '../bombie/bombieModel';
import { BombieMesh } from '../bombie/BombieMesh';
import { surferFeetToHs } from '../conditions/units';
import { DEFAULT_BOMBIE_PARAMS, type BombieParams, normalizeBombieParams } from '../bombie/bombieParams';
import { landSpots, placeAhead } from '../surfer/placement';
import { DEFAULT_SURFER_PARAMS, type SurferParams, normalizeSurferParams } from '../surfer/surferParams';
import { SurferStand } from '../surfer/SurferStand';
import { BeachPile } from '../surfer/BeachPile';
import { GangLineup } from '../surfer/GangLineup';
import { gangCamera, gangCameraDistance } from '../surfer/gang';
import { type Clearing, clearOf } from '../heath/clearings';
import { DEFAULT_SOUND_PARAMS, type SoundParams, normalizeSoundParams } from '../sound/soundParams';
import { SoundSystem } from '../sound/SoundSystem';
import { ticksToHear } from '../sound/hits';
import { ReefFieldClient } from '../breaker/ReefFieldClient';
import { SetWaves } from '../breaker/SetWaves';
import { ReefFlow } from '../breaker/flowNodes';
import { type WaveContext, breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { currentBindings, keyLabel } from '../ride/bindings';
import { RideSession, rideMessage } from '../ride/RideSession';
import { type WaterFn, flatWater, waterAt } from '../ride/water';
import { SurfaceOffset } from '../ride/surfaceOffset';
import { fieldKey } from '../breaker/fieldKey';
import { tubeCover } from '../ride/tubeCover';
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
import { HOTKEYS, captureScreenshot, handleHotkeys, screenshotFilename } from '../dev/hotkeys';
import { PADDLE_OUT_MS } from '../frontend/entry';
import type { SessionChoice } from '../frontend/frontEnd';
import type { FrontEndHost } from '../frontend/frontEndCore';
import { FrontEnd } from '../frontend/frontEndPage';
import { FRONT_SETTINGS_KEY, sanitizeFrontSettings } from '../frontend/frontSettings';
import { type MenuPick, PadStartWatch } from '../frontend/sessionMenu';
import { PauseMenu } from '../frontend/ui/pauseMenu';
import { frontEndCheck } from '../dev/frontEndCheck';
import { type CameraPose, type Moment, encodeMoment, momentFromHash, momentHashProblem } from '../dev/momentLink';
import { PerfOverlay } from '../dev/perf';
import { DEFAULT_MOMENT_NAME, defaultMoment, findReferenceMoment, referenceKind } from '../dev/referenceMoments';
import { HeightProbe } from '../ocean/HeightProbe';
import { DEFAULT_OCEAN_SIM, type OceanSimParams, OceanSimulation } from '../ocean/OceanSimulation';
import { DEFAULT_DEBUG_OVERLAYS, type DebugOverlays, OceanSurface } from '../ocean/OceanSurface';
import { DEFAULT_SPECTRUM_PARAMS, type OceanSpectrumParams, spectrumInputsKey } from '../ocean/spectrum';
import { DEFAULT_WATER_OPTICS, type WaterOpticsParams } from '../ocean/waterOptics';
import { nextUnderwater } from '../ocean/underwaterOptics';
import { LensWater, rainLensStep, tubeLensStep } from '../render/lensWater';
import { WaterVolume } from '../ocean/WaterVolume';
import { createWaterOpticsUniforms, updateWaterOpticsUniforms } from '../ocean/waterShading';
import { DEFAULT_SHALLOW_SWELL, type ShallowSwellParams, WaterSurfaceModel } from '../ocean/waterSurface';
import { DEFAULT_PICTURE, type PictureParams, PicturePipeline } from '../render/PicturePipeline';
import { LookoutBackdrop } from '../frontend/backdrop/LookoutBackdrop';
import { backdropFade } from '../frontend/backdrop/backdropMath';
import { withOnlyShown } from '../render/prewarm';
import { bedHeightAt, buildBathymetry, downsample } from '../seabed/bathymetry';
import { SHORE_X } from '../seabed/coastProfile';
import { Seabed, WATERLINE_STEP_M } from '../seabed/Seabed';
import { DEFAULT_REEF_PARAMS, type ReefParams } from '../seabed/wombReef';
import { type AtmosphereParams, DEFAULT_ATMOSPHERE, type Rgb } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { Clouds } from '../weather/Clouds';
import { CloudMeter } from '../weather/cloudMeter';
import { RAIN_FALL_MS, RainStreaks } from '../weather/RainStreaks';
import { LightningView } from '../weather/LightningView';
import type { Strike } from '../weather/rainModel';
import { lowLayer } from '../weather/cloudModel';
import { travelDirectionXZ } from '../conditions/directions';
import { combineSunlight } from '../weather/CloudShadow';
import { DEFAULT_SET_PARAMS, type SetParams, type WaveEvent, callSetTime, nextSetArrivalS, normalizeSetParams, selectScreenSetParams, wavesBetween, wavesNear } from '../swell/sets';
import { CoastalSurf } from '../surf/CoastalSurf';
import { DEFAULT_SURF_PARAMS, type SurfParams, normalizeSurfParams } from '../surf/surfModel';
import { formatNextSet, waveStatus } from '../swell/setStatus';
import { FoamField } from '../whitewater/FoamField';
import { KelpField } from '../seabed/KelpField';
import { SprayParticles } from '../whitewater/SprayParticles';
import {
  DEFAULT_IMPACT_PARAMS, DEFAULT_SPRAY_PARAMS, bombieImpactEmitters, IMPACT_MAX_LIFE_S, type ImpactEmitter, type ImpactParams, type SprayEmitter, type SprayParams, breakEmitters,
  impactBirths, normalizeImpactParams, type SpitEmitter, spitBirths, SPRAY_BIRTH_CAP, normalizeSprayParams, sprayBirths, sprayCanEmit, windToVector,
} from '../whitewater/sprayEmitters';
import { IMPACT_KIND } from '../whitewater/particleKinds';
import { Land } from '../land/Land';
import { GroundPatch } from '../beach/GroundPatchMesh';
import { buildTracksMask, loadGroundLayers } from '../beach/groundDetail';
import { type GroundLayersCpu, loadGroundLayersCpu, patchSurfaceAt } from '../beach/groundHeights';
import { Footprints, printsNear } from '../beach/Footprints';
import { PATCH_SIZE_M, PatchTracker, buildPatchGrids, patchVisible } from '../beach/groundPatch';
import { Rocks } from '../beach/RockMeshes';
import { LOD_RANGES_M, PLANT_CELL_M, PLANT_GONE_M, PlantField, patchCasters, type Plant, plantLod, plantSeatY } from '../heath/plants';
import { BAND_FADE_M, type CellChange, CellQueue, MID_M, PlantRing, cellKey, layBudgetMs } from '../heath/plantRing';
import { PlantMeshes } from '../heath/PlantMeshes';
import { KitMeshes, hullColours } from '../heath/KitMeshes';
import { ScatterMeshes } from '../heath/ScatterMeshes';
import { ScatterField, type ScatterContext } from '../heath/nearScatter';
import { canopySilhouettes, loadKit } from '../heath/kit';
import { float, uniform } from 'three/tsl';
import { type Rock, RockField } from '../beach/rocks';
import { buildGroundShadows } from '../beach/rockShadows';
import { DEFAULT_LAND_PARAMS, type LandParams, normalizeLandParams } from '../land/landParams';
import { DEFAULT_FOAM_PARAMS, type FoamParams, normalizeFoamParams, tickTime, FOAM_TICKS_PER_S } from '../whitewater/foamStep';
import { FrameLimiter, SimClock, clampFrameDt, viewportSize } from './clock';
import { bootReady } from './loadingProgress';
import type { LoadingScreen } from './loadingScreen';
import { showOverlay } from './overlay';

const SPECTRUM_REBUILD_DEBOUNCE_MS = 150;
const REEF_REBUILD_DEBOUNCE_MS = 300;
const SETTINGS_SAVE_DEBOUNCE_MS = 500;
/** The rocks are relaid (from the cached cells) once the camera has moved this far (Phase 4c-1). */
const ROCK_RELAY_M = 2;
/** The near plants' list (sound, shadows, the kit) is redone once the camera has moved this far (Phase 4c-2 §3.7). */
const PLANT_RELAY_M = 3;
/** The near plants' list reaches this far (the kit's mid band and its fade: dune-up-close §3.1). */
const NEAR_LIST_M = 45;
/** The plant rings re-diff once the camera has moved this far. */
const RING_MOVE_M = 2;
/** The crest trace's timing readout is an exponential moving average with this weight on each new frame. */
const TRACE_MS_ALPHA = 0.1;

/** localStorage, reached lazily: the getter itself can throw (blocked site data), and the devSettings functions catch that. */
const browserStorage: SettingsStorage = {
  getItem: (k) => window.localStorage.getItem(k),
  setItem: (k, v) => window.localStorage.setItem(k, v),
  removeItem: (k) => window.localStorage.removeItem(k),
};

/** The height probe's slot under the board while riding (the stand's own slots are idle then). */
const RIDE_PROBE = 1;
/** Seconds of warning before the wave reaches the peak. */
export const RIDE_LEAD_S = 10;

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
  /** The reshaped reef (spec 2026-10-05-womb-profile-design §3.1, round 2): it goes live with the Womb profile's ribbon. */
  readonly reefParams: ReefParams = { ...DEFAULT_REEF_PARAMS };
  readonly setParams: SetParams = { ...DEFAULT_SET_PARAMS };
  /** The select screen's sets (a set every 120 s), filled from setParams while `duneSets` is on. */
  private readonly selectScreenSets: SetParams = { ...DEFAULT_SET_PARAMS };
  /** On from the select screen opening until Paddle out's cover is in: the sea runs the select screen's sets. */
  private duneSets = false;
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
  /** The surfer on the stand (surfer spec §6): its folder and the board, body and pose on the water. */
  readonly surferParams: SurferParams = { ...DEFAULT_SURFER_PARAMS };
  readonly surferStand: SurferStand;
  /** The playable ride (first-ride spec): G starts and stops it. */
  readonly ride = new RideSession(document.body);
  /** The called set's arrivals at the peak (sim s), and the wave being ridden. */
  private rideSet: number[] = [];
  /** Each ride wave's deep-water height (m), for its take-off spot. */
  private rideHeights: number[] = [];
  /** The drawn sea's height over the ride's CPU water, read by the height probe under the board. */
  private readonly rideOffset = new SurfaceOffset();
  /** The breaking ribbon's crest stations last traced, how far the rider is under a curl (tubeCover), and the spray on the
   * lens from it (Andrew 2026-10-04: over her shoulder in the tube, and the surfacing drops on the lens). */
  private ribbonStations: readonly StationEntry[] = [];
  private rideCover = 0;
  private tubeLensWet = 0;
  private rideWave = 0;
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
  readonly setStatus = { nextSet: '', wave: '', face: '', psi: '' };
  /** The wind's offshore speed against the field's swell (m/s; updateOffshore): the lip's wind factors. */
  private offshoreMs = 0;
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
  /** Falling rain around the camera (weather W2). */
  readonly rainStreaks = new RainStreaks(this.sky);
  /** Lightning: the flash in the clouds, the bolt (weather W2). */
  readonly lightning = new LightningView(this.sky);
  /** Strikes fired since the sound last took them (their thunder, weather W2). */
  private strikesPending: Strike[] = [];
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
  /** The beach pile (walking spec §5): loaded the first time the panel shows it. */
  private beachPile: BeachPile | null = null;
  /** The gang mockup (walking spec §6). */
  readonly gang: GangLineup;
  /** Heath trampled clear where riders stand on land and where the pile lies, and its key for relaying the plants. */
  private clearings: Clearing[] = [];
  private clearingKey = '';
  private pileLoading = false;
  /** The ground a rider stands on (walking spec §4): the land, or the top of a rock on it; null until the land loads. */
  /** The front end (the dune select screen), once opened. */
  private frontEnd: FrontEnd | null = null;
  private loadingScreen: LoadingScreen | null = null;
  /** Start-up (loading screens §1.2): the land built, the kit (or its failure), the ground layers (or theirs). */
  private readonly heathParts = { land: false, kit: false, layers: false };
  private frontEndAtBoot = false;
  private bootReported = false;
  /** Paddle out: put the camera behind the rider once the stand has placed them in the water. */
  private chaseAfterPaddle = false;
  /** The menu while surfing (Esc or a pad's START): keep surfing, or back to the dune. */
  private pauseMenu: PauseMenu | null = null;
  private pausedBeforeMenu = false;
  private readonly padStart = new PadStartWatch();
  private readonly groundAt = (x: number, z: number): number | null => {
    const lh = this.land.height;
    return lh ? Math.max(lh.heightAt(x, z), this.rockField?.topAt(x, z) ?? -Infinity) : null;
  };
  private readonly patchTracker = new PatchTracker();
  private patchGrids: ReturnType<typeof buildPatchGrids> | undefined;
  /** The rocks near the camera, relaid when it has moved ROCK_RELAY_M (or the field changed). */
  private rocksNear: Rock[] = [];
  private rocksAt: [number, number] | null = null;
  private readonly shadowSun = new THREE.Vector3(0, -1, 0);
  /** The heath's plants (Phase 4c-2): from the land once it loads, refreshed every PLANT_RELAY_M. */
  readonly plants: PlantMeshes;
  private tracksMask: Float32Array<ArrayBuffer> | undefined;
  /** The footprints along the tracks (dune-up-close §4.3), laid every 2 m while the patch shows. */
  readonly footprints: Footprints;
  private groundLayersCpu: GroundLayersCpu | null = null;
  private printsAt: [number, number] | null = null;
  private tracksMaskAt: [number, number] | null = null;
  /** Dev readout: the last tracks mask's CPU time (ms; dune-up-close §5: ≤ 0.5). */
  tracksMaskMs = 0;
  /** The near scatter (dune-up-close §4.4): tufts and the heath's fallen debris, once the kit has loaded. */
  scatter: ScatterMeshes | null = null;
  /** Each kit variant's canopy from above (alpha), for the plants' dappled shadows (dune-up-close §4.5). */
  private canopies: ReadonlyMap<string, Uint8Array> | undefined;
  /** The near scatter's cells, laid nearest first a millisecond a frame (spec §5). */
  private readonly scatterField = new ScatterField(1);
  private scatterAt: [number, number] | null = null;
  private scatterPending = 0;
  /** The near plants in 2 m cells (the scatter asks which crown is over a point). */
  private plantGrid = new Map<number, Plant[]>();
  /** The kit's real plants near the camera (dune-up-close §3.1): once the kit has loaded, the near and mid bands. */
  kitMeshes: KitMeshes | null = null;
  private plantField: PlantField | null = null;
  private plantsNear: Plant[] = [];
  private plantsAt: [number, number] | null = null;
  /**
   * The far plants, laid cell by cell (dune-up-close §4.5): the cells within 200 m (inside `hullInnerM`, the kit's
   * bands, once the kit draws them), and rings at the hulls' level-of-detail distances, whose crossings re-lay a cell.
   */
  private hullInnerM = 0;
  private hullRing = new PlantRing(PLANT_GONE_M, 0);
  private readonly lodRings = LOD_RANGES_M.map((r) => new PlantRing(r));
  private readonly plantQueue = new CellQueue();
  /** Where the rings were last moved: they re-diff after RING_MOVE_M (diffing ~8,000 cells every frame cost ~1 ms). */
  private ringsAt: [number, number] | null = null;
  /** The far plants must be laid afresh (the land, the density, the rocks or the clearings changed). */
  private hullsStale = true;
  /** Dev readout: the slowest frame's cell laying (ms) since the last reset. */
  plantLayWorstMs = 0;
  /** The plant layout's patch state at the last refresh (a patch recentre or show/hide re-seats the plants). */
  private plantPatchKey = '';
  /** 1 while the plants stand near the camera: the painted heath fades to its floor there. */
  private readonly plantFloor = uniform(0);
  /** Dev readout (window.liquidDreams.plantStats): plants drawn and dropped (a full mesh) at the last refresh. */
  plantStats = { drawn: 0, dropped: 0 };
  /** A walk pose applied before the land loaded (it became a free pose): walked into once the ground exists. */
  private pendingWalk: CameraPose | null = null;
  private builtReefKey = JSON.stringify(this.reefParams);
  readonly setWaves = new SetWaves(this.ocean.time, { pile: false, shape: 'lean' });
  readonly surfaceModel = new WaterSurfaceModel(this.ocean, this.seabed, this.setWaves);
  readonly probe = new HeightProbe(this.surfaceModel);
  /** Breaking foam that lingers and drifts (spec 2026-09-27-foam-field-design.md), stepped at 20 Hz of sim time. */
  readonly foamField = new FoamField({
    foamNode: (xz) => this.setWaves.breakingFoamNode(xz),
    dirNode: (xz) => this.setWaves.sample(xz, true).dir,
  });
  /** The water's flow under the waves (reef build B §4.1): the set waves' surface plus the FFT long swell where it runs. */
  readonly reefFlow = new ReefFlow(this.setWaves, (xz) => this.surfaceModel.fftCascadeDisplacement(xz, 0, float(1.0)).y);
  /** The kelp's lean grid around the camera (reef build B §4.2–4.3), stepped with the foam's ticks. */
  readonly kelp = new KelpField(this.seabed.kelp, this.reefFlow);
  private foamTimer: number | undefined;
  private sprayTimer: number | undefined;
  private foamOnlyTimer: number | undefined;
  /** Offshore spray off the throwing lips (spec 2026-09-27-offshore-spray-design.md). */
  readonly spray = new SprayParticles(this.sky, undefined, this.sunlight);
  /** The impact explosion where each lip lands (spec 2026-09-28-impact-explosion-design.md), on the same particle system. */
  readonly impact = new SprayParticles(this.sky, IMPACT_KIND, this.sunlight);
  private impactTimer: number | undefined;
  /** This frame's emitters per tick, shared by the spray and the explosion (their replays cover different tick counts). */
  private readonly tickEmitters = new Map<number, { spray: SprayEmitter[]; impact: ImpactEmitter[]; spit: SpitEmitter[] }>();
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
  /** The rain's wetness on the lens (weather W2: rainLensStep). */
  private rainLensWet = 0;
  private readonly rainFall = new THREE.Vector3();
  /** The breaking part of each set wave as its own mesh (breaking-ribbon spec); the sheet steps aside under its footprint. */
  readonly ribbon = new BreakingRibbon(modelRibbonSurface(this.surfaceModel), { model: this.surfaceModel, sky: this.sky, optics: this.waterOptics, foamMap: this.foamField, sunlight: this.sunlight, skyline: this.land.skyline });
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
  /** The select screens' painted ground over the live sea (lookout backdrop spec). */
  readonly lookout: LookoutBackdrop;
  private readonly lookoutFwd = new THREE.Vector3();
  private readonly perf: PerfOverlay;
  private readonly panel: DevPanel;
  private readonly sunDir = new THREE.Vector3();
  private readonly viewDir = new THREE.Vector3();
  private lastMs = performance.now();
  private spectrumKey = '';
  private spectrumTimer: number | undefined;
  private reefTimer: number | undefined;
  /** The peel slider re-bakes the field once you stop dragging (as the reef sliders do). */
  private peelTimer: number | undefined;
  private saveTimer: number | undefined;
  private statusAge = 0;
  private screenshotRequested = false;
  /** Set only inside captureFrame: this frame renders there instead of to the canvas. */
  private captureTarget: THREE.RenderTarget | null = null;
  /** The dev tools (panel, perf graphs): hidden for players, H shows them (Andrew, 2026-10-04). */
  private devUiVisible = false;
  /** While a dev measurement reads window.__ldGpuMs: the perf overlay samples even with the dev tools hidden. */
  private gpuSampling = false;

  /** `hashMoment` is the moment a #m= / #ref= link opened, or null to open the saved (or default) moment. */
  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly container: HTMLElement,
    hashMoment: Moment | null,
  ) {
    this.input = new Input(renderer.domElement);
    this.scene.add(this.sky.dome);
    this.scene.add(this.rainStreaks.mesh);
    this.scene.add(this.lightning.bolt);
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
    this.rocks = new Rocks(this.sky, (xz) => this.sunlight.visibilityNode(xz), { seabed: this.seabed, optics: this.waterOptics }, this.patch.layers);
    this.plants = new PlantMeshes(this.sky, (xz) => this.sunlight.visibilityNode(xz));
    for (const m of this.plants.meshes) this.scene.add(m);
    // The ground layers (dune-up-close §4.3): until they load the patch draws as it did. The footprints draw with them.
    loadGroundLayers(this.patch.layers).then(
      () => { this.heathParts.layers = true; },
      (e) => {
        this.heathParts.layers = true;
        console.warn('The ground layers failed to load; the patch keeps its plain look.', e);
      },
    );
    fetch(import.meta.env.BASE_URL + 'heath/groundLayers.height.bin').then((r) => r.arrayBuffer()).then((b) => { this.groundLayersCpu = loadGroundLayersCpu(b); this.printsAt = null; }, () => undefined);
    this.footprints = new Footprints(this.patch.layers);
    this.scene.add(this.footprints.mesh);
    // The kit loads alongside the land; until it arrives the hulls draw every band.
    loadKit().then(
      (kit) => {
        this.kitMeshes = new KitMeshes(kit, this.sky, (xz) => this.sunlight.visibilityNode(xz));
        for (const m of this.kitMeshes.meshes) this.scene.add(m);
        this.scatter = new ScatterMeshes(kit, this.sky, (xz) => this.sunlight.visibilityNode(xz));
        canopySilhouettes(kit).then((s) => { this.canopies = s; this.shadowSun.set(0, -1, 0); }, () => undefined);
        for (const m of this.scatter.meshes) this.scene.add(m);
        this.plants.kitFade.value = 1;
        this.plants.setKindColours(hullColours());
        void this.prewarmKit().finally(() => { this.heathParts.kit = true; });
        this.hullInnerM = MID_M - BAND_FADE_M;
        this.hullsStale = true;
      },
      (e) => {
        this.heathParts.kit = true;
        console.warn('The heath kit failed to load; the hulls stand in for it.', e);
      },
    );
    this.land.setPlantFloor(this.plantFloor);
    this.scene.add(this.patch.mesh);
    for (const m of this.rocks.meshes) this.scene.add(m);
    this.surferStand = new SurferStand(this.sky, (xz) => this.sunlight.visibilityNode(xz));
    this.scene.add(this.surferStand.group);
    this.gang = new GangLineup(this.sky, (xz) => this.sunlight.visibilityNode(xz));
    this.scene.add(this.gang.group);
    void this.land.load().then(() => {
      try {
        this.onLandBuilt();
      } finally {
        this.heathParts.land = true;
      }
    }, (e: unknown) => {
      this.heathParts.land = true;
      console.warn(`The land didn't load (${e instanceof Error ? e.message : String(e)}); running without it.`);
    });
    this.lookout = new LookoutBackdrop(import.meta.env.BASE_URL, Math.max(window.innerWidth, window.innerHeight) * devicePixelRatio > 2200);
    this.picture = new PicturePipeline(renderer, this.scene, this.camera, this.pictureParams, this.lookout.overlay(this.sky));
    this.perf = new PerfOverlay(renderer);
    this.panel = new DevPanel(
      {
        conditions: this.conditions, spectrum: this.spectrumParams, sim: this.simParams, water: this.waterParams, atmosphere: this.atmosphereParams,
        picture: this.pictureParams, lookout: this.lookout.light, frameLimiter: this.frameLimiter, sets: this.setParams, reef: this.reefParams, shallow: this.shallowParams,
        overlays: this.overlays, breaking: this.breakParams, foam: this.foamParams, spray: this.sprayParams, impact: this.impactParams, land: this.landParams, surf: this.surfParams, bombie: this.bombieParams, sound: this.soundParams, soundStatus: this.sound.status, surfer: this.surferParams, surferStatus: this.surferStand.status, setStatus: this.setStatus, settingsMode: this.settingsMode,
      },
      {
        onConditions: () => this.applyConditionsEdit(),
        onUserConditionEdit: () => this.profile.own(),
        onSpectrum: () => this.scheduleSpectrumRebuild(),
        onSim: () => this.ocean.setParams(this.simParams),
        onWater: () => updateWaterOpticsUniforms(this.waterOptics, this.waterParams),
        onAtmosphere: () => this.sky.setParams(this.atmosphereParams),
        onPicture: () => this.picture.setParams(this.pictureParams),
        onLookout: () => {}, // read every frame by LookoutBackdrop.update
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
          clearTimeout(this.peelTimer);
          this.peelTimer = window.setTimeout(() => this.requestFieldIfNeeded(false), REEF_REBUILD_DEBOUNCE_MS);
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
        onSurfer: () => {
          normalizeSurferParams(this.surferParams);
          this.panel.refresh();
        },
        onSurferPlaceAhead: () => {
          Object.assign(this.surferParams, placeAhead(this.rig.getPose()));
          this.panel.refresh();
          this.scheduleSave();
        },
        onFrontEnd: () => this.openFrontEnd(),
        onFrontEndCheck: () => {
          void frontEndCheck(this).then((r) => {
            console.table(r.contrast);
            console.table(r.faces);
            console.log(`front-end check: ${r.pass ? 'PASS' : 'FAIL'}`);
          });
        },
        onSurferSpot: (spot) => {
          const lh = this.land.height;
          if (!lh) {
            console.warn('The land has not loaded yet: no spots on it to stand at.');
            return;
          }
          const at = landSpots(lh, lh.profile)[spot];
          Object.assign(this.surferParams, { enabled: true, onLand: true, outfit: 'walking', pose: 'carry', x: at.x, z: at.z, headingDeg: at.headingDeg, heightNudgeM: 0 });
          normalizeSurferParams(this.surferParams);
          this.panel.refresh();
          this.scheduleSave();
        },
        onSurferPile: (where) => {
          const lh = this.land.height;
          let at: { x: number; z: number; headingDeg: number } = placeAhead(this.rig.getPose());
          if (where === 'beach') {
            if (!lh) {
              console.warn('The land has not loaded yet: no beach spot to put the pile beside.');
              return;
            }
            const b = landSpots(lh, lh.profile).beach;
            at = { x: b.x, z: b.z + 2, headingDeg: 0 };
          }
          Object.assign(this.surferParams, { pile: true, pileX: at.x, pileZ: at.z, pileHeadingDeg: at.headingDeg });
          normalizeSurferParams(this.surferParams);
          this.panel.refresh();
          this.scheduleSave();
        },
        onGangCamera: () => {
          const sp = this.surferParams, g = this.groundAt(sp.x, sp.z) ?? this.conditions.tideM;
          // On the track: never further than the clearing or a corridor reaches (dune-up-close §4.1).
          const tracks = this.land.height?.trackNetwork, dist = tracks ? gangCameraDistance(tracks, sp) : 5.5;
          const ahead = gangCamera(sp, g, dist);
          this.rig.setPose(gangCamera(sp, g, dist, this.groundAt(ahead.position[0], ahead.position[2]) ?? -Infinity), this.conditions.tideM);
        },
        onGoSurfing: () => this.toggleRide(),
        onSurferChase: () => {
          const pose = this.surferStand.chasePose(this.surferParams.headingDeg);
          if (pose) this.rig.setPose(pose);
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
    this.panel.setVisible(this.devUiVisible);
    this.perf.setVisible(this.devUiVisible);
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

  /**
   * Builds, while the game loads, what would otherwise build on the frame it first shows. The first break: the breaking
   * ribbon (its compute passes, footprint and material), the Bombie's white water, and the particles' birth passes
   * (measured in the Electron probe on the RTX 4060, Andrew's 11 ft profile, it froze for 0.5–2.8 s building them). The
   * land's arrival: the land, the rocks, the plants, the fine ground patch and the sunlight march (about 70 materials,
   * 25–50 ms each: it froze for 2–3.4 s a few seconds in).
   *
   * The meshes are built by rendering the picture once, into a throwaway target, with only them shown (withOnlyShown),
   * not by renderer.compileAsync: the scene pass renders nested inside the picture's pipeline, a different render context
   * (part of every material's cache key), so what compileAsync built was built again when the ribbon first showed. The
   * rocks, plants and patch already hold their final attributes (none laid yet: count 0 builds and draws nothing); the
   * land draws its stand-in (Land.standIn), since its own geometry is empty until the land loads.
   */
  async prewarm(): Promise<void> {
    const target = new THREE.RenderTarget(1, 1);
    const landStandIn = this.land.standIn();
    this.scene.add(landStandIn);
    try {
      const shown = [this.ribbon.mesh, this.bombie.mesh, landStandIn, this.patch.mesh, ...this.rocks.meshes, ...this.plants.meshes, this.footprints.mesh];
      await withOnlyShown(this.scene, shown, async () => this.picture.render(target));
    } finally {
      this.scene.remove(landStandIn);
      target.dispose();
    }
    await this.ribbon.compileAsync(this.renderer);
    await this.spray.compileAsync(this.renderer);
    await this.impact.compileAsync(this.renderer);
    await this.land.sunlight.compileAsync(this.renderer);
  }

  /**
   * Builds the kit's and the scatter's materials off screen the moment the kit loads (as prewarm does the rest at
   * start): rendered once into a throwaway target with only them shown. Their meshes hold whole geometry from the start
   * (count 0: three builds the pipeline and skips the draw), so nothing is built against an empty buffer.
   */
  private async prewarmKit(): Promise<void> {
    if (!this.kitMeshes || !this.scatter) return;
    const target = new THREE.RenderTarget(1, 1);
    const t0 = performance.now();
    try {
      this.newNodeFrame();
      await withOnlyShown(this.scene, [...this.kitMeshes.meshes, ...this.scatter.meshes], async () => this.picture.render(target));
    } finally {
      target.dispose();
    }
    console.info(`[prewarm] the heath kit: ${(performance.now() - t0).toFixed(0)} ms`);
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
    // With the loading cover, sound is armed as it dissolves (nothing audible, and no hint, over the cover).
    if (!this.loadingScreen) this.sound.arm();
  }

  /** Stages the crew and holds the camera (the front end; null releases them). */
  stageFrontEnd(staging: GangStaging | null, pose: CameraPose | null): void {
    this.gang.stage(staging);
    if (pose) this.rig.setPose(pose, this.conditions.tideM);
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
    if (m.surfer) {
      assignParams(this.surferParams, m.surfer);
      normalizeSurferParams(this.surferParams);
    }
    this.panel.refresh();
  }

  currentMoment(): Moment {
    return {
      conditions: cloneConditions(this.conditions), camera: this.rig.getPose(), simTime: this.clock.simTime, paused: this.clock.paused,
      ...(this.surferParams.enabled ? { surfer: { ...this.surferParams } } : {}),
    };
  }

  /** Latest GPU-sampled water height under the camera (holds while a readback is in flight). */
  protected waterHeightAtCamera(): number {
    return this.probe.heightAt(0) ?? 0;
  }

  /** The field or the break params changed: the ribbon's params and the trace's height cut-off follow. */
  private onRibbonInputs(): void {
    this.ribbonMinHeightM = this.field ? minRibbonHeight(fieldBreakingHeight(this.field, this.breakParams), this.breakParams) : Infinity;
    this.waveCtx = this.field ? { omega: this.field.omega, travelX: this.field.far.dirX, travelZ: this.field.far.dirZ } : null;
    this.updateOffshore();
    this.ribbonKey = null;
  }

  /** The wind's offshore speed against the field's swell (overturn.offshoreSpeed): the lip's wind factors. */
  private updateOffshore(): void {
    this.offshoreMs = this.field ? offshoreSpeed(this.conditions.wind.speedMs, this.conditions.wind.directionDeg, this.field.far.dirX, this.field.far.dirZ) : 0;
    this.ribbon.setOffshore(this.offshoreMs);
    this.ribbonKey = null;
  }

  /**
   * This frame's crest stations (crestTrace), timed into traceMs; none with no field yet or breaking off. The ribbon
   * then uploads them, computes its vertices and renders the footprint the sheet reads, all before the frame renders.
   */
  /**
   * Switches the view when the eye crosses the water surface (the probe under the camera, one frame behind): the sheet
   * seen from below, the water volume in place of the sky dome, the rocks seen through the water, the ribbon hidden. A
   * crossing redraws the ribbon's stations so its visibility comes back on surfacing.
   */
  private updateUnderwater(): void {
    this.waterVolume.followCamera(this.camera.position);
    const cam = this.camera.position;
    let water = this.probe.heightAt(0);
    // Under the breaking ribbon the surface is the drawn section, not the sheet under it: inside a 6 ft tube the sheet stood
    // 1.45 m over an eye at 0.29 m and the view went underwater (Opus, 2026-10-06). The eye in the tube is over the floor.
    if (water !== null && this.ribbonStations.length > 0) {
      const drawn = this.rideWater(this.clock.simTime)(cam.x, cam.z);
      if (drawn.onSection) water = drawn.y;
    }
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
    this.rocks.setUnderwater(under);
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

  /** The kelp's ticks this frame (none while paused; a replay after a jump), like the foam's: each tick points the set waves at its time. */
  private stepKelp(events: readonly WaveEvent[]): void {
    const steps = this.kelp.advance(this.renderer, this.clock.simTime, this.camera.position.x, this.camera.position.z, (t) => this.pointFoamSourceAt(t));
    if (steps === 0) return;
    this.ocean.time.value = this.clock.simTime;
    this.setWaves.setEvents(events);
  }

  /** Dev: the kelp on or off (off: build A's bed, no lean steps). For captures and the cost check. */
  setKelp(on: boolean): void {
    this.kelp.setEnabled(on);
  }

  /** Dev (spec §3.6): mean GPU ms per frame over `frames` frames with the kelp on, then off (window.__ldGpuMs). */
  async measureKelpGpu(frames = 120): Promise<{ on: number; off: number }> {
    const w = window as unknown as { __ldGpuMs?: number[] };
    const take = async (): Promise<number> => {
      w.__ldGpuMs = [];
      while ((w.__ldGpuMs?.length ?? 0) < frames) await new Promise((r) => requestAnimationFrame(r));
      const a = w.__ldGpuMs!.slice(-frames);
      return a.reduce((s, v) => s + v, 0) / a.length;
    };
    this.gpuSampling = true;
    try {
      this.setKelp(true);
      const on = await take();
      this.setKelp(false);
      const off = await take();
      this.setKelp(true);
      return { on, off };
    } finally {
      this.gpuSampling = false;
    }
  }

  /** The foam field's source at sim time t: the ocean's time uniform and the set waves in flight then. */
  private pointFoamSourceAt(t: number): void {
    this.ocean.time.value = t;
    this.setWaves.setEvents(wavesNear(t, this.conditions, this.sets));
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
    const setIndices = setIndicesFrom(wavesBetween(win.t0, win.t1, this.conditions, this.sets), T);
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
    this.impact.advance(this.renderer, this.clock.simTime, (k) => this.impactBirthsAt(k));
  }

  /** Tick k's emitters, computed once per frame (both systems ask for the same ticks). */
  private emittersAt(k: number): { spray: SprayEmitter[]; impact: ImpactEmitter[]; spit: SpitEmitter[] } {
    let e = this.tickEmitters.get(k);
    if (!e) {
      const t = tickTime(k);
      e = breakEmitters({
        field: this.field, ctx: this.waveCtx, events: wavesNear(t, this.conditions, this.sets), t, params: this.breakParams,
        minHeightM: this.ribbonMinHeightM, wind: { speedMs: this.conditions.wind.speedMs, fromDeg: this.conditions.wind.directionDeg },
        tideM: this.conditions.tideM, amount: this.sprayParams.amount, impactAmount: this.impactParams.amount,
      });
          const bb = burstAt(t, this.bombieWaves(t));
          e.impact.push(...bombieImpactEmitters(bb, bb ? burstWidthM(bb.heightM, surferFeetToHs(this.bombieParams.thresholdFt), this.bombieParams.size) : 0, this.conditions.tideM, this.bombieParams.size));
      this.tickEmitters.set(k, e);
    }
    return e;
  }

  /** Tick k's births in the explosion's pool: the lips' landings (and the Bombie's burst), then the barrels' spit, within
   * the tick's slots. */
  private impactBirthsAt(k: number) {
    const e = this.emittersAt(k);
    return [...impactBirths(e.impact, k), ...spitBirths(e.spit, k)].slice(0, SPRAY_BIRTH_CAP);
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
      const b = this.impactBirthsAt(k);
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
    // The sun too: the tube's light (BreakingRibbon's light pass) follows it, paused or not.
    const sun = this.sky.sunDirection.value;
    const key = `${tracing}|${this.clock.simTime}|${cam.x}|${cam.z}|${sun.x}|${sun.y}|${sun.z}`;
    if (key === this.ribbonKey) return;
    this.ribbonKey = key;
    let entries: StationEntry[] = [];
    if (tracing) {
      const waves = events.map(toActiveWave);
      const input = { cameraX: cam.x, cameraZ: cam.z, params: this.breakParams, minHeightM: this.ribbonMinHeightM, offshoreMs: this.offshoreMs };
      const start = performance.now();
      entries = traceStations(field, waves, this.clock.simTime, ctx, input);
      this.traceMs += TRACE_MS_ALPHA * (performance.now() - start - this.traceMs);
    }
    this.ribbonStations = entries;
    this.ribbon.setStations(entries, cam);
    this.ribbon.setSun(sun);
    this.ribbon.compute(this.renderer);
    this.ribbon.renderFootprint(this.renderer);
  }

  /** The heavy apply after a conditions edit (the dev panel's, or the front end's through its gate). */
  applyConditionsEdit(): void {
    this.surf.invalidate();
    const clean = sanitizeConditions(this.conditions);
    if (JSON.stringify(clean) !== JSON.stringify(this.conditions)) {
      assignConditions(this.conditions, clean);
      this.panel.refresh();
    }
    this.seabed.setTide(this.conditions.tideM);
    this.updateOffshore();
    this.scheduleSpectrumRebuild();
  }

  /** The front end's view of the App (dune select spec §14). */
  frontEndHost(): FrontEndHost {
    return {
      standSpot: () => {
        const lh = this.land.height;
        return lh?.trackNetwork ? landSpots(lh, lh.profile).standSpot : null;
      },
      groundAt: this.groundAt,
      baseConditions: () => this.conditions,
      applyConditions: (c) => {
        assignConditions(this.conditions, c);
        this.applyConditionsEdit();
        this.panel.refresh();
      },
      stage: (staging, pose) => this.stageFrontEnd(staging, pose),
      paddleOut: (choice) => void this.paddleOut(choice),
      crewReady: () => this.gang.settled,
    };
  }

  /** Dev checks: drives the front end to a beat (opening it if needed) and waits for the move to land. */
  async frontEndGoTo(beat: 'conditions' | 'rider' | 'gear'): Promise<void> {
    this.openFrontEnd();
    const order = ['conditions', 'rider', 'gear'] as const;
    for (let k = 0; k < 900; k++) {
      const s = this.frontEnd?.state;
      if (!s) return;
      if (s.beat === beat && !s.move) return;
      if (!s.move) this.frontEnd!.act(order.indexOf(beat) > order.indexOf(s.beat as typeof order[number]) ? 'confirm' : 'back');
      // Step the frame here too: a hidden window stalls requestAnimationFrame.
      this.lastMs = performance.now() - 16;
      this.frame();
      await new Promise((r) => setTimeout(r, 17));
    }
  }

  /**
   * Dev checks: a ray from the camera to the focused rider's head; the first thing in front of it (by name), or null.
   * The rider's own body is skipped (the ray ends inside the head).
   */
  frontEndFaceRay(): { rider: string; covered: string | null } {
    const rider = this.frontEnd?.state?.rider ?? 'female', stand = this.gang.standOf(rider);
    const head = stand.rider?.boneWorldPosition('head', new THREE.Vector3());
    if (!head) return { rider, covered: null };
    const from = this.camera.getWorldPosition(new THREE.Vector3()), dir = head.clone().sub(from), dist = dir.length();
    const ray = new THREE.Raycaster(from, dir.normalize(), 0.05, dist - 0.12);
    const own = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (o === stand.group) return true; return false; };
    // Meshes only (the land, the heath's instances, the riders and boards); sprites, points and lines can't block a face.
    const meshes: THREE.Object3D[] = [];
    this.scene.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh && !own(o)) meshes.push(o); });
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return { rider, covered: null };
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.name) o = o.parent;
    return { rider, covered: `${o?.name || hit.object.type} at ${hit.distance.toFixed(2)} m` };
  }

  get loading(): LoadingScreen | null {
    return this.loadingScreen;
  }

  /**
   * The loading cover (loading screens spec). `frontEnd`: whether this start opens the front end (otherwise, a moment
   * link or ?frontend=off, nothing waits for the crew). Sound is armed and the front end's input let go as it dissolves.
   */
  attachLoading(loading: LoadingScreen | null, frontEnd: boolean): void {
    this.loadingScreen = loading;
    this.frontEndAtBoot = frontEnd;
    if (!loading) return;
    loading.setCalm(this.calmMenus());
    loading.onBootDissolve(() => this.sound.arm());
  }

  private calmMenus(): boolean {
    try {
      return sanitizeFrontSettings(JSON.parse(localStorage.getItem(FRONT_SETTINGS_KEY) ?? 'null')).calmMenus;
    } catch {
      return false;
    }
  }

  /** Each frame: the heath and the crew stages as they land (start-up), the frame for the cover's gate, its hold on the menu. */
  private reportLoading(dtMs: number): void {
    const l = this.loadingScreen;
    if (!l) return;
    const h = this.heathParts;
    if (!this.bootReported && h.land && h.kit && h.layers) {
      const ready = bootReady({
        ...h, frontEnd: this.frontEndAtBoot, landUsable: !!this.land.height?.trackNetwork,
        crewIn: !!this.frontEndHost().standSpot() && this.gang.settled,
      });
      if (ready.heath) l.stageDone('heath');
      if (ready.crew) {
        l.stageDone('crew');
        this.bootReported = true;
      }
    }
    l.frameDrawn(dtMs);
    if (this.frontEnd) this.frontEnd.inputHeld = l.blocking;
  }

  /** The Electron probe's Paddle out (?probe): START on the select screen, as a player would. */
  probePaddleOut(): void {
    this.frontEnd?.act('start');
  }

  /** Opens the front end (a normal start after prewarm, or the dev panel's button). */
  openFrontEnd(): void {
    if (this.frontEnd?.isOpen) return;
    this.frontEnd ??= new FrontEnd(this.frontEndHost(), this.container, this.sound, browserStorage);
    this.setDuneSets(true);
    this.input.suspended = true;
    this.surferStand.group.visible = false;
    this.frontEnd.open();
  }

  /** The menu while surfing: the sim holds still and the camera lets go of the mouse until a choice is made. */
  private openPauseMenu(): void {
    this.pausedBeforeMenu = this.clock.paused;
    this.setPaused(true);
    this.input.suspended = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.pauseMenu = new PauseMenu(this.container, () => this.sound.uiOut(), browserStorage);
  }

  private closePauseMenu(pick: MenuPick): void {
    this.pauseMenu?.close();
    this.pauseMenu = null;
    if (pick === 'resume') {
      this.setPaused(this.pausedBeforeMenu);
      this.input.suspended = false;
    } else void this.backToDune();
  }

  /**
   * Covers a transition (loading screens §4): the cover comes in, `work` runs under it with the sim held still, and it
   * dissolves once the frames run smooth and it has held long enough; the sim then runs (or stays paused) as `work`
   * left it. Without a cover (none adopted), the work just runs. A second transition while one is covered is refused.
   * `afterDissolve` runs as it dissolves: the game's own keys come back then, never under the cover.
   */
  private async underCover(line: string, delayMs: number, work: () => void, afterDissolve?: () => void): Promise<void> {
    const cover = this.loadingScreen;
    if (!cover) {
      work();
      afterDissolve?.();
      return;
    }
    await new Promise((r) => window.setTimeout(r, delayMs));
    const calm = this.calmMenus();
    let resume = false;
    let dissolved!: () => void;
    const started = new Promise<void>((r) => { dissolved = r; });
    const ok = await cover.cover({
      line, calm, minHoldMs: calm ? PADDLE_OUT_MS.minHoldCalm : PADDLE_OUT_MS.minHold,
      onDissolve: () => { this.setPaused(resume); afterDissolve?.(); dissolved(); },
    });
    if (!ok) return;
    work();
    resume = this.clock.paused;
    this.setPaused(true);
    cover.release();
    await started;
  }

  /** Back to the dune (Andrew, Gate B): under the cover, the ride stops and the front end opens on the crew again. */
  backToDune(): Promise<void> {
    return this.underCover('Walking back up the dune…', 0, () => {
      this.setPaused(false);
      this.chaseAfterPaddle = false;
      this.stopRide(false);
      this.openFrontEnd();
    });
  }

  /** Paddle out (spec §3): the UI leaves; under the cover, the session is set and the rider put on a set wave. */
  paddleOut(choice: SessionChoice): Promise<void> {
    return this.underCover('Paddling out…', PADDLE_OUT_MS.uiOut, () => {
      const lineup = DEFAULT_SURFER_PARAMS;
      Object.assign(this.surferParams, {
        enabled: true, onLand: false, preset: choice.rider, board: choice.board, outfit: choice.outfit, stance: choice.stance, pose: 'sit', gang: false,
        x: lineup.x, z: lineup.z, headingDeg: lineup.headingDeg, heightNudgeM: 0, expression: 'none',
      });
      normalizeSurferParams(this.surferParams);
      this.surferStand.group.visible = true;
      this.stageFrontEnd(null, null);
      this.rig.setPose(this.startupMoment().camera, this.conditions.tideM);
      // Under the cover, so the sea's set timeline changes unseen: the ride runs the dev panel's sets.
      this.setDuneSets(false);
      // Straight onto a set wave (first ride): the ride's camera takes over from here.
      this.startRide();
      this.panel.refresh();
      this.scheduleSave();
    }, () => { this.input.suspended = false; });
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

  /** The sets the sea runs now: the dev panel's, or on the select screen a set every 120 s (Andrew, 2026-10-04). */
  private get sets(): SetParams {
    return this.duneSets ? selectScreenSetParams(this.setParams, this.selectScreenSets) : this.setParams;
  }

  /** Switches the select screen's sets on or off: a new set timeline, so the surf and the particles start over. */
  private setDuneSets(on: boolean): void {
    if (this.duneSets === on) return;
    this.duneSets = on;
    this.surf.invalidate();
    this.invalidateParticles();
  }

  /** A jump (or new conditions or field): the foam map and the spray replay their windows. */
  private invalidateParticles(): void {
    this.foamField.invalidate();
    this.kelp.invalidate();
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
    this.tracksMaskAt = null; // the tracks may have changed with the land: build the mask afresh
    this.scatterField.clear();
    this.scatterAt = null;
    this.rocksAt = null;
    this.plantsAt = null;
    this.hullsStale = true;
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
      rain: this.cloudMeter.rainHere, strikes: this.strikesPending,
    }, { position: cam, forward: this.camera.getWorldDirection(this.soundDir), up: { x: 0, y: 1, z: 0 } }, realDt);
    this.strikesPending = [];
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
      this.kitMeshes?.setVisible(false);
      this.plantFloor.value = 0;
      return;
    }
    this.rocks.setVisible(true);
    this.plants.setVisible(true);
    this.kitMeshes?.setVisible(true);
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
      // The tracks worn into the patch (dune-up-close §4.3): their mask and sink over its square.
      const t0 = performance.now(), mx = c[0] - PATCH_SIZE_M / 2, mz = c[1] - PATCH_SIZE_M / 2;
      this.tracksMask = buildTracksMask(lh.trackNetwork, mx, mz, undefined, this.tracksMaskAt ? { mask: this.tracksMask!, cornerX: this.tracksMaskAt[0], cornerZ: this.tracksMaskAt[1] } : undefined);
      this.tracksMaskAt = [mx, mz];
      this.patch.setTracksMask(this.tracksMask, mx, mz);
      this.tracksMaskMs = performance.now() - t0;
    }
    // The plants (Phase 4c-2): relaid every PLANT_RELAY_M, and whenever the patch recentres, shows or hides (each plant
    // sits on the surface drawn under it). With density 0 the painted heath stands near the camera again.
    this.plantFloor.value = this.landParams.bushDensity > 0 ? 1 : 0;
    const patchKey = c ? `${c[0]},${c[1]}` : 'off';
    const clearingKey = this.clearings.map((k) => `${k.x.toFixed(1)},${k.z.toFixed(1)}`).join(';');
    if (clearingKey !== this.clearingKey) this.hullsStale = true;
    if (!this.plantsAt || patchKey !== this.plantPatchKey || clearingKey !== this.clearingKey || Math.hypot(cam.x - this.plantsAt[0], cam.z - this.plantsAt[1]) > PLANT_RELAY_M) {
      this.clearingKey = clearingKey;
      // Riders on land and the pile trample the heath clear around them (walking spec §6).
      this.plantsNear = clearOf(this.plantField.near(cam.x, cam.z, NEAR_LIST_M), this.clearings);
      this.plantsAt = [cam.x, cam.z];
      this.plantGrid = new Map();
      for (const p of this.plantsNear) {
        if (p.kind === 'pigface' || p.kind === 'rice' || p.kind === 'spinach') continue; // the low plants have no crown over the ground
        const key = (Math.floor(p.x / 2) + 0x8000) * 0x10000 + (Math.floor(p.z / 2) + 0x8000);
        const cell = this.plantGrid.get(key);
        if (cell) cell.push(p);
        else this.plantGrid.set(key, [p]);
      }
    }
    this.layPlants(cam.x, cam.z, c, patchKey);
    this.plants.tick(this.clock.simTime, this.conditions.wind.speedMs);
    // The footprints: every 2 m, and on a recentre (they sit on the patch's surface).
    const tracks = lh.trackNetwork;
    if (c && tracks && this.patchGrids && this.groundLayersCpu && (moved || !this.printsAt || Math.hypot(cam.x - this.printsAt[0], cam.z - this.printsAt[1]) > 2)) {
      const g = this.patchGrids, layersCpu = this.groundLayersCpu;
      this.footprints.update(printsNear(tracks, cam.x, cam.z, 20), (x, z) => patchSurfaceAt(g, layersCpu, tracks, x, z));
      this.printsAt = [cam.x, cam.z];
    }
    this.footprints.setVisible(!!c);
    this.updateScatter(c, cam.x, cam.z);
    if (this.kitMeshes) {
      this.kitMeshes.update(this.plantsNear, this.camera, { cx: c ? c[0] : 0, cz: c ? c[1] : 0, on: !!c });
      this.kitMeshes.tick(this.clock.simTime, this.conditions.wind.speedMs);
    }
    if (c && (moved || this.sunDir.angleTo(this.shadowSun) > (0.5 * Math.PI) / 180)) {
      const inSquare = (x: number, z: number): boolean => Math.abs(x - c[0]) < 42 && Math.abs(z - c[1]) < 42;
      const casters = [...this.rocksNear.filter((r) => inSquare(r.x, r.z)), ...patchCasters(this.plantsNear, c, cam.x, cam.z, this.canopies)];
      this.patch.setShadows(buildGroundShadows(casters, c[0] - 32, c[1] - 32, [this.sunDir.x, this.sunDir.y, this.sunDir.z]));
      this.shadowSun.copy(this.sunDir);
    }
  }

  /**
   * The far plants, cell by cell (dune-up-close §4.5): the ring's entering and leaving cells, cells crossing a level-of-
   * detail distance, and on a patch recentre or show/hide the cells over the patch (each plant sits on the surface drawn
   * under it), laid within layBudgetMs a frame.
   */
  private layPlants(x: number, z: number, c: [number, number] | null, patchKey: string): void {
    const field = this.plantField;
    if (!field) return;
    if (this.hullsStale) {
      this.hullsStale = false;
      this.plants.clear();
      this.plantQueue.clear();
      this.hullRing = new PlantRing(PLANT_GONE_M, this.hullInnerM);
      for (const r of this.lodRings) r.reset();
      this.ringsAt = null;
    }
    if (!this.ringsAt || Math.hypot(x - this.ringsAt[0], z - this.ringsAt[1]) >= RING_MOVE_M) {
      this.ringsAt = [x, z];
      // The ring orders its changes (the near adds, the drops, the rest); a level-of-detail crossing re-lays its cell.
      this.plantQueue.push(...this.hullRing.move(x, z));
      for (const r of this.lodRings) for (const ch of r.move(x, z)) if (this.hullRing.has(ch.key)) this.plantQueue.push({ ...ch, add: true });
    }
    if (patchKey !== this.plantPatchKey) {
      // The cells over the old and the new patch re-seat (their plants blend between the patch's surface and the mesh's).
      for (const sq of [this.plantPatchKey, patchKey]) {
        if (sq === 'off' || sq === '') continue;
        const [px, pz] = sq.split(',').map(Number);
        for (let ci = Math.floor((px - 36) / PLANT_CELL_M); ci <= Math.floor((px + 36) / PLANT_CELL_M); ci++) {
          for (let cj = Math.floor((pz - 36) / PLANT_CELL_M); cj <= Math.floor((pz + 36) / PLANT_CELL_M); cj++) {
            const key = cellKey(ci, cj);
            if (this.hullRing.has(key)) this.plantQueue.push({ key, ci, cj, add: true });
          }
        }
      }
      this.plantPatchKey = patchKey;
    }
    const patch = { cx: c ? c[0] : 0, cz: c ? c[1] : 0, on: !!c };
    const t0 = performance.now();
    this.plantQueue.drain((ch) => {
      if (!ch.add || !this.hullRing.has(ch.key)) {
        this.plants.removeCell(ch.key);
        return;
      }
      const d = Math.hypot((ch.ci + 0.5) * PLANT_CELL_M - x, (ch.cj + 0.5) * PLANT_CELL_M - z), lod = plantLod(d);
      this.plants.addCell(ch.key, clearOf(field.cell(ch.ci, ch.cj), this.clearings), (p) => plantSeatY(p, patch), () => lod);
    }, layBudgetMs(this.plantQueue.length));
    this.plantLayWorstMs = Math.max(this.plantLayWorstMs, performance.now() - t0);
    this.plants.flush();
    this.plantStats = { drawn: this.plants.drawn, dropped: this.plants.dropped };
  }

  /**
   * The near scatter (dune-up-close §4.4): the cells within TUFT_RANGE_M, each laid once and cached, gathered every
   * metre; drawn while the patch shows (the items sit on its surface).
   */
  private updateScatter(c: [number, number] | null, x: number, z: number): void {
    const s = this.scatter, lh = this.land.height, g = this.patchGrids, layers = this.groundLayersCpu;
    if (!s || !lh || !c || !g || !layers) {
      s?.setVisible(false);
      return;
    }
    s.setVisible(true); // with bush density 0 the tufts go (cellScatter) but the debris stays
    if (!this.scatterAt || this.scatterPending > 0 || Math.hypot(x - this.scatterAt[0], z - this.scatterAt[1]) > 1) {
      this.scatterAt = [x, z];
      const tracks = lh.trackNetwork, field = this.rockField;
      const ctx: ScatterContext = {
        land: lh,
        plants: (px, pz) => {
          for (let a = -1; a <= 1; a++) {
            for (let b = -1; b <= 1; b++) {
              for (const p of this.plantGrid.get((Math.floor(px / 2) + a + 0x8000) * 0x10000 + (Math.floor(pz / 2) + b + 0x8000)) ?? []) {
                if (Math.hypot(p.x - px, p.z - pz) < p.width / 2) return { underCrown: true, crownKind: p.kind };
              }
            }
          }
          return { underCrown: false, crownKind: null };
        },
        surfaceAt: (px, pz) => patchSurfaceAt(g, layers, tracks, px, pz),
        density: this.landParams.bushDensity,
        rockNear: (px, pz) => field?.covers(px, pz, 2) ?? false,
      };
      this.scatterPending = this.scatterField.gather(x, z, ctx);
    }
    s.update(this.scatterField.near, this.camera);
    s.tick(this.clock.simTime, this.conditions.wind.speedMs);
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
    const key = fieldKey(c, this.reefParams, this.breakParams.peel);
    if (!force && key === this.fieldKey) return;
    this.fieldKey = key;
    this.fieldClient.request({ bed: downsample(this.seabed.bathymetry, 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: this.breakParams.peel, smooth: true, refractFloorM: REFRACT_FLOOR_M });
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
  /** The set waves' surface at sim time t on the CPU (first-ride spec §1); flat at the tide until the reef field loads. */
  /** The ride's water at t: the sheet (lifted onto the drawn sea when `drawn`), with the ribbon's sections over it when
   * `sections` (the height probe reads the sheet alone, so its offset is matched against the sheet alone). */
  private rideWater(t: number, drawn = true, sections = true): WaterFn {
    const field = this.field, ctx = this.waveCtx, tide = this.conditions.tideM + (drawn ? this.rideOffset.value : 0);
    if (!field || !ctx) return flatWater(tide);
    const waves = wavesNear(t, this.conditions, this.sets).map(toActiveWave);
    // The sheet as SetWaves draws it: no whitewater pile, the swell's front leaned and no breaking shape (the ribbon draws it).
    const o = this.breakParams.enabled ? { ...breakOptions(field, this.breakParams, this.offshoreMs), pile: false, shape: 'lean' as const } : undefined;
    // The land and the rocks under the board (null while the land loads): the board runs aground on them.
    const sheet: WaterFn = (x, z) => {
      const w = waterAt(x, z, tide, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
      const bed = this.groundAt(x, z);
      return bed === null ? w : { ...w, bedY: bed };
    };
    // Where the breaking ribbon draws, the board stands on its sections (the wave that is drawn), from this frame's
    // stations (traced at the clock's time).
    return sections && t === this.clock.simTime ? withSections(sheet, this.ribbonStations, tide) : sheet;
  }

  /** G: paddle out at the Womb with a set on its way, or stop surfing (first-ride spec). */
  toggleRide(): void {
    if (this.ride.active) this.stopRide(true);
    else this.startRide();
  }

  /** Stop surfing: the rider sits where the board was; `toLineup` puts the camera back to the lineup there. */
  private stopRide(toLineup: boolean): void {
    if (!this.ride.active) return;
    const sp = this.surferParams, b = this.ride.body!;
    Object.assign(sp, { x: b.x, z: b.z, headingDeg: b.headingDeg, pose: 'sit' });
    normalizeSurferParams(sp);
    this.ride.end();
    if (toLineup) {
      const cam = this.rig.getPose();
      this.rig.setPose({ ...cam, mode: 'lineup' }, this.rideWater(this.clock.simTime)(cam.position[0], cam.position[2]).y);
    }
    this.panel.refresh();
  }

  /** Paddle out on a called set with the chosen rider (G, or the select screen's Paddle out). */
  private startRide(): void {
    const sp = this.surferParams;
    Object.assign(sp, { enabled: true, onLand: false, gang: false, pose: 'sit' });
    normalizeSurferParams(sp);
    this.callSetNow();
    const t = this.clock.simTime;
    const set = wavesBetween(t, t + 120, this.conditions, this.sets).filter((e) => e.arrivalS > t + RIDE_LEAD_S);
    this.rideSet = set.map((e) => e.arrivalS);
    this.rideHeights = set.map((e) => e.heightM);
    // The set's biggest wave first; R goes on through the rest.
    this.catchSetWave(set.reduce((best, e, i) => (e.heightM > set[best].heightM ? i : best), 0));
    this.panel.refresh();
  }

  /** Wave i of the called set (cycling): the clock RIDE_LEAD_S before it reaches the peak, you at the takeoff spot. */
  private catchSetWave(i: number): void {
    if (this.rideSet.length === 0) {
      this.perf.flash('Flat: no sets to ride');
      this.ride.end();
      return;
    }
    this.rideWave = i % this.rideSet.length;
    this.clock.setTime(this.rideSet[this.rideWave] - RIDE_LEAD_S);
    this.rideOffset.reset();
    this.ocean.resetFoam();
    this.invalidateParticles();
    // Where G puts you (first-ride spec): just outside where this wave starts to break in the take-off zone (bigger waves
    // break further out), facing the way the swell runs there.
    const at = this.field ? takeoffSpot(this.field, this.rideHeights[this.rideWave], this.breakParams) : TAKEOFF_ANCHOR;
    const water = this.rideWater(this.clock.simTime), w = water(at.x, at.z);
    this.ride.begin(at.x, at.z, Math.atan2(w.dirX, -w.dirZ) / (Math.PI / 180), water);
    const keys = currentBindings().keys;
    this.perf.flash(`Wave ${this.rideWave + 1} of ${this.rideSet.length}: paddle (${keyLabel(keys.paddle)}) as it lifts you, ${keyLabel(keys.popup)} to pop up`);
  }

  private callSetNow(): void {
    const t = callSetTime(this.clock.simTime, this.conditions, this.sets);
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
      breaking: this.breakParams, foam: this.foamParams, spray: this.sprayParams, impact: this.impactParams, land: this.landParams, surf: this.surfParams, bombie: this.bombieParams, sound: this.soundParams, surfer: this.surferParams,
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
    assignParams(this.surferParams, look.surfer);
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
    normalizeSurferParams(this.surferParams);
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
    // The loading cover waits on frames that will never come now: take it away, or it hides the message for good.
    this.loadingScreen?.remove();
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
    // A #m= link made without the surfer opens with it off (surfer spec §6).
    if (!m.surfer && location.hash.startsWith('#m=')) this.surferParams.enabled = false;
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
    this.frontEnd?.resize(window.innerWidth, window.innerHeight);
    this.pauseMenu?.resize(window.innerWidth, window.innerHeight);
  };

  /**
   * Dev automation (gallery captures): render one frame now, even when the page isn't animating (a hidden or
   * occluded window pauses requestAnimationFrame), and return it as a PNG, read back from an offscreen target.
   */
  /**
   * Starts a new node frame, as the renderer's animation loop does before each frame (Animation.update): passes that
   * render once per frame (the scene pass) otherwise re-use the last frame's render, so a capture showed the frame before
   * it (one capture late), or the same frame over and over while the window was hidden; and a prewarm mid-game built
   * nothing.
   */
  private newNodeFrame(): void {
    const r = this.renderer as unknown as { _nodes: { nodeFrame: { update(): void; frameId: number } }; info: { frame: number } };
    r._nodes.nodeFrame.update();
    r.info.frame = r._nodes.nodeFrame.frameId;
  }

  /** Renders one frame into `target` as the animation loop would (a capture's, or the dev budget harness's). */
  renderInto(target: THREE.RenderTarget): void {
    const maxFps = this.frameLimiter.maxFps;
    this.frameLimiter.maxFps = 0;
    this.captureTarget = target;
    this.newNodeFrame();
    try {
      this.frame();
    } finally {
      this.captureTarget = null;
      this.frameLimiter.maxFps = maxFps;
    }
  }

  async captureFrame(): Promise<Blob | null> {
    // Rendered into an offscreen target and read back: a hidden or covered window never presents the canvas, so a
    // canvas toBlob there returns the last frame it did present (captures were silently stale).
    const { width, height } = this.renderer.domElement;
    const target = new THREE.RenderTarget(width, height, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.renderInto(target);
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
    this.reportLoading(realDt * 1000);
    const simDt = this.clock.tick(realDt);
    this.frontEnd?.update(realDt);
    const fwd = this.camera.getWorldDirection(this.lookoutFwd);
    this.lookout.update(realDt, {
      fade: backdropFade(this.frontEnd?.isOpen ? this.frontEnd.state : null),
      aspect: this.camera.aspect,
      windMs: this.conditions.wind.speedMs,
      windFromDeg: this.conditions.wind.directionDeg,
      cameraYawDeg: ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360,
      sunVisible: this.cloudMeter.sunVisible,
    });
    // The menu while surfing: Esc or a pad's START opens it (the pad is watched every frame, so a START still held from
    // paddling out isn't a press).
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const padStart = this.padStart.poll(pads.map((g) => (g?.connected ? { index: g.index, buttons: g.buttons.map(buttonDown) } : null)));
    if (this.pauseMenu) {
      const pick = this.pauseMenu.update();
      if (pick) this.closePauseMenu(pick);
    } else if (!this.frontEnd?.isOpen && !this.loadingScreen?.blocking && (this.input.consumePressed('Escape') || padStart)) this.openPauseMenu();

    // While the front end has the keys, only H (show/hide the dev tools) reaches the game's hotkeys.
    if (this.frontEnd?.isOpen && this.input.consumePressed(HOTKEYS.toggleDevUi)) this.toggleDevUi();
    if (!this.frontEnd?.isOpen) handleHotkeys(this.input, {
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
    if (this.input.consumePressed('KeyG')) this.toggleRide();
    if (this.ride.active) {
      // Riding (first-ride spec): the keys drive the board, and the chase camera follows it.
      this.input.consumePressed('KeyC');
      const mouse = this.input.consumeMouse();
      // The drawn sea under the board (the FFT's long swell rides on the set waves), matched to the request it answers.
      this.rideOffset.read(this.probe.latestSeq, this.probe.heightAt(RIDE_PROBE), realDt);
      const water = this.rideWater(this.clock.simTime);
      const event = this.ride.step(simDt, this.input, water);
      if (event === 'reset') this.catchSetWave(this.rideWave + 1);
      else if (event) this.perf.flash(rideMessage(event));
      const rb = this.ride.body;
      this.rideCover = rb ? tubeCover(this.ribbonStations, rb.x, rb.z) : 0;
      const pose = this.ride.cameraPose(realDt, water, mouse, this.rideCover);
      if (pose) this.rig.setPose(pose);
    } else {
      this.rideCover = 0;
      this.rig.update(realDt, this.input, this.waterHeightAtCamera());
    }

    const sun = sunForConditions(this.conditions);
    this.sunDir.set(...sun.direction);
    this.clouds.setWeather(this.conditions.weather, this.conditions.seed);
    // Brings the sky's tables up to date first, then marches the clouds through them.
    this.clouds.update(this.renderer, this.sunDir, this.camera.position, this.clock.simTime);
    this.cloudMeter.update(this.renderer, realDt, this.sunDir.y, this.clouds.hasClouds);
    this.picture.setCloud(this.cloudMeter.stops, this.cloudMeter.sunVisible, this.cloudMeter.gains);
    const windTo = travelDirectionXZ(this.conditions.wind.directionDeg), windMs = this.conditions.wind.speedMs;
    this.rainStreaks.update(this.clock.simTime, windTo.x * windMs, windTo.z * windMs, this.cloudMeter.rainHere, this.underwater);
    // Rain on the lens: more when looking up or into the slanting rain (the fall's reverse direction).
    const fall = this.rainFall.set(windTo.x * windMs, -RAIN_FALL_MS, windTo.z * windMs).normalize();
    const facing = Math.min(1, Math.max(0, 0.3 - 0.7 * this.camera.getWorldDirection(this.viewDir).dot(fall)));
    this.rainLensWet = this.underwater ? 0 : rainLensStep(this.rainLensWet, this.cloudMeter.rainHere, facing, realDt);
    this.lensWater.rain(this.rainLensWet);
    this.tubeLensWet = tubeLensStep(this.tubeLensWet, this.underwater ? 0 : 2 * this.rideCover - 1, realDt);
    this.lensWater.tube(this.tubeLensWet);
    this.strikesPending.push(...this.lightning.update(this.conditions.seed, this.conditions.weather.storm, this.clock.simTime,
      lowLayer(this.conditions.weather).baseM, this.camera.position).fired);
    this.land.update(this.renderer, sun.direction, this.camera.position);
    this.updateBeach();
    this.sky.followCamera(this.camera.position);

    this.ocean.update(this.renderer, this.clock.simTime, simDt);
    const events = wavesNear(this.clock.simTime, this.conditions, this.sets);
        this.surf.update(this.clock.simTime, this.conditions, (t0, t1) => wavesBetween(t0, t1, this.conditions, this.sets), this.field, this.surfParams);
    this.setWaves.setEvents(events);
    this.stepFoam(events);
    this.stepKelp(events);
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
      this.setStatus.nextSet = formatNextSet(nextSetArrivalS(this.clock.simTime, this.conditions, this.sets), this.clock.simTime);
      this.setStatus.wave = waveStatus(this.clock.simTime, events);
      this.setStatus.face = formatPeakFace(peakFace(this.field, events, this.clock.simTime, this.breakParams), this.field !== null);
      this.setStatus.psi = formatPeakPsi(peakPsi(this.field, events, this.clock.simTime, this.breakParams, this.offshoreMs), this.field !== null);
    }
    const sp = this.surferParams;
    const riding = this.ride.surfer(sp.board === 'bodyboard');
    this.surferStand.update(riding ? { ...sp, ...riding, gang: false } : { ...sp, enabled: sp.enabled && !sp.gang }, this.clock.simTime, this.conditions.date, this.conditions.seed, this.probe, this.conditions.tideM, this.groundAt, this.ride.boardFrame() ?? undefined);
    if (this.chaseAfterPaddle) {
      const chase = this.surferStand.chasePose(sp.headingDeg);
      if (chase) { this.rig.setPose(chase); this.chaseAfterPaddle = false; }
    }
    this.gang.update(sp, this.clock.simTime, this.conditions.date, this.conditions.seed, this.probe, this.conditions.tideM, this.groundAt);
    this.clearings = [
      ...(sp.gang ? this.gang.spots.map((g) => ({ x: g.x, z: g.z, r: 1.2 })) : sp.enabled && sp.onLand ? [{ x: sp.x, z: sp.z, r: 1.2 }] : []),
      ...(sp.pile ? [{ x: sp.pileX, z: sp.pileZ, r: 1.1 }] : []),
    ];
    if (this.surferParams.pile && !this.beachPile && !this.pileLoading) {
      this.pileLoading = true;
      BeachPile.load(this.sky, (xz) => this.sunlight.visibilityNode(xz)).then(
        (p) => { this.beachPile = p; this.scene.add(p.group); },
        (e) => console.warn('The beach pile failed to load; it stays off.', e),
      );
    }
    this.beachPile?.update(this.surferParams, this.conditions.tideM, this.groundAt);
    const probeXZ = this.rig.probeXZ;
    this.probe.setProbe(0, probeXZ.x, probeXZ.z);
    const rb = this.ride.body;
    if (rb) this.probe.setProbe(RIDE_PROBE, rb.x, rb.z);
    const probeSeq = this.probe.update(this.renderer);
    // The probe reads the drawn sheet (the ribbon draws over it): matched against the CPU's sheet alone, not its sections, or
    // the offset pulled the board back down onto the sheet under the drawn wave (Andrew's wipeouts, 2026-10-05).
    if (rb) this.rideOffset.sent(probeSeq, this.rideWater(this.clock.simTime, false, false)(rb.x, rb.z).y);
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
    if (this.devUiVisible || this.gpuSampling) this.perf.update();
  };
}
