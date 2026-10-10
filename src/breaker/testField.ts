import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_COAST_PARAMS } from '../seabed/coastFeatures';
import { buildCoastMap } from '../seabed/coastMap';
import { DEFAULT_REEF_PARAMS } from '../seabed/wombReef';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { REFRACT_FLOOR_M, type ReefField, computeReefField } from './reefField';

/**
 * The game's field for tests (womb-retune spec §5, plan Task 3): the Womb's reef map, the coast map built from it, and the
 * reef field seeded by the coast field (the swell dial read at the coast seed). One per swell × tide × grid factor for the
 * test file's run. The game always seeds from the coast (shelf-polish §6); tests that need a flat bed build it themselves.
 */
export interface TestFieldOpts {
  periodS: number;
  fromDeg?: number;
  tideM?: number;
  /** The reef map's downsampling: 2 (1 m, the game's) by default, 4 for the coarse 2 m tests. */
  factor?: number;
  /** computeReefField's peel option (the ride's tests pass DEFAULT_BREAK_PARAMS.peel). */
  peel?: boolean;
}

const beds = new Map<number, { bed: ReturnType<typeof buildBathymetry>; coast: ReturnType<typeof buildCoastMap> }>();
const fields = new Map<string, ReefField>();

export function reefBeds(factor = 2) {
  let b = beds.get(factor);
  if (!b) {
    const bed = downsample(buildBathymetry(DEFAULT_REEF_PARAMS), factor);
    b = { bed, coast: buildCoastMap(bed, DEFAULT_COAST_PARAMS) };
    beds.set(factor, b);
  }
  return b;
}

export function coastReefField(o: TestFieldOpts): ReefField {
  const fromDeg = o.fromDeg ?? 225, tideM = o.tideM ?? 0, factor = o.factor ?? 2;
  const key = `${o.periodS}:${fromDeg}:${tideM}:${factor}:${o.peel ? 1 : 0}`;
  let f = fields.get(key);
  if (!f) {
    const { bed, coast } = reefBeds(factor);
    f = computeReefField({ bed, periodS: o.periodS, fromDeg, tideM, smooth: true, refractFloorM: REFRACT_FLOOR_M, coast, ...(o.peel ? { peel: DEFAULT_BREAK_PARAMS.peel } : {}) });
    fields.set(key, f);
  }
  return f;
}
