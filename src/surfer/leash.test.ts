import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { deckYAt, halfWidthAt, layoutFor, makeBoard, uAt } from '../board/boardSpec';
import { leashCurve, tubeIndices, tubePositions } from './leash';

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
