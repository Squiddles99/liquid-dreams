import { type BoardLook, DEFAULT_BOARD_LOOKS, type RGB } from '../board/boardLook';
import { type BoardDims, type BoardKind, type BoardSpec, makeBoard } from '../board/boardSpec';

export type PresetName = 'female' | 'male';
export type Stance = 'regular' | 'goofy';
export type Outfit = 'boardies' | 'bikini' | 'springsuit' | 'rashieAndBottoms' | 'shortArmSteamer';

/** One of the two surfers (spec §1, §4): the build numbers live in tools/surfer/presets/<name>.json. */
export interface SurferPreset {
  name: PresetName;
  label: string;
  heightM: number;
  weightKg: number;
  defaultStance: Stance;
  /** Relative to the site's base URL (public/). */
  glbUrl: string;
  manifestUrl: string;
  outfits: { summer: Outfit; shoulder: Outfit; winter: Outfit };
  quiver: Record<BoardKind, BoardDims>;
  /** Linear-RGB albedos. */
  skin: RGB;
  /** 0–1: how much darker the sun has made the skin. */
  tan: number;
  /** Eyebrows and lips, painted from the body's colour layer (tools/surfer/face.py). */
  brows: RGB;
  lips: RGB;
  iris: RGB;
  hairRoot: RGB;
  hairTip: RGB;
  fabric: RGB;
  /** The lycra rash vest's colour. */
  rashie: RGB;
  neopreneAccent: RGB;
  boardies: RGB;
  boardLooks: Partial<Record<BoardKind, Partial<BoardLook>>>;
}

export const PRESETS: Record<PresetName, SurferPreset> = {
  female: {
    name: 'female', label: 'Female', heightM: 1.65, weightKg: 55, defaultStance: 'regular',
    glbUrl: 'surfer/female.glb', manifestUrl: 'surfer/female.manifest.json',
    outfits: { summer: 'bikini', shoulder: 'rashieAndBottoms', winter: 'shortArmSteamer' },
    quiver: {
      thruster: { lengthIn: 70, widthIn: 18.75, thicknessIn: 2.3125 },
      stepUp: { lengthIn: 76, widthIn: 19, thicknessIn: 2.5 },
      bodyboard: { lengthIn: 40, widthIn: 21, thicknessIn: 2.625 },
    },
    skin: [0.52, 0.34, 0.24], tan: 0.35, brows: [0.16, 0.1, 0.055], lips: [0.42, 0.15, 0.14], iris: [0.12, 0.2, 0.22], hairRoot: [0.13, 0.085, 0.04], hairTip: [0.52, 0.4, 0.23],
    fabric: [0.55, 0.12, 0.1], rashie: [0.02, 0.12, 0.55], neopreneAccent: [0.1, 0.35, 0.45], boardies: [0.1, 0.2, 0.4],
    boardLooks: { bodyboard: { deck: [0.05, 0.25, 0.45], rail: [0.04, 0.19, 0.35] } },
  },
  male: {
    name: 'male', label: 'Male', heightM: 1.78, weightKg: 68, defaultStance: 'goofy',
    glbUrl: 'surfer/male.glb', manifestUrl: 'surfer/male.manifest.json',
    outfits: { summer: 'boardies', shoulder: 'springsuit', winter: 'shortArmSteamer' },
    quiver: {
      thruster: { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 },
      stepUp: { lengthIn: 80, widthIn: 19.5, thicknessIn: 2.625 },
      bodyboard: { lengthIn: 42, widthIn: 21.5, thicknessIn: 2.625 },
    },
    skin: [0.46, 0.3, 0.2], tan: 0.45, brows: [0.07, 0.045, 0.028], lips: [0.34, 0.17, 0.14], iris: [0.14, 0.08, 0.035], hairRoot: [0.12, 0.08, 0.04], hairTip: [0.55, 0.43, 0.27],
    fabric: [0.1, 0.1, 0.12], rashie: [0.05, 0.05, 0.06], neopreneAccent: [0.45, 0.2, 0.05], boardies: [0.08, 0.28, 0.3],
    boardLooks: { bodyboard: { deck: [0.35, 0.05, 0.05], rail: [0.25, 0.04, 0.04] } },
  },
};

export const boardFor = (p: SurferPreset, kind: BoardKind): BoardSpec => makeBoard(kind, p.quiver[kind]);
export const boardLookFor = (p: SurferPreset, kind: BoardKind): BoardLook => ({ ...DEFAULT_BOARD_LOOKS[kind], ...p.boardLooks[kind] });
