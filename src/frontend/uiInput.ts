// src/frontend/uiInput.ts
import { shouldIgnoreKeyTarget } from '../camera/Input';
import type { FrontAction } from './frontEnd';

export type Device = 'keyboard' | 'xbox' | 'playstation';

/** Keys (KeyboardEvent.code) → actions (spec §10). */
export const KEY_ACTIONS: Record<string, FrontAction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'confirm', NumpadEnter: 'confirm', Space: 'confirm', Escape: 'back', Backspace: 'back',
  KeyR: 'random', KeyF: 'details', KeyQ: 'tabMinus', KeyE: 'tabPlus', Tab: 'toggle', KeyP: 'start', KeyC: 'controls',
};

export function deviceFamily(padId: string): 'xbox' | 'playstation' {
  return /054c|sony|dualshock|dualsense|playstation/i.test(padId) ? 'playstation' : 'xbox';
}

export interface PadSnapshot {
  id: string;
  buttons: boolean[];
  axes: number[];
}

/** The W3C standard mapping's buttons → actions. */
const PAD_BUTTONS: [number, FrontAction][] = [
  [0, 'confirm'], [1, 'back'], [2, 'details'], [3, 'random'], [4, 'tabMinus'], [5, 'tabPlus'], [6, 'fineMinus'], [7, 'finePlus'],
  [8, 'controls'], [9, 'start'], [11, 'toggle'], [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'],
];
const STICK = 0.5;

export function padHeld(p: PadSnapshot): Set<FrontAction> {
  const held = new Set<FrontAction>();
  for (const [i, a] of PAD_BUTTONS) if (p.buttons[i]) held.add(a);
  const [x = 0, y = 0] = p.axes;
  if (x > STICK) held.add('right');
  if (x < -STICK) held.add('left');
  if (y > STICK) held.add('down');
  if (y < -STICK) held.add('up');
  return held;
}

/** Actions that repeat while held (spec §10). */
export const REPEATING: ReadonlySet<FrontAction> = new Set(['up', 'down', 'left', 'right', 'fineMinus', 'finePlus']);

/** One device's presses: on the edge, then repeats for directions and fine steps; Back + START is Settings. */
export class Repeater {
  private readonly since = new Map<FrontAction, { at: number; next: number }>();

  constructor(private readonly delayMs = 250, private readonly everyMs = 80) {}

  update(held: ReadonlySet<FrontAction>, nowMs: number): FrontAction[] {
    const out: FrontAction[] = [];
    for (const a of [...this.since.keys()]) if (!held.has(a)) this.since.delete(a);
    const chord = held.has('back') && held.has('start');
    let chordNew = false;
    for (const a of held) {
      const s = this.since.get(a);
      if (!s) {
        this.since.set(a, { at: nowMs, next: nowMs + this.delayMs });
        if (chord && (a === 'back' || a === 'start')) chordNew = true;
        else out.push(a);
      } else if (REPEATING.has(a) && nowMs >= s.next) {
        out.push(a);
        s.next += this.everyMs;
        if (s.next <= nowMs) s.next = nowMs + this.everyMs;
      }
    }
    if (chordNew) out.push('settings');
    return out;
  }
}

/** The DOM side: keys from the window (not while typing in the dev panel), pads polled each frame. */
export class UiInput {
  private readonly keys = new Set<FrontAction>();
  /** Keys pressed since the last poll, so a press released before the next frame still counts. */
  private readonly tapped = new Set<FrontAction>();
  private readonly keyRepeater = new Repeater();
  private readonly padRepeaters = new Map<number, Repeater>();
  private device: Device = 'keyboard';
  private keyQueued = false;

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown, true);
    target.addEventListener('keyup', this.onKeyUp, true);
    target.addEventListener('blur', this.onBlur);
  }

  /** The actions since the last poll and the device that sent the latest. */
  poll(nowMs: number): { actions: FrontAction[]; device: Device } {
    const actions: FrontAction[] = [];
    const keyActions = this.keyRepeater.update(new Set([...this.keys, ...this.tapped]), nowMs);
    this.tapped.clear();
    if (keyActions.length || this.keyQueued) this.device = 'keyboard';
    this.keyQueued = false;
    actions.push(...keyActions);
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const live = new Set<number>();
    for (const g of pads) {
      if (!g || !g.connected) continue;
      live.add(g.index);
      let r = this.padRepeaters.get(g.index);
      if (!r) this.padRepeaters.set(g.index, (r = new Repeater()));
      const snap: PadSnapshot = { id: g.id, buttons: g.buttons.map((b) => b.pressed), axes: [...g.axes] };
      const got = r.update(padHeld(snap), nowMs);
      if (got.length) {
        this.device = deviceFamily(g.id);
        actions.push(...got);
      }
    }
    for (const i of [...this.padRepeaters.keys()]) if (!live.has(i)) this.padRepeaters.delete(i); // unplugged: its held keys go with it
    return { actions, device: this.device };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown, true);
    this.target.removeEventListener('keyup', this.onKeyUp, true);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (shouldIgnoreKeyTarget(e.target)) return;
    const a = KEY_ACTIONS[e.code];
    if (!a) return;
    e.preventDefault(); // Tab, Space and Backspace mustn't move the page or the browser's focus
    this.keys.add(a);
    this.tapped.add(a);
    this.keyQueued = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const a = KEY_ACTIONS[e.code];
    if (a) this.keys.delete(a);
  };

  private onBlur = (): void => this.keys.clear();
}
