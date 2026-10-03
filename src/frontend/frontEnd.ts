// src/frontend/frontEnd.ts
import type { BoardKind } from '../board/boardSpec';
import { PRESETS, type PresetName, boardsFor } from '../surfer/presets';
import { type OutfitChoice, presetOutfits } from '../surfer/wardrobe';
import { pickBoard } from './boardPick';
import type { SavedChoices } from './frontSettings';
import { RIDER_ORDER } from './riderCopy';
import { type Dir, type RowId, type SessionSetup, fineRow, presetById, presetOfSetup, rollSetup, stepPreset, stepRow } from './sessionSetup';

export type Beat = 'conditions' | 'rider' | 'gear' | 'out';
export type FrontAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'random' | 'details' | 'fineMinus' | 'finePlus' | 'tabMinus' | 'tabPlus' | 'toggle' | 'start' | 'settings';

export const BEAT_MOVE_S = 1.6;
export const CALM_MOVE_S = 0.2;

export interface FrontState {
  beat: Beat;
  setup: SessionSetup;
  presetId: string | null;
  rowFocus: RowId;
  detailsOpen: boolean;
  rider: PresetName;
  gearTab: 'board' | 'outfit';
  gearFocus: number;
  boards: Partial<Record<PresetName, BoardKind>>;
  outfits: Partial<Record<PresetName, OutfitChoice>>;
  showSpecs: boolean;
  /** A camera move between beats in progress (the beat is already the destination). */
  move: { from: Beat; to: Beat; t: number; durS: number } | null;
  /** Input during a move, applied when it lands (spec §5.6). */
  buffer: FrontAction[];
}

export type FrontEvent =
  | { kind: 'focus' }
  | { kind: 'value'; row: RowId; dir: Dir }
  | { kind: 'end'; row: RowId }
  | { kind: 'roll'; seed: number }
  | { kind: 'details'; open: boolean }
  | { kind: 'move'; from: Beat; to: Beat }
  | { kind: 'landed'; beat: Beat }
  | { kind: 'riderFocus'; rider: PresetName }
  | { kind: 'pick'; rider: PresetName }
  | { kind: 'gear'; tab: 'board' | 'outfit'; focus: number }
  | { kind: 'chosen' }
  | { kind: 'paddleOut'; choice: SessionChoice }
  | { kind: 'back' }
  | { kind: 'settings' };

export interface SessionChoice {
  setup: SessionSetup;
  rider: PresetName;
  board: BoardKind;
  outfit: OutfitChoice;
}

const BASE_ROWS: RowId[] = ['preset', 'month', 'time', 'sky', 'wind', 'swell', 'from', 'tide'];

export function conditionRows(s: FrontState): RowId[] {
  if (!s.detailsOpen) return BASE_ROWS;
  const i = BASE_ROWS.indexOf('swell');
  return [...BASE_ROWS.slice(0, i + 1), 'period', ...BASE_ROWS.slice(i + 1)];
}

const outfitRows = (rider: PresetName): OutfitChoice[] => presetOutfits(PRESETS[rider]).filter((o) => o !== 'walking');

/** The rows of Grab your gear's tab: the rider's boards, or their three surf outfits. */
export function gearRows(s: FrontState): (BoardKind | OutfitChoice)[] {
  return s.gearTab === 'board' ? boardsFor(PRESETS[s.rider]) : outfitRows(s.rider);
}

export function initialFront(saved: SavedChoices): FrontState {
  return {
    beat: 'conditions', setup: saved.setup, presetId: presetOfSetup(saved.setup), rowFocus: 'preset', detailsOpen: false,
    rider: saved.rider, gearTab: 'board', gearFocus: 0, boards: { ...saved.boards }, outfits: { ...saved.outfits },
    showSpecs: false, move: null, buffer: [],
  };
}

export const boardOf = (s: FrontState, rider: PresetName): BoardKind => s.boards[rider] ?? pickBoard(rider, s.setup.swellFt, s.setup.periodS);

export const choiceOf = (s: FrontState): SessionChoice => ({ setup: s.setup, rider: s.rider, board: boardOf(s, s.rider), outfit: s.outfits[s.rider] ?? 'season' });

export const savedOf = (s: FrontState): SavedChoices => ({ setup: s.setup, rider: s.rider, boards: { ...s.boards }, outfits: { ...s.outfits } });

type Ctx = { seed: number; today: Date; calm: boolean };
type Out = { state: FrontState; events: FrontEvent[] };

const wrap = (i: number, n: number): number => ((i % n) + n) % n;

function moveTo(s: FrontState, to: Beat, ctx: Ctx, extra: FrontEvent[] = []): Out {
  return { state: { ...s, beat: to, move: { from: s.beat, to, t: 0, durS: ctx.calm ? CALM_MOVE_S : BEAT_MOVE_S } }, events: [...extra, { kind: 'move', from: s.beat, to }] };
}

/** On the gear beat, the focus starts on the rider's board (or outfit). */
function gearFocusFor(s: FrontState): number {
  if (s.gearTab === 'board') return Math.max(0, boardsFor(PRESETS[s.rider]).indexOf(boardOf(s, s.rider)));
  const want = s.outfits[s.rider] ?? 'season', rows = outfitRows(s.rider);
  return Math.max(0, rows.indexOf(want));
}

function stepConditions(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  const rows = conditionRows(s), i = rows.indexOf(s.rowFocus);
  switch (a) {
    case 'up': case 'down':
      return { state: { ...s, rowFocus: rows[wrap(i + (a === 'down' ? 1 : -1), rows.length)] }, events: [{ kind: 'focus' }] };
    case 'left': case 'right': case 'fineMinus': case 'finePlus': {
      const dir: Dir = a === 'left' || a === 'fineMinus' ? -1 : 1;
      if (s.rowFocus === 'preset') {
        if (a === 'fineMinus' || a === 'finePlus') return { state: s, events: [] };
        const id = stepPreset(s.presetId, dir);
        return { state: { ...s, presetId: id, setup: presetById(id)!.setup }, events: [{ kind: 'value', row: 'preset', dir }] };
      }
      const r = a === 'left' || a === 'right' ? stepRow(s.setup, s.rowFocus, dir, ctx.today) : fineRow(s.setup, s.rowFocus, dir, ctx.today);
      if (!r.changed) return { state: s, events: r.atEnd ? [{ kind: 'end', row: s.rowFocus }] : [] };
      return { state: { ...s, setup: r.setup, presetId: presetOfSetup(r.setup) }, events: [{ kind: 'value', row: s.rowFocus, dir }] };
    }
    case 'random': {
      const setup = rollSetup(ctx.seed);
      return { state: { ...s, setup, presetId: presetOfSetup(setup) }, events: [{ kind: 'roll', seed: ctx.seed }] };
    }
    case 'details': {
      const open = !s.detailsOpen;
      return { state: { ...s, detailsOpen: open, rowFocus: !open && s.rowFocus === 'period' ? 'swell' : s.rowFocus }, events: [{ kind: 'details', open }] };
    }
    case 'confirm':
      return moveTo(s, 'rider', ctx);
    default:
      return { state: s, events: [] };
  }
}

function stepRider(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  switch (a) {
    case 'left': case 'right': case 'tabMinus': case 'tabPlus': {
      const dir = a === 'left' || a === 'tabMinus' ? -1 : 1, i = RIDER_ORDER.indexOf(s.rider);
      const rider = RIDER_ORDER[wrap(i + dir, RIDER_ORDER.length)];
      return { state: { ...s, rider }, events: [{ kind: 'riderFocus', rider }] };
    }
    case 'confirm': {
      const t = { ...s, gearTab: 'board' as const };
      return moveTo({ ...t, gearFocus: gearFocusFor(t) }, 'gear', ctx, [{ kind: 'pick', rider: s.rider }]);
    }
    case 'back':
      return moveTo(s, 'conditions', ctx, [{ kind: 'back' }]);
    default:
      return { state: s, events: [] };
  }
}

function stepGear(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  const rows = gearRows(s);
  switch (a) {
    case 'up': case 'down': {
      const gearFocus = wrap(s.gearFocus + (a === 'down' ? 1 : -1), rows.length);
      return { state: { ...s, gearFocus }, events: [{ kind: 'gear', tab: s.gearTab, focus: gearFocus }] };
    }
    case 'tabMinus': case 'tabPlus': {
      const t = { ...s, gearTab: s.gearTab === 'board' ? ('outfit' as const) : ('board' as const) };
      const gearFocus = gearFocusFor(t);
      return { state: { ...t, gearFocus }, events: [{ kind: 'gear', tab: t.gearTab, focus: gearFocus }] };
    }
    case 'confirm': {
      const v = rows[s.gearFocus];
      const state = s.gearTab === 'board' ? { ...s, boards: { ...s.boards, [s.rider]: v as BoardKind } } : { ...s, outfits: { ...s.outfits, [s.rider]: v as OutfitChoice } };
      return { state, events: [{ kind: 'chosen' }] };
    }
    case 'toggle':
      return { state: { ...s, showSpecs: !s.showSpecs }, events: [] };
    case 'back':
      return moveTo(s, 'rider', ctx, [{ kind: 'back' }]);
    default:
      return { state: s, events: [] };
  }
}

/** One action (spec §3, §4): A on, B back, START out from anywhere; a move skips on A or B and buffers the rest. */
export function step(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  if (s.beat === 'out') return { state: s, events: [] };
  if (a === 'settings') return { state: s, events: [{ kind: 'settings' }] };
  if (a === 'start') {
    const state = { ...s, beat: 'out' as const, move: null, buffer: [] };
    return { state, events: [{ kind: 'paddleOut', choice: choiceOf(state) }] };
  }
  if (s.move) {
    if (a === 'confirm' || a === 'back') return land(s, ctx);
    return { state: { ...s, buffer: [...s.buffer, a] }, events: [] };
  }
  if (s.beat === 'conditions') return stepConditions(s, a, ctx);
  if (s.beat === 'rider') return stepRider(s, a, ctx);
  return stepGear(s, a, ctx);
}

/** Ends the move, then applies what was buffered during it. */
function land(s: FrontState, ctx: Ctx): Out {
  let state: FrontState = { ...s, move: null, buffer: [] };
  const events: FrontEvent[] = [{ kind: 'landed', beat: state.beat }];
  for (const a of s.buffer) {
    const r = step(state, a, ctx);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Advances a camera move; lands it at its end. */
export function tick(s: FrontState, dtS: number, ctx: Ctx): Out {
  if (!s.move) return { state: s, events: [] };
  const t = s.move.t + dtS / s.move.durS;
  if (t >= 1) return land(s, ctx);
  return { state: { ...s, move: { ...s.move, t } }, events: [] };
}
