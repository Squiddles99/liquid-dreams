import { describe, expect, it } from 'vitest';
import { travelDirectionXZ } from '../conditions/directions';
import { DEFAULT_BREAK_PARAMS, normalizeBreakParams } from './breaking';
import { ANCHORS, INTENSITY_MAX, PER_CREST_BREAK_KEYS, barrelShape, breakIntensity, drainBonus, offshoreSpeed, stepToIntensity, withShape } from './breakIntensity';

const P = { intensityNudge: 0, randomDial: 0 };
const base = { step: 1.85, offshoreMs: 0, periodS: 12, waveBonus: 0, throwDraw: 0 };

describe('breakIntensity', () => {
  it('maps the step through 1.3 → 0, 1.85 → 1, 2.25 → 2 (fitted to the baked reef), clamping the step to [1, 3]', () => {
    expect(stepToIntensity(1.3)).toBeCloseTo(0, 9);
    expect(stepToIntensity(1.85)).toBeCloseTo(1, 9);
    expect(stepToIntensity(2.25)).toBeCloseTo(2, 9);
    expect(stepToIntensity(1.575)).toBeCloseTo(0.5, 9);
    expect(stepToIntensity(0.5)).toBeCloseTo(stepToIntensity(1), 9);
    expect(stepToIntensity(9)).toBeCloseTo(stepToIntensity(3), 9);
    expect(stepToIntensity(1)).toBeLessThan(0);
  });
  it('offshore wind is positive, onshore negative, cross-shore about zero', () => {
    const d = travelDirectionXZ(225);
    expect(offshoreSpeed(5, 45, d.x, d.z)).toBeCloseTo(5, 6); // blowing from the NE, against a swell from the SW
    expect(offshoreSpeed(5, 225, d.x, d.z)).toBeCloseTo(-5, 6);
    expect(Math.abs(offshoreSpeed(5, 135, d.x, d.z))).toBeLessThan(1e-6);
    expect(offshoreSpeed(3, 80, d.x, d.z)).toBeGreaterThan(2); // the default morning offshore
  });
  it('the drain bonus: +0.1 after a lull, −0.3 stacked close behind, about 0 at normal set spacing', () => {
    expect(drainBonus(Infinity, 15)).toBeCloseTo(0.1, 9);
    expect(drainBonus(15, 15)).toBeCloseTo(0, 9);
    expect(drainBonus(0.5 * 15, 15)).toBeCloseTo(-0.3, 9);
    expect(Math.abs(drainBonus(0.9 * 15, 15))).toBeLessThan(0.05);
    expect(Math.abs(drainBonus(1.1 * 15, 15))).toBeLessThan(0.05);
    expect(Number.isFinite(drainBonus(0, 15))).toBe(true);
  });
  it('adds wind, period, drain, the dial and the nudge in order, then clamps to [0, 2]', () => {
    expect(breakIntensity(base, P)).toBeCloseTo(1, 9);
    expect(breakIntensity({ ...base, offshoreMs: 8 }, P)).toBeCloseTo(1.25, 9);
    expect(breakIntensity({ ...base, offshoreMs: -20 }, P)).toBeCloseTo(0.75, 9);
    expect(breakIntensity({ ...base, periodS: 18 }, P)).toBeCloseTo(1.15, 9);
    expect(breakIntensity({ ...base, waveBonus: -0.3 }, P)).toBeCloseTo(0.7, 9);
    expect(breakIntensity({ ...base, throwDraw: 1 }, P)).toBeCloseTo(1, 9); // the dial is 0
    expect(breakIntensity({ ...base, throwDraw: -1 }, { intensityNudge: 0, randomDial: 0.3 })).toBeCloseTo(0.7, 9);
    expect(breakIntensity(base, { intensityNudge: 0.4, randomDial: 0 })).toBeCloseTo(1.4, 9);
    expect(breakIntensity({ ...base, step: 3, offshoreMs: 20 }, P)).toBe(INTENSITY_MAX);
    expect(breakIntensity({ ...base, step: 1, offshoreMs: -20 }, P)).toBe(0);
  });
  it('the shape is the anchors at 0, 1 and 2, eased between them with no jumps', () => {
    for (const k of [0, 1, 2]) expect(barrelShape(k)).toEqual(ANCHORS[k]);
    expect(barrelShape(-1)).toEqual(ANCHORS[0]);
    expect(barrelShape(5)).toEqual(ANCHORS[2]);
    for (const key of PER_CREST_BREAK_KEYS) {
      for (let I = 0; I < 2; I += 0.05) {
        const k = I < 1 ? 0 : 1, span = Math.abs(ANCHORS[k + 1][key] - ANCHORS[k][key]);
        expect(Math.abs(barrelShape(I + 0.05)[key] - barrelShape(I)[key])).toBeLessThanOrEqual(0.08 * span + 1e-12);
      }
    }
  });
  it('withShape sets exactly the per-crest keys; the defaults are the normal anchor', () => {
    const s = ANCHORS[2], p = withShape(DEFAULT_BREAK_PARAMS, s);
    for (const key of PER_CREST_BREAK_KEYS) expect(p[key]).toBe(s[key]);
    expect(p.gamma).toBe(DEFAULT_BREAK_PARAMS.gamma);
    for (const key of PER_CREST_BREAK_KEYS) expect(DEFAULT_BREAK_PARAMS[key]).toBe(ANCHORS[1][key]);
  });
  it('normalizes the new params into range', () => {
    const p = { ...DEFAULT_BREAK_PARAMS, wallBack: 9, intensityNudge: -9, randomDial: 9 };
    normalizeBreakParams(p);
    expect(p.wallBack).toBe(1);
    expect(p.intensityNudge).toBe(-1);
    expect(p.randomDial).toBe(0.3);
  });
});
