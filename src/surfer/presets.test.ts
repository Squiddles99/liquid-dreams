import { describe, expect, it } from 'vitest';
import { makeBoard } from '../board/boardSpec';
import { PRESETS, boardFor, boardLookFor } from './presets';

describe('presets (spec §4.1, §5.1)', () => {
  it('are two late-teen surfers of the planned heights, one regular and one goofy by default', () => {
    expect([PRESETS.female.heightM, PRESETS.male.heightM]).toEqual([1.65, 1.78]);
    expect(new Set([PRESETS.female.defaultStance, PRESETS.male.defaultStance])).toEqual(new Set(['regular', 'goofy']));
  });
  it('carry the planned quivers', () => {
    expect(boardFor(PRESETS.male, 'thruster')).toEqual(makeBoard('thruster', { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 }));
    expect(boardFor(PRESETS.female, 'stepUp').lengthM).toBeCloseTo(76 * 0.0254, 9);
    expect(boardFor(PRESETS.female, 'bodyboard').lengthM).toBeCloseTo(40 * 0.0254, 9);
  });
  it('merge a preset’s board colours over the defaults', () => {
    expect(boardLookFor(PRESETS.female, 'bodyboard').deck).toEqual(PRESETS.female.boardLooks.bodyboard!.deck);
    expect(boardLookFor(PRESETS.female, 'thruster').padLengthM).toBe(0.3);
  });
});
