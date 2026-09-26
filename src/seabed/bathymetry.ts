import { smoothstep } from '../math/smoothstep';
import { REEF_SURROUND_DEPTH_M, depthBg } from './coastProfile';
import { fbm2 } from './noise';
import { DEFAULT_REEF_PARAMS, type GridSpec, NORTH_LEDGE, REEF_GRID, REEF_SEED, type ReefParams, SAND_POCKETS, SHELF_POLYGON, SOUTH_LEDGE } from './wombReef';

export interface Bathymetry {
  grid: GridSpec;
  /** Seabed height y (m); negative below mean sea level. Row-major: index = row·nx + col, row ↔ z. */
  bed: Float32Array;
  /** Sand weight [0, 1]. */
  sand: Float32Array;
  /** Weed/kelp weight [0, 1] (reef = 1 − sand − weed). */
  weed: Float32Array;
}

type Pt = readonly [number, number];

function segmentDistance(px: number, pz: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.min(1, Math.max(0, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

function insidePolygon(px: number, pz: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance to the ledge lines (positive inside the shelf, negative outside). Only the ledges count as edges. */
function ledgeSignedDistance(x: number, z: number): number {
  let d = Infinity;
  for (const line of [NORTH_LEDGE, SOUTH_LEDGE]) {
    for (let i = 0; i + 1 < line.length; i++) d = Math.min(d, segmentDistance(x, z, line[i], line[i + 1]));
  }
  return insidePolygon(x, z, SHELF_POLYGON) ? d : -d;
}

function pocketWeight(x: number, z: number): number {
  let w = 0;
  for (const [cx, cz, rx, rz] of SAND_POCKETS) {
    const r = Math.hypot((x - cx) / rx, (z - cz) / rz);
    w = Math.max(w, 1 - smoothstep(0.7, 1.1, r));
  }
  return w;
}

const SDF_CELL_M = 2;

/**
 * Build the Womb's seabed. The signed distance to the ledges is computed on a coarse 2 m lattice and
 * interpolated (it is smooth), which keeps the full 0.5 m build well under a second.
 */
export function buildBathymetry(p: ReefParams = DEFAULT_REEF_PARAMS, grid: GridSpec = REEF_GRID): Bathymetry {
  const n = grid.nx * grid.nz;
  const bed = new Float32Array(n), sand = new Float32Array(n), weed = new Float32Array(n);

  const x1 = grid.x0 + (grid.nx - 1) * grid.cellM, z1 = grid.z0 + (grid.nz - 1) * grid.cellM;
  const sx = Math.ceil((x1 - grid.x0) / SDF_CELL_M) + 2, sz = Math.ceil((z1 - grid.z0) / SDF_CELL_M) + 2;
  const sdf = new Float32Array(sx * sz), pockets = new Float32Array(sx * sz);
  for (let r = 0; r < sz; r++) for (let c = 0; c < sx; c++) {
    const x = grid.x0 + c * SDF_CELL_M, z = grid.z0 + r * SDF_CELL_M;
    sdf[r * sx + c] = ledgeSignedDistance(x, z);
    pockets[r * sx + c] = pocketWeight(x, z);
  }
  const lattice = (field: Float32Array, x: number, z: number): number => {
    const fx = (x - grid.x0) / SDF_CELL_M, fz = (z - grid.z0) / SDF_CELL_M;
    const c = Math.min(sx - 2, Math.floor(fx)), r = Math.min(sz - 2, Math.floor(fz));
    const tx = fx - c, tz = fz - r;
    const a = field[r * sx + c], b = field[r * sx + c + 1], d = field[(r + 1) * sx + c], e = field[(r + 1) * sx + c + 1];
    return (a + (b - a) * tx) * (1 - tz) + (d + (e - d) * tx) * tz;
  };

  for (let row = 0; row < grid.nz; row++) {
    const z = grid.z0 + row * grid.cellM;
    // The reef fades back to the plain coast before the map's north edge, so the map joins the far field seamlessly.
    const edgeFade = smoothstep(-450, -380, z);
    for (let col = 0; col < grid.nx; col++) {
      const x = grid.x0 + col * grid.cellM;
      const i = row * grid.nx + col;
      // Around the reef the surrounding deep water can be tuned; it eases back to the coast profile by 280 m out.
      const nearReef = 1 - smoothstep(150, 280, Math.hypot(x, z));
      const background = Math.max(0, depthBg(x) + (p.deepDepthM - REEF_SURROUND_DEPTH_M) * nearReef);
      const sd = lattice(sdf, x, z);
      let d: number, s: number, w = 0;
      if (sd < 0) {
        // Outside the shelf: rise from the surrounding deep water to the ledge depth over ledgeWidthM.
        const dLedge = p.ledgeDepthM + (background - p.ledgeDepthM) * smoothstep(0, p.ledgeWidthM, -sd);
        d = background + (dLedge - background) * edgeFade;
        s = 1 + (smoothstep(0, 4, -sd) - 1) * edgeFade;
      } else {
        // Inside: reef heads and sand pockets on the shelf, also fading out at its inshore (x ≈ 110 m) boundary.
        const reefness = edgeFade * smoothstep(125, 100, x);
        const warpX = x + 6 * fbm2(x / 23, z / 23, REEF_SEED + 7);
        const warpZ = z + 6 * fbm2(x / 23 + 9.1, z / 23 - 3.7, REEF_SEED + 8);
        const relief = fbm2(warpX / 11, warpZ / 11, REEF_SEED);
        const heads = smoothstep(0.05, 0.55, relief);
        let interior = Math.max(p.minDepthM, p.shelfDepthM - p.headReliefM * heads);
        const pocket = Math.max(lattice(pockets, x, z), smoothstep(-0.25, -0.55, relief));
        interior = interior + (p.pocketDepthM - interior) * pocket;
        const dShelf = p.ledgeDepthM + (interior - p.ledgeDepthM) * smoothstep(0, 20, sd);
        const sShelf = pocket * smoothstep(0, 3, sd) + (1 - smoothstep(0, 3, sd)) * 0.3;
        const wShelf = (1 - pocket) * smoothstep(0.2, 0.6, fbm2(x / 5, z / 5, REEF_SEED + 3)) * smoothstep(0, 6, sd);
        d = background + (dShelf - background) * reefness;
        s = 1 + (sShelf - 1) * reefness;
        w = wShelf * reefness;
      }
      bed[i] = -d;
      sand[i] = s;
      weed[i] = Math.min(w, 1 - s);
    }
  }
  return { grid, bed, sand, weed };
}

/** Bilinear seabed height inside the map; the reef-free coast profile outside it. */
export function bedHeightAt(b: Bathymetry, x: number, z: number): number {
  const g = b.grid;
  const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
  if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) return -depthBg(x);
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r;
  const i = r * g.nx + c;
  const top = b.bed[i] + (b.bed[i + 1] - b.bed[i]) * tx;
  const bottom = b.bed[i + g.nx] + (b.bed[i + g.nx + 1] - b.bed[i + g.nx]) * tx;
  return top + (bottom - top) * tz;
}

/** Average factor × factor blocks (for the 1 m wave-field grid). nx and nz must divide by factor. */
export function downsample(b: Bathymetry, factor: number): Bathymetry {
  const g = b.grid;
  const nx = g.nx / factor, nz = g.nz / factor;
  const grid: GridSpec = { x0: g.x0 + ((factor - 1) * g.cellM) / 2, z0: g.z0 + ((factor - 1) * g.cellM) / 2, cellM: g.cellM * factor, nx, nz };
  const out = { grid, bed: new Float32Array(nx * nz), sand: new Float32Array(nx * nz), weed: new Float32Array(nx * nz) };
  const inv = 1 / (factor * factor);
  for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) {
    let bed = 0, sand = 0, weed = 0;
    for (let dr = 0; dr < factor; dr++) for (let dc = 0; dc < factor; dc++) {
      const i = (r * factor + dr) * g.nx + c * factor + dc;
      bed += b.bed[i]; sand += b.sand[i]; weed += b.weed[i];
    }
    const o = r * nx + c;
    out.bed[o] = bed * inv; out.sand[o] = sand * inv; out.weed[o] = weed * inv;
  }
  return out;
}
