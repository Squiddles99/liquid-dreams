import type { Rgb } from '../sky/atmosphereParams';
import { smoothstep } from '../math/smoothstep';
import { MAX_MARCH_DIST_M, REACH_FADE_DIST_M, WATER_IOR } from '../seabed/waterColumn';

export type Vec3 = [number, number, number];

/** Beyond this angle from the surface normal, a ray in the water reflects completely (asin(1 / n_w) = 48.6°). */
export const CRITICAL_ANGLE_RAD = Math.asin(1 / WATER_IOR);
/** The eye is underwater below the water height minus this, and above again above it plus this (no flicker). */
export const UNDERWATER_BAND_M = 0.05;

/**
 * The ray leaving the water into the air (unit), for v (unit, from the surface point toward the camera below it) and
 * nDown (unit normal pointing down, into the water): GLSL refract(−v, nDown, n_w). Null beyond the critical angle.
 */
export function refractOut(v: Vec3, nDown: Vec3): Vec3 | null {
  const i: Vec3 = [-v[0], -v[1], -v[2]];
  const cosI = -(i[0] * nDown[0] + i[1] * nDown[1] + i[2] * nDown[2]);
  const eta = WATER_IOR;
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  const a = eta * cosI - Math.sqrt(k);
  return [eta * i[0] + a * nDown[0], eta * i[1] + a * nDown[1], eta * i[2] + a * nDown[2]];
}

/**
 * Unpolarised reflectance of the water's surface seen from inside, at incidence cosine cosI: the exact dielectric
 * Fresnel (Schlick is wrong near the critical angle, where Snell's window has its rim). 1 at and beyond the critical angle.
 */
export function fresnelFromInside(cosI: number): number {
  const n1 = WATER_IOR, n2 = 1;
  const c = Math.min(1, Math.max(0, cosI));
  const sinT2 = (n1 / n2) ** 2 * (1 - c * c);
  if (sinT2 >= 1) return 1;
  const cosT = Math.sqrt(1 - sinT2);
  const rs = ((n1 * c - n2 * cosT) / (n1 * c + n2 * cosT)) ** 2;
  const rp = ((n1 * cosT - n2 * c) / (n1 * cosT + n2 * c)) ** 2;
  return (rs + rp) / 2;
}

/** The water's own colour at depth d: the deep-water upwelling the surface shows from above, dimmed by exp(−ext·d). */
export function waterColourAtDepth(upwelling: Rgb, ext: Rgb, depthM: number): Rgb {
  return [0, 1, 2].map((i) => upwelling[i] * Math.exp(-ext[i] * depthM)) as Rgb;
}

/** Along a path of length s through the water: what is at its end, fading into the water's colour. */
export function alongPath(end: Rgb, inf: Rgb, ext: Rgb, s: number): Rgb {
  return [0, 1, 2].map((i) => { const T = Math.exp(-ext[i] * s); return end[i] * T + inf[i] * (1 - T); }) as Rgb;
}

/**
 * Something s away seen through the water from an underwater eye, as the water volume shows the reef: alongPath, faded
 * into the water's colour from REACH_FADE_DIST_M to MAX_MARCH_DIST_M (reachFade), so a mesh fades where the reef does.
 */
export function throughWater(end: Rgb, inf: Rgb, ext: Rgb, s: number): Rgb {
  const fade = 1 - smoothstep(REACH_FADE_DIST_M, MAX_MARCH_DIST_M, s);
  const a = alongPath(end, inf, ext, s);
  return [0, 1, 2].map((i) => inf[i] + (a[i] - inf[i]) * fade) as Rgb;
}

/** Whether the eye is underwater, with a ±UNDERWATER_BAND_M band around the water height so riding the surface can't flicker. */
export function nextUnderwater(prev: boolean, cameraY: number, waterY: number): boolean {
  if (prev) return cameraY < waterY + UNDERWATER_BAND_M;
  return cameraY < waterY - UNDERWATER_BAND_M;
}
