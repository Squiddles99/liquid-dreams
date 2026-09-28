import { describe, expect, it } from 'vitest';
import { coverAt } from '../land/landCover';
import { readBakedLand } from '../land/bakedLand.testutil';
import { decodeLandFile } from '../land/landData';
import { LandHeight } from '../land/landHeight';
import { PATCH_GRID_N, PatchTracker, buildPatchGrids, patchCentre, patchVisible } from './groundPatch';

const land = new LandHeight(decodeLandFile(readBakedLand()));

describe('the ground patch', () => {
  it('snaps to 4 m and recentres only after an 8 m move', () => {
    expect(patchCentre(210.7, -41.9)).toEqual([212, -40]);
    const t = new PatchTracker();
    expect(t.update(210, -40)).toBe(true);
    expect(t.centre).toEqual([212, -40]);
    expect(t.update(219, -40)).toBe(false); // 7 m from the centre
    expect(t.update(221, -40)).toBe(true); // 9 m
    expect(t.centre).toEqual([220, -40]);
  });
  it('its height grid is the land\'s height at 1 m, and its cover grid the land\'s cover', () => {
    const g = buildPatchGrids(land, [212, -40]);
    expect(g.cornerX).toBe(180); expect(g.cornerZ).toBe(-72);
    for (const [i, j] of [[0, 0], [32, 32], [64, 10], [5, 60]]) {
      const x = g.cornerX + i, z = g.cornerZ + j, k = j * PATCH_GRID_N + i;
      expect(g.heights[k]).toBeCloseTo(land.heightAt(x, z), 3); // stored as f32
      const slope = 1 - 1 / Math.hypot(1, (land.heightAt(x + 1, z) - land.heightAt(x - 1, z)) / 2, (land.heightAt(x, z + 1) - land.heightAt(x, z - 1)) / 2);
      const c = coverAt(x - land.waterlineAt(z), slope, x, z, g.heights[k], land.profile);
      expect(g.cover[k * 4 + 3]).toBeCloseTo(c.heath, 5);
      expect(g.detail[k * 4 + 2]).toBeCloseTo(c.weed, 5);
      expect(g.zones[k * 4]).toBeCloseTo(c.toeBand, 5);
    }
  });
  it('a recentre reuses the samples the old square shares with the new one, and computes the rest', () => {
    const prev = buildPatchGrids(land, [212, -40]);
    const fresh = buildPatchGrids(land, [220, -44]);
    expect(buildPatchGrids(land, [220, -44], prev)).toEqual(fresh);
    // Mark a shared sample: the new build carries it (reused, not recomputed).
    prev.heights[10 * PATCH_GRID_N + 20] = -999; // (200, −62) in the old square = (i 12, j 14) in the new one
    const moved = buildPatchGrids(land, [220, -44], prev);
    expect(moved.heights[14 * PATCH_GRID_N + 12]).toBe(-999);
    expect(moved.heights[14 * PATCH_GRID_N + 64]).toBeCloseTo(land.heightAt(252, -62), 3); // outside the old square
  });
  it('shows in walk mode, or when the camera is within 3 m of the ground', () => {
    expect(patchVisible('walk', 100, 0)).toBe(true);
    expect(patchVisible('free', 2.5, 0)).toBe(true);
    expect(patchVisible('free', 30, 0)).toBe(false);
    expect(patchVisible('lineup', 1, Number.NaN)).toBe(false);
  });
});
