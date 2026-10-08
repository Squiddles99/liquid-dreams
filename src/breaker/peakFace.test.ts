import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { formatPeakFace, formatPeakPsi, peakFace, peakPsi } from './peakFace';
import { computeReefField } from './reefField';

const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
// 6 ft, not the 4 ft default (R1 §2): a 4 ft wave no longer breaks at the peak, only soft on the shelf inshore of it.
const SIX = (() => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 6; return c; })();
const set = wavesOfSet(1, SIX, DEFAULT_SET_PARAMS);
const biggest = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));

describe('the face-height readout at the peak', () => {
  it('reads the biggest 6 ft wave as breaking, with a face of 2.5–6.5 m (3.0 m since R1 §2: it breaks on the face, not on the slope)', () => {
    const t = biggest.arrivalS;
    const face = peakFace(field, wavesNear(t, SIX, DEFAULT_SET_PARAMS), t, DEFAULT_BREAK_PARAMS)!;
    expect(face.stage).toBeGreaterThan(0);
    expect(face.faceM).toBeGreaterThan(2.5);
    // 5.9 m on the reef build's face, which stands the wave up taller at the peak (under 5 m on the softened ramp; plan 2026-10-02 Task 4).
    expect(face.faceM).toBeLessThan(6.5);
    expect(formatPeakFace(face, true)).toMatch(/^\d+\.\d m \(\d+ ft\) face, breaking$/);
  });
  it('has nothing to read in a lull, with no field yet, or on a flat day', () => {
    const lull = biggest.arrivalS + 200;
    expect(peakFace(field, wavesNear(lull, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS), lull, DEFAULT_BREAK_PARAMS)).toBeNull();
    expect(peakFace(null, set, biggest.arrivalS, DEFAULT_BREAK_PARAMS)).toBeNull();
    const flat = cloneConditions(DEFAULT_CONDITIONS);
    flat.swell.sizeFt = 0;
    expect(peakFace(field, wavesNear(biggest.arrivalS, flat, DEFAULT_SET_PARAMS), biggest.arrivalS, DEFAULT_BREAK_PARAMS)).toBeNull();
    expect(formatPeakFace(null, false)).toBe('waiting for the reef field');
    expect(formatPeakFace(null, true)).toBe('no wave at the peak');
  });
  it('with breaking off, the face is the unbroken height and reads "not breaking"', () => {
    const face = peakFace(field, set, biggest.arrivalS, { ...DEFAULT_BREAK_PARAMS, enabled: false })!;
    expect(face.stage).toBe(0);
    expect(formatPeakFace(face, true)).toMatch(/not breaking$/);
  });
  it('reads the ψ of the wave at the peak and names its state', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 12;
    const events = wavesOfSet(1, c, DEFAULT_SET_PARAMS);
    const big = events.reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const psi = peakPsi(field, events, big.arrivalS, DEFAULT_BREAK_PARAMS, 3)!;
    expect(psi).toBeGreaterThan(0);
    expect(formatPeakPsi(0.065, true)).toBe('ψ 0.065, cylinder (5)');
    expect(formatPeakPsi(0.035, true)).toBe('ψ 0.035, oval (4)');
    expect(formatPeakPsi(null, true)).toBe('no wave at the peak');
    expect(formatPeakPsi(0.05, false)).toBe('waiting for the reef field');
  });
});
