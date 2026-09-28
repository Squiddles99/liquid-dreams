import { hash3, icosphere, noise3, vertexNormals } from '../beach/procedural';
import type { ShadowCaster } from '../beach/rockShadows';
import type { RockField } from '../beach/rocks';
import { coverAt } from '../land/landCover';
import type { LandHeight } from '../land/landHeight';
import { coarseMeshHeightAt } from '../land/landMesh';
import { smoothstep } from '../math/smoothstep';

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

export const PLANT_CELL_M = 4;
export const PLANT_FULL_M = 150;
export const PLANT_GONE_M = 200;
export const LOD_RANGES_M = [25, 70] as const;
/** Instances per kind × shape mesh at each level of detail (Review Focus 1: the inland heath at density 1 fits). */
export const LOD_CAPACITY = [400, 1000, 6000] as const;
/** Candidates per 16 m² cell: shrubs at up to one per 2.7 m², low plants at up to one per 8 m². */
const SHRUB_CANDIDATES = 6, LOW_CANDIDATES = 2;
/**
 * Keep probabilities on full cover: 6 × 0.89 / 16 m² = one shrub per 3 m² (the shrubs nearly touch: capture ruling; one
 * per 5 m² read as bushes dotted on sand); 2 × 0.67 / 16 m² = one low plant per 12 m².
 */
const SHRUB_KEEP = 0.89, LOW_KEEP = 0.667;
/** Plants start inland of the toe's rock band (the dune rise begins at toeEnd − 3 = 52 m on the default beach). */
const PLANT_MIN_D = 45;
const SINK = 0.15;

export interface Plant {
  x: number;
  z: number;
  kind: PlantKind;
  shape: number;
  width: number;
  height: number;
  /** The base on the true ground (inside the fine patch) and on the coarse mesh (beyond it), less the sinking. */
  yTrue: number;
  yCoarse: number;
  yaw: number;
  /** cos and sin of the yaw (the instance refresh lays out ~20,000 plants; precomputed once at placement). */
  cosYaw: number;
  sinYaw: number;
  /** [0, 1): the sway's phase. */
  seed: number;
  tint: [number, number, number];
}

/** 4a's painted palette (landShading.ts), so near and far agree. */
const ALBEDO: Record<PlantKind, [number, number, number]> = {
  // Silvery sage (the flora photo), a touch greener than 4a's painted silver-grey, which read as stone in 3D.
  daisy: [0.17, 0.2, 0.14],
  green: [0.12, 0.16, 0.065],
  tall: [0.08, 0.1, 0.05],
  pigface: [0.15, 0.19, 0.07],
  rice: [0.12, 0.16, 0.07],
};

export function plantScale(distance: number): number {
  return 1 - smoothstep(PLANT_FULL_M, PLANT_GONE_M, distance);
}

export function plantLod(distance: number): 0 | 1 | 2 {
  return distance < LOD_RANGES_M[0] ? 0 : distance < LOD_RANGES_M[1] ? 1 : 2;
}

/** The plants of cell (ci, cj), from its own hash: the same plants whatever the camera. */
export function cellPlants(ci: number, cj: number, land: LandHeight, rocks: RockField | null, density: number): Plant[] {
  const out: Plant[] = [];
  if (density <= 0) return out;
  const cx = (ci + 0.5) * PLANT_CELL_M, cz = (cj + 0.5) * PLANT_CELL_M;
  if (cx - land.waterlineAt(cz) < PLANT_MIN_D - PLANT_CELL_M) return out;
  // The cell's slope, once (the cover's slope term changes slowly across 4 m).
  const gx = (land.heightAt(cx + 2, cz) - land.heightAt(cx - 2, cz)) / 4, gz = (land.heightAt(cx, cz + 2) - land.heightAt(cx, cz - 2)) / 4;
  const grad = Math.hypot(gx, gz), slope = 1 - 1 / Math.sqrt(1 + grad * grad);
  // Density 1 keeps each candidate at its weight × share; above 1 a second pass of candidates adds (density − 1) × that,
  // so density 2 doubles the plants instead of saturating each candidate's probability.
  const per = SHRUB_CANDIDATES + LOW_CANDIDATES;
  for (let k = 0; k < (density > 1 ? 2 : 1) * per; k++) {
    const pass = k < per ? Math.min(1, density) : density - 1;
    const r = (q: number) => hash3(ci, cj, 1000 + k * 16 + q);
    const x = (ci + r(0)) * PLANT_CELL_M, z = (cj + r(1)) * PLANT_CELL_M;
    const d = x - land.waterlineAt(z);
    if (d < PLANT_MIN_D) continue;
    const h = land.heightAt(x, z);
    const c = coverAt(d, slope, x, z, h, land.profile);
    const heathW = Math.max(0, c.heath - c.bushes), riseW = c.bushes;
    const shrub = k % per < SHRUB_CANDIDATES;
    if (r(2) >= (heathW + riseW) * (shrub ? SHRUB_KEEP : LOW_KEEP) * pass) continue;
    let kind: PlantKind;
    if (!shrub) kind = r(3) < 0.5 ? 'pigface' : 'rice';
    else if (riseW > heathW) kind = r(3) < 0.54 ? 'daisy' : 'green';
    else {
      const tall = 0.04 + 0.06 * smoothstep(90, 300, d);
      kind = r(3) < tall ? 'tall' : r(3) < tall + 0.5 ? 'daisy' : 'green';
    }
    const spec = PLANT_SPECS[kind];
    const width = spec.widthM[0] + (spec.widthM[1] - spec.widthM[0]) * r(4);
    if (rocks?.covers(x, z, 0.2)) continue;
    const height = spec.heightM[0] + (spec.heightM[1] - spec.heightM[0]) * r(5);
    const drop = SINK * height + 0.5 * (width / 2) * grad;
    const base = ALBEDO[kind], vary = 0.85 + 0.3 * r(6), hue = (r(7) - 0.5) * 0.1;
    out.push({
      x, z, kind, shape: Math.floor(r(8) * PLANT_SHAPES) % PLANT_SHAPES, width, height,
      yTrue: h - drop, yCoarse: coarseMeshHeightAt(land, x, z) - drop,
      yaw: r(9) * Math.PI * 2, cosYaw: Math.cos(r(9) * Math.PI * 2), sinYaw: Math.sin(r(9) * Math.PI * 2), seed: r(10),
      tint: [base[0] * vary * (1 + hue), base[1] * vary, base[2] * vary * (1 - hue)],
    });
  }
  return out;
}

/** The plants around the camera, cells cached. */
export class PlantField {
  private readonly cells = new Map<number, Plant[]>();
  private readonly land: LandHeight;
  private readonly rocks: RockField | null;
  private density: number;

  constructor(land: LandHeight, rocks: RockField | null, density: number) {
    this.land = land;
    this.rocks = rocks;
    this.density = density;
  }

  setDensity(d: number): void {
    if (d !== this.density) { this.density = d; this.cells.clear(); }
  }

  /** Forget every cell (the rocks changed: plants must re-place around them). */
  clear(): void {
    this.cells.clear();
  }

  near(camX: number, camZ: number): Plant[] {
    const out: Plant[] = [];
    const n = Math.ceil(PLANT_GONE_M / PLANT_CELL_M), cj0 = Math.floor(camZ / PLANT_CELL_M);
    for (let dj = -n; dj <= n; dj++) {
      const cj = cj0 + dj, cz = (cj + 0.5) * PLANT_CELL_M, dz = cz - camZ;
      const reach = PLANT_GONE_M * PLANT_GONE_M - dz * dz;
      if (reach < 0) continue;
      const half = Math.sqrt(reach);
      const x0 = Math.max(camX - half, this.land.waterlineAt(cz) + PLANT_MIN_D - PLANT_CELL_M), x1 = camX + half;
      for (let ci = Math.ceil(x0 / PLANT_CELL_M - 0.5); (ci + 0.5) * PLANT_CELL_M <= x1; ci++) {
        const key = (ci + 0x8000) * 0x10000 + (cj + 0x8000);
        let c = this.cells.get(key);
        if (!c) { c = cellPlants(ci, cj, this.land, this.rocks, this.density); this.cells.set(key, c); }
        for (const p of c) out.push(p);
      }
    }
    return out;
  }
}

/** A plant in the fine patch's shadow picture (spec §3.5): lighter than a rock; the low plants only darken their contact. */
export function plantCaster(p: Plant): ShadowCaster {
  return { x: p.x, z: p.z, radius: p.width / 2, height: p.height, strength: 0.6, ringOnly: p.kind === 'pigface' || p.kind === 'rice' };
}
