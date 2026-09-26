import { smoothstep } from '../math/smoothstep';
import { REEF_SURROUND_DEPTH_M, depthBg } from './coastProfile';
import { fbm2, valueNoise2 } from './noise';
import { DEFAULT_REEF_PARAMS, type GridSpec, NORTH_LEDGE, REEF_GRID, REEF_SEED, REEF_WARP, type ReefParams, SAND_POCKETS, SHELF_POLYGON, SOUTH_LEDGE } from './wombReef';

/** Weed dominates rock across most of the shelf; baseline coverage before the patchy noise carves gaps. */
const SHELF_WEED_BASE = 0.78;
/** Extra weed riding the reef heads themselves, on top of the shelf baseline. */
const HEAD_WEED_BOOST = 0.18;
/** Weed coverage right on the exposed ledge face, fading out with distance from the ledge (see LEDGE_FACE_WEED_FADE_M). */
const LEDGE_FACE_WEED = 0.55;
/** Distance outside the ledge over which the ledge-face weed fades to bare sand. */
const LEDGE_FACE_WEED_FADE_M = 4;

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
 * Domain warp for the whole reef: nudges a query point by up to REEF_WARP.ampM + REEF_WARP.detailAmpM
 * metres through two-octave value noise (a broad wander plus finer detail), so the ledges, the shelf
 * polygon, the reef heads and the sand pockets all read as natural, uneven edges instead of the
 * ruler-straight originals. Tapers to zero within 15 m of the peak (0, 0) so the take-off corner keeps
 * its exact 6 m ledge depth. Seeded from REEF_SEED plus fixed offsets, never Conditions.seed.
 */
export function reefWarp(x: number, z: number): [number, number] {
  const cap = REEF_WARP.ampM + REEF_WARP.detailAmpM;
  let dx = REEF_WARP.ampM * valueNoise2(x / REEF_WARP.featureM, z / REEF_WARP.featureM, REEF_SEED + 401)
    + REEF_WARP.detailAmpM * valueNoise2(x / REEF_WARP.detailFeatureM, z / REEF_WARP.detailFeatureM, REEF_SEED + 402);
  let dz = REEF_WARP.ampM * valueNoise2(x / REEF_WARP.featureM, z / REEF_WARP.featureM, REEF_SEED + 403)
    + REEF_WARP.detailAmpM * valueNoise2(x / REEF_WARP.detailFeatureM, z / REEF_WARP.detailFeatureM, REEF_SEED + 404);
  // Clamp the vector magnitude (not just each axis) so the warp never moves a point more than the
  // stated amplitude, however the two independent noise fields happen to line up.
  const mag = Math.hypot(dx, dz);
  if (mag > cap) { const s = cap / mag; dx *= s; dz *= s; }
  const taper = smoothstep(0, 15, Math.hypot(x, z));
  return [dx * taper, dz * taper];
}

/**
 * Build the Womb's seabed. The signed distance to the ledges, the sand-pocket weight and the reef domain
 * warp are all computed on a coarse 2 m lattice and interpolated (they are all smooth), which keeps the
 * full 0.5 m build well under a second.
 */
export function buildBathymetry(p: ReefParams = DEFAULT_REEF_PARAMS, grid: GridSpec = REEF_GRID): Bathymetry {
  const n = grid.nx * grid.nz;
  const bed = new Float32Array(n), sand = new Float32Array(n), weed = new Float32Array(n);

  const x1 = grid.x0 + (grid.nx - 1) * grid.cellM, z1 = grid.z0 + (grid.nz - 1) * grid.cellM;
  const sx = Math.ceil((x1 - grid.x0) / SDF_CELL_M) + 2, sz = Math.ceil((z1 - grid.z0) / SDF_CELL_M) + 2;
  const sdf = new Float32Array(sx * sz), pockets = new Float32Array(sx * sz);
  // reefWarp() is too costly to call at every 0.5 m output cell (four valueNoise2 calls each, ~1.95 M
  // cells): sample it on the same coarse 2 m lattice as sdf/pockets instead and bilinearly interpolate
  // below. Its smallest feature (12 m) is far coarser than 2 m, so this is visually identical.
  const warpDxField = new Float32Array(sx * sz), warpDzField = new Float32Array(sx * sz);
  for (let r = 0; r < sz; r++) for (let c = 0; c < sx; c++) {
    const x = grid.x0 + c * SDF_CELL_M, z = grid.z0 + r * SDF_CELL_M;
    sdf[r * sx + c] = ledgeSignedDistance(x, z);
    pockets[r * sx + c] = pocketWeight(x, z);
    const [dx, dz] = reefWarp(x, z);
    warpDxField[r * sx + c] = dx;
    warpDzField[r * sx + c] = dz;
  }
  const lattice = (field: Float32Array, x: number, z: number): number => {
    const fx = (x - grid.x0) / SDF_CELL_M, fz = (z - grid.z0) / SDF_CELL_M;
    // Clamp both ends: the warp below can nudge a query point a few metres past the raw grid's edge.
    const c = Math.min(sx - 2, Math.max(0, Math.floor(fx))), r = Math.min(sz - 2, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - c)), tz = Math.min(1, Math.max(0, fz - r));
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
      // Domain-warp the query point: the ledges, the shelf polygon, the reef heads and the sand pockets
      // are all read at p' = p + w(p), so their edges wander naturally instead of following dead-straight
      // lines. depthBg/background above stay on the unwarped coast profile. w is interpolated from the
      // coarse warpDxField/warpDzField lattice (bilinear interpolation of already amplitude-clamped
      // vectors is a convex combination of them, so it stays within the same cap); the 15 m peak taper
      // is re-applied here at the exact query point so the take-off corner is untouched exactly, not just
      // approximately, regardless of how (0, 0) happens to sit relative to the coarse lattice.
      const warpTaper = smoothstep(0, 15, Math.hypot(x, z));
      const xw = x + lattice(warpDxField, x, z) * warpTaper, zw = z + lattice(warpDzField, x, z) * warpTaper;
      const sd = lattice(sdf, xw, zw);
      let d: number, s: number, w = 0;
      if (sd < 0) {
        // Outside the shelf: rise from the surrounding deep water to the ledge depth over ledgeWidthM.
        const dLedge = p.ledgeDepthM + (background - p.ledgeDepthM) * smoothstep(0, p.ledgeWidthM, -sd);
        d = background + (dLedge - background) * edgeFade;
        const faceSand = smoothstep(0, LEDGE_FACE_WEED_FADE_M, -sd);
        s = 1 + (faceSand - 1) * edgeFade;
        // The ledge face itself carries weed: (1 - faceSand) is already 1 at the ledge and 0 by
        // LEDGE_FACE_WEED_FADE_M out, so it doubles as the face's weed-coverage falloff.
        w = (1 - faceSand) * LEDGE_FACE_WEED * edgeFade;
      } else {
        // Inside: reef heads and sand pockets on the shelf, also fading out at its inshore (x ≈ 110 m) boundary.
        const reefness = edgeFade * smoothstep(125, 100, x);
        const warpX = xw + 6 * fbm2(xw / 23, zw / 23, REEF_SEED + 7);
        const warpZ = zw + 6 * fbm2(xw / 23 + 9.1, zw / 23 - 3.7, REEF_SEED + 8);
        const relief = fbm2(warpX / 11, warpZ / 11, REEF_SEED);
        const heads = smoothstep(0.05, 0.55, relief);
        let interior = Math.max(p.minDepthM, p.shelfDepthM - p.headReliefM * heads);
        const pocket = Math.max(lattice(pockets, xw, zw), smoothstep(-0.25, -0.55, relief));
        interior = interior + (p.pocketDepthM - interior) * pocket;
        const dShelf = p.ledgeDepthM + (interior - p.ledgeDepthM) * smoothstep(0, 20, sd);
        const sShelf = pocket * smoothstep(0, 3, sd) + (1 - smoothstep(0, 3, sd)) * 0.3;
        // Weed dominates rock over most of the shelf; the noise only carves occasional bare-rock gaps,
        // and reef heads carry extra weed of their own.
        const patch = smoothstep(-0.5, 0.05, fbm2(xw / 5, zw / 5, REEF_SEED + 3));
        const wShelf = (1 - pocket) * Math.min(1, SHELF_WEED_BASE + HEAD_WEED_BOOST * heads) * patch * smoothstep(0, 6, sd);
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
