import { describe, expect, it } from 'vitest';
import { fbm2, valueNoise2 } from './noise';

describe('seeded noise', () => {
  it('is deterministic and seed-dependent', () => {
    expect(valueNoise2(12.3, -4.5, 7)).toBe(valueNoise2(12.3, -4.5, 7));
    expect(valueNoise2(12.3, -4.5, 7)).not.toBe(valueNoise2(12.3, -4.5, 8));
  });
  it('stays in range and is continuous', () => {
    let prev = valueNoise2(0, 3.3, 1);
    for (let i = 1; i <= 2000; i++) {
      const v = valueNoise2(i * 0.01, 3.3, 1);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });
  it('fbm stays roughly within [-1, 1]', () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm2(i * 1.7, i * -0.9, 3);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    }
  });
});
