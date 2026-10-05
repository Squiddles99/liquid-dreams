import { describe, expect, it } from 'vitest';
import approved from './wombProfile.approved.json';
import { CREST_KNOT, CURVE_SAMPLES, FLOOR_KNOT, KNOTS, type P2, PROFILE_KEYS, TIP_KNOT, TROUGH_KNOT, profileCurve, profileKnots } from './wombProfile';

const range = (a: number, b: number, step: number): number[] => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => a + i * step);
const PHASES = range(0, 2, 0.02);
const HOLLOWS = range(0, 1, 0.1);

function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function selfCrossings(pts: readonly P2[]): number {
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) for (let j = i + 2; j < pts.length - 1; j++) if (segmentsCross(pts[i], pts[i + 1], pts[j], pts[j + 1])) n++;
  return n;
}
const nearest = (pts: readonly P2[], p: P2): number => {
  let best = 0;
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < Math.hypot(pts[best][0] - p[0], pts[best][1] - p[1])) best = i;
  return best;
};

describe('wombProfile', () => {
  it('starts and ends on flat sea well behind and in front of the crest', () => {
    for (const ph of PHASES) for (const hv of HOLLOWS) {
      const k = profileKnots(ph, hv);
      expect(k).toHaveLength(KNOTS);
      for (const [i, u] of [[0, -7], [KNOTS - 1, 7]]) {
        expect(k[i][0]).toBeCloseTo(u, 12);
        expect(k[i][1]).toBeCloseTo(0, 12);
      }
    }
  });

  it('is the keyframes at their phases, at both ends of hollowness', () => {
    for (const key of PROFILE_KEYS) for (const [hv, pts] of [[1, key.hollow], [0, key.open]] as const) {
      const k = profileKnots(key.phase, hv);
      pts.forEach((p, i) => {
        expect(k[i][0]).toBeCloseTo(p[0], 12);
        expect(k[i][1]).toBeCloseTo(p[1], 12);
      });
    }
  });

  it('never crosses itself', () => {
    for (const ph of PHASES) for (const hv of HOLLOWS) expect(selfCrossings(profileCurve(ph, hv)), `phase ${ph} hollow ${hv}`).toBe(0);
  });

  it('changes smoothly with phase', () => {
    const offCurve = (p: P2, c: readonly P2[]): number => {
      let best = Infinity;
      for (let i = 0; i < c.length - 1; i++) {
        const dx = c[i + 1][0] - c[i][0], dy = c[i + 1][1] - c[i][1];
        const t = Math.max(0, Math.min(1, ((p[0] - c[i][0]) * dx + (p[1] - c[i][1]) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p[0] - c[i][0] - t * dx, p[1] - c[i][1] - t * dy));
      }
      return best;
    };
    // The shape's change per 1% of phase: how far each sample of the next shape lies from the current curve (sliding
    // along it is free). The fastest real change (the open tube closing) peaks near 0.048 H and rises and falls smoothly
    // either side; a knot snapping or a fold opening is a step that stands out from its neighbours.
    for (const hv of [0, 0.5, 1]) {
      const steps: number[] = [];
      for (let ph = 0; ph < 2 - 1e-9; ph += 0.01) {
        const a = profileCurve(ph, hv), b = profileCurve(ph + 0.01, hv);
        steps.push(Math.max(...b.map((p) => offCurve(p, a))));
      }
      steps.forEach((x, i) => {
        expect(x, `phase ${(i * 0.01).toFixed(2)} hollow ${hv}`).toBeLessThan(0.06);
        const around = Math.max(steps[i - 1] ?? 0, steps[i + 1] ?? 0);
        expect(x, `phase ${(i * 0.01).toFixed(2)} hollow ${hv}: a jump`).toBeLessThan(1.6 * around + 0.005);
      });
    }
  });

  it('pitches the lip from the crest, never out of the face below it', () => {
    for (const ph of range(0.5, 1, 0.02)) for (const hv of HOLLOWS) {
      const k = profileKnots(ph, hv);
      expect(Math.max(k[7][1], k[8][1]), `phase ${ph} hollow ${hv}`).toBeGreaterThan(0.5 * k[CREST_KNOT][1]);
      expect(k[TIP_KNOT][0], 'the tip is thrown forward of the crest').toBeGreaterThan(k[CREST_KNOT][0]);
    }
  });

  it('is a round barrel with its floor and the water in front below sea level at the target', () => {
    const k = profileKnots(1, 1), c = profileCurve(1, 1);
    expect(k[FLOOR_KNOT][1]).toBeLessThan(0);
    expect(k[TROUGH_KNOT][1]).toBeLessThan(0);
    const cavity = c.slice(nearest(c, k[TIP_KNOT]), nearest(c, k[FLOOR_KNOT]) + 1);
    const us = cavity.map((p) => p[0]), ys = cavity.map((p) => p[1]);
    const aspect = (Math.max(...us) - Math.min(...us)) / (Math.max(...ys) - Math.min(...ys));
    expect(aspect).toBeGreaterThan(0.7);
    expect(aspect).toBeLessThan(1.4);
  });

  it("spreads its samples so the lip's end is round on the mesh and nothing is starved", () => {
    for (const [ph, hv] of [[0, 1], [0.5, 0.5], [0.75, 1], [1, 1], [1, 0], [1.25, 1], [2, 1]]) {
      const c = profileCurve(ph, hv);
      expect(c).toHaveLength(CURVE_SAMPLES);
      const d = c.slice(1).map((p, i) => Math.hypot(p[0] - c[i][0], p[1] - c[i][1]));
      const mean = d.reduce((s, x) => s + x, 0) / d.length;
      expect(Math.max(...d), `phase ${ph} hollow ${hv}`).toBeLessThan(1.5 * mean);
    }
    for (const hv of [0, 1]) {
      const T = profileKnots(1, hv)[TIP_KNOT];
      const nearTip = profileCurve(1, hv).filter((p) => Math.hypot(p[0] - T[0], p[1] - T[1]) < 0.25).length;
      expect(nearTip, `hollow ${hv}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('is still the shapes Andrew signed (wombProfile.approved.json): every sample within 2 mm per metre of H of the signed curve (its chords sag ~1 mm where it turns hardest), and back', () => {
    // The shape is what was signed, not where along it the samples fall (their spacing is the mesh's business).
    const offCurve = (p: readonly number[], c: readonly (readonly number[])[]): number => {
      let best = Infinity;
      for (let i = 0; i < c.length - 1; i++) {
        const dx = c[i + 1][0] - c[i][0], dy = c[i + 1][1] - c[i][1];
        const t = Math.max(0, Math.min(1, ((p[0] - c[i][0]) * dx + (p[1] - c[i][1]) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p[0] - c[i][0] - t * dx, p[1] - c[i][1] - t * dy));
      }
      return best;
    };
    expect(approved.n).toBe(CURVE_SAMPLES);
    for (const shape of approved.shapes) {
      const c = profileCurve(shape.phase, shape.hollow);
      for (const p of c) expect(offCurve(p, shape.curve), `phase ${shape.phase} hollow ${shape.hollow}`).toBeLessThan(2e-3);
      for (const p of shape.curve) expect(offCurve(p, c), `phase ${shape.phase} hollow ${shape.hollow}`).toBeLessThan(2e-3);
    }
  });
});
