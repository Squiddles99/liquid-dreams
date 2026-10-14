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
  /** womb-story (spec 2026-10-13 §2, STOP 0 ruling): the story along the ridden left. Segment A, the barrel, to this many
   * metres down the left from the tip (Andrew: it barrels hard ~4 s; the curl's 13 m/s gives ~50 m). */
  ledgeBarrelM: number;
  /** Segment B, the wall (the face ahead stands, the lip peels), to here; past it C, the drop (fizzle, or close out big). */
  ledgeWallM: number;
  /** The width (m) of each transition: the target hollow falls from A's to B's over [ledgeBarrelM, + this]; the drop comes in over
   * ledgeWallM ± half of it. */
  ledgeBlendM: number;
  /** C's bed depth (m below mean sea level, as ledgeDepthM): the ledge past ledgeWallM and the shelf inshore of it, north to
   * the inside leg's first INSIDE_DROP_M. 8.5 (9 m of still water at tide 0.5): 7 ft fizzles by 132-136 m at tides -0.8 to
   * +0.8 and 12 ft closes out across C at all three (womb-story Task 1 sweep, 270/14). STOP 0 proposed 7 m still from a
   * breaking ratio of 0.78; the field breaks at about 0.68 (breaking.onsetGain), and 7 ft broke on to 164 m at 7 and 7.5 m. */
  dropDepthM: number;
  /** womb-story Task 3b (STOP 1 ruling 2, replacing the hollow share): A's target hollow (0–1): on A the reef raises ψ₀ to
   * at least its (reefField's psiHere). */
  barrelHollow: number;
  /** B's and C's target hollow (0–1): there the reef pulls ψ₀ down to its, a wall (the spilling lip, wombProfile). */
  wallHollow: number;
  /** womb-story Task 2 (spec 3.1, STOP 0 ruling 3): the right's ledge depth (m below mean sea level), and the shelf's along a
   * RIGHT_STRIP_M strip inshore of it: deeper than the tip's, so the right breaks after the take-off and all at once. Its
   * satellite line (RIGHT_SHAPE) is untouched; the corner (RIGHT_TIP_KEEP_M) keeps ledgeDepthM. 8: the shallowest of
   * {8, 10, 12} that puts the first onset at the tip at 270/14, 4 and 7 ft (STOP 1 ruling 1, by onset: firstBreakTip.test). */
  rightLedgeDepthM: number;
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
  ledgeBarrelM: 50,
  ledgeWallM: 130,
  ledgeBlendM: 15,
  dropDepthM: 8.5,
  barrelHollow: 0.8,
  wallHollow: 0.1,
  rightLedgeDepthM: 8,
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

/** Metres down the left's first leg from `tip` (the projection of (x, z) on its bearing; negative behind the tip). */
export function ledgeAlongM(x: number, z: number, tip: Pt = TIP, bearingDeg = LEFT_BEARING_DEG): number {
  const r = (bearingDeg * Math.PI) / 180;
  return (x - tip[0]) * Math.sin(r) - (z - tip[1]) * Math.cos(r);
}
const smooth01 = (a: number, b: number, v: number): number => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How much of segment A's law holds `along` m down the left (womb-story Task 3b): 1 on A, falling over [ledgeBarrelM,
 * ledgeBarrelM + ledgeBlendM] to 0 on B and C (A raises ψ₀ to its target, B and C pull it down to theirs). */
export function segmentBarrelW(along: number, p: Pick<ReefParams, 'ledgeBarrelM' | 'ledgeBlendM'>): number {
  return 1 - smooth01(p.ledgeBarrelM, p.ledgeBarrelM + Math.max(1e-3, p.ledgeBlendM), along);
}
/** The target hollow `along` m down the left (womb-story Task 3b, STOP 1 ruling 2): barrelHollow on A, blended over
 * ledgeBlendM to wallHollow on B and C. */
export function segmentHollow(along: number, p: Pick<ReefParams, 'ledgeBarrelM' | 'ledgeBlendM' | 'barrelHollow' | 'wallHollow'>): number {
  return p.wallHollow + (p.barrelHollow - p.wallHollow) * segmentBarrelW(along, p);
}
/** The tip keeps its own ψ₀ (Task 3b): the target's weight comes in over the left's first this many metres. */
export const TIP_EXEMPT_M = 10;
/** The strip inshore of the right's ledge held at rightLedgeDepthM (m; STOP 0 ruling 3), faded back to the shelf over
 * BAND_FADE_M. */
export const RIGHT_STRIP_M = 30;
/** Within this far of the tip the right keeps the tip's depth, faded in to rightLedgeDepthM over the next BAND_FADE_M (m):
 * the take-off corner is the left's (review focus 4: the tip's depth and face are unchanged). */
export const RIGHT_TIP_KEEP_M = 15;
/** How far the drop reaches north up the inside leg from its turn (m; STOP 0 ruling: its first 200 m). */
export const INSIDE_DROP_M = 200;
/** The ridden band (womb-story): from this far seaward of the left's edge to this far inshore of it (m), each faded over
 * BAND_FADE_M, and from BAND_FADE_M behind the tip on. The record's breaks on the left lie 60 m inshore (4 ft, on the shelf)
 * to 10 m seaward (12 ft) of the edge (STOP 0 table). */
export const BAND_SEAWARD_M = 30;
export const BAND_INSHORE_M = 100;
export const BAND_FADE_M = 15;
/** The left's edge: from the corner one 46° ledge for 180 m to (−1, −125), then due north (R1–Task 2's three legs from a
 * corner 94 m off the beach, [[0,0],[28,−64],[40,−110],[40,−450]], ran out of water: see TIP). */
export const NORTH_LEDGE: readonly Pt[] = leftLedgeFrom(TIP);
/** The right's edge, from the corner. */
export const SOUTH_LEDGE: readonly Pt[] = rightLedgeFrom(TIP);
/** The shelf's inshore edge (x): 10 m inside the shore's platform (shoreReef.SHORE_REEF_AT_MAP_M), so no sand strip shows
 * between them. */
export const SHELF_INNER_X = SHORE_X - SHORE_REEF_AT_MAP_M + 10;
/** The shelf's south-west corner (spec 2026-10-11-south-corner, Andrew: option 1): the radius (m) of the arc that replaces
 * the right angle where the south ledge's last leg meets the closing leg to SHELF_INNER_X. */
export const SOUTH_CORNER_RADIUS_M = 60;
/** Shelf polygon (clockwise in plan view): tip → south ledge → inner-platform edge → north map edge → north ledge. */
export const SHELF_POLYGON: readonly Pt[] = shelfPolygon(NORTH_LEDGE);
/** The arc rounding the corner `b` between the legs a → b and b → c: `n` points from the tangent point on a → b to the
 * one on b → c, all `radiusM` from the centre on the corner's bisector (each tangent point radiusM / tan(half the
 * corner's angle) from b). Null when the legs are too short for it or (anti)parallel. */
export function roundCorner(a: Pt, b: Pt, c: Pt, radiusM = SOUTH_CORNER_RADIUS_M, n = 7): Pt[] | null {
  const la = Math.hypot(a[0] - b[0], a[1] - b[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  if (la === 0 || lc === 0) return null;
  const u = [(a[0] - b[0]) / la, (a[1] - b[1]) / la], v = [(c[0] - b[0]) / lc, (c[1] - b[1]) / lc];
  const half = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) / 2;
  if (half < 1e-3 || half > Math.PI / 2 - 1e-3) return null;
  const t = radiusM / Math.tan(half);
  if (t >= la || t >= lc) return null;
  const bl = Math.hypot(u[0] + v[0], u[1] + v[1]), cd = radiusM / Math.sin(half);
  const centre = [b[0] + ((u[0] + v[0]) / bl) * cd, b[1] + ((u[1] + v[1]) / bl) * cd];
  const a0 = Math.atan2(b[1] + u[1] * t - centre[1], b[0] + u[0] * t - centre[0]);
  let sweep = Math.atan2(b[1] + v[1] * t - centre[1], b[0] + v[0] * t - centre[0]) - a0;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  return Array.from({ length: n }, (_, i) => {
    const ang = a0 + (sweep * i) / (n - 1);
    return [centre[0] + radiusM * Math.cos(ang), centre[1] + radiusM * Math.sin(ang)] as Pt;
  });
}
/** The shelf polygon for the ledges: tip → south ledge → across to the inner-platform edge (SHELF_INNER_X) → north map
 * edge → back down the left. The south-west corner (the south ledge's end, then east) is rounded (roundCorner); the
 * ledges themselves are untouched. */
export function shelfPolygon(north: readonly Pt[], south: readonly Pt[] = SOUTH_LEDGE): Pt[] {
  const end = south[south.length - 1], back = [...north].reverse().slice(0, -1);
  if (end[0] >= SHELF_INNER_X) return [...south, [SHELF_INNER_X, -450], ...back];
  return [...southEdge(south), [SHELF_INNER_X, end[1]], [SHELF_INNER_X, -450], ...back];
}
/** The shelf's south edge as the bed reads it (bathymetry.ledgeSignedDistance): the south ledge with its end corner
 * replaced by the rounded corner's arc, so the arc gets the ledges' own face (with the ledge alone as the edge the bed
 * kept a rim along the old square's last 60 m and a 4 → 14 m step at the arc). The ledge itself (SOUTH_LEDGE) is
 * unchanged; without a closing leg (the ledge ends inside SHELF_INNER_X) it is the ledge. */
export function southEdge(south: readonly Pt[] = SOUTH_LEDGE): Pt[] {
  const end = south[south.length - 1];
  const arc = end[0] < SHELF_INNER_X && south.length >= 2 ? roundCorner(south[south.length - 2], end, [SHELF_INNER_X, end[1]]) : null;
  return arc ? [...south.slice(0, -1), ...arc] : [...south];
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
