import { describe, expect, it } from 'vitest';
import { FrameLimiter, MAX_FRAME_DT_S, SimClock, clampFrameDt, viewportSize } from './clock';

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

describe('FrameLimiter', () => {
  const rendersInOneSecond = (limiter: FrameLimiter, refreshHz: number, jitterMs = 0): number => {
    let n = 0;
    for (let i = 0; i < refreshHz; i++) {
      const jitter = jitterMs * Math.sin(i * 12.9898);
      if (limiter.shouldRender(1000 + (i * 1000) / refreshHz + jitter)) n++;
    }
    return n;
  };
  it('renders ~60 frames a second on a 240 Hz display', () => {
    const n = rendersInOneSecond(new FrameLimiter(60), 240);
    expect(n).toBeGreaterThanOrEqual(59);
    expect(n).toBeLessThanOrEqual(61);
  });
  it('never exceeds the cap on a 144 Hz display', () => {
    const n = rendersInOneSecond(new FrameLimiter(60), 144);
    expect(n).toBeLessThanOrEqual(61);
    expect(n).toBeGreaterThanOrEqual(48);
  });
  it('drops nothing on a 60 Hz display, even with callback jitter', () => {
    expect(rendersInOneSecond(new FrameLimiter(60), 60, 1)).toBe(60);
  });
  it('0 means uncapped (render every display refresh)', () => {
    expect(rendersInOneSecond(new FrameLimiter(0), 240)).toBe(240);
  });
  it('does not burst after a long gap (e.g. the tab was hidden)', () => {
    const limiter = new FrameLimiter(60);
    rendersInOneSecond(limiter, 240);
    let n = 0;
    for (let i = 0; i < 24; i++) if (limiter.shouldRender(5000 + (i * 1000) / 240)) n++;
    expect(n).toBeLessThanOrEqual(7); // 0.1 s at 60 fps ≈ 6
  });
});
