import { describe, expect, it } from 'vitest';
import { acceptReadback, holdFiniteHeights } from './HeightProbe';

const probes = (...h: number[]): Float32Array => {
  const a = new Float32Array(h.length * 4);
  h.forEach((v, i) => { a[i * 4] = v; a[i * 4 + 3] = 1; });
  return a;
};

describe('HeightProbe readback guard', () => {
  it('takes finite readbacks as they are', () => {
    expect(Array.from(holdFiniteHeights(probes(0.1, 0.2), probes(0.5, -0.3)))).toEqual(Array.from(probes(0.5, -0.3)));
  });
  it('holds the last good value for any probe that reads back NaN or Infinity', () => {
    const next = holdFiniteHeights(probes(0.25, 0.5, 0.75), probes(Number.NaN, 1.5, Number.POSITIVE_INFINITY));
    expect([next[0], next[4], next[8]]).toEqual([0.25, 1.5, 0.75]);
  });
  it('keeps a non-finite first readback unusable (no last good value yet)', () => {
    const next = holdFiniteHeights(null, probes(Number.NaN, 2));
    expect(Number.isNaN(next[0])).toBe(true);
    expect(next[4]).toBe(2);
  });
  it('drops a readback dispatched before the probes were invalidated (a moment jump): it measured the old spot', () => {
    // Generation 3 was current when the readback was dispatched; the jump invalidated to 4, clearing the held values.
    expect(acceptReadback(null, probes(1.5), 3, 4)).toBeNull();
    expect(Array.from(acceptReadback(probes(0.2), probes(1.5), 3, 4)!)).toEqual(Array.from(probes(0.2)));
    // Dispatched after the jump: taken (through the finite guard).
    expect(Array.from(acceptReadback(null, probes(-0.4), 4, 4)!)).toEqual(Array.from(probes(-0.4)));
  });
});
