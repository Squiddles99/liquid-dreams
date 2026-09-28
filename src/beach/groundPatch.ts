import type { CameraMode } from '../dev/momentLink';
import { coverAt } from '../land/landCover';
import type { LandHeight } from '../land/landHeight';
import { coarseMeshHeightAt } from '../land/landMesh';
import { smoothstep } from '../math/smoothstep';

/** The fine ground at your feet (spec 2026-09-28-on-the-beach-design.md §3.2). */
export const PATCH_SIZE_M = 64;
export const PATCH_CELL_M = 0.25;
export const PATCH_VERTS = 257;
export const PATCH_SNAP_M = 4;
export const PATCH_REFRESH_M = 8;
export const PATCH_GRID_N = 65;
/** The grids' sample spacing (m). */
const PATCH_CELL_GRID_M = PATCH_SIZE_M / (PATCH_GRID_N - 1);
export const PATCH_SKIRT_M = 0.5;
export const PATCH_FADE_M = 4;
export const PATCH_NEAR_M = 3;
export const PATCH_HOLE_INSET_M = 0.5;

export function patchCentre(x: number, z: number): [number, number] {
  return [Math.round(x / PATCH_SNAP_M) * PATCH_SNAP_M, Math.round(z / PATCH_SNAP_M) * PATCH_SNAP_M];
}

export class PatchTracker {
  centre: [number, number] | null = null;
  /** True when the patch must be rebuilt: the first time, or once the camera is PATCH_REFRESH_M from the centre. */
  update(x: number, z: number): boolean {
    if (this.centre && Math.hypot(x - this.centre[0], z - this.centre[1]) < PATCH_REFRESH_M) return false;
    this.centre = patchCentre(x, z);
    return true;
  }
}

export interface PatchGrids {
  cornerX: number;
  cornerZ: number;
  /**
   * The patch's heights at 1 m, PATCH_GRID_N² row-major (row = z): the composed land height, blended within PATCH_FADE_M of
   * the edge into the coarse land mesh's own surface so the two meet (final review I2).
   */
  heights: Float32Array;
  /** The composed land height at the same samples (unblended: what a recentre reuses). */
  raw: Float32Array;
  /** wet, sand, rock, heath per sample. */
  cover: Float32Array;
  /** skyView, rockGrey, weed, 0 per sample. */
  detail: Float32Array;
  /** toeBand, duneBand, clumpRock, bushes per sample. */
  zones: Float32Array;
}

/**
 * The patch's grids for the square around `centre`. With the previous square's grids, the samples the two share are
 * copied (an 8 m recentre keeps seven-eighths of them), and only the rest are computed.
 */
export function buildPatchGrids(land: LandHeight, centre: [number, number], prev?: PatchGrids): PatchGrids {
  const n = PATCH_GRID_N, cornerX = centre[0] - PATCH_SIZE_M / 2, cornerZ = centre[1] - PATCH_SIZE_M / 2;
  const heights = new Float32Array(n * n), raw = new Float32Array(n * n), cover = new Float32Array(n * n * 4), detail = new Float32Array(n * n * 4), zones = new Float32Array(n * n * 4);
  // The heights with a 1 m margin, so the slopes come from the grid (one heightAt per sample, not five).
  const m = n + 2, hm = new Float64Array(m * m);
  const pi = prev ? cornerX - prev.cornerX : 0, pj = prev ? cornerZ - prev.cornerZ : 0;
  /** The previous grid's index of this grid's sample (i, j), or −1 where the old square doesn't reach. */
  const old = (i: number, j: number): number => {
    if (!prev) return -1;
    const oi = i + pi, oj = j + pj;
    return oi >= 0 && oi < n && oj >= 0 && oj < n ? oj * n + oi : -1;
  };
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const o = old(i - 1, j - 1);
      hm[j * m + i] = o >= 0 ? prev!.raw[o] : land.heightAt(cornerX + i - 1, cornerZ + j - 1);
    }
  }
  for (let j = 0; j < n; j++) {
    const z = cornerZ + j, xs = land.waterlineAt(z);
    for (let i = 0; i < n; i++) {
      const x = cornerX + i, k = j * n + i, q = (j + 1) * m + i + 1;
      raw[k] = hm[q];
      const edgeM = Math.min(i, j, n - 1 - i, n - 1 - j) * PATCH_CELL_GRID_M;
      heights[k] = edgeM >= PATCH_FADE_M ? raw[k] : coarseMeshHeightAt(land, x, z) + (raw[k] - coarseMeshHeightAt(land, x, z)) * smoothstep(0, PATCH_FADE_M, edgeM);
      const o = old(i, j);
      if (o >= 0) {
        cover.set(prev!.cover.subarray(o * 4, o * 4 + 4), k * 4);
        detail.set(prev!.detail.subarray(o * 4, o * 4 + 4), k * 4);
        zones.set(prev!.zones.subarray(o * 4, o * 4 + 4), k * 4);
        continue;
      }
      const gx = (hm[q + 1] - hm[q - 1]) / 2, gz = (hm[q + m] - hm[q - m]) / 2;
      const slope = 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
      const c = coverAt(x - xs, slope, x, z, raw[k], land.profile);
      cover.set([c.wet, c.sand, c.rock, c.heath], k * 4);
      detail.set([land.skyViewAt(x, z), c.rockGrey, c.weed, 0], k * 4);
      zones.set([c.toeBand, c.duneBand, c.clumpRock, c.bushes], k * 4);
    }
  }
  return { cornerX, cornerZ, heights, raw, cover, detail, zones };
}

export function patchVisible(mode: CameraMode, camY: number, groundY: number): boolean {
  if (mode === 'walk') return true;
  return Number.isFinite(groundY) && camY - groundY < PATCH_NEAR_M;
}
