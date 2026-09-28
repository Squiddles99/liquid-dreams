import { icosphere, noise3, vertexNormals } from '../beach/procedural';

/** The heath's plants (spec 2026-09-28-the-heath-design.md §3.1). */
export type PlantKind = 'daisy' | 'green' | 'tall' | 'pigface' | 'rice';
export const PLANT_KINDS: readonly PlantKind[] = ['daisy', 'green', 'tall', 'pigface', 'rice'];
export const PLANT_SHAPES = 4;
export const PLANT_LODS = 3;
/** Icosphere subdivisions per level of detail: 320, 80 and 20 triangles. */
export const LOD_SUBDIVISIONS = [2, 1, 0] as const;

export const PLANT_SPECS: Record<PlantKind, { heightM: [number, number]; widthM: [number, number] }> = {
  daisy: { heightM: [0.6, 1.4], widthM: [1, 2.5] },
  green: { heightM: [0.5, 1.2], widthM: [0.8, 2] },
  tall: { heightM: [1.5, 2.5], widthM: [2, 3.5] },
  pigface: { heightM: [0.1, 0.25], widthM: [1, 3] },
  rice: { heightM: [0.3, 0.5], widthM: [0.5, 1] },
};

/**
 * The flat bottom's height on the unit sphere: every level of detail reaches it (the coarsest icosahedron's lowest
 * vertices sit at y −0.85, and the lobes shrink a radius to no less than about 0.46), so all levels share one base.
 */
const PLANT_CUT = -0.35;

/** Each kind's lobes (big foliage clumps), bumps and rim scallops (pigface). */
const FORM: Record<PlantKind, { lobes: number; bumps: number; scallop: number }> = {
  daisy: { lobes: 0.3, bumps: 0.1, scallop: 0 },
  green: { lobes: 0.25, bumps: 0.12, scallop: 0 },
  tall: { lobes: 0.4, bumps: 0.14, scallop: 0 },
  pigface: { lobes: 0.15, bumps: 0.08, scallop: 0.18 },
  rice: { lobes: 0.12, bumps: 0.12, scallop: 0 },
};

/** The displaced (unnormalised) position of the unit-sphere point p for this kind and shape; the bottom cut at PLANT_CUT. */
function displace(kind: PlantKind, shape: number, [x, y, z]: number[]): [number, number, number] {
  const f = FORM[kind], seed = PLANT_KINDS.indexOf(kind) * 31 + shape * 7;
  let r = 1 + f.lobes * noise3(x * 1.3, y * 1.3, z * 1.3, seed) + f.bumps * noise3(x * 4, y * 4, z * 4, seed + 3);
  if (f.scallop > 0) r *= 1 + f.scallop * Math.sin(6 * Math.atan2(z, x) + shape);
  return [x * r, Math.max(PLANT_CUT, y * r), z * r];
}

const norms = new Map<string, { top: number; radius: number }>();
/** The finest level's extent for this kind and shape, so all three levels share one normalisation (no pop between them). */
function normalisation(kind: PlantKind, shape: number): { top: number; radius: number } {
  const key = `${kind}:${shape}`;
  let n = norms.get(key);
  if (!n) {
    let top = -Infinity, radius = 0;
    for (const v of icosphere(LOD_SUBDIVISIONS[0]).verts) {
      const [x, y, z] = displace(kind, shape, v);
      top = Math.max(top, y); radius = Math.max(radius, Math.hypot(x, z));
    }
    n = { top, radius };
    norms.set(key, n);
  }
  return n;
}

/** A unit plant of this kind and shape at this level of detail: flat bottom at y 0, top at about 1, footprint radius ≤ 1. */
export function plantShapeGeometry(kind: PlantKind, shape: number, lod: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const { verts, faces } = icosphere(LOD_SUBDIVISIONS[lod]);
  const n = normalisation(kind, shape);
  const positions = new Float32Array(verts.length * 3);
  verts.forEach((v, i) => {
    const [x, y, z] = displace(kind, shape, v);
    positions[i * 3] = x / n.radius;
    positions[i * 3 + 1] = Math.min(1, (y - PLANT_CUT) / (n.top - PLANT_CUT));
    positions[i * 3 + 2] = z / n.radius;
  });
  // Icosphere levels nest (a coarse level's vertices are a subset of the fine one's), so the finest level's extent bounds all.
  const indices = Uint32Array.from(faces.flat());
  return { positions, normals: vertexNormals(positions, indices), indices };
}
