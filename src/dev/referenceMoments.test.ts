import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { decodeMoment, encodeMoment } from './momentLink';
import { DEFAULT_MOMENT_NAME, REFERENCE_MOMENTS, defaultMoment, findReferenceMoment } from './referenceMoments';

describe('reference moments', () => {
  it('have unique names', () => {
    const names = REFERENCE_MOMENTS.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('include every moment named in the spec', () => {
    expect(REFERENCE_MOMENTS.map((r) => r.name)).toEqual([
      'pre-dawn', 'first-sun', 'morning-offshore', 'late-morning', 'noon-deep-blue',
      'autumn-glass', 'golden-hour', 'sunset', 'overview',
    ]);
  });
  it('round-trip through moment links', () => {
    for (const r of REFERENCE_MOMENTS) expect(decodeMoment(encodeMoment(r.moment))).toEqual(r.moment);
  });
  it('are paused for reproducible screenshots', () => {
    for (const r of REFERENCE_MOMENTS) expect(r.moment.paused).toBe(true);
  });
  it('default moment uses the default conditions', () => {
    expect(DEFAULT_MOMENT_NAME).toBe('morning-offshore');
    expect(defaultMoment().conditions).toEqual(DEFAULT_CONDITIONS);
    expect(defaultMoment().paused).toBe(false);
  });
  it('autumn-glass has no wind', () => {
    expect(findReferenceMoment('autumn-glass')?.conditions.wind.speedMs).toBe(0);
  });
  it('findReferenceMoment returns independent copies', () => {
    const a = findReferenceMoment('sunset');
    a!.conditions.swell.sizeFt = 11;
    expect(findReferenceMoment('sunset')!.conditions.swell.sizeFt).toBe(4);
  });
});
