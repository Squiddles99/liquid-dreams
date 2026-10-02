import type { BeachProfile } from './landHeight';

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

/** The Womb's lineup (DEFAULT_SURFER_PARAMS: x −25, z 45). */
export const WOMB_LINEUP = { x: -25, z: 45 };
const STEP_M = 2;
/** The Cape to Cape prefers 50–90 m inland of the dune toe and may wander 20–160 m. */
const C2C_BAND: [number, number] = [50, 90];
const C2C_ALLOWED: [number, number] = [20, 160];
const MAX_GRADE = 0.35;
const LATERAL_CELLS = 3;
const JUNCTION_REACH_M = 40;
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

/** Chaikin corner-cutting, then resampled every 1 m (both ends kept). */
export function smoothLine(pts: [number, number][], passes = 2): [number, number][] {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const q: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
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
  const xAt = (r: number, c: number): number => land.waterlineAt(zAt(r)) + d0 + c * STEP_M;
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

/** The Cape to Cape's point nearest the lineup (within 40 m of it along the coast) that sees it; else the highest there. */
function pickJunction(land: RouteLand, c2c: [number, number][], lineup: { x: number; z: number }): number {
  const near = c2c
    .map((p, i) => ({ i, dz: Math.abs(p[1] - lineup.z) }))
    .filter((q) => q.dz <= JUNCTION_REACH_M)
    .sort((a, b) => a.dz - b.dz || a.i - b.i);
  for (const q of near) if (seesLineup(land, c2c[q.i][0], c2c[q.i][1], lineup)) return q.i;
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
  const H = new Float64Array(n);
  for (let i = 0; i < n; i++) H[i] = land.baseHeightAt(X(i), Z(i));
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
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jx >= nx || jz < 0 || jz >= nz) continue;
        const j = jz * nx + jx, v = dist[i] + stepCost(Math.hypot(dx, dz) * STEP_M, H[j] - H[i]);
        if (v < dist[j]) {
          dist[j] = v;
          prev[j] = i;
          heap.push(j);
          up(heap.length - 1);
        }
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
  return smoothLine(pts, 1);
}

/** The Cape to Cape over zRange, the junction opposite the lineup, and the beach path down to the water. */
export function routeTracks(land: RouteLand, zRange: [number, number], lineup = WOMB_LINEUP): TrackData {
  const c2c = routeCapeToCape(land, zRange);
  const j = pickJunction(land, c2c, lineup);
  const a = c2c[Math.max(0, j - 2)], b = c2c[Math.min(c2c.length - 1, j + 2)], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const junction = { x: c2c[j][0], z: c2c[j][1], along: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] as [number, number] };
  const beach = routeBeachPath(land, [junction.x, junction.z], lineup.z);
  return {
    pieces: [
      { name: 'capeToCape', points: c2c, halfWidthM: 0.5 },
      { name: 'beachPath', points: beach, halfWidthM: 0.45 },
    ],
    junction,
  };
}
