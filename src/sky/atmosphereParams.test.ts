import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE, extinctionPerKm, ozoneDensity } from './atmosphereParams';

describe('atmosphere params', () => {
  it('sea-level extinction = Rayleigh + hazy Mie (no ozone at the ground)', () => {
    const [r, g, b] = extinctionPerKm(0, DEFAULT_ATMOSPHERE);
    expect(b).toBeCloseTo(0.0331 + 0.00444 * 2, 6);
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(b);
  });
  it('haze factor scales only the aerosol term', () => {
    const clear = extinctionPerKm(0, { ...DEFAULT_ATMOSPHERE, hazeFactor: 1 });
    expect(clear[2]).toBeCloseTo(0.0331 + 0.00444, 6);
  });
  it('ozone peaks at 25 km and vanishes at the ground and above 40 km', () => {
    expect(ozoneDensity(25, DEFAULT_ATMOSPHERE)).toBe(1);
    expect(ozoneDensity(0, DEFAULT_ATMOSPHERE)).toBe(0);
    expect(ozoneDensity(41, DEFAULT_ATMOSPHERE)).toBe(0);
  });
});
