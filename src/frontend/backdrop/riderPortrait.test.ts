import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../surfer/presets';
import { type FrontState, initialFront } from '../frontEnd';
import { DEFAULT_CHOICES } from '../frontSettings';
import { portraitKey, portraitOf } from './riderPortrait';

const TODAY = new Date('2026-10-03T10:00:00+08:00');
const at = (over: Partial<FrontState>): FrontState => ({ ...initialFront(DEFAULT_CHOICES), ...over });

describe('portraitOf: the painted rider on the select screens (painted riders spec)', () => {
  it('shows no rider on Conditions or paddling out (the last one stays for the fade)', () => {
    expect(portraitOf(at({ beat: 'conditions' }), TODAY)).toBeNull();
    expect(portraitOf(at({ beat: 'out' }), TODAY)).toBeNull();
  });
  it('shows the focused rider in their walking clothes on Choose your rider', () => {
    for (const rider of ['male', 'female', 'grommet'] as const) expect(portraitOf(at({ beat: 'rider', rider }), TODAY)).toEqual({ rider, outfit: 'walking' });
  });
  it('tries on the focused outfit on the outfit tab, for every outfit painted', () => {
    for (const rider of ['male', 'female', 'grommet'] as const) {
      PRESETS[rider].wardrobe.forEach((outfit, gearFocus) => {
        expect(portraitOf(at({ beat: 'gear', rider, gearTab: 'outfit', gearFocus }), TODAY)).toEqual({ rider, outfit });
      });
    }
  });
  it('wears the ticked outfit on the board and stance tabs (the season\'s when none is ticked)', () => {
    // October (month 9) is the shoulder season: Shazza's rash vest.
    const october = { ...DEFAULT_CHOICES.setup, month: 9 };
    expect(portraitOf(at({ beat: 'gear', rider: 'female', gearTab: 'board', outfits: {}, setup: october }), TODAY)).toEqual({ rider: 'female', outfit: 'rashieAndBottoms' });
    expect(portraitOf(at({ beat: 'gear', rider: 'female', gearTab: 'stance', outfits: { female: 'steamer' } }), TODAY)).toEqual({ rider: 'female', outfit: 'steamer' });
  });
  it('names the picture as tools/riderArt.py writes it', () => expect(portraitKey({ rider: 'grommet', outfit: 'shortArmSteamer' })).toBe('grommet-shortArmSteamer'));
});
