import { describe, expect, it } from 'vitest';
import { BOMBIE_PARAM_RANGES, DEFAULT_BOMBIE_PARAMS, normalizeBombieParams } from './bombieParams';

describe('Bombie params', () => {
  it('default on, size 1, threshold 6 ft; clamps and repairs', () => {
    expect(DEFAULT_BOMBIE_PARAMS).toEqual({ enabled: true, size: 1, thresholdFt: 6 });
    const p = { enabled: 'x' as unknown as boolean, size: 9, thresholdFt: Number.NaN };
    normalizeBombieParams(p);
    expect(p).toEqual({ enabled: true, size: BOMBIE_PARAM_RANGES.size.max, thresholdFt: 6 });
  });
});
