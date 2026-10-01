import type { PresetName, WalkingPart } from './presets';
import type { Cloth } from './surferShading';

export type PilePart = 'tee' | 'shorts' | 'cap' | 'capFront' | 'bucketHat' | 'pack' | 'packTrim' | 'towel' | 'thongs' | 'fins';

/** The beach pile's parts (walking spec §5): each one's cloth and its colour among the rider's walking colours. */
export const PILE_PARTS: Record<PilePart, { cloth: Cloth; color: WalkingPart }> = {
  tee: { cloth: 'cotton', color: 'tee' },
  shorts: { cloth: 'denim', color: 'shorts' },
  cap: { cloth: 'cotton', color: 'hat' },
  capFront: { cloth: 'cotton', color: 'hatTrim' },
  bucketHat: { cloth: 'cotton', color: 'hat' },
  pack: { cloth: 'canvas', color: 'pack' },
  packTrim: { cloth: 'canvas', color: 'packTrim' },
  towel: { cloth: 'towel', color: 'towel' },
  thongs: { cloth: 'rubber', color: 'thongs' },
  fins: { cloth: 'rubber', color: 'fins' },
};

const PRESETS: readonly PresetName[] = ['female', 'male', 'grommet'];

/**
 * What a pile material is (tools/surfer/pile.py names them `pile_<part>_<preset>`; Grommet's glasses keep their own
 * `glasses` and `lens`), or null for a name the game can't shade.
 */
export function pileMaterial(name: string): { part: PilePart | 'glasses' | 'lens'; preset: PresetName } | null {
  if (name === 'glasses' || name === 'lens') return { part: name, preset: 'grommet' };
  const m = /^pile_([A-Za-z]+)_([a-z]+)$/.exec(name);
  if (!m || !(m[1] in PILE_PARTS) || !PRESETS.includes(m[2] as PresetName)) return null;
  return { part: m[1] as PilePart, preset: m[2] as PresetName };
}
