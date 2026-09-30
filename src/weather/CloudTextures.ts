import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, saturate, smoothstep, textureStore, uint, uniform, uvec2, uvec3, vec2, vec3, vec4 } from 'three/tsl';
import { cloudDetail, cloudShape, fbm, perlin, worley } from './cloudNoiseNodes';

type N = any;

/** The 3D shape noise: 128³ texels over SHAPE_TILE_M horizontally (and vertically, squashed by the march). */
export const SHAPE_SIZE = 128;
/** The 3D detail noise: 32³ texels over DETAIL_TILE_M. */
export const DETAIL_SIZE = 32;
/** The weather map: WEATHER_SIZE² texels over WEATHER_TILE_M, repeating. */
export const WEATHER_SIZE = 512;
export const WEATHER_TILE_M = 128_000;
export const SHAPE_TILE_M = 6_000;
export const DETAIL_TILE_M = 800;

function noiseVolume(size: number): THREE.Storage3DTexture {
  const t = new THREE.Storage3DTexture(size, size, size);
  t.type = THREE.UnsignedByteType;
  t.format = THREE.RGBAFormat;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  return t;
}

/**
 * The clouds' noise (spec 2026-09-30 §4.2), generated once on the GPU: the 3D shape and detail volumes, and the
 * weather map that says where cloud grows, what kind, and where it rains. setSeed() rebuilds only the weather map,
 * so a new seed moves the clouds around the sky without regenerating the volumes.
 */
export class CloudTextures {
  readonly shape = noiseVolume(SHAPE_SIZE);
  readonly detail = noiseVolume(DETAIL_SIZE);
  readonly weather: THREE.StorageTexture;
  private readonly seed = uniform(0, 'uint');
  private readonly volumePasses: THREE.ComputeNode[];
  private readonly weatherPass: THREE.ComputeNode;
  private builtVolumes = false;
  private weatherDirty = true;

  constructor() {
    this.weather = new THREE.StorageTexture(WEATHER_SIZE, WEATHER_SIZE);
    this.weather.type = THREE.UnsignedByteType;
    this.weather.format = THREE.RGBAFormat;
    this.weather.minFilter = THREE.LinearFilter;
    this.weather.magFilter = THREE.LinearFilter;
    this.weather.wrapS = this.weather.wrapT = THREE.RepeatWrapping;
    this.weather.generateMipmaps = false;

    const volumeSeed = uint(7);
    const voxel = (size: number): N => {
      const i = instanceIndex;
      return uvec3(i.mod(uint(size)), i.div(uint(size)).mod(uint(size)), i.div(uint(size * size)));
    };
    const at = (c: N, size: number): N => vec3(c).add(0.5).div(size);
    this.volumePasses = [
      Fn(() => {
        const c = voxel(SHAPE_SIZE);
        const s = cloudShape(at(c, SHAPE_SIZE), volumeSeed);
        textureStore(this.shape, c, vec4(s.shape, s.perlinWorley, s.lowWorley, 1.0));
      })().compute(SHAPE_SIZE ** 3) as THREE.ComputeNode,
      Fn(() => {
        const c = voxel(DETAIL_SIZE);
        textureStore(this.detail, c, vec4(cloudDetail(at(c, DETAIL_SIZE), volumeSeed), 0.0, 0.0, 1.0));
      })().compute(DETAIL_SIZE ** 3) as THREE.ComputeNode,
    ];

    this.weatherPass = Fn(() => {
      const i = instanceIndex;
      const xy = uvec2(i.mod(uint(WEATHER_SIZE)), i.div(uint(WEATHER_SIZE)));
      // A plane through the 3D noise, off its lattice planes (where gradient noise is 0).
      const q = vec3(vec2(xy).add(0.5).div(WEATHER_SIZE), 0.37);
      const s = this.seed;
      // R, where cloud may grow: cumulus cells ~2.7 km apart (Worley) broken up by fBm.
      const cells = worley(q, 48, s).mul(0.55).add(fbm(q, 16, 3, s, perlin).mul(0.45));
      // Flattened toward uniform through an approximate normal CDF (measured: median 0.48, spread ~0.2 after the
      // smoothstep), so a cover of c lets cloud grow over about c of the sky rather than its top few percent.
      const coverage = smoothstep(-2.2, 2.2, smoothstep(0.1, 0.9, cells).sub(0.48).div(0.2));
      // G, the kind: a slow (16 km) swing between flatter and more towering cloud across the sky.
      const kind = perlin(q, 8, s.add(uint(11)));
      // B, the rain cells: the strongest few of ~5 km cells.
      const rain = smoothstep(0.55, 0.9, worley(q, 24, s.add(uint(23))));
      // A, the mid layer's patchiness.
      const mid = smoothstep(0.25, 0.75, fbm(q, 32, 3, s.add(uint(31)), perlin));
      textureStore(this.weather, xy, vec4(saturate(coverage), kind, rain, mid));
    })().compute(WEATHER_SIZE * WEATHER_SIZE) as THREE.ComputeNode;
  }

  setSeed(seed: number): void {
    const s = (seed >>> 0) % 100_003;
    if (this.seed.value === s) return;
    this.seed.value = s;
    this.weatherDirty = true;
  }

  /** Builds whatever is missing or stale: the volumes once, the weather map after a new seed. True if anything ran. */
  build(renderer: THREE.WebGPURenderer): boolean {
    let ran = false;
    if (!this.builtVolumes) {
      renderer.compute(this.volumePasses);
      this.builtVolumes = true;
      ran = true;
    }
    if (this.weatherDirty) {
      renderer.compute(this.weatherPass);
      this.weatherDirty = false;
      ran = true;
    }
    return ran;
  }
}
