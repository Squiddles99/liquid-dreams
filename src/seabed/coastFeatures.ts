import { smoothstep } from '../math/smoothstep';
import { waterlineX } from './coastContours';

type Pt = readonly [number, number];

/**
 * The coast's dials (lineup truth spec §3g): the three breaks other than the Womb, laid over the coast map as named,
 * parametric shoals (like wombReef.ts). Game metres: +x east, +z south, origin the Womb's peak.
 */
export interface CoastParams {
  /** Depth (m) along Lefthanders' ledge. */
  lefthandersLedgeM: number;
  /** Depth (m) of the Bombie's top. */
  bombieTopM: number;
  /** Radius (m) over which the Bombie's mound meets the shelf. */
  bombieRadiusM: number;
  /** Depth (m) along Ellensbrook's sand bar. */
  ellensbrookBarM: number;
  /** The bar's distance (m) off Ellensbrook's waterline. */
  ellensbrookBarOffM: number;
}

export const DEFAULT_COAST_PARAMS: CoastParams = {
  lefthandersLedgeM: 5,
  bombieTopM: 5,
  bombieRadiusM: 60,
  ellensbrookBarM: 2,
  ellensbrookBarOffM: 80,
};

/** Keeps each dial in a range that builds a sensible bed (spec §3g's ranges). In place, as normalizeBreakParams does. */
export function normalizeCoastParams(p: CoastParams): void {
  const clamp = (v: number, a: number, b: number): number => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : a);
  p.lefthandersLedgeM = clamp(p.lefthandersLedgeM, 3, 8);
  p.bombieTopM = clamp(p.bombieTopM, 3, 8);
  p.bombieRadiusM = clamp(p.bombieRadiusM, 20, 150);
  p.ellensbrookBarM = clamp(p.ellensbrookBarM, 1, 3);
  p.ellensbrookBarOffM = clamp(p.ellensbrookBarOffM, 40, 160);
}

/**
 * Lefthanders' ledge, south (where the swell meets it first) to north: 170 m off the game's waterline at z −1 560,
 * 140 m at −1 670, 110 m at −1 780 (waterlineX: −56, −91, −151), so it closes on the beach going north and the left peels
 * north. The spec's first line, (−220, −1 560) → (−120, −1 760), was drawn for a straight beach at x 94; on the real
 * waterline its north end is 27 m inland.
 */
export const LEFTHANDERS_LEDGE: readonly Pt[] = [[-226, -1560], [-231, -1670], [-261, -1780]];
/** The ledge's face: from the ledge depth to LEFTHANDERS_BASE_M over this far seaward (m). */
export const LEFTHANDERS_FACE_M = 30;
export const LEFTHANDERS_BASE_M = 12;
/** Inshore of the ledge the reef shelf sits this much deeper than the ledge (m), reached over the face's width. */
export const LEFTHANDERS_SHELF_RISE_M = 1;
/** Beyond the ledge's ends the shoal fades over this far (m). */
export const LEFTHANDERS_END_FADE_M = 60;

/** Ellensbrook Bombie's top (spec §1; Andrew's map: 360 m off Ellensbrook). */
export const BOMBIE_CENTRE: Pt = [-280, 1020];

/** Ellensbrook's sand bar runs along the beach between these z (m), ELLENSBROOK_BAR_HALF_M wide either side of its line. */
export const ELLENSBROOK_BAR = { z0: 930, z1: 1230 } as const;
export const ELLENSBROOK_BAR_HALF_M = 25;
export const ELLENSBROOK_END_FADE_M = 50;

/**
 * Where each break may stand a set wave up (spec §4.4: anywhere else but the 60 m shore band is a closeout). The Womb's is
 * the reef map's footprint.
 */
export const BREAK_FOOTPRINTS: Readonly<Record<'lefthanders' | 'womb' | 'bombie' | 'ellensbrook', readonly Pt[]>> = {
  lefthanders: [[-430, -1480], [0, -1480], [-60, -1860], [-470, -1860]],
  womb: [[-400, -450], [250, -450], [250, 300], [-400, 300]],
  bombie: Array.from({ length: 16 }, (_, i): Pt => {
    const a = (i / 16) * 2 * Math.PI;
    return [BOMBIE_CENTRE[0] + 200 * Math.cos(a), BOMBIE_CENTRE[1] + 200 * Math.sin(a)];
  }),
  ellensbrook: [[150, 880], [520, 880], [520, 1280], [150, 1280]],
};

export function insidePolygon(px: number, pz: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed distance seaward (west, positive) of a polyline drawn south to north, and how far beyond its ends (m, ≥ 0). */
function seawardOf(x: number, z: number, line: readonly Pt[]): { v: number; beyond: number } {
  let best = Infinity, sign = 1, beyond = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const tRaw = ((x - ax) * dx + (z - az) * dz) / len2;
    const t = Math.min(1, Math.max(0, tRaw));
    const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (d < best) {
      best = d;
      // Drawn south to north (dz < 0): west of the segment is the side where the cross product is negative.
      sign = dx * (z - az) - dz * (x - ax) < 0 ? 1 : -1;
      const len = Math.sqrt(len2);
      beyond = (i === 0 && tRaw < 0 ? -tRaw : i === line.length - 2 && tRaw > 1 ? tRaw - 1 : 0) * len;
    }
  }
  return { v: sign * best, beyond };
}

/** Lefthanders' shoal depth at (x, z), Infinity where it has none. */
export function lefthandersDepth(x: number, z: number, p: CoastParams): number {
  const { v, beyond } = seawardOf(x, z, LEFTHANDERS_LEDGE);
  if (beyond >= LEFTHANDERS_END_FADE_M) return Infinity;
  // Seaward of its face the shoal falls away (1 m per m), so the shelf's own deeper water takes over beyond it.
  const d = v >= 0
    ? p.lefthandersLedgeM + (LEFTHANDERS_BASE_M - p.lefthandersLedgeM) * smoothstep(0, LEFTHANDERS_FACE_M, v) + Math.max(0, v - LEFTHANDERS_FACE_M)
    : p.lefthandersLedgeM + LEFTHANDERS_SHELF_RISE_M * smoothstep(0, LEFTHANDERS_FACE_M, -v);
  // Past the ends the shoal deepens away to nothing (the min with the shelf then drops it).
  return d + 40 * smoothstep(0, LEFTHANDERS_END_FADE_M, beyond);
}

/** The Bombie's mound: its top at the centre, meeting the bed `bed` at bombieRadiusM. */
export function bombieDepth(x: number, z: number, bed: number, p: CoastParams): number {
  const r = Math.hypot(x - BOMBIE_CENTRE[0], z - BOMBIE_CENTRE[1]);
  if (r >= p.bombieRadiusM) return Infinity;
  return p.bombieTopM + (bed - p.bombieTopM) * smoothstep(0, p.bombieRadiusM, r);
}

/** Ellensbrook's bar: a ridge ellensbrookBarOffM off the waterline, rising from the bed `bed` to ellensbrookBarM. */
export function ellensbrookBarDepth(x: number, z: number, bed: number, p: CoastParams): number {
  const { z0, z1 } = ELLENSBROOK_BAR;
  const out = Math.max(0, z0 - z, z - z1);
  if (out >= ELLENSBROOK_END_FADE_M) return Infinity;
  const across = Math.abs(waterlineX(z) - x - p.ellensbrookBarOffM);
  if (across >= ELLENSBROOK_BAR_HALF_M) return Infinity;
  const ridge = p.ellensbrookBarM + (bed - p.ellensbrookBarM) * smoothstep(0, ELLENSBROOK_BAR_HALF_M, across);
  return ridge + (bed - ridge) * smoothstep(0, ELLENSBROOK_END_FADE_M, out);
}
