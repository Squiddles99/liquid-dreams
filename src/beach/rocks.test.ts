import { describe, expect, it } from 'vitest';
import { readBakedLand } from '../land/bakedLand.testutil';
import { decodeLandFile } from '../land/landData';
import { LandHeight } from '../land/landHeight';
import { coarseMeshHeightAt } from '../land/landMesh';
import { ROCK_BAND_M, ROCK_GONE_M, ROCK_FULL_M, RockField, cellRocks, rockScale, rockShapeGeometry } from './rocks';

const land = new LandHeight(decodeLandFile(readBakedLand()));

describe('rock shapes', () => {
  it('are closed, roughly unit-sized, flattened underneath, and differ by shape', () => {
    const a = rockShapeGeometry(0), b = rockShapeGeometry(1);
    expect(a.indices.length).toBe(1280 * 3);
    let minY = Infinity, maxR = 0;
    for (let i = 0; i < a.positions.length; i += 3) {
      minY = Math.min(minY, a.positions[i + 1]);
      maxR = Math.max(maxR, Math.hypot(a.positions[i], a.positions[i + 1], a.positions[i + 2]));
    }
    expect(minY).toBeCloseTo(-0.6, 6);
    expect(maxR).toBeLessThan(1.5);
    expect(Array.from(a.positions.slice(0, 30))).not.toEqual(Array.from(b.positions.slice(0, 30)));
  });
});

describe('rock placement', () => {
  it('is deterministic per cell and independent of the camera', () => {
    expect(cellRocks(52, -10, land, 1)).toEqual(cellRocks(52, -10, land, 1));
    const f1 = new RockField(land, 1), f2 = new RockField(land, 1);
    const a = f1.near(210, -40).filter((r) => Math.hypot(r.x - 210, r.z + 40) < 50);
    f2.near(400, 200);
    const b = f2.near(210, -40).filter((r) => Math.hypot(r.x - 210, r.z + 40) < 50);
    expect(a).toEqual(b);
  });
  it('puts rocks where the cover says rock, of the right kind, and none on the open beach or in the heath', () => {
    const rocks = new RockField(land, 1).near(210, -40);
    expect(rocks.length).toBeGreaterThan(50);
    for (const r of rocks) {
      const d = r.x - land.waterlineAt(r.z);
      if (r.kind === 'toe') { expect(d).toBeGreaterThan(36); expect(d).toBeLessThan(60); }
      if (r.kind === 'shore') expect(d).toBeLessThan(10);
      expect(d < 12 || d > 36).toBe(true); // not on the dry beach between the wet band and the toe
      expect(d).toBeGreaterThanOrEqual(ROCK_BAND_M[0]);
      expect(d).toBeLessThanOrEqual(ROCK_BAND_M[1]); // only the rock bands, not the heath beyond the dune face
    }
    expect(rocks.some((r) => r.kind === 'toe')).toBe(true);
  });
  it('on a slope a rock is seated: its flat base lies below the ground all round its footprint (none float downhill)', () => {
    const rocks = new RockField(land, 1).near(210, -40);
    let worst = -Infinity;
    for (const r of rocks) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const px = r.x + Math.cos(a) * r.radius * 0.8, pz = r.z + Math.sin(a) * r.radius * 0.8;
        // Below the true ground (the patch) and the coarse mesh (beyond the patch) alike (final review I2).
        worst = Math.max(worst, r.y - Math.min(land.heightAt(px, pz), coarseMeshHeightAt(land, px, pz)));
      }
    }
    expect(worst).toBeLessThanOrEqual(0);
  });
  it('rock density scales the count (0 → none)', () => {
    const n = (d: number) => new RockField(land, d).near(210, -40).length;
    expect(n(0)).toBe(0);
    expect(n(2)).toBeGreaterThan(n(1) * 1.4);
  });
  it('a rock\'s top is highest at its centre and meets the ground at its edge', () => {
    const f = new RockField(land, 1);
    const r = f.near(210, -40).find((q) => q.kind === 'toe')!;
    expect(f.topAt(r.x, r.z)).toBeCloseTo(r.y + r.height, 3);
    expect(f.topAt(r.x + r.radius * 0.999, r.z)).toBeLessThan(r.y + r.height * 0.1);
    expect(f.topAt(r.x + r.radius * 1.5 + 5, r.z + 50)).toBe(-Infinity);
  });
  it('rocks shrink between 150 and 250 m', () => {
    expect(rockScale(ROCK_FULL_M)).toBe(1);
    expect(rockScale(ROCK_GONE_M)).toBe(0);
    expect(rockScale(200)).toBeGreaterThan(0);
    expect(rockScale(200)).toBeLessThan(1);
  });
});
