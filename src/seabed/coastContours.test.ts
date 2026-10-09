import { describe, expect, it } from 'vitest';
import { COAST_CONTOURS, contourDepthAt, contourXAt } from './coastContours';

describe('the outer shelf\'s traced contours (lineup truth, Task 0)', () => {
  it('has the 10–30 m contours, each with at least 12 points spanning the coast map\'s z range', () => {
    const depths = COAST_CONTOURS.map((c) => c.depthM);
    for (const d of [10, 15, 20, 25, 30]) expect(depths).toContain(d);
    for (const c of COAST_CONTOURS) {
      expect(c.points.length).toBeGreaterThanOrEqual(12);
      const zs = c.points.map((p) => p[1]);
      expect(Math.min(...zs)).toBeLessThanOrEqual(-2100);
      expect(Math.max(...zs)).toBeGreaterThanOrEqual(1400);
    }
  });

  it('keeps every contour west of the one shallower than it, all along the coast (no line crosses another)', () => {
    for (let z = -2100; z <= 1400; z += 10) {
      for (let i = 1; i < COAST_CONTOURS.length; i++) {
        expect(contourXAt(COAST_CONTOURS[i], z)).toBeLessThan(contourXAt(COAST_CONTOURS[i - 1], z) - 5);
      }
    }
  });

  it('deepens offshore at the Womb, Lefthanders and Ellensbrook', () => {
    for (const z of [0, -1666, 1080]) {
      let prev = -Infinity, seen = 0;
      for (let x = -400; x >= -2400; x -= 5) {
        const d = contourDepthAt(x, z);
        if (d === null) continue;
        expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = d; seen++;
      }
      expect(seen).toBeGreaterThan(50);
    }
  });

  it('puts the 10 m line 350–550 m west of the Womb and the 20 m line at 650–900 m (image 8)', () => {
    const at = (depth: number): number => {
      for (let x = -200; x >= -2000; x -= 1) {
        const d = contourDepthAt(x, 0);
        if (d !== null && d >= depth) return x;
      }
      return NaN;
    };
    expect(at(10)).toBeGreaterThanOrEqual(-550);
    expect(at(10)).toBeLessThanOrEqual(-350);
    expect(at(20)).toBeGreaterThanOrEqual(-900);
    expect(at(20)).toBeLessThanOrEqual(-650);
  });

  it('is null inshore of the 10 m line and beyond the outermost contour, and exact on a contour', () => {
    expect(contourDepthAt(0, 0)).toBeNull();
    expect(contourDepthAt(-6000, 0)).toBeNull();
    for (const c of COAST_CONTOURS) {
      const [x, z] = c.points[5];
      expect(contourDepthAt(x, z)).toBeCloseTo(c.depthM, 6);
    }
  });
});

describe('the coast\'s waterline table', () => {
  it('follows the land\'s waterline (LandHeight.waterlineAt) within 2 m (half a coast cell)', async () => {
    const { decodeLandFile } = await import('../land/landData');
    const { readBakedLand } = await import('../land/bakedLand.testutil');
    const { LandHeight } = await import('../land/landHeight');
    const { waterlineX } = await import('./coastContours');
    const land = new LandHeight(decodeLandFile(readBakedLand()));
    let worst = 0;
    for (let z = -2100; z <= 1400; z += 4) worst = Math.max(worst, Math.abs(waterlineX(z) - land.waterlineAt(z)));
    expect(worst).toBeLessThan(2);
  });
});
