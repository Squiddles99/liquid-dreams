import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { formatPeakFace, peakFace } from './peakFace';
import { computeReefField } from './reefField';

const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const set = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
const biggest = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));

describe('the face-height readout at the peak', () => {
  it('reads the biggest default wave as breaking, with a face of 3.5–5 m', () => {
    const t = biggest.arrivalS;
    const face = peakFace(field, wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS), t, DEFAULT_BREAK_PARAMS)!;
    expect(face.stage).toBeGreaterThan(0);
    expect(face.faceM).toBeGreaterThan(3.5);
    expect(face.faceM).toBeLessThan(5);
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
});
