import { describe, expect, it } from 'vitest';
import { PLANT_KINDS, PLANT_LODS, PLANT_SHAPES, plantShapeGeometry } from './plants';

describe('plant shapes', () => {
  it('have 320, 80 and 20 triangles at the three levels of detail', () => {
    for (const kind of PLANT_KINDS) {
      expect([0, 1, 2].map((lod) => plantShapeGeometry(kind, 0, lod).indices.length / 3)).toEqual([320, 80, 20]);
    }
  });
  it('are closed surfaces (every edge shared by exactly two triangles)', () => {
    for (const lod of [0, 1, 2]) {
      const g = plantShapeGeometry('daisy', 1, lod);
      const edges = new Map<string, number>();
      for (let f = 0; f < g.indices.length; f += 3) {
        for (let e = 0; e < 3; e++) {
          const a = g.indices[f + e], b = g.indices[f + ((e + 1) % 3)];
          const k = a < b ? `${a},${b}` : `${b},${a}`;
          edges.set(k, (edges.get(k) ?? 0) + 1);
        }
      }
      for (const n of edges.values()) expect(n).toBe(2);
    }
  });
  it('are unit plants: flat bottom at 0, top about 1, footprint within radius 1', () => {
    for (const kind of PLANT_KINDS) {
      for (let shape = 0; shape < PLANT_SHAPES; shape++) {
        for (let lod = 0; lod < PLANT_LODS; lod++) {
          const p = plantShapeGeometry(kind, shape, lod).positions;
          let minY = Infinity, maxY = -Infinity, maxR = 0;
          for (let i = 0; i < p.length; i += 3) {
            minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]); maxR = Math.max(maxR, Math.hypot(p[i], p[i + 2]));
          }
          expect(minY).toBeCloseTo(0, 6);
          expect(maxY).toBeLessThanOrEqual(1 + 1e-6);
          expect(maxY).toBeGreaterThan(lod === 0 ? 0.9 : 0.6);
          expect(maxR).toBeLessThanOrEqual(1 + 1e-6);
        }
      }
    }
  });
  it('differ by shape, and the three levels are one shape (a coarse level\'s vertices lie on the fine one)', () => {
    const a = plantShapeGeometry('green', 0, 0).positions, b = plantShapeGeometry('green', 1, 0).positions;
    expect(Array.from(a.slice(0, 36))).not.toEqual(Array.from(b.slice(0, 36)));
    // The icosphere's first 12 vertices are shared by every level: the same displaced positions.
    const fine = plantShapeGeometry('green', 2, 0).positions, coarse = plantShapeGeometry('green', 2, 2).positions;
    for (let i = 0; i < 36; i++) expect(coarse[i]).toBeCloseTo(fine[i], 5);
  });
});

import { readBakedLand } from '../land/bakedLand.testutil';
import { decodeLandFile } from '../land/landData';
import { LandHeight } from '../land/landHeight';
import { TrackNetwork, routeTracks } from '../land/tracks';
import { coverAt } from '../land/landCover';
import { coarseMeshHeightAt } from '../land/landMesh';
import { RockField } from '../beach/rocks';
import { LOD_CAPACITY, PLANT_GONE_M, PLANT_SPECS, PlantField, cellPlants, plantLod, plantScale } from './plants';

const land = new LandHeight(decodeLandFile(readBakedLand()));
const coverHere = (x: number, z: number) => {
  const slope = 1 - 1 / Math.hypot(1, (land.heightAt(x + 1, z) - land.heightAt(x - 1, z)) / 2, (land.heightAt(x, z + 1) - land.heightAt(x, z - 1)) / 2);
  return coverAt(x - land.waterlineAt(z), slope, x, z, land.heightAt(x, z), land.profile);
};

describe('plant placement', () => {
  const rocks = new RockField(land, 1);
  const plants = new PlantField(land, rocks, 1).near(210, -40);
  it('is deterministic per cell and independent of the camera', () => {
    expect(cellPlants(70, -10, land, rocks, 1)).toEqual(cellPlants(70, -10, land, rocks, 1));
    const other = new PlantField(land, new RockField(land, 1), 1);
    other.near(400, 300);
    const a = plants.filter((p) => Math.hypot(p.x - 260, p.z + 40) < 40);
    const b = other.near(210, -40).filter((p) => Math.hypot(p.x - 260, p.z + 40) < 40);
    expect(a).toEqual(b);
  });
  it('puts nothing on the beach, the wet band, the toe\'s rock band or the shore platform', () => {
    for (const p of plants) {
      const c = coverHere(p.x, p.z);
      expect(c.heath).toBeGreaterThan(0);
      expect(p.x - land.waterlineAt(p.z)).toBeGreaterThan(45);
    }
  });
  it('has about one shrub per 1.6 m² (near-closed, as from above: dune-up-close §4.5), one low plant per 12 m² and one dead shrub per 25 m² on full heath, in the specified mix', () => {
    // Plants on full heath (heath − bushes > 0.95) within a 150 m circle, against that area (sampled on a 2 m grid).
    let area = 0;
    for (let x = 60; x <= 360; x += 2) for (let z = -190; z <= 110; z += 2) {
      if (Math.hypot(x - 210, z + 40) > 150) continue;
      const c = coverHere(x, z);
      if (c.heath - c.bushes > 0.95) area += 4;
    }
    const onFull = plants.filter((p) => Math.hypot(p.x - 210, p.z + 40) <= 150 && (() => { const c = coverHere(p.x, p.z); return c.heath - c.bushes > 0.95; })());
    const shrubs = onFull.filter((p) => p.kind === 'daisy' || p.kind === 'green' || p.kind === 'tall');
    const dead = onFull.filter((p) => p.kind === 'dead').length;
    const low = onFull.length - shrubs.length - dead;
    expect(area).toBeGreaterThan(5000);
    expect(shrubs.length / area).toBeGreaterThan((1 / 1.6) * 0.75);
    expect(shrubs.length / area).toBeLessThan((1 / 1.6) * 1.25);
    expect(dead / area).toBeGreaterThan((1 / 25) * 0.75);
    expect(dead / area).toBeLessThan((1 / 25) * 1.25);
    expect(low / area).toBeGreaterThan((1 / 12) * 0.75);
    expect(low / area).toBeLessThan((1 / 12) * 1.25);
    const share = (k: string) => shrubs.filter((p) => p.kind === k).length / shrubs.length;
    expect(share('daisy')).toBeCloseTo(0.5, 1);
    expect(share('green')).toBeCloseTo(0.43, 1);
    expect(share('tall')).toBeGreaterThan(0.02);
    expect(share('tall')).toBeLessThan(0.12);
  });
  it('puts dune-rise shrubs only where the cover has bushes, daisy and green only', () => {
    const rise = plants.filter((p) => { const c = coverHere(p.x, p.z); return c.bushes > c.heath - c.bushes; });
    expect(rise.length).toBeGreaterThan(20);
    for (const p of rise) expect(['daisy', 'green', 'pigface', 'rice']).toContain(p.kind);
  });
  it('sizes each plant within its kind\'s range and seats it below both surfaces', () => {
    for (const p of plants.slice(0, 400)) {
      const s = PLANT_SPECS[p.kind];
      expect(p.height).toBeGreaterThanOrEqual(s.heightM[0]); expect(p.height).toBeLessThanOrEqual(s.heightM[1]);
      expect(p.width).toBeGreaterThanOrEqual(s.widthM[0]); expect(p.width).toBeLessThanOrEqual(s.widthM[1]);
      expect(p.yTrue).toBeLessThanOrEqual(land.heightAt(p.x, p.z) - 0.15 * p.height + 1e-6);
      expect(p.yCoarse).toBeLessThanOrEqual(coarseMeshHeightAt(land, p.x, p.z) - 0.15 * p.height + 1e-6);
    }
  });
  it('keeps clear of the rocks, and clear() re-places around the rock field\'s current rocks', () => {
    for (const p of plants) expect(rocks.covers(p.x, p.z, 0.2)).toBe(false);
    const dense = new RockField(land, 2);
    const field = new PlantField(land, dense, 1);
    field.near(250, -40);
    dense.setDensity(0);
    field.clear();
    const after = field.near(250, -40);
    expect(after.some((p) => new RockField(land, 2).covers(p.x, p.z, 0.2))).toBe(true); // ground the old rocks held
  });
  it('bush density scales the count; 0 gives none', () => {
    const n = (d: number) => new PlantField(land, rocks, d).near(210, -40).length;
    expect(n(0)).toBe(0);
    expect(n(2)).toBeGreaterThan(n(1) * 1.4);
  });
  it('shrinks from 150 to 200 m and picks its level of detail by distance', () => {
    expect(plantScale(150)).toBe(1);
    expect(plantScale(PLANT_GONE_M)).toBe(0);
    expect([plantLod(10), plantLod(40), plantLod(120)]).toEqual([0, 1, 2]);
  });
  it('over the inland heath (Review Focus 1) each level\'s meshes hold the plants at density 1', () => {
    const inland = new PlantField(land, null, 1).near(700, 0);
    const counts = new Map<string, number>();
    for (const p of inland) {
      const k = `${p.kind}:${p.shape}:${plantLod(Math.hypot(p.x - 700, p.z))}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, c] of counts) expect(c, k).toBeLessThanOrEqual(LOD_CAPACITY[Number(k.split(':')[2])]);
  });
});

import { plantCaster } from './plants';
describe('plants and the tracks (dune-up-close §4.5)', () => {
  const tracked = new LandHeight(decodeLandFile(readBakedLand()));
  tracked.setTracks(new TrackNetwork(routeTracks(tracked, tracked.fineZRange())));
  const net = tracked.trackNetwork!;
  it('plants nothing with its trunk or crown on a corridor, or in the clearing', () => {
    const j = net.data.junction;
    const near = new PlantField(tracked, null, 1).near(j.x, j.z).filter((p) => Math.hypot(p.x - j.x, p.z - j.z) < 60);
    expect(near.length).toBeGreaterThan(200);
    for (const p of near) {
      expect(net.inClearing(p.x, p.z)).toBe(false);
      const n = net.nearest(p.x, p.z);
      expect(n.d).toBeGreaterThan(n.halfWidthM + p.width / 2 - 1e-9);
    }
  });
  it('grows no dead shrubs on the dune rise', () => {
    for (const p of new PlantField(tracked, null, 1).near(260, -40)) {
      if (p.kind !== 'dead') continue;
      const c = coverHere(p.x, p.z);
      expect(c.heath - c.bushes).toBeGreaterThan(c.bushes);
    }
  });
});

describe('plants as shadow casters', () => {
  it('shrubs cast at 0.6; pigface and rice-flower cast the ring only', () => {
    const base = { x: 0, z: 0, shape: 0, width: 2, height: 1, yTrue: 0, yCoarse: 0, yaw: 0, cosYaw: 1, sinYaw: 0, seed: 0, tint: [0, 0, 0] as [number, number, number] };
    expect(plantCaster({ ...base, kind: 'daisy' })).toEqual({ x: 0, z: 0, radius: 1, height: 1, strength: 0.6, ringOnly: false, maxLenM: 4 });
    expect(plantCaster({ ...base, kind: 'pigface' }).ringOnly).toBe(true);
  });
});

import { SHADOW_N, SHADOW_CELL_M } from '../beach/rockShadows';
import { SUN_SHADOW_RANGE_M, patchCasters } from './plants';

describe('the plant casters for the patch (final review I1: the shadow rebuild stays cheap on the heath)', () => {
  it('only plants within SUN_SHADOW_RANGE_M of the camera cast, with shadows capped at 4 m', () => {
    const field = new PlantField(land, null, 1);
    const plants = field.near(320, -40);
    const casters = patchCasters(plants, [320, -40], 320, -40);
    const half = (SHADOW_N * SHADOW_CELL_M) / 2;
    expect(casters.length).toBeGreaterThan(100);
    expect(casters.length).toBeLessThan(700);
    for (const c of casters) {
      expect(Math.hypot(c.x - 320, c.z + 40)).toBeLessThanOrEqual(SUN_SHADOW_RANGE_M);
      expect(c.maxLenM).toBe(4);
    }
    void half;
  });
});

describe('the plant cache (final review I2)', () => {
  // The flight walks 334 cache refreshes (each gathers ~7,850 cells within 200 m) and sweeps ~50,000 cells, well past
  // the 12,000-cell trim: ~2 s alone, but several times that when the whole suite runs in parallel, hence the timeout.
  it('stays bounded while the camera flies 2 km over the heath', () => {
    const field = new PlantField(land, null, 1);
    let trims = 0, last = 0;
    for (let x = 400; x <= 2400; x += 6) {
      field.near(x, 0);
      if (field.cachedCells < last) trims++;
      last = field.cachedCells;
    }
    expect(trims).toBeGreaterThan(0);
    expect(field.cachedCells).toBeLessThan(12000);
    // and what's near is still right after eviction
    expect(field.near(2400, 0)).toEqual(new PlantField(land, null, 1).near(2400, 0));
  }, 30_000);
});
