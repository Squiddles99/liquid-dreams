import { smoothstep } from '../math/smoothstep';
import type { Rgb } from '../sky/atmosphereParams';

export const WATER_IOR = 1.333;
export const MARCH_STEPS = 14;
export const MARCH_REFINE = 4;
/** Deeper than this below the surface point, don't march; the seabed is already faded out before it (reachFade). */
export const MAX_MARCH_DEPTH_M = 25;
/** Longest march along the refracted ray; the seabed is already faded out before it (reachFade). */
export const MAX_MARCH_DIST_M = 80;
/** The seabed starts fading out at this surface-point depth, reaching zero at MAX_MARCH_DEPTH_M. */
export const REACH_FADE_DEPTH_M = 18;
/** The seabed starts fading out at this march distance, reaching zero at MAX_MARCH_DIST_M. */
export const REACH_FADE_DIST_M = 56;
/** The bed ahead may be up to this much deeper than under the surface point (the ledge drops 6 → 13 m). */
export const MARCH_DEPTH_ALLOWANCE_M = 8;

export const extinction = (a: Rgb, bb: Rgb): Rgb => [a[0] + bb[0], a[1] + bb[1], a[2] + bb[2]];

export const transmittance = (c: Rgb, pathM: number): Rgb =>
  [Math.exp(-c[0] * pathM), Math.exp(-c[1] * pathM), Math.exp(-c[2] * pathM)];

/** Light leaving the water column: the seabed seen through it, blended with the scattering body of the water. */
export const waterColumnRadiance = (bed: Rgb, body: Rgb, T: Rgb): Rgb =>
  [bed[0] * T[0] + body[0] * (1 - T[0]), bed[1] * T[1] + body[1] * (1 - T[1]), bed[2] * T[2] + body[2] * (1 - T[2])];

/**
 * How much of the seabed the view keeps at the march's reach limits: 1 well inside them, exactly 0 at the depth and
 * distance cutoffs, so the seabed fades into the water body instead of vanishing at a seam. Multiplies T.
 */
export const reachFade = (depthHereM: number, distanceM: number): number =>
  (1 - smoothstep(REACH_FADE_DEPTH_M, MAX_MARCH_DEPTH_M, depthHereM)) * (1 - smoothstep(REACH_FADE_DIST_M, MAX_MARCH_DIST_M, distanceM));

/**
 * March a refracted ray from the surface point p (world, y up) along unit d until it passes below the seabed.
 * Steps grow as (i/N)^1.6 to spend samples near the surface, then bisect. The shader mirrors this exactly.
 */
export function marchSeabed(
  p: readonly [number, number, number], d: readonly [number, number, number], bedAt: (x: number, z: number) => number,
): { hit: boolean; distance: number } {
  const depthHere = p[1] - bedAt(p[0], p[2]);
  const down = -d[1];
  if (!(down > 0.02) || depthHere >= MAX_MARCH_DEPTH_M) return { hit: false, distance: 0 };
  if (depthHere <= 0) return { hit: true, distance: 0 };
  const maxDist = Math.min(MAX_MARCH_DIST_M, ((depthHere + MARCH_DEPTH_ALLOWANCE_M) * 1.5) / Math.max(down, 0.05));
  const below = (s: number) => p[1] + d[1] * s <= bedAt(p[0] + d[0] * s, p[2] + d[2] * s);
  let prev = 0;
  for (let i = 1; i <= MARCH_STEPS; i++) {
    const s = maxDist * (i / MARCH_STEPS) ** 1.6;
    if (below(s)) {
      let lo = prev, hi = s;
      for (let r = 0; r < MARCH_REFINE; r++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid; else lo = mid;
      }
      return { hit: true, distance: (lo + hi) / 2 };
    }
    prev = s;
  }
  return { hit: false, distance: 0 };
}
