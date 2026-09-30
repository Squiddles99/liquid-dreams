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

/** Rain never wets the lens past this: drops, not a sheet. */
export const RAIN_LENS_MAX = 0.8;
/** Wetting per second in a downpour, facing straight into it. */
const RAIN_WET_PER_S = 0.6;
/** Drying per second, in proportion to the wetness (drops run off), plus a floor so the lens ends fully dry. */
const RAIN_DRY_PER_S = 0.25;
const RAIN_DRY_FLOOR_PER_S = 0.02;

/**
 * One step of rain on the lens (weather W2): drops gather as fast as the rain at the camera (0..1) times how much the
 * lens faces into it (`facing`, 0..1: looking up, or into a slanting rain), slowing as the lens fills, and drying off
 * once the rain eases.
 */
export function rainLensStep(wet: number, rain: number, facing: number, dt: number): number {
  const into = Math.min(1, Math.max(0, rain)) * Math.min(1, Math.max(0, facing));
  const drying = (RAIN_DRY_PER_S * wet + RAIN_DRY_FLOOR_PER_S) * (1 - into);
  const next = wet + dt * (into * RAIN_WET_PER_S * (1 - wet / RAIN_LENS_MAX) - drying);
  return Math.min(RAIN_LENS_MAX, Math.max(0, next));
}

/**
 * Water on the lens as the camera breaks the surface: wet at the moment it surfaces, dry again by LENS_CLEAR_S. Going
 * under wipes it (under water the lens is all water, and nothing shows on it).
 */
export class LensWater {
  private sinceSurfaced = Number.POSITIVE_INFINITY;

  private rainWet = 0;

  /** The rain's wetness on the lens (rainLensStep), shown alongside the surfacing sheet's drops. */
  rain(wetness: number): void {
    this.rainWet = wetness;
  }

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
    const surf = lensWaterAt(this.sinceSurfaced);
    if (this.rainWet <= 0.01) return surf;
    // Rain drops, with no sheet (front past the screen's foot) unless the surfacing sheet is still draining.
    return { active: true, front: surf.active ? surf.front : 2, drops: Math.max(surf.drops, this.rainWet) };
  }
}
