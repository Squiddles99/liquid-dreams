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
  /** The take-off corner, where the two ledges meet: the warp's taper and the sand pockets follow it. Absent: TIP. */
  tip?: Pt;
}

/**
 * The Womb's reef. The ledges are Andrew's satellite line (Google Earth, 2026-10-05: "the red line is the breaking reef of
 * our left-handed ride"), turned into the game's frame, whose beach runs north–south (the real one runs 347°), with the
 * take-off 100–110 m off the sand (coastProfile.SHORE_X). The depths are round 2's (spec 2026-10-05-womb-profile-design
 * §3.1) but for the basin: deep water right up to a short, steep face (15 m rising to 3.5 m over 15 m), so the wave breaks
 * at the edge and throws instead of tripping on a slope in front of the take-off. The basin is the coast's own offshore
 * depth (coastProfile.REEF_SURROUND_DEPTH_M) and runs at that one depth to the far field (R1 §1, 2026-10-06): along a
 * straight ledge the curl runs c / sin α, and Snell's law conserves that from wherever the swell's direction is set, so a
 * coast ramp in front of the reef turned every swell toward east and the curl ran 12–15 m/s; a shallower shelf never slows
 * it. At one depth the swell arrives unbent and the first section peeled 9.7 and 10.1 m/s at 6 and 8 ft, hollow 1.0
 * (measured 2026-10-06). History: round 2's 25–30 m basin in a 13 m coast spread the swell out (Andrew, "TINY") and a
 * 20 m basin bent it a right angle at its walls (Andrew, 2026-10-05: "the adjacent right-angle swell").
 */
export const DEFAULT_REEF_PARAMS: ReefParams = {
  ledgeDepthM: 3.5,
  faceBaseDepthM: 15,
  faceWidthM: 15,
  slopeDepthM: 15,
  slopeEndM: 200,
  shelfDepthM: 4,
  headReliefM: 2.5,
  minDepthM: 1.5,
  pocketDepthM: 5.5,
  offshoreBand: [SHORE_X - 40, SHORE_X - 100],
};

/** The take-off corner (x, z), where the left's and the right's ledges meet: 224 m off the beach (womb-retune Task 2b,
 * Andrew's ruling 2026-10-09: the take-off moves seaward; Fable's row). On the real shelf the swell reaches the Womb ~18°
 * off shore-normal; a left peels only along a ledge running downstream of the crest, north-east toward the beach, and
 * each metre of it costs 0.7 m of the distance to the beach. From the old corner 94 m off the sand the beach ramp
 * (depthBg: 5.5 m about 70 m off) closed out anything past ~70 m of ledge; from here the left runs 180 m on the ledge. */
export const TIP: Pt = [-130, 0];
/** The left's bearing (degrees from north toward the beach): 46° peels 11.3–12.1 m/s from Solid to Huge at 225°, Pumping
 * hollow 0.81 (sweep-tip-b; 42° ran 12.2–12.5, 48° flattened Pumping to 0.74). */
export const LEFT_BEARING_DEG = 46;
/** The left's ledge length (m) before the inside (due north): Pumping breaks on it to its end at 150–210 m alike. */
export const LEFT_LEDGE_M = 180;
/** The left from `tip`: one straight ledge at `bearingDeg` for `lengthM`, then due north (the inside) to the map's edge. */
export function leftLedgeFrom(tip: Pt, lengthM = LEFT_LEDGE_M, bearingDeg = LEFT_BEARING_DEG): Pt[] {
  const r = (bearingDeg * Math.PI) / 180, end: Pt = [tip[0] + lengthM * Math.sin(r), tip[1] - lengthM * Math.cos(r)];
  return [tip, end, [end[0], -450]];
}
/** The right's shape from its corner: his satellite line runs a little seaward of due south. The swell reaches it before
 * the corner: the left stands up first 40 m south of the corner; the right closes out. */
const RIGHT_SHAPE: readonly Pt[] = [[0, 0], [-7, 50], [-20, 150], [-30, 242]];
/** The right from `tip`: its shape moved to it. */
export const rightLedgeFrom = (tip: Pt): Pt[] => RIGHT_SHAPE.map(([x, z]) => [x + tip[0], z + tip[1]] as Pt);

/** The left's edge: from the corner one 46° ledge for 180 m to (−1, −125), then due north (R1–Task 2's three legs from a
 * corner 94 m off the beach, [[0,0],[28,−64],[40,−110],[40,−450]], ran out of water: see TIP). */
export const NORTH_LEDGE: readonly Pt[] = leftLedgeFrom(TIP);
/** The right's edge, from the corner. */
export const SOUTH_LEDGE: readonly Pt[] = rightLedgeFrom(TIP);
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
