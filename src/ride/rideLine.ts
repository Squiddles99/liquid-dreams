import type { Station } from '../breaker/crestTrace';
import { MAX_ALONG_M } from './sectionWater';
import type { WaterAt } from './water';

/**
 * The line a surfer holds, degrees off the swell heading toward the left (R3 §1). To hold a place on the face her speed
 * along the wave's travel must be c; at 12 m/s against c 10 that is 33° off it. (The ride test's 88°, R1–R2, left her
 * ~0.3 m/s along the travel: over the back within a second of the pop-up.)
 */
export const LINE_OFF_DEG = 35;

/**
 * Metres in front of her wave's nearest live station along its normal (+ shoreward of the crest line), measured from the
 * water's Lagrangian label as the R2 probe does; undefined when no station is within MAX_ALONG_M along the crest.
 */
export function aheadOf(live: readonly Station[], w: WaterAt, x: number, z: number): number | undefined {
  const lx = w.lx ?? x, lz = w.lz ?? z;
  let best: { al: number; ah: number } | null = null;
  for (const s of live) {
    const dx = lx - s.x, dz = lz - s.z, al = Math.abs(-dx * s.nz + dz * s.nx);
    if (al <= MAX_ALONG_M && (!best || al < best.al)) best = { al, ah: dx * s.nx + dz * s.nz };
  }
  return best?.ah;
}
