import { describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import type { GridSpec } from '../seabed/wombReef';
import { farSample } from './coastFarField';
import type { FieldSample } from './fieldSample';
import { type ReefField, computeReefField, sampleField } from './reefField';

// Plan 2026-10-07 ride-framerate Task 16 (R10b): a field sample finds its grid cell once, not once per array. The old
// build's sampleField, kept here as it was (bilinear per array), must equal the new one bit for bit everywhere.
function oldBilinear(a: ArrayLike<number>, g: GridSpec, x: number, z: number): number {
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM)), fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM));
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * g.nx + c;
  const top = a[i] + (a[i + 1] - a[i]) * tx, bottom = a[i + g.nx] + (a[i + g.nx + 1] - a[i + g.nx]) * tx;
  return top + (bottom - top) * tz;
}
function oldInside(f: ReefField, x: number, z: number): FieldSample {
  const g = f.grid;
  const dirX = oldBilinear(f.dirX, g, x, z), dirZ = oldBilinear(f.dirZ, g, x, z);
  const len = Math.hypot(dirX, dirZ) || 1;
  return {
    tau: oldBilinear(f.tau, g, x, z), amp: oldBilinear(f.amp, g, x, z), hmin: oldBilinear(f.hmin, g, x, z), hminBreak: oldBilinear(f.hminBreak, g, x, z), hminSlurp: oldBilinear(f.hminSlurp, g, x, z), hminLean: oldBilinear(f.hminLean, g, x, z),
    k: oldBilinear(f.k, g, x, z), dirX: dirX / len, dirZ: dirZ / len, depth: oldBilinear(f.depth, g, x, z),
  };
}
function oldSampleField(f: ReefField, x: number, z: number): FieldSample {
  const g = f.grid;
  const x1 = g.x0 + (g.nx - 1) * g.cellM, z1 = g.z0 + (g.nz - 1) * g.cellM;
  const inside = x >= g.x0 && z >= g.z0 && x <= x1 && z <= z1;
  if (inside) return oldInside(f, x, z);
  const xc = Math.min(x1, Math.max(g.x0, x)), zc = Math.min(z1, Math.max(g.z0, z));
  const far = farSample(f.far, x, z);
  if (far.dirX * (x - xc) + far.dirZ * (z - zc) <= 0) return far;
  const e = oldInside(f, xc, zc);
  return { ...e, tau: e.tau + (e.k / f.omega) * (e.dirX * (x - xc) + e.dirZ * (z - zc)) };
}

describe('sampleField finds the cell once (exact)', () => {
  const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
  const g = field.grid, W = (g.nx - 1) * g.cellM, H = (g.nz - 1) * g.cellM;
  let seed = 4242;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

  it('equals the old build at 20000 random points: inside, on the nodes and edges, and outside on every side', () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 12000; i++) pts.push([g.x0 + rand() * W, g.z0 + rand() * H]);
    for (let i = 0; i < 2000; i++) pts.push([g.x0 + Math.floor(rand() * g.nx) * g.cellM, g.z0 + Math.floor(rand() * g.nz) * g.cellM]);
    for (let i = 0; i < 1000; i++) { const s = rand(); pts.push([g.x0 + s * W, g.z0], [g.x0 + s * W, g.z0 + H], [g.x0, g.z0 + s * H], [g.x0 + W, g.z0 + s * H]); }
    for (let i = 0; i < 2000; i++) pts.push([g.x0 - 0.5 * W + rand() * 2 * W, g.z0 - 0.5 * H + rand() * 2 * H]);
    let inside = 0;
    for (const [x, z] of pts) {
      if (x >= g.x0 && z >= g.z0 && x <= g.x0 + W && z <= g.z0 + H) inside++;
      expect(sampleField(field, x, z)).toEqual(oldSampleField(field, x, z));
    }
    expect(inside).toBeGreaterThan(16000);
    expect(pts.length - inside).toBeGreaterThan(1000);
  });

  it('reads the grid spec a handful of times per sample, not once per array', () => {
    let reads = 0;
    const counted: ReefField = { ...field, grid: new Proxy(field.grid, { get: (t, p, r) => { reads++; return Reflect.get(t, p, r); } }) };
    const x = g.x0 + 0.37 * W, z = g.z0 + 0.61 * H;
    expect(sampleField(counted, x, z)).toEqual(sampleField(field, x, z));
    // The inside test (8) and one cell (≤ 12): the old build read it 8 + 12 per array × 10 arrays.
    expect(reads).toBeLessThanOrEqual(20);
  });
});
