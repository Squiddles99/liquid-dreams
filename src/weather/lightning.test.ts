import { describe, expect, it } from 'vitest';
import { FLASH_LENGTH_S, LightningClock, boltPath, flashEnvelope } from './lightning';

describe('flashEnvelope', () => {
  it('is dark before the strike and after it, bright at it, and flickers', () => {
    expect(flashEnvelope(-0.01)).toBe(0);
    expect(flashEnvelope(FLASH_LENGTH_S + 0.01)).toBe(0);
    expect(flashEnvelope(0)).toBeGreaterThan(0.8);
    // Flicker: a return stroke between the pulses dims then rebrightens.
    const trace = Array.from({ length: 60 }, (_, i) => flashEnvelope(i * 0.01));
    const rises = trace.slice(1).filter((v, i) => v > trace[i] + 0.05).length;
    expect(rises).toBeGreaterThanOrEqual(1);
  });
});

describe('LightningClock', () => {
  it('fires each strike once as the sim clock runs, whatever the frame steps', () => {
    const a = new LightningClock(), b = new LightningClock();
    const firedA: number[] = [], firedB: number[] = [];
    for (let t = 0; t <= 600; t += 1 / 60) firedA.push(...a.update(7, 1, t).fired.map((s) => s.t));
    for (let t = 0; t <= 600; t += 1 / 23) firedB.push(...b.update(7, 1, t).fired.map((s) => s.t));
    expect(firedA.length).toBeGreaterThan(10);
    expect(firedB.map((x) => x.toFixed(6))).toEqual(firedA.map((x) => x.toFixed(6)).slice(0, firedB.length));
    expect(new Set(firedA).size).toBe(firedA.length);
  });

  it('fires nothing while paused, backwards, or across a jump (no backlog of strikes)', () => {
    const c = new LightningClock();
    c.update(7, 1, 100);
    expect(c.update(7, 1, 100).fired).toEqual([]);
    expect(c.update(7, 1, 90).fired).toEqual([]);
    expect(c.update(7, 1, 500).fired).toEqual([]);
  });

  it('keeps showing a flash through its envelope, and a paused frame shows the same flash', () => {
    const c = new LightningClock();
    let t = 0, lit = -1;
    while (t < 3600) {
      t += 1 / 60;
      const r = c.update(3, 1, t);
      if (r.fired.length) { lit = t; break; }
    }
    expect(lit).toBeGreaterThan(0);
    const after = c.update(3, 1, lit + 0.05);
    expect(after.flash).toBeGreaterThan(0);
    expect(c.update(3, 1, lit + 0.05).flash).toBe(after.flash);
  });
});

describe('boltPath', () => {
  it('runs from the cloud base to the ground, jagged, the same for the same strike', () => {
    const p = boltPath(12345, 800);
    expect(p[0][1]).toBeCloseTo(800, 6);
    expect(p[p.length - 1][1]).toBeCloseTo(0, 6);
    expect(boltPath(12345, 800)).toEqual(p);
    const wiggle = Math.max(...p.map((q) => Math.hypot(q[0], q[2])));
    expect(wiggle).toBeGreaterThan(20);
    expect(wiggle).toBeLessThan(400);
  });
});
