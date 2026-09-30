import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_LEVELS, ONSET_PSI_OFFSET, ONSET_RECORD_LENGTH, onsetPsi } from './breaking';
import { computeReefField, psiReef, sampleField, sampleOnset } from './reefField';

const bed = downsample(buildBathymetry(), 2);
const fieldAt = (tideM: number) => computeReefField({ bed, periodS: 15, fromDeg: 225, tideM });
const biggest = (ft: number) => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = ft; return wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => Math.max(a, b.heightM), 0); };
const psiAt = (f: ReturnType<typeof fieldAt>, x: number, z: number, h: number) => onsetPsi(sampleOnset(f, x, z)!, 0, h, DEFAULT_BREAK_PARAMS);

describe('ψ₀ in the reef bake (spec 2026-09-30-barrel-from-maths §5, plan ruling 11)', () => {
  it('psiReef: a planar 1:20 slope reads 0.05; a flat bottom 0; the approach depth is the deepest water seaward', () => {
    const plane = psiReef((s) => 10 - s / 20, 10);
    expect(plane.slope).toBeCloseTo(0.05, 6);
    expect(plane.h0).toBeCloseTo(10 + (3 * 10) / 20, 6);
    expect(plane.sApproach).toBeCloseTo(-30, 6);
    const flat = psiReef(() => 13, 13);
    expect(flat.slope).toBe(0);
    expect(flat.h0).toBe(13);
    expect(psiReef((s) => 10 + s / 20, 10).slope).toBe(0); // deepening ahead: floored at 0
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
});
