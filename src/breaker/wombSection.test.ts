import { describe, expect, it } from 'vitest';
import { leanPhase } from './setWaveModel';
import { CREST_KNOT, CURVE_SAMPLES, FLOOR_KNOT, type P2, TIP_KNOT, TROUGH_KNOT, profileKnots, roundedTip, tipLife } from './wombProfile';
import {
  type SectionInput, type SectionNumbers, CURL_PHASE, SEAT_DIP_UNITS, SECTION_CREST, SECTION_FLOOR, SECTION_HAND_BACK_S, SECTION_TIP, SECTION_TROUGH, STAND_LEAD_S,
  STOOD_PHASE, collapseSpan, flightTime, sectionEnd, sectionKnots, sectionKnot, sectionOf, sectionPhase, sectionScale, sectionWeight, seatShift, tubeHold,
  wombSection,
} from './wombSection';

const P = { ribbonOnset: 0.6 };
const at = (H: number, tb: number | null, r = 1.2, periodS = 15, psi = 0.09): SectionInput => ({ H, r, tb, psi, periodS });
const flat = (u: number): P2 => [u, 0];
/** A shoaled swell (a 100 m wave, 1.5 m amplitude, Stokes B 0.15) whose front leans in to a face 6 m long (setWaveModel's
 * leanPhase, as the game's sheet), displaced forward under its crest as a Stokes wave is. */
const swell = (u: number): P2 => {
  const k = (2 * Math.PI) / 100, theta = -k * u, { th } = leanPhase(theta, 1, 0.12);
  return [u + 1.5 * Math.sin(-theta) * 0.6, 1.5 * (Math.cos(th) + 0.15 * Math.cos(2 * th))];
};
/** The distance (m) from a point to the sheet's own curve (sampled every 2 cm by home over ±40 m). */
const sheetCurve = (sheet: (u: number) => P2): P2[] => Array.from({ length: 4001 }, (_, i) => sheet(-40 + i * 0.02));
const offSheet = (curve: readonly P2[], p: P2): number => {
  let best = Infinity;
  for (let i = 0; i + 1 < curve.length; i++) {
    const [a, b] = [curve[i], curve[i + 1]], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
};
const numbers = (A: number, phase: number, hollow = 1, rho = 1): SectionNumbers => ({ A, phase, hollow, rho });

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

  it('a section held for its turn keeps the swell’s shape down the line and stands up only over its last STAND_LEAD_S (Andrew, 2026-10-05)', () => {
    const held = (wait: number): number => sectionPhase({ ...at(4, null, 1.2), wait }, P);
    expect(held(10)).toBe(0);
    expect(held(STAND_LEAD_S)).toBe(0);
    expect(held(0.5 * STAND_LEAD_S)).toBeCloseTo(0.5 * STOOD_PHASE, 12);
    expect(held(0)).toBeCloseTo(STOOD_PHASE, 12);
    for (let w = 0; w < STAND_LEAD_S; w += 0.1) expect(held(w)).toBeGreaterThanOrEqual(held(w + 0.1));
  });

  it('holds the tube longer and collapses slower for a bigger, longer-period wave (Andrew, 2026-10-05)', () => {
    expect(tubeHold(6, 15)).toBeGreaterThan(tubeHold(2, 15));
    expect(tubeHold(4, 17)).toBeGreaterThan(tubeHold(4, 11));
    expect(collapseSpan(6, 15)).toBeGreaterThan(collapseSpan(2, 15));
    expect(collapseSpan(4, 17)).toBeGreaterThan(collapseSpan(4, 11));
  });

  it('ρ is no blend of two shapes: 1 until the white-water wall, then handed back to the sheet', () => {
    expect(sectionWeight(at(4, null, 0.5), P)).toBe(1);
    expect(sectionWeight(at(4, sectionEnd(4, 15)), P)).toBe(1);
    expect(sectionWeight(at(4, sectionEnd(4, 15) + SECTION_HAND_BACK_S), P)).toBe(0);
    expect(sectionWeight(at(4, Infinity), P)).toBe(0);
  });
});

describe('one surface (plan 2026-10-06-wave-root-cause step 3, Andrew’s ruling)', () => {
  const A = 2.5, curve = sheetCurve(swell);

  it('phase 0 is the sheet: every point within 1 cm of it (the curve through the sheet’s own points)', () => {
    for (const hollow of [0, 1]) {
      const s = sectionOf(numbers(A, 0, hollow), swell);
      expect(s.points).toHaveLength(CURVE_SAMPLES);
      const worst = Math.max(...s.points.map((p) => offSheet(curve, p)));
      expect(worst, `hollow ${hollow}`).toBeLessThan(0.01);
    }
  });

  it('a section at ρ 0 (a traced line’s cut end, the hand-back) is the sheet, whatever its phase', () => {
    for (const phase of [0.5, 1, 1.6, 2]) {
      const s = sectionOf(numbers(A, phase, 1, 0), swell);
      expect(Math.max(...s.points.map((p) => offSheet(curve, p))), `phase ${phase}`).toBeLessThan(0.01);
    }
  });

  it('its ends are the sheet at every phase: beyond the drawing’s shoulder and front knots, within 1 cm', () => {
    for (const phase of [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]) for (const hollow of [0, 0.5, 1]) {
      const n = numbers(A, phase, hollow), s = sectionOf(n, swell), k = sectionKnots(n, swell);
      const backEnd = A * k[sectionKnot(CREST_KNOT) - 1][2], frontEnd = A * k[sectionKnot(TROUGH_KNOT) + 1][2];
      s.points.forEach((p, j) => {
        if (s.homes[j] > backEnd && s.homes[j] < frontEnd) return;
        expect(offSheet(curve, p), `phase ${phase} hollow ${hollow} home ${s.homes[j].toFixed(2)}`).toBeLessThan(0.01);
      });
      // The edges are the sheet at the edges' homes exactly.
      for (const j of [0, CURVE_SAMPLES - 1]) {
        const S = swell(s.homes[j]);
        expect(s.points[j][0]).toBeCloseTo(S[0], 9);
        expect(s.points[j][1]).toBeCloseTo(S[1], 9);
      }
    }
  });

  it('from the lip pitching on the curl is the drawing, moved (not stretched) onto the sea in front', () => {
    for (const phase of [CURL_PHASE, 1, 1.5]) {
      const n = numbers(A, phase), k = sectionKnots(n, swell), d = roundedTip(profileKnots(phase, 1), tipLife(phase));
      const drawn = (m: number): readonly number[] => d[m > TIP_KNOT ? m + 2 : m === TIP_KNOT ? m + 1 : m];
      const shift = seatShift(profileKnots(phase, 1)[TROUGH_KNOT][1], k[sectionKnot(TROUGH_KNOT) + 1][1]);
      for (let m = CREST_KNOT; m <= TROUGH_KNOT; m++) {
        expect(k[sectionKnot(m)][0], `phase ${phase} knot ${m}`).toBeCloseTo(drawn(m)[0], 12);
        expect(k[sectionKnot(m)][1], `phase ${phase} knot ${m}`).toBeCloseTo(drawn(m)[1] + shift, 12);
      }
      // Moved, not stretched: the tube is the drawing's size.
      const tube = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0] - q[0], p[1] - q[1]);
      expect(tube(k[SECTION_TIP], k[SECTION_FLOOR])).toBeCloseTo(tube(drawn(TIP_KNOT), drawn(FLOOR_KNOT)), 12);
      expect(tube(k[SECTION_CREST], k[SECTION_FLOOR])).toBeCloseTo(tube(drawn(CREST_KNOT), drawn(FLOOR_KNOT)), 12);
      // The trough knot SEAT_DIP_UNITS under the sea at the front knot (unless the shift is at its limit).
      const dT = drawn(TROUGH_KNOT)[1];
      expect(k[SECTION_TROUGH][1]).toBeCloseTo(Math.max(dT - 0.4, Math.min(dT + 0.4, k[SECTION_TROUGH + 1][1] - SEAT_DIP_UNITS)), 12);
    }
  });

  it('on a flat sea the round barrel stands as drawn, its trough just under the flats', () => {
    const n = numbers(4, 1), s = sectionOf(n, flat), d = profileKnots(1, 1);
    const shift = seatShift(d[TROUGH_KNOT][1], 0);
    expect(shift).toBeCloseTo(-SEAT_DIP_UNITS - d[TROUGH_KNOT][1], 12);
    expect(s.crest[1]).toBeCloseTo(4 * (d[CREST_KNOT][1] + shift), 9);
    expect(s.tip[0]).toBeCloseTo(4 * roundedTip(d, tipLife(1))[TIP_KNOT + 1][0], 9);
    expect(sectionScale(5.2)).toBeCloseTo(4, 12);
  });

  it('changes smoothly between neighbouring stations (1 cm of crest, 1 ms apart, 1% of ψ): under 2% of A', () => {
    for (const tb of [null, 0.2, 1, 2.5]) {
      const a = wombSection(at(5, tb, 1.1, 15, 0.08), swell, P), b = wombSection(at(5.01, tb === null ? null : tb + 0.001, 1.101, 15, 0.0808), swell, P);
      // The surface, not its samples (they slide along it as the walk spreads them).
      const worst = Math.max(...a.points.map((p) => offSheet(b.points, p)));
      expect(worst, `tb ${tb}`).toBeLessThan(0.02 * a.numbers.A);
    }
  });

  it('has no slope step anywhere: the turn between neighbouring samples stays small outside the lip', () => {
    for (const phase of [0, 0.25, 0.5, 1, 1.5, 2]) {
      const s = sectionOf(numbers(A, phase), swell), p = s.points;
      for (let j = 1; j + 1 < p.length; j++) {
        // The lip's end and the tube turn hard by design; elsewhere every sample turns less than 25°.
        const a = [p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]], b = [p[j + 1][0] - p[j][0], p[j + 1][1] - p[j][1]];
        const turn = Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]));
        // The drawing's own turns (the crest, the lip, the tube, the foot and its trough) are its business; the joins to the
        // sheet (the shoulder, the front knot) and the sheet's are not.
        const k = sectionKnots(numbers(A, phase), swell);
        const onCurl = s.homes[j] > A * k[SECTION_CREST][2] && s.homes[j] < A * (k[SECTION_TROUGH + 1][2] - 0.3);
        if (!onCurl) expect(turn, `phase ${phase} sample ${j} home ${s.homes[j].toFixed(2)}`).toBeLessThan((10 * Math.PI) / 180);
      }
    }
  });
});
