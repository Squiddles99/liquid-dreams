import { describe, expect, it } from 'vitest';
import { DEFAULT_REEF_PARAMS, LEFT_BEARING_DEG, NORTH_LEDGE, SOUTH_LEDGE, TIP } from '../seabed/wombReef';
import { SWELL_BANDS } from '../frontend/sessionSetup';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { CLOSEOUT_PEEL, leftStretches, rideOf, setWaveHeight } from './reefReport';
import { coastReefField } from './testField';

/**
 * The Womb's left on the real shelf (womb-retune Task 2b, Andrew's ruling 2026-10-09; Fable's row): from the tip 224 m off
 * the beach one 180 m ledge at 46°, then due north (the inside); the right is the satellite line's shape moved to the tip.
 * The game's field (coast-seeded, smoothed, REFRACT_FLOOR_M), 225°, every select tide, per offered band (Fun does not stand
 * up on a 3.5 m ledge 230 m out: not offered, Fable 2026-10-09). Measured: evidence/womb-retune/pins-225.txt.
 */
const LEGS = { first: [0], inside: [1] } as const;
/** womb-story (Task 3 re-pin, 2026-10-14): segment A, the barrel, from the tip to ledgeBarrelM down the left. */
const A_END: [number, number] = [TIP[0] + DEFAULT_REEF_PARAMS.ledgeBarrelM * Math.sin((LEFT_BEARING_DEG * Math.PI) / 180), TIP[1] - DEFAULT_REEF_PARAMS.ledgeBarrelM * Math.cos((LEFT_BEARING_DEG * Math.PI) / 180)];
const TIDES_M = [-0.5, -0.25, 0, 0.5] as const;
const band = (label: string) => SWELL_BANDS.find((b) => b.label === label)!;
const legs = (label: string, tideM: number) => {
  const b = band(label), f = coastReefField({ periodS: b.periodS, tideM }), H = setWaveHeight(b.ft);
  return { ...leftStretches(f, H, NORTH_LEDGE, LEGS, DEFAULT_BREAK_PARAMS), ...leftStretches(f, H, SOUTH_LEDGE, { r0: [0], r1: [1] }, DEFAULT_BREAK_PARAMS),
    ...leftStretches(f, H, [TIP, A_END], { a: [0] }, DEFAULT_BREAK_PARAMS) };
};

// Re-pinned 2026-10-14 (womb-story Tasks 1-3, Fable's STOP 0 ruling): the left tells Andrew's story. It barrels on A, peels
// on B (hollow 0.45) and fizzles on the drop past ledgeWallM (or closes out big), so "the first leg breaks all along",
// "the first leg barrels" (its median is B's) and "the inside closes out" (it lies in the drop) are superseded: the leg
// breaks through the wall (to within 20 m of ledgeWallM), A barrels, the inside closes out only on the biggest day.
const THROUGH_WALL = Math.ceil((DEFAULT_REEF_PARAMS.ledgeWallM - 20) / 2.5);
describe("the Womb's left on the real shelf (womb-retune)", () => {
  // R3's line, 9–12 m/s, for the bands a surfer rides most; the biggest day (Huge) to 12.5 (Fable 2026-10-09: leftStretches
  // fits 2.5 m samples, 0.1 m/s is in its noise; a statement of the biggest day, not a loosening). Big at +0.5 m runs 12.1
  // (measured), held to Huge's 12.5 on the same ruling.
  const MAX_PEEL: Record<string, (tideM: number) => number> = { Solid: () => 12, Pumping: () => 12, Big: (t) => (t > 0 ? 12.5 : 12), Huge: () => 12.5 };
  it.each(Object.keys(MAX_PEEL))('%s: the first leg breaks through the wall and peels 9 m/s to its bar at every tide', { timeout: 900_000 }, (label) => {
    for (const tideM of TIDES_M) {
      const first = legs(label, tideM).first;
      expect(first, `${label} ${tideM} m`).not.toBeNull();
      expect(first!.broken, `${label} ${tideM} m`).toBeGreaterThanOrEqual(THROUGH_WALL);
      expect(first!.peel, `${label} ${tideM} m`).toBeGreaterThanOrEqual(9);
      expect(first!.peel, `${label} ${tideM} m`).toBeLessThanOrEqual(MAX_PEEL[label](tideM));
    }
  });

  it.each(['Pumping', 'Big'])('%s (the two middle offered bands): A barrels at every tide', { timeout: 900_000 }, (label) => {
    for (const tideM of TIDES_M) expect(rideOf(legs(label, tideM).a), `${label} ${tideM} m`).toBe('barrel');
  });

  it('Solid (the smallest offered) is soft at mid tide: hollow < 0.6', { timeout: 300_000 }, () => {
    expect(legs('Solid', 0).first!.hollow).toBeLessThan(0.6);
  });

  it.each(['Solid', 'Pumping', 'Big', 'Huge'])('%s: the right closes out at every tide; the inside (due north past the ledge) on the biggest day', { timeout: 900_000 }, (label) => {
    for (const tideM of TIDES_M) {
      const l = legs(label, tideM);
      if (label === 'Huge') expect(l.inside!.peel, `${label} ${tideM} m inside`).toBeGreaterThan(CLOSEOUT_PEEL);
      for (const r of [l.r0!, l.r1!]) expect(rideOf(r), `${label} ${tideM} m right`).toBe('closes out');
    }
  });
});
