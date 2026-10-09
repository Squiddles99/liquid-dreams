// src/frontend/frontEnd.ts
import type { BoardKind } from '../board/boardSpec';
import { SURF_BREAKS } from '../breaks';
import { PRESETS, type PresetName, type Stance, boardsFor } from '../surfer/presets';
import { type OutfitChoice, presetOutfits } from '../surfer/wardrobe';
import { pickBoard } from './boardPick';
import { todaysSetup } from './conditionsSource';
import type { SavedChoices } from './frontSettings';
import { RIDER_ORDER } from './riderCopy';
import { type Dir, type RowId, type SessionSetup, fineRow, presetById, presetOfSetup, rollSetup, stepPreset, stepRow } from './sessionSetup';

export type Beat = 'map' | 'conditions' | 'rider' | 'gear' | 'out';
export type GearTab = 'board' | 'outfit' | 'stance';
/** Grab your gear's tabs, in order (LB / RB step through them, round). */
export const GEAR_TABS: readonly GearTab[] = ['board', 'outfit', 'stance'];
export const STANCES: readonly Stance[] = ['regular', 'goofy'];
export type FrontAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'random' | 'details' | 'fineMinus' | 'finePlus' | 'tabMinus' | 'tabPlus' | 'toggle' | 'start' | 'settings' | 'controls';

export const BEAT_MOVE_S = 1.6;
export const CALM_MOVE_S = 0.2;

export interface FrontState {
  beat: Beat;
  setup: SessionSetup;
  presetId: string | null;
  rowFocus: RowId;
  detailsOpen: boolean;
  rider: PresetName;
  gearTab: GearTab;
  gearFocus: number;
  boards: Partial<Record<PresetName, BoardKind>>;
  outfits: Partial<Record<PresetName, OutfitChoice>>;
  /** Natural (regular) or goofy, per rider (absent: the rider's own). */
  stances: Partial<Record<PresetName, Stance>>;
  showSpecs: boolean;
  /** A camera move between beats in progress (the beat is already the destination). */
  move: { from: Beat; to: Beat; t: number; durS: number } | null;
  /** Input during a move, applied when it lands (spec §5.6). */
  buffer: FrontAction[];
  /** The focused break on the surf map (surf-map hub spec §3). */
  breakId: string;
  /** Where the map's conditions come from (saved with the settings; real-time is locked). */
  source: 'forecast' | 'custom';
  /** The focused break's details page is open over the map. */
  breakDetails: boolean;
  /** The details page's scroll step (up/down), and its last step (the page reports it once laid out). */
  detailsScroll: number;
  detailsMax: number;
  /** The player's own setup (Custom): kept apart from `setup`, which Surf here may fill with today's forecast. */
  customSetup: SessionSetup;
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
  | { kind: 'gear'; tab: GearTab; focus: number }
  | { kind: 'chosen' }
  | { kind: 'paddleOut'; choice: SessionChoice }
  | { kind: 'back' }
  | { kind: 'settings' }
  | { kind: 'controls' }
  | { kind: 'surfHere'; breakId: string }
  | { kind: 'title' }
  | { kind: 'locked'; what: 'library' | 'realtime' }
  | { kind: 'source'; source: 'forecast' | 'custom' }
  | { kind: 'breakDetails'; open: boolean }
  | { kind: 'pinFocus'; breakId: string };

export interface SessionChoice {
  setup: SessionSetup;
  rider: PresetName;
  board: BoardKind;
  outfit: OutfitChoice;
  stance: Stance;
}

const BASE_ROWS: RowId[] = ['preset', 'month', 'time', 'sky', 'wind', 'swell', 'from', 'tide'];

export function conditionRows(s: FrontState): RowId[] {
  if (!s.detailsOpen) return BASE_ROWS;
  const i = BASE_ROWS.indexOf('swell');
  return [...BASE_ROWS.slice(0, i + 1), 'period', ...BASE_ROWS.slice(i + 1)];
}

const outfitRows = (rider: PresetName): OutfitChoice[] => presetOutfits(PRESETS[rider]).filter((o) => o !== 'walking');

/** The rows of Grab your gear's tab: the rider's boards, their three surf outfits, or the two stances. */
export function gearRows(s: FrontState): (BoardKind | OutfitChoice | Stance)[] {
  if (s.gearTab === 'board') return boardsFor(PRESETS[s.rider]);
  return s.gearTab === 'outfit' ? outfitRows(s.rider) : [...STANCES];
}

export function initialFront(saved: SavedChoices, source: 'forecast' | 'custom' = 'forecast'): FrontState {
  return {
    beat: 'map', breakId: SURF_BREAKS[0].id, source, breakDetails: false, detailsScroll: 0, detailsMax: Infinity, customSetup: saved.setup, setup: saved.setup, presetId: presetOfSetup(saved.setup), rowFocus: 'preset', detailsOpen: false,
    rider: saved.rider, gearTab: 'board', gearFocus: 0, boards: { ...saved.boards }, outfits: { ...saved.outfits }, stances: { ...saved.stances },
    showSpecs: false, move: null, buffer: [],
  };
}

export const boardOf = (s: FrontState, rider: PresetName): BoardKind => s.boards[rider] ?? pickBoard(rider, s.setup.swellFt, s.setup.periodS);

export const stanceOf = (s: FrontState, rider: PresetName): Stance => s.stances[rider] ?? PRESETS[rider].defaultStance;

export const choiceOf = (s: FrontState): SessionChoice => ({ setup: s.setup, rider: s.rider, board: boardOf(s, s.rider), outfit: s.outfits[s.rider] ?? 'season', stance: stanceOf(s, s.rider) });

export const savedOf = (s: FrontState): SavedChoices => ({ setup: s.customSetup, rider: s.rider, boards: { ...s.boards }, outfits: { ...s.outfits }, stances: { ...s.stances } });

type Ctx = { seed: number; today: Date; calm: boolean };
type Out = { state: FrontState; events: FrontEvent[] };

const wrap = (i: number, n: number): number => ((i % n) + n) % n;

function moveTo(s: FrontState, to: Beat, ctx: Ctx, extra: FrontEvent[] = []): Out {
  return { state: { ...s, beat: to, move: { from: s.beat, to, t: 0, durS: ctx.calm ? CALM_MOVE_S : BEAT_MOVE_S } }, events: [...extra, { kind: 'move', from: s.beat, to }] };
}

/** On the gear beat, the focus starts on the rider's board (outfit, stance). */
function gearFocusFor(s: FrontState): number {
  if (s.gearTab === 'board') return Math.max(0, boardsFor(PRESETS[s.rider]).indexOf(boardOf(s, s.rider)));
  if (s.gearTab === 'stance') return STANCES.indexOf(stanceOf(s, s.rider));
  const want = s.outfits[s.rider] ?? 'season', rows = outfitRows(s.rider);
  return Math.max(0, rows.indexOf(want));
}

/** The surf map (surf-map hub spec §3): pins, Surf here, the details page over it, the source switch, Back to the title. */
function stepMap(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  if (s.breakDetails) {
    switch (a) {
      case 'down': return { state: { ...s, detailsScroll: Math.min(s.detailsMax, s.detailsScroll + 1) }, events: [] };
      case 'up': return { state: { ...s, detailsScroll: Math.max(0, s.detailsScroll - 1) }, events: [] };
      case 'back': case 'details': return { state: { ...s, breakDetails: false, detailsScroll: 0 }, events: [{ kind: 'breakDetails', open: false }] };
      case 'confirm': return surfHere(s, ctx);
      default: return { state: s, events: [] };
    }
  }
  const i = SURF_BREAKS.findIndex((b) => b.id === s.breakId), n = SURF_BREAKS.length;
  switch (a) {
    case 'up': case 'left': case 'down': case 'right': {
      if (n < 2) return { state: s, events: [] };
      const next = SURF_BREAKS[(i + (a === 'down' || a === 'right' ? 1 : -1) + n) % n].id;
      return { state: { ...s, breakId: next }, events: [{ kind: 'pinFocus', breakId: next }] };
    }
    case 'confirm': return surfHere(s, ctx);
    case 'details': return { state: { ...s, breakDetails: true, detailsScroll: 0 }, events: [{ kind: 'breakDetails', open: true }] };
    case 'toggle': { const source = s.source === 'forecast' ? 'custom' : 'forecast'; return { state: { ...s, source }, events: [{ kind: 'source', source }] }; }
    case 'tabMinus': case 'tabPlus': return { state: s, events: [{ kind: 'locked', what: 'library' }] };
    case 'back': return { state: s, events: [{ kind: 'title' }] };
    default: return { state: s, events: [] };
  }
}

/** Surf here: today's forecast or the player's own setup, then Conditions. */
function surfHere(s: FrontState, ctx: Ctx): Out {
  const setup = s.source === 'forecast' ? todaysSetup(ctx.today) : s.customSetup;
  return moveTo({ ...s, setup, presetId: presetOfSetup(setup), breakDetails: false, detailsScroll: 0 }, 'conditions', ctx, [{ kind: 'surfHere', breakId: s.breakId }]);
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
    case 'back':
      return moveTo(s, 'map', ctx, [{ kind: 'back' }]);
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
      const t = { ...s, gearTab: GEAR_TABS[wrap(GEAR_TABS.indexOf(s.gearTab) + (a === 'tabPlus' ? 1 : -1), GEAR_TABS.length)] };
      const gearFocus = gearFocusFor(t);
      return { state: { ...t, gearFocus }, events: [{ kind: 'gear', tab: t.gearTab, focus: gearFocus }] };
    }
    case 'confirm': {
      const v = rows[s.gearFocus];
      const state = s.gearTab === 'board' ? { ...s, boards: { ...s.boards, [s.rider]: v as BoardKind } }
        : s.gearTab === 'outfit' ? { ...s, outfits: { ...s.outfits, [s.rider]: v as OutfitChoice } } : { ...s, stances: { ...s.stances, [s.rider]: v as Stance } };
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

/** The details page's last scroll step, from its layout: the scroll never runs past it. */
export function withDetailsMax(s: FrontState, max: number): FrontState {
  return { ...s, detailsMax: max, detailsScroll: Math.min(s.detailsScroll, max) };
}

/** One action (spec §3, §4): A on, B back, START out from anywhere; a move skips on A or B and buffers the rest. */
export function step(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  const out = stepAny(s, a, ctx), t = out.state;
  // Edits on Custom are the player's own setup; on the forecast they stay this session's.
  if (t.source === 'custom' && t.beat !== 'map' && t.setup !== t.customSetup) return { state: { ...t, customSetup: t.setup }, events: out.events };
  return out;
}

function stepAny(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  if (s.beat === 'out') return { state: s, events: [] };
  if (a === 'settings') return { state: s, events: [{ kind: 'settings' }] };
  if (a === 'controls') return { state: s, events: [{ kind: 'controls' }] };
  if (a === 'start') {
    const state = { ...s, beat: 'out' as const, move: null, buffer: [] };
    return { state, events: [{ kind: 'paddleOut', choice: choiceOf(state) }] };
  }
  if (s.move) {
    if (a === 'confirm' || a === 'back') return land(s, ctx);
    return { state: { ...s, buffer: [...s.buffer, a] }, events: [] };
  }
  if (s.beat === 'map') return stepMap(s, a, ctx);
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

/** Focus straight onto a row, rider, gear row (the mouse's hover) or gear tab (a click). A focus tick only when it moves. */
export function focusTo(s: FrontState, target: { pin: string } | { row: RowId } | { rider: PresetName } | { gear: number } | { tab: FrontState['gearTab'] }): { state: FrontState; events: FrontEvent[] } {
  // Only on the beat the target belongs to, settled: a card of a beat that's gone (still under the mouse as it fades) mustn't
  // pick a rider on Grab your gear (Andrew: "I go to the outfit tab and I become Grommet").
  const beat = 'pin' in target ? 'map' : 'row' in target ? 'conditions' : 'rider' in target ? 'rider' : 'gear';
  if (s.beat !== beat || s.move) return { state: s, events: [] };
  if ('pin' in target) return target.pin === s.breakId || s.breakDetails ? { state: s, events: [] } : { state: { ...s, breakId: target.pin }, events: [{ kind: 'focus' }, { kind: 'pinFocus', breakId: target.pin }] };
  if ('tab' in target) {
    if (target.tab === s.gearTab) return { state: s, events: [] };
    const t = { ...s, gearTab: target.tab }, gearFocus = gearFocusFor(t);
    return { state: { ...t, gearFocus }, events: [{ kind: 'focus' }, { kind: 'gear', tab: t.gearTab, focus: gearFocus }] };
  }
  if ('row' in target) return target.row === s.rowFocus ? { state: s, events: [] } : { state: { ...s, rowFocus: target.row }, events: [{ kind: 'focus' }] };
  if ('rider' in target) return target.rider === s.rider ? { state: s, events: [] } : { state: { ...s, rider: target.rider }, events: [{ kind: 'focus' }, { kind: 'riderFocus', rider: target.rider }] };
  return target.gear === s.gearFocus ? { state: s, events: [] } : { state: { ...s, gearFocus: target.gear }, events: [{ kind: 'focus' }, { kind: 'gear', tab: s.gearTab, focus: target.gear }] };
}
