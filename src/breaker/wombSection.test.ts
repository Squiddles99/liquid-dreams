import { describe, expect, it } from 'vitest';
import { CREST_KNOT, CURVE_SAMPLES, FLOOR_KNOT, type P2, TIP_KNOT, profileCurve, profileKnots } from './wombProfile';
import {
  type SectionInput, SECTION_HAND_BACK_S, STAND_LEAD_S, STOOD_PHASE, collapseSpan, endLift, flightTime, interiorWeight, sectionEnd, sectionPhase, sectionScale, sectionWeight, tubeHold,
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

  it('a section held for its turn keeps the swell\u2019s shape down the line and stands up only over its last STAND_LEAD_S (Andrew, 2026-10-05)', () => {
    const held = (wait: number): number => sectionPhase({ ...at(4, null, 1.2), wait }, P);
    expect(held(10)).toBe(0);
    expect(held(STAND_LEAD_S)).toBe(0);
    expect(held(0.5 * STAND_LEAD_S)).toBeCloseTo(0.5 * STOOD_PHASE, 12);
    expect(held(0)).toBeCloseTo(STOOD_PHASE, 12);
    for (let w = 0; w < STAND_LEAD_S; w += 0.1) expect(held(w)).toBeGreaterThanOrEqual(held(w + 0.1));
  });

  it('a held section weighs in over the same last STAND_LEAD_S: down the line the swell is the sheet\u2019s own (Andrew, 2026-10-05: the wall "doesn\u2019t extend very far")', () => {
    const rho = (wait: number): number => sectionWeight({ ...at(4, null, 1.2), wait }, P);
    expect(rho(10)).toBe(0);
    expect(rho(STAND_LEAD_S)).toBe(0);
    expect(rho(0)).toBe(1);
    for (let w = 0; w < STAND_LEAD_S; w += 0.1) expect(rho(w)).toBeGreaterThanOrEqual(rho(w + 0.1));
  });

  it('is lifted to the sheet\u2019s level at each end, its own gentle back and front between (Andrew, 2026-10-05: "a smooth gradient returning down to sea level", not a second wave)', () => {
    // A sea standing 1.2 m up toward the profile's back end and 0.4 m down toward its front end, level over its last unit.
    const end = 7 * sectionScale(5), ramp = (u: number): number => Math.min(1, Math.abs(u) / ((6 / 7) * end));
    const sheet = (u: number): P2 => [u, u < 0 ? 1.2 * ramp(u) : -0.4 * ramp(u)];
    const s = wombSection(at(5, 0.4), sheet, P), { A } = s.numbers;
    expect(s.points[0][1]).toBeCloseTo(-0.4, 9);
    expect(s.points[CURVE_SAMPLES - 1][1]).toBeCloseTo(1.2, 9);
    // Near the curl, next to none of the lift: the approved shape.
    const k = profileKnots(s.numbers.phase, s.numbers.hollow);
    for (const m of [CREST_KNOT, TIP_KNOT, FLOOR_KNOT]) expect(endLift(k[m][0])).toBeLessThan(0.05);
    // The back falls from the crest to its end without a second rise.
    const back = s.points.filter((p) => p[0] < A * k[CREST_KNOT][0]).sort((p, q) => q[0] - p[0]);
    for (let i = 1; i < back.length; i++) expect(back[i][1]).toBeLessThanOrEqual(back[i - 1][1] + 0.01);
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
