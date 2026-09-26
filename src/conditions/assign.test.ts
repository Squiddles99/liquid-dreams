import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, assignConditions, cloneConditions } from './defaults';

describe('assignConditions', () => {
  it('copies values while preserving object identities', () => {
    const target = cloneConditions(DEFAULT_CONDITIONS);
    const swell = target.swell, wind = target.wind;
    const source = { ...cloneConditions(DEFAULT_CONDITIONS), timeOfDay: 17, swell: { sizeFt: 6, periodS: 18, directionDeg: 230 }, wind: { speedMs: 0, directionDeg: 90 } };
    assignConditions(target, source);
    expect(target).toEqual(source);
    expect(target.swell).toBe(swell);
    expect(target.wind).toBe(wind);
    expect(target.swell).not.toBe(source.swell);
  });
});
