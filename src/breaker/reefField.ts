import type { Bathymetry } from '../seabed/bathymetry';
import type { GridSpec } from '../seabed/wombReef';
import { BREAKING_RATIO, LIP_THROW_S, ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH, breakingDepth, onsetLevelHeight } from './breaking';
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
  /** The breaking depth: amp / (amp/breakingDepth(hmin) smoothed along the crest) (FieldSample.hminBreak). */
  hminBreak: Float32Array;
  /** The drain's breaking depth: amp / the slurp's gain (slurpAlongCrest; FieldSample.hminSlurp). */
  hminSlurp: Float32Array;
  k: Float32Array;
  dirX: Float32Array;
  dirZ: Float32Array;
  depth: Float32Array;
  /** The onset record (breaking.ONSET_RECORD_LENGTH values per node at [i·ONSET_RECORD_LENGTH + j]): the running maximum
   * of amp/hminBreak along the ray, then per breaking level the time since that level's onset and the amplification there
   * (computeOnsetRecord). */
  onset: Float32Array;
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
/**
 * A wider along-crest smoothing (σ, m) that only ever lifts the breaking depth's ratio (the larger of the two is kept):
 * it spreads the low side of each section's ends over a few wave heights without lowering the peak.
 */
export const BREAK_TAIL_M = 20;
/**
 * Then smoothed along travel (σ, m): the crest crosses the reef's edge in a few metres, so without it the sharpening and
 * the drain switched on in ~0.4 s, a trap door (Andrew, 7.4 ft). Smoothed, a wave feels the reef coming and stands up
 * over a couple of seconds. It cannot spoil the right's closeout: that is the whole crest reaching the ledge at once,
 * which smoothing along travel leaves as it is.
 */
export const BREAK_TRAVEL_SMOOTHING_M = 8;

/**
 * The slurp (Andrew): as a section stands up it draws the reef's water into itself, and the swell line either side is
 * part of that. The drain reads, at each node, the strongest breaking gain along its crest line within 2·SLURP_REACH_M,
 * weighted exp(−s / SLURP_REACH_M) by its distance s along the line: fully at the section itself, 37% at SLURP_REACH_M.
 * Exponential, not Gaussian: the drain saturates (full from ρ ≈ 1.3), and a Gaussian took a peak's ratio of 3 through the
 * drain's whole ramp in ~15 m of crest, a wall at each end of a flat-bottomed bowl; an exponential spends 0.7 reaches on it.
 * A bigger swell stands further past breaking at the peak, and so slurps further along the line.
 */
export const SLURP_REACH_M = 80;
/** The slurp's samples along the crest line are this far apart (m). */
const SLURP_STEP_M = 2;

/** `a` spread along the crest line through each node: the largest of a × exp(−s/reachM) within ±2·reachM. */
export function slurpAlongCrest(a: Float32Array, dirX: Float32Array, dirZ: Float32Array, grid: GridSpec, reachM: number): Float32Array {
  const { nx, cellM } = grid;
  const out = new Float32Array(a.length);
  const at = bilinearCells(a, grid);
  const steps = Math.ceil((2 * reachM) / SLURP_STEP_M);
  const weight = Array.from({ length: steps + 1 }, (_, j) => Math.exp(-(j * SLURP_STEP_M) / reachM));
  let aMax = 0;
  for (let i = 0; i < a.length; i++) aMax = Math.max(aMax, a[i]);
  for (let i = 0; i < a.length; i++) {
    const col = i % nx, row = (i - col) / nx, tx = (-dirZ[i] * SLURP_STEP_M) / cellM, tz = (dirX[i] * SLURP_STEP_M) / cellM;
    let m = a[i];
    for (let j = 1; j <= steps; j++) {
      const w = weight[j];
      if (m >= w * aMax) break; // nothing further along can beat it
      m = Math.max(m, w * at(col + j * tx, row + j * tz), w * at(col - j * tx, row - j * tz));
    }
    out[i] = m;
  }
  return out;
}

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
  return smoothAlongLine(a, dirX, dirZ, grid, sigmaM, true);
}

/** `a` smoothed along the travel direction through each node (as smoothAlongCrest, along the ray instead). */
export function smoothAlongTravel(a: Float32Array, dirX: Float32Array, dirZ: Float32Array, grid: GridSpec, sigmaM: number): Float32Array {
  return smoothAlongLine(a, dirX, dirZ, grid, sigmaM, false);
}

function smoothAlongLine(a: Float32Array, dirX: Float32Array, dirZ: Float32Array, grid: GridSpec, sigmaM: number, crest: boolean): Float32Array {
  const { nx, nz, cellM } = grid;
  const out = new Float32Array(a.length);
  const sigma = sigmaM / cellM, step = Math.max(1, sigma / 3);
  const R = Math.ceil((3 * sigma) / step);
  const w = new Float64Array(2 * R + 1);
  for (let j = -R; j <= R; j++) w[j + R] = Math.exp(-((j * step) ** 2) / (2 * sigma * sigma));
  const at = bilinearCells(a, grid);
  for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) {
    const i = row * nx + col;
    const tx = crest ? -dirZ[i] : dirX[i], tz = crest ? dirX[i] : dirZ[i];
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
  // The breaking ratio is ∝ amp/depth (above its floor): smoothing that, not the depth, smooths the ratio itself.
  const gain = new Float32Array(n);
  for (let i = 0; i < n; i++) gain[i] = amp[i] / breakingDepth(hmin[i]);
  const near = smoothAlongCrest(maxAlongCrest(gain, dirX, dirZ, grid, BREAK_REACH_M), dirX, dirZ, grid, BREAK_SMOOTHING_M);
  const tail = smoothAlongCrest(gain, dirX, dirZ, grid, BREAK_TAIL_M);
  for (let i = 0; i < n; i++) near[i] = Math.max(near[i], tail[i]);
  const smoothGain = smoothAlongTravel(near, dirX, dirZ, grid, BREAK_TRAVEL_SMOOTHING_M);
  const hminBreak = new Float32Array(n);
  for (let i = 0; i < n; i++) hminBreak[i] = smoothGain[i] > 0 ? amp[i] / smoothGain[i] : breakingDepth(hmin[i]);
  const slurp = slurpAlongCrest(smoothGain, dirX, dirZ, grid, SLURP_REACH_M);
  const hminSlurp = new Float32Array(n);
  for (let i = 0; i < n; i++) hminSlurp[i] = slurp[i] > 0 ? Math.min(hminBreak[i], amp[i] / slurp[i]) : hminBreak[i];
  const onset = computeOnsetRecord({ grid, tau: tau32, amp, hmin, hminBreak, k, dirX, dirZ, fixed, order, omega });
  return { grid, tau: tau32, amp, hmin, hminBreak, hminSlurp, k, dirX, dirZ, depth, onset, far, omega, periodS: req.periodS, fromDeg: req.fromDeg, tideM: req.tideM };
}

/**
 * The onset record (breaking.ONSET_RECORD_LENGTH per node), in one march in arrival order, semi-Lagrangian: each node
 * reads the record RUN_BACK_CELLS back along its ray (bilinear between nodes that arrived earlier). Its running maximum R
 * of amp/hminBreak is the larger of its own ratio and R back there: it (all but) never falls along a ray. (The upwind
 * two-neighbour mean the flux uses averaged the x and z neighbours of an oblique ray, and the maximum faded along it, 6%
 * by 70 m inshore of the peak.) Per breaking level q: unbroken here (R < q), the time since onset is 0 and the throw's
 * height is the node's own (a section breaking now); broken back there too, both are carried (the time grows by the
 * arrival time between, and the throw's height takes the node's while the time is within LIP_THROW_S); broken in between,
 * it broke where R crossed q (linear between the two), and the time and the throw's height start there. Off the grid's
 * march (a boundary or fixed node) a node breaks at itself.
 */
/** How far back along its ray (cells) a node reads the record: past its own cell, so every node read arrived earlier. */
const RUN_BACK_CELLS = 2;
/** How far (fraction) the running maximum dips under a level between rays (≤ 2% measured) and still counts as broken there. */
const RUN_DIP = 0.03;

function computeOnsetRecord(f: {
  grid: GridSpec; tau: Float32Array; amp: Float32Array; hmin: Float32Array; hminBreak: Float32Array; k: Float32Array; dirX: Float32Array;
  dirZ: Float32Array; fixed: Uint8Array; order: Uint32Array; omega: number;
}): Float32Array {
  const { grid, dirX, dirZ } = f;
  const { nx, nz } = grid;
  const n = nx * nz, R = ONSET_RECORD_LENGTH;
  const out = new Float32Array(n * R);
  // One bilinear cell for everything read back there.
  const xMax = (nx - 1) * grid.cellM, zMax = (nz - 1) * grid.cellM;
  let ci = 0, wx = 0, wz = 0;
  const cell = (x: number, z: number): void => {
    const fx = Math.min(nx - 1, Math.max(0, (Math.min(xMax, Math.max(0, x - grid.x0))) / grid.cellM));
    const fz = Math.min(nz - 1, Math.max(0, (Math.min(zMax, Math.max(0, z - grid.z0))) / grid.cellM));
    const c = Math.min(nx - 2, Math.floor(fx)), r = Math.min(nz - 2, Math.floor(fz));
    ci = r * nx + c; wx = fx - c; wz = fz - r;
  };
  const lerp = (a: ArrayLike<number>, stride = 1, off = 0): number => {
    const i00 = ci * stride + off, i10 = (ci + 1) * stride + off, i01 = (ci + nx) * stride + off, i11 = (ci + nx + 1) * stride + off;
    const top = a[i00] + (a[i10] - a[i00]) * wx, bottom = a[i01] + (a[i11] - a[i01]) * wx;
    return top + (bottom - top) * wz;
  };
  const back = RUN_BACK_CELLS * grid.cellM;
  // The throw's height factor for level k: the amplification, capped by the depth as the sheet caps a crest.
  const capOf = ONSET_LEVEL_Q.map((_, k) => BREAKING_RATIO / onsetLevelHeight(k));
  const throwAt = (amp: number, hmin: number, k: number): number => Math.min(amp, capOf[k] * hmin);
  for (let o = 0; o < n; o++) {
    const i = f.order[o];
    const col = i % nx, row = (i - col) / nx, base = i * R;
    const own = f.hminBreak[i] > 0 ? f.amp[i] / f.hminBreak[i] : 0;
    const x = grid.x0 + col * grid.cellM - dirX[i] * back, z = grid.z0 + row * grid.cellM - dirZ[i] * back;
    const inside = !f.fixed[i] && x >= grid.x0 && z >= grid.z0 && x <= grid.x0 + (nx - 1) * grid.cellM && z <= grid.z0 + (nz - 1) * grid.cellM;
    if (!inside) {
      out[base] = own;
      for (let k = 0; k < ONSET_LEVELS; k++) out[base + 2 + 2 * k] = throwAt(f.amp[i], f.hmin[i], k);
      continue;
    }
    cell(x, z);
    const runB = lerp(out, R, 0), tauB = lerp(f.tau), ampB = lerp(f.amp), hminB = lerp(f.hmin);
    const run = Math.max(own, runB), dTau = f.tau[i] - tauB;
    out[base] = run;
    for (let k = 0; k < ONSET_LEVELS; k++) {
      const q = ONSET_LEVEL_Q[k];
      // Broken back there: its ratio reached q, or its clock is running and its ratio is within RUN_DIP of q (where the
      // running maximum dips a hair under q between rays, the clock would otherwise restart; further below, a running
      // clock is a broken neighbour's, blended in).
      const tbB = lerp(out, R, 1 + 2 * k);
      const brokenB = runB >= q || (tbB > 0 && runB >= q * (1 - RUN_DIP));
      const here = throwAt(f.amp[i], f.hmin[i], k);
      if (run < q && !brokenB) {
        out[base + 2 + 2 * k] = here;
      } else if (brokenB) {
        const tb = tbB + dTau, thrownB = lerp(out, R, 2 + 2 * k);
        out[base + 1 + 2 * k] = tb;
        out[base + 2 + 2 * k] = tb <= LIP_THROW_S ? Math.max(thrownB, here) : thrownB;
      } else {
        const fr = (q - runB) / (run - runB);
        out[base + 1 + 2 * k] = (1 - fr) * dTau;
        const atOnset = throwAt(ampB + fr * (f.amp[i] - ampB), hminB + fr * (f.hmin[i] - hminB), k);
        out[base + 2 + 2 * k] = Math.max(atOnset, here);
      }
    }
  }
  return out;
}

/**
 * The onset record at world (x, z): ONSET_RECORD_LENGTH values (bilinear between nodes) into `out`, or null outside the
 * grid (there is no record there: breaking.lifecycle falls back to the breaking ratio alone).
 */
export function sampleOnset(f: ReefField, x: number, z: number, out = new Float32Array(ONSET_RECORD_LENGTH)): Float32Array | null {
  const g = f.grid;
  if (!(x >= g.x0 && z >= g.z0 && x <= g.x0 + (g.nx - 1) * g.cellM && z <= g.z0 + (g.nz - 1) * g.cellM)) return null;
  const fx = Math.min(g.nx - 1, (x - g.x0) / g.cellM), fz = Math.min(g.nz - 1, (z - g.z0) / g.cellM);
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * g.nx + c;
  const R = ONSET_RECORD_LENGTH, rec = f.onset;
  for (let j = 0; j < R; j++) {
    const top = rec[i * R + j] + (rec[(i + 1) * R + j] - rec[i * R + j]) * tx;
    const bottom = rec[(i + g.nx) * R + j] + (rec[(i + g.nx + 1) * R + j] - rec[(i + g.nx) * R + j]) * tx;
    out[j] = top + (bottom - top) * tz;
  }
  return out;
}

function sampleInside(f: ReefField, x: number, z: number): FieldSample {
  const g = f.grid;
  const dirX = bilinear(f.dirX, g, x, z), dirZ = bilinear(f.dirZ, g, x, z);
  const len = Math.hypot(dirX, dirZ) || 1;
  return {
    tau: bilinear(f.tau, g, x, z), amp: bilinear(f.amp, g, x, z), hmin: bilinear(f.hmin, g, x, z), hminBreak: bilinear(f.hminBreak, g, x, z), hminSlurp: bilinear(f.hminSlurp, g, x, z),
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
