import { smoothstep } from '../math/smoothstep';
import type { Bathymetry } from '../seabed/bathymetry';
import { wombHalo } from '../seabed/coastMap';
import { depthBg } from '../seabed/coastProfile';
import type { GridSpec } from '../seabed/wombReef';
import { breakingDepth } from './breaking';
import { AMP_CAP, type FarField, computeFarField, farSample } from './coastFarField';
import { MIN_DEPTH_M, groupSpeed, waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';
import { solveWaveField } from './waveField';

/**
 * Behind a shoal the shallowest depth met (hmin) eases back to the local depth over this far (m): a set that broke on
 * the Bombie or a bar re-forms in the deep water behind it instead of reading as broken all the way to the beach (spec
 * §4.4: nothing breaks between a break and the shore band). The reef field keeps its hmin (it never recovers there).
 */
export const HMIN_RECOVER_M = 100;
const MIN_COS = 0.05;

export interface CoastFieldRequest {
  /** The coast map (coastMap.buildCoastMap) on COAST_GRID. */
  bed: Bathymetry;
  periodS: number;
  fromDeg: number;
  tideM: number;
  /** As ReefFieldRequest.refractFloorM. */
  refractFloorM?: number;
}

/** The swell over the coast map (spec §3c): what the sheet draws outside the reef grid, and what seeds the reef field. */
export interface CoastField {
  grid: GridSpec;
  /** Arrival time relative to the peak (s), on the far field's clock (far.tauOffset). */
  tau: Float32Array;
  dirX: Float32Array;
  dirZ: Float32Array;
  k: Float32Array;
  amp: Float32Array;
  hmin: Float32Array;
  /** breakingDepth(hmin) at each node (no along-crest smoothing: the coast has no reef edges to smooth, as farSample). */
  hminBreak: Float32Array;
  depth: Float32Array;
  omega: number;
  /** The 1-D far field beyond the coast grid; its tauOffset puts it on this field's clock. */
  far: FarField;
}

/**
 * Seeds for the coast grid's edges: along each row, the exact 1-D refraction over that row's own depths (Snell's
 * invariant p from the far field, τ from the far field at the west edge), as though the coast ran on unchanged beyond
 * the grid's north and south edges. Over the 1-D coast profile this is the far field itself.
 */
function rowSeeds(bed: Bathymetry, far: FarField, omega: number, tideM: number, refractFloorM?: number): (x: number, z: number) => FieldSample {
  const g = bed.grid, cache = new Map<number, { tau: Float64Array; dirX: Float32Array; dirZ: Float32Array; amp: Float32Array; hmin: Float32Array; k: Float32Array; depth: Float32Array }>();
  const hRef = far.depth[0], kRef = far.k[0];
  const fluxRef = groupSpeed(omega, kRef, hRef) * Math.max(Math.abs(far.dirX), MIN_COS);
  const sign = far.dirX >= 0 ? 1 : -1, p = far.p;
  const row = (r: number) => {
    let v = cache.get(r);
    if (v) return v;
    const nx = g.nx, z = g.z0 + r * g.cellM;
    v = { tau: new Float64Array(nx), dirX: new Float32Array(nx), dirZ: new Float32Array(nx), amp: new Float32Array(nx), hmin: new Float32Array(nx), k: new Float32Array(nx), depth: new Float32Array(nx) };
    let prevGx = 0;
    for (let c = 0; c < nx; c++) {
      const h = Math.max(tideM - bed.bed[r * nx + c], MIN_DEPTH_M);
      const k = waveNumber(omega, h);
      const s = (refractFloorM ? waveNumber(omega, Math.max(h, refractFloorM)) : k) / omega;
      const gx = sign * Math.sqrt(Math.max(s * s - p * p, 0));
      v.tau[c] = c === 0 ? farSample(far, g.x0, z).tau : v.tau[c - 1] + 0.5 * (gx + prevGx) * g.cellM;
      prevGx = gx;
      const len = Math.hypot(gx, p);
      v.dirX[c] = len > 0 ? gx / len : far.dirX;
      v.dirZ[c] = len > 0 ? p / len : far.dirZ;
      const cosTheta = Math.max(Math.abs(gx) / s, MIN_COS);
      v.amp[c] = Math.min(AMP_CAP, Math.sqrt(fluxRef / (groupSpeed(omega, k, h) * cosTheta)));
      v.hmin[c] = h;
      v.k[c] = k;
      v.depth[c] = h;
    }
    cache.set(r, v);
    return v;
  };
  return (x, z) => {
    const r = Math.min(g.nz - 1, Math.max(0, Math.round((z - g.z0) / g.cellM)));
    const c = Math.min(g.nx - 1, Math.max(0, Math.round((x - g.x0) / g.cellM)));
    const v = row(r), hb = breakingDepth(v.hmin[c]);
    return { tau: v.tau[c], amp: v.amp[c], hmin: v.hmin[c], hminBreak: hb, hminSlurp: hb, hminLean: hb, k: v.k[c], dirX: v.dirX[c], dirZ: v.dirZ[c], depth: v.depth[c] };
  };
}

/** The coast bed of the 1-D coast profile (depthBg(x) on `bed`'s grid): the far field is its exact solution. */
export function flatCoastBed(like: Bathymetry): Bathymetry {
  const g = like.grid, n = g.nx * g.nz, bed = new Float32Array(n);
  for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) bed[r * g.nx + c] = -depthBg(g.x0 + c * g.cellM);
  return { grid: g, bed, sand: new Float32Array(n), weed: new Float32Array(n) };
}

function solveCoast(bed: Bathymetry, far: FarField, omega: number, req: CoastFieldRequest) {
  const seed = rowSeeds(bed, far, omega, req.tideM, req.refractFloorM);
  return solveWaveField(bed, omega, req.tideM, seed, { refractFloorM: req.refractFloorM, hminRecoverM: HMIN_RECOVER_M });
}

let flatCache: { key: string; s: ReturnType<typeof solveCoast> } | null = null;

/**
 * The coast field (spec §3c): the shared eikonal + flux march over the coast map, seeded from the far field.
 *
 * Alongside the Womb (coastMap.wombHalo) the coast's beach is the 1-D profile's, whose exact solution the far field is,
 * and the reef field was seeded from it. The 4 m solve lags it in the shallows (0.15 s at 5 m deep, 0.8 s on the 0.5 m
 * flat, 3 % in height), so there each node carries the far field plus the shelf's own change: real solve + (far field −
 * the same solve over the 1-D profile). Over the 1-D profile that is the far field at every node.
 */
export function computeCoastField(req: CoastFieldRequest): CoastField {
  const omega = (2 * Math.PI) / req.periodS;
  const far = computeFarField(req.periodS, req.fromDeg, req.tideM);
  const s = solveCoast(req.bed, far, omega, req);
  const key = `${req.bed.grid.nx}x${req.bed.grid.nz}:${req.periodS}:${req.fromDeg}:${req.tideM}:${req.refractFloorM ?? 0}`;
  if (flatCache?.key !== key) flatCache = { key, s: solveCoast(flatCoastBed(req.bed), far, omega, req) };
  const flat = flatCache.s;
  const g = s.grid, n = g.nx * g.nz;
  const tau = new Float64Array(s.tau), amp = new Float32Array(s.amp), dirX = new Float32Array(s.dirX), dirZ = new Float32Array(s.dirZ);
  const hmin = new Float32Array(s.hmin), k = new Float32Array(s.k), depth = new Float32Array(s.depth);
  for (let r = 0; r < g.nz; r++) {
    const z = g.z0 + r * g.cellM, w = wombHalo(z);
    if (w <= 0) continue;
    for (let c = 0; c < g.nx; c++) {
      const i = r * g.nx + c, f = farSample(far, g.x0 + c * g.cellM, z);
      tau[i] += w * (f.tau - flat.tau[i]);
      if (flat.amp[i] > 0) amp[i] *= 1 + w * (f.amp / flat.amp[i] - 1);
      hmin[i] += w * (f.hmin - flat.hmin[i]);
      k[i] += w * (f.k - flat.k[i]);
      depth[i] += w * (f.depth - flat.depth[i]);
      const turn = w * (Math.atan2(f.dirZ, f.dirX) - Math.atan2(flat.dirZ[i], flat.dirX[i]));
      const a = Math.atan2(dirZ[i], dirX[i]) + turn;
      dirX[i] = Math.cos(a); dirZ[i] = Math.sin(a);
    }
  }
  const tau32 = new Float32Array(n), hminBreak = new Float32Array(n);
  const tauPeak = bilinear(tau, g, 0, 0);
  for (let i = 0; i < n; i++) { tau32[i] = tau[i] - tauPeak; hminBreak[i] = breakingDepth(hmin[i]); }
  far.tauOffset = tauPeak;
  return { grid: g, tau: tau32, dirX, dirZ, k, amp, hmin, hminBreak, depth, omega, far };
}

function bilinear(a: ArrayLike<number>, g: GridSpec, x: number, z: number): number {
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM)), fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM));
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * g.nx + c;
  return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - tz) + (a[i + g.nx] * (1 - tx) + a[i + g.nx + 1] * tx) * tz;
}

/** True inside the coast grid's nodes. */
export function insideCoast(g: GridSpec, x: number, z: number): boolean {
  return x >= g.x0 && z >= g.z0 && x <= g.x0 + (g.nx - 1) * g.cellM && z <= g.z0 + (g.nz - 1) * g.cellM;
}

/** The coast field at (x, z): bilinear inside the coast grid, the far field (`far`, on the same clock) outside. What the
 * sheet draws (the GPU mirrors it). */
export function coastSample(c: CoastField, far: FarField, x: number, z: number): FieldSample {
  const g = c.grid;
  if (!insideCoast(g, x, z)) return farSample(far, x, z);
  const dx = bilinear(c.dirX, g, x, z), dz = bilinear(c.dirZ, g, x, z), len = Math.hypot(dx, dz);
  const hb = bilinear(c.hminBreak, g, x, z);
  return {
    tau: bilinear(c.tau, g, x, z), amp: bilinear(c.amp, g, x, z), hmin: bilinear(c.hmin, g, x, z),
    hminBreak: hb, hminSlurp: hb, hminLean: hb, k: bilinear(c.k, g, x, z),
    dirX: len > 1e-9 ? dx / len : far.dirX, dirZ: len > 1e-9 ? dz / len : far.dirZ, depth: bilinear(c.depth, g, x, z),
  };
}

/**
 * The reef field's seed (spec §3c): coastSample, but alongside the Womb the far field's own share is read exactly rather
 * than bilinearly from the 4 m nodes (the ramp to the beach is curved at that scale: 4 ms and 0.1 % at the reef map's
 * edges). Over the 1-D coast profile this is the far field, so the reef field is the reef field as it was (spec §4.3);
 * it differs from what the sheet draws by that interpolation alone (≤ 4 ms).
 */
export function coastSeed(c: CoastField, far: FarField): (x: number, z: number) => FieldSample {
  const g = c.grid;
  return (x, z) => {
    const s = coastSample(c, far, x, z), w = wombHalo(z);
    if (!insideCoast(g, x, z) || w <= 0) return s;
    // The far field at the four surrounding nodes, interpolated as the coast's nodes are.
    const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM)), fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM));
    const col = Math.min(g.nx - 2, Math.floor(fx)), row = Math.min(g.nz - 2, Math.floor(fz)), tx = fx - col, tz = fz - row;
    const node = (dc: number, dr: number) => farSample(far, g.x0 + (col + dc) * g.cellM, g.z0 + (row + dr) * g.cellM);
    const q = [node(0, 0), node(1, 0), node(0, 1), node(1, 1)], wt = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
    const lerp = (get: (f: FieldSample) => number) => q.reduce((acc, f, j) => acc + get(f) * wt[j], 0);
    const f = farSample(far, x, z);
    const fix = (get: (f: FieldSample) => number) => w * (get(f) - lerp(get));
    const dirA = Math.atan2(s.dirZ, s.dirX) + w * (Math.atan2(f.dirZ, f.dirX) - Math.atan2(lerp((v) => v.dirZ), lerp((v) => v.dirX)));
    const hb = s.hminBreak + fix((v) => v.hminBreak);
    return {
      tau: s.tau + fix((v) => v.tau), amp: s.amp + fix((v) => v.amp), hmin: s.hmin + fix((v) => v.hmin),
      hminBreak: hb, hminSlurp: hb, hminLean: hb, k: s.k + fix((v) => v.k),
      dirX: Math.cos(dirA), dirZ: Math.sin(dirA), depth: s.depth + fix((v) => v.depth),
    };
  };
}

/** Inside the coast grid's west, north and south edges the drawn sea eases from the coast field into the 1-D far field
 * over this far (m), so the horizon's lines meet it without a kink (the far field assumes a straight beach at x 94 and
 * 15 m of water; the coast grid's edge is 20–28 m deep). The east edge is ashore. */
export const COAST_EDGE_BLEND_M = 100;

/** Mixes two samples (t = 0: a, 1: b); the direction renormalised. */
export function mixSamples(a: FieldSample, b: FieldSample, t: number): FieldSample {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const m = (p: number, q: number): number => p + (q - p) * t;
  const dx = m(a.dirX, b.dirX), dz = m(a.dirZ, b.dirZ), len = Math.hypot(dx, dz) || 1;
  return {
    tau: m(a.tau, b.tau), amp: m(a.amp, b.amp), hmin: m(a.hmin, b.hmin), hminBreak: m(a.hminBreak, b.hminBreak),
    hminSlurp: m(a.hminSlurp, b.hminSlurp), hminLean: m(a.hminLean, b.hminLean), k: m(a.k, b.k), dirX: dx / len, dirZ: dz / len, depth: m(a.depth, b.depth),
  };
}

/** The drawn sea outside the reef grid (spec §3d; the GPU mirrors it): the coast field, easing into the far field at the
 * coast grid's sea edges; the far field beyond. */
export function coastDrawn(c: CoastField, far: FarField, x: number, z: number): FieldSample {
  const g = c.grid;
  if (!insideCoast(g, x, z)) return farSample(far, x, z);
  const edge = Math.min(x - g.x0, z - g.z0, g.z0 + (g.nz - 1) * g.cellM - z);
  const s = coastSample(c, far, x, z);
  return edge >= COAST_EDGE_BLEND_M ? s : mixSamples(farSample(far, x, z), s, smoothstep(0, COAST_EDGE_BLEND_M, edge));
}
