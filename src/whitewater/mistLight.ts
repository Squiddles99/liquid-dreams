import { float, max, pow } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { SPRAY_PHASE_G } from './sprayLook';

type N = any;

/**
 * One light for the whitewater's air (whitewater spec §6.3): the spray's sprites, the mist slab and the foam volume (§3.3)
 * all take it. Sun × (a soft-wrapped diffuse for the dense part + the spray's phase, HG g 0.75 mixed with isotropic, for
 * the backlit glow) + the sky × 1/π + a ground bounce from the water's colour (the turquoise in the spray's shadows,
 * photo 1); all × an albedo for the bounce-light lost in the foam. CPU reference; mistLightNode mirrors it.
 */
export const MIST_ALBEDO = 0.9, MIST_WRAP = 0.5, MIST_GROUND_BOUNCE = 0.25;

const wrapDiffuse = (nDotL: number, w: number): number => Math.max(0, (nDotL + w) / (1 + w)) / Math.PI;
const phase = (cosT: number, isotropic: number): number => {
  const g = SPRAY_PHASE_G, g2 = g * g;
  return (1 - isotropic) * ((1 - g2) / (4 * Math.PI * Math.pow(Math.max(1 + g2 - 2 * g * cosT, 1e-4), 1.5))) + isotropic / (4 * Math.PI);
};

/** `skyShare`, `sunShare` (absent 1): the occlusion of the sky and the sun (billow.billowShares); the ground bounce stays. */
export function mistLightCpu(i: { sunIlluminance: number; skyIrradiance: number; cosView: number; nDotL: number; sunVisibility: number; isotropic: number; groundTint: [number, number, number]; skyShare?: number; sunShare?: number }): [number, number, number] {
  const sun = i.sunIlluminance * i.sunVisibility * (wrapDiffuse(i.nDotL, MIST_WRAP) * (1 - i.isotropic) + phase(i.cosView, i.isotropic)) * MIST_ALBEDO * (i.sunShare ?? 1);
  const sky = ((i.skyIrradiance * MIST_ALBEDO) / Math.PI) * (i.skyShare ?? 1);
  return [0, 1, 2].map((k) => sun + sky + i.groundTint[k] * MIST_GROUND_BOUNCE) as [number, number, number];
}

/** mistLightCpu in TSL: `cosView` = dot(view ray camera → point, the sun's direction), `groundColour` the water's colour
 * under it (vec3), the sun and sky from `sky`. */
export function mistLightNode(i: { cosView: N; nDotL: N; sunVisibility: N; isotropic: N; groundColour: N; skyShare?: N; sunShare?: N }, sky: Sky): N {
  const g = SPRAY_PHASE_G, g2 = g * g;
  const iso = float(i.isotropic);
  const hg = float((1 - g2) / (4 * Math.PI)).div(pow(max(float(1 + g2).sub(float(i.cosView).mul(2 * g)), 1e-4), 1.5));
  const ph = hg.mul(float(1.0).sub(iso)).add(iso.div(4 * Math.PI));
  const wrap = max(float(i.nDotL).add(MIST_WRAP).div(1 + MIST_WRAP), 0.0).div(Math.PI);
  const sun = sky.sunIlluminance.mul(i.sunVisibility).mul(wrap.mul(float(1.0).sub(iso)).add(ph)).mul(MIST_ALBEDO).mul(i.sunShare ?? float(1.0));
  return sun.add(sky.skyIrradiance.mul(MIST_ALBEDO / Math.PI).mul(i.skyShare ?? float(1.0))).add(i.groundColour.mul(MIST_GROUND_BOUNCE));
}
