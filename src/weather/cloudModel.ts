import { travelDirectionXZ } from '../conditions/directions';
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
/**
 * The density's gain after erosion: a cumulus is opaque through its body (σ ~ 0.05–0.1 /m) and soft only in a thin
 * fringe. Without it the body stayed a thin haze and a backlit cloud glowed instead of going dark with bright rims.
 */
export const DENSITY_GAIN = 4;

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
  return saturate((n - 1 + 1.5 * cover) / 0.5);
}

/** A cell this weak only fills this fraction of the layer: cells rise from low edges to a tall core (domes). */
export const WEAK_CELL_HEIGHT = 0.3;

/**
 * The cloud's density (0..1) at hFrac through the layer, from the weather map's noise, the 3D shape noise and the
 * detail noise (all 0..1): a weak cell only fills the lower part of the layer (domes, not slabs), the shape is cut
 * back where coverage is thin (so cells shrink toward their edges), then eroded by the detail at its fringes.
 */
export function cloudDensity(hFrac: number, convection: number, coverageNoise: number, shapeNoise: number, detailNoise: number, cover: number): number {
  const wc = coverageDensity(coverageNoise, cover);
  if (wc <= 0) return 0;
  const profile = heightProfile(hFrac / (WEAK_CELL_HEIGHT + (1 - WEAK_CELL_HEIGHT) * wc), convection);
  const shaped = saturate((shapeNoise * profile - (1 - wc)) / wc) * wc;
  const e = detailNoise * DETAIL_EROSION;
  return saturate((DENSITY_GAIN * (shaped - e)) / (1 - e));
}

/**
 * Height (m) above the sea of a point t metres along a ray from a camera camHeightM up, rising dirY per metre, over a
 * curved earth: the camera's height, the climb, and the earth's drop away beneath the ray, t²(1 − dirY²)/2R. The
 * exact sphere needs (R + h)² ~ 4e13, which float32 (the GPU mirror) rounds to kilometres; this form keeps metres
 * (within a metre of the exact sphere at cloud heights, out to 150 km).
 */
export function heightAlong(camHeightM: number, dirY: number, t: number, earthRadiusM: number): number {
  return camHeightM + dirY * t + (t * t * (1 - dirY * dirY)) / (2 * earthRadiusM);
}

/** The distance at which heightAlong reaches heightM (above the camera), in the form without cancellation. */
function reachDistance(camHeightM: number, dirY: number, heightM: number, earthRadiusM: number): number {
  const k = (1 - dirY * dirY) / (2 * earthRadiusM);
  const rise = heightM - camHeightM;
  return (2 * rise) / (dirY + Math.sqrt(Math.max(dirY * dirY + 4 * k * rise, 0)));
}

/**
 * The ray's path [enter, exit] (m) through the shell between baseM and topM (heightAlong's curved earth), from a
 * camera camHeightM up looking along a direction whose vertical component is dirY. Null when the ray meets the sea
 * first, or the camera is above the shell.
 */
export function shellInterval(camHeightM: number, dirY: number, baseM: number, topM: number, earthRadiusM: number): [number, number] | null {
  if (camHeightM >= topM) return null;
  const k = (1 - dirY * dirY) / (2 * earthRadiusM);
  if (dirY < 0 && dirY * dirY >= 4 * k * camHeightM) return null;
  const enter = camHeightM < baseM ? reachDistance(camHeightM, dirY, baseM, earthRadiusM) : 0;
  return [enter, reachDistance(camHeightM, dirY, topM, earthRadiusM)];
}

/** How far (m, world xz) the clouds have drifted after simTimeS: downwind, at the wind aloft's speed. */
export function cloudDrift(w: Readonly<WeatherConditions>, simTimeS: number): { x: number; z: number } {
  const d = travelDirectionXZ(w.windAloftDeg);
  return { x: d.x * w.windAloftMs * simTimeS, z: d.z * w.windAloftMs * simTimeS };
}
