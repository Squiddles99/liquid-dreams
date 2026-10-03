import type { FieldSample } from '../breaker/fieldSample';
import { flowFromEta } from '../breaker/flow';
import type { SetWaveResult } from '../breaker/setWaveModel';

/** The water under the board (first-ride spec §1): what the physics reads at one point. */
export interface WaterAt {
  /** Surface height (m, world y). */
  y: number;
  /** ∂y/∂x, ∂y/∂z of the surface. */
  slopeX: number;
  slopeZ: number;
  /** Whitewater weight [0, 1]. */
  foam: number;
  /** The water's flow at the surface (m/s, world xz). */
  ux: number;
  uz: number;
  /** The swell's phase speed here (m/s) and its unit travel direction. */
  c: number;
  dirX: number;
  dirZ: number;
  /** The bed, the beach or a rock under the board (m, world y), where known: the board runs aground on it. */
  bedY?: number;
}

export type WaterFn = (x: number, z: number) => WaterAt;

/** x0 ← p − d(x0) steps (as HeightProbe): the displacement is Lagrangian, so the surface over p is the one from x0. */
export const INVERT_ITERATIONS = 4;

/**
 * The set waves' surface at world (x, z): `sum` evaluates the waves at a reference point (sumWaves with the render's break
 * options) and `field` samples the reef field there. Plus the tide.
 */
export function waterAt(
  x: number, z: number, tideM: number, omega: number,
  field: (x: number, z: number) => FieldSample,
  sum: (x: number, z: number, f: FieldSample) => SetWaveResult,
): WaterAt {
  let x0 = x, z0 = z;
  for (let i = 0; i < INVERT_ITERATIONS; i++) {
    const r = sum(x0, z0, field(x0, z0));
    x0 = x - r.dx;
    z0 = z - r.dz;
  }
  const f = field(x0, z0), r = sum(x0, z0, f);
  const u = flowFromEta(r.eta, f, omega, 0);
  return {
    y: tideM + r.eta, slopeX: r.slopeX, slopeZ: r.slopeZ, foam: r.foam, ux: u.ux, uz: u.uz,
    c: f.k > 1e-6 ? omega / f.k : 0, dirX: f.dirX, dirZ: f.dirZ,
  };
}

/** Flat water at height y (tests, and before the reef field has loaded). */
export function flatWater(y = 0): WaterFn {
  return () => ({ y, slopeX: 0, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 0, dirX: 1, dirZ: 0 });
}
