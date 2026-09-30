import type { WeatherConditions } from '../weather/weather';

export interface SwellConditions {
  /** Surfer feet, measured from the back of the wave (canonical unit). */
  sizeFt: number;
  /** Peak period, seconds. */
  periodS: number;
  /** Direction the swell comes FROM, degrees true. */
  directionDeg: number;
}

export interface WindConditions {
  speedMs: number;
  /** Direction the wind comes FROM, degrees true. */
  directionDeg: number;
}

export interface Conditions {
  /** Local AWST date, 'YYYY-MM-DD'. */
  date: string;
  /** Local AWST hours, [0, 24). */
  timeOfDay: number;
  swell: SwellConditions;
  wind: WindConditions;
  /** Metres relative to mean sea level (used from Phase 1). */
  tideM: number;
  /** uint32 seed for every random process. */
  seed: number;
  /** The sky: cloud, rain, visibility (spec 2026-09-30). */
  weather: WeatherConditions;
}
