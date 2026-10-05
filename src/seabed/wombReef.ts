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

export const DEFAULT_REEF_PARAMS: ReefParams = {
  ledgeDepthM: 6,
  faceBaseDepthM: 14,
  faceWidthM: 25,
  slopeDepthM: 20,
  slopeEndM: 200,
  shelfDepthM: 4,
  headReliefM: 2.5,
  minDepthM: 1.5,
  pocketDepthM: 5.5,
};

/** Seaward edge the left peels along: the first 120 m from the tip runs at bearing 20° (north-north-east) — that angle to the refracted swell sets the peel speed (≈14 m/s at the default 225° swell) — then continues north-north-west to the map edge, landing about 36 m east of the originally traced shelf edge at the map edge (90–110 m east of it mid-shelf) (tunable with Andrew in Task 13). */
export const NORTH_LEDGE: readonly Pt[] = [[0, 0], [41.04, -112.76], [-19.8, -280], [-81.6, -450]];
/** Short edge running south-east from the tip (the right closes out along it). */
export const SOUTH_LEDGE: readonly Pt[] = [[0, 0], [25, 28], [60, 38], [110, 45]];
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

/**
 * The reshaped reef (spec 2026-10-05-womb-profile-design §3; Andrew chose round 2, 2026-10-05): deep water right up to a
 * short, steep face (25 m rising to 3.5 m over 20 m), so the wave breaks at the edge and throws instead of tripping on the
 * slope in front of the take-off. The left: a first section of 55 m at bearing 40°, across the swell enough to peel at
 * 5–9 m/s; the gap, a deep bay cut 50 m into the reef that the wave backs off into (the kick-out); the second section, its
 * own small peak, heavier and faster (12–16 m/s: "accurate", Andrew); then the old line on to the map's edge, which
 * closes out. The tide slides the sizes it suits (low 4–8 ft, mid 6–10, high 8–12; 4 ft is soft at mid tide). It goes
 * live with the new wave shape (§7 step 3): the old breaking code's rules were tuned to DEFAULT_REEF_PARAMS.
 */
export const RESHAPED_NORTH_LEDGE: readonly Pt[] = [[0, 0], [35.4, -42.1], [60, -58], [95, -75], [95, -100], [60, -115], [44, -118], [93, -152], [-19.8, -280], [-81.6, -450]];
/**
 * Andrew's satellite line (Google Earth, 2026-10-05: "the red line is the breaking reef of our left-handed ride"), turned
 * into the game's frame, whose beach runs north–south (the real one runs 347°): from the take-off corner the left's edge
 * runs 24° for 70 m, then bends to run along the beach 54 m off the waterline (his line closes on the beach there).
 */
export const SATELLITE_NORTH_LEDGE: readonly Pt[] = [[0, 0], [28, -64], [40, -110], [40, -450]];
/** South of the corner his line runs a little seaward of due south. */
export const SATELLITE_SOUTH_LEDGE: readonly Pt[] = [[0, 0], [-7, 50], [-20, 150], [-30, 242]];
export const RESHAPED_REEF_PARAMS: ReefParams = {
  ledgeDepthM: 3.5,
  faceBaseDepthM: 25,
  faceWidthM: 20,
  slopeDepthM: 30,
  slopeEndM: 200,
  shelfDepthM: 4,
  headReliefM: 2.5,
  minDepthM: 1.5,
  pocketDepthM: 5.5,
  offshoreBand: [SHORE_X - 40, SHORE_X - 100],
  northLedge: SATELLITE_NORTH_LEDGE,
  southLedge: SATELLITE_SOUTH_LEDGE,
};
/** Sand pockets traced from Andrew's top-down satellite view (reference/place/womb-correct-topdown-peak-189m-offshore.webp:
 * 0.41 m/px, the peak at pixel (902, 572)): small scattered patches in the dark reef, [cx, cz, rx, rz] (spec 2026-10-02 §4). */
export const SAND_POCKETS: readonly (readonly [number, number, number, number])[] = [
  [40, -21, 8, 5], [45, 12, 7, 5], [-13, -42, 9, 6], [52, -130, 10, 6], [52, -80, 8, 6], [-50, -132, 10, 7], [-83, -173, 9, 6], [11, -177, 8, 6],
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
