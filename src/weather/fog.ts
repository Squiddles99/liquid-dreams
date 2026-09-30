/**
 * Visibility, haze and mist (spec 2026-09-30 §4.7), and how much the exposure opens up under cloud (§4.6).
 */

/** The visibility the clear atmosphere already gives (its own Mie haze): the weather adds extinction only below it. */
export const CLEAR_VISIBILITY_KM = 60;
/** Koschmieder: the distance at which a black object's contrast falls to 2% is 3.912 / σ. */
const KOSCHMIEDER = 3.912;

/** Extra grey extinction (per m) at sea level for a visibility of `visibilityKm`, beyond the clear air's. */
export function fogExtinctionPerM(visibilityKm: number): number {
  return Math.max(0, KOSCHMIEDER / (visibilityKm * 1000) - KOSCHMIEDER / (CLEAR_VISIBILITY_KM * 1000));
}

/**
 * Optical depth of the haze along a ray from a camera camHeightM up, rising dirY per metre, over distanceM. The haze's
 * density falls off as exp(−h / (fogTopM / 3)): 5% of its sea-level density is left at fogTopM.
 */
export function fogOpticalDepth(camHeightM: number, dirY: number, distanceM: number, sigma0: number, fogTopM: number): number {
  const H = fogTopM / 3;
  const base = sigma0 * Math.exp(-camHeightM / H);
  const x = (dirY * distanceM) / H;
  // (1 − e^−x) / x → 1 − x/2 as x → 0: the series keeps it continuous (and exact enough) for a level ray.
  const shape = Math.abs(x) < 1e-6 ? 1 - x / 2 : (1 - Math.exp(-x)) / x;
  return base * distanceM * shape;
}

/**
 * Stops the exposure opens up under cloud: `compensation` of the way from the clear sky's light to the cloudy light
 * at the camera. A meter would open all the way; two-thirds keeps an overcast day darker and moodier, as it reads to
 * the eye and in photos (ruling, spec §4.6).
 */
export function exposureCloudStops(clearLum: number, cloudyLum: number, compensation = 2 / 3): number {
  if (!(clearLum > 0)) return 0;
  return compensation * Math.log2(clearLum / Math.max(cloudyLum, clearLum * 2 ** -30));
}
