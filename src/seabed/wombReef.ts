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

export interface ReefParams {
  /** Depth just outside the ledges (the coast profile is 13 m there; this can deepen it locally). */
  deepDepthM: number;
  /** Still-water depth along both ledges and at the take-off corner (Andrew: about 6 m / 20 ft). */
  ledgeDepthM: number;
  /** Horizontal distance over which the seabed rises from deep water to the ledge. */
  ledgeWidthM: number;
  /** Base depth of the shelf interior. */
  shelfDepthM: number;
  /** How far reef heads rise above the shelf base. */
  headReliefM: number;
  /** Nothing on the shelf is shallower than this at mid tide. */
  minDepthM: number;
  /** Floor depth of the sand pockets. */
  pocketDepthM: number;
}

export const DEFAULT_REEF_PARAMS: ReefParams = {
  deepDepthM: 13,
  ledgeDepthM: 6,
  ledgeWidthM: 15,
  shelfDepthM: 4,
  headReliefM: 2.5,
  minDepthM: 1.5,
  pocketDepthM: 5.5,
};

type Pt = readonly [number, number];

/** Seaward edge the left peels along: 120 m from the tip at bearing 20° (north-north-east), then back north-north-west along the traced shelf edge. The first segment's angle to the refracted swell sets the peel speed (≈14 m/s at the default 225° swell). */
export const NORTH_LEDGE: readonly Pt[] = [[0, 0], [41.04, -112.76], [-19.8, -280], [-81.6, -450]];
/** Short edge running south-east from the tip (the right closes out along it). */
export const SOUTH_LEDGE: readonly Pt[] = [[0, 0], [25, 28], [60, 38], [110, 45]];
/** Shelf polygon (clockwise in plan view): tip → south ledge → inner-platform edge → north map edge → north ledge. */
export const SHELF_POLYGON: readonly Pt[] = [[0, 0], [25, 28], [60, 38], [110, 45], [110, -450], [-81.6, -450], [-19.8, -280], [41.04, -112.76]];
/** Major turquoise sand pockets traced from the corrected satellite images: [cx, cz, rx, rz]. */
export const SAND_POCKETS: readonly (readonly [number, number, number, number])[] = [
  [20, -40, 18, 10], [45, -160, 22, 12], [50, -110, 26, 14], [70, -200, 24, 12], [20, -250, 17, 10], [62, 17, 17, 8],
];
