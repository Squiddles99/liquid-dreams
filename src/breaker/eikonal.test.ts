import { describe, expect, it } from 'vitest';
import { solveEikonal } from './eikonal';

function grid(nx: number, nz: number) {
  return { tau: new Float64Array(nx * nz).fill(Infinity), fixed: new Uint8Array(nx * nz), slow: new Float32Array(nx * nz) };
}

describe('fast-sweeping eikonal solver', () => {
  it('reproduces a plane wave along x exactly', () => {
    const nx = 60, nz = 40, h = 1, s = 0.1;
    const g = grid(nx, nz);
    g.slow.fill(s);
    for (let r = 0; r < nz; r++) { g.tau[r * nx] = 0; g.fixed[r * nx] = 1; }
    solveEikonal(g.tau, g.fixed, g.slow, nx, nz, h);
    for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) expect(g.tau[r * nx + c]).toBeCloseTo(c * h * Math.fround(s), 9);
  });
  it('reproduces an oblique plane wave (entering from the west and south edges)', () => {
    const nx = 80, nz = 70, h = 1, s = 0.08;
    const sf = Math.fround(s);
    const dx = Math.cos(Math.PI / 6), dz = -Math.sin(Math.PI / 6); // travelling east and north
    const exact = (c: number, r: number) => sf * (dx * c * h + dz * (r - (nz - 1)) * h);
    const g = grid(nx, nz);
    g.slow.fill(s);
    for (let r = 0; r < nz; r++) { g.tau[r * nx] = exact(0, r); g.fixed[r * nx] = 1; }
    for (let c = 0; c < nx; c++) { g.tau[(nz - 1) * nx + c] = exact(c, nz - 1); g.fixed[(nz - 1) * nx + c] = 1; }
    solveEikonal(g.tau, g.fixed, g.slow, nx, nz, h);
    for (let r = 0; r < nz; r += 7) for (let c = 0; c < nx; c += 7) expect(g.tau[r * nx + c]).toBeCloseTo(exact(c, r), 6);
  });
  it("obeys Snell's law across straight depth contours", () => {
    const nx = 200, nz = 120, h = 1;
    const speed = (c: number) => 12 - 8 * (c / (nx - 1)); // slowing shoreward (east)
    const theta0 = (35 * Math.PI) / 180;
    const p = Math.sin(theta0) / speed(0); // slowness component along z (the invariant)
    // Exact 1D solution: τ = p·z + ∫ sqrt(s(x)² − p²) dx, integrated finely.
    const tauX = new Float64Array(nx);
    for (let c = 1; c < nx; c++) {
      let acc = 0;
      for (let q = 0; q < 20; q++) {
        const x = c - 1 + (q + 0.5) / 20;
        const sl = 1 / speed(x);
        acc += Math.sqrt(sl * sl - p * p) / 20;
      }
      tauX[c] = tauX[c - 1] + acc * h;
    }
    const exact = (c: number, r: number) => tauX[c] + p * r * h;
    const g = grid(nx, nz);
    for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) g.slow[r * nx + c] = 1 / speed(c);
    for (let r = 0; r < nz; r++) { g.tau[r * nx] = exact(0, r); g.fixed[r * nx] = 1; }
    for (let c = 0; c < nx; c++) { g.tau[c] = exact(c, 0); g.fixed[c] = 1; }
    solveEikonal(g.tau, g.fixed, g.slow, nx, nz, h);
    for (const c of [50, 100, 150]) {
      const r = 60;
      const dTauDz = (g.tau[(r + 1) * nx + c] - g.tau[(r - 1) * nx + c]) / (2 * h);
      expect(Math.abs(dTauDz / p - 1)).toBeLessThan(0.02);
      expect(Math.abs(g.tau[r * nx + c] - exact(c, r)) / exact(c, r)).toBeLessThan(0.01);
    }
  });
  it('stays finite with huge slowness (dry reef) and unreachable cells', () => {
    const nx = 30, nz = 30;
    const g = grid(nx, nz);
    g.slow.fill(0.1);
    for (let r = 10; r < 20; r++) for (let c = 10; c < 20; c++) g.slow[r * nx + c] = 1e6;
    for (let r = 0; r < nz; r++) { g.tau[r * nx] = 0; g.fixed[r * nx] = 1; }
    solveEikonal(g.tau, g.fixed, g.slow, nx, nz, 1);
    g.tau.forEach((v) => { expect(Number.isNaN(v)).toBe(false); expect(Number.isFinite(v)).toBe(true); });
  });
});
