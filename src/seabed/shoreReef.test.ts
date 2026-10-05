import { describe, expect, it } from 'vitest';
import { bedMaterialAt, buildBathymetry } from './bathymetry';
import { SHORE_X } from './coastProfile';
import { OPEN_COAST_MATERIAL, SHORE_REEF_AT_MAP_M, SHORE_REEF_MATERIAL, shoreReefWeight, shoreReefWidth } from './shoreReef';
import { SHELF_INNER_X } from './wombReef';

describe('the shore reef platform (Andrew, 2026-09-28: the reef goes all the way into the shore)', () => {
  it('is 50–90 m wide along the coast, varying smoothly, and SHORE_REEF_AT_MAP_M along the reef map (where the reef\'s shelf meets it)', () => {
    let lo = Infinity, hi = -Infinity;
    for (let z = -15000; z <= 15000; z += 7) { if (z > -700 && z < 550) continue; const w = shoreReefWidth(z); lo = Math.min(lo, w); hi = Math.max(hi, w); }
    for (let z = -450; z <= 300; z += 5) expect(shoreReefWidth(z)).toBeCloseTo(SHORE_REEF_AT_MAP_M, 5); // along the reef map
    expect(lo).toBeGreaterThanOrEqual(50); expect(hi).toBeLessThanOrEqual(90); expect(hi - lo).toBeGreaterThan(20);
    for (let z = 0; z < 3000; z += 13) expect(Math.abs(shoreReefWidth(z + 1) - shoreReefWidth(z))).toBeLessThan(1);
  });
  it('is the whole seabed at the waterline and none of it well beyond its width', () => {
    for (const z of [-9000, -75, 2500]) {
      expect(shoreReefWeight(0, z)).toBe(1);
      expect(shoreReefWeight(shoreReefWidth(z) + 20, z)).toBe(0);
    }
  });
  it('turns the sand in front of the beach to weedy rock, inside the reef map and outside it; leaves the peak alone', () => {
    const b = buildBathymetry();
    const [sandIn, weedIn] = bedMaterialAt(b, SHORE_X - 10, -20); // the inner shelf, 10 m off the beach (inside the map)
    expect(sandIn).toBeLessThan(0.2); expect(weedIn).toBeGreaterThan(0.6);
    const [sandOut] = bedMaterialAt(b, SHORE_X - 10, 3000); // outside the map, open sand today
    expect(sandOut).toBeLessThan(0.2);
    const peak = bedMaterialAt(b, 0, 0), peakNoShore = bedMaterialAt(b, 0, 0, undefined, false);
    expect(peak).toEqual(peakNoShore);
    expect(SHORE_REEF_MATERIAL[0] + SHORE_REEF_MATERIAL[1]).toBeLessThanOrEqual(1);
  });
  it('the open coast beyond the platform is mostly weedy rock, not pure sand (the reef reads dark; the turquoise is foam)', () => {
    const b = buildBathymetry();
    const [sand, weed] = bedMaterialAt(b, -200, 5000); // 400 m offshore, outside the reef map
    expect([sand, weed]).toEqual([OPEN_COAST_MATERIAL[0], OPEN_COAST_MATERIAL[1]]);
    expect(sand).toBeLessThan(0.4);
    // No sand gap between the reef map's shelf (SHELF_INNER_X) and the platform, anywhere along the map's inshore edge.
    for (let z = -440; z <= 290; z += 10) expect(bedMaterialAt(b, SHELF_INNER_X + 5, z)[0]).toBeLessThan(0.5);
  });
    it('landward of the waterline the bed is sand (the swash runs up the beach)', () => {
      const b = buildBathymetry();
      expect(bedMaterialAt(b, SHORE_X + 5, 3000)).toEqual([1, 0]);
      expect(bedMaterialAt(b, SHORE_X - 5, 3000)[0]).toBeLessThan(0.2); // just seaward: the weedy platform
    });
});
