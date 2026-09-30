import { describe, expect, it } from 'vitest';
import { easeStops, meterLuminance } from './cloudMeter';

describe('easeStops', () => {
  it('moves toward the target at the rate, like an eye adapting, and never overshoots', () => {
    expect(easeStops(0, 2, 0.5, 1)).toBeCloseTo(0.5, 12);
    expect(easeStops(0, 2, 5, 1)).toBe(2);
    expect(easeStops(2, 0, 0.25, 1)).toBeCloseTo(1.75, 12);
    expect(easeStops(1, 1, 1, 1)).toBe(1);
  });
});

describe('meterLuminance', () => {
  it('reads the light on a level surface: the sun (through the cloud) at its elevation plus the sky', () => {
    const sun: [number, number, number] = [10, 10, 10], sky: [number, number, number] = [1, 1, 1];
    expect(meterLuminance(sun, 0.5, 1, sky)).toBeCloseTo(6, 9);
    expect(meterLuminance(sun, 0.5, 0, sky)).toBeCloseTo(1, 9);
    expect(meterLuminance(sun, -0.2, 1, sky)).toBeCloseTo(1, 9);
  });
});
