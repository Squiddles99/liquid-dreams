import type { Station, StationEntry } from '../breaker/crestTrace';
import { type P2, profileCurve } from '../breaker/wombProfile';
import { smoothstep } from '../math/smoothstep';

/**
 * How far a rider at (x, z) is under a curl [0, 1] (Andrew 2026-10-04: as she is about to be barrelled the camera goes over
 * her shoulder, and in the tube water gets on the lens). Read from the breaking ribbon's crest stations, as drawn: the
 * station's section (wombProfile's curve at its numbers, Station.section) overhangs the rider, water over her head with
 * room under it to stand in, at her distance ahead of the crest. Stations within a few metres along the crest count, fading
 * with the distance, so the cover rises as the throwing section closes in, before the lip is overhead.
 *
 * (x, z) is the rider's world position, as the ride's water (sectionWater) reads the sections: the ribbon draws the curl at
 * its own u along the station's normal, not displaced as the sheet is. Lips too small to stand under (TUBE_MIN_H_M) cover
 * nothing.
 *
 * It read the section's phase and hollowness, the tube taken as open over a window of phases on a hollow enough section;
 * in the game the over-shoulder camera and the lens water never came on (Andrew, 2026-10-05: "isn't engaging despite me
 * riding close to or being actually in the barrel"): the take-off's sections are only middling hollow on the reef as it is,
 * yet they throw a tube that is drawn. What is drawn over her is what counts.
 */
export const TUBE_MIN_H_M = 1.5;
/** Along the crest the cover fades from full to none over this (m), or this × H on a bigger wave. */
export const TUBE_REACH_M = 5;
export const TUBE_REACH_H = 1.2;
/** The room under the lip (m, the lip's underside over the water under it) she can stand in: none at the first, full by the second. */
export const TUBE_ROOM_M: readonly [number, number] = [0.6, 1.2];
/** The overhang is read at her u and this far (units of A) either side, averaged: soft edges, no camera flicker. */
export const TUBE_SOFT_UNITS = 0.15;

/** The room (units of A) between the water she stands on and the curve's next crossing over it at u; 0 with none over. */
export function roomOver(curve: readonly P2[], u: number): number {
  let wet = Infinity;
  const ys: number[] = [];
  for (let i = 0; i + 1 < curve.length; i++) {
    const [u0, y0] = curve[i], [u1, y1] = curve[i + 1];
    if (u0 === u1 || u < Math.min(u0, u1) || u > Math.max(u0, u1)) continue;
    const y = y0 + ((y1 - y0) * (u - u0)) / (u1 - u0);
    ys.push(y);
    if (u1 > u0 && y < wet) wet = y;
  }
  if (!Number.isFinite(wet)) return 0;
  let over = Infinity;
  for (const y of ys) if (y > wet + 1e-9 && y < over) over = y;
  return Number.isFinite(over) ? over - wet : 0;
}

export function tubeCover(stations: readonly StationEntry[], x: number, z: number): number {
  let best = 0;
  for (const s of stations) {
    if (s.gap || s.H < TUBE_MIN_H_M) continue;
    const c = coverAt(s, x, z);
    if (c > best) best = c;
  }
  return best;
}

const curves = new WeakMap<Station, P2[]>();

function coverAt(s: Station, x: number, z: number): number {
  const { A, phase, hollow, rho } = s.section;
  if (!(rho > 0) || !(A > 0)) return 0;
  const dx = x - s.x, dz = z - s.z;
  const ahead = dx * s.nx + dz * s.nz, along = Math.abs(-dx * s.nz + dz * s.nx);
  const reach = Math.max(TUBE_REACH_M, TUBE_REACH_H * s.H);
  if (along > reach || ahead <= 0 || ahead > 3 * A) return 0;
  let curve = curves.get(s);
  if (!curve) { curve = profileCurve(phase, hollow); curves.set(s, curve); }
  const u = ahead / A;
  let room = 0;
  for (const k of [-1, 0, 1]) room += smoothstep(TUBE_ROOM_M[0], TUBE_ROOM_M[1], A * roomOver(curve, u + k * TUBE_SOFT_UNITS)) / 3;
  return room * rho * (1 - smoothstep(0.25 * reach, reach, along)) * smoothstep(TUBE_MIN_H_M, TUBE_MIN_H_M + 0.5, s.H);
}
