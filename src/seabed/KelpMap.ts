import * as THREE from 'three/webgpu';
import { clamp, float, min, mix, smoothstep, texture, uniform } from 'three/tsl';
import { KELP_CELL_M, KELP_FADE_M, KELP_GRID_N, KELP_NOISE_SIZE, kelpNoiseData } from './kelp';

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
  /** The canopy's baked noise (kelp.kelpNoiseData), repeating: the shading samples it instead of evaluating noise. */
  readonly noise: THREE.DataTexture;

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
    const d = kelpNoiseData();
    const n = new THREE.DataTexture(Uint8Array.from(d, (v) => Math.round(v * 255)), KELP_NOISE_SIZE, KELP_NOISE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    n.wrapS = THREE.RepeatWrapping;
    n.wrapT = THREE.RepeatWrapping;
    n.minFilter = THREE.LinearFilter;
    n.magFilter = THREE.LinearFilter;
    n.generateMipmaps = false;
    n.needsUpdate = true;
    this.noise = n;
  }

  setWindow(minX: number, minZ: number): void {
    this.windowMin.value.set(minX, minZ);
  }

  /** Whether world xz is inside the window the lean was stepped in (the canopy is drawn only there: its cost). */
  insideNode(xz: N): N {
    const size = KELP_GRID_N * KELP_CELL_M;
    const local = xz.sub(this.windowMin.mul(KELP_CELL_M));
    return local.x.greaterThanEqual(0.0).and(local.y.greaterThanEqual(0.0)).and(local.x.lessThan(size)).and(local.y.lessThan(size));
  }

  /** 0 at the window's edge rising to 1 KELP_FADE_M inside it (kelp.kelpWindowFade): the lean and the canopy's look both fade by it. */
  edgeFadeNode(xz: N): N {
    const size = KELP_GRID_N * KELP_CELL_M;
    const local = xz.sub(this.windowMin.mul(KELP_CELL_M));
    const edge = min(min(local.x, float(size).sub(local.x)), min(local.y, float(size).sub(local.y)));
    return smoothstep(0.0, KELP_FADE_M, edge);
  }

  /** The lean (vec2) at world xz: kelp.kelpWindowFade × the interpolated texel. */
  leanNode(xz: N): N {
    const size = KELP_GRID_N * KELP_CELL_M;
    const fade = this.edgeFadeNode(xz).mul(this.on);
    const s = texture(this.texture, xz.div(size)).level(float(0)); // three typings gap: level() wants a node
    return mix(s.zw, s.xy, clamp(this.alpha, 0.0, 1.0)).mul(fade);
  }
}
