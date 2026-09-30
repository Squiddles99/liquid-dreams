import { describe, expect, it } from 'vitest';
import { CASCADE_FADES } from './cascadeFades';
import { DEFAULT_WATER_OPTICS, lipTransmissionColour, transmissionColour, unresolvedSlopeVariance, waterAlbedo } from './waterOptics';

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

describe("the lip's light (spec 2026-09-29 §3.3)", () => {
  it("the lip's colour deepens with its thickness: turquoise where thin, blue-green where thick (Beer–Lambert)", () => {
    const p = DEFAULT_WATER_OPTICS;
    const thin = lipTransmissionColour(p, 0.3), thick = lipTransmissionColour(p, 0.8);
    expect(thin).toEqual(transmissionColour(p)); // the reference thickness is the slider's path
    expect(thin[1]).toBeGreaterThan(thin[0]);
    expect(thin[2]).toBeGreaterThan(thin[0]);
    for (let i = 0; i < 3; i++) expect(thick[i]).toBeLessThanOrEqual(thin[i]);
    expect(thick[0] / thin[0]).toBeLessThan(thick[1] / thin[1]); // red goes first: deeper blue-green
    expect(lipTransmissionColour(p, 0)).toEqual([1, 1, 1]);
  });
});
