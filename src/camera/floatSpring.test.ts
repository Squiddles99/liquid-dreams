import { describe, expect, it } from 'vitest';
import { stepCriticalSpring } from './floatSpring';

describe('stepCriticalSpring', () => {
  it('converges to the target', () => {
    let s = { value: 0, velocity: 0 };
    for (let i = 0; i < 300; i++) s = stepCriticalSpring(s, 1, 4, 1 / 60);
    expect(s.value).toBeCloseTo(1, 4);
  });
  it('does not overshoot from rest', () => {
    let s = { value: 0, velocity: 0 };
    for (let i = 0; i < 300; i++) {
      s = stepCriticalSpring(s, 1, 4, 1 / 60);
      expect(s.value).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('is stable for the largest frame step', () => {
    let s = { value: 0, velocity: 0 };
    for (let i = 0; i < 100; i++) s = stepCriticalSpring(s, 1, 4, 0.1);
    expect(Number.isFinite(s.value)).toBe(true);
    expect(s.value).toBeCloseTo(1, 3);
  });
});
