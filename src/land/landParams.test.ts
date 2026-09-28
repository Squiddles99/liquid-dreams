import { describe, expect, it } from 'vitest';
import { DEFAULT_LAND_PARAMS, LAND_PARAM_RANGES, beachProfileFor, normalizeLandParams } from './landParams';
import { DEFAULT_BEACH } from './landHeight';

describe('LandParams', () => {
  it('defaults give the spec beach', () => {
    expect(beachProfileFor(DEFAULT_LAND_PARAMS)).toEqual(DEFAULT_BEACH);
  });
  it('normalize clamps every numeric field to its range and fixes non-finite values', () => {
    const p = { ...DEFAULT_LAND_PARAMS, sandBrightness: 99, heathSilver: -1, beachWidthM: Number.NaN };
    normalizeLandParams(p);
    expect(p.sandBrightness).toBe(LAND_PARAM_RANGES.sandBrightness.max);
    expect(p.heathSilver).toBe(LAND_PARAM_RANGES.heathSilver.min);
    expect(p.beachWidthM).toBe(DEFAULT_LAND_PARAMS.beachWidthM);
  });
});
