import { describe, expect, it } from 'vitest';
import { makeBoard } from '../board/boardSpec';
import { PRESETS, boardFor, boardLookFor, boardsFor } from './presets';

describe('presets (spec §4.1, §5.1)', () => {
  it('are two late-teen surfers of the planned heights, one regular and one goofy by default', () => {
    expect([PRESETS.female.heightM, PRESETS.male.heightM]).toEqual([1.65, 1.78]);
    expect(new Set([PRESETS.female.defaultStance, PRESETS.male.defaultStance])).toEqual(new Set(['regular', 'goofy']));
  });
  it('carry the planned quivers', () => {
    expect(boardFor(PRESETS.male, 'thruster')).toEqual(makeBoard('thruster', { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 }));
    expect(boardFor(PRESETS.female, 'stepUp').lengthM).toBeCloseTo(76 * 0.0254, 9);
  });
  it('Shazza and T-Bone are surfers: surfboards only, no bodyboard (Andrew, Gate B)', () => {
    expect(boardsFor(PRESETS.female)).toEqual(['thruster', 'stepUp']);
    expect(boardsFor(PRESETS.male)).toEqual(['thruster', 'stepUp']);
    expect(() => boardFor(PRESETS.female, 'bodyboard')).toThrow(/female.*bodyboard/);
  });
  it('merge a preset’s board colours over the defaults', () => {
    expect(boardLookFor(PRESETS.grommet, 'bodyboard').deck).toEqual(PRESETS.grommet.boardLooks.bodyboard!.deck);
    expect(boardLookFor(PRESETS.female, 'thruster').padLengthM).toBe(0.3);
  });
});

describe('Grommet (grommet spec §2, §6)', () => {
  it('is 1.52 m, named Grommet (Bradley), and rides only a 38 in bodyboard', () => {
    const g = PRESETS.grommet;
    expect([g.heightM, g.nickname, g.realName]).toEqual([1.52, 'Grommet', 'Bradley']);
    expect(boardsFor(g)).toEqual(['bodyboard']);
    expect(boardFor(g, 'bodyboard').lengthM).toBeCloseTo(38 * 0.0254, 9);
    expect(() => boardFor(g, 'thruster')).toThrow(/grommet.*thruster/);
  });
  it('names the other two', () => {
    expect([PRESETS.female.nickname, PRESETS.female.realName, PRESETS.male.nickname, PRESETS.male.realName]).toEqual(['Shazza', 'Sharon', 'T-Bone', 'Tom']);
  });
  it('gives only Grommet freckles, sunburn and curls that tighten when wet', () => {
    for (const k of ['freckles', 'sunburn', 'curlTighten'] as const) {
      expect(PRESETS.female[k]).toBe(0);
      expect(PRESETS.male[k]).toBe(0);
      expect(PRESETS.grommet[k]).toBeGreaterThan(0);
    }
  });
  it('loads from surfer/grommet.glb and its manifest (the same scheme as the others)', () => {
    expect([PRESETS.grommet.glbUrl, PRESETS.grommet.manifestUrl]).toEqual(['surfer/grommet.glb', 'surfer/grommet.manifest.json']);
  });
});
