import { describe, expect, it } from 'vitest';
import { CLEAN_TUBE, FACE_FOAM_PHASE, FRINGE_WIDTH, curlFoamAt } from './curlFoam';

describe('curlFoam: the lip with photo 5\'s timing (whitewater §3.4)', () => {
  it('keeps the lip\'s face clean before the tube caves in (face foam 0 before phase 1.2)', () => {
    for (const ph of [0.5, 0.8, 1.0, 1.19]) expect(curlFoamAt(ph, 0.5, 0, 1), `phase ${ph}`).toBe(0);
    expect(FACE_FOAM_PHASE[0]).toBe(1.2);
  });

  it('whitens the tip\'s edge from the throw: a thin fringe', () => {
    expect(curlFoamAt(0.8, 0.02, 0, 1)).toBeGreaterThanOrEqual(0.9);
    expect(curlFoamAt(0.8, FRINGE_WIDTH, 0, 1)).toBe(0);
    expect(curlFoamAt(0.3, 0.02, 0, 1)).toBe(0);
  });

  it('hides the sheet\'s foam inside the open tube, and lets it back as the tube caves in', () => {
    expect(curlFoamAt(1.0, 0.5, 1, 1)).toBeCloseTo(-CLEAN_TUBE, 12);
    expect(curlFoamAt(1.5, 0.5, 1, 1)).toBeGreaterThanOrEqual(0);
  });

  it('climbs the lip\'s face from the tip as the tube caves in', () => {
    expect(curlFoamAt(1.5, 0.2, 0, 1)).toBeGreaterThan(curlFoamAt(1.5, 0.8, 0, 1));
    expect(curlFoamAt(1.5, 0.2, 0, 1)).toBeGreaterThan(0.5);
  });

  it('is 0 where the curl is 0 (gap rows and cut ends carry curl 0)', () => {
    for (const ph of [0.8, 1.0, 1.5]) for (const inside of [0, 1]) expect(Math.abs(curlFoamAt(ph, 0.02, inside, 0))).toBe(0);
  });
});
