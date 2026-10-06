import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from '../breaker/reefField';
import { setWaveHeight } from '../breaker/reefReport';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { TAKEOFF_ARRIVE_S, TAKEOFF_SEAWARD_M, takeoffBreak, takeoffLeadS, takeoffSpot } from './takeoff';

const bed = downsample(buildBathymetry(), 2);
const field = computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: 0, smooth: true, refractFloorM: REFRACT_FLOOR_M });

describe('the takeoff spot and lead (R1 §3)', () => {
  it.each([6, 8, 12])('%i ft: the spot is TAKEOFF_SEAWARD_M outside the first break, in 6–16 m of water', (ft) => {
    // The first break on the take-off's own ray (through TAKEOFF_ANCHOR), not the peak's (reefReport.firstBreakDepth), 40 m
    // north of it.
    const H = setWaveHeight(ft), spot = takeoffSpot(field, H, DEFAULT_BREAK_PARAMS), fb = takeoffBreak(field, H, DEFAULT_BREAK_PARAMS)!;
    expect(fb, 'breaks on the take-off ray').not.toBeNull();
    const d = Math.hypot(spot.x - fb.x, spot.z - fb.z);
    expect(d).toBeGreaterThanOrEqual(TAKEOFF_SEAWARD_M - 1.5);
    expect(d).toBeLessThanOrEqual(TAKEOFF_SEAWARD_M + 1.5);
    const depth = sampleField(field, spot.x, spot.z).depth;
    expect(depth).toBeGreaterThanOrEqual(6);
    expect(depth).toBeLessThanOrEqual(16);
  });
  it('the lead puts the crest at the spot TAKEOFF_ARRIVE_S after the start', () => {
    const spot = takeoffSpot(field, setWaveHeight(6), DEFAULT_BREAK_PARAMS);
    const lead = takeoffLeadS(field, spot);
    // start = arrival − lead; the crest reaches the spot at arrival + tau(spot); so tau(spot) − (−lead) = TAKEOFF_ARRIVE_S
    expect(sampleField(field, spot.x, spot.z).tau + lead).toBeCloseTo(TAKEOFF_ARRIVE_S, 3);
    expect(lead).toBeGreaterThan(TAKEOFF_ARRIVE_S); // the spot is seaward of the peak
  });
});
