import { describe, expect, it } from 'vitest';
import { HeaveFilter, balanceAt } from './balance';

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

describe('the heave the knees feel (final review: stepped probe readbacks made the knees pump at the clamp)', () => {
  // A 1 m, 12 s swell read back the way HeightProbe delivers it: a new height only every other frame at 60 fps.
  const w = (2 * Math.PI) / 12, A = 1;
  const run = (frames: number, hold: number): { got: number[]; want: number[] } => {
    const f = new HeaveFilter(), got: number[] = [], want: number[] = [];
    let y = 0;
    for (let i = 0; i < frames; i++) {
      const t = i / 60;
      if (i % hold === 0) y = A * Math.sin(w * t);
      got.push(f.update(y, t));
      want.push(-A * w * w * Math.sin(w * t));
    }
    return { got, want };
  };
  it('follows the swell’s real acceleration once settled, within 0.15 m/s²', () => {
    const { got, want } = run(60 * 20, 2);
    for (let i = 60 * 5; i < got.length; i++) expect(Math.abs(got[i] - want[i]), `frame ${i}`).toBeLessThan(0.15);
  });
  it('ignores the readback steps: frame to frame it changes by under 0.05 m/s² (the raw second difference swung by tens)', () => {
    const { got } = run(60 * 20, 3);
    for (let i = 60 * 5; i < got.length; i++) expect(Math.abs(got[i] - got[i - 1]), `frame ${i}`).toBeLessThan(0.05);
  });
  it('starts from rest, and resets to 0 when time stands still or jumps', () => {
    const f = new HeaveFilter();
    expect(f.update(3, 10)).toBe(0);
    f.update(3.1, 10 + 1 / 60);
    expect(f.update(3.2, 10 + 1 / 60)).toBe(0); // paused: no time passed
    expect(f.update(-4, 50)).toBe(0); // a moment jump
    expect(Number.isFinite(f.update(-4, 50 + 1 / 60))).toBe(true);
  });
});
