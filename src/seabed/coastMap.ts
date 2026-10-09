import { smoothstep } from '../math/smoothstep';
import type { Bathymetry } from './bathymetry';
import { COAST_CONTOURS, contourXAt, waterlineX } from './coastContours';
import { type CoastParams, bombieDepth, ellensbrookBarDepth, lefthandersDepth } from './coastFeatures';
import { COAST_GRID, REEF_SURROUND_DEPTH_M, SHORE_FLAT_DEPTH_M } from './coastProfile';
import { OPEN_COAST_MATERIAL } from './shoreReef';
import { REEF_GRID } from './wombReef';

/**
 * The inner shelf's depth (m), from the shore ramp's end out to where it rises into the traced 10 m line (spec §3a.2).
 * The survey stops 300–500 m short of the beach, so this is hand-set: 9 m keeps a set up to 8 ft standing until the shore
 * band or a break (Task 4's maps, tools/_coastBreaks.ts); a 10 ft set (5.7 m) breaks on it, as on the real inside on a big
 * day. A linear rise from it meets the traced 10 m contour at 10 m.
 */
export const INNER_SHELF_M = 9;
/** The beach's ramp: SHORE_FLAT_DEPTH_M → 1.5 m over the first 30 m, then up to the shelf by this far off the
 * waterline (m). A steep beach: up to 8 ft the shore-break stays within the spec's 60 m shore band. */
export const SHORE_RAMP_END_M = 60;
/** The Womb's basin (the reef map's 15 m, coastProfile.REEF_SURROUND_DEPTH_M) is open to the sea in front of the reef
 * map and fades into the shelf over this far along the coast beyond the map's north and south edges (m). Inside it the
 * coast is depthBg's profile exactly, so the coast map meets the reef map's edges without a step. */
export const WOMB_HALO_M = 300;
/** The Womb's own beach (depthBg's gentle ramp to 15 m by 140 m) eases into the coast's steep one over this far beyond the
 * reef map's ends (m), inside the Womb's footprint (coastFeatures.BREAK_FOOTPRINTS.womb). */
export const WOMB_BEACH_HALO_M = 120;
/** Past the deepest traced contour the bed keeps its last slope, to at most this (m). */
export const OUTER_CAP_M = 40;
/** The reef map's footprint in coast cells: every 4 m cell whose 8 × 8 reef cells all lie inside REEF_GRID. */
const REEF_Z: readonly [number, number] = [REEF_GRID.z0, REEF_GRID.z0 + (REEF_GRID.nz - 1) * REEF_GRID.cellM];

/** How much of the Womb's basin reaches z: 1 alongside the reef map, 0 beyond WOMB_HALO_M past its ends. */
export function wombHalo(z: number): number {
  const out = Math.max(0, REEF_Z[0] - z, z - REEF_Z[1]);
  return 1 - smoothstep(0, WOMB_HALO_M, out);
}

/** The beach ramp from the waterline (s = 0) to `plateau` at `rampEnd` m offshore. */
function shoreRamp(s: number, plateau: number, rampEnd: number): number {
  if (s <= 0) return SHORE_FLAT_DEPTH_M;
  if (s < 30) return SHORE_FLAT_DEPTH_M + (1.5 - SHORE_FLAT_DEPTH_M) * smoothstep(0, 30, s);
  if (s < rampEnd) return 1.5 + (plateau - 1.5) * smoothstep(30, rampEnd, s);
  return plateau;
}

/** Per row: the traced contours' x and the waterline, read once. */
interface RowFrame { z: number; shore: number; xs: Float64Array; halo: number; beachHalo: number }

function rowFrame(z: number): RowFrame {
  const xs = new Float64Array(COAST_CONTOURS.length);
  for (let i = 0; i < xs.length; i++) xs[i] = contourXAt(COAST_CONTOURS[i], z);
  const out = Math.max(0, REEF_Z[0] - z, z - REEF_Z[1]);
  return { z, shore: waterlineX(z), xs, halo: wombHalo(z), beachHalo: 1 - smoothstep(0, WOMB_BEACH_HALO_M, out) };
}

/** The traced depth at x on this row: the contours, the linear rise into the 10 m line inshore of it, and the last slope
 * past the deepest. */
function shelfDepth(x: number, f: RowFrame, rampEnd: number): number {
  const xs = f.xs, n = xs.length;
  if (x > xs[0]) {
    // Inshore of the 10 m line: from the inner shelf at the ramp's end, linearly up to 10 m at the line.
    const s = f.shore - x, s10 = f.shore - xs[0];
    if (s10 <= rampEnd) return COAST_CONTOURS[0].depthM;
    const t = Math.min(1, Math.max(0, (s - rampEnd) / (s10 - rampEnd)));
    return INNER_SHELF_M + (COAST_CONTOURS[0].depthM - INNER_SHELF_M) * t;
  }
  for (let i = 1; i < n; i++) {
    if (x >= xs[i]) {
      const a = COAST_CONTOURS[i - 1].depthM, b = COAST_CONTOURS[i].depthM;
      return a + ((b - a) * (xs[i - 1] - x)) / (xs[i - 1] - xs[i]);
    }
  }
  const slope = (COAST_CONTOURS[n - 1].depthM - COAST_CONTOURS[n - 2].depthM) / Math.max(1, xs[n - 2] - xs[n - 1]);
  return Math.min(OUTER_CAP_M, COAST_CONTOURS[n - 1].depthM + slope * (xs[n - 1] - x));
}

/** The coast's depth at x on this row before the features: the beach, the inner shelf, the traced shelf, the Womb's basin. */
function openCoastDepth(x: number, f: RowFrame): number {
  const w = f.halo;
  const plateau = INNER_SHELF_M + (REEF_SURROUND_DEPTH_M - INNER_SHELF_M) * w;
  const rampEnd = SHORE_RAMP_END_M + (140 - SHORE_RAMP_END_M) * f.beachHalo;
  const s = f.shore - x;
  const ramp = shoreRamp(s, plateau, rampEnd);
  if (s < rampEnd) return ramp;
  return Math.max(plateau, shelfDepth(x, f, rampEnd));
}

/**
 * The coast map (spec §3b) on COAST_GRID: the traced outer shelf, the hand-set inner shelf and beach, the Womb's reef map
 * block-averaged into its footprint (`reef` on REEF_GRID or any grid whose cells tile the 4 m cells, e.g. the 1 m field
 * grid), and Lefthanders, the Bombie and Ellensbrook's bar laid over it. Bed heights (negative below mean sea level), as
 * the reef map's.
 */
export function buildCoastMap(reef: Bathymetry, p: CoastParams): Bathymetry {
  const g = COAST_GRID, n = g.nx * g.nz, half = g.cellM / 2;
  const bed = new Float32Array(n), sand = new Float32Array(n).fill(OPEN_COAST_MATERIAL[0]), weed = new Float32Array(n).fill(OPEN_COAST_MATERIAL[1]);
  const rg = reef.grid, per = Math.round(g.cellM / rg.cellM);
  for (let r = 0; r < g.nz; r++) {
    const z = g.z0 + r * g.cellM;
    const f = rowFrame(z);
    const r0 = Math.round((z - half - rg.z0) / rg.cellM);
    for (let c = 0; c < g.nx; c++) {
      const x = g.x0 + c * g.cellM, i = r * g.nx + c;
      const c0 = Math.round((x - half - rg.x0) / rg.cellM);
      if (c0 >= 0 && r0 >= 0 && c0 + per <= rg.nx && r0 + per <= rg.nz) {
        // Inside the reef map: its cells, averaged.
        let b = 0, sd = 0, wd = 0;
        for (let dr = 0; dr < per; dr++) for (let dc = 0; dc < per; dc++) {
          const j = (r0 + dr) * rg.nx + c0 + dc;
          b += reef.bed[j]; sd += reef.sand[j]; wd += reef.weed[j];
        }
        const inv = 1 / (per * per);
        bed[i] = b * inv; sand[i] = sd * inv; weed[i] = wd * inv;
        continue;
      }
      let d = openCoastDepth(x, f);
      d = Math.min(d, lefthandersDepth(x, z, p), bombieDepth(x, z, d, p), ellensbrookBarDepth(x, z, d, p));
      bed[i] = -d;
    }
  }
  return { grid: g, bed, sand, weed };
}
