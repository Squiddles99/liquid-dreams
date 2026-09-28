import { smoothstep } from '../math/smoothstep';

/**
 * The weed-covered limestone platform that lines the shore (Andrew's aerial, 2026-09-28: "the reef goes all the way
 * into the shore"): the seabed from the waterline out to shoreReefWidth(z) is weedy rock, inside the reef map and out,
 * whatever the map or the open coast put there. Deterministic sines (no hash noise) so the TSL mirror in Seabed is exact.
 */
export const SHORE_REEF_MATERIAL: readonly [number, number] = [0.05, 0.8]; // [sand, weed]; the rest is bare rock
/**
 * The open coast's seabed outside the reef map, beyond the platform: mostly weedy rock with some sand, not the pure sand
 * Phase 1 put there (Andrew: the reef reads dark; the turquoise is the foam's, not the seabed's).
 */
export const OPEN_COAST_MATERIAL: readonly [number, number] = [0.25, 0.6];
/** The platform's mean width and its two along-coast swings (m); SHORE_REEF_MEAN_M ± 20 m reaches the reef map's shelf. */
export const SHORE_REEF_MEAN_M = 70;
const EDGE_M = 8;

/** Along the reef map's stretch of coast the platform reaches its inner rock platform: at least this wide (m). */
export const SHORE_REEF_AT_MAP_M = 90;
/** The reef map's stretch of coast (z), and how far beyond its ends the minimum width eases off (m). */
export const SHORE_REEF_MAP_Z: readonly [number, number] = [-450, 300];
export const SHORE_REEF_MAP_EASE_M = 200;

/**
 * The platform's width (m) at z: 50–90 m, varying smoothly along the coast, and at least SHORE_REEF_AT_MAP_M along the
 * reef map, where its weedy shelf ends about 80 m off the beach (no sand strip between them).
 */
export function shoreReefWidth(z: number): number {
  const w = SHORE_REEF_MEAN_M + 12 * Math.sin(z / 97) + 8 * Math.sin(z / 41 + 1.3);
  const [z0, z1] = SHORE_REEF_MAP_Z;
  const atMap = smoothstep(z0 - SHORE_REEF_MAP_EASE_M, z0, z) * (1 - smoothstep(z1, z1 + SHORE_REEF_MAP_EASE_M, z));
  return Math.max(w, SHORE_REEF_AT_MAP_M * atMap);
}

/** How much of the seabed dSea m seaward of the waterline is the platform: 1 at the waterline, 0 past its width. */
export function shoreReefWeight(dSea: number, z: number): number {
  const w = shoreReefWidth(z);
  return 1 - smoothstep(w - EDGE_M, w + EDGE_M, dSea);
}

export const SHORE_REEF_EDGE_M = EDGE_M;
