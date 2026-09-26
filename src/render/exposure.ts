export const DAY_ELEVATION_DEG = 20;
export const NIGHT_ELEVATION_DEG = -10;
export const NIGHT_EXTRA_STOPS = 6;

/** Extra stops of exposure as the sun drops from day to night (a simple, predictable auto-exposure). */
export function exposureStopsForSun(elevationDeg: number): number {
  const t = (DAY_ELEVATION_DEG - elevationDeg) / (DAY_ELEVATION_DEG - NIGHT_ELEVATION_DEG);
  return Math.min(1, Math.max(0, t)) * NIGHT_EXTRA_STOPS;
}

export function computeExposure(elevationDeg: number, baseExposure: number, evOffset: number, auto: boolean): number {
  return baseExposure * 2 ** ((auto ? exposureStopsForSun(elevationDeg) : 0) + evOffset);
}
