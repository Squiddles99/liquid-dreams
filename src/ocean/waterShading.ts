import * as THREE from 'three/webgpu';
import { PI, dot, float, fract, fwidth, length, max, min, mix, normalize, pow, reflect, saturate, smoothstep, sqrt, step, uniform, vec3 } from 'three/tsl';
import { extinction } from '../seabed/waterColumn';
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
  /** The seabed seen through the water (Phase 1); absent means infinitely deep water (Phase 0). */
  seabed?: { radiance: N; transmittance: N };
  /** Dev overlays: still-water depth (m) and set-wave arrival time τ (s) at this point, and 0/1 switches for each. */
  overlay?: { depth: N; tau: N; depthOn: N; crestOn: N };
}

export function createWaterOpticsUniforms(p: WaterOpticsParams) {
  return {
    albedo: uniform(new THREE.Vector3(...waterAlbedo(p))),
    transmission: uniform(new THREE.Vector3(...transmissionColour(p))),
    extinction: uniform(new THREE.Vector3(...extinction(p.absorptionPerM, p.backscatterPerM))),
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
  u.extinction.value.set(...extinction(p.absorptionPerM, p.backscatterPerM));
  u.bodyScale.value = p.bodyScale;
  u.transmissionIntensity.value = p.transmissionIntensity;
  u.baseRoughness.value = p.baseRoughness;
  u.foamAlbedo.value = p.foamAlbedo;
}

export const schlickWater = (cosTheta: N): N => float(0.02).add(float(0.98).mul(pow(float(1.0).sub(cosTheta), 5.0)));

/**
 * Water = Fresnel-weighted sky reflection + GGX sun glitter + light from the water column
 * (deep upwelling + crest transmission), mixed with lit foam, then aerial perspective.
 */
export function shadeWater(i: WaterSurfaceInputs, sky: Sky, u: WaterOpticsUniforms): N {
  const n = i.normal;
  const v = i.viewDir;
  const l = sky.sunDirection;
  const nDotV = max(dot(n, v), 1e-3);
  const nDotL = dot(n, l);
  const fresnel = schlickWater(nDotV);

  const r: N = reflect(v.negate(), n); // three typings gap: reflect() is typed as returning vec2
  const reflection = sky.radiance(normalize(vec3(r.x, max(r.y, 0.01), r.z)));

  // GGX sun glitter. Slopes too small to resolve at this distance widen the lobe. unresolvedSlopeVariance
  // is the total two-axis mean-square slope, and for GGX/Beckmann E[px² + pz²] = α², so it adds to α² directly.
  // Guarded normalize: l + v = 0 (view ray straight at a below-horizon sun) would make normalize() NaN.
  const lPlusV = l.add(v);
  const h = lPlusV.div(max(length(lPlusV), 1e-6));
  const nDotH = max(dot(n, h), 0.0);
  const alpha2 = u.baseRoughness.mul(u.baseRoughness).add(i.unresolvedSlopeVariance);
  const denom = nDotH.mul(nDotH).mul(alpha2.sub(1.0)).add(1.0);
  const ggx = alpha2.div(PI.mul(denom).mul(denom));
  // Height-correlated Smith-GGX visibility V = G / (4·n·l·n·v), guarded so grazing angles stay finite.
  const nDotLSat = saturate(nDotL);
  const oneMinusAlpha2 = float(1.0).sub(alpha2);
  const smithDenom = nDotLSat.mul(sqrt(nDotV.mul(nDotV).mul(oneMinusAlpha2).add(alpha2)))
    .add(nDotV.mul(sqrt(nDotLSat.mul(nDotLSat).mul(oneMinusAlpha2).add(alpha2))));
  const visibility = float(0.5).div(max(smithDenom, 1e-6));
  const specular = min(
    sky.sunIlluminance.mul(ggx).mul(schlickWater(max(dot(v, h), 0.0))).mul(visibility).mul(nDotLSat).mul(step(0.0, nDotL)),
    vec3(30000.0),
  );

  // Light scattered back up out of the deep, clear water column.
  const upwelling = u.albedo.mul(sky.skyIrradiance.add(sky.sunIlluminance.mul(max(l.y, 0.0)))).div(PI).mul(u.bodyScale);

  // Crest transmission: sun behind a raised crest shines through thin water toward the viewer.
  const crest = saturate(i.crestHeight.div(max(i.hsTotal.mul(0.5), 0.05)));
  const backlight = pow(saturate(dot(v.negate(), l)), 4.0);
  const transmitted = u.transmission.mul(sky.sunIlluminance).mul(backlight).mul(crest).mul(u.transmissionIntensity).div(PI);

  // Below the surface: the seabed where it's in reach, blended with the water body by the view-path transmittance.
  const column = i.seabed ? i.seabed.radiance.mul(i.seabed.transmittance).add(upwelling.mul(vec3(1.0).sub(i.seabed.transmittance))) : upwelling;
  const water = column.add(transmitted).mul(float(1.0).sub(fresnel)).add(reflection.mul(fresnel)).add(specular);
  const foamLight = sky.skyIrradiance.add(sky.sunIlluminance.mul(saturate(nDotL))).mul(u.foamAlbedo).div(PI);
  const colour = mix(water, foamLight, saturate(i.foam));
  // Debug overlays: 1 m depth contours (white) and crest lines every 2 s of arrival time (gold).
  // Where the field is flat (open ocean at exactly 30 m, no field yet) fwidth is 0: smoothstep(0, 0, x) is NaN, and
  // NaN × a 0 switch is still NaN, so the edge is floored and a flat field draws no line.
  const line = (v: N, spacing: number): N => {
    const f = fract(v.div(spacing));
    const dist = min(f, float(1.0).sub(f));
    const w = fwidth(v.div(spacing));
    return float(1.0).sub(smoothstep(0.0, max(w.mul(1.5), 1e-6), dist)).mul(step(1e-6, w));
  };
  const withOverlay = i.overlay
    ? mix(mix(colour, foamLight, line(i.overlay.depth, 1.0).mul(i.overlay.depthOn)), foamLight.mul(vec3(1.0, 0.8, 0.25)), line(i.overlay.tau, 2.0).mul(i.overlay.crestOn))
    : colour;
  return sky.applyAerialPerspective(withOverlay, i.distance, v.negate());
}
