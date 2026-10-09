import { describe, expect, it } from 'vitest';
import { leanPhase } from './setWaveModel';
import { CREST_KNOT, FRONT_KNOT, type P2, TIP_KNOT, TROUGH_KNOT, profileKnots, roundedTip, tipLife } from './wombProfile';
import {
  type SectionKnot, type SectionNumbers, type SheetAlong, CURL_KNOTS, CURL_PHASE, EDGE_OUTER_UNITS, JOIN_SLOPE_UNITS, SHEET_KNOTS,
  SWELL_CURL_U, curlWeight, sectionFrameKnots, seatShift,
} from './wombSection';

/**
 * ride-framerate Task 15 (R10a): at curlWeight g = 1 the curl's knots skip the sheet reads at the swell drawing's homes
 * (they are multiplied by 1 − g = 0). The old build is kept here as a local copy of sectionFrameKnots before the change
 * (2026-10-08, cb257d4), so the new one is compared against it on every run, not against a snapshot.
 */
function oldFrameKnots(numbers: SectionNumbers, sheet: SheetAlong): { knots: SectionKnot[]; beyond: SectionKnot[] } {
  const roundedCurl = (k: readonly P2[], life: number): P2[] => roundedTip(k, life, TIP_KNOT).slice(CREST_KNOT, TROUGH_KNOT + 3);
  const { A, phase, hollow } = numbers, k = profileKnots(phase, hollow);
  const at = (h: number): SectionKnot => { const p = sheet(A * h); return [p[0] / A, p[1] / A, h, p[0] / A, p[1] / A]; };
  const back: SectionKnot[] = [], front: SectionKnot[] = [];
  const b0 = -EDGE_OUTER_UNITS, b1 = k[CREST_KNOT - 1][0], f0 = k[FRONT_KNOT][0], f1 = EDGE_OUTER_UNITS;
  for (let i = 0; i < SHEET_KNOTS; i++) {
    back.push(at(b0 + ((b1 - b0) * i) / (SHEET_KNOTS - 1)));
    front.push(at(f0 + ((f1 - f0) * i) / (SHEET_KNOTS - 1)));
  }
  const db = (b1 - b0) / (SHEET_KNOTS - 1), df = (f1 - f0) / (SHEET_KNOTS - 1);
  const beyond = [at(b0 - db), at(b1 - JOIN_SLOPE_UNITS), at(f0 + JOIN_SLOPE_UNITS), at(f1 + df)];
  const g = curlWeight(numbers), shift = seatShift(k[TROUGH_KNOT][1], front[0][1]);
  const oBack = back[SHEET_KNOTS - 1][0] - back[SHEET_KNOTS - 1][2], oFront = front[0][0] - front[0][2];
  const drawn = roundedCurl(k, tipLife(Math.min(2, Math.max(0, phase))));
  const curl = drawn.map((d, i): SectionKnot => {
    const s = at(SWELL_CURL_U[i]), f = (i + 1) / (CURL_KNOTS + 1);
    const dy = d[1] + shift, dh = d[0] - (oBack + (oFront - oBack) * f), h = s[2] + (dh - s[2]) * g;
    const under = g > 0 ? at(h) : s;
    return [s[0] + (d[0] - s[0]) * g, s[1] + (dy - s[1]) * g, h, under[0], under[1]];
  });
  return { knots: [...back, ...curl, ...front], beyond };
}

/** A shoaled, leaning swell (as wombSection.test's), and a flat sea: the sheets the sections are built on. */
const swell = (u: number): P2 => {
  const k = (2 * Math.PI) / 100, theta = -k * u, { th } = leanPhase(theta, 1, 0.12);
  return [u + 1.5 * Math.sin(-theta) * 0.6, 1.5 * (Math.cos(th) + 0.15 * Math.cos(2 * th))];
};
const flat = (u: number): P2 => [u, 0];
const counting = (sheet: SheetAlong): { sheet: SheetAlong; reads: () => number } => {
  let n = 0;
  return { sheet: (u) => { n++; return sheet(u); }, reads: () => n };
};
const sheets: [string, SheetAlong][] = [['flat', flat], ['swell', swell]];

describe('sectionFrameKnots skips the swell reads at curlWeight 1 (R10a)', () => {
  it('at g = 1: 25 reads (14 sheet ends + 11 own homes), every knot equal to the old build to 1e-12 relative', () => {
    let cases = 0;
    for (const [, base] of sheets) for (const phase of [CURL_PHASE, 0.9, 1, 1.3, 1.7, 2, 2.4]) for (const hollow of [0, 0.4, 1]) for (const A of [1.4, 2.5, 4.1]) {
      const n: SectionNumbers = { A, phase, hollow, rho: 1 };
      expect(curlWeight(n)).toBe(1);
      const c = counting(base), got = sectionFrameKnots(n, c.sheet), want = oldFrameKnots(n, base);
      expect(c.reads()).toBe(4 + 2 * SHEET_KNOTS + CURL_KNOTS);
      expect(got.beyond).toEqual(want.beyond);
      got.knots.forEach((kn, i) => kn.forEach((v, j) => {
        const w = want.knots[i][j];
        expect(Math.abs(v - w)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(w)));
      }));
      cases++;
    }
    expect(cases).toBe(126);
  });

  it('at 0 < g < 1: 36 reads, the knots toEqual the old build', () => {
    let cases = 0;
    for (const [, base] of sheets) for (const [phase, rho] of [[0.05, 1], [CURL_PHASE * 0.5, 1], [CURL_PHASE * 0.999, 1], [CURL_PHASE, 0.5], [1.5, 0.999], [2, 0.2]]) for (const hollow of [0, 0.4, 1]) {
      const n: SectionNumbers = { A: 2.5, phase, hollow, rho };
      const g = curlWeight(n);
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThan(1);
      const c = counting(base), got = sectionFrameKnots(n, c.sheet), want = oldFrameKnots(n, base);
      expect(c.reads()).toBe(4 + 2 * SHEET_KNOTS + 2 * CURL_KNOTS);
      expect(got).toEqual(want);
      cases++;
    }
    expect(cases).toBe(36);
  });

  it('at g = 0: 25 reads (the swell homes are the knots), toEqual the old build', () => {
    for (const [, base] of sheets) for (const hollow of [0, 0.4, 1]) {
      const n: SectionNumbers = { A: 2.5, phase: 0, hollow, rho: 1 };
      const c = counting(base), got = sectionFrameKnots(n, c.sheet), want = oldFrameKnots(n, base);
      expect(c.reads()).toBe(4 + 2 * SHEET_KNOTS + CURL_KNOTS);
      expect(got).toEqual(want);
    }
  });
});
