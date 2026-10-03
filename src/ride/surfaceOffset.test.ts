import { describe, expect, it } from 'vitest';
import { SurfaceOffset } from './surfaceOffset';

describe('the drawn sea over the ride water', () => {
  it('matches a reading to the request it answers, takes the first at once and eases after', () => {
    const o = new SurfaceOffset();
    o.sent(1, -1.7);
    o.sent(2, -1.5);
    o.read(1, -0.5, 1 / 60); // request 1: drawn 1.2 m above the ride's water
    expect(o.value).toBeCloseTo(1.2, 9);
    o.read(2, 0.3, 0.3); // request 2 says 1.8: eased toward it
    expect(o.value).toBeGreaterThan(1.2);
    expect(o.value).toBeLessThan(1.8);
  });

  it('ignores a reading with no request on record, or no reading', () => {
    const o = new SurfaceOffset();
    o.sent(5, 0);
    o.read(4, 2, 0.1);
    o.read(5, null, 0.1);
    expect(o.value).toBe(0);
    o.reset();
    o.sent(1, 0);
    o.read(1, 0.4, 0.1);
    expect(o.value).toBeCloseTo(0.4, 9);
  });
});
