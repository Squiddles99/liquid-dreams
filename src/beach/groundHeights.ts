import type { TrackNetwork } from '../land/tracks';
import { smoothstep } from '../math/smoothstep';
import { PATCH_FADE_M, PATCH_GRID_N, PATCH_SIZE_M, type PatchGrids } from './groundPatch';

/** The relief's full range (±2.5 cm), and the height blend's soft band (in layer-height units). Spec §4.3. */
export const RELIEF_M = 0.05;
export const BLEND_SOFT = 0.02;
/** The layers tile every LAYER_TILE_M; the CPU copy holds LAYER_N² heights a layer (every 4th texel of the 1024²). */
export const LAYER_TILE_M = 2;
export const LAYER_N = 256;

/** The ground layers' heights on the CPU (groundLayers.height.bin), sampled as the GPU's vertex stage does. */
export class GroundLayersCpu {
  constructor(private readonly h: Uint16Array) {}

  /** Layer `layer`'s height (0–1) at the texel nearest (x, z): every 0.25 m vertex lands exactly on one. */
  height(layer: number, x: number, z: number): number {
    const t = (v: number): number => ((Math.round((v / LAYER_TILE_M) * LAYER_N) % LAYER_N) + LAYER_N) % LAYER_N;
    return this.h[layer * LAYER_N * LAYER_N + t(z) * LAYER_N + t(x)] / 65535;
  }
}

export const loadGroundLayersCpu = (bytes: ArrayBuffer): GroundLayersCpu => new GroundLayersCpu(new Uint16Array(bytes));

/**
 * The four layers' weights (sand, soil, limestone, track) from the cover (wet, sand, rock, heath) and the worn mask: the
 * track takes the worn share, the rest split the cover's.
 */
export function layerWeights(c: readonly [number, number, number, number], worn: number): [number, number, number, number] {
  const keep = 1 - worn;
  return [(c[0] + c[1]) * keep, c[3] * keep, c[2] * keep, worn];
}

/** The height blend: each weighted layer scores its height plus its weight; those within BLEND_SOFT of the best share. */
function blendedHeight(layers: GroundLayersCpu, w: readonly number[], x: number, z: number): number {
  const h = w.map((_, i) => layers.height(i, x, z));
  const score = w.map((wi, i) => (wi > 0 ? h[i] + wi : -Infinity));
  const top = Math.max(...score);
  const b = score.map((s) => Math.max(0, s - (top - BLEND_SOFT)));
  const sum = b.reduce((a, v) => a + v, 0) || 1;
  return b.reduce((a, bi, i) => a + (bi / sum) * (w[i] > 0 ? h[i] : 0), 0);
}

/** The relief (m) at (x, z): the blended height about its middle, × RELIEF_M, flattened by the worn mask and `edge`. */
export function reliefAt(layers: GroundLayersCpu, cover: readonly [number, number, number, number], worn: number, x: number, z: number, edge: number): number {
  if (worn >= 1) return 0;
  return (blendedHeight(layers, layerWeights(cover, worn), x, z) - 0.5) * RELIEF_M * (1 - worn) * edge;
}

function bilinear(g: PatchGrids, arr: Float32Array, ch: number, stride: number, x: number, z: number): number {
  const fx = Math.min(Math.max(x - g.cornerX, 0), PATCH_GRID_N - 1), fz = Math.min(Math.max(z - g.cornerZ, 0), PATCH_GRID_N - 1);
  const i = Math.min(Math.floor(fx), PATCH_GRID_N - 2), j = Math.min(Math.floor(fz), PATCH_GRID_N - 2), tx = fx - i, tz = fz - j;
  const v = (a: number, b: number): number => arr[(b * PATCH_GRID_N + a) * stride + ch];
  return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - tz) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * tz;
}

/** The fine patch's surface at (x, z) exactly as the GPU draws it (Task 17): base heights, relief, less the tracks' sink. */
export function patchSurfaceAt(g: PatchGrids, layers: GroundLayersCpu, tracks: TrackNetwork | null, x: number, z: number): number {
  const half = PATCH_SIZE_M / 2, cx = g.cornerX + half, cz = g.cornerZ + half;
  const edge = 1 - smoothstep(half - PATCH_FADE_M, half, Math.max(Math.abs(x - cx), Math.abs(z - cz)));
  const cover = [0, 1, 2, 3].map((c) => bilinear(g, g.cover, c, 4, x, z)) as [number, number, number, number];
  const worn = tracks ? tracks.wornAt(x, z) : 0;
  return bilinear(g, g.heights, 0, 1, x, z) + reliefAt(layers, cover, worn, x, z, edge) - (tracks ? tracks.sinkAt(x, z) : 0);
}
