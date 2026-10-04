// src/frontend/controlsMenu.ts: the Controls page's state (pause menu and select screen; Andrew 2026-10-04). Viewing a
// drawing; remapping from a list of the tab's actions (and Reset to defaults); listening for the new key or button.
import { ACTION_LABELS, type Bindings, DEFAULT_BINDINGS, KEY_ACTIONS, type KeyAction, PAD_ACTIONS, type PadAction, bindKey, bindPad, buttonLabel, keyLabel } from '../ride/bindings';
import type { FrontAction } from './frontEnd';

export type ControlsTab = 'pad' | 'keys';
export type ControlsMode = 'view' | 'remap' | 'listen';

export interface ControlsState {
  tab: ControlsTab;
  mode: ControlsMode;
  /** The focused remap row. */
  focus: number;
  /** A line under the list: what the last change did. */
  note: string;
}

export type RemapRow = KeyAction | 'reset';

export function remapRows(tab: ControlsTab): RemapRow[] {
  return tab === 'keys' ? [...KEY_ACTIONS, 'reset'] : [...PAD_ACTIONS, 'reset'];
}

export const openControls = (tab: ControlsTab): ControlsState => ({ tab, mode: 'view', focus: 0, note: '' });

export type ControlsSound = 'focus' | 'confirm' | 'back' | null;

/**
 * One action. Viewing: left, right, LB and RB switch the tab; A remaps; B closes. Remapping: up and down move (round),
 * the tabs switch, A listens for the focused action (or resets the tab to its defaults), B goes back to the drawing.
 * Listening: B cancels (the key or button itself arrives through `heard`).
 */
export function stepControls(s: ControlsState, a: FrontAction, b: Bindings): { state: ControlsState; bindings: Bindings; sound: ControlsSound; closed: boolean } {
  const same = { state: s, bindings: b, sound: null, closed: false };
  const other: ControlsTab = s.tab === 'pad' ? 'keys' : 'pad';
  if (s.mode === 'listen') return a === 'back' ? { ...same, state: { ...s, mode: 'remap', note: '' }, sound: 'back' } : same;
  if (a === 'left' || a === 'right' || a === 'tabMinus' || a === 'tabPlus') {
    if (s.mode === 'remap' && (a === 'left' || a === 'right')) return same;
    return { ...same, state: { ...s, tab: other, focus: 0, note: '' }, sound: 'focus' };
  }
  if (s.mode === 'view') {
    if (a === 'confirm') return { ...same, state: { ...s, mode: 'remap', focus: 0, note: '' }, sound: 'confirm' };
    if (a === 'back') return { ...same, closed: true, sound: 'back' };
    return same;
  }
  const rows = remapRows(s.tab), n = rows.length;
  if (a === 'up' || a === 'down') return { ...same, state: { ...s, focus: (s.focus + (a === 'down' ? 1 : -1) + n) % n }, sound: 'focus' };
  if (a === 'back') return { ...same, state: { ...s, mode: 'view', note: '' }, sound: 'back' };
  if (a === 'confirm') {
    if (rows[s.focus] === 'reset') {
      const bindings = s.tab === 'keys' ? { ...b, keys: { ...DEFAULT_BINDINGS.keys } } : { ...b, pad: { ...DEFAULT_BINDINGS.pad } };
      return { state: { ...s, note: s.tab === 'keys' ? 'Keyboard back to the defaults' : 'Controller back to the defaults' }, bindings, sound: 'confirm', closed: false };
    }
    return { ...same, state: { ...s, mode: 'listen', note: '' }, sound: 'confirm' };
  }
  return same;
}

/** What was pressed while listening: a key (KeyboardEvent.code), a pad button, or a cancel (Esc, START). */
export type Heard = { key: string } | { button: number } | 'cancel';

/** The press while listening: bound (swapping with the action that had it), or refused, or cancelled. */
export function heard(s: ControlsState, h: Heard, b: Bindings, family: 'xbox' | 'playstation' = 'xbox'): { state: ControlsState; bindings: Bindings; sound: ControlsSound } {
  if (s.mode !== 'listen') return { state: s, bindings: b, sound: null };
  const back = { ...s, mode: 'remap' as const };
  if (h === 'cancel') return { state: { ...back, note: '' }, bindings: b, sound: 'back' };
  const action = remapRows(s.tab)[s.focus];
  if (action === 'reset') return { state: back, bindings: b, sound: null };
  if ('key' in h) {
    if (s.tab !== 'keys') return { state: s, bindings: b, sound: null };
    const r = bindKey(b, action, h.key);
    if ('refused' in r) return { state: { ...s, note: `${keyLabel(h.key)} is kept by the game: try another key` }, bindings: b, sound: 'back' };
    const note = r.swapped ? `${ACTION_LABELS[r.swapped]} moved to ${keyLabel(r.bindings.keys[r.swapped])}` : '';
    return { state: { ...back, note }, bindings: r.bindings, sound: 'confirm' };
  }
  if (s.tab !== 'pad') return { state: s, bindings: b, sound: null };
  const r = bindPad(b, action as PadAction, h.button);
  if ('refused' in r) return { state: { ...s, note: 'That button is kept by the game: try another' }, bindings: b, sound: 'back' };
  const note = r.swapped ? `${ACTION_LABELS[r.swapped]} moved to ${buttonLabel(r.bindings.pad[r.swapped], family)}` : '';
  return { state: { ...back, note }, bindings: r.bindings, sound: 'confirm' };
}
