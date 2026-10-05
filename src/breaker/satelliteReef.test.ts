import { describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_REEF_PARAMS, NORTH_LEDGE } from '../seabed/wombReef';
import { REFRACT_FLOOR_M, type ReefField, computeReefField } from './reefField';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { CLOSEOUT_PEEL, TIDES, type Tide, leftStretches, rideOf, setWaveHeight } from './reefReport';
import { MAX_SPEED } from '../ride/ridePhysics';

/**
 * The Womb's reef on Andrew's satellite line (2026-10-05), as the game asks for its field (smoothed, the swell bent as over
 * REFRACT_FLOOR_M), 15 s from 225°: the left's first leg (70 m at 24° from the corner), its second (46 m bending toward the
 * beach) and then the edge along the beach. The peel stretch is off (Andrew chose a ~10 m/s curl, but held sections ran on
 * over the flat and broke small and fat: "TINY... isn't a hollow barrel"), so the curl runs at the reef's own speed: one
 * the surfer can hold (ridePhysics.MAX_SPEED) at 4–8 ft. The edge along the beach closes out.
 */
const LEGS = { first: [0], second: [1], along: [2] } as const;

describe("the Womb's reef: Andrew's satellite line (2026-10-05)", () => {
  const bed = downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2);
  const fields = {} as Record<Tide, ReefField>;
  const field = (t: Tide): ReefField => (fields[t] ??= computeReefField({
    bed, periodS: 15, fromDeg: 225, tideM: TIDES[t], peel: DEFAULT_BREAK_PARAMS.peel, smooth: true, refractFloorM: REFRACT_FLOOR_M,
  }));

  it("the first leg peels at a speed the surfer can hold (10 m/s to MAX_SPEED) at 4–8 ft, every tide", { timeout: 600_000 }, () => {
    for (const tide of ['low', 'mid', 'high'] as const) {
      for (const ft of [4, 6, 8]) {
        const first = leftStretches(field(tide), setWaveHeight(ft), NORTH_LEDGE, LEGS).first!;
        expect(first.peel, `${tide} ${ft} ft`).toBeGreaterThan(10);
        expect(first.peel, `${tide} ${ft} ft`).toBeLessThan(MAX_SPEED);
      }
    }
  });

  it('the first leg barrels at 6 and 8 ft, every tide', { timeout: 600_000 }, () => {
    for (const tide of ['low', 'mid', 'high'] as const) {
      for (const ft of [6, 8]) expect(rideOf(leftStretches(field(tide), setWaveHeight(ft), NORTH_LEDGE, LEGS).first), `${tide} ${ft} ft`).toBe('barrel');
    }
  });

  it('where the edge runs along the beach the left closes out, at every size and tide', { timeout: 600_000 }, () => {
    for (const tide of ['low', 'mid', 'high'] as const) {
      for (const ft of [6, 8, 10, 12]) {
        const along = leftStretches(field(tide), setWaveHeight(ft), NORTH_LEDGE, LEGS).along!;
        expect(along.peel, `${tide} ${ft} ft`).toBeGreaterThan(CLOSEOUT_PEEL);
      }
    }
  });
});
