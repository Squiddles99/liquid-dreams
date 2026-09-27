import { smoothstep } from '../math/smoothstep';

/** The sheet of water over the lens has drained off the bottom of the screen this long after surfacing (s)… */
export const LENS_DRAIN_S = 1.2;
/** …and the last drops have gone by this (s): Andrew asked for about 2.5 s. */
export const LENS_CLEAR_S = 2.5;
/** The drops start to fade this long after surfacing (s), once most of the sheet has run off. */
const DROPS_FADE_FROM_S = 1.0;

export interface LensWaterState {
  /** The wet lens is drawn at all. */
  active: boolean;
  /** How far down the screen the sheet has drained, 0 (top) to 1 (bottom) and past: below it the lens is under water. */
  front: number;
  /** How strongly the drops left behind show, 1 → 0. */
  drops: number;
}

/** The lens t seconds after the camera broke the surface (dry before it and from LENS_CLEAR_S on). */
export function lensWaterAt(t: number): LensWaterState {
  if (!(t >= 0 && t < LENS_CLEAR_S)) return { active: false, front: 0, drops: 0 };
  // Slow to start, then running off as it gathers (water on glass accelerates as the film thins and streams).
  const front = 1.15 * Math.min(1, t / LENS_DRAIN_S) ** 1.5 + Math.max(0, t - LENS_DRAIN_S);
  return { active: true, front, drops: 1 - smoothstep(DROPS_FADE_FROM_S, LENS_CLEAR_S, t) };
}

/**
 * Water on the lens as the camera breaks the surface: wet at the moment it surfaces, dry again by LENS_CLEAR_S. Going
 * under wipes it (under water the lens is all water, and nothing shows on it).
 */
export class LensWater {
  private sinceSurfaced = Number.POSITIVE_INFINITY;

  surfaced(): void {
    this.sinceSurfaced = 0;
  }

  submerged(): void {
    this.sinceSurfaced = Number.POSITIVE_INFINITY;
  }

  /** Real seconds (the lens dries while the sim is paused too). */
  step(dt: number): void {
    this.sinceSurfaced += dt;
  }

  state(): LensWaterState {
    return lensWaterAt(this.sinceSurfaced);
  }
}
