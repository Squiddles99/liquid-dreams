import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { DEFAULT_SPECTRUM_PARAMS, spectrumInputsKey } from './spectrum';

describe('spectrumInputsKey', () => {
  const base = spectrumInputsKey(DEFAULT_CONDITIONS, DEFAULT_SPECTRUM_PARAMS);
  it('ignores time of day, date and tide', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.timeOfDay = 17; c.date = '2026-04-20'; c.tideM = 1;
    expect(spectrumInputsKey(c, DEFAULT_SPECTRUM_PARAMS)).toBe(base);
  });
  it('changes with swell, wind, seed and spectrum params', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = 5;
    expect(spectrumInputsKey(c, DEFAULT_SPECTRUM_PARAMS)).not.toBe(base);
    const d = cloneConditions(DEFAULT_CONDITIONS);
    d.seed = 1;
    expect(spectrumInputsKey(d, DEFAULT_SPECTRUM_PARAMS)).not.toBe(base);
    expect(spectrumInputsKey(DEFAULT_CONDITIONS, { ...DEFAULT_SPECTRUM_PARAMS, swellSpread: 20 })).not.toBe(base);
  });
});
