// The painted ground's light (lookout backdrop spec §3): Andrew sets these by eye in the dev panel's Lookout folder.

export interface LookoutLight {
  /** How much of the sun's light the flat-lit painting takes (it has no normals: one number for the whole ground). */
  sunShare: number;
  /** Overall trim on the painting's brightness after the game's light. */
  exposure: number;
}

/**
 * Calibrated 2026-10-07 (tools/captureLookout.mjs, conditions plate): clear 9:30, ground brightness 144 vs 136 as painted
 * (exposure 1 gave 156, 0.8 gave 147). Andrew tunes both by eye in the dev panel's Lookout folder (H).
 */
export const DEFAULT_LOOKOUT_LIGHT: LookoutLight = { sunShare: 0.5, exposure: 0.75 };
