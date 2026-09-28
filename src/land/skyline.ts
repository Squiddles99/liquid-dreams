/**
 * The skyline table (spec §4.9, Ruling L6; plan ruling P8): for each whole degree of bearing (0 = north, 90 = east), the
 * land sample seen highest from the eye, as (distance m, height m with the Earth's curvature drop). The water's
 * reflection recomputes the elevation from its own point along the bearing.
 */
export const SKYLINE_BEARINGS = 360;
export const SKYLINE_STEPS = 160;
export const SKYLINE_MIN_M = 20;
export const SKYLINE_MAX_M = 15000;
/** Rebuild when the eye moves this far. */
export const SKYLINE_MOVE_M = 25;
/** Half the soft edge of the land in a reflection (rad): 0.3° in all. */
export const SKYLINE_EDGE_RAD = 0.0026;
const EARTH_RADIUS_M = 6_371_000;

export function bearingIndex(dx: number, dz: number): number {
  const b = Math.round((Math.atan2(dx, -dz) * 180) / Math.PI);
  return ((b % 360) + 360) % 360;
}

export function skylineTable(heightAt: (x: number, z: number) => number, eye: { x: number; y: number; z: number }): Float32Array {
  const out = new Float32Array(2 * SKYLINE_BEARINGS);
  for (let b = 0; b < SKYLINE_BEARINGS; b++) {
    const a = (b * Math.PI) / 180, dx = Math.sin(a), dz = -Math.cos(a);
    let best = -Infinity, bestD = 0, bestH = 0;
    for (let k = 0; k < SKYLINE_STEPS; k++) {
      const d = SKYLINE_MIN_M * (SKYLINE_MAX_M / SKYLINE_MIN_M) ** (k / (SKYLINE_STEPS - 1));
      const h = heightAt(eye.x + dx * d, eye.z + dz * d);
      if (h <= 0.5) continue; // the sea (and the wet beach) is no skyline
      const hEff = h - (d * d) / (2 * EARTH_RADIUS_M);
      const e = (hEff - eye.y) / d;
      if (e > best) { best = e; bestD = d; bestH = hEff; }
    }
    out[2 * b] = bestD;
    out[2 * b + 1] = bestH;
  }
  return out;
}

/** The skyline's elevation (rad) along a bearing, seen from a point alongM along it from the eye at height yM. */
export function skylineElevationFrom(t: Float32Array, bearing: number, alongM: number, yM: number): number {
  const d = t[2 * bearing];
  if (d <= 0) return -Math.PI / 2;
  return Math.atan((t[2 * bearing + 1] - yM) / Math.max(d - alongM, 10));
}

/** CPU mirror of SkylineTable.reflectionNode's cover: 1 where the reflected ray r from water point p hits the land. */
export function reflectionCover(t: Float32Array, eye: { x: number; y?: number; z: number }, p: [number, number, number], r: [number, number, number]): number {
  const b = bearingIndex(r[0], r[2]);
  const h = Math.hypot(r[0], r[2]) || 1;
  const along = ((p[0] - eye.x) * r[0] + (p[2] - eye.z) * r[2]) / h;
  const sk = skylineElevationFrom(t, b, along, p[1]);
  if (sk === -Math.PI / 2) return 0;
  const e = Math.asin(Math.max(-1, Math.min(1, r[1] / Math.hypot(...r))));
  const x = Math.min(1, Math.max(0, (e - (sk - SKYLINE_EDGE_RAD)) / (2 * SKYLINE_EDGE_RAD)));
  return 1 - x * x * (3 - 2 * x);
}
