import { describe, expect, it } from 'vitest';
import { CASCADE_FADES } from './cascadeFades';
import { DEFAULT_WATER_OPTICS, transmissionColour, unresolvedSlopeVariance, waterAlbedo } from './waterOptics';

describe('water optics', () => {
  it('deep clear water scatters blue', () => {
    const [r, g, b] = waterAlbedo(DEFAULT_WATER_OPTICS);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    expect(b).toBeLessThan(1);
    expect(r).toBeGreaterThan(0);
  });
  it('light through 2 m of water turns turquoise', () => {
    const [r, g, b] = transmissionColour(DEFAULT_WATER_OPTICS);
    expect(r).toBeLessThan(0.5);
    expect(g).toBeGreaterThan(0.8);
    expect(b).toBeGreaterThan(0.9);
  });
  it('unresolved slope variance is 0 up close and the full sum far away', () => {
    const sv = [0.001, 0.01, 0.02];
    expect(unresolvedSlopeVariance(0, sv, CASCADE_FADES)).toBe(0);
    expect(unresolvedSlopeVariance(1e6, sv, CASCADE_FADES)).toBeCloseTo(0.031);
    expect(unresolvedSlopeVariance(1000, sv, CASCADE_FADES)).toBeGreaterThan(unresolvedSlopeVariance(100, sv, CASCADE_FADES));
  });
});
