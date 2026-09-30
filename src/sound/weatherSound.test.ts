import { describe, expect, it } from 'vitest';
import { rainSound, thunderEvent } from './weatherSound';

describe('rainSound', () => {
  it('is silent when dry, grows with the rain, and is muffled under water', () => {
    expect(rainSound(0, false).level).toBe(0);
    expect(rainSound(0.8, false).level).toBeGreaterThan(rainSound(0.2, false).level);
    expect(rainSound(0.8, true).level).toBeLessThan(rainSound(0.8, false).level * 0.5);
  });
});

describe('thunderEvent', () => {
  const near = thunderEvent({ t: 10, bearingDeg: 270, distanceM: 1700, cloudToGround: true });
  const far = thunderEvent({ t: 10, bearingDeg: 270, distanceM: 17000, cloudToGround: true });

  it('arrives after the flash by the distance over the speed of sound', () => {
    expect(near.delayS).toBeCloseTo(1700 / 343, 9);
    expect(far.delayS).toBeCloseTo(17000 / 343, 9);
  });

  it('is quieter and duller from far away, with a crack only when close', () => {
    expect(far.level).toBeLessThan(near.level);
    expect(far.cutoffHz).toBeLessThan(near.cutoffHz);
    expect(near.crack).toBe(true);
    expect(far.crack).toBe(false);
  });

  it("comes from the strike's direction (west is −x)", () => {
    expect(near.x).toBeLessThan(0);
    expect(Math.abs(near.z)).toBeLessThan(1e-6 * Math.abs(near.x) + 1e-6);
  });
});
