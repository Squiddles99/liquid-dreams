import { describe, expect, it } from 'vitest';
import { LIP_JET_SHARE, PROFILE_SEGMENTS, buildProfile, crossings, foldDepth, liftAt, sampleTarget, sheetYAt, tubeMetrics } from './lipProfile';
import { aspectFit, lipAreaFit, overturnShape, tiltFitDeg, tubeAreaFit } from './overturn';

import { peakLanding, peakStation } from './peakStation.fixture';

const n = PROFILE_SEGMENTS, faceStart = n.front, wallStart = n.front + n.face, wallEnd = wallStart + n.wall;
const prof = (psi: number, tb: number | null) => { const s = peakStation(psi, tb); return { s, p: buildProfile(s.base, s.input, s.lip, s.frameBase) }; };

describe('the lip from the maths (spec 2026-09-30-barrel-from-maths §3.2–3.4)', () => {
  it('at landing the drawn tube is the equations: area ±3%, width ÷ length ±8%, tilt ±3°, lip area ±25% (of its share of the jet)', () => {
    for (const psi of [0.03, 0.045, 0.06]) {
      // H is the fits' H_I: the crest's height above the water the lip lands on (lipProfile.impactHeight).
      const { p } = prof(psi, peakLanding(psi)), H = p.frame.HI, m = tubeMetrics(p);
      console.log(`ψ ${psi}: ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(3)])))}`);
      expect(Math.abs(m.area / (tubeAreaFit(psi) * H * H) - 1), 'tube area').toBeLessThanOrEqual(0.03);
      expect(Math.abs(m.aspect / aspectFit(psi) - 1), 'width ÷ length').toBeLessThanOrEqual(0.08);
      expect(Math.abs(m.tiltDeg - tiltFitDeg(psi)), 'tilt').toBeLessThanOrEqual(3);
      // The lip is LIP_JET_SHARE of the fits' jet (spec 2026-10-03 barrel-size, option A: Andrew's 1.5 m lip at 12 ft).
      expect(Math.abs(m.lipArea / (LIP_JET_SHARE * lipAreaFit(psi) * H * H) - 1), 'lip area').toBeLessThanOrEqual(0.25);
      // The face is the tube's floor (Andrew's red line, 2026-10-03): where the lip lands part-way down the face (state 4),
      // the air it encloses is a thinner oval along the face than the equations' teardrop (ψ 0.03: 0.65 of it; Moideen &
      // Behera 2022 fig. 6). Recorded; never under half.
      console.log(`ψ ${psi}: the air under the lip ${(m.airArea / m.area).toFixed(2)} × the equations' tube`);
      expect(m.airArea, 'the air under the lip, down to the hollow face').toBeGreaterThanOrEqual(0.5 * m.area);
    }
  });
  it('the lip lands on the water under it, never in the air; on the face in state 4, past the foot from state 6', () => {
    for (let psi = 0.02; psi <= 0.1201; psi += 0.01) {
      // Never over the water; under the sheet the lip has landed on the face, hollowed to meet it (spec §3.2).
      const { s, p } = prof(psi, peakLanding(psi)), f = p.frame;
      expect(f.P[1] - sheetYAt(s.frameBase, f.K, f.P[0]), `ψ ${psi.toFixed(2)}: the landing over the sheet (m)`).toBeLessThanOrEqual(0.05);
    }
    const oval = prof(0.035, peakLanding(0.035)).p.frame, thrown = prof(0.09, peakLanding(0.09));
    const footX = thrown.s.frameBase(1.9 * 0.5 * thrown.s.input.H)[0];
    expect(oval.P[0], 'state 4 lands on the face, before the foot').toBeLessThan(oval.F[0]);
    expect(thrown.p.frame.P[0], 'state 6 lands past the foot').toBeGreaterThanOrEqual(footX - 0.5);
  });
  it('the face is one smooth concave curve from the trough to the lip: no step, no pocket behind the crest (Andrew, 2026-09-30)', () => {
    for (const psi of [0.025, 0.04, 0.06, 0.08, 0.1, 0.15]) {
      const tau = peakLanding(psi);
      // From 30% of the throw, and through where the lip meets the face (Andrew's red line, 2026-10-03: no step there).
      for (const frac of [0.3, 0.4, 0.5, 0.6, 0.9, 1]) {
        const { s, p } = prof(psi, frac * tau), pts = p.points;
        let lo = 0;
        for (let j = 0; j < wallStart; j++) if (pts[j][1] < pts[lo][1]) lo = j;
        for (let j = Math.max(lo, faceStart - 2) + 1; j + 1 < wallEnd; j++) {
          const a = [pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]], b = [pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]];
          const la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
          if (la < 1e-6 || lb < 1e-6) continue;
          expect((a[0] * b[1] - a[1] * b[0]) / (la * lb), `ψ ${psi} at ${frac} of the throw: sample ${j} turns back`).toBeLessThanOrEqual(0.05);
        }
        const backMost = Math.min(...pts.slice(wallStart, wallEnd).map((q) => q[0]));
        // Within 5 cm: the hollow face arrives at the tube's round end along the ceiling's start, which can lean a hair
        // back (Andrew's red line puts the back wall just behind the crest; no pocket carved behind it).
        expect(backMost, `ψ ${psi} at ${frac}: the tube's back behind the crest`).toBeGreaterThanOrEqual(p.frame.K[0] - 0.05);
        expect(Number.isFinite(s.input.H)).toBe(true);
      }
    }
  });
  it('never crosses itself before the lip lands; at contact the tip meets the water by at most 5 cm', () => {
    for (const psi of [0.015, 0.03, 0.05, 0.07, 0.09, 0.12, 0.3]) {
      const tau = peakLanding(psi);
      for (const frac of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 0.99, 0.999]) {
        const pts = prof(psi, frac * tau).p.points;
        if (frac < 0.99) expect(crossings(pts), `ψ ${psi} ${frac}`).toBe(0);
        else expect(foldDepth(pts), `ψ ${psi} ${frac}`).toBeLessThanOrEqual(0.05);
      }
    }
  });
  it('after it lands the tip stays where it landed, and the tube fills with no fold, step or horn, to the hand-back', () => {
    for (const psi of [0.035, 0.065, 0.09]) {
      const tau = peakLanding(psi), L0 = prof(psi, tau);
      const standing = Math.max(...L0.p.points.map((q) => q[1]));
      for (const dt of [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5]) {
        const { s, p } = prof(psi, tau + dt), pts = p.points, f = p.frame;
        expect(foldDepth(pts), `ψ ${psi} +${dt} s: fold`).toBeLessThanOrEqual(0.1);
        const jump = (i: number) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        const r = pts.length - n.back - 1, fi = n.front - 1;
        expect(jump(r), `ψ ${psi} +${dt}: step at the crest`).toBeLessThanOrEqual(1.2 * Math.max(jump(r - 1), jump(r + 1)) + 0.1);
        expect(jump(fi), `ψ ${psi} +${dt}: step at the foot`).toBeLessThanOrEqual(1.2 * Math.max(jump(fi - 1), jump(fi + 1)) + 0.1);
        const mound = Math.max(...p.homes.map((u) => s.base(u)[1]));
        expect(Math.max(...pts.map((q) => q[1])), `ψ ${psi} +${dt}: horn`).toBeLessThanOrEqual(Math.max(standing, mound) + 0.2);
        if (f.weight >= 0.2) {
          const capStart = n.front + n.face + n.wall + n.under, tipPt = pts[capStart];
          // Where it landed: across, riding the whitewater as the curl does (lipProfile's riding: the pile's lift at its x,
          // capped at the crest's); up and down, in the water there, between that and the whitewater's surface (the pile
          // stands up to twice the crest's rise at the landing, and the collapse settles the curl into it).
          const l = liftAt(f.lift!, f.P[0]), crest = liftAt(f.lift!, f.K[0])[1];
          const ridden = f.P[1] + Math.min(l[1], crest), surface = s.base(sampleTarget(capStart, f))[1];
          expect(Math.abs(tipPt[0] - f.P[0] - l[0]), `ψ ${psi} +${dt}: the tip left where it landed`).toBeLessThanOrEqual(0.5 + 0.3 * (1 - f.weight) * s.input.H);
          expect(tipPt[1], `ψ ${psi} +${dt}: the tip under the water it landed in`).toBeGreaterThanOrEqual(Math.min(ridden, surface) - 0.5);
          expect(tipPt[1], `ψ ${psi} +${dt}: the tip over the whitewater`).toBeLessThanOrEqual(Math.max(ridden, surface) + 0.5);
        }
      }
    }
  });
  it('onshore wind shrinks the tube at the same wave; offshore grows it up to the cap', () => {
    const at = (off: number) => { const s = peakStation(0.06, peakLanding(0.06, { offshoreMs: off }), { offshoreMs: off }); return tubeMetrics(buildProfile(s.base, s.input, s.lip, s.frameBase)).area; };
    expect(at(-8)).toBeLessThan(at(0));
    expect(at(8)).toBeGreaterThan(at(0));
    expect(at(8)).toBeLessThanOrEqual(1.2 * at(0) * 1.03);
  });
  it('below ψ 0.01 the ribbon is exactly the sheet (no tube: B crumbles it)', () => {
    const { s, p } = prof(0.005, 0.5);
    p.points.forEach((q, j) => { const b = s.base(p.homes[j]); expect(Math.hypot(q[0] - b[0], q[1] - b[1])).toBeLessThan(1e-9); });
  });
  it('stays finite from ψ 0 to 1, for tiny and huge times', () => {
    for (const psi of [0, 0.01, 0.5, 1]) for (const tb of [null, 0, 1e-6, 0.4, 5, Infinity]) {
      const { p } = prof(psi, tb as number | null);
      for (const q of p.points) { expect(Number.isFinite(q[0])).toBe(true); expect(Number.isFinite(q[1])).toBe(true); }
    }
    expect(overturnShape(Number.NaN, 7, 0).L).toBeGreaterThan(0);
  });
});

describe('the lip finish (Andrew, 2026-10-01): the curl grows as it throws', () => {
  it('is a point at the crest at the start (no plane from the crest to the trough), grows steadily, and is the tube at impact on landing', () => {
    for (const psi of [0.035, 0.065, 0.09]) {
      const tau = peakLanding(psi);
      // Before the break and at the throw's start the tube is a point at the crest, and the face runs up to it (the old
      // full-length young tube lay along its axis from the crest down to where it would land: a plane cutting the face).
      for (const tb of [null, 0]) {
        const f = prof(psi, tb).p.frame;
        expect(f.tube.L, `ψ ${psi} tb ${tb}`).toBeLessThan(1e-6);
        expect(Math.hypot(f.tube.O[0] - f.K[0], f.tube.O[1] - f.K[1])).toBeLessThan(1e-6);
        expect(Math.hypot(f.P[0] - f.K[0], f.P[1] - f.K[1])).toBeLessThan(1e-6);
      }
      // It grows steadily, and at the landing it is the tube at impact.
      const L = [0.25, 0.5, 0.75, 1].map((k) => prof(psi, k * tau).p.frame.tube.L);
      for (let i = 1; i < L.length; i++) expect(L[i]).toBeGreaterThan(L[i - 1]);
      const landed = prof(psi, tau + 0.05).p.frame;
      expect(landed.tube.L).toBeCloseTo(landed.shape.L, 9);
      expect(landed.tube.W).toBeCloseTo(landed.shape.W, 9);
    }
  });
});
