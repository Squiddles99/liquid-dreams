import { smoothstep } from '../math/smoothstep';

/** Beach waterline, metres east of the peak: Andrew's satellite views put the take-off 100–110 m off the sand
 * (2026-10-05; he first measured 189–192 m to the reef's outer corner), and the dry sand starts 12 m above the waterline
 * (landHeight.DEFAULT_BEACH.wetWidthM). The land is placed to match (landData.LAND_SHIFT_X). */
export const SHORE_X = 94;
/** Depth where the map meets the open sea to the west, and everywhere further out. */
export const FAR_DEPTH_M = 30;
/** Landward of the waterline there is no land yet (Phase 4): a shallow flat stands in for it. */
export const SHORE_FLAT_DEPTH_M = 0.5;
/** Deep water around the reef, before the shelf (Claude's estimate; tunable through the reef params). */
export const REEF_SURROUND_DEPTH_M = 13;
/** The open sea's depth (FAR_DEPTH_M) is reached at the reef map's west edge (x = −400, coastFarField.FAR_X0), so the far
 * field meets the map there; the coast deepens toward it from REEF_SURROUND_DEPTH_M 260 m off the beach. */
export const FAR_RAMP_S: readonly [number, number] = [260, SHORE_X + 400];

/**
 * Still-water depth (m) of the reef-free coast as a function of x only (the coast runs north–south).
 * Offshore distance s = SHORE_X − x. Monotonic: never deepens shoreward. Used inside the map as the
 * background the reef sits on, and outside it everywhere, so the far field matches the map at its edges.
 */
export function depthBg(x: number): number {
  const s = SHORE_X - x;
  if (s <= 0) return SHORE_FLAT_DEPTH_M;
  if (s < 30) return SHORE_FLAT_DEPTH_M + (1.5 - SHORE_FLAT_DEPTH_M) * smoothstep(0, 30, s);
  if (s < 140) return 1.5 + (REEF_SURROUND_DEPTH_M - 1.5) * smoothstep(30, 140, s);
  if (s < FAR_RAMP_S[0]) return REEF_SURROUND_DEPTH_M;
  if (s < FAR_RAMP_S[1]) return REEF_SURROUND_DEPTH_M + (FAR_DEPTH_M - REEF_SURROUND_DEPTH_M) * smoothstep(FAR_RAMP_S[0], FAR_RAMP_S[1], s);
  return FAR_DEPTH_M;
}
