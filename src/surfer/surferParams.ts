import type { BoardKind } from '../board/boardSpec';
import { type PoseName, posesFor } from './poseNames';
import { PRESETS, type PresetName, type Stance, boardsFor } from './presets';
import { type OutfitChoice, presetOutfits } from './wardrobe';

/** The Surfer folder (spec §6), persisted with the look and carried by moment links. */
export interface SurferParams {
  enabled: boolean;
  preset: PresetName;
  stance: Stance;
  board: BoardKind;
  outfit: OutfitChoice;
  pose: PoseName;
  /** 0–1 through a cycle or the pop-up's beats. */
  phaseT: number;
  /** Run the phase from the clock (the paddle stroke and kicks, the pop-up) instead of the slider. */
  play: boolean;
  /** On land (the dune, the select screen): Grommet's glasses on, hair and skin dry (grommet spec §6). */
  onLand: boolean;
  /** The four dials, as offsets around the pose's own values (spec §3.5). */
  compression: number;
  lean: number;
  twist: number;
  reach: number;
  balance: boolean;
  balanceAmount: number;
  /** Where the board sits (world metres) and which way its nose points (compass degrees). */
  x: number;
  z: number;
  headingDeg: number;
  heightNudgeM: number;
  pitchNudgeDeg: number;
  /** Idle life (closeup spec §5): blinks, gaze, breathing, the mood's smile, the head looking around. */
  idle: boolean;
  /** The Face folder's dials override the idle face's blink, smile, jaw, brows, squint and gaze (the gate, testing). */
  faceManual: boolean;
  faceBlink: number;
  faceSmile: number;
  faceJaw: number;
  faceBrows: number;
  faceSquint: number;
  gazeYawDeg: number;
  gazePitchDeg: number;
}

/** In the lineup where Andrew waits (DEFAULT_LINEUP_POSITION), nose out to sea toward the south-west swell. */
export const DEFAULT_SURFER_PARAMS: Readonly<SurferParams> = {
  enabled: false, preset: 'female', stance: 'regular', board: 'thruster', outfit: 'season', pose: 'sit', phaseT: 0, play: true, onLand: false,
  compression: 0, lean: 0, twist: 0, reach: 0, balance: true, balanceAmount: 1,
  x: -25, z: 45, headingDeg: 225, heightNudgeM: 0, pitchNudgeDeg: 0,
  idle: true, faceManual: false, faceBlink: 0, faceSmile: 0, faceJaw: 0, faceBrows: 0, faceSquint: 0, gazeYawDeg: 0, gazePitchDeg: 0,
};

export const SURFER_PARAM_RANGES = {
  phaseT: { min: 0, max: 1 },
  compression: { min: -1, max: 1 },
  lean: { min: -1, max: 1 },
  twist: { min: -1, max: 1 },
  reach: { min: -1, max: 1 },
  balanceAmount: { min: 0, max: 2 },
  x: { min: -400, max: 400 },
  z: { min: -400, max: 400 },
  heightNudgeM: { min: -3, max: 3 },
  pitchNudgeDeg: { min: -45, max: 45 },
  faceBlink: { min: 0, max: 1 },
  faceSmile: { min: 0, max: 1 },
  faceJaw: { min: 0, max: 1 },
  faceBrows: { min: 0, max: 1 },
  faceSquint: { min: 0, max: 1 },
  gazeYawDeg: { min: -8, max: 8 },
  gazePitchDeg: { min: -5, max: 5 },
} as const;

/** One paddle stroke (both arms; two kicks a stroke on the bodyboard), and the pop-up played through before it holds. */
export const PADDLE_CYCLE_S = 1.6;
export const POPUP_S = 1.8;
const POPUP_LOOP_S = 3.2;

/** The pose's phase while playing: the paddle cycles, the pop-up plays, holds standing, and goes again; a still pose
 * keeps the slider's phase. */
export function playPhase(pose: PoseName, simTime: number, sliderT: number): number {
  if (pose === 'paddle') return (((simTime / PADDLE_CYCLE_S) % 1) + 1) % 1;
  if (pose === 'popup') return Math.min(1, ((((simTime % POPUP_LOOP_S) + POPUP_LOOP_S) % POPUP_LOOP_S) / POPUP_S));
  return sliderT;
}

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

export function normalizeSurferParams(p: SurferParams): void {
  const d = DEFAULT_SURFER_PARAMS;
  p.enabled = p.enabled === true;
  p.balance = p.balance !== false;
  p.play = p.play !== false;
  p.onLand = p.onLand === true;
  p.idle = p.idle !== false;
  p.faceManual = p.faceManual === true;
  p.preset = oneOf(p.preset, ['female', 'male', 'grommet'] as const, d.preset);
  p.stance = oneOf(p.stance, ['regular', 'goofy'] as const, d.stance);
  const boards = boardsFor(PRESETS[p.preset]);
  p.board = oneOf(p.board, boards, boards[0]);
  p.pose = oneOf(p.pose, posesFor(p.board), 'sit');
  p.outfit = oneOf(p.outfit, ['season', ...presetOutfits(PRESETS[p.preset])] as const, 'season');
  for (const k of Object.keys(SURFER_PARAM_RANGES) as (keyof typeof SURFER_PARAM_RANGES)[]) {
    const r = SURFER_PARAM_RANGES[k], v = p[k];
    p[k] = typeof v === 'number' && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : d[k];
  }
  p.headingDeg = typeof p.headingDeg === 'number' && Number.isFinite(p.headingDeg) ? ((p.headingDeg % 360) + 360) % 360 : d.headingDeg;
}

/** Surfer params from untrusted input (links, stored settings): known keys only, then normalised. */
export function sanitizeSurferParams(raw: unknown): SurferParams {
  const p = { ...DEFAULT_SURFER_PARAMS } as SurferParams;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const src = raw as Record<string, unknown>;
    for (const k of Object.keys(p) as (keyof SurferParams)[]) if (k in src) (p as unknown as Record<string, unknown>)[k] = src[k];
  }
  normalizeSurferParams(p);
  return p;
}
