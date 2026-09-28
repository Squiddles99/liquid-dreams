import * as THREE from 'three/webgpu';
import { clamp, float, floor, fract, int, max, mix, select, sin, smoothstep, texture, uniform, uniformArray, vec2 } from 'three/tsl';
import type { Bathymetry } from './bathymetry';
import { FAR_DEPTH_M, REEF_SURROUND_DEPTH_M, SHORE_FLAT_DEPTH_M, SHORE_X } from './coastProfile';
import { OPEN_COAST_MATERIAL, SHORE_REEF_AT_MAP_M, SHORE_REEF_EDGE_M, SHORE_REEF_MAP_EASE_M, SHORE_REEF_MAP_Z, SHORE_REEF_MATERIAL, SHORE_REEF_MEAN_M } from './shoreReef';

type N = any;

/** The waterline shift outside the reef map (Phase 4a spec §4.4): x_s − SHORE_X every 50 m of z, z ∈ [−15000, 15000]. */
export const WATERLINE_STEP_M = 50;
export const WATERLINE_Z0 = -15000;
export const WATERLINE_COUNT = 601;

/** TSL mirror of depthBg(): the same piecewise smoothstep profile, as one select chain. */
export function depthBgNode(x: N): N {
  const s = float(SHORE_X).sub(x);
  const nearShore = float(SHORE_FLAT_DEPTH_M).add(float(1.5 - SHORE_FLAT_DEPTH_M).mul(smoothstep(0, 30, s)));
  const slope = float(1.5).add(float(REEF_SURROUND_DEPTH_M - 1.5).mul(smoothstep(30, 140, s)));
  const offshore = float(REEF_SURROUND_DEPTH_M).add(float(FAR_DEPTH_M - REEF_SURROUND_DEPTH_M).mul(smoothstep(260, 590, s)));
  return select(s.lessThan(30), nearShore, select(s.lessThan(140), slope, offshore));
}

function packTexture(b: Bathymetry, target?: THREE.DataTexture): THREE.DataTexture {
  const { nx, nz } = b.grid;
  const data = target ? (target.image.data as Uint16Array) : new Uint16Array(nx * nz * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < nx * nz; i++) {
    data[i * 4] = toHalf(b.bed[i]);
    data[i * 4 + 1] = toHalf(b.sand[i]);
    data[i * 4 + 2] = toHalf(b.weed[i]);
    data[i * 4 + 3] = toHalf(1);
  }
  const tex = target ?? new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** The Womb's seabed on the GPU and CPU, with the tide. One source of truth for water depth. */
export class Seabed {
  readonly tide = uniform(0);
  bathymetry: Bathymetry;
  private readonly tex: THREE.DataTexture;
  private readonly origin = uniform(new THREE.Vector2());
  private readonly cell = uniform(1);
  private readonly size = uniform(new THREE.Vector2(1, 1));

  private readonly shiftCpu = new Float32Array(WATERLINE_COUNT);
  private readonly shiftGpu: N = uniformArray( // three typings gap: element() isn't typed as a float node
    new Array<number>(WATERLINE_COUNT).fill(0), 'float');

  /** The land's waterline x_s at WATERLINE_COUNT samples (LandHeight.waterlineSamples(WATERLINE_STEP_M)). */
  setWaterline(xs: Float32Array): void {
    if (xs.length !== WATERLINE_COUNT) throw new Error(`setWaterline wants ${WATERLINE_COUNT} samples, got ${xs.length}`);
    for (let i = 0; i < WATERLINE_COUNT; i++) {
      this.shiftCpu[i] = xs[i] - SHORE_X;
      (this.shiftGpu.array as number[])[i] = this.shiftCpu[i];
    }
  }

  /** The shift at z (CPU mirror of shiftNode). */
  shiftAt(z: number): number {
    const f = Math.min(WATERLINE_COUNT - 1.001, Math.max(0, (z - WATERLINE_Z0) / WATERLINE_STEP_M));
    const i = Math.floor(f), t = f - i;
    return this.shiftCpu[i] * (1 - t) + this.shiftCpu[i + 1] * t;
  }

  private shiftNode(z: N): N {
    const f = clamp(z.sub(WATERLINE_Z0).div(WATERLINE_STEP_M), 0.0, WATERLINE_COUNT - 1.001);
    const i = int(floor(f));
    return mix(this.shiftGpu.element(i), this.shiftGpu.element(i.add(1)), fract(f));
  }

  constructor(b: Bathymetry) {
    this.bathymetry = b;
    this.tex = packTexture(b);
    this.syncGrid();
  }

  /** Replace the reef (dev edits). Grid dimensions must stay the same. */
  setBathymetry(b: Bathymetry): void {
    if (b.grid.nx !== this.bathymetry.grid.nx || b.grid.nz !== this.bathymetry.grid.nz) throw new Error('Seabed grid size cannot change');
    this.bathymetry = b;
    packTexture(b, this.tex);
    this.syncGrid();
  }

  setTide(m: number): void {
    this.tide.value = m;
  }

  private syncGrid(): void {
    const g = this.bathymetry.grid;
    this.origin.value.set(g.x0, g.z0);
    this.cell.value = g.cellM;
    this.size.value.set(g.nx, g.nz);
  }

  private gridCoords(xz: N): N {
    return xz.sub(this.origin).div(this.cell);
  }

  insideNode(xz: N): N {
    const g = this.gridCoords(xz);
    const lo = g.greaterThanEqual(vec2(0.0));
    const hi = g.lessThanEqual(this.size.sub(1.0));
    return select(lo.x.and(lo.y).and(hi.x).and(hi.y), float(1.0), float(0.0));
  }

  private sample(xz: N): N {
    const uv = this.gridCoords(xz).add(0.5).div(this.size);
    return texture(this.tex, uv).level(float(0)); // three typings gap: level() wants a node
  }

  /** Seabed height y (m) at world xz; outside the map, the coast profile shifted with the land's waterline. */
  bedHeightNode(xz: N): N {
    return select(this.insideNode(xz).greaterThan(0.5), this.sample(xz).x, depthBgNode(xz.x.sub(this.shiftNode(xz.y))).negate());
  }

  /** Still-water depth (m) including the tide, never negative. */
  waterDepthNode(xz: N): N {
    return max(this.tide.sub(this.bedHeightNode(xz)), 0.0);
  }

  /**
   * vec2(sand, weed) weights: the map inside it, the open coast's weedy rock outside, then the shore reef platform within its width of the
   * waterline (shoreReef.ts; CPU mirror bathymetry.bedMaterialAt).
   */
  materialNode(xz: N): N {
    const base = select(this.insideNode(xz).greaterThan(0.5), this.sample(xz).yz, vec2(OPEN_COAST_MATERIAL[0], OPEN_COAST_MATERIAL[1]));
    const dSea = float(SHORE_X).add(this.shiftNode(xz.y)).sub(xz.x);
    const [mz0, mz1] = SHORE_REEF_MAP_Z;
    const atMap = smoothstep(mz0 - SHORE_REEF_MAP_EASE_M, mz0, xz.y).mul(float(1.0).sub(smoothstep(mz1, mz1 + SHORE_REEF_MAP_EASE_M, xz.y)));
    const width = max(float(SHORE_REEF_MEAN_M).add(sin(xz.y.div(97.0)).mul(12.0)).add(sin(xz.y.div(41.0).add(1.3)).mul(8.0)), atMap.mul(SHORE_REEF_AT_MAP_M));
    const w = float(1.0).sub(smoothstep(width.sub(SHORE_REEF_EDGE_M), width.add(SHORE_REEF_EDGE_M), dSea));
    return mix(base, vec2(SHORE_REEF_MATERIAL[0], SHORE_REEF_MATERIAL[1]), w);
  }
}
