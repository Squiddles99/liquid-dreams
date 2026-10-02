import { describe, expect, it } from 'vitest';
import { kmhToMs, msToKmh, surferFeetToHs } from './units';

describe('surferFeetToHs', () => {
  it('is set by the breaking face (Andrew, 2026-10-02): 12 ft as before (4.8 m), smaller sizes in proportion to (ft/12)^1.15', () => {
    expect(surferFeetToHs(12)).toBeCloseTo(4.8, 9);
    expect(surferFeetToHs(6)).toBeCloseTo(4.8 * 0.5 ** 1.15, 9);
    expect(surferFeetToHs(4)).toBeCloseTo(4.8 * (1 / 3) ** 1.15, 9);
    expect(surferFeetToHs(0)).toBe(0);
    for (let ft = 0.5; ft <= 20; ft += 0.5) expect(surferFeetToHs(ft)).toBeGreaterThan(surferFeetToHs(ft - 0.5));
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
