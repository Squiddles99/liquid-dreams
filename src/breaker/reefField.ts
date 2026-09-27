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
  /** The breaking depth: amp / (amp/hmin smoothed along the crest) (FieldSample.hminBreak). */
  hminBreak: Float32Array;
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

/**
 * The breaking depth (FieldSample.hminBreak) comes from amp/hmin taken to its largest within BREAK_REACH_M along the
 * crest, then smoothed along the crest by a Gaussian of σ = BREAK_SMOOTHING_M. The reef's edges change hmin by metres
 * within a few metres of crest: unsmoothed, a section went from unbroken to fully collapsed in ~6 m of crest (1.3 H at
 * 6.6 ft), with the drain switching on over 1–2 m, which drew square-walled channels in front of the break. The largest
 * first keeps the peak: the wedge's tip is only ~10 m wide, and smoothing alone (σ 10 m) lifted the height a wave needs
 * to break there from 1.22 to 1.6 × Hs. It also lengthens each breaking section a little, toward a long, straight
 * Pipeline line rather than a tight bowl. Only along the crest: across it (along travel) hmin keeps its full sharpness,
 * so the right still closes out all at once along the south ledge and every section breaks when it reaches the reef.
 */
export const BREAK_REACH_M = 6;
export const BREAK_SMOOTHING_M = 6;

/** The largest of `a` within radiusM along the crest line through each node (sampled as smoothAlongCrest samples). */
export function maxAlongCrest(a: Float32Array, dirX: Float32Array, dirZ: Float32Array, grid: GridSpec, radiusM: number): Float32Array {
  const { nx, cellM } = grid;
  const out = new Float32Array(a.length);
  const R = Math.round(radiusM / cellM);
  const at = bilinearCells(a, grid);
  for (let i = 0; i < a.length; i++) {
    const col = i % nx, row = (i - col) / nx, tx = -dirZ[i], tz = dirX[i];
    let m = a[i];
    for (let j = -R; j <= R; j++) m = Math.max(m, at(col + j * tx, row + j * tz));
    out[i] = m;
  }
  return out;
}

/** Bilinear lookup of a node array at fractional cell coordinates, clamped to the grid. */
function bilinearCells(a: Float32Array, grid: GridSpec): (fx: number, fz: number) => number {
  const { nx, nz } = grid;
  return (fx, fz) => {
    fx = Math.min(nx - 1, Math.max(0, fx)); fz = Math.min(nz - 1, Math.max(0, fz));
    const c = Math.min(nx - 2, Math.floor(fx)), r = Math.min(nz - 2, Math.floor(fz));
    const tx = fx - c, tz = fz - r, i = r * nx + c;
    const top = a[i] + (a[i + 1] - a[i]) * tx, bottom = a[i + nx] + (a[i + nx + 1] - a[i + nx]) * tx;
    return top + (bottom - top) * tz;
  };
}

/**
 * `a` smoothed along the crest line through each node: a Gaussian of σ = sigmaM sampled every σ/3 (at least a cell)
 * along the local crest tangent (perpendicular to the travel direction), bilinear between nodes and clamped to the grid.
 * A straight tangent is close enough: the crest turns ~10° over ±3σ around the wedge.
 */
export function smoothAlongCrest(a: Float32Array, dirX: Float32Array, dirZ: Float32Array, grid: GridSpec, sigmaM: number): Float32Array {
  const { nx, nz, cellM } = grid;
  const out = new Float32Array(a.length);
  const sigma = sigmaM / cellM, step = Math.max(1, sigma / 3);
  const R = Math.ceil((3 * sigma) / step);
  const w = new Float64Array(2 * R + 1);
  for (let j = -R; j <= R; j++) w[j + R] = Math.exp(-((j * step) ** 2) / (2 * sigma * sigma));
  const at = bilinearCells(a, grid);
  for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) {
    const i = row * nx + col;
    const tx = -dirZ[i], tz = dirX[i];
    let sum = 0, ws = 0;
    for (let j = -R; j <= R; j++) { sum += w[j + R] * at(col + j * step * tx, row + j * step * tz); ws += w[j + R]; }
    out[i] = sum / ws;
  }
  return out;
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
      const f = farAt(col, row);
      flux[i] = f.amp * f.amp * cg[i];
      hmin[i] = Math.min(depth[i], f.hmin);
    } else if (wx + wz < 1e-9) {
      if (xDone || zDone) {
        // Both upwind neighbours' weights vanished (e.g. a direction reversal at a shadow/caustic edge), but we do
        // have real upwind information here — use its plain mean rather than reverting to the far field.
        const count = (xDone ? 1 : 0) + (zDone ? 1 : 0);
        flux[i] = ((xDone ? fx : 0) + (zDone ? fz : 0)) / count;
        hmin[i] = Math.min(depth[i], ((xDone ? hx : 0) + (zDone ? hz : 0)) / count);
      } else {
        const f = farAt(col, row);
        flux[i] = f.amp * f.amp * cg[i];
        hmin[i] = Math.min(depth[i], f.hmin);
      }
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
  // The breaking ratio is ∝ amp/hmin (above its floor): smoothing that, not hmin, smooths the ratio itself.
  const gain = new Float32Array(n);
  for (let i = 0; i < n; i++) gain[i] = amp[i] / hmin[i];
  const smoothGain = smoothAlongCrest(maxAlongCrest(gain, dirX, dirZ, grid, BREAK_REACH_M), dirX, dirZ, grid, BREAK_SMOOTHING_M);
  const hminBreak = new Float32Array(n);
  for (let i = 0; i < n; i++) hminBreak[i] = smoothGain[i] > 0 ? amp[i] / smoothGain[i] : hmin[i];
  return { grid, tau: tau32, amp, hmin, hminBreak, k, dirX, dirZ, depth, far, omega, periodS: req.periodS, fromDeg: req.fromDeg, tideM: req.tideM };
}

function sampleInside(f: ReefField, x: number, z: number): FieldSample {
  const g = f.grid;
  const dirX = bilinear(f.dirX, g, x, z), dirZ = bilinear(f.dirZ, g, x, z);
  const len = Math.hypot(dirX, dirZ) || 1;
  return {
    tau: bilinear(f.tau, g, x, z), amp: bilinear(f.amp, g, x, z), hmin: bilinear(f.hmin, g, x, z), hminBreak: bilinear(f.hminBreak, g, x, z),
    k: bilinear(f.k, g, x, z), dirX: dirX / len, dirZ: dirZ / len, depth: bilinear(f.depth, g, x, z),
  };
}

/**
 * Bilinear inside the field grid. Outside it: on the inflow side (the wave is entering the map there), the exact
 * coast solution — seamless by construction, since the map's boundary cells were sourced from it. On the outflow
 * side, the reef has already shaped the wave (delayed it, grown or shrunk it, cast a shadow); reverting to the
 * reef-free far field there would erase that shape the instant the wave crosses the edge. Instead we keep the edge
 * sample and only advance τ along the local ray direction from the edge to the query point, so the reef's delay and
 * shadow continue past the map.
 */
export function sampleField(f: ReefField, x: number, z: number): FieldSample {
  const g = f.grid;
  const x1 = g.x0 + (g.nx - 1) * g.cellM, z1 = g.z0 + (g.nz - 1) * g.cellM;
  const inside = x >= g.x0 && z >= g.z0 && x <= x1 && z <= z1;
  if (inside) return sampleInside(f, x, z);
  const xc = Math.min(x1, Math.max(g.x0, x)), zc = Math.min(z1, Math.max(g.z0, z));
  const far = farSample(f.far, x, z);
  if (far.dirX * (x - xc) + far.dirZ * (z - zc) <= 0) return far;
  const e = sampleInside(f, xc, zc);
  return { ...e, tau: e.tau + (e.k / f.omega) * (e.dirX * (x - xc) + e.dirZ * (z - zc)) };
}
