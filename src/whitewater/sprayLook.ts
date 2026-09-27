import { smoothstep } from '../math/smoothstep';
import { SPRAY_KIND } from './particleKinds';

/**
 * The spray's lighting and near-camera fade (spec 2026-09-27-offshore-spray-design.md §3.3, as built): CPU references
 * the SprayParticles material mirrors in TSL.
 *
 * Dense mist scatters light many times, so it reads white from any side. A pure forward-peaked phase function
 * (Henyey–Greenstein g = 0.75) gave side-lit or front-lit spray about 2% of the sunlight: dark grey smoke against the sky.
 * The phase is a mix: (1 − SPRAY_PHASE_ISOTROPIC) of HG, for the backlit glow, and SPRAY_PHASE_ISOTROPIC of isotropic,
 * standing in for multiple scattering. It still integrates to 1.
 */
export const SPRAY_PHASE_G = 0.75;
export const SPRAY_PHASE_ISOTROPIC = SPRAY_KIND.isotropic;

/** The sky's share: skyIrradiance × this (the old 1/4π left side-lit mist darker than the sky behind it). */
export const SPRAY_SKY_SCALE = 1 / Math.PI;

/**
 * Puffs fade in over this range of distance from the camera (m). Close up a puff is metres across on screen, and where its
 * camera-facing quad cuts the water it shows a straight edge; 3–10 m (not 1.5–4) removes both from the eye inside the
 * veil (measured in the behind-the-wave view).
 */
export const NEAR_FADE_M: readonly [number, number] = [3, 10];

/** The phase function at cos θ, where θ is the angle between the view ray (camera → puff) and the sun direction. */
export function sprayPhase(cosT: number, isotropic = SPRAY_PHASE_ISOTROPIC): number {
  const g = SPRAY_PHASE_G, g2 = g * g;
  const hg = (1 - g2) / (4 * Math.PI * Math.pow(Math.max(1 + g2 - 2 * g * cosT, 1e-4), 1.5));
  return (1 - isotropic) * hg + isotropic / (4 * Math.PI);
}

export function nearCameraFade(distanceM: number): number {
  return smoothstep(NEAR_FADE_M[0], NEAR_FADE_M[1], distanceM);
}
