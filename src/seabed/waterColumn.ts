import type { Rgb } from '../sky/atmosphereParams';

export const WATER_IOR = 1.333;
export const MARCH_STEPS = 20;
export const MARCH_REFINE = 4;
/** Deeper than this below the surface point, the seabed is invisible (T < 1%): don't march. */
export const MAX_MARCH_DEPTH_M = 25;
export const MAX_MARCH_DIST_M = 80;

export const extinction = (a: Rgb, bb: Rgb): Rgb => [a[0] + bb[0], a[1] + bb[1], a[2] + bb[2]];

export const transmittance = (c: Rgb, pathM: number): Rgb =>
  [Math.exp(-c[0] * pathM), Math.exp(-c[1] * pathM), Math.exp(-c[2] * pathM)];

/** Light leaving the water column: the seabed seen through it, blended with the scattering body of the water. */
export const waterColumnRadiance = (bed: Rgb, body: Rgb, T: Rgb): Rgb =>
  [bed[0] * T[0] + body[0] * (1 - T[0]), bed[1] * T[1] + body[1] * (1 - T[1]), bed[2] * T[2] + body[2] * (1 - T[2])];

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
  const maxDist = Math.min(MAX_MARCH_DIST_M, (depthHere * 1.5) / Math.max(down, 0.05));
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
