import { smoothstep } from '../math/smoothstep';
import { coverAt } from '../land/landCover';
import type { LandHeight } from '../land/landHeight';
import { coarseMeshHeightAt } from '../land/landMesh';

/** The limestone rocks (spec 2026-09-28-on-the-beach-design.md §3.3). */
export const ROCK_SHAPES = 8;
export const ROCK_CELL_M = 4;
export const ROCK_RADIUS_M = 260;
export const ROCK_FULL_M = 150;
export const ROCK_GONE_M = 250;
/** Only the rock bands make rocks (spec §3.3): from the swash's edge (10 m seaward) to the top of the dune face. */
export const ROCK_BAND_M = [-10, 100] as const;
/**
 * Each kind's share of the cover's rock weight that becomes boulders: the shore platform and the toe are mostly rock by
 * weight, but flat rock and painted clumps, not all boulders (a share of 1 would put ~2,000 rocks in view and saturate
 * `rock density`).
 */
const KIND_SHARE: Record<RockKind, number> = { toe: 0.6, face: 1, shore: 0.35 };
const CANDIDATES = 2;

export type RockKind = 'toe' | 'face' | 'shore';

export interface Rock {
  x: number;
  z: number;
  /** The base's height: the lowest ground under the footprint, less the sinking. */
  y: number;
  kind: RockKind;
  shape: number;
  /** Footprint radius, and the full height from the (sunk) base to the top (m). */
  radius: number;
  height: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  /** The body's colour, and the top's (the shore rocks' weed; the same as the body for the others). */
  tint: [number, number, number];
  topTint: [number, number, number];
}

function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise in [−1, 1]. */
function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t: number) => t * t * (3 - 2 * t);
  const ux = s(fx), uy = s(fy), uz = s(fz);
  const v = (a: number, b: number, c: number) => hash(ix + a + seed * 131, iy + b + seed * 71, iz + c);
  const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
  const x00 = lerp(v(0, 0, 0), v(1, 0, 0), ux), x10 = lerp(v(0, 1, 0), v(1, 1, 0), ux);
  const x01 = lerp(v(0, 0, 1), v(1, 0, 1), ux), x11 = lerp(v(0, 1, 1), v(1, 1, 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz) * 2 - 1;
}

/** A unit limestone boulder: an icosphere (subdivision 3), ridged and pitted, its bottom flattened at y = −0.6. */
export function rockShapeGeometry(shape: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: number[][] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < 3; s++) {
    const mid = new Map<string, number>();
    const m = (a: number, b: number): number => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let i = mid.get(k);
      if (i === undefined) {
        const p = verts[a].map((v, q) => (v + verts[b][q]) / 2), l = Math.hypot(p[0], p[1], p[2]);
        i = verts.push(p.map((v) => v / l)) - 1;
        mid.set(k, i);
      }
      return i;
    };
    faces = faces.flatMap(([a, b, c]) => { const ab = m(a, b), bc = m(b, c), ca = m(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
  }
  verts = verts.map(([x, y, z]) => {
    const ridged = 1 - Math.abs(noise3(x * 1.7, y * 1.7, z * 1.7, shape));
    const r = 1 + 0.22 * (ridged - 0.5) + 0.12 * noise3(x * 4, y * 4, z * 4, shape + 17) - 0.05 * Math.max(0, noise3(x * 9, y * 9, z * 9, shape + 29));
    return [x * r, Math.max(-0.6, y * r), z * r];
  });
  const positions = Float32Array.from(verts.flat());
  const indices = Uint32Array.from(faces.flat());
  const normals = new Float32Array(positions.length);
  for (let f = 0; f < indices.length; f += 3) {
    const [a, b, c] = [indices[f], indices[f + 1], indices[f + 2]];
    const ax = positions[b * 3] - positions[a * 3], ay = positions[b * 3 + 1] - positions[a * 3 + 1], az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3], by = positions[c * 3 + 1] - positions[a * 3 + 1], bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    for (const v of [a, b, c]) { normals[v * 3] += nx; normals[v * 3 + 1] += ny; normals[v * 3 + 2] += nz; }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= l; normals[v + 1] /= l; normals[v + 2] /= l;
  }
  return { positions, normals, indices };
}

const RUST: [number, number, number] = [0.3, 0.2, 0.13];
const OCHRE: [number, number, number] = [0.38, 0.27, 0.15];
const GREY: [number, number, number] = [0.42, 0.4, 0.36];
const WEED: [number, number, number] = [0.1, 0.13, 0.05];
const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The rocks of cell (ci, cj) (4 m cells), from its own hash: the same rocks whatever the camera. */
export function cellRocks(ci: number, cj: number, land: LandHeight, density: number): Rock[] {
  const out: Rock[] = [];
  for (let k = 0; k < CANDIDATES; k++) {
    const r = (q: number) => hash(ci, cj, k * 16 + q);
    const x = (ci + r(0)) * ROCK_CELL_M, z = (cj + r(1)) * ROCK_CELL_M;
    const d = x - land.waterlineAt(z);
    if (d < ROCK_BAND_M[0] || d > ROCK_BAND_M[1]) continue;
    const h = land.heightAt(x, z);
    const slope = 1 - 1 / Math.hypot(1, (land.heightAt(x + 1, z) - land.heightAt(x - 1, z)) / 2, (land.heightAt(x, z + 1) - land.heightAt(x, z - 1)) / 2);
    const c = coverAt(d, slope, x, z, h, land.profile);
    const kind: RockKind = c.weed > 0.5 ? 'shore' : c.toeBand > 0.5 ? 'toe' : 'face';
    if (r(2) >= c.rock * density * KIND_SHARE[kind]) continue;
    const [dMin, dMax] = kind === 'toe' ? [1, 3] : kind === 'shore' ? [0.6, 1.8] : [0.5, 1.5];
    const radius = (dMin + (dMax - dMin) * r(3)) / 2;
    const height = radius * 2 * (0.55 + 0.25 * r(4));
    const base = kind === 'toe' ? mix3(RUST, OCHRE, r(5)) : kind === 'shore' ? RUST : mix3(RUST, GREY, Math.max(c.rockGrey, 0.6 + 0.4 * r(5)));
    const vary = 0.8 + 0.2 * r(11);
    const tint = mix3(base, [0, 0, 0], 1 - vary);
    const topTint = kind === 'shore' ? mix3(WEED, RUST, 0.25 * r(5)) : tint;
    const sink = height * (0.15 + 0.15 * r(6));
    // Seated on the lowest ground under its footprint, so on a slope the downhill side doesn't float.
    let seat = h;
    // Both the true ground (the patch) and the coarse mesh (beyond it, up to metres off on its 4–64 m cells).
    for (let k = 0; k < 8; k++) {
      const px = x + Math.cos(k * Math.PI / 4) * radius * 0.8, pz = z + Math.sin(k * Math.PI / 4) * radius * 0.8;
      seat = Math.min(seat, land.heightAt(px, pz), coarseMeshHeightAt(land, px, pz));
    }
    out.push({
      x, z, y: seat - sink, kind, shape: Math.floor(r(7) * 8) % 8, radius, height,
      yaw: r(8) * Math.PI * 2, tiltX: (r(9) - 0.5) * 0.25, tiltZ: (r(10) - 0.5) * 0.25, tint, topTint,
    });
  }
  return out;
}

export function rockScale(distance: number): number {
  return 1 - smoothstep(ROCK_FULL_M, ROCK_GONE_M, distance);
}

/** The rocks around the camera, cells cached; and the rock tops for standing on. */
export class RockField {
  private readonly cells = new Map<number, Rock[]>();
  private readonly land: LandHeight;
  private density: number;

  constructor(land: LandHeight, density: number) {
    this.land = land;
    this.density = density;
  }

  setDensity(d: number): void {
    if (d !== this.density) { this.density = d; this.cells.clear(); }
  }

  private cell(ci: number, cj: number): Rock[] {
    const key = (ci + 0x8000) * 0x10000 + (cj + 0x8000); // cells within ±131 km: unique
    let c = this.cells.get(key);
    if (!c) { c = cellRocks(ci, cj, this.land, this.density); this.cells.set(key, c); }
    return c;
  }

  near(camX: number, camZ: number): Rock[] {
    const out: Rock[] = [];
    const n = Math.ceil(ROCK_RADIUS_M / ROCK_CELL_M), ci0 = Math.floor(camX / ROCK_CELL_M), cj0 = Math.floor(camZ / ROCK_CELL_M);
    for (let dj = -n; dj <= n; dj++) {
      const cj = cj0 + dj, cz = (cj + 0.5) * ROCK_CELL_M, dz = cz - camZ;
      const reach = ROCK_RADIUS_M * ROCK_RADIUS_M - dz * dz;
      if (reach < 0) continue;
      // Only the row's cells inside the rock bands (cellRocks checks each point exactly) and within the radius.
      const xs = this.land.waterlineAt(cz), half = Math.sqrt(reach);
      const x0 = Math.max(camX - half, xs + ROCK_BAND_M[0] - ROCK_CELL_M), x1 = Math.min(camX + half, xs + ROCK_BAND_M[1] + ROCK_CELL_M);
      for (let ci = Math.ceil(x0 / ROCK_CELL_M - 0.5); (ci + 0.5) * ROCK_CELL_M <= x1; ci++) {
        for (const r of this.cell(ci, cj)) out.push(r);
      }
    }
    return out;
  }

  /** The highest rock top at (x, z) (an ellipsoid cap over the footprint), −Infinity where no rock covers it. */
  topAt(x: number, z: number): number {
    let top = -Infinity;
    const ci0 = Math.floor(x / ROCK_CELL_M), cj0 = Math.floor(z / ROCK_CELL_M);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      for (const r of this.cell(ci0 + di, cj0 + dj)) {
        const q = Math.hypot(x - r.x, z - r.z) / r.radius;
        if (q < 1) top = Math.max(top, r.y + r.height * Math.sqrt(1 - q * q));
      }
    }
    return top;
  }
}
