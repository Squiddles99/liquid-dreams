import { describe, expect, it } from 'vitest';
import { CASCADE_FADES } from './cascadeFades';
import { DEFAULT_WATER_OPTICS, deepUpwelling, lipGlow, lipThroughLight, lipTransmissionColour, transmissionColour, unresolvedSlopeVariance, waterAlbedo } from './waterOptics';

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

describe("the lip's glow: its bubbles scatter light out on every side (spec 2026-10-03 lip-and-tube-look §4)", () => {
  const p = DEFAULT_WATER_OPTICS;
  const sun: [number, number, number] = [1, 1, 1], sky: [number, number, number] = [0.3, 0.35, 0.45];
  const luma = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  it('a thinner lip glows more turquoise (green and blue over red)', () => {
    const thin = lipGlow(p, 0.3, 0.5, sun, sky), thick = lipGlow(p, 1.5, 0.5, sun, sky);
    expect(thin[1] / thin[0]).toBeLessThan(thick[1] / thick[0]); // thick: red absorbed more, relative to green
    expect(thin[1]).toBeGreaterThan(thin[0]);
    expect(thin[2]).toBeGreaterThan(thin[0]);
  });
  it('from 0.1 m to 3 m the glow is never darker than the deep water under the same light', () => {
    for (let t = 0.1; t <= 3; t += 0.1) expect(luma(lipGlow(p, t, 0.5, sun, sky)), `t ${t.toFixed(1)} m`).toBeGreaterThanOrEqual(luma(deepUpwelling(p, 0.5, sun, sky)));
  });
  it('the sun in front still lights it (no backlight)', () => {
    expect(luma(lipGlow(p, 1.5, 0.8, sun, [0, 0, 0]))).toBeGreaterThan(0);
  });
  it('overcast (no direct sun): the sky alone still lights it', () => {
    expect(luma(lipGlow(p, 1.5, 0, [0, 0, 0], sky))).toBeGreaterThan(0);
  });
  it('the sun behind the lip lights it more than the sun in front at the same angle to its surface', () => {
    const front = lipGlow(p, 1.5, 0.5, sun, sky).map((c, i) => c + lipThroughLight(p, 1.5, -0.5, 0, sun, sky)[i]);
    const behind = lipGlow(p, 1.5, 0.5, sun, sky).map((c, i) => c + lipThroughLight(p, 1.5, 0.9, 0, sun, sky)[i]);
    expect(luma(behind)).toBeGreaterThan(luma(front));
  });
});
