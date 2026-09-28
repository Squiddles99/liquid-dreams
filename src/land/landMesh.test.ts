import { describe, expect, it } from 'vitest';
import { readBakedLand } from './bakedLand.testutil';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { MESH_LEVELS, SEAWARD_M, buildLandMesh } from './landMesh';

const land = new LandHeight(decodeLandFile(readBakedLand()));
const mesh = buildLandMesh(land);

describe('the land mesh', () => {
  it('nests each level inside the next, on the next level\'s cell grid', () => {
    for (let k = 0; k + 1 < MESH_LEVELS.length; k++) {
      const a = MESH_LEVELS[k], b = MESH_LEVELS[k + 1];
      expect(b.cellM).toBe(2 * a.cellM);
      for (const v of a.box) expect(Math.abs(v % b.cellM)).toBe(0); // abs: −128 % 8 is −0
      expect(a.box[0]).toBeGreaterThanOrEqual(b.box[0]); expect(a.box[1]).toBeGreaterThanOrEqual(b.box[1]);
      expect(a.box[2]).toBeLessThanOrEqual(b.box[2]); expect(a.box[3]).toBeLessThanOrEqual(b.box[3]);
    }
  });
  it('stays within the triangle budget (plan ruling P6)', () => {
    expect(mesh.triangles).toBeLessThanOrEqual(750_000);
    expect(mesh.indices.length).toBe(mesh.triangles * 3);
  });
  it('matches the composed height at its vertices (except stitched edge vertices)', () => {
    let within = 0, n = 0;
    for (let v = 0; v < mesh.positions.length / 3; v += 997) {
      const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
      n++;
      if (Math.abs(y - land.heightAt(x, z)) < 1e-3) within++;
    }
    expect(within / n).toBeGreaterThan(0.95);
  });
  it('keeps its seaward edge under water at the lowest tide (−1.5 m)', () => {
    // every vertex further than SEAWARD_M − 1 m seaward of the waterline is below −1.8 m
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const x = mesh.positions[v * 3], z = mesh.positions[v * 3 + 2];
      if (x - land.waterlineAt(z) < -(SEAWARD_M - 1)) expect(mesh.positions[v * 3 + 1]).toBeLessThan(-1.8);
    }
  });
  it('carries skyView, rockGrey and weed per vertex', () => {
    expect(mesh.detail.length).toBe(mesh.positions.length);
    expect(mesh.zones.length).toBe((mesh.positions.length / 3) * 4);
    for (let v = 0; v < mesh.detail.length / 3; v += 997) expect(mesh.detail[v * 3 + 2]).toBeGreaterThanOrEqual(0);
  });
  it('has unit normals and cover weights summing to 1', () => {
    for (let v = 0; v < mesh.positions.length / 3; v += 1013) {
      expect(Math.hypot(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2])).toBeCloseTo(1, 4);
      expect(mesh.cover[v * 4] + mesh.cover[v * 4 + 1] + mesh.cover[v * 4 + 2] + mesh.cover[v * 4 + 3]).toBeCloseTo(1, 4);
    }
  });
  it('has no cracks: every stitched edge vertex lies on the coarse edge between its neighbours', () => {
    // For each level but the last, sample its outer boundary and compare with the straight line between the even vertices.
    for (let k = 0; k + 1 < MESH_LEVELS.length; k++) {
      const { cellM, box } = MESH_LEVELS[k];
      const z = box[1], y = (x: number) => land.heightAt(x, z);
      for (let x = box[0] + cellM; x < box[2]; x += 2 * cellM * 17) {
        const want = (y(x - cellM) + y(x + cellM)) / 2;
        const got = findVertexY(x, z);
        if (got !== null) expect(Math.abs(got - want)).toBeLessThan(1e-3);
      }
    }
  });
});

function findVertexY(x: number, z: number): number | null {
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    if (mesh.positions[v * 3] === x && mesh.positions[v * 3 + 2] === z) return mesh.positions[v * 3 + 1];
  }
  return null;
}
