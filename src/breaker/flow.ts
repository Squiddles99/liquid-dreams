import { GRAVITY } from '../ocean/spectrum';
import type { FieldSample } from './fieldSample';
import { type ActiveWave, type BreakOptions, type WaveContext, sumWaves } from './setWaveModel';

/**
 * The water's flow under the waves (spec 2026-10-02-reef-flow-and-kelp-design.md §4.1): linear wave theory on the
 * surface the game draws. Under a wave the water moves along the wave's travel with u(y) = η·ω·cosh(k(h + y))/sinh(kh):
 * shoreward under a crest, seaward under a trough (the draw toward a wave standing up, whose trough build A drains), and
 * c·η/h in shallow water. Capped at the shallow-water wave speed √(g(h + η)). Exactly zero with no waves.
 */

/** The depth and the water column floored here (m), so the gain and the cap stay finite at the waterline. */
export const FLOW_MIN_DEPTH_M = 0.05;
/** kh floored here: sinh(kh) → 0 with no field (k = 0) or no water. */
const MIN_KH = 1e-3;

/** m/s of flow per metre of η at height y above still water (−h at the bed, 0 at the surface). */
export function flowGain(omega: number, k: number, depth: number, y: number): number {
  const h = Math.max(depth, FLOW_MIN_DEPTH_M);
  const kh = Math.max(k * h, MIN_KH), kk = kh / h;
  const yc = Math.min(0, Math.max(-h, y));
  return (omega * Math.cosh(kk * (h + yc))) / Math.sinh(kh);
}

/** The fastest the water can run: the shallow-water wave speed over the water column h + η. */
export function flowCap(depth: number, eta: number): number {
  return Math.sqrt(GRAVITY * Math.max(depth + eta, FLOW_MIN_DEPTH_M));
}

/** The flow (m/s, world xz) for a surface height η over a field sample, at height y. */
export function flowFromEta(eta: number, f: Pick<FieldSample, 'k' | 'dirX' | 'dirZ' | 'depth'>, omega: number, y: number): { ux: number; uz: number } {
  if (eta === 0) return { ux: 0, uz: 0 };
  const cap = flowCap(f.depth, eta);
  const u = Math.max(-cap, Math.min(cap, eta * flowGain(omega, f.k, f.depth, y)));
  return { ux: u * f.dirX, uz: u * f.dirZ };
}

/**
 * The flow at (x, z), height y, time t: the set waves' surface (sumWaves, breaking included) plus `backgroundEta` (the FFT
 * long swell's height where it runs; the CPU model has no FFT, so the caller passes it), along the local ray.
 */
export function flowAt(x: number, z: number, y: number, t: number, f: FieldSample, waves: readonly ActiveWave[], ctx: WaveContext, o?: BreakOptions, backgroundEta = 0): { ux: number; uz: number; eta: number } {
  const eta = (waves.length ? sumWaves(x, z, t, f, waves, ctx, o).eta : 0) + backgroundEta;
  return { ...flowFromEta(eta, f, ctx.omega, y), eta };
}
