import { describe, expect, it } from 'vitest';
import { bearingToWorldXZ, travelDirectionXZ } from './directions';

const close = (a: { x: number; z: number }, x: number, z: number) => {
  expect(a.x).toBeCloseTo(x, 6);
  expect(a.z).toBeCloseTo(z, 6);
};

describe('bearingToWorldXZ (+X east, +Z south)', () => {
  it('north is -Z', () => close(bearingToWorldXZ(0), 0, -1));
  it('east is +X', () => close(bearingToWorldXZ(90), 1, 0));
  it('south is +Z', () => close(bearingToWorldXZ(180), 0, 1));
  it('west is -X', () => close(bearingToWorldXZ(270), -1, 0));
});

describe('travelDirectionXZ', () => {
  it('SW swell (from 225) travels toward the NE', () => close(travelDirectionXZ(225), Math.SQRT1_2, -Math.SQRT1_2));
  it('easterly wind (from 80) blows out to sea (westward)', () => {
    expect(travelDirectionXZ(80).x).toBeLessThan(-0.9);
  });
});
