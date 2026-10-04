// src/ride/bindings.ts: the player's controls for the ride (Andrew 2026-10-04: "include an option for the player to
// remap"). The keyboard's six actions and the pad's four buttons are the player's to change; Esc and START pause, the left
// stick steers and the arrow keys mirror W A S D, always. Saved with the front end's settings.
import { HOTKEYS } from '../dev/hotkeys';
import type { SettingsStorage } from '../dev/devSettings';

export type KeyAction = 'paddle' | 'crouch' | 'left' | 'right' | 'popup' | 'next';
export type PadAction = 'paddle' | 'crouch' | 'popup' | 'next';

export const KEY_ACTIONS: readonly KeyAction[] = ['paddle', 'left', 'right', 'crouch', 'popup', 'next'];
export const PAD_ACTIONS: readonly PadAction[] = ['paddle', 'crouch', 'popup', 'next'];

export const ACTION_LABELS: Record<KeyAction, string> = {
  paddle: 'Paddle · stand tall', crouch: 'Crouch', left: 'Turn left', right: 'Turn right', popup: 'Pop up', next: 'Next wave',
};

export interface Bindings {
  /** KeyboardEvent.code per action. */
  keys: Record<KeyAction, string>;
  /** W3C standard-mapping button index per action. */
  pad: Record<PadAction, number>;
}

export const DEFAULT_BINDINGS: Bindings = {
  keys: { paddle: 'KeyW', crouch: 'KeyS', left: 'KeyA', right: 'KeyD', popup: 'Space', next: 'KeyR' },
  pad: { paddle: 7, crouch: 6, popup: 0, next: 1 },
};

/** The arrow keys' fixed parts: the same as W A S D, whatever those are bound to. */
export const ARROW_FOR: Partial<Record<KeyAction, string>> = { paddle: 'ArrowUp', crouch: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/**
 * Keys the game keeps: pause (Esc), the arrows, the game's own hotkeys (and G: surf, C: the camera, both read while
 * riding), and keys the browser or the OS act on.
 */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ...Object.values(HOTKEYS), 'KeyG', 'KeyC',
  'Tab', 'MetaLeft', 'MetaRight', 'ContextMenu', 'CapsLock', 'NumLock', 'ScrollLock', 'Pause', 'PrintScreen',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

/** The pad's buttons a player can bind: the face buttons, the bumpers and the triggers (START pauses, the sticks steer). */
export const BINDABLE_BUTTONS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];

export const BUTTON_NAMES: Record<'xbox' | 'playstation', readonly string[]> = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT'],
  playstation: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2'],
};

const KEY_WORDS: Record<string, string> = {
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: 'Backspace', ShiftLeft: 'Shift', ShiftRight: 'R Shift',
  ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', AltLeft: 'Alt', AltRight: 'R Alt', Minus: '-', Equal: '=', BracketLeft: '[',
  BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc',
};

/** A key's name on its cap: KeyW → W, Digit1 → 1, Numpad4 → Num 4, ShiftLeft → Shift. */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return KEY_WORDS[code] ?? code.replace(/^Numpad/, 'Num ');
}

export function buttonLabel(button: number, family: 'xbox' | 'playstation' = 'xbox'): string {
  return BUTTON_NAMES[family][button] ?? `Button ${button}`;
}

export type BindResult<A> = { bindings: Bindings; swapped: A | null } | { refused: 'reserved' };

/** Binds a key to an action. A key another action had swaps with it, so every action keeps a key. */
export function bindKey(b: Bindings, action: KeyAction, code: string): BindResult<KeyAction> {
  if (RESERVED_KEYS.has(code)) return { refused: 'reserved' };
  const keys = { ...b.keys };
  const other = KEY_ACTIONS.find((a) => a !== action && keys[a] === code) ?? null;
  if (other) keys[other] = keys[action];
  keys[action] = code;
  return { bindings: { ...b, keys }, swapped: other };
}

/** Binds a pad button to an action; one another action had swaps with it. */
export function bindPad(b: Bindings, action: PadAction, button: number): BindResult<PadAction> {
  if (!BINDABLE_BUTTONS.includes(button)) return { refused: 'reserved' };
  const pad = { ...b.pad };
  const other = PAD_ACTIONS.find((a) => a !== action && pad[a] === button) ?? null;
  if (other) pad[other] = pad[action];
  pad[action] = button;
  return { bindings: { ...b, pad }, swapped: other };
}

/** Whatever was saved, made whole: unknown or reserved keys, bad buttons and duplicates fall back to the defaults. */
export function sanitizeBindings(raw: unknown): Bindings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { keys?: Record<string, unknown>; pad?: Record<string, unknown> };
  let b: Bindings = { keys: { ...DEFAULT_BINDINGS.keys }, pad: { ...DEFAULT_BINDINGS.pad } };
  for (const a of KEY_ACTIONS) {
    const code = r.keys?.[a];
    if (typeof code === 'string' && code.length > 0 && code.length < 32 && !RESERVED_KEYS.has(code)) {
      const got = bindKey(b, a, code);
      if ('bindings' in got) b = got.bindings;
    }
  }
  for (const a of PAD_ACTIONS) {
    const btn = r.pad?.[a];
    if (typeof btn === 'number' && BINDABLE_BUTTONS.includes(btn)) {
      const got = bindPad(b, a, btn);
      if ('bindings' in got) b = got.bindings;
    }
  }
  return b;
}

export const BINDINGS_KEY = 'liquid-dreams.bindings.v1';

function browserStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

let current: Bindings | null = null;

/** The bindings in force (loaded once from storage). */
export function currentBindings(storage: SettingsStorage | null = browserStorage()): Bindings {
  if (!current) {
    let raw: unknown = null;
    try {
      const s = storage?.getItem(BINDINGS_KEY);
      raw = s ? JSON.parse(s) : null;
    } catch {
      raw = null;
    }
    current = sanitizeBindings(raw);
  }
  return current;
}

/** New bindings, in force at once and saved. */
export function setBindings(b: Bindings, storage: SettingsStorage | null = browserStorage()): void {
  current = b;
  try {
    storage?.setItem(BINDINGS_KEY, JSON.stringify(b));
  } catch {
    // A full or blocked storage: the bindings last until the game closes.
  }
}

/** Tests: forget the loaded bindings. */
export function resetBindingsCache(): void {
  current = null;
}
