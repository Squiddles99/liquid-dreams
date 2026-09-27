import { describe, expect, it } from 'vitest';
import { NEAR_FADE_M, SPRAY_PHASE_ISOTROPIC, nearCameraFade, sprayPhase } from './sprayLook';

describe('the spray look', () => {
  it('mist glows backlit and stays white side-on: a forward peak plus an isotropic part for multiple scattering', () => {
    const iso = 1 / (4 * Math.PI);
    expect(sprayPhase(1)).toBeGreaterThan(15 * iso); // backlit: the gold glow (~20× isotropic)
    expect(sprayPhase(0)).toBeGreaterThanOrEqual(SPRAY_PHASE_ISOTROPIC * iso); // side-lit: never darker than the multiple-scattering floor
    expect(sprayPhase(-1)).toBeGreaterThanOrEqual(SPRAY_PHASE_ISOTROPIC * iso); // front-lit (sun behind you): faint white
    expect(sprayPhase(1)).toBeGreaterThan(sprayPhase(0));
    expect(sprayPhase(0)).toBeGreaterThan(sprayPhase(-1));
  });
  it('the phase function integrates to 1 over the sphere (energy conserving)', () => {
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) { const c = -1 + (2 * (i + 0.5)) / n; sum += sprayPhase(c) * 2 * Math.PI * (2 / n); }
    expect(sum).toBeCloseTo(1, 3);
  });
  it('puffs near the camera fade out, so the eye inside the veil is not covered by a giant sprite', () => {
    expect(nearCameraFade(0)).toBe(0);
    expect(nearCameraFade(NEAR_FADE_M[0])).toBe(0);
    expect(nearCameraFade(NEAR_FADE_M[1])).toBe(1);
    expect(nearCameraFade(50)).toBe(1);
    expect(nearCameraFade((NEAR_FADE_M[0] + NEAR_FADE_M[1]) / 2)).toBeCloseTo(0.5, 9);
  });
});
