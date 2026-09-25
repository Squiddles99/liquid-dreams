import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from './rng';

describe('createRng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(2002), b = createRng(2002);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('differs between seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it('next() is in [0, 1)', () => {
    const r = createRng(99);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('gaussian() has mean ~0 and variance ~1', () => {
    const r = createRng(5);
    const n = 20000;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) { const g = r.gaussian(); sum += g; sumSq += g * g; }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sumSq / n - mean * mean - 1)).toBeLessThan(0.05);
  });
});

describe('deriveSeed', () => {
  it('is deterministic and salt-sensitive', () => {
    expect(deriveSeed(2002, 0)).toBe(deriveSeed(2002, 0));
    expect(deriveSeed(2002, 0)).not.toBe(deriveSeed(2002, 1));
    expect(deriveSeed(2002, 1)).toBeGreaterThanOrEqual(0);
    expect(deriveSeed(2002, 1)).toBeLessThanOrEqual(0xffffffff);
  });
});
