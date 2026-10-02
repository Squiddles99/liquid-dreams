import { PI, acos, cameraPosition, clamp, dot, exp, float, max, min, select, sqrt, smoothstep, vec3 } from 'three/tsl';
import { MAX_MARCH_DIST_M, REACH_FADE_DIST_M, WATER_IOR } from '../seabed/waterColumn';
import { SUN_ANGULAR_RADIUS_RAD, type Sky } from '../sky/Sky';

type N = any;

/** underwaterOptics.fresnelFromInside: exact dielectric Fresnel leaving the water; 1 at and beyond the critical angle. */
export function fresnelFromInsideNode(cosI: N): N {
  const c = clamp(cosI, 0.0, 1.0);
  const sinT2 = float(WATER_IOR * WATER_IOR).mul(float(1.0).sub(c.mul(c)));
  // max(…, 0) keeps sqrt finite beyond the critical angle, where the select returns 1 anyway.
  const cosT = sqrt(max(float(1.0).sub(sinT2), 0.0));
  const n1c = c.mul(WATER_IOR), n1t = cosT.mul(WATER_IOR);
  const rs = n1c.sub(cosT).div(max(n1c.add(cosT), 1e-6));
  const rp = n1t.sub(c).div(max(n1t.add(c), 1e-6));
  return select(sinT2.greaterThanEqual(1.0), float(1.0), rs.mul(rs).add(rp.mul(rp)).mul(0.5));
}

/** underwaterOptics.waterColourAtDepth. */
export function waterColourAtDepthNode(upwelling: N, ext: N, depth: N): N {
  return upwelling.mul(exp(ext.mul(depth).negate()));
}

/** underwaterOptics.alongPath. */
export function alongPathNode(end: N, inf: N, ext: N, s: N): N {
  const T = exp(ext.mul(s).negate());
  return end.mul(T).add(inf.mul(vec3(1.0).sub(T)));
}

/** underwaterOptics.throughWater: alongPath, faded into the water's colour over the reef's reach (reachFade). */
export function throughWaterNode(end: N, inf: N, ext: N, s: N): N {
  const fade = float(1.0).sub(smoothstep(REACH_FADE_DIST_M, MAX_MARCH_DIST_M, s));
  return inf.add(alongPathNode(end, inf, ext, s).sub(inf).mul(fade));
}

/** The eye's depth below the still-water level (m, 0 above it). */
export function cameraDepthNode(tide: N): N {
  return max(tide.sub(cameraPosition.y), 0.0);
}

/** The sun's disk along the transmitted ray t (as the sky dome draws it, clamped to 30000). */
export function sunThroughWindowNode(t: N, sky: Sky): N {
  const angle = acos(clamp(dot(t, sky.sunDirection), -1.0, 1.0));
  const r = float(SUN_ANGULAR_RADIUS_RAD);
  const disk = float(1.0).sub(smoothstep(r.mul(0.92), r.mul(1.08), angle));
  return min(sky.sunIlluminance.div(PI.mul(r).mul(r)), vec3(30000.0)).mul(disk).mul(sky.cloudSunTransmittance);
}
