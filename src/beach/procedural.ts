/** Shared procedural helpers (4c-1's rocks, 4c-2's plants). */

/** A [0, 1) hash of three integers. */
export function hash3(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 3D value noise in [−1, 1]. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const s = (t: number) => t * t * (3 - 2 * t);
  const ux = s(fx), uy = s(fy), uz = s(fz);
  const v = (a: number, b: number, c: number) => hash3(ix + a + seed * 131, iy + b + seed * 71, iz + c);
  const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
  const x00 = lerp(v(0, 0, 0), v(1, 0, 0), ux), x10 = lerp(v(0, 1, 0), v(1, 1, 0), ux);
  const x01 = lerp(v(0, 0, 1), v(1, 0, 1), ux), x11 = lerp(v(0, 1, 1), v(1, 1, 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz) * 2 - 1;
}

/** A unit icosphere: 12 vertices, then the midpoints of each subdivision; 20 × 4^subdivisions faces, wound outward. */
export function icosphere(subdivisions: number): { verts: number[][]; faces: number[][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: number[][] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < subdivisions; s++) {
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
  return { verts, faces };
}

/** Area-weighted vertex normals. */
export function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
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
  return normals;
}
