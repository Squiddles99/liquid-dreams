import { beforeAll, describe, expect, it } from 'vitest';
import { type Bathymetry, buildBathymetry } from './bathymetry';
import { COAST_CONTOURS, contourXAt, waterlineX } from './coastContours';
import { BOMBIE_CENTRE, BREAK_FOOTPRINTS, DEFAULT_COAST_PARAMS, ELLENSBROOK_BAR, LEFTHANDERS_LEDGE, insidePolygon } from './coastFeatures';
import { INNER_SHELF_DEEP, INNER_SHELF_M, WOMB_HALO_M, buildCoastMap, innerShelfM, wombHalo } from './coastMap';
import { COAST_GRID } from './coastProfile';
import { REEF_GRID } from './wombReef';

const G = COAST_GRID;
let reef: Bathymetry;
let coast: Bathymetry;

/** Depth (m, mid tide = datum) at the coast cell nearest (x, z). */
const depthAt = (b: Bathymetry, x: number, z: number): number => {
  const c = Math.round((x - G.x0) / G.cellM), r = Math.round((z - G.z0) / G.cellM);
  return -b.bed[r * G.nx + c];
};
/** Bilinear depth at (x, z). */
const depthBilinear = (b: Bathymetry, x: number, z: number): number => {
  const fx = (x - G.x0) / G.cellM, fz = (z - G.z0) / G.cellM;
  const c = Math.floor(fx), r = Math.floor(fz), tx = fx - c, tz = fz - r, i = r * G.nx + c;
  return -((b.bed[i] * (1 - tx) + b.bed[i + 1] * tx) * (1 - tz) + (b.bed[i + G.nx] * (1 - tx) + b.bed[i + G.nx + 1] * tx) * tz);
};

beforeAll(() => {
  reef = buildBathymetry();
  coast = buildCoastMap(reef, DEFAULT_COAST_PARAMS);
});

describe('the coast map (lineup truth, Task 1)', () => {
  it('is the coast grid, 4 m cells over 2 × 3.5 km (east to +500: Ellensbrook\'s beach is at x 360–470)', () => {
    expect(G).toEqual({ x0: -1500, z0: -2100, cellM: 4, nx: 501, nz: 875 });
    expect(coast.grid).toEqual(G);
    expect(coast.bed.length).toBe(G.nx * G.nz);
  });

  it('is deterministic', () => {
    const again = buildCoastMap(reef, DEFAULT_COAST_PARAMS);
    expect(Buffer.from(again.bed.buffer).equals(Buffer.from(coast.bed.buffer))).toBe(true);
  });

  it('is the reef map, block-averaged, inside its footprint (< 1 cm)', () => {
    const rg = REEF_GRID;
    let worst = 0, cells = 0;
    for (let r = 0; r < G.nz; r++) for (let c = 0; c < G.nx; c++) {
      const x = G.x0 + c * G.cellM, z = G.z0 + r * G.cellM;
      // The 8 × 8 reef cells whose centres lie in [x − 2, x + 2) × [z − 2, z + 2).
      const c0 = Math.round((x - 2 - rg.x0) / rg.cellM), r0 = Math.round((z - 2 - rg.z0) / rg.cellM);
      if (c0 < 0 || r0 < 0 || c0 + 8 > rg.nx || r0 + 8 > rg.nz) continue;
      let sum = 0;
      for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 8; dc++) sum += reef.bed[(r0 + dr) * rg.nx + c0 + dc];
      worst = Math.max(worst, Math.abs(coast.bed[r * G.nx + c] - sum / 64));
      cells++;
    }
    expect(cells).toBeGreaterThan(160 * 185);
    expect(worst).toBeLessThan(0.01);
  });

  it('puts the Bombie\'s top at its centre and the shelf around it', () => {
    const [bx, bz] = BOMBIE_CENTRE;
    expect(Math.abs(depthBilinear(coast, bx, bz) - DEFAULT_COAST_PARAMS.bombieTopM)).toBeLessThan(0.1);
    for (let a = 0; a < 8; a++) {
      const x = bx + 150 * Math.cos((a / 8) * 2 * Math.PI), z = bz + 150 * Math.sin((a / 8) * 2 * Math.PI);
      expect(depthAt(coast, x, z)).toBeGreaterThanOrEqual(9);
    }
  });

  it('puts Lefthanders\' ledge at its depth along its line', () => {
    for (let i = 0; i + 1 < LEFTHANDERS_LEDGE.length; i++) {
      const [ax, az] = LEFTHANDERS_LEDGE[i], [bx, bz] = LEFTHANDERS_LEDGE[i + 1];
      for (let t = 0; t <= 1; t += 0.1) {
        const d = depthBilinear(coast, ax + (bx - ax) * t, az + (bz - az) * t);
        expect(Math.abs(d - DEFAULT_COAST_PARAMS.lefthandersLedgeM)).toBeLessThan(0.3);
      }
    }
  });

  it('puts Ellensbrook\'s bar along its line', () => {
    for (let z = ELLENSBROOK_BAR.z0; z <= ELLENSBROOK_BAR.z1; z += 20) {
      const d = depthBilinear(coast, waterlineX(z) - DEFAULT_COAST_PARAMS.ellensbrookBarOffM, z);
      expect(d).toBeLessThanOrEqual(DEFAULT_COAST_PARAMS.ellensbrookBarM + 0.2);
    }
  });

  it('is the traced depth on the traced contours away from the Womb (20 points, 0.5 m)', () => {
    let n = 0;
    for (const c of COAST_CONTOURS) {
      if (c.depthM % 5 !== 0) continue;
      for (const z of [-2050, -1800, -1300, -1050, -800, 650, 900, 1150, 1350]) {
        const x = contourXAt(c, z);
        if (x < G.x0 + 8) continue;
        if (Object.values(BREAK_FOOTPRINTS).some((f) => insidePolygon(x, z, f))) continue;
        expect(Math.abs(depthBilinear(coast, x, z) - c.depthM)).toBeLessThan(0.5);
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(20);
  });

  it('never shallows moving offshore along a row, away from the breaks (0.2 m)', () => {
    const feet = Object.values(BREAK_FOOTPRINTS).map((f) => ({
      f, z0: Math.min(...f.map((p) => p[1])), z1: Math.max(...f.map((p) => p[1])),
    }));
    let worst = 0, where = '';
    for (let r = 0; r < G.nz; r++) {
      const z = G.z0 + r * G.cellM;
      const here = feet.filter((q) => z >= q.z0 && z <= q.z1).map((q) => q.f);
      let prev = -Infinity;
      for (let c = G.nx - 1; c >= 0; c--) {
        const x = G.x0 + c * G.cellM;
        if (here.length && here.some((f) => insidePolygon(x, z, f))) { prev = -Infinity; continue; }
        const d = -coast.bed[r * G.nx + c];
        if (prev - d > worst) { worst = prev - d; where = `(${x}, ${z})`; }
        prev = Math.max(prev, d);
      }
    }
    expect(worst, where).toBeLessThanOrEqual(0.2);
  });

  it('rises smoothly into the traced 10 m line: monotone through the 100 m inside it', () => {
    for (const z of [-1900, -1200, -900, 700, 1000, 1300]) {
      const x10 = contourXAt(COAST_CONTOURS[0], z);
      let prev = -Infinity;
      for (let x = x10 + 100; x >= x10; x -= 2) {
        const d = depthBilinear(coast, x, z);
        expect(d).toBeGreaterThanOrEqual(prev - 1e-3);
        prev = d;
      }
      expect(Math.abs(depthBilinear(coast, x10, z) - 10)).toBeLessThan(0.3);
    }
  });

  it('opens the Womb\'s basin to the sea: 15 m in front of the reef map, the shelf beyond its halo', () => {
    expect(depthAt(coast, -500, 0)).toBeCloseTo(15, 1);
    expect(depthAt(coast, -500, -450 - WOMB_HALO_M - 50)).toBeLessThan(12);
  });

  // inner-shelf (2026-10-10): the hand-set shelf deepens to 10 m about z −950, where the Womb's basin, fading back to
  // the 9 m shelf, focused an 8 ft set into a closeout 69–189 m off the beach (tools/_innerShelf.ts).
  it("deepens the inner shelf to 10 m at z −950, smoothly, back to 9 m by z −1 150 and at the Womb's halo (−750)", () => {
    expect(INNER_SHELF_DEEP.length).toBe(1);
    // Deeper than the first traced contour would hold the shelf flat past it and move the survey's lines.
    for (const q of INNER_SHELF_DEEP) expect(q.depthM).toBeLessThanOrEqual(COAST_CONTOURS[0].depthM);
    expect(innerShelfM(-950)).toBeCloseTo(10, 6);
    expect(innerShelfM(-1150)).toBe(INNER_SHELF_M);
    expect(innerShelfM(-750)).toBe(INNER_SHELF_M);
    expect(innerShelfM(-1050)).toBeCloseTo(9.5, 6);
    for (const q of INNER_SHELF_DEEP) expect(wombHalo(q.zSouth) + wombHalo(q.zNorth)).toBe(0);
    for (let z = -1200; z < -700; z += 5) expect(Math.abs(innerShelfM(z + 5) - innerShelfM(z))).toBeLessThan(0.05);
  });

  it('puts the deepened shelf on the bed: 10 m from the beach ramp to the 10 m line on the row z −952', () => {
    const z = -952, shore = waterlineX(z), x10 = contourXAt(COAST_CONTOURS[0], z);
    for (let x = shore - 64; x > x10; x -= 20) expect(depthAt(coast, x, z)).toBeCloseTo(innerShelfM(z), 1);
  });

  it("changes nothing in the Womb's halo or on Lefthanders' ledge (1 cm against the 9 m shelf)", () => {
    const flat = buildCoastMap(reef, DEFAULT_COAST_PARAMS, []);
    let worstHalo = 0, worstLedge = 0, changed = 0, stray = 0;
    for (let r = 0; r < G.nz; r++) {
      const z = G.z0 + r * G.cellM;
      for (let c = 0; c < G.nx; c++) {
        const i = r * G.nx + c, d = Math.abs(coast.bed[i] - flat.bed[i]), x = G.x0 + c * G.cellM;
        if (d > 0) changed++;
        // Only the hand-set shelf, only between the deepening's flanks: inshore of the traced 10 m line.
        if (d > 0.01) stray += Number(!INNER_SHELF_DEEP.some((q) => z > q.zNorth && z < q.zSouth) || x <= contourXAt(COAST_CONTOURS[0], z));
        if (wombHalo(z) > 0) worstHalo = Math.max(worstHalo, d);
        if (insidePolygon(G.x0 + c * G.cellM, z, BREAK_FOOTPRINTS.lefthanders)) worstLedge = Math.max(worstLedge, d);
      }
    }
    expect(changed).toBeGreaterThan(0);
    expect(stray).toBe(0);
    expect(worstHalo).toBeLessThan(0.01);
    expect(worstLedge).toBeLessThan(0.01);
  });
});
