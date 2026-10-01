import type { Plant } from './plants';

/** A patch of heath trampled clear (riders on land, the beach pile; walking spec §6), metres. */
export interface Clearing {
  x: number;
  z: number;
  r: number;
}

/** The plants with no part of their canopy inside a clearing (the same array when there are none). */
export function clearOf(plants: Plant[], clearings: readonly Clearing[]): Plant[] {
  if (!clearings.length) return plants;
  return plants.filter((p) => clearings.every((c) => Math.hypot(p.x - c.x, p.z - c.z) > c.r + p.width / 2));
}
