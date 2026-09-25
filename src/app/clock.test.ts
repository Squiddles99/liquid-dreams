import { describe, expect, it } from 'vitest';
import { MAX_FRAME_DT_S, SimClock, clampFrameDt, viewportSize } from './clock';

describe('SimClock', () => {
  it('advances by real dt', () => {
    const c = new SimClock();
    expect(c.tick(0.016)).toBeCloseTo(0.016);
    expect(c.simTime).toBeCloseTo(0.016);
  });
  it('clamps huge dt (tab was in background)', () => {
    const c = new SimClock();
    expect(c.tick(12)).toBe(MAX_FRAME_DT_S);
  });
  it('ignores negative dt', () => {
    const c = new SimClock();
    expect(c.tick(-1)).toBe(0);
    expect(c.simTime).toBe(0);
  });
  it('does not advance while paused', () => {
    const c = new SimClock();
    c.paused = true;
    expect(c.tick(0.02)).toBe(0);
    expect(c.simTime).toBe(0);
  });
  it('setTime clamps to >= 0', () => {
    const c = new SimClock();
    c.setTime(-5);
    expect(c.simTime).toBe(0);
    c.setTime(42.5);
    expect(c.simTime).toBe(42.5);
  });
});

describe('clampFrameDt', () => {
  it('clamps to [0, MAX]', () => {
    expect(clampFrameDt(-1)).toBe(0);
    expect(clampFrameDt(0.01)).toBe(0.01);
    expect(clampFrameDt(3)).toBe(MAX_FRAME_DT_S);
    expect(clampFrameDt(Number.NaN)).toBe(0);
  });
});

describe('viewportSize', () => {
  it('never returns a zero dimension (minimised window)', () => {
    expect(viewportSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(viewportSize(1920, 0)).toEqual({ width: 1920, height: 1 });
  });
  it('floors fractional sizes', () => {
    expect(viewportSize(800.7, 600.2)).toEqual({ width: 800, height: 600 });
  });
});
