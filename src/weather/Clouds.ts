import * as THREE from 'three/webgpu';
import { Fn, PI, cos, float, instanceIndex, ivec2, sin, storage, textureLoad, textureStore, uint, uniform, uvec2, uvec3, vec2, vec3, vec4 } from 'three/tsl';
import { travelDirectionXZ } from '../conditions/directions';
import type { Sky } from '../sky/Sky';
import { cloudDrift, lowLayer } from './cloudModel';
import { type CloudField, cloudField, cloudLight, createCloudUniforms, marchSkyNode, sunTransmittanceNode } from './cloudNodes';
import { hash3 } from './cloudNoiseNodes';
import { CloudShadow } from './CloudShadow';
import { CloudTextures } from './CloudTextures';
import { SKY_MAP, SKY_MAP_SMALL, SLICES, SLICE_OFFSETS } from './skyMapLayout';
import { WEATHER_PRESETS, type WeatherConditions } from './weather';

type N = any;

/** The whole sky map is re-marched at once after the sun moves this far (a time scrub), not slice by slice. */
const FULL_REFRESH_SUN_RAD = (0.5 * Math.PI) / 180;
/** …or after a jump in sim time (a moment link, a scrub of the clock). */
const FULL_REFRESH_TIME_S = 2;
/** …or after the camera jumps this far (the map is centred on it). */
const FULL_REFRESH_CAMERA_M = 200;
/** Air extinction at cloud heights as a fraction of sea level's (Mie haze thins fast above ~1 km). */
const CLOUD_AIR_FRACTION = 0.6;

const sameWeather = (a: Readonly<WeatherConditions>, b: Readonly<WeatherConditions>): boolean =>
  (Object.keys(a) as (keyof WeatherConditions)[]).every((k) => a[k] === b[k]);

/**
 * The clouds (spec 2026-09-30 §4.2–§4.4): marches them into the Sky's sky map around the camera, a sixteenth of it a
 * frame (a 4×4 ordered pattern), all of it after a jump, then boxes it down into the small map and marches the sun's
 * ray for the disk. With no cloud at all it clears the maps once and does nothing more.
 */
export class Clouds {
  readonly textures = new CloudTextures();
  readonly u = createCloudUniforms();
  readonly field: CloudField;
  /** The clouds' shadow on the sea and land (a SunlightSource). */
  readonly shadow: CloudShadow;
  private weather: WeatherConditions = { ...WEATHER_PRESETS.clear };
  private seed = -1;
  private readonly slice = uniform(new THREE.Vector2());
  private readonly marchPass: THREE.ComputeNode;
  /** Every texel at once: a uniform changed between dispatches in one frame is not seen, so no 16 slice calls. */
  private readonly marchAllPass: THREE.ComputeNode;
  private readonly downsamplePass: THREE.ComputeNode;
  private readonly sunPass: THREE.ComputeNode;
  private readonly clearPasses: THREE.ComputeNode[];
  private frame = 0;
  private dirty = true;
  private active = false;
  private cleared = false;
  private readonly lastSun = new THREE.Vector3(0, -2, 0);
  private readonly lastCamera = new THREE.Vector3(1e9, 0, 0);
  private lastTimeS = Number.NaN;
  private readonly lastSliceSun = new THREE.Vector3(0, -2, 0);
  /** Slices still to march after the clouds or the sun last moved: a paused, still sky stops marching once settled. */
  private settle = 0;

  constructor(private readonly sky: Sky) {
    this.field = cloudField(this.u, this.textures);
    this.shadow = new CloudShadow(this.u, this.field);
    // Lit by the clear sky above them (the cloudy sky light is what's left under them: using it would feed back).
    const light = cloudLight(this.u, sky.luts, sky.uniforms, sky.clearSkyIrradiance);
    const { width: W, height: H } = SKY_MAP;
    const blocks = W / 4;
    const marchTexel = (x: N, y: N): void => {
      const uv = vec2(float(x).add(0.5).div(W), float(y).add(0.5).div(H));
      const el = uv.y.mul(uv.y).mul(PI.mul(0.5)), az = uv.x.mul(PI.mul(2.0));
      const dir = vec3(cos(el).mul(cos(az)), sin(el), cos(el).mul(sin(az)));
      // A fixed per-texel offset along the ray: the steps' banding becomes fine noise the downsample averages away.
      const jitter = hash3(uvec3(x, y, uint(0))).x;
      textureStore(sky.skyMap, uvec2(x, y), marchSkyNode(this.u, this.field, light, dir, jitter));
    };
    this.marchPass = Fn(() => {
      const i = instanceIndex;
      marchTexel(i.mod(uint(blocks)).mul(uint(4)).add(uint(this.slice.x)), i.div(uint(blocks)).mul(uint(4)).add(uint(this.slice.y)));
    })().compute((W * H) / SLICES) as THREE.ComputeNode;
    this.marchAllPass = Fn(() => {
      marchTexel(instanceIndex.mod(uint(W)), instanceIndex.div(uint(W)));
    })().compute(W * H) as THREE.ComputeNode;

    const { width: w, height: h } = SKY_MAP_SMALL;
    const k = W / w;
    this.downsamplePass = Fn(() => {
      const i = instanceIndex;
      const x: N = i.mod(uint(w)), y: N = i.div(uint(w));
      let sum: N = vec4(0.0);
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
        sum = sum.add(textureLoad(sky.skyMap, ivec2(x.mul(uint(k)).add(uint(dx)), y.mul(uint(k)).add(uint(dy))) as N));
      }
      textureStore(sky.skyMapSmall, uvec2(x, y), sum.div(k * k));
    })().compute(w * h) as THREE.ComputeNode;

    const sunOut = storage(sky.cloudSunAttr, 'vec4', 1);
    this.sunPass = Fn(() => {
      sunOut.element(0).assign(vec4(sunTransmittanceNode(this.u, this.field), 0.0, 0.0, 1.0));
    })().compute(1, [1]) as THREE.ComputeNode;

    const clear = (tex: THREE.StorageTexture, width: number, height: number): THREE.ComputeNode => Fn(() => {
      const i = instanceIndex;
      textureStore(tex, uvec2(i.mod(uint(width)), i.div(uint(width))), vec4(0.0));
    })().compute(width * height) as THREE.ComputeNode;
    this.clearPasses = [
      clear(sky.skyMap, W, H), clear(sky.skyMapSmall, w, h),
      Fn(() => { sunOut.element(0).assign(vec4(1.0)); })().compute(1, [1]) as THREE.ComputeNode,
    ];
  }

  /** The weather and seed to show; a change re-marches the whole map on the next update. */
  setWeather(w: Readonly<WeatherConditions>, seed: number): void {
    if (sameWeather(w, this.weather) && seed === this.seed) return;
    this.weather = { ...w };
    this.seed = seed;
    const u = this.u;
    const layer = lowLayer(w);
    u.lowCover.value = w.lowCover;
    u.convection.value = w.convection;
    u.lowBase.value = layer.baseM;
    u.lowTop.value = layer.topM;
    u.midCover.value = w.midCover;
    u.highCover.value = w.highCover;
    const d = travelDirectionXZ(w.windAloftDeg);
    u.windDir.value.set(d.x, d.z);
    this.textures.setSeed(seed);
    this.dirty = true;
  }

  /** Force a full re-march on the next update (the self-tests; a moment applied). */
  invalidate(): void {
    this.dirty = true;
  }

  get hasClouds(): boolean {
    const w = this.weather;
    return w.lowCover > 0 || w.midCover > 0 || w.highCover > 0;
  }

  update(renderer: THREE.WebGPURenderer, sunDir: THREE.Vector3, camera: THREE.Vector3, simTimeS: number): void {
    if (!this.hasClouds) {
      if (this.active || !this.cleared) {
        renderer.compute(this.clearPasses);
        this.shadow.clear(renderer);
        this.sky.refreshSkyLight(renderer);
      }
      this.active = false;
      this.cleared = true;
      return;
    }
    this.active = true;
    this.cleared = false;
    this.textures.build(renderer);
    const u = this.u;
    const drift = cloudDrift(this.weather, simTimeS);
    u.drift.value.set(drift.x, drift.z);
    u.evolve.value = simTimeS;
    u.sun.value.copy(sunDir);
    u.camera.value.copy(camera);
    u.airExtinction.value.copy(this.sky.seaLevelExtinction.value).multiplyScalar(CLOUD_AIR_FRACTION * 1e-3);

    const timeJump = !(Math.abs(simTimeS - this.lastTimeS) <= FULL_REFRESH_TIME_S);
    if (this.dirty || timeJump || this.lastSun.angleTo(sunDir) > FULL_REFRESH_SUN_RAD || this.lastCamera.distanceTo(camera) > FULL_REFRESH_CAMERA_M) {
      renderer.compute(this.marchAllPass);
      this.shadow.update(renderer, true);
      this.lastSun.copy(sunDir);
      this.lastCamera.copy(camera);
      this.dirty = false;
      this.settle = 0;
    } else {
      if (simTimeS !== this.lastTimeS || !this.lastSliceSun.equals(sunDir)) this.settle = SLICES;
      if (this.settle === 0) return; // paused with nothing moving: the map is already right
      this.marchSlice(renderer, this.frame++ % SLICES);
      this.shadow.update(renderer, false);
      this.settle--;
    }
    this.lastTimeS = simTimeS;
    this.lastSliceSun.copy(sunDir);
    renderer.compute([this.downsamplePass, this.sunPass]);
    this.sky.refreshSkyLight(renderer);
  }

  private marchSlice(renderer: THREE.WebGPURenderer, k: number): void {
    const [ox, oy] = SLICE_OFFSETS[k];
    this.slice.value.set(ox, oy);
    renderer.compute(this.marchPass);
  }
}
