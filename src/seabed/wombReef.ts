import { smoothstep } from '../math/smoothstep';
import { SHORE_X } from './coastProfile';
import { SHORE_REEF_AT_MAP_M } from './shoreReef';

export interface GridSpec {
  /** World x (m) of column 0's cell centre. */
  x0: number;
  /** World z (m) of row 0's cell centre. */
  z0: number;
  cellM: number;
  nx: number;
  nz: number;
}

/** The reef map: x ∈ [−400, +250), z ∈ [−450, +300) around the peak, 0.5 m cells. */
export const REEF_GRID: GridSpec = { x0: -400, z0: -450, cellM: 0.5, nx: 1300, nz: 1500 };

/** The reef is the place, not a random process: a fixed seed, never Conditions.seed. */
export const REEF_SEED = 1905;

/**
 * Domain warp applied to every reef query point before the ledges, the shelf polygon, the reef heads
 * and the sand pockets are evaluated, so their edges read as natural and uneven rather than the ruler-
 * straight originals. Two frequencies: a broad wander plus finer detail. Tapered to zero within 15 m of
 * the peak (see reefWarp() in bathymetry.ts) so the take-off corner keeps its exact 6 m ledge depth.
 */
export const REEF_WARP = { ampM: 5, featureM: 35, detailAmpM: 2, detailFeatureM: 12 };

type Pt = readonly [number, number];

export interface ReefParams {
  /** Still-water depth along both ledges and at the take-off corner (Andrew: about 6 m / 20 ft). */
  ledgeDepthM: number;
  /** The reef face's base: the depth it rises from to the ledge (spec 2026-10-02 §3: about 11–12 m; tuned in plan Task 3). */
  faceBaseDepthM: number;
  /** The face's width seaward of the ledge line (m; about 30–40 m). */
  faceWidthM: number;
  /** Beyond the face the bed deepens steadily to this depth (m; about 20 m)… */
  slopeDepthM: number;
  /** …this far seaward of the ledge line (m; about 200 m), and eases into the open sea past it (bathymetry.seawardDepth). */
  slopeEndM: number;
  /** Base depth of the shelf interior. */
  shelfDepthM: number;
  /** How far reef heads rise above the shelf base. */
  headReliefM: number;
  /** Nothing on the shelf is shallower than this at mid tide. */
  minDepthM: number;
  /** Floor depth of the sand pockets. */
  pocketDepthM: number;
  /** The x band (m) over which the coast may deepen toward slopeDepthM: none inshore of the first, fully by the second
   * (bathymetry.seawardDepth). Absent: SHORE_X − 140 → SHORE_X − 260. */
  offshoreBand?: readonly [number, number];
  /** The left's seaward edge (the shelf follows it). Absent: NORTH_LEDGE. */
  northLedge?: readonly Pt[];
  /** The right's seaward edge, from the tip (the shelf follows it). Absent: SOUTH_LEDGE. */
  southLedge?: readonly Pt[];
}

/**
 * The Womb's reef. The ledges are Andrew's satellite line (Google Earth, 2026-10-05: "the red line is the breaking reef of
 * our left-handed ride"), turned into the game's frame, whose beach runs north–south (the real one runs 347°), with the
 * take-off 100–110 m off the sand (coastProfile.SHORE_X). The depths are round 2's (spec 2026-10-05-womb-profile-design
 * §3.1) but for the basin: deep water right up to a short, steep face (20 m rising to 3.5 m over 20 m), so the wave breaks
 * at the edge and throws instead of tripping on a slope in front of the take-off. Round 2's 25–30 m basin, ringed by the
 * coast's 13 m, spread the swell out before this broad edge (it reached the reef at 0.66× its open-sea height, the 6 ft
 * curl ~2.4 m: Andrew, "TINY"); at 20 m it reaches it at about 1×. Round 2's left ran at 40°, along the swell's own travel:
 * the swell slid along it and bent a right angle onto the shelf (Andrew, 2026-10-05: "the wave goes into a right angle").
 */
export const DEFAULT_REEF_PARAMS: ReefParams = {
  ledgeDepthM: 3.5,
  faceBaseDepthM: 20,
  faceWidthM: 20,
  slopeDepthM: 20,
  slopeEndM: 200,
  shelfDepthM: 4,
  headReliefM: 2.5,
  minDepthM: 1.5,
  pocketDepthM: 5.5,
  offshoreBand: [SHORE_X - 40, SHORE_X - 100],
};

/** The left's edge: from the corner it runs 24° for 70 m, then bends to run along the beach 54 m off the waterline (his
 * line closes on the beach there). */
export const NORTH_LEDGE: readonly Pt[] = [[0, 0], [28, -64], [40, -110], [40, -450]];
/** South of the corner his line runs a little seaward of due south. The swell reaches it before the corner: the left
 * stands up first 40 m south of the corner. */
export const SOUTH_LEDGE: readonly Pt[] = [[0, 0], [-7, 50], [-20, 150], [-30, 242]];
/** The shelf's inshore edge (x): 10 m inside the shore's platform (shoreReef.SHORE_REEF_AT_MAP_M), so no sand strip shows
 * between them. */
export const SHELF_INNER_X = SHORE_X - SHORE_REEF_AT_MAP_M + 10;
/** Shelf polygon (clockwise in plan view): tip → south ledge → inner-platform edge → north map edge → north ledge. */
export const SHELF_POLYGON: readonly Pt[] = shelfPolygon(NORTH_LEDGE);
/** The shelf polygon for the ledges: tip → south ledge → across to the inner-platform edge (SHELF_INNER_X) → north map
 * edge → back down the left. */
export function shelfPolygon(north: readonly Pt[], south: readonly Pt[] = SOUTH_LEDGE): Pt[] {
  const end = south[south.length - 1];
  return [...south, ...(end[0] < SHELF_INNER_X ? [[SHELF_INNER_X, end[1]] as Pt] : []), [SHELF_INNER_X, -450], ...[...north].reverse().slice(0, -1)];
}

/** Sand pockets traced from Andrew's top-down satellite view (reference/place/womb-correct-topdown-peak-189m-offshore.webp:
 * 0.41 m/px, the peak at pixel (902, 572)): small scattered patches in the dark reef, [cx, cz, rx, rz] (spec 2026-10-02 §4). */
export const SAND_POCKETS: readonly (readonly [number, number, number, number])[] = [
  [40, -21, 8, 5], [45, 12, 7, 5], [-13, -42, 9, 6], [10, -130, 10, 6], [45, -80, 8, 6], [-50, -132, 10, 7], [-83, -173, 9, 6], [11, -177, 8, 6],
];

/**
 * How far seaward of the ledge line the reef's rock runs (m), the rest being the open coast's bed (spec §4): north of the
 * peak, two to three times the ledge line's own distance offshore (Andrew's satellite views: the dark reef reaches about
 * 340 m off the beach there); south of the peak only the face (the photos' uniform deep blue south and west of it).
 */
export const ROCK_REACH_NORTH_M = 170;
export const ROCK_REACH_SOUTH_M = 40;
/** The rock's seaward edge blends over ±ROCK_EDGE_M. */
export const ROCK_EDGE_M = 20;
/** Weed cover on the reef's deep slope, before its patch noise. */
export const DEEP_REEF_WEED = 0.75;
export function rockReachM(z: number): number {
  return ROCK_REACH_NORTH_M + (ROCK_REACH_SOUTH_M - ROCK_REACH_NORTH_M) * smoothstep(-30, 40, z);
}
