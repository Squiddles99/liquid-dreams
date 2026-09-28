import { describe, expect, it } from 'vitest';
import { makeRng, noiseLoop } from './voices';

/** Mean squared step over mean square: about 2 for white noise, far less for the darker colours. */
const hfRatio = (x: Float32Array): number => {
  let d = 0, s = 0;
  for (let i = 1; i < x.length; i++) { d += (x[i] - x[i - 1]) ** 2; s += x[i] ** 2; }
  return d / s;
};

describe('noise loops', () => {
  it('seeded: the same every run', () => {
    expect(Array.from(noiseLoop('pink', 1000, 7))).toEqual(Array.from(noiseLoop('pink', 1000, 7)));
    const r = makeRng(3);
    for (let j = 0; j < 1000; j++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('peak 1, finite, no DC; white brighter than pink brighter than brown', () => {
    const n = 48000;
    const w = noiseLoop('white', n, 1), p = noiseLoop('pink', n, 2), b = noiseLoop('brown', n, 3);
    for (const x of [w, p, b]) {
      expect(x.every(Number.isFinite)).toBe(true);
      expect(Math.max(...Array.from(x, Math.abs))).toBeCloseTo(1, 6);
      expect(Math.abs(x.reduce((s, v) => s + v, 0) / n)).toBeLessThan(0.05);
    }
    expect(hfRatio(w)).toBeGreaterThan(1.5);
    expect(hfRatio(p)).toBeLessThan(hfRatio(w) / 2);
    expect(hfRatio(b)).toBeLessThan(hfRatio(p) / 2);
  });
  it('loops without a click: the end steps into the start like any other sample', () => {
    const b = noiseLoop('brown', 48000, 5);
    let mean = 0;
    for (let i = 1; i < b.length; i++) mean += Math.abs(b[i] - b[i - 1]);
    mean /= b.length - 1;
    expect(Math.abs(b[0] - b[b.length - 1])).toBeLessThan(6 * mean);
  });
});
