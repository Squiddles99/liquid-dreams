import { describe, expect, it } from 'vitest';
import { type Bathymetry, buildBathymetry, downsample } from '../seabed/bathymetry';
import { depthBg } from '../seabed/coastProfile';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { AMP_CAP, farSample } from './coastFarField';
import type { FieldSample } from './fieldSample';
import { computeReefField, sampleField } from './reefField';

const reef05 = buildBathymetry();
const reef1 = downsample(reef05, 2);
const reef2 = downsample(reef05, 4);
// Solve the full 1 m field once (~1 s) and share it between the tests that inspect it.
const f225 = computeReefField({ bed: reef1, periodS: 15, fromDeg: 225, tideM: 0 });

function coastOnly(): Bathymetry {
  const grid = { x0: -400, z0: -100, cellM: 2, nx: 326, nz: 101 };
  const bed = new Float32Array(grid.nx * grid.nz);
  for (let r = 0; r < grid.nz; r++) for (let c = 0; c < grid.nx; c++) bed[r * grid.nx + c] = -depthBg(grid.x0 + c * grid.cellM);
  return { grid, bed, sand: new Float32Array(bed.length).fill(1), weed: new Float32Array(bed.length) };
}

const allFinite = (a: Float32Array) => a.every(Number.isFinite);
const along = (line: readonly (readonly [number, number])[], metres: number, step: number): [number, number][] => {
  const [a, b] = [line[0], line[1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out: [number, number][] = [];
  for (let s = 0; s <= metres + 1e-9; s += step) out.push([a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len]);
  return out;
};

describe('reef wave field', () => {
  it('equals the exact 1D coast solution on a reef-free coast (the far field joins seamlessly)', () => {
    const f = computeReefField({ bed: coastOnly(), periodS: 15, fromDeg: 225, tideM: 0 });
    for (const [x, z] of [[-300, 0], [-100, 40], [0, -20], [120, 60]] as const) {
      const inside = sampleField(f, x, z), analytic = farSample(f.far, x, z);
      expect(Math.abs(inside.tau - analytic.tau)).toBeLessThan(0.02 * Math.max(1, Math.abs(analytic.tau)) + 0.05);
      expect(inside.amp / analytic.amp).toBeCloseTo(1, 1);
    }
  });
  it('arrives at the peak at τ = 0', () => {
    const f = f225;
    expect(Math.abs(sampleField(f, 0, 0).tau)).toBeLessThan(0.05);
  });
  it('peels along the north ledge and stands up at once along the south ledge (the A-frame)', () => {
    const f = f225;
    const north = along(NORTH_LEDGE, 40, 5).map(([x, z]) => sampleField(f, x, z).tau);
    const south = along(SOUTH_LEDGE, 40, 5).map(([x, z]) => sampleField(f, x, z).tau);
    for (let i = 1; i < north.length; i++) expect(north[i]).toBeGreaterThan(north[i - 1]);
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(spread(south)).toBeLessThan(spread(north));
    const peelSpeed = 40 / (north[north.length - 1] - north[0]);
    console.log(`[reef] north-ledge peel speed ${peelSpeed.toFixed(1)} m/s; south-ledge arrival spread ${spread(south).toFixed(2)} s over 40 m`);
    expect(peelSpeed).toBeGreaterThan(3);
  });
  it('is finite, capped, and never records a shallower hmin than the water it has crossed allows', () => {
    const f = f225;
    for (const a of [f.tau, f.amp, f.hmin, f.k, f.dirX, f.dirZ, f.depth]) expect(allFinite(a)).toBe(true);
    for (let i = 0; i < f.amp.length; i += 97) {
      expect(f.amp[i]).toBeLessThanOrEqual(AMP_CAP);
      expect(f.hmin[i]).toBeLessThanOrEqual(f.depth[i] + 1e-4);
      expect(Math.hypot(f.dirX[i], f.dirZ[i])).toBeCloseTo(1, 4);
    }
  });
  it('unusual swell directions stay finite', () => {
    for (const fromDeg of [0, 45, 90, 135, 180, 315]) {
      const f = computeReefField({ bed: reef2, periodS: 15, fromDeg, tideM: 0 });
      for (const a of [f.tau, f.amp, f.hmin, f.k, f.dirX, f.dirZ]) expect(allFinite(a)).toBe(true);
    }
  });
  it('extreme tide stays finite (reef heads dry at −1.5 m)', () => {
    for (const tideM of [-1.5, 1.5]) for (const periodS of [4, 25]) {
      const f = computeReefField({ bed: reef2, periodS, fromDeg: 225, tideM });
      for (const a of [f.tau, f.amp, f.hmin, f.k]) expect(allFinite(a)).toBe(true);
    }
  });
  it('the field joins the outside smoothly at every edge (real reef)', () => {
    for (const f of [f225, computeReefField({ bed: reef2, periodS: 15, fromDeg: 205, tideM: 0 })]) {
      const g = f.grid;
      const x0 = g.x0, z0 = g.z0, x1 = g.x0 + (g.nx - 1) * g.cellM, z1 = g.z0 + (g.nz - 1) * g.cellM;
      const check = (a: FieldSample, b: FieldSample, dx: number, dz: number) => {
        const predicted = a.tau + (a.k / f.omega) * (a.dirX * dx + a.dirZ * dz);
        expect(Math.abs(b.tau - predicted)).toBeLessThan(0.05);
        expect(Math.abs(b.amp - a.amp)).toBeLessThan(0.1 * a.amp + 0.02);
        expect(a.dirX * b.dirX + a.dirZ * b.dirZ).toBeGreaterThan(0.97);
      };
      for (let x = x0; x <= x1 + 1e-9; x += 25) {
        check(sampleField(f, x, z0 + 0.5), sampleField(f, x, z0 - 0.5), 0, -1);
        check(sampleField(f, x, z1 - 0.5), sampleField(f, x, z1 + 0.5), 0, 1);
      }
      for (let z = z0; z <= z1 + 1e-9; z += 25) {
        check(sampleField(f, x0 + 0.5, z), sampleField(f, x0 - 0.5, z), -1, 0);
        check(sampleField(f, x1 - 0.5, z), sampleField(f, x1 + 0.5, z), 1, 0);
      }
    }
  });
});
