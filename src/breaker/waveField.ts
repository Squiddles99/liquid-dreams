import type { Bathymetry } from '../seabed/bathymetry';
import type { GridSpec } from '../seabed/wombReef';
import { AMP_CAP } from './coastFarField';
import { MIN_DEPTH_M, groupSpeed, waveNumber } from './dispersion';
import { solveEikonal } from './eikonal';
import type { FieldSample } from './fieldSample';

export interface WaveFieldOptions {
  /** The swell bends as though the water were never shallower than this (m) (ReefFieldRequest.refractFloorM). */
  refractFloorM?: number;
  /**
   * hmin, the shallowest depth met so far along a ray, eases back toward the local depth over this distance (m) once
   * the ray is past the shoal (the coast field: a wave that broke on the Bombie re-forms in the deep water behind it).
   * Absent: never (the reef field: once over the ledge, always over it).
   */
  hminRecoverM?: number;
}

/** The solved sea on one grid, before any breaking analysis: τ (raw, the seed's time base), direction, amplitude, hmin. */
export interface WaveFieldSolve {
  grid: GridSpec;
  omega: number;
  depth: Float32Array;
  k: Float32Array;
  cg: Float32Array;
  tau: Float64Array;
  dirX: Float32Array;
  dirZ: Float32Array;
  amp: Float32Array;
  hmin: Float32Array;
  /** Cells sourced from the seed (inflow boundary). */
  fixed: Uint8Array;
  /** Cell indices in arrival order. */
  order: Uint32Array;
}

/**
 * The swell over `bed` (Bathymetry on its own grid), shared by the reef field and the coast field (lineup truth spec
 * §3c): every boundary cell the wave enters through takes `seed`'s solution there; the eikonal (fast sweeping) carries
 * the arrival time in; travel directions come from ∇τ; the energy flux A²·cg is marched along the rays in arrival order,
 * carrying hmin; the amplitude is lightly smoothed. `seed` also stands in where a cell has no upwind information.
 */
export function solveWaveField(bed: Bathymetry, omega: number, tideM: number, seed: (x: number, z: number) => FieldSample, opts: WaveFieldOptions = {}): WaveFieldSolve {
  const { grid } = bed;
  const { nx, nz, cellM, x0, z0 } = grid;
  const n = nx * nz;
  const depth = new Float32Array(n), k = new Float32Array(n), slow = new Float32Array(n), cg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    depth[i] = Math.max(tideM - bed.bed[i], MIN_DEPTH_M);
    k[i] = waveNumber(omega, depth[i]);
    slow[i] = (opts.refractFloorM ? waveNumber(omega, Math.max(depth[i], opts.refractFloorM)) : k[i]) / omega;
    cg[i] = groupSpeed(omega, k[i], depth[i]);
  }
  const seedAt = (col: number, row: number): FieldSample => seed(x0 + col * cellM, z0 + row * cellM);

  // Sources: every boundary cell the wave enters through takes the seed's solution.
  const tau = new Float64Array(n).fill(Infinity);
  const fixed = new Uint8Array(n);
  const edges: [number, number, number, number][] = []; // col, row, outward nx, outward nz
  for (let col = 0; col < nx; col++) { edges.push([col, 0, 0, -1]); edges.push([col, nz - 1, 0, 1]); }
  for (let row = 0; row < nz; row++) { edges.push([0, row, -1, 0]); edges.push([nx - 1, row, 1, 0]); }
  for (const [col, row, ox, oz] of edges) {
    const f = seedAt(col, row);
    // A tolerance, not a bare < 0: a grazing direction (e.g. fromDeg exactly 270°, where dirZ is float residue of
    // cos(90°)) must not flip an entire edge to "inflow" on residue alone, which sources it from the far field and
    // reads back as a numerical caustic once the eikonal solve marches off it.
    if (f.dirX * ox + f.dirZ * oz < -1e-6) {
      tau[row * nx + col] = f.tau;
      fixed[row * nx + col] = 1;
    }
  }
  solveEikonal(tau, fixed, slow, nx, nz, cellM);

  // Travel direction from ∇τ (central differences, one-sided at the edges).
  const dirX = new Float32Array(n), dirZ = new Float32Array(n);
  for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) {
    const i = row * nx + col;
    const gx = (tau[row * nx + Math.min(nx - 1, col + 1)] - tau[row * nx + Math.max(0, col - 1)]) / (cellM * (col > 0 && col < nx - 1 ? 2 : 1));
    const gz = (tau[Math.min(nz - 1, row + 1) * nx + col] - tau[Math.max(0, row - 1) * nx + col]) / (cellM * (row > 0 && row < nz - 1 ? 2 : 1));
    const len = Math.hypot(gx, gz);
    if (len > 1e-9 && Number.isFinite(len)) { dirX[i] = gx / len; dirZ[i] = gz / len; }
    else { const f = seedAt(col, row); dirX[i] = f.dirX; dirZ[i] = f.dirZ; }
  }

  // Energy flux F = A²·cg conserved along rays: first-order upwind march in arrival order. Also carries hmin.
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => tau[a] - tau[b]);
  const recover = opts.hminRecoverM ? 1 - Math.exp(-cellM / opts.hminRecoverM) : 0;
  const carry = (up: number, d: number): number => Math.min(d, up < d ? up + (d - up) * recover : up);
  const flux = new Float64Array(n), hmin = new Float32Array(n), done = new Uint8Array(n);
  for (let o = 0; o < n; o++) {
    const i = order[o];
    const col = i % nx, row = (i - col) / nx;
    let wx = 0, wz = 0, fx = 0, fz = 0, hx = 0, hz = 0;
    let xDone = false, zDone = false;
    if (!fixed[i]) {
      const ux = dirX[i] > 0 ? col - 1 : col + 1;
      const uz = dirZ[i] > 0 ? row - 1 : row + 1;
      // Weight is only the part of the neighbour's direction that actually points into this cell (matching sign
      // against this cell's own direction) — a neighbour whose ray has turned away contributes nothing.
      if (ux >= 0 && ux < nx && done[row * nx + ux]) {
        const j = row * nx + ux;
        wx = Math.max(0, Math.sign(dirX[i]) * dirX[j]); fx = flux[j]; hx = hmin[j]; xDone = true;
      }
      if (uz >= 0 && uz < nz && done[uz * nx + col]) {
        const j = uz * nx + col;
        wz = Math.max(0, Math.sign(dirZ[i]) * dirZ[j]); fz = flux[j]; hz = hmin[j]; zDone = true;
      }
    }
    const denom = Math.abs(dirX[i]) + Math.abs(dirZ[i]);
    if (fixed[i] || denom < 1e-9) {
      const f = seedAt(col, row);
      flux[i] = f.amp * f.amp * cg[i];
      hmin[i] = Math.min(depth[i], f.hmin);
    } else if (wx + wz < 1e-9) {
      if (xDone || zDone) {
        // Both upwind neighbours' weights vanished (e.g. a direction reversal at a shadow/caustic edge), but we do
        // have real upwind information here — use its plain mean rather than reverting to the seed.
        const count = (xDone ? 1 : 0) + (zDone ? 1 : 0);
        flux[i] = ((xDone ? fx : 0) + (zDone ? fz : 0)) / count;
        hmin[i] = carry(((xDone ? hx : 0) + (zDone ? hz : 0)) / count, depth[i]);
      } else {
        const f = seedAt(col, row);
        flux[i] = f.amp * f.amp * cg[i];
        hmin[i] = Math.min(depth[i], f.hmin);
      }
    } else {
      flux[i] = (wx * fx + wz * fz) / denom;
      hmin[i] = carry((wx * hx + wz * hz) / (wx + wz), depth[i]);
    }
    done[i] = 1;
  }
  const rawAmp = new Float32Array(n);
  for (let i = 0; i < n; i++) rawAmp[i] = Math.min(AMP_CAP, Math.sqrt(flux[i] / cg[i]));
  // Light smoothing where rays converge at the wedge tip (stands in for diffraction).
  const amp = new Float32Array(n);
  for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) {
    const i = row * nx + col;
    if (row === 0 || col === 0 || row === nz - 1 || col === nx - 1) { amp[i] = rawAmp[i]; continue; }
    amp[i] = 0.5 * rawAmp[i] + 0.125 * (rawAmp[i - 1] + rawAmp[i + 1] + rawAmp[i - nx] + rawAmp[i + nx]);
  }
  return { grid, omega, depth, k, cg, tau, dirX, dirZ, amp, hmin, fixed, order };
}
