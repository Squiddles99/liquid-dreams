import type { Bathymetry } from '../seabed/bathymetry';
import type { GridSpec } from '../seabed/wombReef';
import { AMP_CAP, type FarField, computeFarField, farSample } from './coastFarField';
import { MIN_DEPTH_M, groupSpeed, waveNumber } from './dispersion';
import { solveEikonal } from './eikonal';
import type { FieldSample } from './fieldSample';

export interface ReefFieldRequest {
  /** The seabed on the field grid (1 m in the app: downsample(bathymetry, 2)). */
  bed: Bathymetry;
  periodS: number;
  fromDeg: number;
  tideM: number;
}

export interface ReefField {
  grid: GridSpec;
  /** Arrival time relative to the peak (s). */
  tau: Float32Array;
  amp: Float32Array;
  hmin: Float32Array;
  k: Float32Array;
  dirX: Float32Array;
  dirZ: Float32Array;
  depth: Float32Array;
  far: FarField;
  omega: number;
  periodS: number;
  fromDeg: number;
  tideM: number;
}

function bilinear(a: ArrayLike<number>, g: GridSpec, x: number, z: number): number {
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM)), fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM));
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * g.nx + c;
  const top = a[i] + (a[i + 1] - a[i]) * tx, bottom = a[i + g.nx] + (a[i + g.nx + 1] - a[i + g.nx]) * tx;
  return top + (bottom - top) * tz;
}

export function computeReefField(req: ReefFieldRequest): ReefField {
  const { grid } = req.bed;
  const { nx, nz, cellM, x0, z0 } = grid;
  const n = nx * nz;
  const omega = (2 * Math.PI) / req.periodS;
  const depth = new Float32Array(n), k = new Float32Array(n), slow = new Float32Array(n), cg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    depth[i] = Math.max(req.tideM - req.bed.bed[i], MIN_DEPTH_M);
    k[i] = waveNumber(omega, depth[i]);
    slow[i] = k[i] / omega;
    cg[i] = groupSpeed(omega, k[i], depth[i]);
  }
  const far = computeFarField(req.periodS, req.fromDeg, req.tideM);
  const farAt = (col: number, row: number): FieldSample => farSample(far, x0 + col * cellM, z0 + row * cellM);

  // Sources: every boundary cell the wave enters through takes the exact coast solution.
  const tau = new Float64Array(n).fill(Infinity);
  const fixed = new Uint8Array(n);
  const edges: [number, number, number, number][] = []; // col, row, outward nx, outward nz
  for (let col = 0; col < nx; col++) { edges.push([col, 0, 0, -1]); edges.push([col, nz - 1, 0, 1]); }
  for (let row = 0; row < nz; row++) { edges.push([0, row, -1, 0]); edges.push([nx - 1, row, 1, 0]); }
  for (const [col, row, ox, oz] of edges) {
    const f = farAt(col, row);
    if (f.dirX * ox + f.dirZ * oz < 0) {
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
    else { const f = farAt(col, row); dirX[i] = f.dirX; dirZ[i] = f.dirZ; }
  }

  // Energy flux F = A²·cg conserved along rays: first-order upwind march in arrival order. Also carries hmin.
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => tau[a] - tau[b]);
  const flux = new Float64Array(n), hmin = new Float32Array(n), done = new Uint8Array(n);
  for (let o = 0; o < n; o++) {
    const i = order[o];
    const col = i % nx, row = (i - col) / nx;
    let wx = 0, wz = 0, fx = 0, fz = 0, hx = 0, hz = 0;
    if (!fixed[i]) {
      const ux = dirX[i] > 0 ? col - 1 : col + 1;
      const uz = dirZ[i] > 0 ? row - 1 : row + 1;
      if (ux >= 0 && ux < nx && done[row * nx + ux]) { const j = row * nx + ux; wx = Math.abs(dirX[j]); fx = flux[j]; hx = hmin[j]; }
      if (uz >= 0 && uz < nz && done[uz * nx + col]) { const j = uz * nx + col; wz = Math.abs(dirZ[j]); fz = flux[j]; hz = hmin[j]; }
    }
    const denom = Math.abs(dirX[i]) + Math.abs(dirZ[i]);
    if (fixed[i] || wx + wz < 1e-9 || denom < 1e-9) {
      const f = farAt(col, row);
      flux[i] = f.amp * f.amp * cg[i];
      hmin[i] = Math.min(depth[i], f.hmin);
    } else {
      flux[i] = (wx * fx + wz * fz) / denom;
      hmin[i] = Math.min(depth[i], (wx * hx + wz * hz) / (wx + wz));
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

  // Normalise so the crest reaches the peak at τ = 0.
  const tauPeak = bilinear(tau, grid, 0, 0);
  const tau32 = new Float32Array(n);
  for (let i = 0; i < n; i++) tau32[i] = tau[i] - tauPeak;
  far.tauOffset = tauPeak;
  return { grid, tau: tau32, amp, hmin, k, dirX, dirZ, depth, far, omega, periodS: req.periodS, fromDeg: req.fromDeg, tideM: req.tideM };
}

/** Bilinear inside the field grid; the exact coast solution outside it. */
export function sampleField(f: ReefField, x: number, z: number): FieldSample {
  const g = f.grid;
  const inside = x >= g.x0 && z >= g.z0 && x <= g.x0 + (g.nx - 1) * g.cellM && z <= g.z0 + (g.nz - 1) * g.cellM;
  if (!inside) return farSample(f.far, x, z);
  const dirX = bilinear(f.dirX, g, x, z), dirZ = bilinear(f.dirZ, g, x, z);
  const len = Math.hypot(dirX, dirZ) || 1;
  return {
    tau: bilinear(f.tau, g, x, z), amp: bilinear(f.amp, g, x, z), hmin: bilinear(f.hmin, g, x, z),
    k: bilinear(f.k, g, x, z), dirX: dirX / len, dirZ: dirZ / len, depth: bilinear(f.depth, g, x, z),
  };
}
