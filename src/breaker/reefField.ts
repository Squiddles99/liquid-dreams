import type { Bathymetry } from '../seabed/bathymetry';
import { smoothstep } from '../math/smoothstep';
import type { GridSpec } from '../seabed/wombReef';
import { BREAKING_RATIO, LIP_THROW_S, ONSET_DELAY_OFFSET, ONSET_SIZE_OFFSET, ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH, ONSET_PSI_OFFSET, ONSET_UNTIL_OFFSET, UNTIL_NEVER, breakingDepth, onsetLevelHeight } from './breaking';
import { type FarField, computeFarField, farSample } from './coastFarField';
import { solveWaveField } from './waveField';
import { type CoastField, coastDrawn, coastSeed, computeCoastField, mixSamples } from './coastField';
import type { FieldSample } from './fieldSample';
import { PEEL_NEIGHBOUR_CELLS, breakingLines, curlTimes } from './curlClock';

export interface ReefFieldRequest {
  /** The seabed on the field grid (1 m in the app: downsample(bathymetry, 2)). */
  bed: Bathymetry;
  periodS: number;
  fromDeg: number;
  tideM: number;
  /** The peel stretch (≥ 1; 1 = physics; BreakParams.peel): each part of the line breaks this much later after the part
   * up the line than the reef alone says (spec 2026-10-04 §1). Absent: 1. */
  peel?: number;
  /** The curl's top speed along the crest (m/s; BreakParams.curlMaxMs, one-curl spec §3d). Absent: CURL_MAX_MS_DEFAULT. */
  curlMaxMs?: number;
  /** true: the sea's height, direction, depth cap and arrival time smoothed for drawing (smoothFieldAmplitude), as the game
   * draws it; the breaking ratios are unchanged. Absent: as solved. */
  smooth?: boolean;
  /** The swell bends (the arrival time's slowness) as though the water were never shallower than this (m): REFRACT_FLOOR_M
   * in the game. Absent: the depth itself. Its height, shoaling and breaking still read the real depth. */
  refractFloorM?: number;
  /** The coast map (coastMap.buildCoastMap) on COAST_GRID: the coast field is solved over it first and seeds this field
   * at its boundary (lineup truth spec §3c), and rides along in the reply. Absent: seeded by the 1-D far field. */
  coast?: Bathymetry;
  /** The coast field already solved over `coast` (the worker caches it across requests that keep the swell and the tide).
   * Its clock is moved onto this field's, so pass a copy you can give away. */
  coastField?: CoastField;
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
  /** The front's lean's breaking depth (≤ hminSlurp): amp / the gain its front feels ahead, slurped (gainAhead; FieldSample.hminLean). */
  hminLean: Float32Array;
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
  /** The coast field, on this field's clock (ReefFieldRequest.coast); absent when the request had no coast. */
  coast?: CoastField;
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
/** The crest-line spread may lift a node's breaking gain at most this much above its own (R1 §2). */
export const SPREAD_LIFT_MAX = 1.2;
/** A node whose own gain (amp / breaking depth, ∝ the breaking ratio at unit height) is at least this is on the face: the
 * spread is free there. */
export const SPREAD_FREE_GAIN = 0.2;

/**
 * The slurp (Andrew): as a section stands up it draws the reef's water into itself, and the swell line either side is
 * part of that. The drain reads, at each node, the strongest breaking gain along its crest line within 2·SLURP_REACH_M,
 * weighted exp(−s / SLURP_REACH_M) by its distance s along the line: fully at the section itself, 37% at SLURP_REACH_M
 * (100 m: with the barrel's deeper trough drain, 80 m left 1.06 m per 5 m of crest where it ended).
 * Exponential, not Gaussian: the drain saturates (full from ρ ≈ 1.3), and a Gaussian took a peak's ratio of 3 through the
 * drain's whole ramp in ~15 m of crest, a wall at each end of a flat-bottomed bowl; an exponential spends 0.7 reaches on it.
 * A bigger swell stands further past breaking at the peak, and so slurps further along the line.
 */
export const SLURP_REACH_M = 100;
/** The slurp's samples along the crest line are this far apart (m). */
const SLURP_STEP_M = 2;

/**
 * ψ₀ from the reef's step (plan 2026-10-02, Andrew's ruling at its Gate 1): Pick & Feddersen's ψ₀ = s / (H₀/h₀)^¼ read the
 * reef face's slope, and a face steep enough to hold 12 ft at the take-off (about 1:3, far past the fits' 1:10) made every
 * wave a slab. The step is how hard the reef stands a wave up instead: the still water where it breaks over the
 * shallowest within STEP_AHEAD depths ahead (Andrew's measure, 2026-09-30: low tide ≈ 2.6, mid 2.2, high 1.9 at the peak).
 * 2.5, not 1.5, on the satellite reef (2026-10-05): a 12 ft set wave starts breaking 25–45 m out from the edge, over the
 * face's 18 m foot, and 1.5 depths ahead never reached the ledge, so the biggest days read as a gentle wave all along the
 * left; small days, breaking on the shelf, look only a few metres further.
 */
export const STEP_AHEAD = 2.5;
/**
 * The step is smoothed along the crest by a Gaussian of this σ (m): light, because the peak is a narrow wedge (at the
 * breaking depth's σ BREAKING_SMOOTHING_M, 12 ft's ideal ψ fell from 0.089 to 0.074; taking the largest first lifted 6 ft's
 * ideal day from the cylinder Andrew approved to thrown).
 */
export const STEP_SMOOTHING_M = 2;
/** The step's samples along the ray are this far apart (m): the field's cell. */
export const STEP_SAMPLE_M = 1;
/**
 * Andrew's step anchors (2026-09-30: 1.3 gentle, 1.85 normal, 2.25 heavy) on the sheet's ψ anchors (SHEET_POINTS: oval,
 * cylinder, thrown); linear between, in proportion below the first, the last segment's slope past the last. The step
 * column is his × 0.57 (R1 §2, 2026-10-06): with the wave breaking on the face in about 0.8 × its height of water
 * instead of 0.44, the step reads 2.5 breaking depths ahead of a much shallower onset and every step read smaller (6 ft
 * mid tide fell to hollow 0); 0.57 puts 6 ft mid at 0.82 and 8 ft at 1.0 with 4 ft below 0.6 (0.59). Every step is ≥ 1,
 * so nothing now reads below about 0.45 hollow.
 */
export const STEP_PSI_POINTS: readonly (readonly [number, number])[] = [[0.741, 0.035], [1.0545, 0.065], [1.2825, 0.09]];

/** The step at a point of still-water depth d0 (depthAlong(s): s metres ahead along its ray): never below 1. */
export function reefStep(depthAlong: (s: number) => number, d0: number): number {
  if (!(d0 > 0)) return 1;
  let shallowest = d0;
  for (let s = STEP_SAMPLE_M; s <= STEP_AHEAD * d0 + 1e-9; s += STEP_SAMPLE_M) shallowest = Math.min(shallowest, depthAlong(s));
  return shallowest > 0 ? Math.max(1, d0 / shallowest) : 1;
}

/** ψ₀ for a step (STEP_PSI_POINTS); a non-finite step reads as none (1). */
export function psiFromStep(step: number): number {
  const s = Number.isFinite(step) ? step : 1, P = STEP_PSI_POINTS, last = P.length - 1;
  if (s <= P[0][0]) return (P[0][1] * Math.max(0, s)) / P[0][0];
  for (let i = 0; i < last; i++) if (s <= P[i + 1][0]) return P[i][1] + ((s - P[i][0]) * (P[i + 1][1] - P[i][1])) / (P[i + 1][0] - P[i][0]);
  return P[last][1] + ((s - P[last][0]) * (P[last][1] - P[last - 1][1])) / (P[last][0] - P[last - 1][0]);
}

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

/** The front's lean reads the gain ahead along the ray in steps this long (m). */
const AHEAD_STEP_M = 2;

/**
 * The gain a wave's front feels ahead of its crest (Andrew's "bump", 2026-10-02): the largest of a(s) × (1 − s/L) for s
 * from 0 to L = half the local wavelength (π/k) along the ray, so the reef counts in full under the crest and not at all
 * at the front's far end. The front's lean (setWaveModel.leanWeight) reads it: on the reef build's 1:3 face a crest's own
 * ratio climbed into the lean's window only in its last second, so its unleaned front reached the water ahead first
 * and lifted it 0.5–2.7 m before the lean and the drain pulled it down into the face. The front spans half a
 * wavelength ahead of the crest, and where there is reef under it, it leans: the trough has moved in to the face's foot
 * by the time the front would have reached a surfer in front.
 */
export function gainAhead(a: Float32Array, dirX: Float32Array, dirZ: Float32Array, k: Float32Array, grid: GridSpec): Float32Array {
  const { nx, cellM } = grid;
  const out = new Float32Array(a.length);
  const at = bilinearCells(a, grid);
  for (let i = 0; i < a.length; i++) {
    const col = i % nx, row = (i - col) / nx, L = Math.PI / k[i], tx = dirX[i] / cellM, tz = dirZ[i] / cellM;
    let m = a[i];
    for (let s = AHEAD_STEP_M; s < L; s += AHEAD_STEP_M) m = Math.max(m, at(col + tx * s, row + tz * s) * (1 - s / L));
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

/**
 * `a` smoothed along the travel direction but only from the seaward side: each node averages itself and the nodes up
 * its own ray (against the travel), a half Gaussian of σ = sigmaM. The ledge's gain then reaches shoreward, down the
 * ray, and never lifts a node seaward of it (R1 §2: the symmetric smoothing declared the wave broken 8 m out in deep water).
 */
export function smoothAlongTravelBehind(a: Float32Array, dirX: Float32Array, dirZ: Float32Array, grid: GridSpec, sigmaM: number): Float32Array {
  const { nx, cellM } = grid;
  const out = new Float32Array(a.length);
  const sigma = sigmaM / cellM, step = Math.max(1, sigma / 3), R = Math.ceil((3 * sigma) / step);
  const at = bilinearCells(a, grid);
  for (let i = 0; i < a.length; i++) {
    const col = i % nx, row = (i - col) / nx, tx = -dirX[i] * step, tz = -dirZ[i] * step;
    let w = 0, sum = 0;
    for (let j = 0; j <= R; j++) {
      const g = Math.exp(-0.5 * ((j * step) / sigma) ** 2);
      w += g; sum += g * at(col + j * tx, row + j * tz);
    }
    out[i] = sum / w;
  }
  return out;
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

/**
 * The sea's height and direction smoothed over this σ (m) across the grid (smoothFieldAmplitude): the rays' amplitude
 * crosses and focuses into streaks over the inside reef (0.24 to 1.67 of the offshore height 5 m apart, the direction
 * swinging 50°), which stood on the sheet as a field of short ridges (Andrew, 2026-10-05: "waves going in everywhere").
 * Real waves spread their energy along the crest (diffraction) and do not keep a ray streak.
 */
export const FIELD_SMOOTHING_M = 6;
/**
 * The arrival time τ smoothed over this σ (m): where the swell bent round the two ledges meets, τ (the earlier of two
 * arrivals) has kinks, and each kink moved the crest ~2 m and stood a 0.3 m spike on the sheet, a comb of short ridges
 * 6–13 m apart inshore of the peak. Rounded over a few metres the crest passes them smoothly; the phase moves < 0.1 s.
 */
export const TAU_SMOOTHING_M = 12;
/**
 * The game's swell bends as though the reef were never shallower than this (m). Over the 3.5 m shelf the linear wave slows
 * to 40% of its speed off the face, and the first-arrival solve turned the crest a right angle at the ledge: the breaking
 * section ran off from the peak square to the main swell line (Andrew, 2026-10-05: "the wave goes into a right angle").
 * A breaking wave and its bore run faster than the linear wave over shallow water (√(g(h + H))), and a real crest cannot
 * hold a corner (diffraction); bent as over 10 m, with τ rounded over TAU_SMOOTHING_M, the crest turns gently instead.
 */
export const REFRACT_FLOOR_M = 10;
/**
 * The onset record's time since onset smoothed along the crest over this σ (m), for the game (smoothFieldAmplitude): it
 * steps where neighbouring rays broke or were held seconds apart (3.4 s over 4 m of crest where the peel stretch's hold
 * meets its cap, on Andrew's satellite reef), and the sea's white water, settling on that clock (wombSection.boreWeight),
 * stood a crease along the swell's travel at every step. The ribbon already smooths its stations' numbers along the crest
 * (crestTrace.SECTION_SMOOTHING_M).
 */
export const ONSET_SMOOTHING_M = 8;

/** Each level's time since onset smoothed along the crest over sigmaM (as smoothAlongCrest), among the nodes where that
 * level broke (the record's running maximum at least its q); a node keeps its own where it hasn't broken. */
export function smoothOnsetTimes(field: ReefField, sigmaM = ONSET_SMOOTHING_M): void {
  const { grid, onset, dirX, dirZ } = field;
  const { nx, nz, cellM } = grid, n = nx * nz, R = ONSET_RECORD_LENGTH;
  const sigma = sigmaM / cellM, step = Math.max(1, sigma / 3), J = Math.ceil((3 * sigma) / step);
  const w = Array.from({ length: 2 * J + 1 }, (_, j) => Math.exp(-(((j - J) * step) ** 2) / (2 * sigma * sigma)));
  const masked = new Float32Array(n), mask = new Float32Array(n), out = new Float32Array(n);
  for (let k = 0; k < ONSET_LEVELS; k++) {
    const q = ONSET_LEVEL_Q[k], slot = 1 + 2 * k;
    for (let i = 0; i < n; i++) {
      const t = onset[i * R + slot], m = onset[i * R] >= q && Number.isFinite(t) ? 1 : 0;
      mask[i] = m; masked[i] = m * (m ? t : 0);
    }
    const atT = bilinearCells(masked, grid), atM = bilinearCells(mask, grid);
    for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) {
      const i = row * nx + col;
      if (!mask[i]) { out[i] = onset[i * R + slot]; continue; }
      const tx = -dirZ[i], tz = dirX[i];
      let sum = 0, ws = 0;
      for (let j = -J; j <= J; j++) { const fx = col + j * step * tx, fz = row + j * step * tz; sum += w[j + J] * atT(fx, fz); ws += w[j + J] * atM(fx, fz); }
      out[i] = ws > 1e-6 ? sum / ws : onset[i * R + slot];
    }
    for (let i = 0; i < n; i++) onset[i * R + slot] = out[i];
  }
  // The time until onset the same way, among the nodes whose ray breaks (under UNTIL_NEVER): the wall down the line stands
  // on it, and over reef heads it steps between neighbouring rays as the onset time does.
  for (let k = 0; k < ONSET_LEVELS; k++) {
    const slot = ONSET_UNTIL_OFFSET + k;
    for (let i = 0; i < n; i++) {
      const t = onset[i * R + slot], m = t < UNTIL_NEVER ? 1 : 0;
      mask[i] = m; masked[i] = m * (m ? t : 0);
    }
    const atT = bilinearCells(masked, grid), atM = bilinearCells(mask, grid);
    for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) {
      const i = row * nx + col;
      if (!mask[i]) { out[i] = onset[i * R + slot]; continue; }
      const tx = -dirZ[i], tz = dirX[i];
      let sum = 0, ws = 0;
      for (let j = -J; j <= J; j++) { const fx = col + j * step * tx, fz = row + j * step * tz; sum += w[j + J] * atT(fx, fz); ws += w[j + J] * atM(fx, fz); }
      out[i] = ws > 1e-6 ? sum / ws : onset[i * R + slot];
    }
    for (let i = 0; i < n; i++) onset[i * R + slot] = out[i];
  }
}

/**
 * Smooths `field`'s amplitude, direction and shallowest depth so far (hmin, the cap on a wave's height there:
 * setWaveModel.localHeight) in place by a Gaussian of σ = sigmaM (separable, over the grid), and its arrival time τ by
 * σ = tauSigmaM. The breaking depths are scaled by the same factor as the amplitude, so each cell's breaking ratios
 * (amplitude over depth) are unchanged: where and when the waves break, and the onset record, stay as they were. hmin
 * dips in a streak behind every reef head a ray crossed (2.6 m to 1.7 m and back within 3 m), and the height capped on
 * it stood a comb of 0.3 m ridges on the sheet; a real wave fills that shadow back in along its crest.
 */
export function smoothFieldAmplitude(field: ReefField, sigmaM = FIELD_SMOOTHING_M, tauSigmaM = TAU_SMOOTHING_M, onsetSigmaM = ONSET_SMOOTHING_M): void {
  const { nx, nz, cellM } = field.grid;
  const s = sigmaM / cellM, r = Math.ceil(3 * s);
  const kern = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * s * s)));
  const blur = (src: Float32Array): Float32Array => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      let a = 0, w = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx < 0 || xx >= nx) continue; a += kern[k + r] * src[z * nx + xx]; w += kern[k + r]; }
      tmp[z * nx + x] = a / w;
    }
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      let a = 0, w = 0;
      for (let k = -r; k <= r; k++) { const zz = z + k; if (zz < 0 || zz >= nz) continue; a += kern[k + r] * tmp[zz * nx + x]; w += kern[k + r]; }
      out[z * nx + x] = a / w;
    }
    return out;
  };
  const amp = blur(field.amp), dx = blur(field.dirX), dz = blur(field.dirZ), hmin = blur(field.hmin);
  if (tauSigmaM > 0) {
    const ts = tauSigmaM / cellM, tr = Math.ceil(3 * ts);
    const tk = Array.from({ length: 2 * tr + 1 }, (_, i) => Math.exp(-((i - tr) ** 2) / (2 * ts * ts)));
    const src = field.tau, tmp = new Float32Array(src.length);
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      let a = 0, w = 0;
      for (let k = -tr; k <= tr; k++) { const xx = x + k; if (xx < 0 || xx >= nx) continue; a += tk[k + tr] * src[z * nx + xx]; w += tk[k + tr]; }
      tmp[z * nx + x] = a / w;
    }
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      let a = 0, w = 0;
      for (let k = -tr; k <= tr; k++) { const zz = z + k; if (zz < 0 || zz >= nz) continue; a += tk[k + tr] * tmp[zz * nx + x]; w += tk[k + tr]; }
      src[z * nx + x] = a / w;
    }
  }
  for (let i = 0; i < amp.length; i++) {
    const f = field.amp[i] > 1e-6 ? amp[i] / field.amp[i] : 1;
    field.hminBreak[i] *= f; field.hminSlurp[i] *= f; field.hminLean[i] *= f;
    field.hmin[i] = hmin[i];
    field.amp[i] = amp[i];
    const l = Math.hypot(dx[i], dz[i]);
    if (l > 1e-6) { field.dirX[i] = dx[i] / l; field.dirZ[i] = dz[i] / l; }
  }
  smoothOnsetTimes(field, onsetSigmaM);
}

export function computeReefField(req: ReefFieldRequest): ReefField {
  const { grid } = req.bed;
  const { nx, nz, cellM } = grid;
  const n = nx * nz;
  const omega = (2 * Math.PI) / req.periodS;
  const coast = req.coastField ?? (req.coast ? computeCoastField({ bed: req.coast, periodS: req.periodS, fromDeg: req.fromDeg, tideM: req.tideM, refractFloorM: req.refractFloorM }) : undefined);
  const far = coast ? coast.far : computeFarField(req.periodS, req.fromDeg, req.tideM);
  const seed = coast ? coastSeed(coast, far) : (x: number, z: number) => farSample(far, x, z);
  const { depth, k, tau, dirX, dirZ, amp, hmin, fixed, order } = solveWaveField(req.bed, omega, req.tideM, seed, { refractFloorM: req.refractFloorM });

  // Normalise so the crest reaches the peak at τ = 0.
  const tauPeak = bilinear(tau, grid, 0, 0);
  const tau32 = new Float32Array(n);
  for (let i = 0; i < n; i++) tau32[i] = tau[i] - tauPeak;
  // One clock for the reef, the coast and the far field (the seed's τ was already on the far field's, offset or not).
  far.tauOffset += tauPeak;
  if (coast) for (let i = 0; i < coast.tau.length; i++) coast.tau[i] -= tauPeak;
  // The breaking ratio is ∝ amp/depth (above its floor): smoothing that, not the depth, smooths the ratio itself.
  const gain = new Float32Array(n);
  for (let i = 0; i < n; i++) gain[i] = amp[i] / breakingDepth(hmin[i]);
  const near = smoothAlongCrest(maxAlongCrest(gain, dirX, dirZ, grid, BREAK_REACH_M), dirX, dirZ, grid, BREAK_SMOOTHING_M);
  const tail = smoothAlongCrest(gain, dirX, dirZ, grid, BREAK_TAIL_M);
  // The crest-line spread smooths the ratio's jitter; it may not lift a node's gain more than SPREAD_LIFT_MAX above its own
  // unless the node is already near breaking (R1 §2: the tail's σ 20 m reached 7 m across the ledge and moved the onset out).
  for (let i = 0; i < n; i++) {
    const lifted = Math.max(near[i], tail[i]);
    near[i] = gain[i] >= SPREAD_FREE_GAIN ? lifted : Math.min(lifted, gain[i] * SPREAD_LIFT_MAX);
  }
  const smoothGain = smoothAlongTravelBehind(near, dirX, dirZ, grid, BREAK_TRAVEL_SMOOTHING_M);
  const hminBreak = new Float32Array(n);
  for (let i = 0; i < n; i++) hminBreak[i] = smoothGain[i] > 0 ? amp[i] / smoothGain[i] : breakingDepth(hmin[i]);
  const slurp = slurpAlongCrest(smoothGain, dirX, dirZ, grid, SLURP_REACH_M);
  const hminSlurp = new Float32Array(n);
  for (let i = 0; i < n; i++) hminSlurp[i] = slurp[i] > 0 ? Math.min(hminBreak[i], amp[i] / slurp[i]) : hminBreak[i];
  // The front's lean: the gain its front feels ahead (gainAhead), slurped along the crest as the drain's is, so the
  // shoulders beside a section about to stand up lean with it (at the peak's first break, 23 m outside the ledge, its own
  // ratio is ~1 and its slurp no longer reached 45–100 m along the north shoulder; Andrew, 2026-10-02).
  const leanGain = slurpAlongCrest(gainAhead(smoothGain, dirX, dirZ, k, grid), dirX, dirZ, grid, SLURP_REACH_M);
  const hminLean = new Float32Array(n);
  for (let i = 0; i < n; i++) hminLean[i] = Math.min(hminSlurp[i], leanGain[i] > 0 ? amp[i] / leanGain[i] : hminSlurp[i]);
  // ψ₀ at every node (plan 2026-10-02): from the reef's step there, lightly smoothed along the crest (STEP_SMOOTHING_M) so
  // small reef bumps don't make the lip ragged; the same at every level (the record keeps the one where each level broke).
  const depthAt = bilinearCells(depth, grid);
  const rawStep = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const col = i % nx, row = (i - col) / nx, dx = dirX[i] / cellM, dz = dirZ[i] / cellM;
    rawStep[i] = reefStep((s) => depthAt(col + dx * s, row + dz * s), depth[i]);
  }
  const step = smoothAlongCrest(rawStep, dirX, dirZ, grid, STEP_SMOOTHING_M);
  const psiHere = new Float32Array(n * ONSET_LEVELS);
  for (let i = 0; i < n; i++) psiHere.fill(psiFromStep(step[i]), i * ONSET_LEVELS, (i + 1) * ONSET_LEVELS);
  const onset = computeOnsetRecord({ grid, tau: tau32, amp, hmin, hminBreak, k, dirX, dirZ, fixed, order, omega, psiHere, peel: req.peel ?? 1, curlMaxMs: req.curlMaxMs ?? CURL_MAX_MS_DEFAULT });
  const field: ReefField = { grid, tau: tau32, amp, hmin, hminBreak, hminSlurp, hminLean, k, dirX, dirZ, depth, onset, far, omega, periodS: req.periodS, fromDeg: req.fromDeg, tideM: req.tideM, ...(coast ? { coast } : {}) };
  if (req.smooth) smoothFieldAmplitude(field);
  return field;
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
/** The peel stretch links a level's onset nodes this many cells apart into one breaking section (curlClock's, shared). */
export { PEEL_NEIGHBOUR_CELLS };
/** The curl's top speed along the crest (m/s) when the request names none (BreakParams.curlMaxMs's default). */
export const CURL_MAX_MS_DEFAULT = 40;
/** Where a breaking section meets one that broke less than this (s) earlier, they are one line (peelLines). */
export const PEEL_MERGE_S = 1.5;
/** A held section's turn comes at most this long (s) after the reef broke it, so a held wall never runs on into the
 * shallows (at 5.5 ft the left's last section waits ~6 s). (A cap on the ratio instead undid the stretch: on the ledge
 * the ratio climbs past 1.6× its level within metres of breaking.) */
export const PEEL_MAX_HOLD_S = 6;
/** A curl time less than this (s) after a ray's own onset is no hold: the record's float32 rounding as the march carries
 * the clock along the ray (~2e-5 s), which held every ray of a line the curl left alone. */
const HOLD_EPS_S = 1e-3;
/** How far back along its ray (cells) a node reads the record: past its own cell, so every node read arrived earlier. */
const RUN_BACK_CELLS = 2;
/** How far (fraction) the running maximum dips under a level between rays (≤ 2% measured) and still counts as broken there. */
export const RUN_DIP = 0.03;

export function computeOnsetRecord(f: {
  grid: GridSpec; tau: Float32Array; amp: Float32Array; hmin: Float32Array; hminBreak: Float32Array; k: Float32Array; dirX: Float32Array;
  dirZ: Float32Array; fixed: Uint8Array; order: Uint32Array; omega: number; psiHere: Float32Array; peel?: number;
  /** The curl's top speed along the crest (m/s; BreakParams.curlMaxMs). Absent: CURL_MAX_MS_DEFAULT. */
  curlMaxMs?: number;
  /** Test only: false leaves the curl pass out (one march at peel 1, as before one-curl). */
  curl?: boolean;
}): Float32Array {
  const { grid, dirX, dirZ } = f;
  const { nx, nz } = grid;
  const n = nx * nz, R = ONSET_RECORD_LENGTH, S = ONSET_PSI_OFFSET;
  let out = new Float32Array(n * R);
  const D = ONSET_DELAY_OFFSET, Z = ONSET_SIZE_OFFSET, stretch = Math.max(1, f.peel ?? 1) - 1;
  const curl = f.curl ?? true, curlMaxMs = f.curlMaxMs ?? CURL_MAX_MS_DEFAULT;
  // Each level's onset time T = τ − tb at its onset nodes (NaN elsewhere). Between the two marches each onset node gets its
  // curl time T′ (curlClock: the peel stretch's time from its section's first break, then one curl along each breaking
  // line); the second march carries T′ along the rays (NaN where unbroken) and delays each ray from its physical onset to it.
  const onsetT = new Float32Array(n * ONSET_LEVELS).fill(Number.NaN);
  let curlT: Float32Array | null = null;
  const tc = new Float32Array(n * ONSET_LEVELS).fill(Number.NaN);
  /** The delay of a ray that broke at T whose curl time is Tc (the hold, capped at PEEL_MAX_HOLD_S; under HOLD_EPS_S it is
   * the float32 record's rounding along the ray, not a hold). */
  const delayFrom = (T: number, Tc: number): number => (Number.isFinite(Tc) && Tc - T > HOLD_EPS_S ? Math.min(Tc - T, PEEL_MAX_HOLD_S) : 0);
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
  /** The curl time back there for level k: bilinear over the corners that carry one. (Carrying the delay itself aliased
   * where the rays cross the grid at an angle: 0.25 s beside 2 s along the onset band, and the left peeled 1.4× slower for
   * a 1.7 dial; the time of the curl's arrival is what the ray carries.) */
  const curlBack = (k: number): number => {
    let sum = 0, weight = 0;
    const corners = [[ci, (1 - wx) * (1 - wz)], [ci + 1, wx * (1 - wz)], [ci + nx, (1 - wx) * wz], [ci + nx + 1, wx * wz]] as const;
    for (const [c, w] of corners) {
      const v = tc[c * ONSET_LEVELS + k];
      if (w > 0 && Number.isFinite(v)) { sum += w * v; weight += w; }
    }
    return weight > 0 ? sum / weight : Number.NaN;
  };
  /** A higher level's curl comes no sooner than the level below's on the same ray (each level's curl runs on its own line:
   * a pocket held at one level and not the next would break the higher level first there). */
  const afterLower = (i: number, k: number, Tc: number): number => {
    const lower = k > 0 ? tc[i * ONSET_LEVELS + k - 1] : Number.NaN;
    return Number.isFinite(lower) && !(Tc >= lower) ? lower : Tc;
  };
  const back = RUN_BACK_CELLS * grid.cellM;
  // The throw's height factor for level k: the amplification, capped by the depth as the sheet caps a crest.
  const capOf = ONSET_LEVEL_Q.map((_, k) => BREAKING_RATIO / onsetLevelHeight(k));
  const throwAt = (amp: number, hmin: number, k: number): number => Math.min(amp, capOf[k] * hmin);
  // The march (in arrival order). It runs twice: once without delays, to find where and when each ray breaks (and so each
  // breaking line's first break and curl: curlPass); then once more, delaying every ray's onset to its curl time.
  const march = (): void => {
    for (let o = 0; o < n; o++) {
      const i = f.order[o];
      const col = i % nx, row = (i - col) / nx, base = i * R;
      const own = f.hminBreak[i] > 0 ? f.amp[i] / f.hminBreak[i] : 0;
      const x = grid.x0 + col * grid.cellM - dirX[i] * back, z = grid.z0 + row * grid.cellM - dirZ[i] * back;
      const inside = !f.fixed[i] && x >= grid.x0 && z >= grid.z0 && x <= grid.x0 + (nx - 1) * grid.cellM && z <= grid.z0 + (nz - 1) * grid.cellM;
      // A boundary or fixed node breaks at itself and stays out of the peel stretch (physical timing): along the grid's
    // edge such nodes broke one after another and chained into one long section held up to PEEL_MAX_HOLD_S, a seam beside
    // the rays inside.
    if (!inside) {
        out[base] = own;
        for (let k = 0; k < ONSET_LEVELS; k++) {
          out[base + 2 + 2 * k] = throwAt(f.amp[i], f.hmin[i], k);
          out[base + S + k] = f.psiHere[i * ONSET_LEVELS + k];
          out[base + Z + k] = f.amp[i];

        }
        continue;
      }
      cell(x, z);
      const runB = lerp(out, R, 0), tauB = lerp(f.tau), ampB = lerp(f.amp), hminB = lerp(f.hmin);
      const run = Math.max(own, runB), dTau = f.tau[i] - tauB;
      out[base] = run;
      for (let k = 0; k < ONSET_LEVELS; k++) {
        const q = ONSET_LEVEL_Q[k];
        // Back there: the stretched time since onset tbS and the delay d (tbS + d is the physical time). Broken back there:
        // its ratio reached q, or its physical clock is running and its ratio is within RUN_DIP of q (where the running
        // maximum dips a hair under q between rays, the clock would otherwise restart; further below, a running clock is a
        // broken neighbour's, blended in).
        const tbSB = lerp(out, R, 1 + 2 * k), dB = lerp(out, R, D + k);
        const brokenB = runB >= q || (tbSB + dB > 0 && runB >= q * (1 - RUN_DIP));
        const here = throwAt(f.amp[i], f.hmin[i], k);
        if (run < q && !brokenB) {
          out[base + 2 + 2 * k] = here;
          out[base + S + k] = f.psiHere[i * ONSET_LEVELS + k];
          // Unbroken: the amplification where the running maximum was last raised (here, or carried), so a wave read
          // between this level and a broken one below (onsetSize, toRun) reads a size that stays put once the ratio
          // stops climbing, and meets the crossing's own when the level breaks.
          out[base + Z + k] = own >= runB ? f.amp[i] : lerp(out, R, Z + k);
        } else if (brokenB) {
          // The physical clock is carried as before (tbS + d, bilinear), so the ray's own onset time is τ − tb; its delay
          // comes from that and its line's first break, carried along the ray.
          const tbP = tbSB + dB + dTau, Tc = curlT ? afterLower(i, k, curlBack(k)) : Number.NaN, d = delayFrom(f.tau[i] - tbP, Tc);
          if (curlT) tc[i * ONSET_LEVELS + k] = Tc;
          const tbS = tbP - d;
          out[base + 1 + 2 * k] = tbS;
          out[base + D + k] = d;
          // While held the section measures as unbroken (the node's own throw and ψ₀); the throw's window opens at its turn.
          const thrownB = lerp(out, R, 2 + 2 * k), turned = tbS - dTau >= 0;
          out[base + 2 + 2 * k] = tbS < 0 || !turned ? here : tbS <= LIP_THROW_S ? Math.max(thrownB, here) : thrownB;
          out[base + S + k] = tbS < 0 || !turned ? f.psiHere[i * ONSET_LEVELS + k] : lerp(out, R, S + k);
          // The size it broke at: the node's own amplification until its turn, then carried unchanged.
          out[base + Z + k] = tbS < 0 || !turned ? f.amp[i] : lerp(out, R, Z + k);
        } else {
          const fr = (q - runB) / (run - runB), tb = (1 - fr) * dTau, T = f.tau[i] - tb;
          const Tc = curlT ? afterLower(i, k, curlT[i * ONSET_LEVELS + k]) : Number.NaN, d = delayFrom(T, Tc);
          if (curlT) tc[i * ONSET_LEVELS + k] = Tc;
          onsetT[i * ONSET_LEVELS + k] = T;
          out[base + 1 + 2 * k] = tb - d;
          out[base + D + k] = d;
          const atOnset = throwAt(ampB + fr * (f.amp[i] - ampB), hminB + fr * (f.hmin[i] - hminB), k);
          out[base + 2 + 2 * k] = d > 0 ? here : Math.max(atOnset, here);
          const psiB = lerp(f.psiHere, ONSET_LEVELS, k);
          out[base + S + k] = d > 0 ? f.psiHere[i * ONSET_LEVELS + k] : psiB + fr * (f.psiHere[i * ONSET_LEVELS + k] - psiB);
          out[base + Z + k] = d > 0 ? f.amp[i] : ampB + fr * (f.amp[i] - ampB);
        }
      }
    }
  };
  march();
  if (stretch > 0 || curl) {
    curlT = curlPass(onsetT, nx, nz, grid.cellM, stretch, curl ? curlMaxMs : Infinity, curl);
    out = new Float32Array(n * R);
    onsetT.fill(Number.NaN);
    march();
  }
  fillUntil(f, out);
  return out;
}

/**
 * Each onset node's curl time per level (one-curl spec §3a): the peel stretch's Tₛ = T + (peel − 1)(T − T₀) from its
 * section's first break (peelLines), then, with `curl`, one curl along each breaking line (curlClock.curlTimes, the hold
 * capped at PEEL_MAX_HOLD_S). NaN off the onset nodes.
 */
function curlPass(onsetT: Float32Array, nx: number, nz: number, cellM: number, stretch: number, curlMaxMs: number, curl: boolean): Float32Array {
  const L = ONSET_LEVELS, n = nx * nz, out = new Float32Array(n * L).fill(Number.NaN);
  const first = stretch > 0 ? peelLines(onsetT, nx, nz) : null;
  const T = new Float32Array(n), Ts = new Float32Array(n);
  for (let k = 0; k < L; k++) {
    for (let i = 0; i < n; i++) {
      const t = onsetT[i * L + k], t0 = first ? first[i * L + k] : Number.NaN;
      T[i] = t;
      Ts[i] = Number.isFinite(t0) ? t + Math.min(Math.max(0, stretch * (t - t0)), PEEL_MAX_HOLD_S) : t;
    }
    const tk = curl ? curlTimes(Ts, breakingLines(T, nx, nz), nx, nz, cellM, curlMaxMs, PEEL_MAX_HOLD_S) : Ts;
    for (let i = 0; i < n; i++) out[i * L + k] = tk[i];
  }
  return out;
}

/** The time until onset is read this many cells ahead along the ray (fillUntil): one, so along a straight ray it falls cell
 * by cell (two cells gave a staircase, two cells a step); the corners that arrive no later than the node (not filled yet in
 * the reverse march) are left out of the bilinear read. */
const UNTIL_AHEAD_CELLS = 1;

/**
 * The time until onset per level (breaking.ONSET_UNTIL_OFFSET; plan 2026-10-06-wave-root-cause, the wall down the line):
 * the same march run backwards, in reverse arrival order, each node reading the record UNTIL_AHEAD_CELLS ahead along its
 * ray, over the corners that arrive later than it (so already filled). A node whose running maximum has reached the level
 * has the time to its turn, max(0, −tb): 0 once broken, the hold while held (one-curl spec §3b: until carries the hold);
 * else the time ahead plus the arrival time between, so along a ray the value falls at the ray's own speed to 0 at the
 * section's turn; UNTIL_NEVER where the ray
 * leaves the grid unbroken (and, bilinear between such a node and one that breaks, a time far past any wall's lead).
 * Smoothed along the crest for the game with the onset times (smoothOnsetTimes).
 */
function fillUntil(f: { grid: GridSpec; tau: Float32Array; dirX: Float32Array; dirZ: Float32Array; order: Uint32Array }, out: Float32Array): void {
  const { grid, dirX, dirZ } = f, { nx, nz } = grid, n = nx * nz, R = ONSET_RECORD_LENGTH, U = ONSET_UNTIL_OFFSET;
  for (let i = 0; i < n; i++) for (let k = 0; k < ONSET_LEVELS; k++) out[i * R + U + k] = UNTIL_NEVER;
  const xMax = (nx - 1) * grid.cellM, zMax = (nz - 1) * grid.cellM, ahead = UNTIL_AHEAD_CELLS * grid.cellM;
  const corners = new Int32Array(4), weights = new Float64Array(4);
  for (let o = n - 1; o >= 0; o--) {
    const i = f.order[o], col = i % nx, row = (i - col) / nx, base = i * R, tauI = f.tau[i];
    const x = grid.x0 + col * grid.cellM + dirX[i] * ahead, z = grid.z0 + row * grid.cellM + dirZ[i] * ahead;
    const inside = x >= grid.x0 && z >= grid.z0 && x <= grid.x0 + xMax && z <= grid.z0 + zMax;
    // The read's corners that arrive later than this node, with their bilinear weights renormalised.
    let wSum = 0, tauA = 0;
    if (inside) {
      const fx = Math.min(nx - 1, Math.max(0, (x - grid.x0) / grid.cellM)), fz = Math.min(nz - 1, Math.max(0, (z - grid.z0) / grid.cellM));
      const c = Math.min(nx - 2, Math.floor(fx)), r = Math.min(nz - 2, Math.floor(fz)), ci = r * nx + c, wx = fx - c, wz = fz - r;
      corners[0] = ci; corners[1] = ci + 1; corners[2] = ci + nx; corners[3] = ci + nx + 1;
      weights[0] = (1 - wx) * (1 - wz); weights[1] = wx * (1 - wz); weights[2] = (1 - wx) * wz; weights[3] = wx * wz;
      for (let q = 0; q < 4; q++) {
        if (!(weights[q] > 0) || !(f.tau[corners[q]] > tauI)) { weights[q] = 0; continue; }
        wSum += weights[q]; tauA += weights[q] * f.tau[corners[q]];
      }
    }
    const dTau = wSum > 0 ? Math.max(0, tauA / wSum - tauI) : 0;
    for (let k = 0; k < ONSET_LEVELS; k++) {
      // Broken: 0, or while held for its turn the time to it (−tb), so along the ray the value falls to 0 at the turn.
      if (out[base] >= ONSET_LEVEL_Q[k]) { out[base + U + k] = Math.max(0, -out[base + 1 + 2 * k]); continue; }
      if (!(wSum > 0)) continue;
      let uA = 0;
      for (let q = 0; q < 4; q++) if (weights[q] > 0) uA += (weights[q] / wSum) * out[corners[q] * R + U + k];
      out[base + U + k] = uA >= UNTIL_NEVER ? UNTIL_NEVER : Math.min(UNTIL_NEVER, uA + dTau);
    }
  }
}

/**
 * Each level's breaking sections and, at every onset node, its section's first break T₀ (NaN off the onset nodes): the
 * peel stretch's origin (spec 2026-10-04 §1). Every onset time in a section is stretched from T₀, so D = (peel − 1)·(T − T₀).
 * The onset nodes join in order of T, linked within PEEL_NEIGHBOUR_CELLS (a union-find): a node with no earlier neighbour
 * starts a section (the peak, the inside section); where a node joins sections, one whose first break leads the node by
 * less than PEEL_MERGE_S merges into the earliest (a reef bump that breaks a moment early is stretched with the line:
 * given no delay of its own it broke seconds ahead of the held curl, a closeout the reef doesn't have). Linking every
 * onset node instead chained the peak to sections far off that break earlier, and its first break moved 2 s.
 */
export function peelLines(onsetT: Float32Array, nx: number, nz: number): Float32Array {
  const L = ONSET_LEVELS, n = nx * nz, out = new Float32Array(onsetT.length).fill(Number.NaN);
  const parent = new Int32Array(n), first = new Float32Array(n), joined = new Uint8Array(n);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  for (let k = 0; k < L; k++) {
    const nodes: number[] = [];
    for (let i = 0; i < n; i++) if (Number.isFinite(onsetT[i * L + k])) nodes.push(i);
    nodes.sort((a, b) => onsetT[a * L + k] - onsetT[b * L + k]);
    joined.fill(0);
    for (const i of nodes) {
      const T = onsetT[i * L + k], col = i % nx, row = (i - col) / nx;
      parent[i] = i;
      first[i] = T;
      const roots: number[] = [];
      for (let dr = -PEEL_NEIGHBOUR_CELLS; dr <= PEEL_NEIGHBOUR_CELLS; dr++) for (let dc = -PEEL_NEIGHBOUR_CELLS; dc <= PEEL_NEIGHBOUR_CELLS; dc++) {
        const c = col + dc, r = row + dr;
        if (c < 0 || r < 0 || c >= nx || r >= nz || (dc === 0 && dr === 0)) continue;
        const j = r * nx + c;
        if (joined[j]) { const rj = find(j); if (!roots.includes(rj)) roots.push(rj); }
      }
      joined[i] = 1;
      if (roots.length === 0) continue;
      // The node joins the latest section that started PEEL_MERGE_S or more before it (its nearest start), or the earliest
      // if none did; sections younger than that merge into the node's own (a bump the line reaches is stretched with the
      // line arriving at it, not with an older section beside it: final review).
      roots.sort((a, b) => first[a] - first[b]);
      let home = roots[0];
      for (const r of roots) if (T - first[r] >= PEEL_MERGE_S) home = r;
      for (const r of roots) if (r !== home && T - first[r] < PEEL_MERGE_S) parent[r] = home;
      parent[i] = home;
    }
    for (const i of nodes) out[i * L + k] = first[find(i)];
  }
  return out;
}

/** Over this distance inside the reef grid's edge a crest's ψ eases to PSI_NORMAL, the value off the grid (final review I2). */
export const PSI_EDGE_FADE_M = 25;
/** 0 at the reef grid's edge (and outside it), 1 from PSI_EDGE_FADE_M inside: the weight of the record's ψ. */
export function psiEdgeFade(g: GridSpec, x: number, z: number): number {
  const d = Math.min(x - g.x0, z - g.z0, g.x0 + (g.nx - 1) * g.cellM - x, g.z0 + (g.nz - 1) * g.cellM - z);
  return smoothstep(0, PSI_EDGE_FADE_M, d);
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

/** bilinear on every array of the sample, with the cell found once (ride-framerate Task 16): the same arithmetic per array,
 * so bit-identical to bilinear on each. Found once per array, the cell was ~60% of a sample. */
function sampleInside(f: ReefField, x: number, z: number): FieldSample {
  const g = f.grid, nx = g.nx;
  const fx = Math.min(nx - 1, Math.max(0, (x - g.x0) / g.cellM)), fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM));
  const c = Math.min(nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * nx + c, j = i + nx;
  const at = (a: ArrayLike<number>): number => {
    const top = a[i] + (a[i + 1] - a[i]) * tx, bottom = a[j] + (a[j + 1] - a[j]) * tx;
    return top + (bottom - top) * tz;
  };
  const dirX = at(f.dirX), dirZ = at(f.dirZ);
  const len = Math.hypot(dirX, dirZ) || 1;
  return {
    tau: at(f.tau), amp: at(f.amp), hmin: at(f.hmin), hminBreak: at(f.hminBreak), hminSlurp: at(f.hminSlurp), hminLean: at(f.hminLean),
    k: at(f.k), dirX: dirX / len, dirZ: dirZ / len, depth: at(f.depth),
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
  if (f.coast) {
    // With the coast (lineup truth spec §3d): the grid's edge continued along its rays, easing over REEF_BLEND_M into
    // the coast field (which already carries the reef, at 4 m), so the sea has no step at the grid's edge either way.
    const e = sampleInside(f, xc, zc);
    const edge = { ...e, tau: e.tau + (e.k / f.omega) * (e.dirX * (x - xc) + e.dirZ * (z - zc)) };
    return mixSamples(edge, coastDrawn(f.coast, f.far, x, z), smoothstep(0, REEF_BLEND_M, Math.hypot(x - xc, z - zc)));
  }
  const far = farSample(f.far, x, z);
  if (far.dirX * (x - xc) + far.dirZ * (z - zc) <= 0) return far;
  const e = sampleInside(f, xc, zc);
  return { ...e, tau: e.tau + (e.k / f.omega) * (e.dirX * (x - xc) + e.dirZ * (z - zc)) };
}

/** Outside the reef grid the drawn sea eases from the grid's edge into the coast field over this far (m). */
export const REEF_BLEND_M = 40;
