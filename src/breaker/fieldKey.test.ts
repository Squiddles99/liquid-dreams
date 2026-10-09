import { describe, expect, it } from 'vitest';
import { fieldKey } from './fieldKey';

const c = { swell: { periodS: 14, directionDeg: 225 }, tideM: -0.25 };
describe('the reef field key (what re-bakes the field)', () => {
  it('changes with the peel and the conditions it bakes from, and with nothing else', () => {
    const base = fieldKey(c, { a: 1 }, 1.7);
    expect(fieldKey(c, { a: 1 }, 1.7)).toBe(base);
    expect(fieldKey(c, { a: 1 }, 1.8)).not.toBe(base);
    expect(fieldKey({ ...c, tideM: 0 }, { a: 1 }, 1.7)).not.toBe(base);
    expect(fieldKey(c, { a: 2 }, 1.7)).not.toBe(base);
  });
  it("changes with the curl's top speed (one-curl §3d: baked into the record)", () => {
    expect(fieldKey(c, { a: 1 }, 1.7, 12)).not.toBe(fieldKey(c, { a: 1 }, 1.7, 20));
    expect(fieldKey(c, { a: 1 }, 1.7, 20)).toBe(fieldKey(c, { a: 1 }, 1.7, 20));
  });
});
