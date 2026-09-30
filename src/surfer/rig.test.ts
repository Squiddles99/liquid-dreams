import { describe, expect, it } from 'vitest';
import { BONES, PARENT, measures, referenceSkeleton } from './rig';

describe('the skeleton contract (spec §3.3)', () => {
  it('has 23 bones, each parent listed before its children', () => {
    expect(BONES.length).toBe(23);
    BONES.forEach((b, i) => {
      const p = PARENT[b];
      if (p) expect(BONES.indexOf(p)).toBeLessThan(i);
    });
  });
  it('scales the reference skeleton to the rider: legs about 0.49 H, stance joints where expected', () => {
    const m = measures(referenceSkeleton(1.78));
    expect(m.legLen / 1.78).toBeGreaterThan(0.47);
    expect(m.legLen / 1.78).toBeLessThan(0.51);
    expect(m.hipDrop).toBeGreaterThan(0);
    expect(m.ankleH).toBeCloseTo(0.039 * 1.78, 9);
  });
});
