import { describe, expect, it } from 'vitest';
import { PRESETS, type SurfOutfit } from './presets';
import { OUTFIT_LABELS, bodyOutfit, hairShown, wearsSwimFins, outfitFor, outfitMasks, presetOutfits, landLook, seasonOf, showsBoardies, wearsClothes } from './wardrobe';

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
    expect(presetOutfits(PRESETS.female).sort()).toEqual(['bikini', 'rashieAndBottoms', 'shortArmSteamer', 'walking']);
  });

  it('falls back to winter for a date it can’t read', () => expect(seasonOf('nonsense')).toBe('winter'));

  it('covers the right body regions for each outfit', () => {
    expect(outfitMasks('bikini')).toEqual({ spring: 0, steamer: 0, rashie: 0, bottoms: 1, top: 1, boardies: 0 });
    expect(outfitMasks('rashieAndBottoms')).toEqual({ spring: 0, steamer: 0, rashie: 1, bottoms: 1, top: 0, boardies: 0 });
    expect(outfitMasks('boardies').boardies).toBe(1);
    for (const o of (Object.keys(OUTFIT_LABELS) as (keyof typeof OUTFIT_LABELS)[]).filter((x): x is SurfOutfit => x !== 'walking')) expect(Object.values(outfitMasks(o)).some((v) => v === 1)).toBe(true);
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

describe('on land (grommet spec §6; walking spec §4)', () => {
  it('dries off on land or in clothes, and wears the glasses only with the walking clothes (never in the water)', () => {
    expect(landLook(false, 'boardies')).toEqual({ wet: 1, glasses: false });
    expect(landLook(true, 'boardies')).toEqual({ wet: 0, glasses: false });
    expect(landLook(true, 'walking')).toEqual({ wet: 0, glasses: true });
    expect(landLook(false, 'walking')).toEqual({ wet: 0, glasses: true });
  });
  it('always shows hair the build made: under the hat when walking in one, else dry on land, else wet (Review Focus 2)', () => {
    for (const onLand of [false, true]) for (const o of ['boardies', 'walking'] as const) for (const dry of [false, true]) for (const hat of [false, true]) {
      const h = hairShown(onLand, o, { dry, hat });
      const tag = `${onLand} ${o} dry ${dry} hat ${hat}`;
      if (!dry) expect(h, tag).not.toBe('dry');
      if (!hat) expect(h, tag).not.toBe('hat');
      expect(h === 'hat', tag).toBe(o === 'walking' && hat);
    }
    expect(hairShown(true, 'boardies', { dry: true, hat: true })).toBe('dry');
    expect(hairShown(false, 'boardies', { dry: true, hat: true })).toBe('wet');
    expect(hairShown(false, 'walking', { dry: true, hat: false })).toBe('dry');
  });
});

describe('the walking clothes (walking spec §2, §4)', () => {
  it('are every rider’s, chosen only by name, never by the season', () => {
    for (const p of Object.values(PRESETS)) {
      expect(presetOutfits(p)).toContain('walking');
      expect(outfitFor(p, 'walking', '2026-02-01')).toBe('walking');
      for (let m = 1; m <= 12; m++) expect(outfitFor(p, 'season', `2026-${String(m).padStart(2, '0')}-10`)).not.toBe('walking');
    }
    expect(wearsClothes('walking')).toBe(true);
    expect(wearsClothes('boardies')).toBe(false);
    expect(OUTFIT_LABELS.walking).toBe('walking clothes');
  });
  it('go over each rider’s swimwear: Shazza’s bikini, the boys’ own boardies (Andrew’s continuity)', () => {
    expect(bodyOutfit(PRESETS.female, 'walking')).toBe('bikini');
    for (const p of [PRESETS.male, PRESETS.grommet]) {
      expect(bodyOutfit(p, 'walking')).toBe('boardies');
      expect(showsBoardies(bodyOutfit(p, 'walking'))).toBe(true);
    }
    expect(bodyOutfit(PRESETS.male, 'springsuit')).toBe('springsuit');
  });
});

describe('swim fins (walking spec §2)', () => {
  it('go on his feet on the bodyboard in the water, and stay clipped to his bag on land', () => {
    expect(wearsSwimFins('bodyboard', false)).toBe(true);
    expect(wearsSwimFins('bodyboard', true)).toBe(false);
    expect(wearsSwimFins('thruster', false)).toBe(false);
  });
});
