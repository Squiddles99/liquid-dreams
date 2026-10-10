import { describe, expect, it } from 'vitest';
import { CLEAN_TUBE, FACE_FOAM_PHASE, FRINGE_WIDTH, curlFoamAt, packInnerFringe, tipFringeAt, unpackFringe, unpackInner } from './curlFoam';

describe('curlFoam: the lip with photo 5\'s timing (whitewater §3.4)', () => {
  it('keeps the lip\'s face clean before the tube caves in (face foam 0 before phase 1.2)', () => {
    for (const ph of [0.5, 0.8, 1.0, 1.19]) expect(curlFoamAt(ph, 0.5, 0, 1), `phase ${ph}`).toBe(0);
    expect(FACE_FOAM_PHASE[0]).toBe(1.2);
  });

  it('hides the sheet\'s foam inside the open tube, and lets it back as the tube caves in', () => {
    expect(curlFoamAt(1.0, 0.5, 1, 1)).toBeCloseTo(-CLEAN_TUBE, 12);
    expect(curlFoamAt(1.5, 0.5, 1, 1)).toBeGreaterThanOrEqual(0);
  });

  it('climbs the lip\'s face from the tip as the tube caves in', () => {
    expect(curlFoamAt(1.5, 0.2, 0, 1)).toBeGreaterThan(curlFoamAt(1.5, 0.8, 0, 1));
    expect(curlFoamAt(1.5, 0.2, 0, 1)).toBeGreaterThan(0.5);
  });

  it('carries no fringe of its own (the tip\'s fringe is tipFringeAt, F2), and is 0 where the curl is 0', () => {
    expect(curlFoamAt(0.8, 0.02, 0, 1)).toBe(0);
    for (const ph of [0.8, 1.0, 1.5]) for (const inside of [0, 1]) expect(Math.abs(curlFoamAt(ph, 0.02, inside, 0))).toBe(0);
  });
});

describe('tipFringeAt: the tip\'s own thin white band (whitewater F2)', () => {
  it('is half the old width (0.06 of the reach) and solid at the tip from the throw', () => {
    expect(FRINGE_WIDTH).toBe(0.06);
    expect(tipFringeAt(0.8, 0.01, 1)).toBeGreaterThanOrEqual(0.9);
    expect(tipFringeAt(0.8, FRINGE_WIDTH, 1)).toBe(0);
    expect(tipFringeAt(0.3, 0.01, 1)).toBe(0);
  });
  it('is only on the lip\'s own samples (tip → crest), never past the tip into the tube', () => {
    expect(tipFringeAt(0.8, 0.01, 0)).toBe(0);
  });
  it('travels in the normal buffer\'s .w beside the inner flag without changing the flag\'s 0.5 test', () => {
    for (const inner of [0, 1]) for (const f of [0, 0.3, 1]) {
      const w = packInnerFringe(inner, f);
      expect(w > 0.5).toBe(inner === 1);
      expect(unpackInner(w)).toBe(inner);
      expect(unpackFringe(w)).toBeCloseTo(inner === 1 ? f : 0, 12);
    }
  });
});
