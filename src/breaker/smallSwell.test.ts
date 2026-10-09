import { describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_BREAK_PARAMS as P, breakingRatio } from './breaking';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from './reefField';
import { leftStretches, setWaveHeight } from './reefReport';

// Plan 2026-10-09-small-swell-low-tide Task 2: the shallow breaking floor (3 → 2 m) lets a small set stand up at low
// tide; the big sets do not move. Main's reef, 2 m grid, smooth, refractFloorM (as the game bakes it).
const bed = downsample(buildBathymetry(), 2);
const field = (periodS: number, tideM: number) =>
  computeReefField({ bed, periodS, fromDeg: 225, tideM, smooth: true, refractFloorM: REFRACT_FLOOR_M });
const legs = (f: ReturnType<typeof computeReefField>, ft: number) =>
  leftStretches(f, setWaveHeight(ft), NORTH_LEDGE, { first: [0], second: [1] }, P);

describe('a small set at low tide (small-swell Task 2)', () => {
  it('3.5 ft, 13 s, tide −0.5 (the select’s Low): the first leg breaks all along, peels 9–12 m/s; the second leg peels forward', () => {
    const st = legs(field(13, -0.5), 3.5);
    expect(st.first, 'first leg breaks').not.toBeNull();
    expect(st.first!.broken).toBe(st.first!.of);
    expect(st.first!.of).toBe(28);
    expect(st.first!.peel).toBeGreaterThanOrEqual(9);
    expect(st.first!.peel).toBeLessThanOrEqual(12);
    expect(st.second, 'second leg breaks').not.toBeNull();
    expect(st.second!.peel).toBeGreaterThan(0);
    expect(st.second!.peel).toBeLessThan(20);
  }, 300_000);
  it('3.5 ft, 13 s, tide −0.8 (the clamped minimum): it stands up at the take-off, or the first leg starts by 0.5 s', () => {
    const f = field(13, -0.8), s = sampleField(f, 0, 0);
    const ratio = breakingRatio(setWaveHeight(3.5) * s.amp, s.hminBreak, P);
    const start = legs(f, 3.5).first?.start ?? Infinity;
    expect(ratio >= 1 || start <= 0.5, `ratio ${ratio.toFixed(2)}, start ${start.toFixed(2)} s`).toBe(true);
  }, 300_000);
});

describe('the big sets do not move (small-swell Task 2; pinned from one-curl t3-reef.txt, mid tide, 15 s)', () => {
  const mid = field(15, 0);
  it.each([
    [6, -0.1, 11.4, 0.76],
    [8, -0.7, 11.3, 1.0],
    [12, -0.7, 11.7, 1.0],
  ])('%i ft: first-leg start %f s, peel %f m/s, hollow %f', (ft, start, peel, hollow) => {
    const st = legs(mid, ft).first!;
    expect(Math.abs(st.start - start)).toBeLessThanOrEqual(0.1 + 0.05);
    expect(Math.abs(st.peel - peel)).toBeLessThanOrEqual(0.2 + 0.05);
    expect(Math.abs(st.hollow - hollow)).toBeLessThanOrEqual(0.02 + 0.005);
  }, 300_000);
});
