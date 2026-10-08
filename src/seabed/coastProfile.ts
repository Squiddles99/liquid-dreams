import { smoothstep } from '../math/smoothstep';

/** Beach waterline, metres east of the peak: Andrew's satellite views put the take-off 100–110 m off the sand
 * (2026-10-05; he first measured 189–192 m to the reef's outer corner), and the dry sand starts 12 m above the waterline
 * (landHeight.DEFAULT_BEACH.wetWidthM). The land is placed to match (landData.LAND_SHIFT_X). */
export const SHORE_X = 94;
/** Depth where the map meets the open sea to the west, and everywhere further out. */
export const FAR_DEPTH_M = 15;
/** Landward of the waterline there is no land yet (Phase 4): a shallow flat stands in for it. */
export const SHORE_FLAT_DEPTH_M = 0.5;
/** The coast's depth offshore, 140–260 m off the beach: the reef's own basin depth (wombReef.DEFAULT_REEF_PARAMS), so the
 * deep water in front of the reef is open to the sea. At 13 m the 20 m basin was a fast patch ringed by slow water: the
 * swell's first arrival raced through it and bent a right angle at its walls (Andrew, 2026-10-05: "the adjacent
 * right-angle swell"), and a band of focused swell ran through the take-off. A 14 m basin straightened the lines but let
 * 8 ft and up break over its flat floor, short of the ledge, and soft. 15 m, and FAR_DEPTH_M with it (R1 §1, 2026-10-06):
 * at one depth from the map's west edge to the reef's face the swell arrives unbent and nearly along the ledge, so the
 * curl peels slower (Snell's law conserves the peel from wherever the swell's direction is set; the 20 → 30 m ramp turned
 * every swell east and the curl ran 12–15 m/s). */
export const REEF_SURROUND_DEPTH_M = 15;
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
