import { WOMB_LOCATION } from '../conditions/defaults';
import { awstToUtc } from '../conditions/time';
import type { Conditions } from '../conditions/types';
import { sunDirectionWorld, sunPosition } from './sunPosition';

export interface SunState {
  azimuthDeg: number;
  elevationDeg: number;
  direction: [number, number, number];
}

export function sunForConditions(c: Pick<Conditions, 'date' | 'timeOfDay'>): SunState {
  const { azimuthDeg, elevationDeg } = sunPosition(WOMB_LOCATION.latDeg, WOMB_LOCATION.lonDeg, awstToUtc(c.date, c.timeOfDay));
  return { azimuthDeg, elevationDeg, direction: sunDirectionWorld(azimuthDeg, elevationDeg) };
}
