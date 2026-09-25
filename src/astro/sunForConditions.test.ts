import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { sunForConditions } from './sunForConditions';

describe('sunForConditions', () => {
  it('default conditions give the 08:15 July sun, low in the NE', () => {
    const s = sunForConditions(DEFAULT_CONDITIONS);
    expect(s.elevationDeg).toBeCloseTo(8.542, 1);
    expect(s.azimuthDeg).toBeCloseTo(56.742, 1);
    expect(s.direction[0]).toBeGreaterThan(0); // east
    expect(s.direction[2]).toBeLessThan(0);    // north
  });
  it('midnight puts the sun well below the horizon', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.timeOfDay = 0;
    expect(sunForConditions(c).elevationDeg).toBeLessThan(-30);
  });
});
