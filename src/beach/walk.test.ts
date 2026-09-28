import { describe, expect, it } from 'vitest';
import { NO_KEYS } from '../camera/movement';
import { type Ground, WALK, canStand, initialWalkState, stepWalk } from './walk';

/** A beach rising 0.1 m per m east of x = 0 (the waterline), with a 1 m rock at (10, 0); still water at level 0. */
const beach = (level = 0): Ground => ({
  groundAt: (x, z) => Math.max(0.1 * x, Math.hypot(x - 10, z) < 1 ? 1 + 0.1 * x : -Infinity),
  waterLevel: () => level,
});
const look = { yawDeg: 90, pitchDeg: 0 }; // facing east (+x)
const settle = (s: ReturnType<typeof initialWalkState>, g: Ground, keys = NO_KEYS, n = 200) => {
  for (let i = 0; i < n; i++) s = stepWalk(s, keys, g, 1 / 60);
  return s;
};

describe('walking', () => {
  it('stands 1.7 m above the ground and follows it', () => {
    const g = beach();
    const s = settle(initialWalkState(5, 3, look, g), g);
    expect(s.height.value).toBeCloseTo(0.5 + WALK.eyeHeightM, 2);
  });
  it('walks at 1.4 m/s, three times that running', () => {
    const g = beach();
    const walk = settle(initialWalkState(2, 3, look, g), g, { ...NO_KEYS, forward: true }, 60);
    expect(walk.x - 2).toBeCloseTo(1.4, 1);
    const run = settle(initialWalkState(2, 3, look, g), g, { ...NO_KEYS, forward: true, fast: true }, 60);
    expect(run.x - 2).toBeCloseTo(4.2, 1);
  });
  it('steps up onto a rock', () => {
    const g = beach();
    const s = settle(initialWalkState(10, 0, look, g), g);
    expect(s.height.value).toBeCloseTo(2 + WALK.eyeHeightM, 2);
  });
  it('refuses water deeper than 1.2 m and slides along the edge', () => {
    const g = beach();
    expect(canStand(g, -11, 0)).toBe(true); // 1.1 m deep
    expect(canStand(g, -13, 0)).toBe(false); // 1.3 m deep
    const facingSea = { yawDeg: 225, pitchDeg: 0 }; // south-west: toward deep water and along the beach
    const s = settle(initialWalkState(-11.9, 0, facingSea, g), g, { ...NO_KEYS, forward: true }, 60);
    expect(s.x).toBeGreaterThanOrEqual(-12.0001);
    expect(s.z).toBeGreaterThan(0.5); // it slid along +z (south)
  });
  it('a rising tide never traps you: a step toward shallower ground is always allowed', () => {
    const g = beach(1.5); // the tide rose: you're now 2.6 m deep at x = −11
    const s = settle(initialWalkState(-11, 0, look, g), g, { ...NO_KEYS, forward: true }, 60);
    expect(s.x).toBeGreaterThan(-11);
  });
  it('a non-finite ground reads as unstandable, never NaN in the state', () => {
    const g: Ground = { groundAt: () => Number.NaN, waterLevel: () => 0 };
    expect(canStand(g, 0, 0)).toBe(false);
    const s = settle(initialWalkState(0, 0, look, beach()), g, { ...NO_KEYS, forward: true }, 10);
    expect(Number.isFinite(s.x) && Number.isFinite(s.height.value)).toBe(true);
  });
});
