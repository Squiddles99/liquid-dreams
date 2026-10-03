// src/frontend/uiSounds.test.ts
import { describe, expect, it } from 'vitest';
import { UI_SOUND_MS, VOICE_FILES, focusDetune, soundFor, valuePitchHz } from './uiSounds';

describe('the UI sounds (spec §12)', () => {
  it('has the spec\'s lengths', () => {
    expect(UI_SOUND_MS).toMatchObject({ focus: 40, value: 40, confirm: 250, back: 150 });
  });
  it('rises a semitone per value step and wobbles the focus tick by at most one', () => {
    expect(valuePitchHz(0)).toBeCloseTo(660, 6);
    expect(valuePitchHz(12)).toBeCloseTo(1320, 6);
    expect(valuePitchHz(1) / valuePitchHz(0)).toBeCloseTo(2 ** (1 / 12), 9);
    expect(focusDetune(0)).toBe(-100);
    expect(focusDetune(1)).toBe(100);
  });
  it('has the VO hook, and no recorded lines ship this step', () => {
    expect(VOICE_FILES).toEqual({});
  });
  it('maps the state machine\'s events to sounds', () => {
    expect(soundFor({ kind: 'focus' })).toBe('focus');
    expect(soundFor({ kind: 'value', row: 'swell', dir: 1 })).toBe('value');
    expect(soundFor({ kind: 'end', row: 'tide' })).toBe('end');
    expect(soundFor({ kind: 'move', from: 'conditions', to: 'rider' })).toBe('swing');
    expect(soundFor({ kind: 'pick', rider: 'female' })).toBe('pick');
    expect(soundFor({ kind: 'back' })).toBe('back');
    expect(soundFor({ kind: 'chosen' })).toBe('confirm');
    expect(soundFor({ kind: 'landed', beat: 'rider' })).toBeNull();
  });
});
