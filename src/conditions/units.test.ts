import { describe, expect, it } from 'vitest';
import { surferFeetToHs } from './units';

describe('surferFeetToHs', () => {
  it('uses the provisional 0.4 m per surfer foot', () => {
    expect(surferFeetToHs(4)).toBeCloseTo(1.6);
    expect(surferFeetToHs(0)).toBe(0);
  });
  it('never returns negative heights', () => {
    expect(surferFeetToHs(-2)).toBe(0);
  });
});
