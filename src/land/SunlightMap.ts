import * as THREE from 'three/webgpu';
import { Fn, Loop, asin, atan, clamp, float, instanceIndex, length, max, mix, pow, select, smoothstep, texture, textureStore, uniform, uvec2, vec2, vec4 } from 'three/tsl';
import { MARCH_GRID, MARCH_MAX_M, MARCH_MIN_M, MARCH_STEPS, SUN_GRID, SUN_REBUILD_RAD, SUN_SOFT_RAD, sunMoved } from './sunlight';

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
    this.heights = new THREE.DataTexture(new Uint16Array(g.nx * g.nz), g.nx, g.nz, THREE.RedFormat, THREE.HalfFloatType);
    this.heights.minFilter = THREE.LinearFilter;
    this.heights.magFilter = THREE.LinearFilter;
    this.heights.wrapS = THREE.ClampToEdgeWrapping;
    this.heights.wrapT = THREE.ClampToEdgeWrapping;
    this.heights.generateMipmaps = false;
    this.heights.needsUpdate = true;

    const texel = (i: N): N => uvec2(i.mod(s.nx), i.div(s.nx));
    // sampleMarch's mirror: hardware bilinear at (g + 0.5) / size, clamped to the edge.
    const heightAt = (xz: N): N => texture(this.heights, xz.sub(vec2(g.x0, g.z0)).div(g.cellM).add(0.5).div(vec2(g.nx, g.nz))).level(float(0)).x;
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

  /** The land's march heights (sunlight.buildMarchHeights); the next update() rebuilds. */
  setHeights(h: Float32Array): void {
    const data = this.heights.image.data as Uint16Array;
    for (let k = 0; k < h.length; k++) data[k] = THREE.DataUtils.toHalfFloat(h[k]);
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
    const uv = xz.sub(vec2(s.x0, s.z0)).div(vec2(s.nx * s.cellM, s.nz * s.cellM));
    const inside = uv.x.greaterThanEqual(0.0).and(uv.y.greaterThanEqual(0.0)).and(uv.x.lessThanEqual(1.0)).and(uv.y.lessThanEqual(1.0));
    const v = texture(this.texture, clamp(uv, vec2(0.0), vec2(1.0))).level(float(0)).x;
    return mix(float(1.0), select(inside, v, float(1.0)), this.enabled);
  }
}
