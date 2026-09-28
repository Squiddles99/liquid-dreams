import { smoothstep } from '../math/smoothstep';
import { SUN_ANGULAR_RADIUS_RAD } from '../sky/Sky';
import type { GridSpec } from './landData';

/** The sunlight map's texels (spec §4.8): centre of texel (i, j) at x0 + (i + 0.5)·cell, z0 + (j + 0.5)·cell. */
export const SUN_GRID: GridSpec = { x0: -600, z0: -4000, cellM: 8, nx: 375, nz: 1000 };
/** The heights the march reads: sample (i, j) at x0 + i·cell (reaches 4 km toward the morning sun from the lineup). */
export const MARCH_GRID: GridSpec = { x0: -600, z0: -6000, cellM: 8, nx: 826, nz: 1501 };
export const MARCH_STEPS = 48;
export const MARCH_MIN_M = 8;
export const MARCH_MAX_M = 4000;
/** The shadow's soft edge: the sun's disc plus about one terrain cell's angle. */
export const SUN_SOFT_RAD = SUN_ANGULAR_RADIUS_RAD + 0.004;
/** Rebuild the map when the sun has moved this far (0.05°: about 12 s of sim time). */
export const SUN_REBUILD_RAD = (0.05 * Math.PI) / 180;
/** The eye of each texel: this far above the ground (or the sea). */
const EYE_M = 0.5;

export function marchDistance(i: number): number {
  return MARCH_MIN_M * (MARCH_MAX_M / MARCH_MIN_M) ** (i / (MARCH_STEPS - 1));
}

/** max(height, 0) at every MARCH_GRID sample (the sea blocks no sun). */
export function buildMarchHeights(heightAt: (x: number, z: number) => number): Float32Array {
  const g = MARCH_GRID, out = new Float32Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) out[j * g.nx + i] = Math.max(0, heightAt(g.x0 + i * g.cellM, g.z0 + j * g.cellM));
  return out;
}

/** Bilinear between samples, clamped to the grid's edge (the GPU's clamp-to-edge filtering at (g + 0.5)/size). */
export function sampleMarch(h: Float32Array, x: number, z: number): number {
  const g = MARCH_GRID;
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM)), fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM));
  const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - i, tz = fz - j, k = j * g.nx + i;
  return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + g.nx] * (1 - tx) + h[k + g.nx + 1] * tx) * tz;
}

/** The fraction of the sun's disc a point sees over the land (CPU reference of SunlightMap's pass). */
export function sunVisibility(h: Float32Array, x: number, z: number, sun: readonly [number, number, number]): number {
  const horiz = Math.hypot(sun[0], sun[2]);
  if (horiz < 1e-3) return sun[1] > 0 ? 1 : 0;
  const dx = sun[0] / horiz, dz = sun[2] / horiz, h0 = sampleMarch(h, x, z) + EYE_M;
  let maxTan = -1e3;
  for (let i = 0; i < MARCH_STEPS; i++) {
    const s = marchDistance(i);
    maxTan = Math.max(maxTan, (sampleMarch(h, x + dx * s, z + dz * s) - h0) / s);
  }
  const elev = Math.asin(Math.max(-1, Math.min(1, sun[1])));
  return smoothstep(-SUN_SOFT_RAD, SUN_SOFT_RAD, elev - Math.atan(maxTan));
}

/** True when the angle between two sun directions exceeds the threshold. */
export function sunMoved(last: readonly [number, number, number], now: readonly [number, number, number], thresholdRad: number): boolean {
  const la = Math.hypot(...last), na = Math.hypot(...now);
  const c = (last[0] * now[0] + last[1] * now[1] + last[2] * now[2]) / (la * na);
  return Math.acos(Math.max(-1, Math.min(1, c))) > thresholdRad;
}
