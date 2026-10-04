import { describe, expect, it } from 'vitest';
import { LENS_CLEAR_S, LENS_DRAIN_S, LensWater, RAIN_LENS_MAX, lensWaterAt, rainLensStep, tubeLensStep } from './lensWater';

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

describe('rain on the lens', () => {
  it('wets the lens in rain, more when looking up into it, and dries it after the rain stops', () => {
    let up = 0, level = 0;
    for (let k = 0; k < 120; k++) { up = rainLensStep(up, 0.6, 1, 1 / 60); level = rainLensStep(level, 0.6, 0.3, 1 / 60); }
    expect(up).toBeGreaterThan(level);
    expect(level).toBeGreaterThan(0);
    let dry = up;
    for (let k = 0; k < 60 * 10; k++) dry = rainLensStep(dry, 0, 1, 1 / 60);
    expect(dry).toBe(0);
    expect(rainLensStep(0, 0, 1, 1)).toBe(0);
  });

  it('never over-wets (the drops stay drops)', () => {
    let w = 0;
    for (let k = 0; k < 6000; k++) w = rainLensStep(w, 1, 1, 1 / 60);
    expect(w).toBeLessThanOrEqual(RAIN_LENS_MAX);
  });

  it('shows the wetter of the surfacing sheet and the rain', () => {
    const s = new LensWater();
    s.rain(0.5);
    expect(s.state()).toEqual({ active: true, front: 2, drops: 0.5 });
    s.surfaced();
    expect(s.state().front).toBeLessThan(1);
    s.rain(0);
    s.step(10);
    expect(s.state().active).toBe(false);
  });
});

describe('spray on the lens in the tube (Andrew 2026-10-04: the same drops as surfacing)', () => {
  it('wets fast under the curl, then the drops are gone about LENS_CLEAR_S after leaving it', () => {
    let wet = 0;
    for (let t = 0; t < 0.5; t += 1 / 60) wet = tubeLensStep(wet, 1, 1 / 60);
    expect(wet).toBeGreaterThan(0.7);
    for (let t = 0; t < 1; t += 1 / 60) wet = tubeLensStep(wet, 1, 1 / 60);
    let out = 0;
    while (wet > 0 && out < 10) {
      wet = tubeLensStep(wet, 0, 1 / 60);
      out += 1 / 60;
    }
    expect(out).toBeGreaterThan(LENS_CLEAR_S - 0.3);
    expect(out).toBeLessThan(LENS_CLEAR_S + 0.1);
  });

  it('shows as drops on the lens, no sheet', () => {
    const lens = new LensWater();
    expect(lens.state().active).toBe(false);
    lens.tube(1);
    const s = lens.state();
    expect(s.active).toBe(true);
    expect(s.drops).toBe(1);
    expect(s.front).toBeGreaterThan(1);
    lens.tube(0);
    expect(lens.state().active).toBe(false);
  });
});
