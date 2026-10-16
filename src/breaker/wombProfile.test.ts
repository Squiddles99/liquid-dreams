import { describe, expect, it } from 'vitest';
import approved from './wombProfile.approved.json';
import { CREST_KNOT, CURVE_SAMPLES, FLOOR_KNOT, KNOTS, type P2, PROFILE_KEYS, SPAN_SAMPLES, SPILL_FULL, SPILL_TO, TIP_KNOT, TROUGH_KNOT, densePoint, familyKnots, profileCurve, profileKnots, profileSamples, roundedTip, tipLife } from './wombProfile';
import { surgeLift } from './wombSection';
import { smoothstep } from '../math/smoothstep';

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
    for (const key of PROFILE_KEYS) for (const [hv, pts] of [[1, key.hollow], [0, key.spill]] as const) {
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

  // The surge's weight can be no more than its rise in phase (surgeWeight: smoothstep(1.25, 1.5, phase) × fall × hollow)
  // × the dial (≤ 1); here without the hollow factor (stricter). A full lift at phase 1.25 lifts the cavity through the lip's
  // outside (knot 4, unlifted): a state surgeWeight never makes.
  it('never crosses itself with the surge on (whitewater §3.1: phases 1.25–2, the dial at half and its max)', () => {
    for (const ph of range(1.25, 2, 0.05)) for (const hv of HOLLOWS) for (const dial of [0.5, 1]) {
      const w = dial * smoothstep(1.25, 1.5, ph);
      const lifted = profileKnots(ph, hv).map((p, m): P2 => [p[0], p[1] + surgeLift(m, w, 1)]);
      const k = roundedTip(lifted, tipLife(ph)), dense = Array.from({ length: (k.length - 1) * SPAN_SAMPLES + 1 }, (_, d) => densePoint(k, d));
      expect(selfCrossings(dense), `phase ${ph} hollow ${hv} w ${w}`).toBe(0);
    }
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
    // The tip, among the samples before the floor: the landed lip touches the water in front, whose samples lie as near.
    const iF = nearest(c, k[FLOOR_KNOT]), cavity = c.slice(nearest(c.slice(0, iF), k[TIP_KNOT]), iF + 1);
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
    // womb-realism Task 3: the lip's leash (TIP_REACH_MAX) pulls in every drawing from the lip pitching on (0.75–2, whose
    // signed tips reach 1.3–1.45 H); those are re-judged by Andrew from the captures at STOP 2. Phases 0–0.5 are untouched.
    for (const shape of approved.shapes.filter((q) => q.phase <= 0.5)) {
      const c = profileCurve(shape.phase, shape.hollow);
      for (const p of c) expect(offCurve(p, shape.curve), `phase ${shape.phase} hollow ${shape.hollow}`).toBeLessThan(2e-3);
      for (const p of shape.curve) expect(offCurve(p, c), `phase ${shape.phase} hollow ${shape.hollow}`).toBeLessThan(2e-3);
    }
  });
});

/** Step 4 (2026-10-16, Andrew's ruling): in perfect conditions the lip throws top to bottom and lands about one face height
 * ahead of the face's foot (the tube about as wide as it is tall). Measured live at 1792137769's conditions, t 4906.0, the
 * lip landed 0.10-0.19 face heights ahead of the sheet's foot (a tube 1.2-1.6 m wide under a 3.5-3.8 m face). */
const LANDING_BAR: readonly [number, number] = [0.9, 1.1];
describe('the lip lands one face height ahead of the foot (step 4, Andrew 2026-10-16)', () => {
  it('at the barrel (phase 1) and hollow 0.8 the tip lands 0.9-1.1 face heights (crest to trough) ahead of the floor', () => {
    const k = profileKnots(1, 0.8), landing = k[TIP_KNOT][0] - k[FLOOR_KNOT][0], face = k[CREST_KNOT][1] - k[TROUGH_KNOT][1];
    const r = landing / face;
    expect(r, `landing ${landing.toFixed(3)} / face ${face.toFixed(3)}`).toBeGreaterThanOrEqual(LANDING_BAR[0]);
    expect(r, `landing ${landing.toFixed(3)} / face ${face.toFixed(3)}`).toBeLessThanOrEqual(LANDING_BAR[1]);
  });
});

describe('the lip on a leash (womb-realism Task 3, spec 3.2)', () => {
  it('over phases 0–2 and every hollowness the tip stands at most 0.1 above the crest and reaches at most 1.0 ahead of it', () => {
    for (let i = 0; i <= 40; i++) for (const hollow of [0, 0.5, 1]) {
      const phase = i * 0.05, k = profileKnots(phase, hollow), tag = `phase ${phase.toFixed(2)} hollow ${hollow}`;
      expect(k[TIP_KNOT][1] - k[CREST_KNOT][1], tag).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(k[TIP_KNOT][0] - k[CREST_KNOT][0], tag).toBeLessThanOrEqual(1.0 + 1e-9);
    }
  });
});

/** The spilling lip's measures on the drawn curve (womb-story Task 3b, STOP 1 ruling 4; units of A): the tip's reach ahead
 * of the crest and its rise above it; the cavity, how far the curve from the tip down to the floor runs in behind the chord
 * between them (the room inside, under the lip); and the face's convexity, the same depth on the face alone, from the tip to
 * its last knot above the floor (the foot, where it turns forward into the trough, is concave by nature: <= 0.032). */
function spillMeasures(phase: number, hollow: number) {
  const k = profileKnots(phase, hollow), { curve, marks } = profileSamples(phase, hollow);
  const behind = (from: number, to: number) => {
    const T = curve[from], F = curve[to], dx = F[0] - T[0], dy = F[1] - T[1], L = Math.hypot(dx, dy) || 1;
    let d = 0;
    for (const p of curve.slice(from, to + 1)) d = Math.max(d, -(dx * (p[1] - T[1]) - dy * (p[0] - T[0])) / L);
    return d;
  };
  const face = Math.max(marks.tip, nearest(curve.slice(0, marks.floor + 1), k[FLOOR_KNOT - 1]));
  return { reach: k[TIP_KNOT][0] - k[CREST_KNOT][0], rise: k[TIP_KNOT][1] - k[CREST_KNOT][1], cavity: behind(marks.tip, marks.floor), convex: behind(marks.tip, face) };
}

describe('the spilling lip (womb-story Task 3b, STOP 1 ruling 4)', () => {
  // The tip's bars over the lip's life (pitching to the tube filling); past it the tube has closed (a pocket too small to
  // see, CLOSED_POCKET) and the drawing is the approved hump: no lip to measure, still no room inside.
  it('at hollow <= SPILL_FULL (0.2), from the lip pitching on: the tip within 0.3 A of the crest and no higher, the cavity <= 0.2 A, the face convex', () => {
    for (const hv of [0, 0.1, SPILL_FULL]) for (const ph of range(0.5, 2, 0.05)) {
      const m = spillMeasures(ph, hv), tag = `phase ${ph.toFixed(2)} hollow ${hv}`;
      if (ph <= 1.25 + 1e-9) {
        expect(m.reach, tag).toBeLessThanOrEqual(0.3);
        expect(m.rise, tag).toBeLessThanOrEqual(0);
      }
      expect(m.cavity, `${tag}: cavity`).toBeLessThanOrEqual(0.2);
      expect(m.convex, `${tag}: convex`).toBeLessThanOrEqual(0.01);
    }
  });
  it('the barrel is still a barrel: at hollow 1 the cavity runs in behind the chord (phase 1)', () => {
    expect(spillMeasures(1, 1).cavity).toBeGreaterThan(0.3);
  });
  it('the approved shapes are untouched for hollow >= SPILL_TO (0.5): the two families blended linearly, as before', () => {
    for (const ph of range(0, 2, 0.05)) for (const hv of range(SPILL_TO, 1, 0.1)) {
      const o = familyKnots(ph, 'open'), h = familyKnots(ph, 'hollow'), k = profileKnots(ph, hv);
      k.forEach((p, m) => {
        expect(p[0], `phase ${ph} hollow ${hv} knot ${m}`).toBeCloseTo(o[m][0] + (h[m][0] - o[m][0]) * hv, 12);
        expect(p[1], `phase ${ph} hollow ${hv} knot ${m}`).toBeCloseTo(o[m][1] + (h[m][1] - o[m][1]) * hv, 12);
      });
    }
  });
  it('before the lip pitches (phases 0-0.25) and once the tube has closed (1.5-2) the spill is the open drawing', () => {
    for (const key of PROFILE_KEYS.filter((q) => q.phase < 0.5 || q.phase > 1.25)) key.spill.forEach((p, m) => expect(p).toEqual(key.open[m]));
  });
});
