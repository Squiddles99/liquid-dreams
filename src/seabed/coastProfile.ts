import { smoothstep } from '../math/smoothstep';

/** Beach waterline, metres east of the peak (Andrew measured 189–192 m). */
export const SHORE_X = 190;
/** Depth where the map meets the open sea to the west, and everywhere further out. */
export const FAR_DEPTH_M = 30;
/** Landward of the waterline there is no land yet (Phase 4): a shallow flat stands in for it. */
export const SHORE_FLAT_DEPTH_M = 0.5;
/** Deep water around the reef, before the shelf (Claude's estimate; tunable through the reef params). */
export const REEF_SURROUND_DEPTH_M = 13;

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
  if (s < 260) return REEF_SURROUND_DEPTH_M;
  if (s < 590) return REEF_SURROUND_DEPTH_M + (FAR_DEPTH_M - REEF_SURROUND_DEPTH_M) * smoothstep(260, 590, s);
  return FAR_DEPTH_M;
}
