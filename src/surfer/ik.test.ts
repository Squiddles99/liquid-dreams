import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { aimRotation, flexDeg, minReach, twoBoneIK } from './ik';

const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

describe('two-bone IK', () => {
  it('reaches a target within reach exactly, keeps both lengths, and bends toward the pole', () => {
    const root = v(0, 1, 0), target = v(0.1, 0.3, 0.2), pole = v(0, 0, 1);
    const r = twoBoneIK(root, target, 0.45, 0.42, pole, 150);
    expect(r.reached).toBe(true);
    expect(r.end.distanceTo(target)).toBeLessThan(1e-9);
    expect(r.mid.distanceTo(root)).toBeCloseTo(0.45, 9);
    expect(r.mid.distanceTo(r.end)).toBeCloseTo(0.42, 9);
    const along = target.clone().sub(root).normalize();
    const off = r.mid.clone().sub(root).sub(along.multiplyScalar(r.mid.clone().sub(root).dot(along)));
    expect(off.dot(pole)).toBeGreaterThan(0);
  });
  it('clamps an out-of-reach target onto the line toward it without flipping', () => {
    const r = twoBoneIK(v(0, 0, 0), v(0, -5, 0), 0.45, 0.42, v(0, 0, 1), 150);
    expect(r.reached).toBe(false);
    expect(r.end.x).toBeCloseTo(0, 9);
    expect(r.end.length()).toBeLessThanOrEqual(0.87);
    expect(r.mid.z).toBeGreaterThanOrEqual(0);
  });
  it('never folds past the flex limit, and survives a pole along the limb', () => {
    const r = twoBoneIK(v(0, 0, 0), v(0, -0.01, 0), 0.45, 0.42, v(0, -1, 0), 150);
    expect(flexDeg(v(0, 0, 0), r.mid, r.end)).toBeLessThanOrEqual(150 + 1e-6);
    expect([r.mid.x, r.mid.y, r.mid.z].every(Number.isFinite)).toBe(true);
    expect(r.end.length()).toBeCloseTo(minReach(0.45, 0.42, 150), 6);
  });
});

describe('aimRotation', () => {
  it('turns the rest direction onto the new one and the rest secondary toward the new secondary', () => {
    const q = aimRotation(v(0, -1, 0), v(0, 0, 1), v(1, 0, 0), v(0, 1, 0));
    expect(v(0, -1, 0).applyQuaternion(q).distanceTo(v(1, 0, 0))).toBeLessThan(1e-9);
    expect(v(0, 0, 1).applyQuaternion(q).distanceTo(v(0, 1, 0))).toBeLessThan(1e-9);
  });
});
