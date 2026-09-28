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
