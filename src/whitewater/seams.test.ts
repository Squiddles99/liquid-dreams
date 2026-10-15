import { describe, expect, it } from 'vitest';
import { FOAM_TICK_S } from './foamStep';
import { SEAM_TABLE, lookWeights, seamSpanS } from './seams';

describe('the seams (breaking-look item 6): one timeline per station, overlaps and never gaps', () => {
  it('the table: curtain eroded over [0.2, 0.85] s after landing, the impact [0.2, 0.55] s', () => {
    expect(SEAM_TABLE.curtain[0]).toBeCloseTo(0.2, 9);
    expect(SEAM_TABLE.curtain[1]).toBeCloseTo(0.85, 9);
    expect(SEAM_TABLE.impact[0]).toBeCloseTo(0.2, 9);
    expect(SEAM_TABLE.impact[1]).toBeCloseTo(0.55, 9);
  });

  it('the bar: the looks after landing (curtain, impact, solid boil, lace) sum to >= 0.9 at every 20 Hz tick to the hand-back', () => {
    let worst = Infinity, at = '';
    for (const H of [1.2, 2, 3, 4.5]) for (const T of [12, 14, 15]) {
      const span = seamSpanS(H, T);
      for (let t = 0; t <= span; t += FOAM_TICK_S) {
        const w = lookWeights(t, H, T), sum = w.curtain + w.impact + w.solid + w.lace;
        // The volume and the lace share the foam (solid + lace = 1): the seam that can gap is the landing's (curtain → boil).
        const landing = w.curtain + w.impact + w.solid;
        const v = t < SEAM_TABLE.curtain[1] + 0.5 ? landing : sum;
        if (v < worst) { worst = v; at = `H ${H} T ${T} t ${t.toFixed(2)}`; }
      }
    }
    expect(worst, at).toBeGreaterThanOrEqual(0.9);
  });
});
