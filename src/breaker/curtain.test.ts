import { describe, expect, it } from 'vitest';
import { CURTAIN_MAX_MIP, CURTAIN_TRANSMIT, RIBBON_RENDER_ORDER, curtainBlurMip, curtainRefractShift, curtainSeeThrough } from './curtain';
import { BACKLIGHT_WIDE_SHARE, backlightCpu, tubeSeenCpu } from '../ocean/waterShading';
import { LIP_CHOP_SHARE, STREAK_CASCADE, STREAK_STRETCH } from './BreakingRibbon';

describe('the curtain is water (breaking-look item 7)', () => {
  it('a clear face-on curtain shows CURTAIN_TRANSMIT of the scene behind; foam (the torn edge, the landed curtain) hides it', () => {
    expect(curtainSeeThrough(1, 0, 0)).toBeCloseTo(CURTAIN_TRANSMIT, 9);
    expect(curtainSeeThrough(1, 1, 0)).toBe(0);
    expect(curtainSeeThrough(0, 0, 0)).toBe(0);
    // White cover through the clean curtain <= 0.3 (the bar): with no foam the see-through share is the curtain's.
    expect(curtainSeeThrough(1, 0.3, 0.1)).toBeLessThan(curtainSeeThrough(1, 0, 0.1));
  });

  it('the blur grows with the thickness (mip level), capped; the refraction shifts more through more water', () => {
    expect(curtainBlurMip(0)).toBe(0);
    expect(curtainBlurMip(0.5)).toBeGreaterThan(1);
    expect(curtainBlurMip(1.5)).toBeGreaterThan(curtainBlurMip(0.5));
    expect(curtainBlurMip(100)).toBeLessThanOrEqual(CURTAIN_MAX_MIP);
    expect(curtainRefractShift(1)).toBeGreaterThan(curtainRefractShift(0.1));
  });

  it("the ribbon draws first in the transparent pass (after the opaques; before the sprites)", () => {
    expect(RIBBON_RENDER_ORDER).toBeLessThan(0);
  });
});

describe('the barrel inside (breaking-look item 2)', () => {
  it('the lip keeps 0.6 of the chop; cascade 1 stretched 2.5 : 1 up the face', () => {
    expect(LIP_CHOP_SHARE).toBe(0.6);
    expect(STREAK_CASCADE).toBe(1);
    expect(STREAK_STRETCH).toBe(2.5);
  });

  it('a reflected ray inside the tube sees the mouth sky where open (skyOpen 1), the lip-transmitted light where roofed (0)', () => {
    const seen = 5, tc = 0.4, sky = 2, sun = 100;
    expect(tubeSeenCpu(seen, tc, sky, sun, 0.5, 0.2, 1, 1)).toBeCloseTo(seen, 9);
    const roofed = tubeSeenCpu(seen, tc, sky, sun, 0.5, 0.2, 1, 0);
    expect(roofed).toBeCloseTo((tc * (sky * 0.5 + sun * 0.2 * 0.05)) / Math.PI, 9);
    expect(roofed).toBeGreaterThan(0);
  });

  it('the backlight: a 0.3 share of a wider lobe, so a side sun shows through a thin lip', () => {
    expect(BACKLIGHT_WIDE_SHARE).toBe(0.3);
    expect(backlightCpu(1)).toBeCloseTo(1, 9);
    expect(backlightCpu(0.5)).toBeGreaterThan(0.5 ** 4);
  });
});
