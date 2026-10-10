import { describe, expect, it } from 'vitest';
import { CREASE_SKY, CREASE_SUN, MIST_ALBEDO, MIST_GROUND_BOUNCE, creaseLight, mistLightCpu } from './mistLight';

const base = { sunIlluminance: 1, skyIrradiance: 0, cosView: 0, nDotL: 0.5, sunVisibility: 1, isotropic: 0.3, groundTint: [0, 0, 0] as [number, number, number] };

describe('mistLight: one light for the foam volume, the spray and the mist (whitewater §6.3)', () => {
  it('glows backlit: looking toward the sun ≥ 3× side-lit', () => {
    const back = mistLightCpu({ ...base, cosView: 0.999 })[0], side = mistLightCpu({ ...base, cosView: 0 })[0];
    expect(back).toBeGreaterThanOrEqual(3 * side);
  });

  it('with no sun is the sky × albedo / π plus the ground bounce', () => {
    const g: [number, number, number] = [0.1, 0.3, 0.25];
    const c = mistLightCpu({ ...base, sunIlluminance: 0, skyIrradiance: 2, groundTint: g });
    for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo((2 * MIST_ALBEDO) / Math.PI + g[k] * MIST_GROUND_BOUNCE, 12);
  });

  it('is darker in the sun\'s shadow and never negative facing away from it', () => {
    expect(mistLightCpu({ ...base, sunVisibility: 0 })[0]).toBe(0);
    expect(mistLightCpu({ ...base, nDotL: -1 })[0]).toBeGreaterThanOrEqual(0);
    expect(mistLightCpu({ ...base, nDotL: 1 })[0]).toBeGreaterThan(mistLightCpu({ ...base, nDotL: -0.2 })[0]);
  });
});

describe('the creases in the foam volume (7b S3 ruling): the sky and the sun occluded between the clumps', () => {
  it('sky × (0.45 + 0.55 × clump), sun × (0.7 + 0.3 × clump); clump from the brightness of setFoamPattern (0.62 → 0, 1.07 → 1)', () => {
    expect(CREASE_SKY).toEqual([0.45, 0.55]);
    expect(CREASE_SUN).toEqual([0.7, 0.3]);
    expect(creaseLight(0.62)).toEqual({ sky: 0.45, sun: 0.7 });
    expect(creaseLight(1.07).sky).toBeCloseTo(1, 12);
    expect(creaseLight(1.07).sun).toBeCloseTo(1, 12);
    expect(creaseLight(2)).toEqual(creaseLight(1.07));
  });
  it('mistLightCpu takes the shares on the sky and the sun only (the ground bounce stays)', () => {
    const g: [number, number, number] = [0.1, 0.2, 0.3];
    const full = mistLightCpu({ ...base, skyIrradiance: 2, groundTint: g }), dim = mistLightCpu({ ...base, skyIrradiance: 2, groundTint: g, skyShare: 0.45, sunShare: 0.7 });
    const sky = (2 * MIST_ALBEDO) / Math.PI, sunPart = full[0] - sky - g[0] * MIST_GROUND_BOUNCE;
    expect(dim[0]).toBeCloseTo(0.7 * sunPart + 0.45 * sky + g[0] * MIST_GROUND_BOUNCE, 12);
  });
});
