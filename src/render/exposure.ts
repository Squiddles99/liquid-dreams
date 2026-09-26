/**
 * Auto-exposure table: (sun elevation in degrees, extra stops), ordered from high sun to low sun.
 * Piecewise-linear between knots and clamped at both ends (0 stops above the first knot, the last
 * knot's stops below it). Stops must never decrease as the sun drops. Tune here.
 */
export const EXPOSURE_KNOTS: ReadonlyArray<readonly [elevationDeg: number, stops: number]> = [
  [10, 0],
  [0, 2],
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

export function computeExposure(elevationDeg: number, baseExposure: number, evOffset: number, auto: boolean): number {
  return baseExposure * 2 ** ((auto ? exposureStopsForSun(elevationDeg) : 0) + evOffset);
}
