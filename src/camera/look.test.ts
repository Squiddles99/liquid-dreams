import { describe, expect, it } from 'vitest';
import { MAX_PITCH_DEG, applyMouseLook, lookDirection } from './look';

describe('applyMouseLook', () => {
  it('moving the mouse right turns right (clockwise)', () => {
    expect(applyMouseLook({ yawDeg: 0, pitchDeg: 0 }, 100, 0, 0.1).yawDeg).toBeCloseTo(10);
  });
  it('wraps yaw into [0, 360)', () => {
    expect(applyMouseLook({ yawDeg: 355, pitchDeg: 0 }, 100, 0, 0.1).yawDeg).toBeCloseTo(5);
    expect(applyMouseLook({ yawDeg: 5, pitchDeg: 0 }, -100, 0, 0.1).yawDeg).toBeCloseTo(355);
  });
  it('moving the mouse up looks up, clamped', () => {
    expect(applyMouseLook({ yawDeg: 0, pitchDeg: 0 }, 0, -100, 0.1).pitchDeg).toBeCloseTo(10);
    expect(applyMouseLook({ yawDeg: 0, pitchDeg: 80 }, 0, -1000, 0.1).pitchDeg).toBe(MAX_PITCH_DEG);
  });
});

describe('lookDirection', () => {
  it('yaw 270 (west), level → -X', () => {
    const [x, y, z] = lookDirection({ yawDeg: 270, pitchDeg: 0 });
    expect(x).toBeCloseTo(-1); expect(y).toBeCloseTo(0); expect(z).toBeCloseTo(0);
  });
  it('pitch -90 looks straight down', () => {
    expect(lookDirection({ yawDeg: 0, pitchDeg: -90 })[1]).toBeCloseTo(-1);
  });
});
