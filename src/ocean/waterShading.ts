import * as THREE from 'three/webgpu';
import { Fn, If, PI, dot, float, fract, fwidth, length, max, min, mix, normalize, pow, reflect, saturate, smoothstep, sqrt, step, uniform, vec3 } from 'three/tsl';
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
  /** Brightness of the foam colour (1 when absent): the set foam's pattern darkens its hollows a little. */
  foamShade?: N;
  /** The set waves' lip mask (0..1): the thin, curling lip (spec R5). Keys the turquoise transmission. */
  lip: N;
  /** How far the set wave has turned over (0..1, 1 where it faces down: the tube's ceiling). Absent means 0. */
  underside?: N;
  unresolvedSlopeVariance: N;
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

// saturate(): at the anti-solar point v·h rounds to a hair above 1, and pow() of a negative base is NaN on the GPU (it showed as a fake sun).
export const schlickWater = (cosTheta: N): N => float(0.02).add(float(0.98).mul(pow(saturate(float(1.0).sub(cosTheta)), 5.0)));

/** Diffuse skylight through a thin lip, seen from beneath it, as a fraction of the sun-backlit transmission's scale. */
export const LIP_SKY_TRANSMISSION = 0.5;

/**
 * Water = Fresnel-weighted sky reflection (the water itself where a turned-over surface reflects downward) + GGX sun
 * glitter + light from the water column (deep upwelling + lip transmission of sun and skylight), mixed with lit foam,
 * then aerial perspective.
 */
export function shadeWater(i: WaterSurfaceInputs, sky: Sky, u: WaterOpticsUniforms): N {
  const n = i.normal;
  const v = i.viewDir;
  const l = sky.sunDirection;
  const nDotV = max(dot(n, v), 1e-3);
  const nDotL = dot(n, l);
  const fresnel = schlickWater(nDotV);

  const r: N = reflect(v.negate(), n); // three typings gap: reflect() is typed as returning vec2
  const skyReflection = sky.radiance(normalize(vec3(r.x, max(r.y, 0.01), r.z)));

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

  // Where the set wave has turned over (the tube's ceiling), a reflection that heads down sees the water under the lip
  // (the face and the trough), not the horizon sky the clamp above would give: the tube stays water-dark, never white.
  const underside = i.underside ? saturate(i.underside) : float(0.0);
  const reflection = mix(skyReflection, upwelling, underside.mul(float(1.0).sub(smoothstep(-0.2, 0.05, r.y))));

  // Lip transmission: the sun behind a thin, curling lip shines through it toward the viewer (turquoise, spec §3.5, P11);
  // from beneath the lip (the tube's ceiling) the skylight through it adds a blue-green glow as well.
  const backlight = pow(saturate(dot(v.negate(), l)), 4.0);
  const lipLight = sky.sunIlluminance.mul(backlight).add(sky.skyIrradiance.mul(underside).mul(LIP_SKY_TRANSMISSION));
  const transmitted = u.transmission.mul(lipLight).mul(saturate(i.lip)).mul(u.transmissionIntensity).div(PI);

  // Below the surface: the seabed where it's in reach, blended with the water body by the view-path transmittance.
  const column = i.seabed ? i.seabed.radiance.mul(i.seabed.transmittance).add(upwelling.mul(vec3(1.0).sub(i.seabed.transmittance))) : upwelling;
  const water = column.add(transmitted).mul(float(1.0).sub(fresnel)).add(reflection.mul(fresnel)).add(specular);
  const foamLight = sky.skyIrradiance.add(sky.sunIlluminance.mul(saturate(nDotL))).mul(u.foamAlbedo).div(PI);
  const colour = mix(water, i.foamShade ? foamLight.mul(i.foamShade) : foamLight, saturate(i.foam));
  // Debug overlays: 1 m depth contours (white) and crest lines every 2 s of arrival time (gold).
  // Where the field is flat (open ocean at exactly 30 m, no field yet) fwidth is 0: smoothstep(0, 0, x) is NaN and
  // would paint the whole flat field NaN, so the edge is floored and a flat field draws no line.
  const line = (value: N, spacing: number): N => {
    const f = fract(value.div(spacing));
    const dist = min(f, float(1.0).sub(f));
    const w = fwidth(value.div(spacing));
    const weight = float(1.0).sub(smoothstep(0.0, max(w.mul(1.5), 1e-6), dist)).mul(step(1e-6, w));
    // Toward the horizon, consecutive lines land under a pixel apart and moiré into a solid band. Fade the
    // weight out below ~4 px of screen-space spacing (a flat field is already zeroed above regardless).
    const spacingPx = float(spacing).div(max(fwidth(value), 1e-6));
    return weight.mul(smoothstep(3.0, 6.0, spacingPx));
  };
  // The overlay inputs (a seabed fetch, a set-wave field fetch, the line maths) are evaluated only inside their
  // switch's branch, so overlays off cost nothing and leave colour untouched. Each switch is a uniform, so the
  // branches are uniform control flow and fwidth stays valid inside them.
  const o = i.overlay;
  const withOverlay = o
    ? Fn(() => {
      const c = colour.toVar();
      If(o.depthOn.greaterThan(0.5), () => { c.assign(mix(c, foamLight, line(o.depth, 1.0))); });
      If(o.crestOn.greaterThan(0.5), () => { c.assign(mix(c, foamLight.mul(vec3(1.0, 0.8, 0.25)), line(o.tau, 2.0))); });
      return c;
    })()
    : colour;
  return sky.applyAerialPerspective(withOverlay, i.distance, v.negate());
}
