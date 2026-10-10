import { travelDirectionXZ } from '../conditions/directions';
import { depthBg } from '../seabed/coastProfile';
import { breakingDepth } from './breaking';
import { MIN_DEPTH_M, groupSpeed, waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';

/** The map's west edge: with no coast, the water (15 m) the swell dial is read in (FarField.refDepthM). */
export const FAR_X0 = -400;
export const FAR_X1 = 250;
export const FAR_DX = 0.5;
/** Refraction can focus energy; beyond ×4 the linear theory is meaningless anyway (and the depth cap rules). */
export const AMP_CAP = 4;
const MIN_COS = 0.05;

export interface FarField {
  omega: number;
  periodS: number;
  fromDeg: number;
  tideM: number;
  /** Travel direction in the reference water (refDepthM). */
  dirX: number;
  dirZ: number;
  /** Snell's invariant: the slowness component along the coast (s/m), the same at every x. */
  p: number;
  /** The water (m, tide in) the swell dial is read in, a buoy's (womb-retune spec §2, ruling C): amp is 1 there and the
   * swell travels from fromDeg there. 15 m (FAR_X0's) on its own; with the coast, the coast map's depth at the coast
   * grid's west edge on the Womb's row. */
  refDepthM: number;
  /** cg·cosθ at refDepthM: the energy flux every amp is measured against. */
  fluxRef: number;
  x0: number;
  dx: number;
  count: number;
  /** τ(x, z = 0) per sample, before the peak normalisation (s). */
  tau: Float64Array;
  /** ∂τ/∂x per sample (s/m). */
  dTauDx: Float32Array;
  amp: Float32Array;
  hmin: Float32Array;
  k: Float32Array;
  depth: Float32Array;
  /** Subtracted from every τ so that τ(peak) = 0; set by computeReefField. */
  tauOffset: number;
}

const depthWithTide = (x: number, tideM: number): number => Math.max(depthBg(x) + tideM, MIN_DEPTH_M);

/**
 * Exact 1D refraction and shoaling over the reef-free coast (depth varies with x only):
 * ∂τ/∂z = p (constant), ∂τ/∂x = ±√(s(x)² − p²), and A²·cg·cosθ is conserved.
 */
export function computeFarField(periodS: number, fromDeg: number, tideM: number, opts: { refDepthM?: number } = {}): FarField {
  const omega = (2 * Math.PI) / periodS;
  const d = travelDirectionXZ(fromDeg);
  // The swell as the dial gives it (womb-retune spec §2, Andrew's ruling C 2026-10-09: a buoy's reading): height, period
  // AND direction in `refDepthM`'s water, the coast seed's with the coast; FAR_X0's 15 m without (the tests' flat-bed far field).
  const refDepthM = opts.refDepthM ?? depthWithTide(FAR_X0, tideM);
  const kRef = waveNumber(omega, refDepthM);
  const sRef = kRef / omega;
  const p = d.z * sRef;
  const sign = d.x >= 0 ? 1 : -1;
  const count = Math.round((FAR_X1 - FAR_X0) / FAR_DX) + 1;
  const tau = new Float64Array(count), dTauDx = new Float32Array(count), amp = new Float32Array(count);
  const hmin = new Float32Array(count), k = new Float32Array(count), depth = new Float32Array(count);
  const fluxRef = groupSpeed(omega, kRef, refDepthM) * Math.max(Math.abs(d.x), MIN_COS);
  const shallowEnd = depthWithTide(FAR_X1, tideM);
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const x = FAR_X0 + i * FAR_DX;
    const h = depthWithTide(x, tideM);
    const ki = waveNumber(omega, h);
    const s = ki / omega;
    const gx = sign * Math.sqrt(Math.max(s * s - p * p, 0));
    if (i > 0) acc += 0.5 * (gx + dTauDx[i - 1]) * FAR_DX;
    tau[i] = acc;
    dTauDx[i] = gx;
    k[i] = ki;
    depth[i] = h;
    const cosTheta = Math.max(Math.abs(gx) / s, MIN_COS);
    amp[i] = Math.min(AMP_CAP, Math.sqrt(fluxRef / (groupSpeed(omega, ki, h) * cosTheta)));
    hmin[i] = sign > 0 ? h : Math.min(h, shallowEnd);
  }
  return { omega, periodS, fromDeg, tideM, dirX: d.x, dirZ: d.z, p, refDepthM, fluxRef, x0: FAR_X0, dx: FAR_DX, count, tau, dTauDx, amp, hmin, k, depth, tauOffset: 0 };
}

/** The far field at any world point: interpolated across the coast, linear extrapolation beyond the table. */
export function farSample(f: FarField, x: number, z: number): FieldSample {
  const g = Math.min(f.count - 1, Math.max(0, (x - f.x0) / f.dx));
  const i = Math.min(f.count - 2, Math.floor(g));
  const t = g - i;
  const lerp = (a: ArrayLike<number>): number => a[i] + (a[i + 1] - a[i]) * t;
  const xc = f.x0 + g * f.dx;
  const dTauDx = lerp(f.dTauDx);
  const tau = lerp(f.tau) + (x - xc) * dTauDx + f.p * z - f.tauOffset;
  const len = Math.hypot(dTauDx, f.p);
  const dirX = len > 0 ? dTauDx / len : f.dirX;
  const dirZ = len > 0 ? f.p / len : f.dirZ;
  // The coast has no reef edges to smooth (and runs along the crest): its breaking depth is breakingDepth at the nodes,
  // interpolated (as the GPU reads it, baked into farB.z).
  const b0 = breakingDepth(f.hmin[i]), b1 = breakingDepth(f.hmin[i + 1]);
  const hminBreak = b0 + (b1 - b0) * t;
  return { tau, amp: lerp(f.amp), hmin: lerp(f.hmin), hminBreak, hminSlurp: hminBreak, hminLean: hminBreak, k: lerp(f.k), dirX, dirZ, depth: lerp(f.depth) };
}
