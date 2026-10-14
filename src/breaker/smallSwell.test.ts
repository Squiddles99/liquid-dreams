import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NORTH_LEDGE } from '../seabed/wombReef';
import { SWELL_BANDS } from '../frontend/sessionSetup';
import { DEFAULT_BREAK_PARAMS as P } from './breaking';
import { leftStretches, setWaveHeight } from './reefReport';
import { coastReefField } from './testField';

// The select screen's matrix (womb-retune Task 4: docs/superpowers/evidence/womb-retune/matrix-225.txt, tools/_smallSwell.ts)
// re-measured here on the game's field (coast-seeded, the take-off moved to the real shelf) at its ends: the smallest band
// that stands up (Fun, at Low only: ruled not offered), the smallest offered (Solid) and the biggest (Huge).
const MATRIX = readFileSync(resolve(__dirname, '../../docs/superpowers/evidence/womb-retune/matrix-225.txt'), 'utf8');
/** The matrix's row for band × tide: [broken, of, start s, peel m/s, hollow]. */
function row(label: string, tideM: number): number[] {
  const line = MATRIX.split('\n').find((l) => l.startsWith(label) && Number(l.split('|')[1]) === tideM)!;
  const [broken, of] = line.split('|')[3].split(',')[0].trim().split('/').map(Number);
  return [broken, of, ...line.split('|')[3].split(',').slice(1, 4).map(Number)];
}

/** Re-pinned 2026-10-14 (womb-story Task 1, Fable's STOP 0 ruling: the drop past ledgeWallM, the hollow share on B): the
 * first leg now breaks to its wall's end and fizzles, so "all broken" (72/72) is gone by design and the median hollow reads
 * B's peel. Measured by tools/_smallSwellPin.ts: [label, tide, broken, of, peel m/s, hollow]. The start (the tip's break)
 * still reads the matrix; the select's offers (sessionSetup.BREAKS, hand-written) are unchanged. */
const STORY: readonly (readonly [string, number, number, number, number, number])[] = [
  ['Fun', -0.5, 44, 72, 8.98, 0.467], ['Solid', -0.5, 52, 72, 11.15, 0.457], ['Solid', 0.5, 48, 72, 10.01, 0.451], ['Huge', 0.5, 55, 72, 11.90, 0.537],
];

describe('the select matrix holds on the game field (womb-retune Task 4)', () => {
  it.each([
    ['Fun', -0.5], ['Solid', -0.5], ['Solid', 0.5], ['Huge', 0.5],
  ] as const)('%s at tide %f m: the first leg as the matrix says', (label, tideM) => {
    const b = SWELL_BANDS.find((x) => x.label === label)!;
    const first = leftStretches(coastReefField({ periodS: b.periodS, tideM }), setWaveHeight(b.ft), NORTH_LEDGE, { first: [0] }, P).first!;
    const start = row(label, tideM)[2], [, , broken, of, peel, hollow] = STORY.find(([l, t]) => l === label && t === tideM)!;
    expect(first.broken).toBe(broken);
    expect(first.of).toBe(of);
    expect(Math.abs(first.start - start)).toBeLessThanOrEqual(0.05 + 0.01);
    expect(Math.abs(first.peel - peel)).toBeLessThanOrEqual(0.05 + 0.01);
    expect(Math.abs(first.hollow - hollow)).toBeLessThanOrEqual(0.005 + 0.001);
  }, 600_000);
});
