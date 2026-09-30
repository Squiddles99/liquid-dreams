/**
 * Auto-exposure table: (sun elevation in degrees, extra stops), ordered from high sun to low sun.
 * Piecewise-linear between knots and clamped at both ends (0 stops above the first knot, the last
 * knot's stops below it). Stops must never decrease as the sun drops. Tune here.
 */
export const EXPOSURE_KNOTS: ReadonlyArray<readonly [elevationDeg: number, stops: number]> = [
  [35, 0],
  // Sky light falls steeply below ~30° of sun; open up like a meter would so a low morning sun isn't slate-dark.
  [10, 1],
  [0, 2.2],
  [-6, 7],
  [-12, 11],
];

/** Extra stops of exposure as the sun drops from day to night (a simple, predictable auto-exposure). */
export function exposureStopsForSun(elevationDeg: number): number {
  const first = EXPOSURE_KNOTS[0];
  const last = EXPOSURE_KNOTS[EXPOSURE_KNOTS.length - 1];
  if (elevationDeg >= first[0]) return first[1];
  if (elevationDeg <= last[0]) return last[1];
  for (let i = 1; i < EXPOSURE_KNOTS.length; i++) {
    const [elLow, stopsLow] = EXPOSURE_KNOTS[i];
    if (elevationDeg >= elLow) {
      const [elHigh, stopsHigh] = EXPOSURE_KNOTS[i - 1];
      const t = (elHigh - elevationDeg) / (elHigh - elLow);
      return stopsHigh + t * (stopsLow - stopsHigh);
    }
  }
  return last[1];
}

/** Most a sun in the middle of the view stops the exposure down (a meter reading the brighter frame). */
export const SUN_IN_VIEW_MAX_STOPS = 1;
const COS_SUN_CENTRED = Math.cos((10 * Math.PI) / 180);
const COS_SUN_OUT_OF_VIEW = Math.cos((50 * Math.PI) / 180);

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Stops to take off when the camera looks toward a risen sun. The elevation table alone meters golden hour for
 * the dimmer sky away from the sun, which overexposes the aureole into a hard-edged ring when facing it.
 */
export function sunInViewStops(forwardDotSun: number, elevationDeg: number): number {
  return SUN_IN_VIEW_MAX_STOPS * smoothstep(COS_SUN_OUT_OF_VIEW, COS_SUN_CENTRED, forwardDotSun) * smoothstep(-2, 2, elevationDeg);
}

/**
 * `forwardDotSun`: cosine between the view direction and the sun (default: facing away). `cloudStops`: how far the
 * meter opens up under cloud (weather/cloudMeter). `sunVisible`: the sun's transmittance through the cloud, which
 * scales the stop-down for a sun in view (a hidden sun doesn't dazzle the meter).
 */
export function computeExposure(
  elevationDeg: number, baseExposure: number, evOffset: number, auto: boolean, forwardDotSun = -1, cloudStops = 0, sunVisible = 1,
): number {
  const autoStops = auto ? exposureStopsForSun(elevationDeg) - sunInViewStops(forwardDotSun, elevationDeg) * sunVisible + cloudStops : 0;
  return baseExposure * 2 ** (autoStops + evOffset);
}

/**
 * Underwater the eye opens up by this: the auto-exposure is set by the sun for a scene with the bright sky in it, and
 * under the surface the water is far darker: the reef read 4.6× darker than from above at the same exposure. At 5 it
 * reads 0.93× as bright as from above (3 left it 1.5× darker; the tone map compresses the gain).
 */
export const UNDERWATER_EXPOSURE_GAIN = 5;

/** The exposure for the eye's side of the surface. */
export function withUnderwater(exposure: number, underwater: boolean): number {
  return underwater ? exposure * UNDERWATER_EXPOSURE_GAIN : exposure;
}
