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
 * The ride's stations are this far apart along the crest (m; spec 2026-10-07 ride-framerate R6). The ribbon spaces them by
 * the camera's distance (crestTrace.SPACING_PER_M: 8 cm under the ride camera), but their sections are smoothed over
 * SECTION_SMOOTHING_M (4 m) of crest, so a curve every metre draws the same water for a fraction of the curves.
 * PROBE_ROW_THIN
 */
export const RIDE_STATION_SPACING_M = 1;
/** No two thinned stations are closer than this share of the spacing. */
const THIN_MIN_SHARE = 0.9;

/**
 * The stations of each run (between gaps) thinned to about one per `spacingM` of arc: the first, then the station nearest
 * `spacingM` on from the last kept (no nearer than THIN_MIN_SHARE of it), and the run's last (in place of the last kept if
 * that one is too near it, unless that is the first). Gaps are kept; a run shorter than the spacing keeps its first.
 */
export function thinStations(entries: readonly StationEntry[], spacingM: number): StationEntry[] {
  const out: StationEntry[] = [];
  let run: Station[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const dir = Math.sign(run[run.length - 1].arc - run[0].arc) || 1, p = (s: Station): number => dir * (s.arc - run[0].arc);
    const kept = [0];
    for (;;) {
      const last = kept[kept.length - 1], from = p(run[last]), target = from + spacingM;
      let j = last + 1;
      while (j < run.length && p(run[j]) < from + THIN_MIN_SHARE * spacingM) j++;
      if (j >= run.length) break;
      while (j + 1 < run.length && Math.abs(p(run[j + 1]) - target) < Math.abs(p(run[j]) - target)) j++;
      kept.push(j);
    }
    const end = run.length - 1;
    if (kept[kept.length - 1] !== end) {
      if (p(run[end]) - p(run[kept[kept.length - 1]]) >= THIN_MIN_SHARE * spacingM) kept.push(end);
      else if (kept.length > 1) kept[kept.length - 1] = end;
    }
    for (const i of kept) out.push(run[i]);
    run = [];
  };
  for (const e of entries) {
    if (e.gap) { flush(); out.push(e); } else run.push(e);
  }
  flush();
  return out;
}

/** A cached curve is reused while the station's A (m), phase and hollow are each within this of the ones it was built at. */
export const CURVE_REUSE_STEP = 1 / 64;

interface KeptCurve { A: number; phase: number; hollow: number; frame: number; curve: P2[] }

/**
 * Station curves kept across frames (spec 2026-10-07 ride-framerate R7): the stations ride their crest and are traced anew
 * every frame, but in its own units (A, along its normal) the sheet under a station is near steady from frame to frame.
 * `keyOf` names a station's place on its wave (null: not kept); a curve is reused for the station at that place while
 * its numbers are within CURVE_REUSE_STEP and it is at most `maxAge` frames old (the station's x, z and normal are this
 * frame's; only the curve is reused). `built` counts the curves built.
 */
export class CurveCache {
  built = 0;
  private frame = 0;
  private readonly kept = new Map<string, KeptCurve>();

  constructor(readonly maxAge: number, readonly keyOf: (s: Station) => string | null) {}

  /** A new frame: curves older than maxAge are dropped. */
  nextFrame(): void {
    this.frame++;
    for (const [k, e] of this.kept) if (this.frame - e.frame > this.maxAge) this.kept.delete(k);
  }

  clear(): void {
    this.kept.clear();
  }

  get(key: string, n: Station['section']): P2[] | undefined {
    const e = this.kept.get(key);
    if (!e || this.frame - e.frame > this.maxAge) return undefined;
    const near = Math.abs(e.A - n.A) <= CURVE_REUSE_STEP && Math.abs(e.phase - n.phase) <= CURVE_REUSE_STEP && Math.abs(e.hollow - n.hollow) <= CURVE_REUSE_STEP;
    return near ? e.curve : undefined;
  }

  set(key: string, n: Station['section'], curve: P2[]): void {
    this.kept.set(key, { A: n.A, phase: n.phase, hollow: n.hollow, frame: this.frame, curve });
    this.built++;
  }
}

/**
 * `base`'s water, with the stations' sections where they draw. `tideM` is the still-water level the sections stand on
 * (the drawn tide: base's own, as App.rideWater passes it). `stats.curves` counts the station curves built (the probe);
 * `kept` keeps them across frames.
 */
export function withSections(base: WaterFn, entries: readonly StationEntry[], tideM: number, stats?: { curves: number }, kept?: CurveCache): WaterFn {
  const live = entries.filter((e): e is Station => !e.gap && curlWeight(e.section) > 0);
  if (live.length === 0) return base;
  const cache = new Map<Station, P2[]>();
  /** The station's curve (units of A, back to front), its knots sampled from `base` along its normal. */
  const cached = (s: Station): P2[] => {
    let c = cache.get(s);
    const key = c ? null : kept?.keyOf(s) ?? null;
    if (!c && key !== null) {
      c = kept!.get(key, s.section);
      if (c) cache.set(s, c);
    }
    if (!c) {
      const sheet = (u: number): P2 => [u, base(s.x + s.nx * u, s.z + s.nz * u).y - tideM], A = s.section.A;
      // A sample the sheet does not weigh into (weight 0: on the drawn curl) is its drawn offset alone: the sheet at its home
      // would be multiplied by 0, so it is not read (each read is a full wave sum; exact, up to the sign of a zero).
      c = sectionSamples(s.section, sheet).curve.map((q): P2 => {
        const p = q[5] === 0 ? [A * q[3], A * q[4]] : sectionPoint(q, A, sheet);
        return [p[0] / A, p[1] / A];
      });
      cache.set(s, c);
      if (stats) stats.curves++;
      if (key !== null) kept!.set(key, s.section, c);
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
    return { ...w, y, slopeX: slopeU * nx + along * tx, slopeZ: slopeU * nz + along * tz, onSection: true };
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
