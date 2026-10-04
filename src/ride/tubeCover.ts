import { type BreakParams, TUBE_HOLD_S, TUBE_THROWN_PSI, landingEstimate } from '../breaker/breaking';
import type { StationEntry } from '../breaker/crestTrace';
import { smoothstep } from '../math/smoothstep';

/**
 * How far a rider at (x, z) is under a curl [0, 1] (Andrew 2026-10-04: as she is about to be barrelled the camera goes over
 * her shoulder, and in the tube water gets on the lens). Read from the breaking ribbon's crest stations: a section that has
 * thrown its lip and still holds its tube open, the rider between its crest and where the lip lands, within a few metres
 * along the crest (so it rises as the throwing section closes in, before the lip is overhead). (x, z) is undisplaced, as the
 * stations are: the water's label under the board (WaterAt.lx, lz). Lips too small to stand
 * under (TUBE_MIN_H_M) or too gentle to throw a tube (ψ, TUBE_THROWN_PSI) cover nothing.
 */
export const TUBE_MIN_H_M = 1.5;
/** Along the crest the cover fades from full to none over this (m), or this × H on a bigger wave. */
export const TUBE_REACH_M = 5;
export const TUBE_REACH_H = 1.2;
/**
 * In the tube is in front of the crest by at least this × H (lower on the face, under the lip): at the crest line she is
 * up in the lip (Andrew's playtest bot rode the crest as the section threw and the camera went in with nothing over her).
 */
export const TUBE_FRONT_H = 0.2;
/** The lip lands about this × H ahead of the crest (the normal anchor's 1.7 H, less a little): the tube's floor. */
export const TUBE_DEPTH_H = 1.6;
/** The lip has gone over (from the crest) by this share of its fall to landing. */
export const TUBE_OVER_SHARE = 0.4;

export function tubeCover(stations: readonly StationEntry[], x: number, z: number, p: Pick<BreakParams, 'troughDrain' | 'delta'>): number {
  let best = 0;
  for (const s of stations) {
    if (s.gap || s.tb === null || !Number.isFinite(s.tb) || s.H < TUBE_MIN_H_M) continue;
    const thrown = smoothstep(TUBE_THROWN_PSI[0], TUBE_THROWN_PSI[1], s.psi);
    if (thrown <= 0) continue;
    const dx = x - s.x, dz = z - s.z;
    const ahead = dx * s.nx + dz * s.nz, along = Math.abs(-dx * s.nz + dz * s.nx);
    const reach = Math.max(TUBE_REACH_M, TUBE_REACH_H * s.H);
    if (ahead < 0.5 * TUBE_FRONT_H * s.H || ahead > TUBE_DEPTH_H * s.H || along > reach) continue;
    // Soft edges (no camera flicker as she crosses them): up toward the crest, and out past the lip's landing.
    const across = smoothstep(0.5 * TUBE_FRONT_H * s.H, 1.5 * TUBE_FRONT_H * s.H, ahead) * (1 - smoothstep(0.8 * TUBE_DEPTH_H * s.H, TUBE_DEPTH_H * s.H, ahead));
    const land = landingEstimate(s.H, p), open = land + TUBE_HOLD_S * thrown;
    const time = smoothstep(0, TUBE_OVER_SHARE * land, s.tb) * (1 - smoothstep(open - 0.3, open, s.tb));
    const c = time * across * (1 - smoothstep(0.25 * reach, reach, along)) * smoothstep(TUBE_MIN_H_M, TUBE_MIN_H_M + 0.5, s.H) * Math.min(1, thrown * 2);
    if (c > best) best = c;
  }
  return best;
}
