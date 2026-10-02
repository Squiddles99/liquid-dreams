import { Fn, If, Loop, PI, dot, exp, float, max, min, mix, mx_noise_float, normalize, pow, refract, smoothstep, step, vec2, vec3 } from 'three/tsl';
import { type WaterOpticsUniforms, schlickWater } from '../ocean/waterShading';
import type { Sky } from '../sky/Sky';
import { REEF_ALBEDO as REEF_ALBEDO_RGB, SAND_ALBEDO as SAND_ALBEDO_RGB } from './bedLook';
import { kelpWeedAlbedoNode } from './kelpLook';
import type { Seabed } from './Seabed';
import { MARCH_DEPTH_ALLOWANCE_M, MARCH_REFINE, MARCH_STEPS, MAX_MARCH_DEPTH_M, MAX_MARCH_DIST_M, REACH_FADE_DEPTH_M, REACH_FADE_DIST_M, WATER_IOR } from './waterColumn';

type N = any;

// The bed's albedos are bedLook's, shared with the CPU check that the reef reads from the face (spec 2026-10-02 §2.5).
const REEF_ALBEDO = vec3(...REEF_ALBEDO_RGB), SAND_ALBEDO = vec3(...SAND_ALBEDO_RGB);

/** vec2(distance along d, hit 0/1): TSL mirror of marchSeabed(). */
export function marchSeabedNode(p: N, d: N, seabed: Seabed): N {
  return Fn(() => {
    const result = vec2(0.0, 0.0).toVar();
    const depthHere = p.y.sub(seabed.bedHeightNode(p.xz));
    const down = d.y.negate();
    If(down.greaterThan(0.02).and(depthHere.lessThan(MAX_MARCH_DEPTH_M)), () => {
      If(depthHere.lessThanEqual(0.0), () => {
        result.assign(vec2(0.0, 1.0));
      }).Else(() => {
        const maxDist = min(float(MAX_MARCH_DIST_M), depthHere.add(MARCH_DEPTH_ALLOWANCE_M).mul(1.5).div(max(down, 0.05)));
        const prev = float(0.0).toVar(), lo = float(0.0).toVar(), hi = float(0.0).toVar(), found = float(0.0).toVar();
        Loop(MARCH_STEPS, ({ i }: N) => {
          If(found.lessThan(0.5), () => {
            const s = maxDist.mul(pow(float(i).add(1.0).div(MARCH_STEPS), 1.6));
            const q = p.add(d.mul(s));
            If(q.y.lessThanEqual(seabed.bedHeightNode(q.xz)), () => {
              found.assign(1.0);
              lo.assign(prev);
              hi.assign(s);
            });
            prev.assign(s);
          });
        });
        If(found.greaterThan(0.5), () => {
          Loop(MARCH_REFINE, () => {
            const mid = lo.add(hi).mul(0.5);
            const q = p.add(d.mul(mid));
            If(q.y.lessThanEqual(seabed.bedHeightNode(q.xz)), () => { hi.assign(mid); }).Else(() => { lo.assign(mid); });
          });
          result.assign(vec2(lo.add(hi).mul(0.5), 1.0));
        });
      });
    });
    return result;
  })();
}

/**
 * The lit seabed at a world point: its normal (four height fetches), its material, and the sun and sky reaching it through
 * the water above. Shared by the look-through from above (seabedTerms) and the underwater view (WaterVolume).
 */
export function seabedRadianceNode(hitPos: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms, sunVisibility?: N, rayDir?: N): N {
  const e = 0.5;
  const hx = seabed.bedHeightNode(hitPos.xz.add(vec2(e, 0.0))).sub(seabed.bedHeightNode(hitPos.xz.sub(vec2(e, 0.0))));
  const hz = seabed.bedHeightNode(hitPos.xz.add(vec2(0.0, e))).sub(seabed.bedHeightNode(hitPos.xz.sub(vec2(0.0, e))));
  const nBed = normalize(vec3(hx.negate().div(2 * e), 1.0, hz.negate().div(2 * e)));
  const mat = seabed.materialNode(hitPos.xz);
  const detail = mx_noise_float(vec3(hitPos.x.mul(1.7), hitPos.z.mul(1.7), 0.0)).mul(0.5).add(0.5);
  // The weedy part is the kelp canopy (reef build B §4.2), along the ray that met the bed (straight down without one).
  const weedy = kelpWeedAlbedoNode(hitPos, rayDir ?? vec3(0.0, -1.0, 0.0), seabed.kelp, mat.y);
  const albedo = mix(mix(REEF_ALBEDO, weedy, mat.y), SAND_ALBEDO, mat.x).mul(detail.mul(0.4).add(0.8));

  const l = sky.sunDirection;
  const lw = normalize(refract(l.negate(), vec3(0.0, 1.0, 0.0), float(1 / WATER_IOR)));
  const cosW = max(lw.y.negate(), 0.2);
  const depthHit = max(seabed.tide.sub(hitPos.y), 0.0);
  const sunIn = sky.sunIlluminance.mul(float(1.0).sub(schlickWater(max(l.y, 0.0)))).mul(step(0.0, l.y));
  // × the land's shadow (Phase 4a §4.8), read at the surface point by the caller; absent means 1.
  const eSun = sunIn.mul(exp(u.extinction.mul(depthHit.div(cosW)).negate())).mul(max(dot(nBed, lw.negate()), 0.0)).mul(sunVisibility ?? float(1.0));
  const eSky = sky.skyIrradiance.mul(exp(u.extinction.mul(depthHit.mul(1.2)).negate()));
  return albedo.mul(eSun.add(eSky)).div(PI);
}

export interface SeabedShadingInputs {
  /** Displaced surface point in world space (includes the tide). */
  surfacePos: N;
  normal: N;
  /** Unit vector from the surface point toward the camera. */
  viewDir: N;
}

/** The seabed seen through the water: its radiance at the hit and the view-path transmittance (0 on a miss). */
export function seabedTerms(i: SeabedShadingInputs, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms, sunVisibility?: N): { radiance: N; transmittance: N } {
  const t = normalize(refract(i.viewDir.negate(), i.normal, float(1 / WATER_IOR)));
  const march = marchSeabedNode(i.surfacePos, t, seabed);
  // reachFade() mirror: fade the seabed out before the march's depth and distance cutoffs so there is no seam.
  const depthHere = i.surfacePos.y.sub(seabed.bedHeightNode(i.surfacePos.xz));
  const fade = float(1.0).sub(smoothstep(REACH_FADE_DEPTH_M, MAX_MARCH_DEPTH_M, depthHere))
    .mul(float(1.0).sub(smoothstep(REACH_FADE_DIST_M, MAX_MARCH_DIST_M, march.x)));
  const T = exp(u.extinction.mul(march.x).negate()).mul(march.y).mul(fade);

  // Lighting only where the march hit and the reach fade left something: on a miss (most distant water) T is 0 anyway,
  // and the bed normal's four fetches, the material fetch, the noise and the lighting are skipped.
  // Non-uniform control flow is fine here: Seabed samples with an explicit LOD (texture().level(0)).
  const radiance = Fn(() => {
    const out = vec3(0.0).toVar();
    If(march.y.greaterThan(0.5).and(fade.greaterThan(0.0)), () => {
      out.assign(seabedRadianceNode(i.surfacePos.add(t.mul(march.x)), seabed, sky, u, sunVisibility, t));
    });
    return out;
  })();
  return { radiance, transmittance: T };
}
