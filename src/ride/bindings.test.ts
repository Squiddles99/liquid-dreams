import { afterEach, describe, expect, it } from 'vitest';
import {
  BINDINGS_KEY, DEFAULT_BINDINGS, bindKey, bindPad, buttonLabel, currentBindings, keyLabel, resetBindingsCache, sanitizeBindings, setBindings,
} from './bindings';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('the player remaps the ride (Andrew 2026-10-04)', () => {
  afterEach(() => resetBindingsCache());

  it('binds a free key, and a taken one swaps with the action that had it', () => {
    const free = bindKey(DEFAULT_BINDINGS, 'popup', 'KeyJ');
    expect(free).toEqual({ bindings: { ...DEFAULT_BINDINGS, keys: { ...DEFAULT_BINDINGS.keys, popup: 'KeyJ' } }, swapped: null });
    const taken = bindKey(DEFAULT_BINDINGS, 'popup', 'KeyW');
    if (!('bindings' in taken)) throw new Error('refused');
    expect(taken.swapped).toBe('paddle');
    expect(taken.bindings.keys.popup).toBe('KeyW');
    expect(taken.bindings.keys.paddle).toBe('Space');
  });

  it("refuses the keys the game keeps: Esc, the arrows, its hotkeys", () => {
    for (const code of ['Escape', 'ArrowUp', 'KeyH', 'KeyP', 'KeyG', 'KeyC', 'F5']) expect(bindKey(DEFAULT_BINDINGS, 'popup', code)).toEqual({ refused: 'reserved' });
  });

  it('binds pad buttons the same way; START and the sticks stay put', () => {
    const r = bindPad(DEFAULT_BINDINGS, 'popup', 1);
    if (!('bindings' in r)) throw new Error('refused');
    expect(r.bindings.pad).toEqual({ ...DEFAULT_BINDINGS.pad, popup: 1, next: 0 });
    expect(r.swapped).toBe('next');
    expect(bindPad(DEFAULT_BINDINGS, 'popup', 9)).toEqual({ refused: 'reserved' });
    expect(bindPad(DEFAULT_BINDINGS, 'popup', 10)).toEqual({ refused: 'reserved' });
  });

  it('names keys and buttons for their caps and glyphs', () => {
    expect(['KeyW', 'Digit3', 'Space', 'ShiftLeft', 'Numpad4', 'Semicolon'].map(keyLabel)).toEqual(['W', '3', 'Space', 'Shift', 'Num 4', ';']);
    expect(buttonLabel(7)).toBe('RT');
    expect(buttonLabel(0, 'playstation')).toBe('Cross');
  });

  it('makes whatever was saved whole: junk, reserved keys and duplicates fall back', () => {
    expect(sanitizeBindings(null)).toEqual(DEFAULT_BINDINGS);
    expect(sanitizeBindings({ keys: { popup: 'Escape', paddle: 42 }, pad: { popup: 9 } })).toEqual(DEFAULT_BINDINGS);
    const dup = sanitizeBindings({ keys: { popup: 'KeyJ', next: 'KeyJ' } });
    expect(new Set(Object.values(dup.keys)).size).toBe(6);
    expect(dup.keys.next).toBe('KeyJ');
  });

  it('saves and loads', () => {
    const s = memory();
    const r = bindKey(DEFAULT_BINDINGS, 'next', 'KeyT');
    if (!('bindings' in r)) throw new Error('refused');
    setBindings(r.bindings, s);
    resetBindingsCache();
    expect(currentBindings(s).keys.next).toBe('KeyT');
    expect(JSON.parse(s.m.get(BINDINGS_KEY)!).keys.next).toBe('KeyT');
  });
});
