import { describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { RESHAPED_NORTH_LEDGE, RESHAPED_REEF_PARAMS } from '../seabed/wombReef';
import { type ReefField, computeReefField } from './reefField';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { type Ride, TIDES, type Tide, leftStretches, rideOf, setWaveHeight } from './reefReport';

/**
 * The reshaped reef as Andrew chose it (round 2, 2026-10-05; spec 2026-10-05-womb-profile-design §3): what a surfer gets
 * on the left at each size and tide, 15 s from 225°, the peel stretch on. First section → gap → second section.
 */
const STRETCHES = { first: [0], gap: [1, 2, 3, 4], second: [5, 6] } as const;
type Row = readonly [Ride, Ride, Ride];
const B: Ride = 'barrel', S: Ride = 'soft', C: Ride = 'closes out', K: Ride = 'backs off', X: Ride = 'keeps breaking';
const SIGNED: Readonly<Record<Tide, Readonly<Record<number, Row>>>> = {
  low: { 6: [B, K, B], 8: [B, X, C], 10: [C, X, C] },
  mid: { 4: [S, K, B], 6: [B, K, B], 8: [B, K, B], 10: [B, X, C], 12: [C, X, C] },
  high: { 6: [S, K, B], 8: [B, K, B], 10: [B, K, B], 12: [B, X, B] },
};

describe("the reshaped reef: Andrew's round 2 (2026-10-05)", () => {
  const bed = downsample(buildBathymetry(RESHAPED_REEF_PARAMS), 2);
  const fields = {} as Record<Tide, ReefField>;
  const field = (t: Tide): ReefField => (fields[t] ??= computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: TIDES[t], peel: DEFAULT_BREAK_PARAMS.peel }));

  for (const tide of ['low', 'mid', 'high'] as const) {
    it(`${tide} tide: first section, gap, second section as signed`, { timeout: 120_000 }, () => {
      for (const [ft, row] of Object.entries(SIGNED[tide])) {
        const r = leftStretches(field(tide), setWaveHeight(Number(ft)), RESHAPED_NORTH_LEDGE, STRETCHES);
        expect([rideOf(r.first), rideOf(r.gap, true), rideOf(r.second)], `${ft} ft`).toEqual(row);
      }
    });
  }

  it('the first section peels at a speed you can ride (4–10 m/s) and lasts 5 s or more where it barrels at mid tide', { timeout: 120_000 }, () => {
    for (const ft of [6, 8, 10]) {
      const first = leftStretches(field('mid'), setWaveHeight(ft), RESHAPED_NORTH_LEDGE, STRETCHES).first!;
      expect(first.peel, `${ft} ft`).toBeGreaterThan(4);
      expect(first.peel, `${ft} ft`).toBeLessThan(10);
      expect(first.end - first.start, `${ft} ft`).toBeGreaterThan(5);
    }
  });

  it('the second section is faster than the first, where both barrel (Andrew: "accurate")', { timeout: 120_000 }, () => {
    for (const ft of [6, 8]) {
      const r = leftStretches(field('mid'), setWaveHeight(ft), RESHAPED_NORTH_LEDGE, STRETCHES);
      expect(r.second!.peel, `${ft} ft`).toBeGreaterThan(r.first!.peel);
    }
  });
});
