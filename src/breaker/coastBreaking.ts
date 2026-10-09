import { waterlineX } from '../seabed/coastContours';
import { BREAK_FOOTPRINTS, COBBLESTONES_APPROACH, insidePolygon } from '../seabed/coastFeatures';
import { type BreakParams, breakingRatio } from './breaking';
import type { CoastField } from './coastField';

/** The shore band (spec §4.4): a set may break anywhere this close to the waterline (m), and ashore. */
export const SHORE_BAND_M = 60;

export type BreakZone = keyof typeof BREAK_FOOTPRINTS | 'shore' | 'cobblestones' | 'elsewhere';

/** Where a coast cell lies for the no-closeout rule: a break's footprint, the shore band, the Cobblestones approach
 * (coastFeatures.COBBLESTONES_APPROACH), or elsewhere (a closeout). */
export function breakZone(x: number, z: number): BreakZone {
  for (const [name, poly] of Object.entries(BREAK_FOOTPRINTS)) if (insidePolygon(x, z, poly)) return name as BreakZone;
  if (waterlineX(z) - x <= SHORE_BAND_M) return 'shore';
  return insidePolygon(x, z, COBBLESTONES_APPROACH) ? 'cobblestones' : 'elsewhere';
}

/**
 * The coast cells a set wave of deep-water height H stands up on (spec §4.4): breakingRatio(H · amp, hminBreak) ≥ 1,
 * with the coast field's amplification and breaking depth at each node (1: breaks, 0: does not).
 */
export function coastBreakingCells(c: CoastField, H: number, p: Pick<BreakParams, 'gamma' | 'delta' | 'hFloorM'>): Uint8Array {
  const out = new Uint8Array(c.tau.length);
  for (let i = 0; i < out.length; i++) out[i] = breakingRatio(H * c.amp[i], c.hminBreak[i], p as BreakParams) >= 1 ? 1 : 0;
  return out;
}

export interface CoastBreakReport {
  /** Breaking cells per zone. */
  cells: Record<BreakZone, number>;
  /** Where the 'elsewhere' cells are (up to 12, for the report). */
  closeouts: [number, number][];
  /** The extent (m) of the Bombie's breaking cells along the crest (⟂ the travel direction there). */
  bombieCrestM: number;
}

export function reportBreaking(c: CoastField, broken: Uint8Array): CoastBreakReport {
  const g = c.grid;
  const cells: Record<BreakZone, number> = { lefthanders: 0, womb: 0, bombie: 0, ellensbrook: 0, shore: 0, cobblestones: 0, elsewhere: 0 };
  const closeouts: [number, number][] = [];
  let lo = Infinity, hi = -Infinity;
  for (let r = 0; r < g.nz; r++) for (let col = 0; col < g.nx; col++) {
    const i = r * g.nx + col;
    if (!broken[i]) continue;
    const x = g.x0 + col * g.cellM, z = g.z0 + r * g.cellM, zone = breakZone(x, z);
    cells[zone]++;
    if (zone === 'elsewhere' && closeouts.length < 12) closeouts.push([x, z]);
    if (zone === 'bombie') {
      const along = -x * c.dirZ[i] + z * c.dirX[i];
      lo = Math.min(lo, along); hi = Math.max(hi, along);
    }
  }
  return { cells, closeouts, bombieCrestM: hi >= lo ? hi - lo + g.cellM : 0 };
}
