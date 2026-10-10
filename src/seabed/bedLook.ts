import type { Rgb } from '../sky/atmosphereParams';
import { type WaterOpticsParams, waterAlbedo } from '../ocean/waterOptics';
import { extinction, transmittance, waterColumnRadiance } from './waterColumn';

/** The seabed's albedos: seabedShading's TSL reads these, and so does the CPU check that the reef reads from the face. */
export const REEF_ALBEDO: Rgb = [0.24, 0.23, 0.19];
export const SAND_ALBEDO: Rgb = [0.62, 0.56, 0.44];
export const WEED_ALBEDO: Rgb = [0.05, 0.075, 0.03];
/** The lit weedy rock between kelp plants (× WEED_ALBEDO): set so the upright canopy's mean albedo is WEED_ALBEDO in every
 * channel (reef build B §4.2; kelpLook.selftest measures it), so the canopy's window has no tone of its own through the water. */
export const KELP_GAP_LIFT = 1.76;

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];
export const luminance = (c: Rgb): number => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];

/**
 * A bed of `albedo` seen straight down through depthM of water under an overhead sun (unit irradiance): its light
 * attenuated down and back up, plus the water body's own scatter over the view path (waterColumnRadiance, as the shader).
 */
export function bedSeenFromAbove(albedo: Rgb, depthM: number, p: WaterOpticsParams): Rgb {
  const T = transmittance(extinction(p.absorptionPerM, p.backscatterPerM), depthM);
  const lit: Rgb = [albedo[0] * T[0], albedo[1] * T[1], albedo[2] * T[2]];
  const w = waterAlbedo(p);
  return waterColumnRadiance(lit, [w[0] * p.bodyScale, w[1] * p.bodyScale, w[2] * p.bodyScale], T);
}

/** Weber contrast of bed a against bed b, both seen through depthM: (L_a − L_b) / L_b. */
export function contrastAtDepth(a: Rgb, b: Rgb, depthM: number, p: WaterOpticsParams): number {
  const la = luminance(bedSeenFromAbove(a, depthM, p)), lb = luminance(bedSeenFromAbove(b, depthM, p));
  return (la - lb) / lb;
}
