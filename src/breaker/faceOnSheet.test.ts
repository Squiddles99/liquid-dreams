import { afterEach, describe, expect, it } from 'vitest';
import { STOOD_PHASE, SECTION_CREST, type SectionNumbers, sectionOf, sectionSamples, setFaceOnSheet } from './wombSection';

// Andrew 2026-10-14 (moment 1791986608, standAheadM 20): "there is seemingly still 2 waves going on! there should not be this
// crest between the lip and the drain". The drawn face of a section waiting its turn stood near vertical (2.2 m to -1.0 m in
// 1 m) while the sheet under it can lean its front over ~4 m: the sheet stood 0.9-3.3 m above the drawn face in front of the
// crest and showed through as a second crest (tools/_lumpProbe.ts --layers). faceOnSheet: in front of a waiting section's
// crest the drawn surface never stands below the sheet at its home (one surface; the broken lip keeps its own).
afterEach(() => setFaceOnSheet(0));

/** A sheet along n: a gentle front, still 1.5 m up 3 m ahead of the crest (where the drawn face is long gone down). */
const gentle = (u: number): [number, number] => [u, u <= 0 ? 2.2 : Math.max(-1.2, 2.2 - 0.35 * u)];
const nums = (phase: number): SectionNumbers => ({ A: 2.6, phase, hollow: 0.3, rho: 1, surge: 0 });
const crestU = (n: SectionNumbers) => n.A * sectionSamples(n, gentle).knots[SECTION_CREST][0];

describe('the drawn face of a waiting section never stands below the sheet in front of its crest (faceOnSheet)', () => {
  it('today (off): the stood face falls below the gentle sheet in front (the second crest)', () => {
    const n = nums(STOOD_PHASE), s = sectionOf(n, gentle), c = crestU(n);
    const under = Math.max(...s.points.map((p, j) => (p[0] > c ? gentle(s.homes[j])[1] - p[1] : 0)));
    expect(under).toBeGreaterThan(0.3);
  });
  it('on: a waiting section (phase <= the stood wall) stands at least at the sheet in front of its crest; behind it, unchanged', () => {
    for (const phase of [0.15, 0.3, STOOD_PHASE]) {
      const n = nums(phase), off = sectionOf(n, gentle);
      setFaceOnSheet(1);
      const on = sectionOf(n, gentle), c = crestU(n);
      setFaceOnSheet(0);
      on.points.forEach((p, j) => {
        if (p[0] > c) expect(p[1], `phase ${phase} u ${p[0].toFixed(2)}`).toBeGreaterThanOrEqual(gentle(on.homes[j])[1] - 1e-9);
        else expect(p).toEqual(off.points[j]);
      });
    }
  });
  it('on: the broken lip (phase 0.8 and the round barrel) keeps its own drawing, bit-equal', () => {
    for (const phase of [0.8, 1.0, 1.4]) {
      const n = nums(phase), off = sectionOf(n, gentle);
      setFaceOnSheet(1);
      expect(sectionOf(n, gentle).points).toEqual(off.points);
      setFaceOnSheet(0);
    }
  });
});
