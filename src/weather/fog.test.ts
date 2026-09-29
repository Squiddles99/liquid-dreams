import { describe, expect, it } from 'vitest';
import { CLEAR_VISIBILITY_KM, exposureCloudStops, fogExtinctionPerM, fogOpticalDepth } from './fog';

describe('fogExtinctionPerM (Koschmieder)', () => {
  it("leaves a 2% contrast at the visibility distance, together with the clear air's own haze", () => {
    const clearAir = 3.912 / (CLEAR_VISIBILITY_KM * 1000);
    for (const km of [0.5, 1, 5, 20]) expect(Math.exp(-(fogExtinctionPerM(km) + clearAir) * km * 1000)).toBeCloseTo(0.02, 4);
  });

  it('adds nothing at the clear-air visibility (the atmosphere already has its own haze)', () => {
    expect(fogExtinctionPerM(60)).toBe(0);
    expect(fogExtinctionPerM(30)).toBeGreaterThan(0);
  });
});

describe('fogOpticalDepth', () => {
  it('is sigma·distance along the water, and thins going up through a shallow layer', () => {
    expect(fogOpticalDepth(0, 0, 500, 0.004, 60)).toBeCloseTo(2, 9);
    const up = fogOpticalDepth(0, 0.5, 500, 0.004, 60);
    expect(up).toBeLessThan(0.2);
    expect(up).toBeCloseTo(0.004 * 20 / 0.5, 3); // all of a 20 m scale height, seen at 30°
  });

  it('is continuous as the ray turns horizontal', () => {
    const flat = fogOpticalDepth(2, 0, 1000, 0.001, 1500);
    expect(fogOpticalDepth(2, 1e-9, 1000, 0.001, 1500)).toBeCloseTo(flat, 7);
    expect(fogOpticalDepth(2, -1e-9, 1000, 0.001, 1500)).toBeCloseTo(flat, 7);
    expect(fogOpticalDepth(2, 1e-4, 1000, 0.001, 1500)).toBeCloseTo(flat, 3);
  });

  it('is thinner from higher up', () => {
    expect(fogOpticalDepth(40, 0, 1000, 0.004, 60)).toBeLessThan(fogOpticalDepth(1, 0, 1000, 0.004, 60) * 0.3);
  });
});

describe('exposureCloudStops', () => {
  it('opens up two-thirds of the way under cloud, and not at all under a clear sky', () => {
    expect(exposureCloudStops(10, 10)).toBe(0);
    expect(exposureCloudStops(16, 2)).toBeCloseTo((2 / 3) * 3, 12);
    expect(exposureCloudStops(16, 2, 1)).toBeCloseTo(3, 12);
    expect(exposureCloudStops(10, 0)).toBeLessThan(40);
  });
});
