import { describe, expect, it } from 'vitest';
import { smoothstep } from './smoothstep';

describe('smoothstep', () => {
  it('is 0 at e0 and below', () => {
    expect(smoothstep(10, 20, 10)).toBe(0);
    expect(smoothstep(10, 20, 5)).toBe(0);
  });
  it('is 1 at e1 and above', () => {
    expect(smoothstep(10, 20, 20)).toBe(1);
    expect(smoothstep(10, 20, 25)).toBe(1);
  });
  it('is 0.5 at the midpoint', () => {
    expect(smoothstep(10, 20, 15)).toBe(0.5);
  });
  it('works with e0 > e1 (inverted range)', () => {
    expect(smoothstep(125, 100, 110)).toBeCloseTo(0.648, 3);
  });
  it('is smooth and monotonic', () => {
    let prev = smoothstep(0, 100, 0);
    for (let x = 1; x <= 100; x++) {
      const v = smoothstep(0, 100, x);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
