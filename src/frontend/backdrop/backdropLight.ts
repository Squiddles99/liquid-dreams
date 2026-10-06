// The painted ground's light (lookout backdrop spec §3): Andrew sets these by eye in the dev panel's Lookout folder.

export interface LookoutLight {
  /** How much of the sun's light the flat-lit painting takes (it has no normals: one number for the whole ground). */
  sunShare: number;
  /** Overall trim on the painting's brightness after the game's light. */
  exposure: number;
}

/** Starting values; the capture matrix calibrates them so a clear mid-morning shows the painting as painted. */
export const DEFAULT_LOOKOUT_LIGHT: LookoutLight = { sunShare: 0.5, exposure: 1 };
