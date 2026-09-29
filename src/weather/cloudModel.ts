import type { WeatherConditions } from './weather';

/**
 * The clouds' CPU reference (spec 2026-09-30 §4.2): the layer's heights, the density's height profile and coverage,
 * and the ray's path through the curved shell. cloudNodes.ts mirrors these term by term on the GPU; the self-tests
 * compare the two with the noise forced to constants.
 */

/** The atmosphere's ground radius (DEFAULT_ATMOSPHERE.groundRadiusKm): the cloud shells curve with the same earth. */
export const EARTH_RADIUS_M = 6_360_000;

/** Low-cloud thickness (m) by convection: stratocumulus, cumulus, congestus, cumulonimbus. */
export const LOW_THICKNESS_KNOTS: ReadonlyArray<readonly [convection: number, thicknessM: number]> = [
  [0, 400], [0.4, 1500], [0.7, 4000], [1, 9000],
];

/** How much the detail noise eats into the cloud's edges (Nubis-style erosion). */
export const DETAIL_EROSION = 0.3;

const saturate = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function lowThicknessM(convection: number): number {
  const k = LOW_THICKNESS_KNOTS;
  const c = saturate(convection);
  for (let i = 1; i < k.length; i++) {
    if (c <= k[i][0]) return mix(k[i - 1][1], k[i][1], (c - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  }
  return k[k.length - 1][1];
}

export function lowLayer(w: Readonly<WeatherConditions>): { baseM: number; topM: number } {
  return { baseM: w.lowBaseM, topM: w.lowBaseM + lowThicknessM(w.convection) };
}

/**
 * Density by height through the layer (hFrac: 0 at the base, 1 at the top). Stratocumulus is a rounded slab;
 * cumulus has a flat, sharp base and a top that tapers (the noise then rounds it into towers); a cumulonimbus spreads
 * out again under the tropopause, the anvil.
 */
export function heightProfile(hFrac: number, convection: number): number {
  if (hFrac <= 0 || hFrac >= 1) return 0;
  const stratiform = smoothstep(0, 0.15, hFrac) * (1 - smoothstep(0.6, 1, hFrac));
  const cumuliform = smoothstep(0, 0.07, hFrac) * (1 - smoothstep(0.25, 1, hFrac));
  const anvil = smoothstep(0.7, 0.85, hFrac) * (1 - smoothstep(0.92, 1, hFrac)) * smoothstep(0.85, 1, convection);
  return saturate(mix(stratiform, cumuliform, smoothstep(0.1, 0.4, convection)) + 0.8 * anvil);
}

/**
 * Where the weather map lets cloud grow (0..1) for a map noise value n (0..1): none at cover 0; at cover 1
 * everywhere (overcast), whatever the noise.
 */
export function coverageDensity(n: number, cover: number): number {
  return saturate((n - 1 + 1.25 * cover) / 0.25);
}

/**
 * The cloud's density (0..1) from its height profile, the weather map's noise, the 3D shape noise and the detail
 * noise (all 0..1): the shape is cut back where coverage is thin (so cells shrink toward their edges), then eroded
 * by the detail at its fringes.
 */
export function cloudDensity(profile: number, coverageNoise: number, shapeNoise: number, detailNoise: number, cover: number): number {
  const wc = coverageDensity(coverageNoise, cover);
  if (wc <= 0) return 0;
  const shaped = saturate((shapeNoise * profile - (1 - wc)) / wc) * wc;
  const e = detailNoise * DETAIL_EROSION;
  return saturate((shaped - e) / (1 - e));
}

/** Distance along a ray from radius r0 (vertical component dirY) to a sphere of radius rho around it (inside it). */
function exitDistance(r0: number, dirY: number, rho: number): number {
  // (rho − r0)(rho + r0) instead of rho² − r0²: in float32 (the GPU mirror) the squares lose the metres.
  const disc = (r0 * dirY) ** 2 + (rho - r0) * (rho + r0);
  return -r0 * dirY + Math.sqrt(Math.max(disc, 0));
}

/**
 * The ray's path [enter, exit] (m) through the shell between baseM and topM over a curved earth, from a camera at
 * camHeightM looking along a direction whose vertical component is dirY. Null when the ray meets the ground first,
 * or the camera is above the shell.
 */
export function shellInterval(camHeightM: number, dirY: number, baseM: number, topM: number, earthRadiusM: number): [number, number] | null {
  const r0 = earthRadiusM + camHeightM;
  if (camHeightM >= topM) return null;
  if (dirY < 0 && (r0 * dirY) ** 2 - camHeightM * (2 * earthRadiusM + camHeightM) >= 0) return null;
  const enter = camHeightM < baseM ? exitDistance(r0, dirY, earthRadiusM + baseM) : 0;
  return [enter, exitDistance(r0, dirY, earthRadiusM + topM)];
}
