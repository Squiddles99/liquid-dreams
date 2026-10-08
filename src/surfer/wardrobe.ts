import MASKS from './outfitMasks.json';
import type { BoardKind } from '../board/boardSpec';
import type { Outfit, SurfOutfit, SurferPreset } from './presets';

export type Season = 'summer' | 'shoulder' | 'winter';
export type OutfitChoice = 'season' | Outfit;

/** Andrew’s months (spec §4.3), January first: Dec–Mar summer, Apr–Jun and Oct–Nov shoulder, Jul–Sep winter. */
const SEASON_BY_MONTH: readonly Season[] = ['summer', 'summer', 'summer', 'shoulder', 'shoulder', 'shoulder', 'winter', 'winter', 'winter', 'shoulder', 'shoulder', 'summer'];

export function seasonOf(dateISO: string): Season {
  const m = Number(dateISO.slice(5, 7));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? SEASON_BY_MONTH[m - 1] : 'winter';
}

/** The rider's outfits: their painted wardrobe (which holds the seasons'), then the walking clothes (walking spec §4). */
export const presetOutfits = (p: SurferPreset): Outfit[] => [...new Set<Outfit>([...p.wardrobe, ...Object.values(p.outfits), 'walking'])];

/** What the body's masks and the boardies mesh show: the swimwear under the walking clothes. */
export const bodyOutfit = (p: SurferPreset, o: Outfit): SurfOutfit => (o === 'walking' ? p.walking.under : o);
export const wearsClothes = (o: Outfit): boolean => o === 'walking';

export function outfitFor(p: SurferPreset, choice: OutfitChoice, dateISO: string): Outfit {
  return choice !== 'season' && presetOutfits(p).includes(choice) ? choice : p.outfits[seasonOf(dateISO)];
}

export const OUTFIT_LABELS: Record<Outfit, string> = {
  boardies: 'boardies', bikini: 'bikini', springsuit: 'springsuit', rashieAndBottoms: 'rash vest + shorts', shortArmSteamer: 'short-arm steamer', rashieAndBoardies: 'boardies + rash vest',
  steamer: 'steamer', onePiece: 'one-piece', walking: 'walking clothes',
};

/** Dry on land or in clothes; Grommet's glasses only with the walking clothes: at the water's edge they're in his bag
 * (walking spec §4), so never in the water. */
export const landLook = (onLand: boolean, o: Outfit): { wet: number; glasses: boolean } => ({ wet: onLand || o === 'walking' ? 0 : 1, glasses: o === 'walking' });

/** Which hair shows, always one the build made (closeup spec §4.1, walking spec §3): squashed under the hat when walking
 * in one, else the dry style on land or in clothes, else the wet hair (Grommet's curls dry in the shader). */
export function hairShown(onLand: boolean, o: Outfit, has: { dry: boolean; hat: boolean }): 'wet' | 'dry' | 'hat' {
  if (o === 'walking' && has.hat) return 'hat';
  return (onLand || o === 'walking') && has.dry ? 'dry' : 'wet';
}

/** Swim fins on the feet: bodyboarding in the water; on land they're clipped to his bag (walking spec §2). */
export const wearsSwimFins = (board: BoardKind, onLand: boolean): boolean => board === 'bodyboard' && !onLand;

/** Whether the outfit wears the boardies mesh (the male and Grommet builds carry one). */
export const showsBoardies = (o: SurfOutfit): boolean => o === 'boardies' || o === 'rashieAndBoardies';

/** 0/1 weights of the baked body masks (spec §4.3; tools/surfer/wardrobe.py bakes them into uv1–uv3). */
export interface OutfitMasks {
  spring: number;
  steamer: number;
  /** The short-sleeved lycra rash vest. */
  rashie: number;
  bottoms: number;
  top: number;
  boardies: number;
}

export const outfitMasks = (o: SurfOutfit): OutfitMasks => ({ ...(MASKS as Record<SurfOutfit, OutfitMasks>)[o] });
