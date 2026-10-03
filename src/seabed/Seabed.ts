import * as THREE from 'three/webgpu';
import { clamp, float, floor, fract, int, length, max, mix, pow, select, sin, smoothstep, texture, uniform, uniformArray, vec2 } from 'three/tsl';
import { BOMBIE_X, BOMBIE_Z, MOUND_BASE_Y, MOUND_CREST_Y, MOUND_HALF_X_M, MOUND_HALF_Z_M } from '../bombie/bombieModel';
import { DEFAULT_BEACH } from '../land/landHeight';
import type { Bathymetry } from './bathymetry';
import { FAR_DEPTH_M, REEF_SURROUND_DEPTH_M, SHORE_FLAT_DEPTH_M, SHORE_X } from './coastProfile';
import { KelpMap } from './KelpMap';
import { OPEN_COAST_MATERIAL, SHORE_REEF_AT_MAP_M, SHORE_REEF_EDGE_M, SHORE_REEF_MAP_EASE_M, SHORE_REEF_MAP_Z, SHORE_REEF_MATERIAL, SHORE_REEF_MEAN_M } from './shoreReef';

type N = any;

/** The waterline shift outside the reef map (Phase 4a spec §4.4): x_s − SHORE_X every 25 m of z (Phase 4b: 25 m, so the beach bed meets the land within centimetres), z ∈ [−15000, 15000]. */
export const WATERLINE_STEP_M = 25;
export const WATERLINE_Z0 = -15000;
export const WATERLINE_COUNT = 1201;

/** TSL mirror of bombieModel.moundY: Ellensbrook Bombie's mound (Phase 4c-3 §3.1), −1e4 outside its oval. */
export function moundYNode(xz: N): N {
  const r = length(vec2(xz.x.sub(BOMBIE_X).div(MOUND_HALF_X_M), xz.y.sub(BOMBIE_Z).div(MOUND_HALF_Z_M)));
  return select(r.lessThan(1.0), float(MOUND_CREST_Y).add(float(MOUND_BASE_Y - MOUND_CREST_Y).mul(smoothstep(0.0, 1.0, r))), float(-1e4));
}

/** TSL mirror of depthBg(): the same piecewise smoothstep profile, as one select chain. */
export function depthBgNode(x: N): N {
  const s = float(SHORE_X).sub(x);
  const nearShore = float(SHORE_FLAT_DEPTH_M).add(float(1.5 - SHORE_FLAT_DEPTH_M).mul(smoothstep(0, 30, s)));
  const slope = float(1.5).add(float(REEF_SURROUND_DEPTH_M - 1.5).mul(smoothstep(30, 140, s)));
  const offshore = float(REEF_SURROUND_DEPTH_M).add(float(FAR_DEPTH_M - REEF_SURROUND_DEPTH_M).mul(smoothstep(260, 590, s)));
  return select(s.lessThan(30), nearShore, select(s.lessThan(140), slope, offshore));
}

/** TSL mirror of landHeight.beachHeight(dl) for dl ≥ 0 (the default profile): the beach the swash runs up. */
export function beachBedNode(dl: N): N {
  const p = DEFAULT_BEACH;
  const wetEnd = p.wetWidthM, dryEnd = wetEnd + p.dryWidthM, toeEnd = dryEnd + p.toeWidthM, low = -SHORE_FLAT_DEPTH_M;
  const wet = float(low).add(dl.div(wetEnd).mul(p.wetTopM - low));
  const dry = float(p.wetTopM).add(pow(clamp(dl.sub(wetEnd).div(p.dryWidthM), 0.0, 1.0), 1.4).mul(p.beachTopM - p.wetTopM));
  const toe = float(p.beachTopM).add(smoothstep(dryEnd, toeEnd, dl).mul(p.toeTopM - p.beachTopM));
  const face = float(p.toeTopM).add(dl.sub(toeEnd).mul(0.25));
  return select(dl.lessThan(wetEnd), wet, select(dl.lessThan(dryEnd), dry, select(dl.lessThan(toeEnd), toe, face)));
}

/** TSL mirror of shoreReef.shoreReefWidth: the shore reef platform's width at z. */
export function shoreReefWidthNode(z: N): N {
  const [mz0, mz1] = SHORE_REEF_MAP_Z;
  const atMap = smoothstep(mz0 - SHORE_REEF_MAP_EASE_M, mz0, z).mul(float(1.0).sub(smoothstep(mz1, mz1 + SHORE_REEF_MAP_EASE_M, z)));
  return max(float(SHORE_REEF_MEAN_M).add(sin(z.div(97.0)).mul(12.0)).add(sin(z.div(41.0).add(1.3)).mul(8.0)), atMap.mul(SHORE_REEF_AT_MAP_M));
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
  /** The kelp's lean grid (reef build B): the bed's shading reads it, KelpField writes it. */
  readonly kelp = new KelpMap();
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

  /** The land's waterline shift at z (x_s − SHORE_X; CPU mirror shiftAt). */
  waterlineShiftNode(z: N): N {
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

  /**
   * Seabed height y (m) at world xz; outside the map, the coast profile shifted with the land's waterline, and Ellensbrook
   * Bombie's mound unless `withMound` is false (the water model's swell depth: the mound mustn't change the sea).
   */
  bedHeightNode(xz: N, withMound = true): N {
    const bg = depthBgNode(xz.x.sub(this.waterlineShiftNode(xz.y))).negate();
    const bed = select(this.insideNode(xz).greaterThan(0.5), this.sample(xz).x, withMound ? max(bg, moundYNode(xz)) : bg);
    const dSea = float(SHORE_X).add(this.waterlineShiftNode(xz.y)).sub(xz.x);
    // Landward of the waterline, the beach (Phase 4b §3.3): the swash is a thin film over sand, not half a metre of water.
    return select(dSea.lessThan(0.0), max(bed, beachBedNode(dSea.negate())), bed);
  }

  /** Still-water depth (m) including the tide, never negative. */
  waterDepthNode(xz: N): N {
    return max(this.tide.sub(this.bedHeightNode(xz)), 0.0);
  }

  /**
   * The depth the water model's swell sees (its long-swell fade and its clamp to the bed): the bed without the Bombie's
   * mound, which is atmospheric (final review I3: over the mound the long swell faded out and the sea flattened).
   */
  swellDepthNode(xz: N): N {
    return max(this.tide.sub(this.bedHeightNode(xz, false)), 0.0);
  }

  /**
   * vec2(sand, weed) weights: the map inside it, the open coast's weedy rock outside, then the shore reef platform within its width of the
   * waterline (shoreReef.ts; CPU mirror bathymetry.bedMaterialAt).
   */
  materialNode(xz: N): N {
    const base = select(this.insideNode(xz).greaterThan(0.5), this.sample(xz).yz, vec2(OPEN_COAST_MATERIAL[0], OPEN_COAST_MATERIAL[1]));
    const dSea = float(SHORE_X).add(this.waterlineShiftNode(xz.y)).sub(xz.x);
    const width = shoreReefWidthNode(xz.y);
    const w = float(1.0).sub(smoothstep(width.sub(SHORE_REEF_EDGE_M), width.add(SHORE_REEF_EDGE_M), dSea));
    // Landward of the waterline the swash runs up sand (Phase 4b §3.3).
    return select(dSea.lessThan(0.0), vec2(1.0, 0.0), mix(base, vec2(SHORE_REEF_MATERIAL[0], SHORE_REEF_MATERIAL[1]), w));
  }
}
