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
  /** Where this water sits undisplaced (the Lagrangian label, world xz), as the breaking ribbon's crest stations are. */
  lx?: number;
  lz?: number;
  /** How far one more inversion pass would move the label (m): its convergence (waterAt). */
  residual?: number;
  /** true where a breaking ribbon section is the surface (sectionWater.withSections): the drawn wave, not the sheet under it. */
  onSection?: boolean;
}

export type WaterFn = (x: number, z: number) => WaterAt;

/** x0 ← p − d(x0) steps (as HeightProbe): the displacement is Lagrangian, so the surface over p is the one from x0. */
export const INVERT_ITERATIONS = 4;

/**
 * The set waves' surface at world (x, z): `sum` evaluates the waves at a reference point (sumWaves with the render's break
 * options) and `field` samples the reef field there. Plus the tide. The inversion starts at (x, z) and takes
 * INVERT_ITERATIONS passes; a caller reading a run of nearby points (a station's sheet along its normal) can start it at
 * a neighbour's label (`start`) and take fewer `passes` (ride-framerate R8).
 */
export function waterAt(
  x: number, z: number, tideM: number, omega: number,
  field: (x: number, z: number) => FieldSample,
  sum: (x: number, z: number, f: FieldSample) => SetWaveResult,
  start?: { x: number; z: number }, passes = INVERT_ITERATIONS,
): WaterAt {
  let x0 = start ? start.x : x, z0 = start ? start.z : z;
  for (let i = 0; i < passes; i++) {
    const r = sum(x0, z0, field(x0, z0));
    x0 = x - r.dx;
    z0 = z - r.dz;
  }
  const f = field(x0, z0), r = sum(x0, z0, f);
  const u = flowFromEta(r.eta, f, omega, 0);
  return {
    y: tideM + r.eta, slopeX: r.slopeX, slopeZ: r.slopeZ, foam: r.foam, ux: u.ux, uz: u.uz,
    c: f.k > 1e-6 ? omega / f.k : 0, dirX: f.dirX, dirZ: f.dirZ, lx: x0, lz: z0, residual: Math.hypot(x - r.dx - x0, z - r.dz - z0),
  };
}

/** Flat water at height y (tests, and before the reef field has loaded). */
export function flatWater(y = 0): WaterFn {
  return () => ({ y, slopeX: 0, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 0, dirX: 1, dirZ: 0 });
}
