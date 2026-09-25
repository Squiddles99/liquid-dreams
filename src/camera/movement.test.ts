import { describe, expect, it } from 'vitest';
import { NO_KEYS, adjustSpeed, planarMoveXZ, stepFree } from './movement';

describe('planarMoveXZ', () => {
  it('forward while facing east moves +X', () => {
    const m = planarMoveXZ(90, { ...NO_KEYS, forward: true }, 2);
    expect(m.x).toBeCloseTo(2); expect(m.z).toBeCloseTo(0);
  });
  it('right while facing north moves east (+X)', () => {
    expect(planarMoveXZ(0, { ...NO_KEYS, right: true }, 1).x).toBeCloseTo(1);
  });
  it('diagonals are not faster', () => {
    const m = planarMoveXZ(0, { ...NO_KEYS, forward: true, right: true }, 1);
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(1);
  });
  it('no keys, no movement', () => {
    expect(planarMoveXZ(10, NO_KEYS, 5)).toEqual({ x: 0, z: 0 });
  });
});

describe('stepFree', () => {
  const s = { position: [0, 10, 0] as [number, number, number], look: { yawDeg: 90, pitchDeg: 0 }, baseSpeedMs: 10 };
  it('flies along the look direction', () => {
    expect(stepFree(s, { ...NO_KEYS, forward: true }, 1).position[0]).toBeCloseTo(10);
  });
  it('E goes up, Q goes down, Shift is 5x', () => {
    expect(stepFree(s, { ...NO_KEYS, up: true }, 1).position[1]).toBeCloseTo(20);
    expect(stepFree(s, { ...NO_KEYS, down: true, fast: true }, 1).position[1]).toBeCloseTo(-40);
  });
});

describe('adjustSpeed', () => {
  it('wheel down slows, wheel up speeds, clamped', () => {
    expect(adjustSpeed(10, 100)).toBeLessThan(10);
    expect(adjustSpeed(10, -100)).toBeGreaterThan(10);
    expect(adjustSpeed(0.5, 100)).toBe(0.5);
    expect(adjustSpeed(500, -100)).toBe(500);
    expect(adjustSpeed(10, 0)).toBe(10);
  });
});
