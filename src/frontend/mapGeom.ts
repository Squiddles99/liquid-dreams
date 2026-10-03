// src/frontend/mapGeom.ts: the map of the break's geometry (spec §7). Pure: shared by the bake and the live layers.
import type { GridSpec } from '../land/landData';
import { WOMB_LINEUP } from '../land/tracks';
import { type SessionSetup, WIND_ROWS } from './sessionSetup';

/** The approved mockup's map (dune select mockup): 448 × 336 with a 78 px inset, the main view at 2.75 m a pixel. */
export const MAP = { w: 448, h: 336, insetW: 78, mPerPx: 2.75 } as const;

/** The baked map (tools/bakeBreakMap.ts → public/ui/breakMap.json): SVG paths in the map's pixels. */
export interface BreakMapData {
  reef: { d3: string; d6: string; d9: string };
  land: string;
  beach: string;
  dune20: string;
  peak: [number, number];
  /** Where the reef's data ends to the south and north (map y): its contours fade out there, not stop dead. */
  reefEdgeY: [number, number];
  inset: { coast: string; box: [number, number, number, number]; north: string; south: string };
}

/** The main view's centre: the peak sits 45% across as in the mockup, the beach and the dune on the right third. */
export const mapCentre = (): { x: number; z: number } => ({ x: WOMB_LINEUP.x + 47, z: WOMB_LINEUP.z });

/** World (x east, z south) → the main view's pixels, north up. */
export function worldToMap(x: number, z: number): [number, number] {
  const c = mapCentre();
  return [(MAP.w - MAP.insetW) / 2 + (x - c.x) / MAP.mPerPx, MAP.h / 2 + (z - c.z) / MAP.mPerPx];
}

export function bilinear(g: GridSpec, v: Float32Array, x: number, z: number): number | null {
  const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
  if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) return null;
  const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
  const a = v[j * g.nx + i], b = v[j * g.nx + i + 1], c = v[(j + 1) * g.nx + i], d = v[(j + 1) * g.nx + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/**
 * Marching squares at `level`, joined into polylines (cell units). Pad the field below `level` for closed rings, or with
 * NaN for lines that stop at the data's edge.
 */
export function contours(v: Float32Array, nx: number, nz: number, level: number): [number, number][][] {
  const key = (p: [number, number]): string => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const at = (i: number, j: number): number => v[j * nx + i] - level;
  const lerp = (i0: number, j0: number, i1: number, j1: number): [number, number] => {
    const a = at(i0, j0), b = at(i1, j1), t = a / (a - b);
    return [i0 + (i1 - i0) * t, j0 + (j1 - j0) * t];
  };
  const segs: [[number, number], [number, number]][] = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    // A missing sample (NaN) ends the contour there: no line along the edge of the data.
    if (!Number.isFinite(at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1))) continue;
    const c = (at(i, j) > 0 ? 8 : 0) | (at(i + 1, j) > 0 ? 4 : 0) | (at(i + 1, j + 1) > 0 ? 2 : 0) | (at(i, j + 1) > 0 ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const top = (): [number, number] => lerp(i, j, i + 1, j), right = (): [number, number] => lerp(i + 1, j, i + 1, j + 1);
    const bottom = (): [number, number] => lerp(i, j + 1, i + 1, j + 1), left = (): [number, number] => lerp(i, j, i, j + 1);
    const centre = at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1) > 0;
    const T: Record<number, [() => [number, number], () => [number, number]][]> = {
      1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 6: [[top, bottom]], 7: [[left, top]],
      8: [[left, top]], 9: [[top, bottom]], 11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
      5: centre ? [[left, top], [bottom, right]] : [[left, bottom], [top, right]],
      10: centre ? [[left, bottom], [top, right]] : [[left, top], [bottom, right]],
    };
    // A level that passes exactly through a grid point gives a zero-length segment there: skip it (it would be its own line).
    for (const [a, b] of T[c]) { const p = a(), q = b(); if (key(p) !== key(q)) segs.push([p, q]); }
  }
  // Join segments end to end.
  const byEnd = new Map<string, number[]>();
  segs.forEach((s, k) => { for (const p of s) { const kk = key(p); byEnd.set(kk, [...(byEnd.get(kk) ?? []), k]); } });
  const used = new Uint8Array(segs.length), lines: [number, number][][] = [];
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const line: [number, number][] = [segs[k][0], segs[k][1]];
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? line[line.length - 1] : line[0];
        const next = (byEnd.get(key(end)) ?? []).find((m) => !used[m]);
        if (next === undefined) break;
        used[next] = 1;
        const [a, b] = segs[next], p = key(a) === key(end) ? b : a;
        if (forward) line.push(p); else line.unshift(p);
      }
    }
    lines.push(line);
  }
  return lines;
}

export function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len === 1 && dx === 0 && dy === 0 ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

const n = (v: number): string => String(Math.round(v * 10) / 10);
export function toPath(lines: [number, number][][], closed: boolean): string {
  return lines.map((l) => {
    const pts = closed && l.length > 2 && l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1] ? l.slice(0, -1) : l;
    return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + (closed ? 'Z' : '');
  }).join('');
}

/** A compass direction "from" (deg, 0 = from the north) → its travel unit vector on the map (y down = south). */
const travel = (fromDeg: number): [number, number] => {
  const r = (fromDeg * Math.PI) / 180;
  return [-Math.sin(r), Math.cos(r)];
};

/** Three crests square to the swell, the nearest the brightest, spaced with the period and weighted with the size. */
export function swellCrests(fromDeg: number, periodS: number, sizeFt: number): { lines: [number, number][][]; widths: number[]; opacities: number[]; arrow: [number, number][] } {
  const [tx, ty] = travel(fromDeg), [px, py] = [-ty, tx], [cx, cy] = worldToMap(WOMB_LINEUP.x, WOMB_LINEUP.z);
  // The mockup's spacing: the nearest crest 50 px behind the peak, 45 px apart at 15 s, 2.4 px wide at 4 ft.
  const near = 50, gap = 3 * periodS, half = 67, lines: [number, number][][] = [], widths: number[] = [], opacities: number[] = [];
  for (let k = 0; k < 3; k++) {
    const back = near + gap * k, ox = cx - tx * back, oy = cy - ty * back;
    lines.push([[ox - px * half, oy - py * half], [ox + px * half, oy + py * half]]);
    widths.push(1.4 + 0.25 * Math.min(12, sizeFt));
    opacities.push(0.95 - 0.175 * k);
  }
  // The travel arrow beside the crests, toward one end of them.
  const side = -0.6 * half, from = near + gap * 2.4, to = near + gap * 0.6;
  const at = (back: number): [number, number] => [cx - tx * back + px * side, cy - ty * back + py * side];
  return { lines, widths, opacities, arrow: [at(from), at(to)] };
}

/** Arrows across the coast in the wind's direction; none when glassy (spec §7). */
export function windArrows(dirDeg: number, speedMs: number): { arrows: [number, number][][]; glassy: boolean } {
  if (speedMs < 1) return { arrows: [], glassy: true };
  // Over the land at the top of the main view, as in the mockup (the offshore ones blow out across the beach), spread
  // square to the wind so they never run into one another.
  const [tx, ty] = travel(dirDeg), [qx, qy] = [-ty, tx], len = 100, arrows: [number, number][][] = [];
  for (const k of [-1, 0, 1]) {
    const gx = 300 + qx * 26 * k, gy = 96 + qy * 26 * k;
    arrows.push([[gx - (tx * len) / 2, gy - (ty * len) / 2], [gx + (tx * len) / 2, gy + (ty * len) / 2]]);
  }
  return { arrows, glassy: false };
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg: number): string => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
const feet = (ft: number): string => `${Math.floor(ft)}${ft % 1 >= 0.5 ? '½' : ''}`;

export const swellLabel = (s: SessionSetup): string => `${compass(s.fromDeg)} · ${feet(s.swellFt)} FT · ${Math.round(s.periodS)} S`;

/** The wind row's direction (deg, from; glassy has none) and speed (m/s): Task 1's WIND_ROWS. */
export const windDirOf = (s: SessionSetup): number => WIND_ROWS[s.wind].fromDeg ?? 0;
export const windSpeedOf = (s: SessionSetup): number => (WIND_ROWS[s.wind].fromDeg === null ? 0 : WIND_ROWS[s.wind].kn * 0.514444);

/** "E · LIGHT OFFSHORE", or "GLASSY": the wind row's compass and label in caps. */
export function windLabel(s: SessionSetup): string {
  const w = WIND_ROWS[s.wind];
  return w.fromDeg === null ? 'GLASSY' : `${w.compass} · ${w.label.toUpperCase()}`;
}
