// src/frontend/boardPick.ts
import { buildBoard, meshVolume } from '../board/boardGeometry';
import type { BoardKind } from '../board/boardSpec';
import { PRESETS, type PresetName, boardFor, boardsFor } from '../surfer/presets';
import { BOARD_WORDS, RIDER_COPY, chooseLine, fillLine, sizeBandOf, sizeWords } from './riderCopy';

export type Fit = 'IDEAL' | 'GOOD' | 'OK';
export const BOARD_NAMES: Record<BoardKind, string> = { thruster: 'Thruster', stepUp: 'Step-up', bodyboard: 'Bodyboard' };
const RANK: Record<Fit, number> = { IDEAL: 0, GOOD: 1, OK: 2 };

/** A board's fit for the conditions (spec §8's table). */
export function fitOf(kind: BoardKind, sizeFt: number, periodS: number): Fit {
  if (kind === 'thruster') return sizeFt >= 2 && sizeFt <= 6 ? 'IDEAL' : (sizeFt > 6 && sizeFt <= 8) || (sizeFt >= 1.5 && sizeFt < 2) ? 'GOOD' : 'OK';
  if (kind === 'stepUp') return sizeFt >= 6 && sizeFt <= 12 ? 'IDEAL' : sizeFt >= 5 && sizeFt < 6 ? 'GOOD' : 'OK';
  return (sizeFt >= 1.5 && sizeFt <= 6) || (periodS >= 14 && sizeFt <= 8) ? 'IDEAL' : 'GOOD';
}

/** Each rider's taste, breaking ties (spec §8: Shazza and T-Bone take the thruster before the bodyboard). */
const TASTE: Record<PresetName, BoardKind[]> = {
  female: ['thruster', 'stepUp', 'bodyboard'],
  male: ['stepUp', 'thruster', 'bodyboard'],
  grommet: ['bodyboard'],
};

/** The rider's pick: the best fit in their quiver, ties to their taste. */
export function pickBoard(name: PresetName, sizeFt: number, periodS: number): BoardKind {
  const quiver = boardsFor(PRESETS[name]);
  return TASTE[name].filter((k) => quiver.includes(k)).reduce((best, k) => (RANK[fitOf(k, sizeFt, periodS)] < RANK[fitOf(best, sizeFt, periodS)] ? k : best));
}

export function reasonLine(name: PresetName, kind: BoardKind, sizeFt: number, seed: number): string {
  return fillLine(chooseLine(RIDER_COPY[name].boardLines[sizeBandOf(sizeFt)], seed), { size: sizeWords(sizeFt), board: BOARD_WORDS[kind] });
}

export interface Bars {
  paddle: number;
  hold: number;
  turn: number;
}

/** How much a tail holds a line, by shape (a pin tail holds better than a squash). */
const TAIL_HOLD = { squash: 1, roundPin: 1.15, crescent: 1 } as const;

const volumes = new Map<string, number>();
function volumeL(name: PresetName, kind: BoardKind): number {
  const key = `${name}:${kind}`;
  let v = volumes.get(key);
  if (v === undefined) {
    const m = buildBoard(boardFor(PRESETS[name], kind));
    v = meshVolume(m.positions, m.indices) * 1000;
    volumes.set(key, v);
  }
  return v;
}

/** 1–5 over a range padded by 30% each side (so the smallest board isn't scored nothing). */
function score(v: number, lo: number, hi: number): number {
  const pad = (hi - lo) * 0.3 || 1, a = lo - pad, b = hi + pad;
  return Math.min(5, Math.max(1, Math.round(1 + (4 * (v - a)) / (b - a))));
}

const surfboards = (): [PresetName, BoardKind][] =>
  (['female', 'male', 'grommet'] as const).flatMap((n) => boardsFor(PRESETS[n]).filter((k) => k !== 'bodyboard').map((k) => [n, k] as [PresetName, BoardKind]));
const bodyboards = (): PresetName[] => (['female', 'male', 'grommet'] as const).filter((n) => boardsFor(PRESETS[n]).includes('bodyboard'));

/** Paddle, Hold and Turn (spec §8), normalised over the three riders' quivers; a bodyboard on its own scale. */
export function boardBars(name: PresetName, kind: BoardKind): Bars {
  if (kind === 'bodyboard') {
    const area = (n: PresetName): number => { const s = boardFor(PRESETS[n], 'bodyboard'); return s.lengthM * s.maxWidthM; };
    const all = bodyboards().map(area);
    return { paddle: score(area(name), Math.min(...all), Math.max(...all)), hold: 3, turn: 5 };
  }
  const hold = (n: PresetName, k: BoardKind): number => { const s = boardFor(PRESETS[n], k); return s.lengthM * TAIL_HOLD[s.tail]; };
  const turn = (n: PresetName, k: BoardKind): number => 1 / boardFor(PRESETS[n], k).lengthM;
  const boards = surfboards();
  const range = (f: (n: PresetName, k: BoardKind) => number): [number, number] => { const v = boards.map(([n, k]) => f(n, k)); return [Math.min(...v), Math.max(...v)]; };
  return {
    paddle: score(volumeL(name, kind), ...range(volumeL)),
    hold: score(hold(name, kind), ...range(hold)),
    turn: score(turn(name, kind), ...range(turn)),
  };
}

export function lengthLabel(inches: number): string {
  const r = Math.round(inches);
  return `${Math.floor(r / 12)}'${r % 12}"`;
}

const VULGAR: Record<number, string> = { 2: '⅛', 4: '¼', 6: '⅜', 8: '½', 10: '⅝', 12: '¾', 14: '⅞' };

/** Inches to the nearest sixteenth: "18¾", "2 5⁄16", "19". */
export function inchFraction(v: number): string {
  const sixteenths = Math.round(v * 16), whole = Math.floor(sixteenths / 16), rest = sixteenths % 16;
  if (rest === 0) return `${whole}`;
  if (VULGAR[rest]) return `${whole}${VULGAR[rest]}`;
  return `${whole} ${rest}⁄16`;
}

const TAIL_WORDS = { squash: 'squash tail', roundPin: 'round pin tail', crescent: 'crescent tail' } as const;

/** `5'10" × 18¾" × 2 5⁄16" · squash tail · thruster` (spec §4.3). */
export function specsLine(name: PresetName, kind: BoardKind): string {
  const d = PRESETS[name].quiver[kind]!, s = boardFor(PRESETS[name], kind);
  const len = kind === 'bodyboard' ? `${inchFraction(d.lengthIn)}"` : lengthLabel(d.lengthIn);
  const parts = [`${len} × ${inchFraction(d.widthIn)}" × ${inchFraction(d.thicknessIn)}"`, TAIL_WORDS[s.tail]];
  if (s.fins.length === 3) parts.push('thruster');
  return parts.join(' · ');
}
