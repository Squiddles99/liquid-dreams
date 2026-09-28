import { coverAt } from './landCover';
import type { LandHeight } from './landHeight';

/**
 * The land's static mesh (spec §4.5, plan ruling P6): nested square-ish levels, each twice the previous level's cell, each
 * covering its box minus the finer level's box. A level's outer-edge vertices at odd positions take the average of their
 * neighbours along the edge, so they lie on the coarser level's edge: no cracks. Quads wholly seaward of the waterline
 * by more than SEAWARD_M are dropped (under water, never seen).
 */
export interface MeshLevel {
  cellM: number;
  /** [x0, z0, x1, z1], multiples of the next level's cell. */
  box: [number, number, number, number];
}

export const MESH_LEVELS: MeshLevel[] = [
  { cellM: 2, box: [128, -384, 384, 384] },
  { cellM: 4, box: [-128, -768, 768, 768] },
  { cellM: 8, box: [-512, -1792, 1792, 1792] },
  { cellM: 16, box: [-1024, -3584, 3584, 3584] },
  { cellM: 32, box: [-2944, -7168, 5952, 7168] },
  { cellM: 64, box: [-2944, -14976, 5952, 14976] },
];

/** The mesh reaches this far seaward of the waterline (−2.1 m there: under the lowest tide, −1.5 m). */
export const SEAWARD_M = 45;

export interface LandMeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** wet, sand, rock, heath per vertex. */
  cover: Float32Array;
  /** skyView, rockGrey, weed per vertex. */
  detail: Float32Array;
  /** toeBand, duneBand, clumpRock, bushes per vertex (the shader redraws the clumps per pixel). */
  zones: Float32Array;
  indices: Uint32Array;
  triangles: number;
}

export function buildLandMesh(land: LandHeight): LandMeshData {
  const pos: number[] = [], nor: number[] = [], cov: number[] = [], det: number[] = [], zon: number[] = [], idx: number[] = [];
  for (let k = 0; k < MESH_LEVELS.length; k++) {
    const { cellM, box } = MESH_LEVELS[k];
    const hole = k > 0 ? MESH_LEVELS[k - 1].box : null;
    const stitch = k + 1 < MESH_LEVELS.length;
    const nx = (box[2] - box[0]) / cellM, nz = (box[3] - box[1]) / cellM;
    const xAt = (i: number) => box[0] + i * cellM, zAt = (j: number) => box[1] + j * cellM;
    // Heights on this level's full vertex grid, stitched along its outer edge.
    const H = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = land.heightAt(xAt(i), zAt(j));
    if (stitch) {
      for (let i = 1; i < nx; i += 2) {
        H[i] = (H[i - 1] + H[i + 1]) / 2;
        H[nz * (nx + 1) + i] = (H[nz * (nx + 1) + i - 1] + H[nz * (nx + 1) + i + 1]) / 2;
      }
      for (let j = 1; j < nz; j += 2) {
        H[j * (nx + 1)] = (H[(j - 1) * (nx + 1)] + H[(j + 1) * (nx + 1)]) / 2;
        H[j * (nx + 1) + nx] = (H[(j - 1) * (nx + 1) + nx] + H[(j + 1) * (nx + 1) + nx]) / 2;
      }
    }
    const remap = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
    const vertex = (i: number, j: number): number => {
      const g = j * (nx + 1) + i;
      if (remap[g] >= 0) return remap[g];
      const x = xAt(i), z = zAt(j), y = H[g];
      const e = cellM;
      const hx = land.heightAt(x + e, z) - land.heightAt(x - e, z), hz = land.heightAt(x, z + e) - land.heightAt(x, z - e);
      const len = Math.hypot(hx, 2 * e, hz);
      const ny = (2 * e) / len;
      const c = coverAt(x - land.waterlineAt(z), 1 - ny, x, z, y, land.profile);
      remap[g] = pos.length / 3;
      pos.push(x, y, z);
      nor.push(-hx / len, ny, -hz / len);
      cov.push(c.wet, c.sand, c.rock, c.heath);
      det.push(land.skyViewAt(x, z), c.rockGrey, c.weed);
      zon.push(c.toeBand, c.duneBand, c.clumpRock, c.bushes);
      return remap[g];
    };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = xAt(i), z0 = zAt(j), x1 = x0 + cellM, z1 = z0 + cellM;
        if (hole && x0 >= hole[0] && x1 <= hole[2] && z0 >= hole[1] && z1 <= hole[3]) continue;
        const seaward = (x: number, z: number) => x - land.waterlineAt(z) < -SEAWARD_M;
        if (seaward(x0, z0) && seaward(x1, z0) && seaward(x0, z1) && seaward(x1, z1)) continue;
        const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i, j + 1), d = vertex(i + 1, j + 1);
        idx.push(a, c, b, b, c, d); // counter-clockwise seen from above (+y)
      }
    }
  }
  return {
    positions: Float32Array.from(pos), normals: Float32Array.from(nor), cover: Float32Array.from(cov), detail: Float32Array.from(det), zones: Float32Array.from(zon),
    indices: Uint32Array.from(idx), triangles: idx.length / 3,
  };
}

/**
 * The coarse land mesh's own surface at (x, z): the finest level containing the point, its stitched corner heights and
 * its triangle split (the b–c diagonal), exactly as buildLandMesh lays them out. Where the mesh has no quad (dropped
 * seaward, or beyond every level) it is the composed height. The fine ground patch meets this at its edge.
 */
export function coarseMeshHeightAt(land: LandHeight, x: number, z: number): number {
  for (let k = 0; k < MESH_LEVELS.length; k++) {
    const { cellM, box } = MESH_LEVELS[k];
    if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) continue;
    const nx = (box[2] - box[0]) / cellM, nz = (box[3] - box[1]) / cellM;
    const fi = (x - box[0]) / cellM, fj = (z - box[1]) / cellM;
    const seaward = (xx: number, zz: number): boolean => xx - land.waterlineAt(zz) < -SEAWARD_M;
    const dropped = (ii: number, jj: number): boolean => {
      const x0 = box[0] + ii * cellM, z0 = box[1] + jj * cellM, x1 = x0 + cellM, z1 = z0 + cellM;
      return seaward(x0, z0) && seaward(x1, z0) && seaward(x0, z1) && seaward(x1, z1);
    };
    let i = Math.min(Math.floor(fi), nx - 1), j = Math.min(Math.floor(fj), nz - 1);
    // On a cell boundary the neighbouring quad gives the same edge: use it where this one was dropped.
    if (dropped(i, j) && fi === i && i > 0 && !dropped(i - 1, j)) i -= 1;
    if (dropped(i, j) && fj === j && j > 0 && !dropped(i, j - 1)) j -= 1;
    if (dropped(i, j)) return land.heightAt(x, z);
    const u = fi - i, v = fj - j;
    const stitch = k + 1 < MESH_LEVELS.length;
    const raw = (ii: number, jj: number): number => land.heightAt(box[0] + ii * cellM, box[1] + jj * cellM);
    const H = (ii: number, jj: number): number => {
      if (stitch && (jj === 0 || jj === nz) && ii % 2 === 1) return (raw(ii - 1, jj) + raw(ii + 1, jj)) / 2;
      if (stitch && (ii === 0 || ii === nx) && jj % 2 === 1) return (raw(ii, jj - 1) + raw(ii, jj + 1)) / 2;
      return raw(ii, jj);
    };
    const b = H(i + 1, j), c = H(i, j + 1);
    if (u + v <= 1) {
      const a = H(i, j);
      return a + (b - a) * u + (c - a) * v;
    }
    const d = H(i + 1, j + 1);
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  return land.heightAt(x, z);
}
