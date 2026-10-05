import type { Station, StationEntry } from '../breaker/crestTrace';
import { frontHeight, interiorWeight } from '../breaker/wombSection';
import { CREST_KNOT, FLOOR_KNOT, type P2, profileKnots, profileSamples } from '../breaker/wombProfile';
import type { WaterFn } from './water';

/**
 * The water the ride stands on where the breaking ribbon draws (plan 2026-10-05-womb-profile-step3 3d): the crest
 * stations' cross-sections (wombSection's curve at each station's smoothed numbers), so the board sits on the wave that is
 * drawn, not on the sheet under it. Elsewhere, and blended in by each station's ρ and toward the profile's ends exactly as
 * the ribbon blends, the sheet's own water.
 *
 * Where the curve overhangs (the lip over the tube), the board stands on the lowest surface with water under it and air
 * over it: the face and the tube's floor, not the lip above.
 */

/**
 * Steeper than this (|dy/du|, 63°) the face reads as this: the ride's physics needs a finite slope on the vertical wall,
 * and one under its wipeout slope (ridePhysics.WIPEOUT_SLOPE, 2.5): at 6 the board on the drawn wave's steep face wiped
 * out the moment it caught (Andrew, 2026-10-05). The board rides the face as the face; only the sheet's own steepness, or
 * the foam, throws the rider.
 */
export const MAX_SECTION_SLOPE = 2;
/** A point further than this (m) along the crest from the nearest station is off the ribbon. */
export const MAX_ALONG_M = 6;

interface Cached { curve: P2[]; crestU: number; floorU: number }

/**
 * `base`'s water, with the stations' sections where they draw. `tideM` is the still-water level the sections stand on
 * (the drawn tide: base's own, as App.rideWater passes it).
 */
export function withSections(base: WaterFn, entries: readonly StationEntry[], tideM: number): WaterFn {
  const live = entries.filter((e): e is Station => !e.gap && e.section.rho > 0);
  if (live.length === 0) return base;
  const cache = new Map<Station, Cached>();
  const cached = (s: Station): Cached => {
    let c = cache.get(s);
    if (!c) {
      const { curve } = profileSamples(s.section.phase, s.section.hollow);
      const k = profileKnots(s.section.phase, s.section.hollow);
      c = { curve, crestU: k[CREST_KNOT][0], floorU: k[FLOOR_KNOT][0] };
      cache.set(s, c);
    }
    return c;
  };
  return (x, z) => {
    const w = base(x, z);
    // The two stations either side of the point along the crest (by its offset along each one's t̂), the nearest first.
    let best: Station | null = null, bestV = Infinity, other: Station | null = null, otherV = Infinity;
    for (const s of live) {
      const dx = x - s.x, dz = z - s.z, v = -dx * s.nz + dz * s.nx, u = dx * s.nx + dz * s.nz;
      if (Math.abs(u) > 7 * s.section.A || Math.abs(v) > MAX_ALONG_M) continue;
      if (Math.abs(v) < Math.abs(bestV)) { other = best; otherV = bestV; best = s; bestV = v; } else if (Math.abs(v) < Math.abs(otherV)) { other = s; otherV = v; }
    }
    if (!best) return w;
    const at = (s: Station): { y: number; slopeU: number; weight: number } | null => {
      const u = (x - s.x) * s.nx + (z - s.z) * s.nz, A = s.section.A;
      if (!(A > 0)) return null;
      const c = cached(s), hit = lowestWetCrossing(c.curve, u / A);
      if (!hit) return null;
      // Past the face's foot the section settles onto the sea in front (wombSection.frontHeight), as the ribbon draws it.
      const own = tideM + A * hit.y, y = u / A > c.floorU ? frontHeight(own, w.y, u / A, c.floorU) : own;
      return { y, slopeU: Math.max(-MAX_SECTION_SLOPE, Math.min(MAX_SECTION_SLOPE, hit.slope)), weight: s.section.rho * interiorWeight(u / A, c.crestU) };
    };
    const a = at(best);
    if (!a) return w;
    // Between the two stations either side (opposite signs of v) by their distance along the crest; else the nearest.
    let y = a.y, slopeU = a.slopeU, weight = a.weight, nx = best.nx, nz = best.nz;
    if (other && Math.sign(otherV) !== Math.sign(bestV)) {
      const b = at(other);
      if (b) {
        const f = Math.abs(bestV) / (Math.abs(bestV) + Math.abs(otherV));
        y += (b.y - y) * f; slopeU += (b.slopeU - slopeU) * f; weight += (b.weight - weight) * f;
        nx += (other.nx - nx) * f; nz += (other.nz - nz) * f;
      }
    }
    if (!(weight > 0)) return w;
    // The slope: the section's along its normal, the sheet's own along the crest.
    const tx = -nz, tz = nx, along = w.slopeX * tx + w.slopeZ * tz, sx = slopeU * nx + along * tx, sz = slopeU * nz + along * tz;
    return { ...w, y: w.y + (y - w.y) * weight, slopeX: w.slopeX + (sx - w.slopeX) * weight, slopeZ: w.slopeZ + (sz - w.slopeZ) * weight };
  };
}

/**
 * Where the profile curve (back to front, units of A) crosses u: the lowest crossing with water under it (the curve heading
 * toward the beach there: the water lies on its right, below), its height and its slope dy/du. Null if it never crosses u.
 */
export function lowestWetCrossing(curve: readonly P2[], u: number): { y: number; slope: number } | null {
  let best: { y: number; slope: number } | null = null;
  for (let i = 0; i + 1 < curve.length; i++) {
    const [u0, y0] = curve[i], [u1, y1] = curve[i + 1];
    if (!(u1 > u0) || u < u0 || u > u1) continue;
    const f = (u - u0) / (u1 - u0), y = y0 + (y1 - y0) * f;
    if (!best || y < best.y) best = { y, slope: (y1 - y0) / (u1 - u0) };
  }
  return best;
}
