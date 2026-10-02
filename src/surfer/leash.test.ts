import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { deckYAt, halfWidthAt, layoutFor, makeBoard, uAt } from '../board/boardSpec';
import { CUFF_SIDES, cuffPositions, leashCuff, leashCurve, leashStart, tubeIndices, tubePositions } from './leash';

describe('the leash', () => {
  const spec = makeBoard('thruster', { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 });
  const lay = layoutFor(spec, 1.78);
  const deck = (x: number, z: number): number | null => (Math.abs(x) <= spec.lengthM / 2 && Math.abs(z) <= halfWidthAt(spec, uAt(spec, x)) ? deckYAt(spec, x, z) : null);

  it('runs from the ankle to the plug and never passes through the deck', () => {
    for (const ankle of [new Vector3(lay.spots.back[0], lay.spots.back[1] + 0.07, 0.05), new Vector3(-1.4, -0.3, 0.3), new Vector3(0.2, 0.5, -0.4)]) {
      const pts = leashCurve(ankle, new Vector3(...lay.leashPlug), lay.leashLengthM, deck);
      expect(pts.length).toBe(17);
      expect(pts[0].distanceTo(ankle)).toBeLessThan(0.013);
      for (const p of pts) {
        const d = deck(p.x, p.z);
        if (d !== null) expect(p.y).toBeGreaterThanOrEqual(d);
      }
    }
  });
  it('sags with slack and pulls straight when taut', () => {
    const a = new Vector3(0, 1, 0), b = new Vector3(1, 1, 0), none = (): null => null;
    expect(Math.min(...leashCurve(a, b, 3, none).map((p) => p.y))).toBeLessThan(0.9);
    expect(Math.min(...leashCurve(a, b, 1, none).map((p) => p.y))).toBeCloseTo(1, 9);
  });
  it('builds a tube of the right size around the curve', () => {
    const pts = [new Vector3(0, 0, 0), new Vector3(0.5, 0, 0), new Vector3(1, 0.2, 0)];
    const out = new Float32Array(pts.length * 6 * 3);
    tubePositions(pts, 0.004, 6, out);
    for (let i = 0; i < pts.length; i++) for (let k = 0; k < 6; k++) {
      const o = (i * 6 + k) * 3;
      expect(Math.hypot(out[o] - pts[i].x, out[o + 1] - pts[i].y, out[o + 2] - pts[i].z)).toBeCloseTo(0.004, 6);
    }
    expect(tubeIndices(3, 6).length).toBe(2 * 6 * 2 * 3);
  });
});

describe('the leash cuff (Andrew: strapped to his wrist)', () => {
  const V = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
  const joint = {
    forearm_r: V(0.3, 1.2, 0), hand_r: V(0.55, 1.2, 0),
    shin_l: V(-0.1, 0.5, 0), foot_l: V(-0.1, 0.08, 0), shin_r: V(0.1, 0.5, 0), foot_r: V(0.1, 0.08, 0),
  };
  it("cuffs a bodyboarder's right wrist, round the forearm just above the wrist joint", () => {
    const c = leashCuff('bodyboard', 'regular', joint, 1.42);
    expect(c.centre.distanceTo(joint.hand_r)).toBeGreaterThan(0.015);
    expect(c.centre.distanceTo(joint.hand_r)).toBeLessThan(0.05);
    expect(c.centre.x).toBeLessThan(joint.hand_r.x); // up the forearm from the wrist, not on the hand
    expect(c.axis.dot(V(1, 0, 0))).toBeGreaterThan(0.99);
    expect(c.radius).toBeGreaterThan(0.02);
    expect(c.radius).toBeLessThan(0.035);
  });
  it("cuffs a surfer's trailing ankle (regular: the right), above the ankle joint", () => {
    const c = leashCuff('thruster', 'regular', joint, 1.78);
    expect(c.centre.x).toBeCloseTo(0.1, 6);
    expect(c.centre.y).toBeGreaterThan(joint.foot_r.y + 0.02);
    expect(c.centre.y).toBeLessThan(joint.foot_r.y + 0.1);
    expect(leashCuff('thruster', 'goofy', joint, 1.78).centre.x).toBeCloseTo(-0.1, 6);
  });
  it("leaves from the cuff's side toward the plug", () => {
    const c = leashCuff('bodyboard', 'regular', joint, 1.42), plug = V(0.5, 0.6, 0.4);
    const s = leashStart(c, plug), off = s.clone().sub(c.centre);
    expect(off.length()).toBeCloseTo(c.radius, 6);
    expect(Math.abs(off.dot(c.axis))).toBeLessThan(1e-9);
    expect(off.dot(plug.clone().sub(c.centre))).toBeGreaterThan(0);
  });
  it("is a band of the cuff's radius round its axis, its width along it", () => {
    const c = leashCuff('bodyboard', 'regular', joint, 1.42);
    const out = new Float32Array(2 * CUFF_SIDES * 3);
    cuffPositions(c, out);
    for (let i = 0; i < 2 * CUFF_SIDES; i++) {
      const q = V(out[3 * i], out[3 * i + 1], out[3 * i + 2]).sub(c.centre);
      const along = q.dot(c.axis);
      expect(Math.abs(Math.abs(along) - c.width / 2)).toBeLessThan(1e-6);
      expect(q.addScaledVector(c.axis, -along).length()).toBeCloseTo(c.radius, 6);
    }
  });
});
