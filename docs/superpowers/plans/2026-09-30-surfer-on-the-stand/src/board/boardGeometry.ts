import { type BoardSpec, bottomYAt, halfWidthAt, rockerAt, thicknessAt, uAt } from './boardSpec';

/** Plain arrays for a board (or any closed part), so the shape is testable without a GPU. */
export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  /** (u along the board 0 tail … 1 nose, z / half-width -1 … 1). */
  boardUV: Float32Array;
  /** PART per vertex. */
  part: Float32Array;
  indices: Uint32Array;
}

export const PART = { bottom: 0, rail: 1, deck: 2, fin: 3 } as const;

const NU = 64;
const NV = 32;

interface Builder {
  p: number[];
  uv: number[];
  part: number[];
  idx: number[];
}

const vertex = (b: Builder, x: number, y: number, z: number, u: number, v: number, part: number): number => {
  b.p.push(x, y, z);
  b.uv.push(u, v);
  b.part.push(part);
  return b.p.length / 3 - 1;
};

/**
 * A closed prism from a simple polygon in (x, y), `halfThick` either side of z = 0, placed by `place`. Star-shaped
 * polygons only (it is fanned from the centroid). Used for fins and swim fins.
 */
export function extrudePolygon(b: Builder, pts: readonly [number, number][], halfThick: number, part: number, place: (x: number, y: number, z: number) => [number, number, number]): void {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    area += x0 * y1 - x1 * y0;
  }
  const ring = area < 0 ? [...pts].reverse() : [...pts]; // counter-clockwise seen from +z
  const n = ring.length;
  const cx = ring.reduce((s, q) => s + q[0], 0) / n, cy = ring.reduce((s, q) => s + q[1], 0) / n;
  const add = (x: number, y: number, z: number): number => vertex(b, ...place(x, y, z), 0, 0, part);
  const cf = add(cx, cy, halfThick), cb = add(cx, cy, -halfThick);
  const front = ring.map(([x, y]) => add(x, y, halfThick));
  const back = ring.map(([x, y]) => add(x, y, -halfThick));
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    b.idx.push(cf, front[k], front[k1]);
    b.idx.push(cb, back[k1], back[k]);
    b.idx.push(front[k], back[k], front[k1]);
    b.idx.push(front[k1], back[k], back[k1]);
  }
}

/** A fin's outline (x forward along the board, y down from its base), raked back. */
export function finOutline(baseM: number, depthM: number): [number, number][] {
  const b = baseM, d = depthM;
  return [[0.5 * b, 0], [0.25 * b, -0.45 * d], [-0.1 * b, -0.85 * d], [-0.35 * b, -d], [-0.45 * b, -0.8 * d], [-0.5 * b, 0]];
}

/** The board's surface (spec §3.7): rings of the cross-section along the length, capped at both ends, plus its fins. */
export function buildBoard(s: BoardSpec): MeshArrays {
  const b: Builder = { p: [], uv: [], part: [], idx: [] };
  const L = s.lengthM;
  for (let i = 0; i <= NU; i++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / NU);
    const W = Math.max(halfWidthAt(s, u), 0.004), t = Math.max(thicknessAt(s, u), 0.004), yc = rockerAt(s, u) + t / 2;
    for (let j = 0; j < NV; j++) {
      const th = (2 * Math.PI * j) / NV, c = Math.cos(th), sn = Math.sin(th), e = sn >= 0 ? s.deckExp : s.bottomExp;
      const z = W * Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
      const y = yc + (t / 2) * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
      const x = u * L - L / 2 + (i === 0 && s.tail === 'crescent' ? s.crescentDepthM * (1 - (z / W) ** 2) : 0);
      vertex(b, x, y, z, u, z / W, sn > 0.6 ? PART.deck : sn < -0.6 ? PART.bottom : PART.rail);
    }
  }
  const at = (i: number, j: number): number => i * NV + (((j % NV) + NV) % NV);
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = at(i, j), bb = at(i, j + 1), c = at(i + 1, j), d = at(i + 1, j + 1);
      b.idx.push(a, c, bb, bb, c, d);
    }
  }
  const cap = (i: number): number => {
    let x = 0, y = 0;
    for (let j = 0; j < NV; j++) {
      x += b.p[at(i, j) * 3];
      y += b.p[at(i, j) * 3 + 1];
    }
    return vertex(b, x / NV, y / NV, 0, i === 0 ? 0 : 1, 0, PART.rail);
  };
  const tail = cap(0);
  for (let j = 0; j < NV; j++) b.idx.push(tail, at(0, j), at(0, j + 1));
  const nose = cap(NU);
  for (let j = 0; j < NV; j++) b.idx.push(nose, at(NU, j + 1), at(NU, j));

  for (const f of s.fins) {
    const x = -L / 2 + f.fromTailM;
    const z = f.side === 0 ? 0 : f.side * (halfWidthAt(s, uAt(s, x)) - f.railInsetM);
    const top = bottomYAt(s, x, z) + 0.003; // the base sits just inside the bottom, so no seam shows
    extrudePolygon(b, finOutline(f.baseM, f.depthM), 0.0035, PART.fin, (px, py, pz) => [x + px, top + py, z + pz]);
  }
  return finish(b);
}

export function finish(b: Builder): MeshArrays {
  const positions = new Float32Array(b.p), indices = new Uint32Array(b.idx);
  return { positions, normals: vertexNormals(positions, indices), boardUV: new Float32Array(b.uv), part: new Float32Array(b.part), indices };
}

export const newBuilder = (): Builder => ({ p: [], uv: [], part: [], idx: [] });
export type { Builder };

/** Area-weighted vertex normals. */
export function vertexNormals(p: Float32Array, idx: Uint32Array): Float32Array {
  const n = new Float32Array(p.length);
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      n[i] += nx;
      n[i + 1] += ny;
      n[i + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

/** The enclosed volume (m³) of a closed, outward-wound mesh (divergence theorem). */
export function meshVolume(p: Float32Array, idx: Uint32Array): number {
  let v = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

/** Directed edges that are not matched by exactly one reverse edge (0 = closed and consistently wound). */
export function openEdges(idx: Uint32Array): number {
  const count = new Map<string, number>();
  for (let k = 0; k < idx.length; k += 3) {
    for (const [x, y] of [[idx[k], idx[k + 1]], [idx[k + 1], idx[k + 2]], [idx[k + 2], idx[k]]]) {
      const key = `${x},${y}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const [key, c] of count) {
    const [x, y] = key.split(',');
    if (c !== 1 || count.get(`${y},${x}`) !== 1) bad++;
  }
  return bad;
}
