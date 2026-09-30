import { bearingToWorldXZ } from '../conditions/directions';
import { type Strike, thunderDelayS } from '../weather/rainModel';

/** The rain's hiss (weather W2): as loud as the rain at the camera, brighter as it gets heavier; muffled under water. */
export function rainSound(rain: number, underwater: boolean): { level: number; brightness: number } {
  const r = Math.min(1, Math.max(0, rain));
  if (r === 0) return { level: 0, brightness: 0 };
  return { level: r ** 0.7 * (underwater ? 0.25 : 1), brightness: 0.4 + 0.6 * r };
}

export interface ThunderEvent {
  /** Seconds after the flash (the strike's distance over the speed of sound). */
  delayS: number;
  /** Where it's heard from: the strike's direction, placed THUNDER_PLACE_M away (for the panning; the level carries the distance). */
  x: number;
  y: number;
  z: number;
  level: number;
  /** The air takes the highs out of far thunder: a low-pass cutoff that falls with distance. */
  cutoffHz: number;
  /** A near strike cracks before it rumbles. */
  crack: boolean;
}

const THUNDER_PLACE_M = 800;
const CRACK_WITHIN_M = 3000;

/** The thunder of a strike, heard at the break (the camera is within a few hundred metres of it). */
export function thunderEvent(s: Strike): ThunderEvent {
  const d = bearingToWorldXZ(s.bearingDeg);
  return {
    delayS: thunderDelayS(s.distanceM),
    x: d.x * THUNDER_PLACE_M,
    y: 200,
    z: d.z * THUNDER_PLACE_M,
    level: Math.min(1, Math.max(0.08, (3000 / s.distanceM) ** 0.8)),
    cutoffHz: 120 + 2500 * Math.exp(-s.distanceM / 5000),
    crack: s.distanceM < CRACK_WITHIN_M,
  };
}
