import { describe, expect, it } from 'vitest';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { REEF_ALBEDO, SAND_ALBEDO, WEED_ALBEDO, bedSeenFromAbove, contrastAtDepth, luminance } from './bedLook';

const p = DEFAULT_WATER_OPTICS;
describe('seeing the reef from the face (spec 2026-10-02 §2.5)', () => {
  it('at 12 m, looking straight down, bare rock reads against weed (≥ 30% contrast) and sand against both (≥ 100%)', () => {
    expect(contrastAtDepth(REEF_ALBEDO, WEED_ALBEDO, 12, p)).toBeGreaterThanOrEqual(0.3);
    expect(contrastAtDepth(SAND_ALBEDO, REEF_ALBEDO, 12, p)).toBeGreaterThanOrEqual(1);
  });
  it('at 15 m the rock still reads against the weed (≥ 15%)', () => {
    expect(contrastAtDepth(REEF_ALBEDO, WEED_ALBEDO, 15, p)).toBeGreaterThanOrEqual(0.15);
  });
  it('the bed darkens and blues with depth: dimmer, and blue gaining on green, from 4 m to 12 m to 20 m', () => {
    for (const a of [REEF_ALBEDO, WEED_ALBEDO, SAND_ALBEDO]) {
      const [s4, s12, s20] = [4, 12, 20].map((d) => bedSeenFromAbove(a, d, p));
      expect(luminance(s12)).toBeLessThan(luminance(s4));
      expect(luminance(s20)).toBeLessThan(luminance(s12));
      expect(s20[2] / s20[1]).toBeGreaterThan(s4[2] / s4[1]);
    }
  });
  it('the reef stays dark: weed under 0.1 albedo, bare limestone under 0.3 (the turquoise is the foam’s, not the bed’s)', () => {
    expect(luminance(WEED_ALBEDO)).toBeLessThan(0.1);
    expect(luminance(REEF_ALBEDO)).toBeLessThan(0.3);
  });
});
