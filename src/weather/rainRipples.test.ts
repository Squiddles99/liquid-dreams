import { describe, expect, it } from 'vitest';
import { RING_MAX_RADIUS_M, ringSlope } from './rainRipples';

describe('ringSlope (a raindrop ring on the sea)', () => {
  it('is zero away from the ring front and at the drop time before it spreads', () => {
    expect(ringSlope(0.3, 0.5)).toBeCloseTo(0, 9);
    expect(ringSlope(0.001, 0)).toBe(0); // the instant the drop lands
  });

  it('carries the ring out from the drop as it ages', () => {
    const peakAt = (phase: number): number => {
      let best = 0, at = 0;
      for (let r = 0; r <= RING_MAX_RADIUS_M * 1.2; r += 0.0005) {
        const s = Math.abs(ringSlope(r, phase));
        if (s > best) { best = s; at = r; }
      }
      return at;
    };
    expect(peakAt(0.6)).toBeGreaterThan(peakAt(0.2) + 0.03);
  });

  it('fades as it spreads', () => {
    const peak = (phase: number): number => Math.max(...Array.from({ length: 300 }, (_, i) => Math.abs(ringSlope(i * 0.0005, phase))));
    expect(peak(0.8)).toBeLessThan(peak(0.2) * 0.3);
  });
});
