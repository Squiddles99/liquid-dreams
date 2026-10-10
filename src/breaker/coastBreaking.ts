import { waterlineX } from '../seabed/coastContours';
import { BREAK_FOOTPRINTS, COBBLESTONES_APPROACH, insidePolygon } from '../seabed/coastFeatures';
import { type BreakParams, breakingDepth, breakingHeight, breakingHeightThreshold, breakingRatio } from './breaking';
import type { CoastField } from './coastField';

/**
 * The shore band (spec §4.4; shelf-polish spec §5): a set may break anywhere between the waterline and where the coast
 * map's profile along the row first reaches the set's breaking depth (setBreakingDepth), plus this margin (m), and ashore.
 * It replaces the fixed 60 m from before the buoy dial: the band is where the shelf breaks the set, so it grows with the set.
 */
export const SHORE_BAND_MARGIN_M = 20;
type Gd = Pick<BreakParams, 'gamma' | 'delta' | 'hFloorM'>;

/** The still-water depth (m) at which a set wave of height H, unamplified, breaks: breakingHeight(breakingDepth(d)) = H. */
export function setBreakingDepth(H: number, p: Gd): number {
  let lo = 0, hi = 100;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (breakingHeight(breakingDepth(mid), p as BreakParams) < H) lo = mid; else hi = mid; }
  return hi;
}

/** The shore band's width (m off the waterline) on each of the coast field's rows for a set of height H: the first cell
 * seaward of the waterline whose depth reaches setBreakingDepth(H), plus SHORE_BAND_MARGIN_M. */
export function shoreBands(c: CoastField, H: number, p: Gd): Float64Array {
  const g = c.grid, dB = setBreakingDepth(H, p), out = new Float64Array(g.nz);
  for (let r = 0; r < g.nz; r++) {
    const z = g.z0 + r * g.cellM, shore = waterlineX(z);
    let s = 0;
    for (; s < g.nx * g.cellM; s += g.cellM) {
      const col = Math.round((shore - s - g.x0) / g.cellM);
      if (col < 0 || col >= g.nx) break;
      if (c.depth[r * g.nx + col] >= dB) break;
    }
    out[r] = s + SHORE_BAND_MARGIN_M;
  }
  return out;
}

export type BreakZone = keyof typeof BREAK_FOOTPRINTS | 'shore' | 'cobblestones' | 'elsewhere';

/** Where a coast cell lies for the no-closeout rule: a break's footprint, the shore band (bandM off the waterline on its
 * row: shoreBands), the Cobblestones approach (coastFeatures.COBBLESTONES_APPROACH), or elsewhere (a closeout). */
export function breakZone(x: number, z: number, bandM: number): BreakZone {
  for (const [name, poly] of Object.entries(BREAK_FOOTPRINTS)) if (insidePolygon(x, z, poly)) return name as BreakZone;
  if (waterlineX(z) - x <= bandM) return 'shore';
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

/** The smallest set height (m, deep water) the coast field breaks anywhere in a break's footprint: the lowest
 * breakingHeightThreshold over its cells (coastBreakingCells breaks a cell exactly when H reaches its threshold). Infinity
 * if none. The Bombie's bursts fire from it (shelf-polish §7: one Bombie, the coast's). */
export function footprintBreakHeight(c: CoastField, zone: keyof typeof BREAK_FOOTPRINTS, p: Gd): number {
  const g = c.grid, poly = BREAK_FOOTPRINTS[zone];
  let min = Infinity;
  for (let r = 0; r < g.nz; r++) for (let col = 0; col < g.nx; col++) {
    const x = g.x0 + col * g.cellM, z = g.z0 + r * g.cellM, i = r * g.nx + col;
    if (c.depth[i] > 0 && insidePolygon(x, z, poly)) min = Math.min(min, breakingHeightThreshold(c.amp[i], c.hminBreak[i], p as BreakParams));
  }
  return min;
}

export interface CoastBreakReport {
  /** Breaking cells per zone. */
  cells: Record<BreakZone, number>;
  /** Where the 'elsewhere' cells are (up to 12, for the report). */
  closeouts: [number, number][];
  /** The extent (m) of the Bombie's breaking cells along the crest (⟂ the travel direction there). */
  bombieCrestM: number;
}

/** The breaking cells of a set of height H (coastBreakingCells) by zone, the shore band sized for H. */
export function reportBreaking(c: CoastField, broken: Uint8Array, H: number, p: Gd): CoastBreakReport {
  const g = c.grid, bands = shoreBands(c, H, p);
  const cells: Record<BreakZone, number> = { lefthanders: 0, womb: 0, bombie: 0, ellensbrook: 0, shore: 0, cobblestones: 0, elsewhere: 0 };
  const closeouts: [number, number][] = [];
  let lo = Infinity, hi = -Infinity;
  for (let r = 0; r < g.nz; r++) for (let col = 0; col < g.nx; col++) {
    const i = r * g.nx + col;
    if (!broken[i]) continue;
    const x = g.x0 + col * g.cellM, z = g.z0 + r * g.cellM, zone = breakZone(x, z, bands[r]);
    cells[zone]++;
    if (zone === 'elsewhere' && closeouts.length < 12) closeouts.push([x, z]);
    if (zone === 'bombie') {
      const along = -x * c.dirZ[i] + z * c.dirX[i];
      lo = Math.min(lo, along); hi = Math.max(hi, along);
    }
  }
  return { cells, closeouts, bombieCrestM: hi >= lo ? hi - lo + g.cellM : 0 };
}
