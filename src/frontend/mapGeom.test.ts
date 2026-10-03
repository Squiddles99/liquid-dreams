// src/frontend/mapGeom.test.ts
import { describe, expect, it } from 'vitest';
import { MAP, bilinear, contours, simplify, swellCrests, swellLabel, toPath, windArrows, windLabel, worldToMap, mapCentre } from './mapGeom';
import { presetById, FIRST_PRESET } from './sessionSetup';

describe('the map geometry (spec §7)', () => {
  it('samples a grid bilinearly, null outside it', () => {
    const grid = { x0: 0, z0: 0, cellM: 10, nx: 2, nz: 2 }, v = new Float32Array([0, 10, 20, 30]);
    expect(bilinear(grid, v, 5, 5)).toBeCloseTo(15, 6);
    expect(bilinear(grid, v, -1, 5)).toBeNull();
  });
  it('traces a padded circle field into one closed ring at the right radius', () => {
    const n = 41, v = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = 15 - Math.hypot(i - 20, j - 20);
    const rings = contours(v, n, n, 5);
    expect(rings.length).toBe(1);
    const r = rings[0];
    expect(r[0]).toEqual(r[r.length - 1]);
    for (const [x, y] of r) expect(Math.hypot(x - 20, y - 20)).toBeCloseTo(10, 0);
  });
  it('stops a contour where the samples stop (NaN), with no line along the hole edge', () => {
    const n = 21, v = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = i >= 15 ? NaN : i - 5.5;
    const lines = contours(v, n, n, 0);
    expect(lines.length).toBe(1);
    for (const [x] of lines[0]) expect(x).toBeCloseTo(5.5, 6);
    const hole = contours(v.map((x) => (Number.isNaN(x) ? x : 1)), n, n, 0);
    expect(hole).toEqual([]);
  });
  it('simplifies a straight run to its ends and keeps a corner', () => {
    expect(simplify([[0, 0], [1, 0.01], [2, 0], [3, 0.01], [4, 0]], 0.1)).toEqual([[0, 0], [4, 0]]);
    expect(simplify([[0, 0], [2, 0], [2, 2]], 0.1)).toEqual([[0, 0], [2, 0], [2, 2]]);
  });
  it('writes SVG paths', () => {
    expect(toPath([[[0, 0], [1, 2]]], false)).toBe('M0 0L1 2');
    expect(toPath([[[0, 0], [1, 2], [0, 0]]], true)).toBe('M0 0L1 2Z');
  });
  it('maps the world north-up: east right, north (−z) up, the reef in the main view', () => {
    const c = mapCentre(), [cx, cy] = worldToMap(c.x, c.z);
    expect(cx).toBeCloseTo((MAP.w - MAP.insetW) / 2, 6);
    expect(cy).toBeCloseTo(MAP.h / 2, 6);
    expect(worldToMap(c.x + 27.5, c.z)[0]).toBeCloseTo(cx + 10, 6);
    expect(worldToMap(c.x, c.z - 27.5)[1]).toBeCloseTo(cy - 10, 6);
  });
  it('draws three swell crests square to the direction, spaced by the period, heavier with size', () => {
    const a = swellCrests(225, 10, 3), b = swellCrests(225, 16, 3), big = swellCrests(225, 10, 8);
    expect(a.lines.length).toBe(3);
    const dir = (l: [number, number][]) => Math.atan2(l[1][1] - l[0][1], l[1][0] - l[0][0]);
    const travel = Math.atan2(a.arrow[1][1] - a.arrow[0][1], a.arrow[1][0] - a.arrow[0][0]);
    expect(Math.abs(Math.cos(dir(a.lines[0]) - travel))).toBeLessThan(1e-6);
    const gap = (c: typeof a) => Math.hypot(c.lines[1][0][0] - c.lines[0][0][0], c.lines[1][0][1] - c.lines[0][0][1]);
    expect(gap(b)).toBeGreaterThan(gap(a));
    expect(big.widths[0]).toBeGreaterThan(a.widths[0]);
    expect(a.opacities[0]).toBeGreaterThan(a.opacities[2]);
  });
  it('shows no wind arrows when glassy, and labels swell and wind like a surf report', () => {
    expect(windArrows(90, 0).glassy).toBe(true);
    expect(windArrows(90, 6).arrows.length).toBeGreaterThan(2);
    const s = presetById(FIRST_PRESET)!.setup;
    expect(swellLabel(s)).toMatch(/^[NESW]{1,3} · \d+(½)? FT · \d+ S$/);
    expect(windLabel(s)).toBe('E · LIGHT OFFSHORE');
    expect(windLabel({ ...s, wind: 0 })).toBe('GLASSY');
  });
});
