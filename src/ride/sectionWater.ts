import type { Station, StationEntry } from '../breaker/crestTrace';
import { EDGE_OUTER_UNITS, curlWeight, sectionPoint, sectionSamples } from '../breaker/wombSection';
import type { P2 } from '../breaker/wombProfile';
import type { WaterFn } from './water';

/**
 * The water the ride stands on where the breaking ribbon draws (plan 2026-10-05-womb-profile-step3 3d): the crest
 * stations' cross-sections (wombSection's curve at each station's smoothed numbers, on this water's own sheet), so the board
 * sits on the wave that is drawn, not on the sheet under it. The section is the sheet at its ends (plan 2026-10-06 step 3:
 * one surface); beyond them, and away from the stations, the sheet's own water.
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

/**
 * `base`'s water, with the stations' sections where they draw. `tideM` is the still-water level the sections stand on
 * (the drawn tide: base's own, as App.rideWater passes it).
 */
export function withSections(base: WaterFn, entries: readonly StationEntry[], tideM: number): WaterFn {
  const live = entries.filter((e): e is Station => !e.gap && curlWeight(e.section) > 0);
  if (live.length === 0) return base;
  const cache = new Map<Station, P2[]>();
  /** The station's curve (units of A, back to front), its knots sampled from `base` along its normal. */
  const cached = (s: Station): P2[] => {
    let c = cache.get(s);
    if (!c) {
      const sheet = (u: number): P2 => [u, base(s.x + s.nx * u, s.z + s.nz * u).y - tideM], A = s.section.A;
      c = sectionSamples(s.section, sheet).curve.map((q): P2 => { const p = sectionPoint(q, A, sheet); return [p[0] / A, p[1] / A]; });
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
      if (Math.abs(u) > EDGE_OUTER_UNITS * s.section.A || Math.abs(v) > MAX_ALONG_M) continue;
      if (Math.abs(v) < Math.abs(bestV)) { other = best; otherV = bestV; best = s; bestV = v; } else if (Math.abs(v) < Math.abs(otherV)) { other = s; otherV = v; }
    }
    if (!best) return w;
    const at = (s: Station): { y: number; slopeU: number } | null => {
      const u = (x - s.x) * s.nx + (z - s.z) * s.nz, A = s.section.A;
      if (!(A > 0)) return null;
      const hit = lowestWetCrossing(cached(s), u / A);
      return hit ? { y: tideM + A * hit.y, slopeU: Math.max(-MAX_SECTION_SLOPE, Math.min(MAX_SECTION_SLOPE, hit.slope)) } : null;
    };
    const a = at(best);
    if (!a) return w;
    // Between the two stations either side (opposite signs of v) by their distance along the crest; else the nearest.
    let y = a.y, slopeU = a.slopeU, nx = best.nx, nz = best.nz;
    if (other && Math.sign(otherV) !== Math.sign(bestV)) {
      const b = at(other);
      if (b) {
        const f = Math.abs(bestV) / (Math.abs(bestV) + Math.abs(otherV));
        y += (b.y - y) * f; slopeU += (b.slopeU - slopeU) * f;
        nx += (other.nx - nx) * f; nz += (other.nz - nz) * f;
      }
    }
    // The slope: the section's along its normal, the sheet's own along the crest.
    const tx = -nz, tz = nx, along = w.slopeX * tx + w.slopeZ * tz;
    return { ...w, y, slopeX: slopeU * nx + along * tx, slopeZ: slopeU * nz + along * tz };
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
