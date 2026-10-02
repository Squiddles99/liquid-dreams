import { describe, it } from 'vitest';
import { computeReefField } from '../breaker/reefField';
import { TIDES, type Tide, evaluateReef, formatCard, rayProfile } from '../breaker/reefReport';
import { buildBathymetry, downsample } from './bathymetry';
import { NORTH_LEDGE } from './wombReef';

const BASELINE_OUT: string = import.meta.env.VITE_REEF_BASELINE_OUT ?? '';
// node:fs through a computed specifier: the project's typecheck has no Node types, and this only runs under Vitest.
const nodeFs = (): Promise<{ writeFileSync(p: string, d: string): void; readFileSync(p: string, e: 'utf8'): string }> => import(/* @vite-ignore */ ['node', 'fs'].join(':'));

/** The point 40 m up the north ledge from the peak: the second drawn ray starts here. */
export const NORTH_RAY_START: readonly [number, number] = (() => {
  const [a, b] = NORTH_LEDGE, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [a[0] + ((b[0] - a[0]) * 40) / len, a[1] + ((b[1] - a[1]) * 40) / len] as const;
})();

/** The reef as built now: depth along the two rays and its scorecard (the drawing's "before"). */
export function reefSnapshot() {
  const bathy = buildBathymetry(), bed = downsample(bathy, 2);
  const fields = Object.fromEntries((Object.keys(TIDES) as Tide[]).map((t) => [t, computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: TIDES[t] })])) as Record<Tide, ReturnType<typeof computeReefField>>;
  const card = evaluateReef(fields);
  return { peakRay: rayProfile(bathy, fields.mid, 0, 0), northRay: rayProfile(bathy, fields.mid, NORTH_RAY_START[0], NORTH_RAY_START[1]), card, text: formatCard(card) };
}

describe.skipIf(!BASELINE_OUT)('the reef before build A (plan 2026-10-02 Task 1)', () => {
  it('dumps the softened ramp’s rays and scorecard', { timeout: 600_000 }, async () => {
    const fs = await nodeFs();
    fs.writeFileSync(BASELINE_OUT, JSON.stringify(reefSnapshot()));
  });
});
