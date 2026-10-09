import { smoothstep } from '../math/smoothstep';
import type { BeachProfile } from './landHeight';
import { TIP } from '../seabed/wombReef';

/** The walk to the Womb (dune-up-close spec §4.1): rebuilt by rule on our own terrain, never traced. */
export interface RouteLand {
  baseHeightAt(x: number, z: number): number;
  waterlineAt(z: number): number;
  profile: BeachProfile;
}
export interface TrackPiece {
  name: 'capeToCape' | 'beachPath';
  points: [number, number][];
  halfWidthM: number;
}
export interface TrackData {
  pieces: TrackPiece[];
  /** Where the beach path leaves the Cape to Cape, and the Cape to Cape's direction there (unit, xz). */
  junction: { x: number; z: number; along: [number, number] };
}

/** The Womb's lineup: 25 m seaward and 45 m south of the take-off corner (wombReef.TIP; DEFAULT_SURFER_PARAMS). */
export const WOMB_LINEUP = { x: TIP[0] - 25, z: TIP[1] + 45 };
const STEP_M = 2;
/** The Cape to Cape prefers 50–90 m inland of the dune toe and may wander 20–160 m. */
const C2C_BAND: [number, number] = [50, 90];
const C2C_ALLOWED: [number, number] = [20, 160];
const MAX_GRADE = 0.35;
const LATERAL_CELLS = 3;
const JUNCTION_REACH_M = 40;
/** Grade a metre of distance from the lineup (along the coast) is worth, choosing the junction. */
const JUNCTION_DZ_COST = 0.002;
const EYE_M = 1.6;
const HEATH_TOP_M = 1.4;
const CLEAR_M = 0.2;
/** Plants grow from 45 m inland of the waterline (plants.ts PLANT_MIN_D). */
const PLANTS_FROM_D = 45;

const toeEndOf = (p: BeachProfile): number => p.wetWidthM + p.dryWidthM + p.toeWidthM;

/** A step's cost: its length, dearer the steeper; a grade over MAX_GRADE all but forbidden. */
function stepCost(len: number, dh: number): number {
  const g = Math.abs(dh) / len;
  return len * (1 + 40 * g * g) + (g > MAX_GRADE ? 1000 * len : 0);
}

/**
 * The beach path's moves on its grid: the 8 neighbours and the 8 knight's moves, so it can traverse a slope at angles
 * between the diagonals (a switchback down a 0.5 slope must cross it at 45° or more to stay under 0.35).
 */
const PATH_MOVES: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
/** The grade the beach path is laid to (under MAX_GRADE, so smoothing its corners keeps it walkable). */
const PATH_DESIGN_GRADE = 0.3;
/** The beach path's ground sampling (its step costs read a grid this fine). */
const FINE_M = 1;

/**
 * A beach-path step's cost from (ax, az) to (bx, bz): its length, dearer the steeper, a grade over PATH_DESIGN_GRADE all
 * but forbidden; the grade the steepest metre along it (the ground between grid nodes has bumps of its own).
 */
function pathStepCost(heightAt: (x: number, z: number) => number, ax: number, az: number, bx: number, bz: number): number {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(len));
  let g = 0, h0 = heightAt(ax, az);
  for (let k = 1; k <= n; k++) {
    const h = heightAt(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    g = Math.max(g, (Math.abs(h - h0) * n) / len);
    h0 = h;
  }
  return len * (1 + 40 * g * g) + (g > PATH_DESIGN_GRADE ? 1000 * len : 0);
}

/**
 * Chaikin corner-cutting, then resampled every 1 m (both ends kept). Corners turning more than `keepTurnDeg` keep their
 * vertex (a switchback's hairpin: cutting it would join the upper leg to the lower one, straight down the slope).
 */
export function smoothLine(pts: [number, number][], passes = 2, keepTurnDeg = 180): [number, number][] {
  let p = pts;
  const cosKeep = Math.cos((keepTurnDeg * Math.PI) / 180);
  for (let k = 0; k < passes; k++) {
    const q: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      if (i > 0 && keepTurnDeg < 180) {
        const [px, pz] = p[i - 1], ux = ax - px, uz = az - pz, vx = bx - ax, vz = bz - az;
        const c = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1);
        if (c < cosKeep) q.push([ax, az]);
      }
      q.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  const out: [number, number][] = [p[0]];
  let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i], len = Math.hypot(bx - ax, bz - az);
    let s = 1 - carry;
    while (s <= len) {
      out.push([ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len]);
      s += 1;
    }
    carry = len - (s - 1);
  }
  const end = p[p.length - 1], last = out[out.length - 1];
  if (Math.hypot(last[0] - end[0], last[1] - end[1]) > 0.05) out.push(end);
  return out;
}

/** The Cape to Cape: dynamic programming row by row along z (every 2 m), each row choosing how far inland. */
function routeCapeToCape(land: RouteLand, zRange: [number, number]): [number, number][] {
  const toe = toeEndOf(land.profile);
  const d0 = toe + C2C_ALLOWED[0], nCols = Math.floor((C2C_ALLOWED[1] - C2C_ALLOWED[0]) / STEP_M) + 1;
  const nRows = Math.floor((zRange[1] - zRange[0]) / STEP_M) + 1;
  const zAt = (r: number): number => zRange[0] + r * STEP_M;
  // Each row's waterline once (it's per row, and the land's lookup is dear).
  const wl = new Float64Array(nRows);
  for (let r = 0; r < nRows; r++) wl[r] = land.waterlineAt(zAt(r));
  const xAt = (r: number, c: number): number => wl[r] + d0 + c * STEP_M;
  const h = new Float64Array(nRows * nCols);
  for (let r = 0; r < nRows; r++) for (let c = 0; c < nCols; c++) h[r * nCols + c] = land.baseHeightAt(xAt(r, c), zAt(r));
  const band = (c: number): number => {
    const d = d0 + c * STEP_M - toe, out = d < C2C_BAND[0] ? C2C_BAND[0] - d : d > C2C_BAND[1] ? d - C2C_BAND[1] : 0;
    return (out / 20) ** 2 * STEP_M;
  };
  const cost = new Float64Array(nRows * nCols), from = new Int32Array(nRows * nCols);
  for (let c = 0; c < nCols; c++) cost[c] = band(c);
  for (let r = 1; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      let best = Infinity, arg = c;
      for (let k = -LATERAL_CELLS; k <= LATERAL_CELLS; k++) {
        const p = c + k;
        if (p < 0 || p >= nCols) continue;
        const len = Math.hypot(STEP_M, k * STEP_M);
        const v = cost[(r - 1) * nCols + p] + stepCost(len, h[r * nCols + c] - h[(r - 1) * nCols + p]);
        if (v < best || (v === best && Math.abs(k) < Math.abs(arg - c))) {
          best = v;
          arg = p;
        }
      }
      cost[r * nCols + c] = best + band(c);
      from[r * nCols + c] = arg;
    }
  }
  let c = 0;
  for (let k = 1; k < nCols; k++) if (cost[(nRows - 1) * nCols + k] < cost[(nRows - 1) * nCols + c]) c = k;
  const pts: [number, number][] = [];
  for (let r = nRows - 1; r >= 0; r--) {
    pts.push([xAt(r, c), zAt(r)]);
    c = from[r * nCols + c];
  }
  return smoothLine(pts.reverse());
}

/** The Cape to Cape's direction at point i (a unit vector, from two points either side). */
function alongAt(c2c: [number, number][], i: number): [number, number] {
  const a = c2c[Math.max(0, i - 2)], b = c2c[Math.min(c2c.length - 1, i + 2)], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

/** From (x, z) at eye height, does the line to the lineup clear the heath tops (ground + 1.4 m, 45 m inland and more) by 0.2 m? */
function seesLineup(land: RouteLand, x: number, z: number, lineup: { x: number; z: number }): boolean {
  const eye = land.baseHeightAt(x, z) + EYE_M, len = Math.hypot(lineup.x - x, lineup.z - z);
  for (let s = 3; s < len; s += 1) {
    const px = x + ((lineup.x - x) * s) / len, pz = z + ((lineup.z - z) * s) / len, d = px - land.waterlineAt(pz);
    if (d < 0) break; // over the water: nothing more to hide it
    const top = land.baseHeightAt(px, pz) + (d >= PLANTS_FROM_D ? HEATH_TOP_M : 0) + CLEAR_M;
    if (eye * (1 - s / len) < top) return false; // the sightline falls from eye height to the sea at the lineup
  }
  return true;
}

/**
 * The clearing's slope at a junction (x, z) whose track runs `along`: the rise per metre of a plane fitted to the ground
 * over its 7 × 5 m ellipse.
 */
export function clearingGrade(land: RouteLand, x: number, z: number, along: readonly [number, number]): number {
  let n = 0, su = 0, sv = 0, sh = 0, suu = 0, svv = 0, suv = 0, suh = 0, svh = 0;
  const [ax, az] = along;
  for (let u = -CLEARING_SEMI_M[0]; u <= CLEARING_SEMI_M[0] + 1e-9; u += 0.5) {
    for (let v = -CLEARING_SEMI_M[1]; v <= CLEARING_SEMI_M[1] + 1e-9; v += 0.5) {
      if (Math.hypot(u / CLEARING_SEMI_M[0], v / CLEARING_SEMI_M[1]) > 1) continue;
      const h = land.baseHeightAt(x + u * ax - v * az, z + u * az + v * ax);
      n++; su += u; sv += v; sh += h; suu += u * u; svv += v * v; suv += u * v; suh += u * h; svh += v * h;
    }
  }
  // Least squares for h = c + gu·u + gv·v (the grid is symmetric, but solve it whole).
  const cuu = suu - (su * su) / n, cvv = svv - (sv * sv) / n, cuv = suv - (su * sv) / n;
  const cuh = suh - (su * sh) / n, cvh = svh - (sv * sh) / n, det = cuu * cvv - cuv * cuv;
  return Math.hypot((cuh * cvv - cvh * cuv) / det, (cvh * cuu - cuh * cuv) / det);
}

/**
 * The junction: of the Cape to Cape's points within 40 m of the lineup along the coast that see it, the one with the
 * flattest clearing (a metre nearer the lineup worth 0.002 of grade; Andrew, 2026-10-03: the crew had stood on a 25°
 * bank); else the highest there.
 */
function pickJunction(land: RouteLand, c2c: [number, number][], lineup: { x: number; z: number }): number {
  const near = c2c
    .map((p, i) => ({ i, dz: Math.abs(p[1] - lineup.z) }))
    .filter((q) => q.dz <= JUNCTION_REACH_M)
    .sort((a, b) => a.dz - b.dz || a.i - b.i);
  // Cheapest first, then the first that sees the lineup (the sightline is the dearer test).
  const ranked = near
    .map((q) => ({ i: q.i, cost: clearingGrade(land, c2c[q.i][0], c2c[q.i][1], alongAt(c2c, q.i)) + JUNCTION_DZ_COST * q.dz }))
    .sort((a, b) => a.cost - b.cost || a.i - b.i);
  for (const q of ranked) if (seesLineup(land, c2c[q.i][0], c2c[q.i][1], lineup)) return q.i;
  let best = near[0].i;
  for (const q of near) if (land.baseHeightAt(c2c[q.i][0], c2c[q.i][1]) > land.baseHeightAt(c2c[best][0], c2c[best][1])) best = q.i;
  return best;
}

/** The beach path: Dijkstra on a 2 m grid from the junction to the dry sand within 5 m of the lineup, then straight across the sand to the water. */
function routeBeachPath(land: RouteLand, start: [number, number], lineupZ: number): [number, number][] {
  const p = land.profile, dryEnd = p.wetWidthM + p.dryWidthM;
  const x0 = land.waterlineAt(lineupZ) + dryEnd - 4, x1 = start[0] + 6, z0 = lineupZ - 80, z1 = lineupZ + 80;
  const nx = Math.ceil((x1 - x0) / STEP_M) + 1, nz = Math.ceil((z1 - z0) / STEP_M) + 1, n = nx * nz;
  const X = (i: number): number => x0 + (i % nx) * STEP_M;
  const Z = (i: number): number => z0 + Math.floor(i / nx) * STEP_M;
  // The ground every metre over the search, each sample looked up the first time a step needs it (the land's own lookup
  // is dear, and the search visits only part of its box); the step costs read it bilinearly.
  const fx = Math.ceil((x1 - x0) / FINE_M) + 2, fz = Math.ceil((z1 - z0) / FINE_M) + 2, fine = new Float64Array(fx * fz).fill(NaN);
  const at = (i: number, j: number): number => {
    const o = j * fx + i;
    let h = fine[o];
    if (Number.isNaN(h)) h = fine[o] = land.baseHeightAt(x0 + i * FINE_M, z0 + j * FINE_M);
    return h;
  };
  const ground = (x: number, z: number): number => {
    const u = Math.min(Math.max((x - x0) / FINE_M, 0), fx - 1.001), v = Math.min(Math.max((z - z0) / FINE_M, 0), fz - 1.001);
    const i = Math.floor(u), j = Math.floor(v), tu = u - i, tv = v - j;
    return (at(i, j) * (1 - tu) + at(i + 1, j) * tu) * (1 - tv) + (at(i, j + 1) * (1 - tu) + at(i + 1, j + 1) * tu) * tv;
  };
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const s = Math.round((start[1] - z0) / STEP_M) * nx + Math.round((start[0] - x0) / STEP_M);
  dist[s] = 0;
  const goal = (i: number): boolean => X(i) - land.waterlineAt(Z(i)) <= dryEnd && Math.abs(Z(i) - lineupZ) <= 5;
  // A binary heap on dist (entries go stale when a node is improved; `done` skips them).
  const heap: number[] = [s];
  const swap = (a: number, b: number): void => {
    const t = heap[a];
    heap[a] = heap[b];
    heap[b] = t;
  };
  const up = (k: number): void => {
    while (k > 0) {
      const q = (k - 1) >> 1;
      if (dist[heap[q]] <= dist[heap[k]]) break;
      swap(q, k);
      k = q;
    }
  };
  const down = (k: number): void => {
    for (;;) {
      const a = 2 * k + 1, b = a + 1;
      let m = k;
      if (a < heap.length && dist[heap[a]] < dist[heap[m]]) m = a;
      if (b < heap.length && dist[heap[b]] < dist[heap[m]]) m = b;
      if (m === k) break;
      swap(m, k);
      k = m;
    }
  };
  let end = -1;
  while (heap.length) {
    const i = heap[0];
    heap[0] = heap[heap.length - 1];
    heap.pop();
    down(0);
    if (done[i]) continue;
    done[i] = 1;
    if (goal(i)) {
      end = i;
      break;
    }
    const ix = i % nx, iz = Math.floor(i / nx);
    for (const [dx, dz] of PATH_MOVES) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jx >= nx || jz < 0 || jz >= nz) continue;
      const j = jz * nx + jx;
      if (done[j]) continue;
      const v = dist[i] + pathStepCost(ground, X(i), Z(i), X(j), Z(j));
      if (v < dist[j]) {
        dist[j] = v;
        prev[j] = i;
        heap.push(j);
        up(heap.length - 1);
      }
    }
  }
  if (end < 0) throw new Error('routeTracks: no beach path from the junction to the sand near the lineup');
  const pts: [number, number][] = [];
  for (let i = end; i >= 0; i = prev[i]) pts.push([X(i), Z(i)]);
  pts.reverse();
  pts[0] = start;
  const last = pts[pts.length - 1];
  pts.push([land.waterlineAt(last[1]), last[1]]);
  return smoothLine(pts, 1, 100);
}

/** The Cape to Cape over zRange, the junction opposite the lineup, and the beach path down to the water. */
export function routeTracks(land: RouteLand, zRange: [number, number], lineup = WOMB_LINEUP): TrackData {
  const c2c = routeCapeToCape(land, zRange);
  const j = pickJunction(land, c2c, lineup);
  const junction = { x: c2c[j][0], z: c2c[j][1], along: alongAt(c2c, j) };
  const beach = routeBeachPath(land, [junction.x, junction.z], lineup.z);
  return {
    pieces: [
      { name: 'capeToCape', points: c2c, halfWidthM: 0.5 },
      { name: 'beachPath', points: beach, halfWidthM: 0.45 },
    ],
    junction,
  };
}

/** The clearing's semi-axes: along the Cape to Cape, and across it (an ellipse 7 × 5 m). */
export const CLEARING_SEMI_M: [number, number] = [3.5, 2.5];
/** A corridor's worn sink at its centre, the clearing's, and how far the shoulders reach (× the half-width). */
export const SINK_M = 0.04;
export const CLEARING_SINK_M = 0.03;
export const SHOULDER = 1.5;
/** The GPU's tracks mask samples the sink on this world lattice (the patch snaps to 4 m, so its texels sit on it). */
export const LATTICE_M = 0.25;
/** How far the clearing's worn edge softens outside the ellipse (m). */
const CLEARING_EDGE_M = 0.5;
/**
 * The sink's reach: it eases from a corridor's centreline out to SINK_REACH_M, and from the clearing's edge out to
 * CLEARING_SINK_EDGE_M, wider than the worn shoulders so the ground falls at most 1 cm per 25 cm (spec §7.2; 4 cm over
 * 1.5 × a 0.45 m half-width could not).
 */
export const SINK_REACH_M = 1.5;
const CLEARING_SINK_EDGE_M = 1.2;
const BUCKET_M = 4;

interface Segment { ax: number; az: number; bx: number; bz: number; hw: number }

/** The routed tracks, queried: corridors, the clearing, how worn the ground is, the sink, the crew's spot. */
export class TrackNetwork {
  private readonly buckets = new Map<number, Segment[]>();

  constructor(readonly data: TrackData) {
    for (const p of data.pieces) {
      const reach = Math.max(p.halfWidthM * SHOULDER, SINK_REACH_M) + 1;
      for (let i = 1; i < p.points.length; i++) {
        const [ax, az] = p.points[i - 1], [bx, bz] = p.points[i], seg = { ax, az, bx, bz, hw: p.halfWidthM };
        for (let gx = Math.floor((Math.min(ax, bx) - reach) / BUCKET_M); gx <= Math.floor((Math.max(ax, bx) + reach) / BUCKET_M); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - reach) / BUCKET_M); gz <= Math.floor((Math.max(az, bz) + reach) / BUCKET_M); gz++) {
            const k = (gx + 0x8000) * 0x10000 + (gz + 0x8000);
            let b = this.buckets.get(k);
            if (!b) this.buckets.set(k, (b = []));
            b.push(seg);
          }
        }
      }
    }
  }

  /** The nearest corridor (by its edge): the distance to its centreline and its half-width; Infinity with none within reach. */
  nearest(x: number, z: number): { d: number; halfWidthM: number } {
    const b = this.buckets.get((Math.floor(x / BUCKET_M) + 0x8000) * 0x10000 + (Math.floor(z / BUCKET_M) + 0x8000));
    let d = Infinity, hw = 0;
    for (const s of b ?? []) {
      const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * ex + (z - s.az) * ez) / l2)) : 0;
      const q = Math.hypot(x - (s.ax + ex * t), z - (s.az + ez * t));
      if (q - s.hw < d - hw) {
        d = q;
        hw = s.hw;
      }
    }
    return { d, halfWidthM: hw };
  }

  /** The clearing's elliptical radius at (x, z): under 1 inside. */
  private ellipse(x: number, z: number): number {
    const j = this.data.junction, dx = x - j.x, dz = z - j.z;
    const u = dx * j.along[0] + dz * j.along[1], v = -dx * j.along[1] + dz * j.along[0];
    return Math.hypot(u / CLEARING_SEMI_M[0], v / CLEARING_SEMI_M[1]);
  }

  inClearing(x: number, z: number): boolean {
    return this.ellipse(x, z) < 1;
  }

  /** Inside a corridor or the clearing. */
  onTrack(x: number, z: number): boolean {
    const n = this.nearest(x, z);
    return n.d <= n.halfWidthM || this.inClearing(x, z);
  }

  /** The clearing's share at (x, z): 1 inside, easing to 0 by `edgeM` outside. */
  private clearingShare(x: number, z: number, edgeM = CLEARING_EDGE_M): number {
    return 1 - smoothstep(1, 1 + edgeM / Math.min(CLEARING_SEMI_M[0], CLEARING_SEMI_M[1]), this.ellipse(x, z));
  }

  /** How worn the ground is: 1 on a track, easing to 0 at SHOULDER × its half-width (the clearing: by 0.5 m outside). */
  worn(x: number, z: number): number {
    const n = this.nearest(x, z);
    const corridor = Number.isFinite(n.d) ? 1 - smoothstep(n.halfWidthM, n.halfWidthM * SHOULDER, n.d) : 0;
    return Math.max(corridor, this.clearingShare(x, z));
  }

  /** The worn sink (m, a depth): SINK_M at a corridor's centre easing out to SINK_REACH_M; CLEARING_SINK_M in the clearing. */
  sinkExact(x: number, z: number): number {
    const n = this.nearest(x, z);
    const corridor = Number.isFinite(n.d) ? SINK_M * (1 - smoothstep(0, SINK_REACH_M, n.d)) : 0;
    return Math.max(corridor, CLEARING_SINK_M * this.clearingShare(x, z, CLEARING_SINK_EDGE_M));
  }

  /**
   * Whether anything of the tracks reaches the 4 m cell (gx, gz) (cells of BUCKET_M from the origin): a corridor's
   * segments (each is filed in every cell within its reach plus a metre), or the clearing with its soft edge. Where
   * not, worn and the sink are 0 throughout the cell.
   */
  touchesCell(gx: number, gz: number): boolean {
    if (this.buckets.has((gx + 0x8000) * 0x10000 + (gz + 0x8000))) return true;
    const j = this.data.junction, reach = CLEARING_SEMI_M[0] + CLEARING_SINK_EDGE_M + 1;
    const cx = Math.max(gx * BUCKET_M, Math.min(j.x, (gx + 1) * BUCKET_M)), cz = Math.max(gz * BUCKET_M, Math.min(j.z, (gz + 1) * BUCKET_M));
    return Math.hypot(cx - j.x, cz - j.z) < reach;
  }

  /** worn() and sinkExact() at once, with one nearest-corridor search (the tracks mask: 65,000 texels a recentre). */
  wornSinkExact(x: number, z: number, out: [number, number] = [0, 0]): [number, number] {
    const n = this.nearest(x, z), e = this.ellipse(x, z), r = Math.min(CLEARING_SEMI_M[0], CLEARING_SEMI_M[1]);
    const corridorWorn = Number.isFinite(n.d) ? 1 - smoothstep(n.halfWidthM, n.halfWidthM * SHOULDER, n.d) : 0;
    const corridorSink = Number.isFinite(n.d) ? SINK_M * (1 - smoothstep(0, SINK_REACH_M, n.d)) : 0;
    out[0] = Math.max(corridorWorn, 1 - smoothstep(1, 1 + CLEARING_EDGE_M / r, e));
    out[1] = Math.max(corridorSink, CLEARING_SINK_M * (1 - smoothstep(1, 1 + CLEARING_SINK_EDGE_M / r, e)));
    return out;
  }

  /**
   * The sink as the GPU draws it: bilinear between sinkExact on the LATTICE_M lattice. Far from every track (beyond the
   * sink's reach plus a lattice cell) it is 0 without sampling the lattice: heightAt calls this everywhere, and the four
   * samples tripled its cost.
   */
  sinkAt(x: number, z: number): number {
    if (this.nearest(x, z).d > SINK_REACH_M + 2 * LATTICE_M && this.ellipse(x, z) > 1 + (CLEARING_SINK_EDGE_M + 2 * LATTICE_M) / Math.min(CLEARING_SEMI_M[0], CLEARING_SEMI_M[1])) return 0;
    return this.sinkAtSlow(x, z);
  }

  /** The worn mask as the GPU draws it: bilinear between worn() on the LATTICE_M lattice (0 far from every track). */
  wornAt(x: number, z: number): number {
    if (this.nearest(x, z).d > SINK_REACH_M + 2 * LATTICE_M && this.ellipse(x, z) > 1 + (CLEARING_SINK_EDGE_M + 2 * LATTICE_M) / Math.min(CLEARING_SEMI_M[0], CLEARING_SEMI_M[1])) return 0;
    return this.lattice(x, z, (a, b) => this.worn(a, b));
  }

  /** sinkAt without its shortcut (the tests check the two agree). */
  sinkAtSlow(x: number, z: number): number {
    return this.lattice(x, z, (a, b) => this.sinkExact(a, b));
  }

  protected lattice(x: number, z: number, f: (x: number, z: number) => number): number {
    const fx = x / LATTICE_M, fz = z / LATTICE_M, i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
    const s = (a: number, b: number): number => f(a * LATTICE_M, b * LATTICE_M);
    return (s(i, k) * (1 - tx) + s(i + 1, k) * tx) * (1 - tz) + (s(i, k + 1) * (1 - tx) + s(i + 1, k + 1) * tx) * tz;
  }

  /** The furthest distance ≤ maxM along (dirX, dirZ) from (x, z) that stays on a track (in 10 cm steps). */
  reach(x: number, z: number, dirX: number, dirZ: number, maxM: number): number {
    const l = Math.hypot(dirX, dirZ);
    let best = 0;
    for (let k = 1; k * 0.1 <= maxM + 1e-9; k++) {
      const s = k * 0.1;
      if (!this.onTrack(x + (dirX / l) * s, z + (dirZ / l) * s)) break;
      best = s;
    }
    return best;
  }

  /** The crew's spot: 1.2 m across the clearing from the junction, on the sea's side, facing inland (east). */
  standSpot(): { x: number; z: number; headingDeg: number } {
    const j = this.data.junction;
    let ax = -j.along[1], az = j.along[0];
    if (ax > 0) {
      ax = -ax;
      az = -az;
    }
    const tidy = (v: number): number => Math.round(v * 100) / 100;
    return { x: tidy(j.x + ax * 1.2), z: tidy(j.z + az * 1.2), headingDeg: 90 };
  }
}
