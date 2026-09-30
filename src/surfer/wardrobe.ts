import MASKS from './outfitMasks.json';
import type { Outfit, SurferPreset } from './presets';

export type Season = 'summer' | 'shoulder' | 'winter';
export type OutfitChoice = 'season' | Outfit;

/** Andrew’s months (spec §4.3), January first: Dec–Mar summer, Apr–Jun and Oct–Nov shoulder, Jul–Sep winter. */
const SEASON_BY_MONTH: readonly Season[] = ['summer', 'summer', 'summer', 'shoulder', 'shoulder', 'shoulder', 'winter', 'winter', 'winter', 'shoulder', 'shoulder', 'summer'];

export function seasonOf(dateISO: string): Season {
  const m = Number(dateISO.slice(5, 7));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? SEASON_BY_MONTH[m - 1] : 'winter';
}

export const presetOutfits = (p: SurferPreset): Outfit[] => [...new Set(Object.values(p.outfits))];

export function outfitFor(p: SurferPreset, choice: OutfitChoice, dateISO: string): Outfit {
  return choice !== 'season' && presetOutfits(p).includes(choice) ? choice : p.outfits[seasonOf(dateISO)];
}

export const OUTFIT_LABELS: Record<Outfit, string> = {
  boardies: 'boardies', bikini: 'bikini', springsuit: 'springsuit', vestAndBottoms: 'bikini bottoms + vest', shortArmSteamer: 'short-arm steamer',
};

/** 0/1 weights of the baked body masks (spec §4.3; tools/surfer/wardrobe.py bakes them into uv1–uv3). */
export interface OutfitMasks {
  spring: number;
  steamer: number;
  vest: number;
  bottoms: number;
  top: number;
  boardies: number;
}

export const outfitMasks = (o: Outfit): OutfitMasks => ({ ...(MASKS as Record<Outfit, OutfitMasks>)[o] });
