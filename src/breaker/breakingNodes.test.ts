import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, MIN_STAGE_SPAN, steepeningStart } from './breaking';
import { createBreakUniforms, updateBreakUniforms } from './breakingNodes';

describe('break uniforms (the GPU copy of BreakParams)', () => {
  it('mirror the defaults, with the steepening onset as the ratio it starts at', () => {
    const u = createBreakUniforms(DEFAULT_BREAK_PARAMS);
    expect(u.enabled.value).toBe(1);
    expect(u.gamma.value).toBe(DEFAULT_BREAK_PARAMS.gamma);
    expect(u.hFloorM.value).toBe(DEFAULT_BREAK_PARAMS.hFloorM);
    expect(u.faceWidth.value).toBe(DEFAULT_BREAK_PARAMS.faceWidth);
    expect(u.collapseStart.value).toBe(DEFAULT_BREAK_PARAMS.collapseStart);
    expect(u.steepFrom.value).toBeCloseTo(DEFAULT_BREAK_PARAMS.ribbonOnset + 0.2, 12);
    updateBreakUniforms(u, { ...DEFAULT_BREAK_PARAMS, enabled: false, ribbonOnset: 0.4 });
    expect(u.enabled.value).toBe(0);
    expect(u.steepFrom.value).toBeCloseTo(0.6, 12);
  });

  it('upload only normalized params (no empty stage window, no zero floor, a steepening that starts below r = 1), leaving the caller’s object alone', () => {
    const u = createBreakUniforms(DEFAULT_BREAK_PARAMS);
    const bad = { ...DEFAULT_BREAK_PARAMS, drainEnd: 0, stageSpan: 0, hFloorM: 0, gamma: Number.NaN, ribbonOnset: 5 };
    const copy = { ...bad };
    updateBreakUniforms(u, bad);
    expect(bad).toEqual(copy);
    expect(u.drainEnd.value).toBeGreaterThan(0);
    expect(u.stageSpan.value).toBeGreaterThanOrEqual(MIN_STAGE_SPAN);
    expect(u.hFloorM.value).toBeGreaterThan(0);
    expect(u.gamma.value).toBe(DEFAULT_BREAK_PARAMS.gamma);
    expect(u.steepFrom.value).toBeLessThan(1);
    expect(u.steepFrom.value).toBe(steepeningStart({ ribbonOnset: 0.9 }));
  });
});
