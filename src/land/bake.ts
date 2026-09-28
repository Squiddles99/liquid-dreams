import type { GridSpec } from './landData';

/**
 * The terrain bake (spec 2026-09-28-the-view-back-design.md §3, §4.1–4.2; plan rulings P1, P2, P5): terrarium tiles →
 * the land's height grids, the real waterline per row and the sky-view factor. Type-only imports (erased under Node's
 * type stripping), so tools/bakeTerrain.ts runs this under plain Node and vitest tests it directly.
 */
export const LAT0 = -33.895216;
export const LON0 = 114.983359;
export const M_PER_DEG_LAT = 111320;
export const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** 4 m, x ∈ [−800, 2400], z ∈ [−4000, 4000] (plan ruling P1: from −800, the coast 2–3 km north is west of 100). */
export const FINE_GRID: GridSpec = { x0: -800, z0: -4000, cellM: 4, nx: 801, nz: 2001 };
/** 32 m, x ∈ [−3000, 5992], z ∈ [−15000, 14984]: the outer ring (spec L1). */
export const RING_GRID: GridSpec = { x0: -3000, z0: -15000, cellM: 32, nx: 282, nz: 938 };
/** The sky-view factor: the fine grid's extent at 16 m (plan ruling P5). */
export const SKY_GRID: GridSpec = { x0: -800, z0: -4000, cellM: 16, nx: 201, nz: 501 };

export function worldToLatLon(x: number, z: number): [number, number] {
  return [LAT0 - z / M_PER_DEG_LAT, LON0 + x / M_PER_DEG_LON];
}

/** Fractional web-mercator tile coordinates at a zoom level. */
export function latLonToTile(lat: number, lon: number, zoom: number): [number, number] {
  const n = 2 ** zoom, r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
}

/** The whole tiles covering a grid's world box at a zoom. */
export function tileRange(g: GridSpec, zoom: number): { tx0: number; ty0: number; tx1: number; ty1: number } {
  const x1 = g.x0 + (g.nx - 1) * g.cellM, z1 = g.z0 + (g.nz - 1) * g.cellM;
  const [ax, ay] = latLonToTile(...worldToLatLon(g.x0, g.z0), zoom);
  const [bx, by] = latLonToTile(...worldToLatLon(x1, z1), zoom);
  return { tx0: Math.floor(Math.min(ax, bx)), ty0: Math.floor(Math.min(ay, by)), tx1: Math.floor(Math.max(ax, bx)), ty1: Math.floor(Math.max(ay, by)) };
}

/** Whole tiles at one zoom decoded to heights (m), row-major over (cols·256) × (rows·256) pixels. */
export interface TileMosaic {
  zoom: number;
  tx0: number;
  ty0: number;
  cols: number;
  rows: number;
  heights: Float32Array;
}

/** Bilinear height at world (x, z), between pixel centres; NaN outside the mosaic. */
export function sampleMosaic(m: TileMosaic, x: number, z: number): number {
  const [tx, ty] = latLonToTile(...worldToLatLon(x, z), m.zoom);
  const w = m.cols * 256, h = m.rows * 256;
  const px = (tx - m.tx0) * 256 - 0.5, py = (ty - m.ty0) * 256 - 0.5;
  if (!(px >= 0 && py >= 0 && px <= w - 1 && py <= h - 1)) return NaN;
  const i = Math.min(w - 2, Math.floor(px)), j = Math.min(h - 2, Math.floor(py));
  const fx = px - i, fy = py - j, k = j * w + i, H = m.heights;
  return (H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fy) + (H[k + w] * (1 - fx) + H[k + w + 1] * fx) * fy;
}

/** The mosaic resampled onto a grid (NaN → 0). */
export function sampleGrid(m: TileMosaic, g: GridSpec): Float32Array {
  const out = new Float32Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const h = sampleMosaic(m, g.x0 + i * g.cellM, g.z0 + j * g.cellM);
      out[j * g.nx + i] = Number.isFinite(h) ? h : 0;
    }
  }
  return out;
}

/** Bilinear sampler over a grid's samples; 0 outside it. */
export function gridSampler(g: GridSpec, h: ArrayLike<number>): (x: number, z: number) => number {
  return (x, z) => {
    const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
    if (!(fx >= 0 && fz >= 0 && fx <= g.nx - 1 && fz <= g.nz - 1)) return 0;
    const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz));
    const tx = fx - i, tz = fz - j, k = j * g.nx + i;
    return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + g.nx] * (1 - tx) + h[k + g.nx + 1] * tx) * tz;
  };
}

/** SRTM's water mask leaves a trough below this at the true coast (plan ruling P2). */
export const SEA_TROUGH_M = 0.5;
/** A row's land has clearly begun once its height passes this. */
export const LAND_RISE_M = 10;
/** Without a trough, the waterline is the crossing of this height nearest the rise. */
export const FALLBACK_CROSS_M = 3;
/** The trough is only looked for this far seaward of the rise: further out it's the open sea beyond the smear. */
export const TROUGH_SEARCH_M = 150;

/**
 * The real waterline along one row (heights west → east, `cellM` apart from `x0`): the first sample above LAND_RISE_M,
 * then back west (at most TROUGH_SEARCH_M) to the nearest sample below SEA_TROUGH_M; the waterline is one cell east of it.
 * Without a trough that close (the smear runs straight into the land), the FALLBACK_CROSS_M crossing nearest the rise.
 * NaN for a row with no land.
 */
export function rowWaterline(row: ArrayLike<number>, x0: number, cellM: number): number {
  let rise = -1;
  for (let i = 0; i < row.length; i++) if (row[i] > LAND_RISE_M) { rise = i; break; }
  if (rise < 0) return NaN;
  const stop = Math.max(0, rise - Math.round(TROUGH_SEARCH_M / cellM));
  for (let i = rise; i >= stop; i--) if (row[i] < SEA_TROUGH_M) return x0 + (i + 1) * cellM;
  for (let i = rise; i >= 0; i--) if (row[i] <= FALLBACK_CROSS_M) return x0 + (i + 1) * cellM;
  return x0;
}

/** Median over `half` samples each side, ignoring NaN (NaN only where the whole window is NaN). */
export function medianFilter(a: Float32Array, half: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const w: number[] = [];
    for (let k = Math.max(0, i - half); k <= Math.min(a.length - 1, i + half); k++) if (Number.isFinite(a[k])) w.push(a[k]);
    if (w.length === 0) { out[i] = NaN; continue; }
    w.sort((p, q) => p - q);
    out[i] = w.length % 2 ? w[(w.length - 1) / 2] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2;
  }
  return out;
}

/** Each row's waterline, median-filtered over ±`half` rows. */
export function gridWaterlines(g: GridSpec, h: Float32Array, half: number): Float32Array {
  const raw = new Float32Array(g.nz);
  for (let j = 0; j < g.nz; j++) raw[j] = rowWaterline(h.subarray(j * g.nx, (j + 1) * g.nx), g.x0, g.cellM);
  return medianFilter(raw, half);
}

const SKY_DIRS = 8;
const SKY_STEPS = 12;

/**
 * The fraction of the sky a point 1 m above the ground sees: over 8 directions, the mean of 1 − sin(max(0, horizon)),
 * with the horizon found at 16 m to ~1 km (16·1.45^k). 1 on open ground; lower in gullies and at the foot of slopes.
 */
export function skyViewGrid(sample: (x: number, z: number) => number, g: GridSpec): Float32Array {
  const out = new Float32Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.cellM, z = g.z0 + j * g.cellM;
      const h0 = Math.max(sample(x, z), 0) + 1;
      let sum = 0;
      for (let d = 0; d < SKY_DIRS; d++) {
        const a = (d / SKY_DIRS) * 2 * Math.PI, dx = Math.cos(a), dz = Math.sin(a);
        let best = 0;
        for (let k = 0; k < SKY_STEPS; k++) {
          const r = 16 * 1.45 ** k;
          best = Math.max(best, Math.atan((sample(x + dx * r, z + dz * r) - h0) / r));
        }
        sum += 1 - Math.sin(best);
      }
      out[j * g.nx + i] = sum / SKY_DIRS;
    }
  }
  return out;
}
