import { describe, expect, it } from 'vitest';
import { bedMaterialAt, buildBathymetry } from './bathymetry';
import { OPEN_COAST_MATERIAL, SHORE_REEF_MATERIAL, shoreReefWeight, shoreReefWidth } from './shoreReef';

describe('the shore reef platform (Andrew, 2026-09-28: the reef goes all the way into the shore)', () => {
  it('is 50–90 m wide (reaching the own weedy shelf of the reef map, which ends about 80 m off the beach), varying smoothly along the coast', () => {
    let lo = Infinity, hi = -Infinity;
    for (let z = -15000; z <= 15000; z += 7) { if (z > -700 && z < 550) continue; const w = shoreReefWidth(z); lo = Math.min(lo, w); hi = Math.max(hi, w); }
    for (let z = -450; z <= 300; z += 5) expect(shoreReefWidth(z)).toBeGreaterThanOrEqual(90); // along the reef map
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
    const [sandIn, weedIn] = bedMaterialAt(b, 180, -20); // the inner shelf, 10 m off the beach (inside the map)
    expect(sandIn).toBeLessThan(0.2); expect(weedIn).toBeGreaterThan(0.6);
    const [sandOut] = bedMaterialAt(b, 180, 3000); // outside the map, open sand today
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
    // No sand gap between the reef map's shelf (ends ~x 110) and the platform, anywhere along the map's inshore edge.
    for (let z = -440; z <= 290; z += 10) expect(bedMaterialAt(b, 115, z)[0]).toBeLessThan(0.5);
  });
    it('landward of the waterline the bed is sand (the swash runs up the beach)', () => {
      const b = buildBathymetry();
      expect(bedMaterialAt(b, 195, 3000)).toEqual([1, 0]);
      expect(bedMaterialAt(b, 185, 3000)[0]).toBeLessThan(0.2); // just seaward: the weedy platform
    });
});
