import { describe, expect, it } from 'vitest';
import { FAR_DEPTH_M, REEF_SURROUND_DEPTH_M, SHORE_FLAT_DEPTH_M, SHORE_X, depthBg } from './coastProfile';

describe('1D coast profile', () => {
  it('is 13 m from 140 m off the beach, 30 m at the map\'s west edge and beyond, and a shallow flat landward', () => {
    expect(depthBg(SHORE_X - 140)).toBeCloseTo(REEF_SURROUND_DEPTH_M, 5);
    expect(depthBg(-400)).toBeCloseTo(FAR_DEPTH_M, 5);
    expect(depthBg(-5000)).toBe(FAR_DEPTH_M);
    expect(depthBg(SHORE_X + 10)).toBe(SHORE_FLAT_DEPTH_M);
  });
  it('never gets deeper moving shoreward (east)', () => {
    let prev = depthBg(-1000);
    for (let x = -1000; x <= 400; x += 0.5) {
      const d = depthBg(x);
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
    }
  });
});
