import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_LEVELS, ONSET_PSI_OFFSET, ONSET_RECORD_LENGTH, onsetPsi } from './breaking';
import { BREAK_NEAR_PEAK_M, firstBreakSeaward } from './reefReport';
import { STEP_PSI_POINTS, computeReefField, psiFromStep, reefStep, sampleField, sampleOnset } from './reefField';
import { SHEET_POINTS, psiState } from './overturn';

const bed = downsample(buildBathymetry(), 2);
const fieldAt = (tideM: number) => computeReefField({ bed, periodS: 15, fromDeg: 225, tideM });
const biggest = (ft: number) => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = ft; return wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => Math.max(a, b.heightM), 0); };
const psiAt = (f: ReturnType<typeof fieldAt>, x: number, z: number, h: number) => onsetPsi(sampleOnset(f, x, z)!, 0, h, DEFAULT_BREAK_PARAMS);

describe('ψ₀ in the reef bake (spec 2026-09-30-barrel-from-maths §5, plan ruling 11)', () => {
  it('reefStep: the depth here over the shallowest water within 1.5 depths ahead (Andrew’s step, 2026-09-30)', () => {
    expect(reefStep(() => 13, 13)).toBe(1); // a flat bottom: no step
    expect(reefStep((s) => (s < 5 ? 12 : 6), 12)).toBeCloseTo(2, 9); // a ledge 5 m ahead, within 18 m: 12 ÷ 6
    expect(reefStep((s) => (s < 20 ? 12 : 6), 12)).toBe(1); // a ledge past 1.5 depths ahead doesn't count yet
    expect(reefStep((s) => 10 + s, 10)).toBe(1); // deepening ahead: never below 1
    expect(reefStep(() => 0.5, 0)).toBe(1); // no water: no step
  });
  it('psiFromStep: Andrew’s step anchors (1.3, 1.85, 2.25) land on the sheet’s ψ anchors, oval, cylinder, thrown', () => {
    expect(STEP_PSI_POINTS.map((p) => p[1])).toEqual(SHEET_POINTS.map((p) => p[0]));
    STEP_PSI_POINTS.forEach(([step, psi]) => expect(psiFromStep(step)).toBeCloseTo(psi, 9));
    expect(psiState(psiFromStep(1.3))).toBe('oval');
    expect(psiState(psiFromStep(1.85))).toBe('cylinder');
    expect(psiState(psiFromStep(2.25))).toBe('thrown');
    for (let s = 0.5; s < 3; s += 0.01) expect(psiFromStep(s + 0.01)).toBeGreaterThan(psiFromStep(s)); // a bigger step throws harder
    expect(psiFromStep(1)).toBeCloseTo(0.035 / 1.3, 9); // below the first anchor, in proportion (as drawn for Andrew)
    expect(Number.isFinite(psiFromStep(Number.NaN))).toBe(true);
  });
  it('the record keeps a ψ₀ per level after the (time, height) pairs', () => {
    expect(ONSET_PSI_OFFSET).toBe(1 + 2 * ONSET_LEVELS);
    expect(ONSET_RECORD_LENGTH).toBe(1 + 3 * ONSET_LEVELS);
  });
  const mid = fieldAt(0), low = fieldAt(-1.5), high = fieldAt(1.5);
  it('is finite and non-negative everywhere near the peak at both tide extremes, and smooth along the crest (≤ 0.02 per metre)', () => {
    const h = biggest(12);
    for (const f of [low, mid, high]) {
      const f0 = sampleField(f, 0, 0), tx = -f0.dirZ, tz = f0.dirX;
      let prev = psiAt(f, -30 * tx, -30 * tz, h);
      for (let v = -29; v <= 30; v++) {
        const p = psiAt(f, v * tx, v * tz, h);
        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(Math.abs(p - prev)).toBeLessThanOrEqual(0.02);
        prev = p;
      }
    }
  });
  it('is carried along the ray after a section breaks (within 10% of the peak value 20 m on along the traced ray)', () => {
    const h = biggest(12), p0 = psiAt(mid, 0, 0, h);
    console.log(`peak ψ₀, 12 ft: low ${psiAt(low, 0, 0, h).toFixed(3)} mid ${p0.toFixed(3)} high ${psiAt(high, 0, 0, h).toFixed(3)}`);
    // Follow the ray itself (it bends through the wedge; a straight line drifts onto neighbouring rays).
    let x = 0, z = 0;
    for (let d = 1; d <= 20; d++) { const f = sampleField(mid, x, z); x += f.dirX; z += f.dirZ; }
    expect(Math.abs(psiAt(mid, x, z, h) - p0)).toBeLessThanOrEqual(0.1 * p0 + 1e-9);
  });
  it('on the reef face: low ≥ mid ≥ high at 6 and 8 ft, and a 15 ft set at low tide is too big: it breaks out on the slope', () => {
    const rows: string[] = [];
    for (const ft of [4, 6, 8, 10, 12, 15]) {
      const h = biggest(ft), v = [low, mid, high].map((f) => psiAt(f, 0, 0, h));
      rows.push(`${ft} ft: low ${v[0].toFixed(3)} mid ${v[1].toFixed(3)} high ${v[2].toFixed(3)}`);
    }
    console.log(rows.join(String.fromCharCode(10)));
    for (const ft of [6, 8]) { const h = biggest(ft); expect(psiAt(low, 0, 0, h)).toBeGreaterThanOrEqual(psiAt(mid, 0, 0, h) - 0.005); expect(psiAt(mid, 0, 0, h)).toBeGreaterThanOrEqual(psiAt(high, 0, 0, h) - 0.005); }
    // The states by conditions are reefCriteria.test's (spec 2026-10-02 §2.3); 15 ft is past the spec's sizes and breaks outside.
    expect(firstBreakSeaward(low, biggest(15))).toBeGreaterThan(BREAK_NEAR_PEAK_M);
  });
});

