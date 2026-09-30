import * as THREE from 'three/webgpu';
import { Fn, If, Loop, clamp, exp, float, instanceIndex, min, texture, textureStore, uint, uniform, uvec2, vec2, vec4 } from 'three/tsl';
import type { SunlightSource } from '../land/SunlightMap';
import { type CloudField, type CloudUniforms, HIGH_M, MAX_CLOUD_DISTANCE_M, MID_BASE_M, MID_TOP_M, heightAlongNode, reachNode } from './cloudNodes';

type N = any;

/** The shadow map: SHADOW_SIZE² texels over SHADOW_SPAN_M around the break (31 m texels). */
export const SHADOW_SIZE = 512;
export const SHADOW_SPAN_M = 16_000;
const SHADOW_LOW_STEPS = 24;
const SHADOW_MID_STEPS = 8;
/** Rows marched a frame: a quarter of the map (every 4th row), all of it after a jump. */
const SHADOW_SLICES = 4;

/**
 * The clouds' shadow on the sea and land (spec 2026-09-30 §4.5): a top-down map of the sun's transmittance through
 * the three layers, marched from sea level toward the sun. The shadows lie where the sun's rays cross the clouds (at
 * a low sun, kilometres from the cloud's own foot) and drift with them.
 */
export class CloudShadow implements SunlightSource {
  readonly texture: THREE.StorageTexture;
  private readonly row = uniform(0, 'uint');
  private readonly slicePass: THREE.ComputeNode;
  private readonly allPass: THREE.ComputeNode;
  private readonly clearPass: THREE.ComputeNode;
  private frame = 0;

  constructor(u: CloudUniforms, field: CloudField) {
    this.texture = new THREE.StorageTexture(SHADOW_SIZE, SHADOW_SIZE);
    this.texture.type = THREE.HalfFloatType;
    this.texture.format = THREE.RGBAFormat;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;

    const cell = SHADOW_SPAN_M / SHADOW_SIZE;
    const marchTexel = (x: N, y: N): void => {
      const ground = vec2(float(x).add(0.5), float(y).add(0.5)).mul(cell).sub(SHADOW_SPAN_M / 2);
      const s = u.sun;
      const tau = float(0.0).toVar();
      // A sun on or below the horizon: no shadow to cast (the atmosphere's own darkening takes over).
      If(s.y.greaterThan(0.01), () => {
        const layer = (base: N, top: N, steps: number, sigma: N, density: (xz: N, h: N) => N): void => {
          const enter = reachNode(float(0.0), s.y, base);
          const exit = min(reachNode(float(0.0), s.y, top), MAX_CLOUD_DISTANCE_M);
          const dt = exit.sub(enter).div(steps);
          Loop(steps, ({ i }: N) => {
            const t = enter.add(float(i).add(0.5).mul(dt));
            tau.addAssign(density(ground.add(s.xz.mul(t)), heightAlongNode(float(0.0), s.y, t)).mul(sigma).mul(dt));
          });
        };
        If(u.lowCover.greaterThan(0.0), () => layer(u.lowBase, u.lowTop, SHADOW_LOW_STEPS, u.sigmaLow, (xz, h) => field.low(xz, h, false)));
        If(u.midCover.greaterThan(0.0), () => layer(float(MID_BASE_M), float(MID_TOP_M), SHADOW_MID_STEPS, u.sigmaMid, (xz, h) => field.mid(xz, h)));
        If(u.highCover.greaterThan(0.0), () => {
          tau.addAssign(field.highDepth(ground.add(s.xz.mul(reachNode(float(0.0), s.y, float(HIGH_M))))));
        });
      });
      // Stored as occlusion (1 − T): a zeroed texture, before the first march, reads as full sun.
      textureStore(this.texture, uvec2(x, y), vec4(float(1.0).sub(exp(tau.negate())), 0.0, 0.0, 1.0));
    };
    this.slicePass = Fn(() => {
      const i = instanceIndex;
      marchTexel(i.mod(uint(SHADOW_SIZE)), i.div(uint(SHADOW_SIZE)).mul(uint(SHADOW_SLICES)).add(this.row));
    })().compute((SHADOW_SIZE * SHADOW_SIZE) / SHADOW_SLICES) as THREE.ComputeNode;
    this.allPass = Fn(() => {
      marchTexel(instanceIndex.mod(uint(SHADOW_SIZE)), instanceIndex.div(uint(SHADOW_SIZE)));
    })().compute(SHADOW_SIZE * SHADOW_SIZE) as THREE.ComputeNode;
    this.clearPass = Fn(() => {
      textureStore(this.texture, uvec2(instanceIndex.mod(uint(SHADOW_SIZE)), instanceIndex.div(uint(SHADOW_SIZE))), vec4(0.0));
    })().compute(SHADOW_SIZE * SHADOW_SIZE) as THREE.ComputeNode;
  }

  /** March every texel (after a jump) or the next quarter of the rows. */
  update(renderer: THREE.WebGPURenderer, all: boolean): void {
    if (all) {
      renderer.compute(this.allPass);
      return;
    }
    this.row.value = this.frame++ % SHADOW_SLICES;
    renderer.compute(this.slicePass);
  }

  /** No clouds: full sun everywhere. */
  clear(renderer: THREE.WebGPURenderer): void {
    renderer.compute(this.clearPass);
  }

  visibilityNode(xz: N): N {
    const uv = xz.add(SHADOW_SPAN_M / 2).div(SHADOW_SPAN_M);
    return float(1.0).sub(texture(this.texture, clamp(uv, vec2(0.0), vec2(1.0))).level(float(0)).x);
  }
}

/** Two sources of shade at once (the land's ridge and the clouds): the sun reaching xz is the product. */
export function combineSunlight(a: SunlightSource, b: SunlightSource): SunlightSource {
  return { visibilityNode: (xz: N): N => a.visibilityNode(xz).mul(b.visibilityNode(xz)) };
}
