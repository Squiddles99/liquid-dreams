import { describe, expect, it } from 'vitest';
import { CURVE_SAMPLES, type P2, profileCurve } from './wombProfile';
import {
  type SectionInput, SECTION_HAND_BACK_S, STOOD_PHASE, collapseSpan, flightTime, interiorWeight, sectionEnd, sectionPhase, sectionScale, sectionWeight, tubeHold,
  wombSection,
} from './wombSection';

const P = { ribbonOnset: 0.6 };
const at = (H: number, tb: number | null, r = 1.2, periodS = 15, psi = 0.09): SectionInput => ({ H, r, tb, psi, periodS });
const flat = (u: number): P2 => [u, 0];

describe('wombSection: a station as the Womb profile family', () => {
  it('runs its phase forward in time: standing up with the ratio, pitching at onset, the barrel, the hold, the collapse', () => {
    expect(sectionPhase(at(4, null, 0.5), P)).toBe(0);
    expect(sectionPhase(at(4, null, 1), P)).toBeCloseTo(STOOD_PHASE, 12);
    expect(sectionPhase(at(4, 0), P)).toBeCloseTo(STOOD_PHASE, 12);
    let last = -1;
    for (let t = 0; t <= sectionEnd(4, 15) + 1; t += 0.05) {
      const ph = sectionPhase(at(4, t), P);
      expect(ph).toBeGreaterThanOrEqual(last);
      last = ph;
    }
    expect(sectionPhase(at(4, flightTime(4) + 0.5 * tubeHold(4, 15)), P)).toBe(1);
    expect(last).toBe(2);
    expect(sectionPhase(at(4, Infinity), P)).toBe(2);
  });

  it('holds the tube longer and collapses slower for a bigger, longer-period wave (Andrew, 2026-10-05)', () => {
    expect(tubeHold(6, 15)).toBeGreaterThan(tubeHold(2, 15));
    expect(tubeHold(4, 17)).toBeGreaterThan(tubeHold(4, 11));
    expect(collapseSpan(6, 15)).toBeGreaterThan(collapseSpan(2, 15));
    expect(collapseSpan(4, 17)).toBeGreaterThan(collapseSpan(4, 11));
  });

  it('weighs in from the sheet as the wave stands up and back out after the white-water wall', () => {
    expect(sectionWeight(at(4, null, 0.5), P)).toBe(0);
    expect(sectionWeight(at(4, null, 1), P)).toBe(1);
    expect(sectionWeight(at(4, sectionEnd(4, 15)), P)).toBe(1);
    expect(sectionWeight(at(4, sectionEnd(4, 15) + SECTION_HAND_BACK_S), P)).toBe(0);
    expect(sectionWeight(at(4, Infinity), P)).toBe(0);
  });

  it('on a flat sea is the approved curve, A to the metre, front edge first', () => {
    for (const tb of [null, 0, 0.6, 3]) {
      const s = wombSection(at(5, tb), flat, P), { A, phase, hollow } = s.numbers;
      const c = profileCurve(phase, hollow);
      expect(s.points).toHaveLength(CURVE_SAMPLES);
      s.points.forEach((p, i) => {
        const [u, y] = c[CURVE_SAMPLES - 1 - i], w = s.numbers.rho * interiorWeight(u);
        expect(p[0]).toBeCloseTo(A * u, 9);
        expect(p[1]).toBeCloseTo(A * y * w, 9);
      });
      expect(s.points[0][0]).toBeGreaterThan(s.points[CURVE_SAMPLES - 1][0]);
    }
    expect(sectionScale(5.2)).toBeCloseTo(4, 12);
  });

  it('is the sheet at its ends, whatever the sheet does there', () => {
    const swell = (u: number): P2 => [u + 0.3 * Math.sin(u / 9), 1.4 * Math.cos(u / 14)];
    const s = wombSection(at(5, 0.4), swell, P);
    for (const [i, u] of [[0, 7 * s.numbers.A], [CURVE_SAMPLES - 1, -7 * s.numbers.A]]) {
      const S = swell(u);
      expect(s.points[i][0]).toBeCloseTo(S[0], 9);
      expect(s.points[i][1]).toBeCloseTo(S[1], 9);
    }
  });

  it('changes smoothly between neighbouring stations (1 cm of crest, 1 ms apart, 1% of ψ): under 2% of A', () => {
    for (const tb of [null, 0.2, 1, 2.5]) {
      const a = wombSection(at(5, tb, 1.1, 15, 0.08), flat, P), b = wombSection(at(5.01, tb === null ? null : tb + 0.001, 1.101, 15, 0.0808), flat, P);
      const worst = Math.max(...a.points.map((p, i) => Math.hypot(p[0] - b.points[i][0], p[1] - b.points[i][1])));
      expect(worst, `tb ${tb}`).toBeLessThan(0.02 * a.numbers.A);
    }
  });
});
