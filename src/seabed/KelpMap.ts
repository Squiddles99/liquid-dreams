import * as THREE from 'three/webgpu';
import { clamp, float, min, mix, smoothstep, texture, uniform } from 'three/tsl';
import { KELP_CELL_M, KELP_FADE_M, KELP_GRID_N } from './kelp';

type N = any;

/**
 * The kelp's lean as the bed's shading reads it (spec §4.3): a KELP_GRID_N² toroidal texture of world cells (rgba = this
 * tick's lean, the last tick's), sampled with repeat wrapping at xz / (N·cell), interpolated between ticks by `alpha`, and
 * faded to zero over the window's last KELP_FADE_M (outside it the texture holds other cells). `on` 0: no motion (the
 * kelp stands upright); `show` 0: no canopy (build A's bed). KelpField writes it.
 */
export class KelpMap {
  readonly texture: THREE.StorageTexture;
  readonly windowMin = uniform(new THREE.Vector2(-KELP_GRID_N / 2, -KELP_GRID_N / 2));
  readonly alpha = uniform(1);
  readonly on = uniform(0);
  readonly show = uniform(1);
  readonly time = uniform(0);

  constructor() {
    const t = new THREE.StorageTexture(KELP_GRID_N, KELP_GRID_N);
    t.type = THREE.HalfFloatType;
    t.format = THREE.RGBAFormat;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = false;
    this.texture = t;
  }

  setWindow(minX: number, minZ: number): void {
    this.windowMin.value.set(minX, minZ);
  }

  /** The lean (vec2) at world xz: kelp.kelpWindowFade × the interpolated texel. */
  leanNode(xz: N): N {
    const size = KELP_GRID_N * KELP_CELL_M;
    const local = xz.sub(this.windowMin.mul(KELP_CELL_M));
    const edge = min(min(local.x, float(size).sub(local.x)), min(local.y, float(size).sub(local.y)));
    const fade = smoothstep(0.0, KELP_FADE_M, edge).mul(this.on);
    const s = texture(this.texture, xz.div(size)).level(float(0)); // three typings gap: level() wants a node
    return mix(s.zw, s.xy, clamp(this.alpha, 0.0, 1.0)).mul(fade);
  }
}
