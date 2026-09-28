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
  it('rock density defaults to 1 and is clamped to 0–2 (Phase 4c-1 §3.5)', () => {
    expect(DEFAULT_LAND_PARAMS.rockDensity).toBe(1);
    const p = { ...DEFAULT_LAND_PARAMS, rockDensity: 5 };
    normalizeLandParams(p);
    expect(p.rockDensity).toBe(2);
    p.rockDensity = -1;
    normalizeLandParams(p);
    expect(p.rockDensity).toBe(0);
  });
});
