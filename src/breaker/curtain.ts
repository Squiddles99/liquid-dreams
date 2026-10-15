import { clamp, float, log2 } from 'three/tsl';

type N = any;

/**
 * The curtain is water (breaking-look item 7, Andrew 2026-10-15): the ribbon's overhang (lip, roof, curtain) shows the scene
 * behind it through the water it is, white only where aerated. CPU references for the ribbon's nodes.
 *
 * CURTAIN_TRANSMIT: the share of the light behind that comes through a clear, face-on curtain; CURTAIN_OWN_GLOW: the
 * curtain's own light kept beside it; the refraction's screen offset (per m of thickness, and at zero thickness, × the
 * view-space normal); the blur's mip level log2(1 + thickness × CURTAIN_BLUR_PER_M), at most CURTAIN_MAX_MIP; the thickness
 * read at most.
 */
/** Whether the ribbon's shader carries the curtain's transmission at all (false: today's opaque curtain, no viewport copy). */
/** Off at the close: gate A measured items 2 + 7 at +0.79 ms GPU (wall clock) vs base; Andrew's pick pending. */
export const CURTAIN_IN_SHADER = false;
export const CURTAIN_TRANSMIT = 0.85, CURTAIN_OWN_GLOW = 0.25;
export const CURTAIN_REFRACT_PER_M = 0.03, CURTAIN_REFRACT_BASE = 0.01;
export const CURTAIN_BLUR_PER_M = 6, CURTAIN_MAX_MIP = 6, CURTAIN_MAX_THICK_M = 2.5;
/** The ribbon draws in the transparent pass (after every opaque: the copy holds the rider and the sea behind) and first in it
 * (before the spray sprites, which write no depth and would be overdrawn). */
export const RIBBON_RENDER_ORDER = -1;

/** How much of the scene behind shows: the overhang share × the clear share (1 − foam) × (1 − Fresnel) × CURTAIN_TRANSMIT. */
export function curtainSeeThrough(overhang: number, foamCover: number, fresnel: number): number {
  return Math.min(1, Math.max(0, overhang)) * (1 - Math.min(1, Math.max(0, foamCover))) * (1 - fresnel) * CURTAIN_TRANSMIT;
}
export function curtainBlurMip(thicknessM: number): number {
  return Math.min(CURTAIN_MAX_MIP, Math.max(0, Math.log2(Math.min(thicknessM, CURTAIN_MAX_THICK_M) * CURTAIN_BLUR_PER_M + 1)));
}
export function curtainRefractShift(thicknessM: number): number {
  return Math.min(Math.max(thicknessM, 0), CURTAIN_MAX_THICK_M) * CURTAIN_REFRACT_PER_M + CURTAIN_REFRACT_BASE;
}
export function curtainBlurMipNode(thicknessM: N): N {
  return clamp(log2(clamp(thicknessM, 0.0, CURTAIN_MAX_THICK_M).mul(CURTAIN_BLUR_PER_M).add(1.0)), 0.0, CURTAIN_MAX_MIP);
}
export function curtainRefractShiftNode(thicknessM: N): N {
  return clamp(thicknessM, 0.0, CURTAIN_MAX_THICK_M).mul(CURTAIN_REFRACT_PER_M).add(CURTAIN_REFRACT_BASE);
}
export function curtainSeeThroughNode(overhang: N, foamCover: N, fresnel: N): N {
  return clamp(overhang, 0.0, 1.0).mul(float(1.0).sub(clamp(foamCover, 0.0, 1.0))).mul(float(1.0).sub(fresnel)).mul(CURTAIN_TRANSMIT);
}
