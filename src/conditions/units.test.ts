import { describe, expect, it } from 'vitest';
import { kmhToMs, msToKmh, surferFeetToHs } from './units';

describe('surferFeetToHs', () => {
  it('uses the provisional 0.4 m per surfer foot', () => {
    expect(surferFeetToHs(4)).toBeCloseTo(1.6);
    expect(surferFeetToHs(0)).toBe(0);
  });
  it('never returns negative heights', () => {
    expect(surferFeetToHs(-2)).toBe(0);
  });
});

describe('msToKmh / kmhToMs', () => {
  it('3 m/s is 10.8 km/h', () => {
    expect(msToKmh(3)).toBeCloseTo(10.8, 9);
  });
  it('round-trips exactly (to 1e-9) across the panel range', () => {
    for (const ms of [0, 3, 7.4, 30]) expect(kmhToMs(msToKmh(ms))).toBeCloseTo(ms, 9);
    for (const kmh of [0, 10.8, 45, 108]) expect(msToKmh(kmhToMs(kmh))).toBeCloseTo(kmh, 9);
  });
});
