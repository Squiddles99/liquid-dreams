import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_RECORD_LENGTH, ONSET_LEVELS, onsetStep } from './breaking';
import { STEP_MAX, STEP_MIN } from './breakIntensity';
import { computeReefField, sampleField, sampleOnset, stepAlong } from './reefField';

const bed = downsample(buildBathymetry(), 2);
const fieldAt = (tideM: number) => computeReefField({ bed, periodS: 15, fromDeg: 225, tideM });
const biggest = (ft: number) => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = ft; return wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => Math.max(a, b.heightM), 0); };
const stepAt = (f: ReturnType<typeof fieldAt>, x: number, z: number, h: number) => onsetStep(sampleOnset(f, x, z)!, 0, h, DEFAULT_BREAK_PARAMS);

describe('the step', () => {
  it('stepAlong: a ledge gives deep ÷ shallow, a flat bottom 1, and it clamps to [1, 3]', () => {
    expect(stepAlong((s) => (s < 5 ? 13 : 6), 13)).toBeCloseTo(13 / 6, 9);
    expect(stepAlong(() => 13, 13)).toBe(1);
    expect(stepAlong(() => 0.5, 13)).toBe(STEP_MAX);
    expect(stepAlong(() => 20, 13)).toBe(STEP_MIN);
    expect(stepAlong((s) => (s < 25 ? 13 : 2), 13)).toBe(1); // beyond 1.5 depths ahead it isn't seen
  });
  it('the record has a step per level after the (time, height) pairs', () => {
    expect(ONSET_RECORD_LENGTH).toBe(1 + 3 * ONSET_LEVELS);
  });
  const low = fieldAt(-1.5), mid = fieldAt(0), high = fieldAt(1.5);
  const h12 = biggest(12);
  it('at 8 ft, low tide throws onto a bigger step than mid, and mid than high; 12 ft at mid tide reads a normal day', () => {
    const h8 = biggest(8);
    const [sl, sm, sh] = [stepAt(low, 0, 0, h8), stepAt(mid, 0, 0, h8), stepAt(high, 0, 0, h8)];
    console.log(`peak step, 8 ft: low ${sl.toFixed(2)} mid ${sm.toFixed(2)} high ${sh.toFixed(2)}`);
    expect(sl).toBeGreaterThan(sm);
    expect(sm).toBeGreaterThan(sh);
    const s12 = stepAt(mid, 0, 0, h12);
    console.log(`peak step, 12 ft mid tide: ${s12.toFixed(2)}`);
    expect(s12).toBeGreaterThan(1.77); // intensity 1 ± 0.15 from the reef alone (STEP_POINTS)
    expect(s12).toBeLessThan(1.91);
  });
  it('12 ft is too big at low tide: it breaks outside, onto a smaller step than at mid tide', () => {
    expect(stepAt(low, 0, 0, h12)).toBeLessThan(stepAt(mid, 0, 0, h12));
  });
  it('too big at low tide (15 ft) breaks out over the flat bottom: its step reads about 1', () => {
    const s = stepAt(low, 0, 0, biggest(15));
    console.log(`peak step, 15 ft low tide: ${s.toFixed(2)}`);
    expect(s).toBeLessThan(1.3);
  });
  it('is carried along the ray after a section breaks: no jumps along the traced ray, within 10% of the peak value by 20 m', () => {
    // Follow the ray itself (it bends through the wedge; a straight line drifts onto neighbouring rays).
    const s0 = stepAt(mid, 0, 0, h12);
    let x = 0, z = 0, prev = s0;
    for (let d = 1; d <= 20; d++) {
      const f = sampleField(mid, x, z);
      x += f.dirX; z += f.dirZ;
      const s = stepAt(mid, x, z, h12);
      expect(Math.abs(s - prev)).toBeLessThan(0.03);
      prev = s;
    }
    console.log(`step along the ray, 12 ft mid tide: peak ${s0.toFixed(3)}, +20 m ${prev.toFixed(3)}`);
    expect(Math.abs(prev - s0)).toBeLessThan(0.1 * s0);
  });
  it('is smooth along the crest line through the peak (≤ 0.1 per metre) and finite at both tide extremes', () => {
    for (const f of [low, mid, high]) {
      const f0 = sampleField(f, 0, 0), tx = -f0.dirZ, tz = f0.dirX;
      let prev = stepAt(f, -30 * tx, -30 * tz, h12);
      for (let v = -29; v <= 30; v++) {
        const s = stepAt(f, v * tx, v * tz, h12);
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(STEP_MIN);
        expect(s).toBeLessThanOrEqual(STEP_MAX);
        expect(Math.abs(s - prev)).toBeLessThanOrEqual(0.1);
        prev = s;
      }
    }
  });
});
