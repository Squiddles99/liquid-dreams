import { describe, expect, it } from 'vitest';
import { balanceAt } from './balance';

describe('the balance layer (spec §3.6)', () => {
  it('is deterministic for a seed and a time', () => expect(balanceAt(7, 12.5, 1, 0)).toEqual(balanceAt(7, 12.5, 1, 0)));
  it('is still with amount 0, and small otherwise (≤ 3 cm per axis at amount 1)', () => {
    const z = balanceAt(7, 3, 0, 0);
    expect(z.lead.length() + z.trail.length()).toBe(0);
    for (let t = 0; t < 20; t += 0.37) {
      const b = balanceAt(7, t, 1, 0);
      for (const v of [b.lead, b.trail]) for (const c of [v.x, v.y, v.z]) expect(Math.abs(c)).toBeLessThanOrEqual(0.03 + 1e-12);
    }
  });
  it('absorbs heave in the knees, within ±0.15 of compression', () => {
    expect(balanceAt(7, 0, 1, 3).compression).toBeCloseTo(0.06, 9);
    expect(balanceAt(7, 0, 1, 100).compression).toBe(0.15);
    expect(balanceAt(7, 0, 1, -100).compression).toBe(-0.15);
  });
});
