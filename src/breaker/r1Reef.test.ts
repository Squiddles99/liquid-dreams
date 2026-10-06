import { describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE } from '../seabed/wombReef';
import { FAR_DEPTH_M, REEF_SURROUND_DEPTH_M, depthBg } from '../seabed/coastProfile';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from './reefField';
import { leftStretches, setWaveHeight } from './reefReport';

// Spec 2026-10-06-r1-the-ride §1: the basin at one depth from the far field to the face, so the swell arrives unbent and
// the first section peels 9–11 m/s, hollow.
const bed = downsample(buildBathymetry(), 2);
const mid = computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: 0, smooth: true, refractFloorM: REFRACT_FLOOR_M });

describe('the basin (R1 §1)', () => {
  it('is one depth from the map edge to the face', () => {
    expect(FAR_DEPTH_M).toBe(15);
    expect(REEF_SURROUND_DEPTH_M).toBe(15);
    for (const s of [150, 260, 400, 494]) expect(depthBg(94 - s)).toBeCloseTo(15, 5);
  });
  it('the swell reaches the basin unbent (travel bearing 45° ± 5° at (−30, 30))', () => {
    const f = sampleField(mid, -30, 30);
    const bearing = (Math.atan2(f.dirX, -f.dirZ) * 180) / Math.PI;
    expect(Math.abs(bearing - 45)).toBeLessThanOrEqual(5);
  });
  it.each([6, 8])('%i ft, mid tide: the first section peels 9–11 m/s and is hollow (≥ 0.8)', (ft) => {
    const st = leftStretches(mid, setWaveHeight(ft), NORTH_LEDGE, { first: [0], second: [1] }, DEFAULT_BREAK_PARAMS);
    expect(st.first, 'first section breaks').not.toBeNull();
    expect(st.first!.peel).toBeGreaterThanOrEqual(9);
    expect(st.first!.peel).toBeLessThanOrEqual(11);
    expect(st.first!.hollow).toBeGreaterThanOrEqual(0.8);
  });
});
