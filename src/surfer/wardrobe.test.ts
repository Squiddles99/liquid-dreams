import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { OUTFIT_LABELS, outfitFor, outfitMasks, presetOutfits, seasonOf, showsBoardies } from './wardrobe';

describe('wardrobe (Andrew’s months, spec §4.3)', () => {
  it.each([
    ['2026-12-01', 'summer'], ['2026-01-15', 'summer'], ['2026-03-31', 'summer'],
    ['2026-04-01', 'shoulder'], ['2026-06-30', 'shoulder'],
    ['2026-07-01', 'winter'], ['2026-09-30', 'winter'],
    ['2026-10-01', 'shoulder'], ['2026-11-30', 'shoulder'],
  ])('%s is %s', (date, season) => expect(seasonOf(date)).toBe(season));

  it('dresses each surfer for the season', () => {
    expect(['2026-02-01', '2026-05-01', '2026-08-01', '2026-10-15'].map((d) => outfitFor(PRESETS.male, 'season', d)))
      .toEqual(['boardies', 'springsuit', 'shortArmSteamer', 'springsuit']);
    expect(['2026-02-01', '2026-05-01', '2026-08-01', '2026-10-15'].map((d) => outfitFor(PRESETS.female, 'season', d)))
      .toEqual(['bikini', 'rashieAndBottoms', 'shortArmSteamer', 'rashieAndBottoms']);
  });

  it('lets the override win, but only with one of that surfer’s own outfits', () => {
    expect(outfitFor(PRESETS.male, 'shortArmSteamer', '2026-02-01')).toBe('shortArmSteamer');
    expect(outfitFor(PRESETS.male, 'bikini', '2026-02-01')).toBe('boardies');
    expect(presetOutfits(PRESETS.female).sort()).toEqual(['bikini', 'rashieAndBottoms', 'shortArmSteamer']);
  });

  it('falls back to winter for a date it can’t read', () => expect(seasonOf('nonsense')).toBe('winter'));

  it('covers the right body regions for each outfit', () => {
    expect(outfitMasks('bikini')).toEqual({ spring: 0, steamer: 0, rashie: 0, bottoms: 1, top: 1, boardies: 0 });
    expect(outfitMasks('rashieAndBottoms')).toEqual({ spring: 0, steamer: 0, rashie: 1, bottoms: 1, top: 0, boardies: 0 });
    expect(outfitMasks('boardies').boardies).toBe(1);
    for (const o of Object.keys(OUTFIT_LABELS) as (keyof typeof OUTFIT_LABELS)[]) expect(Object.values(outfitMasks(o)).some((v) => v === 1)).toBe(true);
  });
});

describe("Grommet's wardrobe (grommet spec §6)", () => {
  it('is boardies with a rash vest in summer, a springsuit either side, a short-arm steamer in winter', () => {
    expect(outfitFor(PRESETS.grommet, 'season', '2026-01-10')).toBe('rashieAndBoardies');
    expect(outfitFor(PRESETS.grommet, 'season', '2026-05-10')).toBe('springsuit');
    expect(outfitFor(PRESETS.grommet, 'season', '2026-08-10')).toBe('shortArmSteamer');
  });
  it('paints the rash vest and shows the boardies mesh for rashieAndBoardies', () => {
    expect(outfitMasks('rashieAndBoardies')).toEqual({ spring: 0, steamer: 0, rashie: 1, bottoms: 0, top: 0, boardies: 1 });
    expect(showsBoardies('rashieAndBoardies')).toBe(true);
    expect(showsBoardies('boardies')).toBe(true);
    expect(showsBoardies('springsuit')).toBe(false);
    expect(OUTFIT_LABELS.rashieAndBoardies).toBe('boardies + rash vest');
  });
});
