import * as THREE from 'three/webgpu';
import { Fn, If, PI, dot, exp, float, fract, fwidth, length, max, min, mix, normalize, pow, reflect, refract, saturate, smoothstep, sqrt, step, uniform, vec3 } from 'three/tsl';
import { WATER_IOR, extinction } from '../seabed/waterColumn';
import type { Sky } from '../sky/Sky';
import { alongPathNode, cameraDepthNode, fresnelFromInsideNode, sunThroughWindowNode, waterColourAtDepthNode } from './underwaterNodes';
import { LIP_REFERENCE_THICKNESS_M, type WaterOpticsParams, transmissionColour, waterAlbedo } from './waterOptics';

type N = any;

export interface WaterSurfaceInputs {
  normal: N;
  /** Unit vector from the surface point toward the camera. */
  viewDir: N;
  distance: N;
  foam: N;
  /** Brightness of the foam colour (1 when absent): the set foam's pattern darkens its hollows a little. */
  foamShade?: N;
  /** The lip mask (0..1): the thin, curling lip. Keys the turquoise transmission. Absent means 0 (the ocean sheet). */
  lip?: N;
  /** How far the set wave has turned over (0..1, 1 where it faces down: the tube's ceiling). Absent means 0. */
  underside?: N;
  /** The lip's thickness (m) where `lip` is set: the light through it takes the water's colour over a path growing with
   * it (waterOptics.lipTransmissionColour). Absent: the fixed transmissionThicknessM path. */
  lipThickness?: N;
  /**
   * The normal the water body's sunlight enters through. Absent means straight up, the ocean sheet's (its slopes are
   * gentle). The breaking ribbon passes its own where its face stands up: a steep face turned to the sun is lit through
   * that face, and lit only from above it read as dark water under a reflected sunrise horizon (the lip's brown).
   */
  bodyLightNormal?: N;
  unresolvedSlopeVariance: N;
  /** The land seen in the reflection (Phase 4a §4.9): how much of the reflected ray r hits it, and its radiance. */
  landReflection?: (r: N) => { cover: N; radiance: N };
  /** The land's shadow: the fraction of the sun reaching this point (Phase 4a §4.8). Absent means 1. */
  sunVisibility?: N;
  /** The seabed seen through the water (Phase 1); absent means infinitely deep water (Phase 0). */
  seabed?: { radiance: N; transmittance: N };
  /** Dev overlays: still-water depth (m) and set-wave arrival time τ (s) at this point, and 0/1 switches for each. */
  overlay?: { depth: N; tau: N; depthOn: N; crestOn: N; foamMap?: N; foamOn?: N; sunOn?: N };
}

export function createWaterOpticsUniforms(p: WaterOpticsParams) {
  return {
    albedo: uniform(new THREE.Vector3(...waterAlbedo(p))),
    transmission: uniform(new THREE.Vector3(...transmissionColour(p))),
    extinction: uniform(new THREE.Vector3(...extinction(p.absorptionPerM, p.backscatterPerM))),
    bodyScale: uniform(p.bodyScale),
    transmissionIntensity: uniform(p.transmissionIntensity),
    lipSkyTransmission: uniform(p.lipSkyTransmission),
    absorption: uniform(new THREE.Vector3(...p.absorptionPerM)),
    transmissionThicknessM: uniform(p.transmissionThicknessM),
    lipSideSkylight: uniform(p.lipSideSkylight),
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
  u.lipSkyTransmission.value = p.lipSkyTransmission;
  u.absorption.value.set(...p.absorptionPerM);
  u.transmissionThicknessM.value = p.transmissionThicknessM;
  u.lipSideSkylight.value = p.lipSideSkylight;
  u.baseRoughness.value = p.baseRoughness;
  u.foamAlbedo.value = p.foamAlbedo;
}

// saturate(): at the anti-solar point v·h rounds to a hair above 1, and pow() of a negative base is NaN on the GPU (it showed as a fake sun).
export const schlickWater = (cosTheta: N): N => float(0.02).add(float(0.98).mul(pow(saturate(float(1.0).sub(cosTheta)), 5.0)));

/**
 * The deep water's own light, as the surface shows it from above with its body lit from straight up (shadeWater's
 * upwelling). `sunVisibility`: how much of the sun reaches the water there (the clouds' shade; 1 when absent).
 */
export function deepWaterUpwelling(sky: Sky, u: WaterOpticsUniforms, sunVisibility: N = float(1.0)): N {
  return u.albedo.mul(sky.skyIrradiance.add(sky.sunIlluminance.mul(max(sky.sunDirection.y, 0.0)).mul(sunVisibility))).div(PI).mul(u.bodyScale);
}

/**
 * Water = Fresnel-weighted sky reflection (the water itself where a turned-over surface reflects downward) + GGX sun
 * glitter + light from the water column (deep upwelling + lip transmission of sun and skylight), mixed with lit foam,
 * then aerial perspective.
 */
export function shadeWater(i: WaterSurfaceInputs, sky: Sky, u: WaterOpticsUniforms): N {
  const n = i.normal;
  const v = i.viewDir;
  const l = sky.sunDirection;
  const sv = i.sunVisibility ?? float(1.0);
  const nDotV = max(dot(n, v), 1e-3);
  const nDotL = dot(n, l);
  const fresnel = schlickWater(nDotV);

  const r: N = reflect(v.negate(), n); // three typings gap: reflect() is typed as returning vec2
  const skyReflection = sky.radiance(normalize(vec3(r.x, max(r.y, 0.01), r.z)));
  const land = i.landReflection ? i.landReflection(r) : null;
  const seen = land ? mix(skyReflection, land.radiance, land.cover) : skyReflection;

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
  ).mul(sv);

  // Light scattered back up out of the deep, clear water column.
  const sunIntoBody = i.bodyLightNormal ? max(dot(i.bodyLightNormal, l), 0.0).mul(step(0.0, l.y)) : max(l.y, 0.0);
  const upwelling = u.albedo.mul(sky.skyIrradiance.add(sky.sunIlluminance.mul(sunIntoBody).mul(sv))).div(PI).mul(u.bodyScale);

  // Where the set wave has turned over (the tube's ceiling), a reflection that heads down sees the water under the lip
  // (the face and the trough), not the horizon sky the clamp above would give: the tube stays water-dark, never white.
  const underside = i.underside ? saturate(i.underside) : float(0.0);
  const reflection = mix(seen, upwelling, underside.mul(float(1.0).sub(smoothstep(-0.2, 0.05, r.y))));

  // Lip transmission: light through the lip toward the viewer (spec 2026-09-29 §3.3), coloured by the water it crossed:
  // turquoise where the lip is thin, deeper blue-green toward its thick root (Beer–Lambert over a path that grows with the
  // thickness). The sun from behind it, and the skylight through it from beneath (the tube's ceiling) and from the side.
  const backlight = pow(saturate(dot(v.negate(), l)), 4.0);
  const lipLight = sky.sunIlluminance.mul(backlight).mul(sv)
    .add(sky.skyIrradiance.mul(u.lipSkyTransmission).mul(max(underside, u.lipSideSkylight)));
  const lipColour = i.lipThickness
    ? exp(u.absorption.mul(u.transmissionThicknessM.mul(i.lipThickness).div(LIP_REFERENCE_THICKNESS_M)).negate())
    : u.transmission;
  const transmitted = i.lip ? lipColour.mul(lipLight).mul(saturate(i.lip)).mul(u.transmissionIntensity).div(PI) : vec3(0.0);

  // Below the surface: the seabed where it's in reach, blended with the water body by the view-path transmittance.
  const column = i.seabed ? i.seabed.radiance.mul(i.seabed.transmittance).add(upwelling.mul(vec3(1.0).sub(i.seabed.transmittance))) : upwelling;
  const water = column.add(transmitted).mul(float(1.0).sub(fresnel)).add(reflection.mul(fresnel)).add(specular);
  const foamSky = sky.skyIrradiance.mul(u.foamAlbedo).div(PI);
  const foamSun = sky.sunIlluminance.mul(saturate(nDotL)).mul(sv).mul(u.foamAlbedo).div(PI);
  const foamLight = foamSky.add(foamSun);
  // The foam's own shade (its clumps and the creases between them, setFoamPattern's brightness 0.62–1.07; 1.07, the default
  // without set foam, is the plain lit foam): whitewater is
  // a heap of bubble clumps that shadow each other, so the creases lose the sun far more than the sky. The clumps' tops
  // catch the sun and the creases go sky-lit blue-grey; shaded as one smooth surface it read as flat peach plasticine.
  const shade = i.foamShade ? saturate(i.foamShade.sub(0.62).div(0.45)) : null;
  const foamSeen = shade ? foamSky.mul(mix(0.75, 1.0, shade)).add(foamSun.mul(mix(0.3, 1.0, shade.mul(shade)))) : foamLight;
  const colour = mix(water, foamSeen, saturate(i.foam));
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
      if (o.foamMap && o.foamOn) {
        const map = o.foamMap;
        If(o.foamOn.greaterThan(0.5), () => { c.assign(mix(c, foamLight.mul(vec3(0.25, 0.9, 1.0)), saturate(map).mul(0.8))); });
      }
      if (o.sunOn) {
        const on = o.sunOn;
        If(on.greaterThan(0.5), () => { c.assign(mix(c, foamLight.mul(vec3(0.1, 0.2, 1.0)), float(1.0).sub(sv).mul(0.7))); });
      }
      return c;
    })()
    : colour;
  return sky.applyAerialPerspective(withOverlay, i.distance, v.negate());
}

/**
 * The water's surface seen from below: Snell's window (the sky, and the sun, along the ray refracted out of the water) and,
 * by the Fresnel from inside (1 beyond the 48.6° rim), the water below reflected in it; foam blocks the window. Then the
 * path from the eye up to the surface point. No aerial perspective: the sky through the window already has it.
 * `reflected(dir)` is what the reflected ray sees (WaterVolume's seabed march from the surface point), so beyond the rim
 * the surface mirrors the reef and sand below, not only the deep water's colour.
 */
export function shadeWaterFromBelow(
  i: { normal: N; viewDir: N; distance: N; foam: N; surfaceY: N; tide: N; reflected: (dir: N) => N }, sky: Sky, u: WaterOpticsUniforms,
): N {
  const nDown = i.normal.negate();
  const cosI = max(dot(nDown, i.viewDir), 0.0);
  const R = fresnelFromInsideNode(cosI);
  const t: N = refract(i.viewDir.negate(), nDown, float(WATER_IOR)); // zero beyond the rim, where R = 1
  const tDir = normalize(vec3(t.x, max(t.y, 1e-3), t.z));
  const skyThrough = sky.radiance(tDir).add(sunThroughWindowNode(tDir, sky));
  // Under water the sun is shaded as it is where the eye is (the camera's own sun through the clouds; final review I2).
  const sunHere = sky.cloudSunTransmittance;
  const upwelling = deepWaterUpwelling(sky, u, sunHere);
  const below = i.reflected(reflect(i.viewDir.negate(), nDown));
  const surface = skyThrough.mul(float(1.0).sub(R)).add(below.mul(R));
  const foamLight = sky.skyIrradiance.add(sky.sunIlluminance.mul(max(sky.sunDirection.y, 0.0)).mul(sunHere)).mul(u.foamAlbedo).div(PI);
  const seen = mix(surface, foamLight.mul(0.6), saturate(i.foam));
  const inf = waterColourAtDepthNode(upwelling, u.extinction, cameraDepthNode(i.tide));
  return alongPathNode(seen, inf, u.extinction, i.distance);
}
