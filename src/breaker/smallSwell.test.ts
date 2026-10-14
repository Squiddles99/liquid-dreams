import { describe, expect, it } from 'vitest';
import { NORTH_LEDGE } from '../seabed/wombReef';
import { SWELL_BANDS } from '../frontend/sessionSetup';
import { DEFAULT_BREAK_PARAMS as P } from './breaking';
import { leftStretches, setWaveHeight } from './reefReport';
import { coastReefField } from './testField';

// The select screen's matrix (womb-retune Task 4: docs/superpowers/evidence/womb-retune/matrix-225.txt, tools/_smallSwell.ts)
// re-measured here on the game's field (coast-seeded, the take-off moved to the real shelf) at its ends: the smallest band
// that stands up (Fun, at Low only: ruled not offered), the smallest offered (Solid) and the biggest (Huge).

/** Re-pinned 2026-10-14 (womb-story Task 1, Fable's STOP 0 ruling: the drop past ledgeWallM): the first leg breaks to its
 * wall's end and fizzles, so "all broken" (72/72) is gone by design. Re-pinned again 2026-10-14 (Tasks 2-3c, STOP 1
 * rulings 1, 2, 7): the right at rightLedgeDepthM 8 no longer breaks first and pulls the tip's turn, so the first leg's
 * start moved off the matrix (Solid +0.5 m by 1.97 s); the median hollow reads the segment targets (A 0.8, B/C 0.1).
 * Measured by tools/_smallSwellPin.ts: [label, tide, broken, of, start s, peel m/s, hollow]. The select's offers
 * (sessionSetup.BREAKS, hand-written) are unchanged. */
const STORY: readonly (readonly [string, number, number, number, number, number, number])[] = [
  ['Fun', -0.5, 44, 72, 1.24, 8.96, 0.230], ['Solid', -0.5, 52, 72, 0.06, 11.16, 0.135], ['Solid', 0.5, 48, 72, 2.57, 11.70, 0.100], ['Huge', 0.5, 55, 72, -0.52, 11.90, 0.250],
];

describe('the select matrix holds on the game field (womb-retune Task 4)', () => {
  it.each([
    ['Fun', -0.5], ['Solid', -0.5], ['Solid', 0.5], ['Huge', 0.5],
  ] as const)('%s at tide %f m: the first leg as the matrix says', (label, tideM) => {
    const b = SWELL_BANDS.find((x) => x.label === label)!;
    const first = leftStretches(coastReefField({ periodS: b.periodS, tideM }), setWaveHeight(b.ft), NORTH_LEDGE, { first: [0] }, P).first!;
    const [, , broken, of, start, peel, hollow] = STORY.find(([l, t]) => l === label && t === tideM)!;
    expect(first.broken).toBe(broken);
    expect(first.of).toBe(of);
    expect(Math.abs(first.start - start)).toBeLessThanOrEqual(0.05 + 0.01);
    expect(Math.abs(first.peel - peel)).toBeLessThanOrEqual(0.05 + 0.01);
    expect(Math.abs(first.hollow - hollow)).toBeLessThanOrEqual(0.005 + 0.001);
  }, 600_000);
});
