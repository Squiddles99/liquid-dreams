import { describe, expect, it } from 'vitest';
import { LH82_AREA, overturnShape } from './overturn';
import { type Tube, tubeAxes, tubeBackMostX, tubeLower, tubeTopXi, tubeUpper, tubeUpperArc, tubeUpperNormal, tubeWaterXi } from './tube';

const shape = overturnShape(0.06, 7, 0);
const t: Tube = { O: [0, 0], ...tubeAxes(shape.theta), L: shape.L, W: shape.W, clipY: -Infinity };

describe('the tube (Longuet-Higgins outline in its own axes)', () => {
  it('both sides meet at the round end (ξ = 0) and at the point (ξ = 1), the point L down the axis', () => {
    expect(tubeUpper(t, 0)).toEqual(tubeLower(t, 0));
    const p = tubeUpper(t, 1), q = tubeLower(t, 1);
    expect(p[0]).toBeCloseTo(q[0], 9); expect(p[1]).toBeCloseTo(q[1], 9);
    expect(Math.hypot(p[0], p[1])).toBeCloseTo(t.L, 9);
    expect(p[1]).toBeLessThan(0); // the point is below the round end: the tube tilts down and forward
    expect(p[0]).toBeGreaterThan(0);
  });
  it('encloses the Longuet-Higgins area', () => {
    const pts = [];
    for (let i = 0; i <= 400; i++) pts.push(tubeUpper(t, i / 400));
    for (let i = 400; i >= 0; i--) pts.push(tubeLower(t, i / 400));
    let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    expect(Math.abs(a) / 2).toBeCloseTo(LH82_AREA * t.W * t.L, 2);
  });
  it('its top and back are found (the highest point of the upper side, the back-most point of either side)', () => {
    const xi = tubeTopXi(t), top = tubeUpper(t, xi);
    for (let i = 0; i <= 200; i++) expect(tubeUpper(t, i / 200)[1]).toBeLessThanOrEqual(top[1] + 1e-6);
    const back = tubeBackMostX(t);
    for (let i = 0; i <= 200; i++) { expect(tubeLower(t, i / 200)[0]).toBeGreaterThanOrEqual(back - 1e-6); expect(tubeUpper(t, i / 200)[0]).toBeGreaterThanOrEqual(back - 1e-6); }
  });
  it("the upper side's outward normal points away from the tube, and its arc is the polyline's length", () => {
    for (const xi of [0.05, 0.3, 0.6, 0.95]) {
      const nr = tubeUpperNormal(t, xi), u = tubeUpper(t, xi), l = tubeLower(t, xi);
      expect(nr[0] * (u[0] - l[0]) + nr[1] * (u[1] - l[1])).toBeGreaterThan(0);
      expect(Math.hypot(nr[0], nr[1])).toBeCloseTo(1, 9);
    }
    let s = 0; for (let i = 0; i < 2000; i++) { const a = tubeUpper(t, 0.2 + (0.8 * i) / 2000), b = tubeUpper(t, 0.2 + (0.8 * (i + 1)) / 2000); s += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    expect(tubeUpperArc(t, 0.2, 1)).toBeCloseTo(s, 1);
  });
  it('the lower side never dips below clipY; the water cut is where the upper side first reaches it', () => {
    const c: Tube = { ...t, clipY: tubeUpper(t, 1)[1] + 0.5 };
    for (let i = 0; i <= 100; i++) expect(tubeLower(c, i / 100)[1]).toBeGreaterThanOrEqual(c.clipY);
    const y = tubeUpper(t, 1)[1] + 0.5, xi = tubeWaterXi(t, tubeTopXi(t), y);
    expect(tubeUpper(t, xi)[1]).toBeCloseTo(y, 3);
  });
});
