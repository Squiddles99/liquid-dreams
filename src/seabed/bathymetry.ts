import { smoothstep } from '../math/smoothstep';
import { SHORE_X, depthBg } from './coastProfile';
import { OPEN_COAST_MATERIAL, SHORE_REEF_MATERIAL, shoreReefWeight } from './shoreReef';
import { beachHeight } from '../land/landHeight';
import { fbm2, valueNoise2 } from './noise';
import { DEEP_REEF_WEED, DEFAULT_REEF_PARAMS, type GridSpec, NORTH_LEDGE, REEF_GRID, REEF_SEED, REEF_WARP, ROCK_EDGE_M, type ReefParams, SAND_POCKETS, SHELF_INNER_X, SHELF_POLYGON, SOUTH_LEDGE, TIP, rockReachM, shelfPolygon } from './wombReef';

/** Weed dominates rock across most of the shelf; baseline coverage before the patchy noise carves gaps. */
const SHELF_WEED_BASE = 0.78;
/** Extra weed riding the reef heads themselves, on top of the shelf baseline. */
const HEAD_WEED_BOOST = 0.18;

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

/** Distance to the ledge lines (positive inside the shelf, negative outside). Only the ledges count as edges. `north`:
 * the left's edge (ReefParams.northLedge), its shelf polygon built to match. */
export function ledgeSignedDistance(x: number, z: number, north: readonly Pt[] = NORTH_LEDGE, shelf: readonly Pt[] = north === NORTH_LEDGE ? SHELF_POLYGON : shelfPolygon(north), south: readonly Pt[] = SOUTH_LEDGE): number {
  let d = Infinity;
  for (const line of [north, south]) {
    for (let i = 0; i + 1 < line.length; i++) d = Math.min(d, segmentDistance(x, z, line[i], line[i + 1]));
  }
  return insidePolygon(x, z, shelf) ? d : -d;
}

/** The sand pockets were traced around the peak: they move with the tip. */
function pocketWeight(x: number, z: number, tip: Pt = TIP): number {
  let w = 0;
  x -= tip[0]; z -= tip[1];
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
 * ruler-straight originals. Tapers to zero within 15 m of the peak (`tip`, TIP by default) so the take-off corner keeps
 * its exact 6 m ledge depth. Seeded from REEF_SEED plus fixed offsets, never Conditions.seed.
 */
export function reefWarp(x: number, z: number, tip: Pt = TIP): [number, number] {
  const cap = REEF_WARP.ampM + REEF_WARP.detailAmpM;
  let dx = REEF_WARP.ampM * valueNoise2(x / REEF_WARP.featureM, z / REEF_WARP.featureM, REEF_SEED + 401)
    + REEF_WARP.detailAmpM * valueNoise2(x / REEF_WARP.detailFeatureM, z / REEF_WARP.detailFeatureM, REEF_SEED + 402);
  let dz = REEF_WARP.ampM * valueNoise2(x / REEF_WARP.featureM, z / REEF_WARP.featureM, REEF_SEED + 403)
    + REEF_WARP.detailAmpM * valueNoise2(x / REEF_WARP.detailFeatureM, z / REEF_WARP.detailFeatureM, REEF_SEED + 404);
  // Clamp the vector magnitude (not just each axis) so the warp never moves a point more than the
  // stated amplitude, however the two independent noise fields happen to line up.
  const mag = Math.hypot(dx, dz);
  if (mag > cap) { const s = cap / mag; dx *= s; dz *= s; }
  const taper = smoothstep(0, 15, Math.hypot(x - tip[0], z - tip[1]));
  return [dx * taper, dz * taper];
}

/**
 * Build the Womb's seabed. The signed distance to the ledges, the sand-pocket weight and the reef domain
 * warp are all computed on a coarse 2 m lattice and interpolated (they are all smooth), which keeps the
 * full 0.5 m build well under a second.
 */
/**
 * The reef's depth v m seaward of the ledge line (spec 2026-10-02 §3): the face rising from faceBaseDepthM to the ledge over
 * faceWidthM (smoothstep: flat at both ends, so neither the ledge nor the face's foot is a crease), then a steady
 * deepening to slopeDepthM at slopeEndM, held beyond. Widths are floored at a millimetre and each depth at the one inshore
 * of it (the dev panel can zero or invert them).
 */
export function reefProfileDepth(v: number, p: ReefParams): number {
  const x = Math.max(0, v), fw = Math.max(1e-3, p.faceWidthM), se = Math.max(fw + 1e-3, p.slopeEndM);
  // Each depth no shallower than the one inshore of it (the panel lets a ledge sit below the face's base).
  const base = Math.max(p.faceBaseDepthM, p.ledgeDepthM);
  const face = (base - p.ledgeDepthM) * smoothstep(0, fw, x);
  const slope = Math.max(0, p.slopeDepthM - base) * Math.min(1, Math.max(0, (x - fw) / (se - fw)));
  return p.ledgeDepthM + face + slope;
}

/** Past the reef's slope the bed eases into the coast's own depth, where that is deeper, over this far (m). */
export const REEF_FAR_EASE_M = 50;
/** The coast may deepen toward the reef's slope only offshore: not at all inshore of SHORE_X − 140, fully by SHORE_X − 260. */
const REEF_OFFSHORE_BAND: readonly [number, number] = [SHORE_X - 140, SHORE_X - 260];

/**
 * The seabed's depth v m seaward of the ledges at x (spec §3): the reef's profile, never deeper than the coast deepened
 * toward the slope's depth offshore (so south of the peak, near the beach, the bed stays the coast's shallows), then past
 * the slope easing into the coast's own depth where that is deeper (the open sea's 30 m at the map's west edge). Only
 * ever deepens seaward along a line from the peak.
 */
export function seawardDepth(v: number, x: number, p: ReefParams): number {
  const bg = depthBg(x);
  const band = p.offshoreBand ?? REEF_OFFSHORE_BAND;
  // Toward the slope's depth from the coast's own here (inshore the coast is shallower than its offshore depth).
  const cap = bg + Math.max(0, p.slopeDepthM - bg) * smoothstep(band[0], band[1], x);
  const reef = Math.min(reefProfileDepth(v, p), cap);
  return reef + Math.max(0, bg - reef) * smoothstep(p.slopeEndM, p.slopeEndM + REEF_FAR_EASE_M, v);
}

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
  // The deep slope's weed patches (its 5 m noise at every 0.5 m cell more than doubled the build): on the same lattice,
  // 10–20 m down where the water hides the difference.
  const patchOutField = new Float32Array(sx * sz);
  const north = p.northLedge ?? NORTH_LEDGE, south = p.southLedge ?? SOUTH_LEDGE;
  const shelf = p.northLedge || p.southLedge ? shelfPolygon(north, south) : SHELF_POLYGON;
  const tip = p.tip ?? TIP;
  for (let r = 0; r < sz; r++) for (let c = 0; c < sx; c++) {
    const x = grid.x0 + c * SDF_CELL_M, z = grid.z0 + r * SDF_CELL_M;
    sdf[r * sx + c] = ledgeSignedDistance(x, z, north, shelf, south);
    pockets[r * sx + c] = pocketWeight(x, z, tip);
    const [dx, dz] = reefWarp(x, z, tip);
    warpDxField[r * sx + c] = dx;
    warpDzField[r * sx + c] = dz;
    patchOutField[r * sx + c] = smoothstep(-0.5, 0.05, fbm2(x / 5, z / 5, REEF_SEED + 3));
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
    // The reef fades back to the plain coast before the map's north and south edges, so the map joins the far field seamlessly.
    const edgeFade = smoothstep(-450, -380, z) * (1 - smoothstep(230, 299, z));
    for (let col = 0; col < grid.nx; col++) {
      const x = grid.x0 + col * grid.cellM;
      const i = row * grid.nx + col;
      const background = depthBg(x);
      // Domain-warp the query point: the rock's reach, the reef heads and the sand pockets are read at p' = p + w(p), so
      // their edges wander naturally instead of following dead-straight lines (the depth profile reads p itself: below). depthBg/background above stay on the unwarped coast profile. w is interpolated from the
      // coarse warpDxField/warpDzField lattice (bilinear interpolation of already amplitude-clamped
      // vectors is a convex combination of them, so it stays within the same cap); the 15 m peak taper
      // is re-applied here at the exact query point so the take-off corner is untouched exactly, not just
      // approximately, regardless of how (0, 0) happens to sit relative to the coarse lattice.
      const warpTaper = smoothstep(0, 15, Math.hypot(x - tip[0], z - tip[1]));
      const xw = x + lattice(warpDxField, x, z) * warpTaper, zw = z + lattice(warpDzField, x, z) * warpTaper;
      // The depth profile (the ledge, the face, the shelf's ramp) reads the ledge at the unwarped point, so the breaking line
      // follows the drawn ledges (one-curl spec §3c: read at the warped point it wandered ±5–7 m every 35 m, and the onset
      // with it); the rock's look (its reach, the heads, pockets and weed) keeps the warped point.
      const sd = lattice(sdf, xw, zw), sdDepth = lattice(sdf, x, z);
      let d: number, s: number, w = 0;
      if (sdDepth < 0) {
        // Outside the shelf: the reef face, then the steady slope out to the open sea (seawardDepth, spec 2026-10-02 §3).
        d = background + (seawardDepth(-sdDepth, x, p) - background) * edgeFade;
        // Seaward the reef's rock runs on down the slope (spec 2026-10-02 §4): weedy rock with scattered sand pockets out to
        // rockReachM(z) seaward of the ledge line, then the open coast's bed; the map's edges fade to the open coast too.
        const rock = 1 - smoothstep(rockReachM(zw) - ROCK_EDGE_M, rockReachM(zw) + ROCK_EDGE_M, -sd);
        const pocketOut = lattice(pockets, xw, zw);
        const patchOut = lattice(patchOutField, xw, zw);
        const sReef = pocketOut, wReef = (1 - pocketOut) * DEEP_REEF_WEED * patchOut;
        const [sOpen, wOpen] = OPEN_COAST_MATERIAL;
        s = sOpen + (sReef - sOpen) * rock * edgeFade;
        w = wOpen + (wReef - wOpen) * rock * edgeFade;
      } else {
        // Inside: reef heads and sand pockets on the shelf, also fading out at its inshore (x ≈ 110 m) boundary.
        const reefness = edgeFade * smoothstep(SHELF_INNER_X + 15, SHELF_INNER_X - 10, x);
        const warpX = xw + 6 * fbm2(xw / 23, zw / 23, REEF_SEED + 7);
        const warpZ = zw + 6 * fbm2(xw / 23 + 9.1, zw / 23 - 3.7, REEF_SEED + 8);
        const relief = fbm2(warpX / 11, warpZ / 11, REEF_SEED);
        const heads = smoothstep(0.05, 0.55, relief);
        let interior = Math.max(p.minDepthM, p.shelfDepthM - p.headReliefM * heads);
        const pocket = Math.max(lattice(pockets, xw, zw), smoothstep(-0.4, -0.7, relief));
        interior = interior + (p.pocketDepthM - interior) * pocket;
        const dShelf = p.ledgeDepthM + (interior - p.ledgeDepthM) * smoothstep(0, 20, sdDepth);
        const sShelf = pocket * smoothstep(0, 3, sd);
        // Weed dominates rock over most of the shelf; the noise only carves occasional bare-rock gaps,
        // and reef heads carry extra weed of their own.
        const patch = smoothstep(-0.5, 0.05, fbm2(xw / 5, zw / 5, REEF_SEED + 3));
        const wShelf = (1 - pocket) * Math.min(1, SHELF_WEED_BASE + HEAD_WEED_BOOST * heads) * patch * smoothstep(0, 6, sd);
        d = background + (dShelf - background) * reefness;
        s = OPEN_COAST_MATERIAL[0] + (sShelf - OPEN_COAST_MATERIAL[0]) * reefness;
        w = OPEN_COAST_MATERIAL[1] + (wShelf - OPEN_COAST_MATERIAL[1]) * reefness;
      }
      bed[i] = -d;
      sand[i] = s;
      weed[i] = Math.min(w, 1 - s);
    }
  }
  return { grid, bed, sand, weed };
}

/**
 * Bilinear seabed height inside the map; outside it, the reef-free coast profile shifted east by shiftAt(z), the land's
 * waterline offset (Phase 4a spec §4.4; none by default). Landward of the waterline, the beach (Phase 4b §3.3): the
 * shading's bed, so the swash is a thin film over sand. The wave model's arrays are unaffected.
 */
export function bedHeightAt(b: Bathymetry, x: number, z: number, shiftAt?: (z: number) => number): number {
  const shift = shiftAt ? shiftAt(z) : 0;
  const g = b.grid;
  const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
  let bed: number;
  // Outside the map: the coast profile (the old Bombie mound went with shelf-polish §7: the coast map's Bombie is the one).
  if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) bed = -depthBg(x - shift);
  else {
    const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
    const tx = fx - c, tz = fz - r;
    const i = r * g.nx + c;
    const top = b.bed[i] + (b.bed[i + 1] - b.bed[i]) * tx;
    const bottom = b.bed[i + g.nx] + (b.bed[i + g.nx + 1] - b.bed[i + g.nx]) * tx;
    bed = top + (bottom - top) * tz;
  }
  const dSea = SHORE_X + shift - x;
  return dSea < 0 ? Math.max(bed, beachHeight(-dSea)) : bed;
}

/**
 * [sand, weed] at (x, z) (reef = 1 − both): bilinear inside the map, the open coast's weedy rock outside, then the shore reef platform
 * mixed in within its width of the waterline (SHORE_X + shiftAt(z)). CPU mirror of Seabed.materialNode.
 */
export function bedMaterialAt(b: Bathymetry, x: number, z: number, shiftAt?: (z: number) => number, shore = true): [number, number] {
  // Landward of the waterline the swash runs up sand (Phase 4b §3.3).
  if (shore && SHORE_X + (shiftAt ? shiftAt(z) : 0) - x < 0) return [1, 0];
  const g = b.grid;
  const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
  let sand: number = OPEN_COAST_MATERIAL[0], weed: number = OPEN_COAST_MATERIAL[1];
  if (!(fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1)) {
    const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
    const tx = fx - c, tz = fz - r, i = r * g.nx + c;
    const bl = (a: Float32Array) => (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - tz) + (a[i + g.nx] * (1 - tx) + a[i + g.nx + 1] * tx) * tz;
    sand = bl(b.sand); weed = bl(b.weed);
  }
  if (!shore) return [sand, weed];
  const w = shoreReefWeight(SHORE_X + (shiftAt ? shiftAt(z) : 0) - x, z);
  return [sand + (SHORE_REEF_MATERIAL[0] - sand) * w, weed + (SHORE_REEF_MATERIAL[1] - weed) * w];
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
