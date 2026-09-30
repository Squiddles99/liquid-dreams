import { type BoardLook, DEFAULT_BOARD_LOOKS, type RGB } from '../board/boardLook';
import { type BoardDims, type BoardKind, type BoardSpec, makeBoard } from '../board/boardSpec';

export type PresetName = 'female' | 'male' | 'grommet';
export type Stance = 'regular' | 'goofy';
export type Outfit = 'boardies' | 'bikini' | 'springsuit' | 'rashieAndBottoms' | 'shortArmSteamer' | 'rashieAndBoardies';

/** One of the three riders (spec §1, §4; grommet spec §6): the build numbers live in tools/surfer/presets/<name>.json. */
export interface SurferPreset {
  name: PresetName;
  label: string;
  /** What the crew calls them, shown in the panel with the real name: Shazza (Sharon). */
  nickname: string;
  realName: string;
  heightM: number;
  weightKg: number;
  defaultStance: Stance;
  /** Relative to the site's base URL (public/). */
  glbUrl: string;
  manifestUrl: string;
  outfits: { summer: Outfit; shoulder: Outfit; winter: Outfit };
  /** The boards this rider may ride (Grommet: only his bodyboard). */
  quiver: Partial<Record<BoardKind, BoardDims>>;
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
  /** 0–1 (grommet spec §5). */
  freckles: number;
  sunburn: number;
  /** 0–1: how far wet curls pull in toward the head at the tips (grommet spec §3). */
  curlTighten: number;
  boardLooks: Partial<Record<BoardKind, Partial<BoardLook>>>;
}

export const PRESETS: Record<PresetName, SurferPreset> = {
  female: {
    name: 'female', label: 'Female', nickname: 'Shazza', realName: 'Sharon', heightM: 1.65, weightKg: 55, defaultStance: 'regular',
    glbUrl: 'surfer/female.glb', manifestUrl: 'surfer/female.manifest.json',
    outfits: { summer: 'bikini', shoulder: 'rashieAndBottoms', winter: 'shortArmSteamer' },
    quiver: {
      thruster: { lengthIn: 70, widthIn: 18.75, thicknessIn: 2.3125 },
      stepUp: { lengthIn: 76, widthIn: 19, thicknessIn: 2.5 },
      bodyboard: { lengthIn: 40, widthIn: 21, thicknessIn: 2.625 },
    },
    skin: [0.52, 0.34, 0.24], tan: 0.35, brows: [0.16, 0.1, 0.055], lips: [0.42, 0.15, 0.14], iris: [0.12, 0.2, 0.22], hairRoot: [0.13, 0.085, 0.04], hairTip: [0.52, 0.4, 0.23],
    fabric: [0.55, 0.12, 0.1], rashie: [0.02, 0.12, 0.55], neopreneAccent: [0.1, 0.35, 0.45], boardies: [0.1, 0.2, 0.4],
    freckles: 0, sunburn: 0, curlTighten: 0,
    boardLooks: { bodyboard: { deck: [0.05, 0.25, 0.45], rail: [0.04, 0.19, 0.35] } },
  },
  male: {
    name: 'male', label: 'Male', nickname: 'T-Bone', realName: 'Tom', heightM: 1.78, weightKg: 68, defaultStance: 'goofy',
    glbUrl: 'surfer/male.glb', manifestUrl: 'surfer/male.manifest.json',
    outfits: { summer: 'boardies', shoulder: 'springsuit', winter: 'shortArmSteamer' },
    quiver: {
      thruster: { lengthIn: 72, widthIn: 19.25, thicknessIn: 2.4375 },
      stepUp: { lengthIn: 80, widthIn: 19.5, thicknessIn: 2.625 },
      bodyboard: { lengthIn: 42, widthIn: 21.5, thicknessIn: 2.625 },
    },
    skin: [0.46, 0.3, 0.2], tan: 0.45, brows: [0.07, 0.045, 0.028], lips: [0.34, 0.17, 0.14], iris: [0.14, 0.08, 0.035], hairRoot: [0.12, 0.08, 0.04], hairTip: [0.55, 0.43, 0.27],
    fabric: [0.1, 0.1, 0.12], rashie: [0.05, 0.05, 0.06], neopreneAccent: [0.45, 0.2, 0.05], boardies: [0.08, 0.28, 0.3],
    freckles: 0, sunburn: 0, curlTighten: 0,
    boardLooks: { bodyboard: { deck: [0.35, 0.05, 0.05], rail: [0.25, 0.04, 0.04] } },
  },
  grommet: {
    name: 'grommet', label: 'Grommet', nickname: 'Grommet', realName: 'Bradley', heightM: 1.52, weightKg: 40, defaultStance: 'regular',
    glbUrl: 'surfer/grommet.glb', manifestUrl: 'surfer/grommet.manifest.json',
    outfits: { summer: 'rashieAndBoardies', shoulder: 'springsuit', winter: 'shortArmSteamer' },
    quiver: { bodyboard: { lengthIn: 38, widthIn: 20, thicknessIn: 2.5 } },
    // A redhead's fair skin (tuned at the gate), ginger brows, green-hazel eyes, carrot-ginger hair.
    skin: [0.62, 0.45, 0.36], tan: 0.1, brows: [0.32, 0.13, 0.04], lips: [0.5, 0.22, 0.2], iris: [0.1, 0.2, 0.1], hairRoot: [0.28, 0.07, 0.02], hairTip: [0.72, 0.28, 0.06],
    fabric: [0.1, 0.1, 0.12], rashie: [0.22, 0.6, 0.02], neopreneAccent: [0.6, 0.3, 0.02], boardies: [0.02, 0.03, 0.12],
    freckles: 1, sunburn: 1, curlTighten: 0.3,
    boardLooks: { bodyboard: { deck: [0.75, 0.55, 0.02], rail: [0.03, 0.12, 0.45] } },
  },
};

const BOARD_ORDER: readonly BoardKind[] = ['thruster', 'stepUp', 'bodyboard'];
/** The boards a preset may ride: its quiver's, in the panel's order (Grommet: only his bodyboard). */
export const boardsFor = (p: SurferPreset): BoardKind[] => BOARD_ORDER.filter((k) => p.quiver[k] !== undefined);
export function boardFor(p: SurferPreset, kind: BoardKind): BoardSpec {
  const dims = p.quiver[kind];
  if (!dims) throw new Error(`${p.name} has no ${kind} in the quiver`);
  return makeBoard(kind, dims);
}
export const boardLookFor = (p: SurferPreset, kind: BoardKind): BoardLook => ({ ...DEFAULT_BOARD_LOOKS[kind], ...p.boardLooks[kind] });
