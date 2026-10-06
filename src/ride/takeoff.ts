import { type BreakParams, onsetTime } from '../breaker/breaking';
import { type ReefField, sampleField, sampleOnset } from '../breaker/reefField';

/** The take-off zone's mark on the reef: on the south ledge 40 m south of the corner, where the swell reaches the left first
 * (Andrew's satellite reef, 2026-10-05: his red square). */
export const TAKEOFF_ANCHOR = { x: -6, z: 40 } as const;
/** You wait this far (m) seaward of where the wave starts to break, along the swell's travel: it lifts you as it stands up.
 * 14, not 8, with the wall down the line (plan 2026-10-06-wave-root-cause): the sea's front is already most of the way to
 * the drawn face's length a second before the break, and 8 m out it passed under a paddling surfer in 0.4 s, before the
 * catch could bring him to speed (the ride test, 6 and 12 ft); 14 m out the face reaches him about a second before. */
export const TAKEOFF_SEAWARD_M = 20;
/** How far seaward of the anchor (m) the search starts; a 12 ft wave starts breaking 25–45 m out from the edge. */
const SEARCH_M = 80;
const STEP_M = 0.5;

/**
 * Where to wait for a wave of deep-water height `heightM`: TAKEOFF_SEAWARD_M seaward of the first point it breaks on the ray
 * through TAKEOFF_ANCHOR (bigger waves break further out, so one spot can't suit every size). A wave that doesn't break on
 * that ray (a small day) is waited for at the anchor itself.
 */
export function takeoffSpot(field: ReefField, heightM: number, p: BreakParams): { x: number; z: number } {
  let x: number = TAKEOFF_ANCHOR.x, z: number = TAKEOFF_ANCHOR.z;
  for (let s = 0; s < SEARCH_M; s += STEP_M) { const f = sampleField(field, x, z); x -= f.dirX * STEP_M; z -= f.dirZ * STEP_M; }
  for (let s = 0; s <= SEARCH_M; s += STEP_M) {
    const rec = sampleOnset(field, x, z), f = sampleField(field, x, z);
    if (rec && onsetTime(rec, 0, heightM, p) !== null) {
      for (let b = 0; b < TAKEOFF_SEAWARD_M; b += STEP_M) { const g = sampleField(field, x, z); x -= g.dirX * STEP_M; z -= g.dirZ * STEP_M; }
      return { x, z };
    }
    x += f.dirX * STEP_M; z += f.dirZ * STEP_M;
  }
  return { ...TAKEOFF_ANCHOR };
}
