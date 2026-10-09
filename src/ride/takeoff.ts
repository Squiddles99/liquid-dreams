import { type BreakParams, onsetTime } from '../breaker/breaking';
import { type ReefField, sampleField, sampleOnset } from '../breaker/reefField';
import { TIP } from '../seabed/wombReef';

/** The take-off zone's mark on the reef: the corner, where the left starts peeling on the real shelf (womb-retune Task 5,
 * Fable's ruling 2026-10-09). It was 40 m south of the corner (Andrew's red square, 2026-10-05); with the tip moved seaward
 * that spot is on the right, whose closeout carried her into the corner behind the crest. */
export const TAKEOFF_ANCHOR = { x: TIP[0], z: TIP[1] } as const;
/** You wait this far (m) seaward of where the wave starts to break, along the swell's travel: it lifts you as it stands up.
 * 8 (R1 §3): the onset is on the ledge's face now, and 8 m out the face stands up under the paddler about a second before
 * it breaks; the catch is the slope's, not a race to the crest's speed. */
export const TAKEOFF_SEAWARD_M = 8;
/** The crest reaches the take-off spot this long after the ride starts (s): time to settle, turn and paddle (R1 §3). */
export const TAKEOFF_ARRIVE_S = 6;
/** How far seaward of the anchor (m) the search starts; a 12 ft wave starts breaking 25–45 m out from the edge. */
const SEARCH_M = 80;
const STEP_M = 0.5;

/** The first point a wave of deep-water height `heightM` breaks on the ray through TAKEOFF_ANCHOR (searched from SEARCH_M
 * seaward of it to SEARCH_M inshore); null if it doesn't break there (a small day). */
export function takeoffBreak(field: ReefField, heightM: number, p: BreakParams): { x: number; z: number } | null {
  let x: number = TAKEOFF_ANCHOR.x, z: number = TAKEOFF_ANCHOR.z;
  for (let s = 0; s < SEARCH_M; s += STEP_M) { const f = sampleField(field, x, z); x -= f.dirX * STEP_M; z -= f.dirZ * STEP_M; }
  for (let s = 0; s <= 2 * SEARCH_M; s += STEP_M) {
    const rec = sampleOnset(field, x, z), f = sampleField(field, x, z);
    if (rec && onsetTime(rec, 0, heightM, p) !== null) return { x, z };
    x += f.dirX * STEP_M; z += f.dirZ * STEP_M;
  }
  return null;
}

/**
 * Where to wait for a wave of deep-water height `heightM`: TAKEOFF_SEAWARD_M seaward of the first point it breaks on the ray
 * through TAKEOFF_ANCHOR (takeoffBreak; bigger waves break a little further out on the face, and the spot follows). A wave
 * that doesn't break on that ray (a small day) is waited for at the anchor itself.
 */
export function takeoffSpot(field: ReefField, heightM: number, p: BreakParams): { x: number; z: number } {
  const at = takeoffBreak(field, heightM, p);
  if (!at) return { ...TAKEOFF_ANCHOR };
  let { x, z } = at;
  for (let b = 0; b < TAKEOFF_SEAWARD_M; b += STEP_M) { const g = sampleField(field, x, z); x -= g.dirX * STEP_M; z -= g.dirZ * STEP_M; }
  return { x, z };
}

/** How long before the crest reaches the peak the ride must start, so it reaches `spot` TAKEOFF_ARRIVE_S later. */
export function takeoffLeadS(field: ReefField, spot: { x: number; z: number }): number {
  return TAKEOFF_ARRIVE_S - sampleField(field, spot.x, spot.z).tau;
}
