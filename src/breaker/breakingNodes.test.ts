import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, MIN_STAGE_SPAN } from './breaking';
import { createBreakUniforms, updateBreakUniforms } from './breakingNodes';

describe('break uniforms (the GPU copy of BreakParams)', () => {
  it('mirror the defaults, with the lip angle in radians', () => {
    const u = createBreakUniforms(DEFAULT_BREAK_PARAMS);
    expect(u.enabled.value).toBe(1);
    expect(u.gamma.value).toBe(DEFAULT_BREAK_PARAMS.gamma);
    expect(u.hFloorM.value).toBe(DEFAULT_BREAK_PARAMS.hFloorM);
    expect(u.thetaMax.value).toBeCloseTo((DEFAULT_BREAK_PARAMS.thetaMaxDeg * Math.PI) / 180, 12);
    expect(u.collapseStart.value).toBe(DEFAULT_BREAK_PARAMS.collapseStart);
    updateBreakUniforms(u, { ...DEFAULT_BREAK_PARAMS, enabled: false });
    expect(u.enabled.value).toBe(0);
  });

  it('upload only normalized params (no empty stage window, no zero floor), leaving the caller’s object alone', () => {
    const u = createBreakUniforms(DEFAULT_BREAK_PARAMS);
    const bad = { ...DEFAULT_BREAK_PARAMS, steepEnd: 0, drainEnd: 0, curlStart: 0.5, curlEnd: 0.5, stageSpan: 0, hFloorM: 0, gamma: Number.NaN };
    const copy = { ...bad };
    updateBreakUniforms(u, bad);
    expect(bad).toEqual(copy);
    expect(u.steepEnd.value).toBeGreaterThan(0);
    expect(u.drainEnd.value).toBeGreaterThan(0);
    expect(u.curlEnd.value).toBeGreaterThan(u.curlStart.value);
    expect(u.stageSpan.value).toBeGreaterThanOrEqual(MIN_STAGE_SPAN);
    expect(u.hFloorM.value).toBeGreaterThan(0);
    expect(u.gamma.value).toBe(DEFAULT_BREAK_PARAMS.gamma);
  });
});
