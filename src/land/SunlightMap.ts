import * as THREE from 'three/webgpu';
import { Fn, Loop, asin, atan, clamp, float, floor, instanceIndex, int, ivec2, length, max, min, mix, pow, select, smoothstep, texture, textureLoad, textureStore, uniform, uvec2, vec2, vec4 } from 'three/tsl';
import { MARCH_GRID, MARCH_MAX_M, MARCH_MIN_M, MARCH_STEPS, SUN_EDGE_FADE_M, SUN_GRID, SUN_REBUILD_RAD, SUN_SOFT_RAD, sunMoved } from './sunlight';

type N = any;

/** Anything that tells a material how much of the sun reaches world xz (1 = all of it). */
export interface SunlightSource {
  visibilityNode(xz: N): N;
}

/**
 * The land's shadow (spec §4.8): a top-down map of the sun's visibility, marched through the land's heights on the GPU
 * whenever the sun moves more than SUN_REBUILD_RAD (CPU reference: sunlight.sunVisibility). Until the land loads it
 * holds 1 everywhere; outside its grid, and with the shadow switched off, visibilityNode is 1.
 */
export class SunlightMap implements SunlightSource {
  readonly texture: THREE.StorageTexture;
  private readonly heights: THREE.DataTexture;
  private readonly sun = uniform(new THREE.Vector3(0, 1, 0));
  private readonly enabled = uniform(1);
  private readonly clearPass: THREE.ComputeNode;
  private readonly marchPass: THREE.ComputeNode;
  private cleared = false;
  private hasHeights = false;
  private dirty = false;
  private last: [number, number, number] = [0, -1, 0];

  constructor() {
    const s = SUN_GRID, g = MARCH_GRID;
    this.texture = new THREE.StorageTexture(s.nx, s.nz);
    this.texture.type = THREE.HalfFloatType;
    this.texture.format = THREE.RGBAFormat;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    // Full-precision heights (not half-float: 0.125 m steps at the ridge put a grazing sun's shade edge ~0.2° off in the
    // first march steps, final review fix pass), read with a manual bilinear since f32 textures aren't filterable.
    this.heights = new THREE.DataTexture(new Float32Array(g.nx * g.nz), g.nx, g.nz, THREE.RedFormat, THREE.FloatType);
    this.heights.minFilter = THREE.NearestFilter;
    this.heights.magFilter = THREE.NearestFilter;
    this.heights.wrapS = THREE.ClampToEdgeWrapping;
    this.heights.wrapT = THREE.ClampToEdgeWrapping;
    this.heights.generateMipmaps = false;
    this.heights.needsUpdate = true;

    const texel = (i: N): N => uvec2(i.mod(s.nx), i.div(s.nx));
    // sampleMarch's exact mirror: bilinear between samples, clamped to the grid's edge.
    const maxIndex = vec2(g.nx - 1, g.nz - 1);
    const heightAt = (xz: N): N => {
      const f = clamp(xz.sub(vec2(g.x0, g.z0)).div(g.cellM), vec2(0.0), maxIndex);
      const base = min(floor(f), maxIndex.sub(1.0));
      const t = f.sub(base);
      const i0 = ivec2(base);
      const load = (dx: number, dz: number): N => textureLoad(this.heights, i0.add(ivec2(dx, dz)), int(0)).x;
      return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
    };
    this.clearPass = Fn(() => {
      textureStore(this.texture, texel(instanceIndex), vec4(1.0, 0.0, 0.0, 1.0));
    })().compute(s.nx * s.nz) as THREE.ComputeNode;
    this.marchPass = Fn(() => {
      const i = instanceIndex;
      const p = vec2(float(i.mod(s.nx)).add(0.5), float(i.div(s.nx)).add(0.5)).mul(s.cellM).add(vec2(s.x0, s.z0)).toVar();
      const h0 = heightAt(p).add(0.5);
      const horiz = length(this.sun.xz);
      const dir = this.sun.xz.div(max(horiz, 1e-4));
      const maxTan = float(-1e3).toVar();
      Loop(MARCH_STEPS, ({ i: k }: N) => {
        const dist = float(MARCH_MIN_M).mul(pow(float(MARCH_MAX_M / MARCH_MIN_M), float(k).div(MARCH_STEPS - 1)));
        maxTan.assign(max(maxTan, heightAt(p.add(dir.mul(dist))).sub(h0).div(dist)));
      });
      const elev = asin(clamp(this.sun.y, -1.0, 1.0));
      const soft = smoothstep(-SUN_SOFT_RAD, SUN_SOFT_RAD, elev.sub(atan(maxTan)));
      const vis = select(horiz.lessThan(1e-3), select(this.sun.y.greaterThan(0.0), float(1.0), float(0.0)), soft);
      textureStore(this.texture, texel(i), vec4(vis, 0.0, 0.0, 1.0));
    })().compute(s.nx * s.nz) as THREE.ComputeNode;
  }

  /** Builds the passes while the game loads (App.prewarm): the march first runs on the frame the land arrives. */
  async compileAsync(renderer: THREE.WebGPURenderer): Promise<void> {
    await renderer.compileComputeAsync([this.clearPass, this.marchPass]);
  }

  /** The land's march heights (sunlight.buildMarchHeights); the next update() rebuilds. */
  setHeights(h: Float32Array): void {
    (this.heights.image.data as Float32Array).set(h);
    this.heights.needsUpdate = true;
    this.hasHeights = true;
    this.dirty = true;
  }

  setEnabled(on: boolean): void {
    this.enabled.value = on ? 1 : 0;
  }

  /**
   * At most one march per call: the first call fills the map with 1 (sunlit); after setHeights, a march whenever the
   * heights changed or the sun moved past SUN_REBUILD_RAD. Returns true if it marched.
   */
  update(renderer: THREE.WebGPURenderer, sun: readonly [number, number, number]): boolean {
    if (!this.cleared) { renderer.compute(this.clearPass); this.cleared = true; }
    if (!this.hasHeights) return false;
    if (!this.dirty && !sunMoved(this.last, sun, SUN_REBUILD_RAD)) return false;
    this.sun.value.set(sun[0], sun[1], sun[2]);
    renderer.compute(this.marchPass);
    this.last = [sun[0], sun[1], sun[2]];
    this.dirty = false;
    return true;
  }

  visibilityNode(xz: N): N {
    const s = SUN_GRID;
    const lo = vec2(s.x0, s.z0), size = vec2(s.nx * s.cellM, s.nz * s.cellM);
    const uv = xz.sub(lo).div(size);
    // Beyond the map, the edge value fades to full sun (sunlight.outsideFade) instead of stepping to it (final review I1).
    const outside = max(max(lo.sub(xz), xz.sub(lo.add(size))), vec2(0.0));
    const v = texture(this.texture, clamp(uv, vec2(0.0), vec2(1.0))).level(float(0)).x;
    const faded = mix(v, float(1.0), smoothstep(0.0, SUN_EDGE_FADE_M, max(outside.x, outside.y)));
    return mix(float(1.0), faded, this.enabled);
  }

}
