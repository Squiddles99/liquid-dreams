import type { Station, StationEntry } from '../breaker/crestTrace';
import { OPEN_FACE, type RideContext, clamp01 } from './riderBody';
import { roomAt, tubeCover } from './tubeCover';

/** A section breaking along the line faster than this (m/s) is closing out: no one makes it. */
export const CLOSEOUT_PEEL_MS = 20;
/** The curl's speed is read over the stations this far along the crest either side of the rider's nearest (m). */
const PEEL_WINDOW_M = 10;

/** When each station breaks (s, comparable along the crest): its time since onset, negated, or its time until onset. */
const clockOf = (s: Station): number | null =>
  s.tb !== null && Number.isFinite(s.tb) ? -s.tb : s.until !== null && Number.isFinite(s.until) ? s.until : null;

/** The wave around the rider, for the stall's choice (ride-speed spec §4.3). */
export function rideContext(stations: readonly StationEntry[], x: number, z: number): RideContext {
  let near: Station | null = null, nearD = Infinity, nearI = -1;
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    if (s.gap) continue;
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < nearD) {
      nearD = d;
      near = s;
      nearI = i;
    }
  }
  if (!near) return { ...OPEN_FACE };
  const s: Station = near;
  const ahead = (x - s.x) * s.nx + (z - s.z) * s.nz, A = s.section.A;
  // The curl's speed: arc over onset time between neighbouring stations of the rider's wave near them.
  let sumArc = 0, sumT = 0;
  for (let i = Math.max(1, nearI - 30); i < Math.min(stations.length, nearI + 30); i++) {
    const a = stations[i - 1], b = stations[i];
    if (a.gap || b.gap || a.wave !== s.wave || b.wave !== s.wave) continue;
    if (Math.abs(b.arc - s.arc) > PEEL_WINDOW_M) continue;
    const ta = clockOf(a), tb = clockOf(b);
    if (ta === null || tb === null) continue;
    sumArc += Math.abs(b.arc - a.arc);
    sumT += Math.abs(tb - ta);
  }
  const curlSpeed = sumArc === 0 ? 0 : sumT < 1e-6 ? Infinity : sumArc / sumT;
  return {
    cover: tubeCover(stations, x, z),
    roomM: roomAt(stations, x, z),
    faceHigh: A > 0 ? clamp01(1 - Math.max(0, ahead) / (2 * A)) : 0,
    crestBehindM: Math.max(0, ahead),
    curlSpeed,
    closeout: curlSpeed > CLOSEOUT_PEEL_MS,
    faceHM: Number.isFinite(s.H) && s.H > 0 ? s.H : OPEN_FACE.faceHM,
  };
}
