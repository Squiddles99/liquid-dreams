import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND_PARAMS, SOUND_PARAM_RANGES, masterGain, normalizeSoundParams } from './soundParams';

describe('Sound params', () => {
  it('defaults: everything on, the music 14 dB under the effects', () => {
    expect(DEFAULT_SOUND_PARAMS).toEqual({ master: 0.8, waves: 1, ambience: 1, nearWater: 1, music: 0.2, muted: false });
    expect(20 * Math.log10(DEFAULT_SOUND_PARAMS.music / DEFAULT_SOUND_PARAMS.waves)).toBeCloseTo(-14, 0);
  });
  it('clamps to 0..1 and repairs junk', () => {
    const p = { master: 3, waves: -1, ambience: Number.NaN, nearWater: 0.5, music: 'x' as unknown as number, muted: 'yes' as unknown as boolean };
    normalizeSoundParams(p);
    expect(p).toEqual({ master: SOUND_PARAM_RANGES.master.max, waves: 0, ambience: 1, nearWater: 0.5, music: 0.2, muted: false });
  });
  it('mute silences the master without losing its level', () => {
    expect(masterGain({ ...DEFAULT_SOUND_PARAMS, muted: true })).toBe(0);
    expect(masterGain({ ...DEFAULT_SOUND_PARAMS })).toBe(0.8);
  });
});
