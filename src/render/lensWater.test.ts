import { describe, expect, it } from 'vitest';
import { LENS_CLEAR_S, LENS_DRAIN_S, LensWater, lensWaterAt } from './lensWater';

describe('water on the lens after surfacing', () => {
  it('at the moment of surfacing the whole lens is under a sheet of water, with its drops', () => {
    const s = lensWaterAt(0);
    expect(s.active).toBe(true);
    expect(s.front).toBe(0);
    expect(s.drops).toBe(1);
  });
  it('the sheet drains down the screen: its front moves monotonically from the top and is past the bottom by LENS_DRAIN_S', () => {
    let prev = -1;
    for (let t = 0; t <= LENS_DRAIN_S; t += 0.01) {
      const f = lensWaterAt(t).front;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(lensWaterAt(LENS_DRAIN_S).front).toBeGreaterThanOrEqual(1);
    expect(lensWaterAt(LENS_DRAIN_S / 2).front).toBeLessThan(1);
  });
  it('the drops outlast the sheet and are gone at LENS_CLEAR_S (about 2.5 s), after which the lens is dry', () => {
    expect(LENS_CLEAR_S).toBeCloseTo(2.5, 12);
    expect(LENS_CLEAR_S).toBeGreaterThan(LENS_DRAIN_S);
    expect(lensWaterAt(LENS_DRAIN_S).drops).toBeGreaterThan(0.5);
    expect(lensWaterAt(LENS_CLEAR_S).drops).toBe(0);
    expect(lensWaterAt(LENS_CLEAR_S).active).toBe(false);
    expect(lensWaterAt(Number.POSITIVE_INFINITY).active).toBe(false);
  });
  it('the lens starts dry, wets only on surfacing, dries with time, and going under wipes it', () => {
    const lens = new LensWater();
    expect(lens.state().active).toBe(false);
    lens.step(1);
    expect(lens.state().active).toBe(false);
    lens.surfaced();
    expect(lens.state()).toEqual(lensWaterAt(0));
    lens.step(0.5);
    expect(lens.state()).toEqual(lensWaterAt(0.5));
    lens.submerged();
    expect(lens.state().active).toBe(false);
    lens.surfaced();
    lens.step(LENS_CLEAR_S + 0.1);
    expect(lens.state().active).toBe(false);
  });
});
