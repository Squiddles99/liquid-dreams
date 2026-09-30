import * as THREE from 'three/webgpu';
import { Fn, PI, clamp, cos, float, instanceIndex, int, ivec2, sin, storage, textureLoad, textureStore, uint, uniform, uvec2, uvec3, vec2, vec3, vec4 } from 'three/tsl';
import { travelDirectionXZ } from '../conditions/directions';
import type { Sky } from '../sky/Sky';
import { cloudDrift, lowLayer } from './cloudModel';
import { fogExtinctionPerM, fogOpticalDepth } from './fog';
import { type CloudField, cloudField, cloudLight, createCloudUniforms, marchSkyNode, rainExtinctionNode, sunTransmittanceNode } from './cloudNodes';
import { hash3 } from './cloudNoiseNodes';
import { CloudShadow } from './CloudShadow';
import { CloudTextures } from './CloudTextures';
import { createRefreshState, decideRefresh } from './cloudRefresh';
import { SKY_MAP, SKY_MAP_SMALL, SLICES, SLICE_OFFSETS } from './skyMapLayout';
import { WEATHER_PRESETS, type WeatherConditions } from './weather';

type N = any;

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
  /**
   * The march's own output, before smoothing: each texel's fixed jitter along its ray (which hides the steps' banding)
   * showed as grain on the dome, a few screen pixels a texel. smoothPass filters it into the Sky's sky map.
   */
  readonly rawMap: THREE.StorageTexture;
  private readonly smoothPass: THREE.ComputeNode;
  private readonly sunPass: THREE.ComputeNode;
  private readonly clearPasses: THREE.ComputeNode[];
  private frame = 0;
  private active = false;
  private cleared = false;
  /** What to march each frame (cloudRefresh.decideRefresh): all after a jump, slices while anything moves. */
  private readonly refresh = createRefreshState();

  constructor(private readonly sky: Sky) {
    this.field = cloudField(this.u, this.textures);
    this.shadow = new CloudShadow(this.u, this.field);
    sky.attachRain((xz) => rainExtinctionNode(this.field.rainRate(xz)));
    // Lit by the clear sky above them (the cloudy sky light is what's left under them: using it would feed back).
    const light = cloudLight(this.u, sky.luts, sky.uniforms, sky.clearSkyIrradiance);
    const { width: W, height: H } = SKY_MAP;
    const blocks = W / 4;
    this.rawMap = new THREE.StorageTexture(W, H);
    this.rawMap.type = THREE.HalfFloatType;
    this.rawMap.format = THREE.RGBAFormat;
    this.rawMap.minFilter = this.rawMap.magFilter = THREE.NearestFilter;
    this.rawMap.generateMipmaps = false;
    const marchTexel = (x: N, y: N): void => {
      const uv = vec2(float(x).add(0.5).div(W), float(y).add(0.5).div(H));
      const el = uv.y.mul(uv.y).mul(PI.mul(0.5)), az = uv.x.mul(PI.mul(2.0));
      const dir = vec3(cos(el).mul(cos(az)), sin(el), cos(el).mul(sin(az)));
      // A fixed per-texel offset along the ray: the steps' banding becomes fine noise the downsample averages away.
      const jitter = hash3(uvec3(x, y, uint(0))).x;
      textureStore(this.rawMap, uvec2(x, y), marchSkyNode(this.u, this.field, light, dir, jitter));
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
        sum = sum.add(textureLoad(this.rawMap, ivec2(x.mul(uint(k)).add(uint(dx)), y.mul(uint(k)).add(uint(dy))) as N));
      }
      textureStore(sky.skyMapSmall, uvec2(x, y), sum.div(k * k));
    })().compute(w * h) as THREE.ComputeNode;

    // A 3×3 tent (1-2-1) over the raw march: azimuth wraps, elevation clamps.
    this.smoothPass = Fn(() => {
      const i = instanceIndex;
      const x: N = int(i.mod(uint(W))), y: N = int(i.div(uint(W)));
      let sum: N = vec4(0.0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const wgt = (2 - Math.abs(dx)) * (2 - Math.abs(dy));
        const xx: N = x.add(dx + W).mod(W), yy: N = (clamp as N)(y.add(dy), int(0), int(H - 1));
        sum = sum.add((textureLoad(this.rawMap, ivec2(xx, yy)) as N).mul(wgt));
      }
      textureStore(sky.skyMap, uvec2(i.mod(uint(W)), i.div(uint(W))), sum.div(16));
    })().compute(W * H) as THREE.ComputeNode;

    const sunOut = storage(sky.cloudSunAttr, 'vec4', 1);
    this.sunPass = Fn(() => {
      sunOut.element(0).assign(vec4(sunTransmittanceNode(this.u, this.field), this.field.rainRate(this.u.camera.xz), 0.0, 1.0));
    })().compute(1, [1]) as THREE.ComputeNode;

    const clear = (tex: THREE.StorageTexture, width: number, height: number): THREE.ComputeNode => Fn(() => {
      const i = instanceIndex;
      textureStore(tex, uvec2(i.mod(uint(width)), i.div(uint(width))), vec4(0.0));
    })().compute(width * height) as THREE.ComputeNode;
    this.clearPasses = [
      clear(sky.skyMap, W, H), clear(this.rawMap, W, H), clear(sky.skyMapSmall, w, h),
      Fn(() => { sunOut.element(0).assign(vec4(1.0, 0.0, 0.0, 1.0)); })().compute(1, [1]) as THREE.ComputeNode,
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
    u.rain.value = w.rain;
    this.sky.rainOn.value = w.rain > 0 ? 1 : 0;
    const d = travelDirectionXZ(w.windAloftDeg);
    u.windDir.value.set(d.x, d.z);
    this.textures.setSeed(seed);
    this.sky.setFog(fogExtinctionPerM(w.visibilityKm), w.fogTopM);
    this.refresh.dirty = true;
  }

  /** Force a full re-march on the next update (the self-tests; a moment applied). */
  invalidate(): void {
    this.refresh.dirty = true;
  }

  get hasClouds(): boolean {
    const w = this.weather;
    return w.lowCover > 0 || w.midCover > 0 || w.highCover > 0;
  }

  /**
   * The sky's tables first (the march reads the transmittance table and the clear sky light: marched before them, the
   * clouds were lit by the last frame's sun, or black on the first frame, and a paused map never repaired it; final
   * review C1), then the clouds, the shadow and the sky light through them.
   */
  update(renderer: THREE.WebGPURenderer, sunDir: THREE.Vector3, camera: THREE.Vector3, simTimeS: number): void {
    this.sky.update(renderer, sunDir, camera.y);
    // The haze dims the sun reaching the sea (a sun in sea mist is a pale disk); below the horizon the atmosphere rules.
    const w = this.weather;
    this.shadow.fogSun.value = sunDir.y > 0.01 ? Math.exp(-fogOpticalDepth(0, sunDir.y, 1e6, fogExtinctionPerM(w.visibilityKm), w.fogTopM)) : 1;
    if (!this.hasClouds) {
      if (this.active || !this.cleared) {
        renderer.compute(this.clearPasses);
        this.shadow.clear(renderer);
        this.sky.refreshSkyLight(renderer);
      }
      this.active = false;
      this.cleared = true;
      this.refresh.dirty = true; // cloud coming back marches it all
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

    const step = decideRefresh(this.refresh, { simTimeS, sun: [sunDir.x, sunDir.y, sunDir.z], camera: [camera.x, camera.y, camera.z] });
    if (step === 'none') return; // nothing moving: the map is already right
    if (step === 'full') {
      renderer.compute(this.marchAllPass);
      this.shadow.update(renderer, true);
    } else {
      this.marchSlice(renderer, this.frame++ % SLICES);
      this.shadow.update(renderer, false);
    }
    renderer.compute([this.smoothPass, this.downsamplePass, this.sunPass]);
    this.sky.refreshSkyLight(renderer);
  }

  private marchSlice(renderer: THREE.WebGPURenderer, k: number): void {
    const [ox, oy] = SLICE_OFFSETS[k];
    this.slice.value.set(ox, oy);
    renderer.compute(this.marchPass);
  }
}
