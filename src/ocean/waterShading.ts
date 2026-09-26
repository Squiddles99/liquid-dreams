import * as THREE from 'three/webgpu';
import { PI, dot, float, max, mix, normalize, pow, reflect, uniform, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { type WaterOpticsParams, transmissionColour, waterAlbedo } from './waterOptics';

type N = any;

export interface WaterSurfaceInputs {
  normal: N;
  /** Unit vector from the surface point toward the camera. */
  viewDir: N;
  distance: N;
  foam: N;
  /** Vertical displacement above mean sea level (m). */
  crestHeight: N;
  unresolvedSlopeVariance: N;
  hsTotal: N;
}

export function createWaterOpticsUniforms(p: WaterOpticsParams) {
  return {
    albedo: uniform(new THREE.Vector3(...waterAlbedo(p))),
    transmission: uniform(new THREE.Vector3(...transmissionColour(p))),
    bodyScale: uniform(p.bodyScale),
    transmissionIntensity: uniform(p.transmissionIntensity),
    baseRoughness: uniform(p.baseRoughness),
    foamAlbedo: uniform(p.foamAlbedo),
  };
}

export type WaterOpticsUniforms = ReturnType<typeof createWaterOpticsUniforms>;

export function updateWaterOpticsUniforms(u: WaterOpticsUniforms, p: WaterOpticsParams): void {
  u.albedo.value.set(...waterAlbedo(p));
  u.transmission.value.set(...transmissionColour(p));
  u.bodyScale.value = p.bodyScale;
  u.transmissionIntensity.value = p.transmissionIntensity;
  u.baseRoughness.value = p.baseRoughness;
  u.foamAlbedo.value = p.foamAlbedo;
}

export const schlickWater = (cosTheta: N): N => float(0.02).add(float(0.98).mul(pow(float(1.0).sub(cosTheta), 5.0)));

/** First pass: sky reflection + deep-water body colour + aerial perspective. Task 14 replaces this with the full model. */
export function shadeWater(i: WaterSurfaceInputs, sky: Sky, u: WaterOpticsUniforms): N {
  const fresnel = schlickWater(max(dot(i.normal, i.viewDir), 1e-3));
  const r: N = reflect(i.viewDir.negate(), i.normal); // three typings gap: reflect() is typed as returning vec2
  const reflection = sky.radiance(normalize(vec3(r.x, max(r.y, 0.01), r.z)));
  const body = u.albedo.mul(sky.skyIrradiance.add(sky.sunIlluminance.mul(max(sky.sunDirection.y, 0.0)))).div(PI).mul(u.bodyScale);
  return sky.applyAerialPerspective(mix(body, reflection, fresnel), i.distance, i.viewDir.negate());
}
