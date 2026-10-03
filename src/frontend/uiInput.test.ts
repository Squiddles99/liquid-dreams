// src/frontend/uiInput.test.ts
import { describe, expect, it } from 'vitest';
import { KEY_ACTIONS, type PadSnapshot, Repeater, UiInput, deviceFamily, padHeld } from './uiInput';

const pad = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0], id = 'Xbox Wireless Controller (STANDARD GAMEPAD)'): PadSnapshot =>
  ({ id, buttons: Array.from({ length: 17 }, (_, i) => pressed.includes(i)), axes });

describe('input (dune select spec §10; Review Focus 2)', () => {
  it('maps the keyboard', () => {
    expect(KEY_ACTIONS.ArrowUp).toBe('up'); expect(KEY_ACTIONS.KeyW).toBe('up');
    expect(KEY_ACTIONS.Enter).toBe('confirm'); expect(KEY_ACTIONS.Space).toBe('confirm');
    expect(KEY_ACTIONS.Escape).toBe('back'); expect(KEY_ACTIONS.Backspace).toBe('back');
    expect(KEY_ACTIONS.KeyR).toBe('random'); expect(KEY_ACTIONS.KeyF).toBe('details');
    expect(KEY_ACTIONS.KeyQ).toBe('tabMinus'); expect(KEY_ACTIONS.KeyE).toBe('tabPlus');
    expect(KEY_ACTIONS.Tab).toBe('toggle'); expect(KEY_ACTIONS.KeyP).toBe('start');
  });
  it('tells PlayStation pads from the rest by their id', () => {
    expect(deviceFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(deviceFamily('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('playstation');
    expect(deviceFamily('Sony Interactive Entertainment DUALSHOCK 4')).toBe('playstation');
    expect(deviceFamily('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(deviceFamily('8BitDo Pro 2')).toBe('xbox');
  });
  it('reads the standard pad mapping, the stick past 0.5', () => {
    expect([...padHeld(pad([0]))]).toEqual(['confirm']);
    expect([...padHeld(pad([1, 2, 3]))].sort()).toEqual(['back', 'details', 'random']);
    expect([...padHeld(pad([4, 5, 6, 7, 9, 11]))].sort()).toEqual(['fineMinus', 'finePlus', 'start', 'tabMinus', 'tabPlus', 'toggle']);
    expect([...padHeld(pad([12, 13, 14, 15]))].sort()).toEqual(['down', 'left', 'right', 'up']);
    expect([...padHeld(pad([], [0.49, 0, 0, 0]))]).toEqual([]);
    expect([...padHeld(pad([], [0.51, 0, 0, 0]))]).toEqual(['right']);
    expect([...padHeld(pad([], [0, -0.8, 0, 0]))]).toEqual(['up']);
  });
  it('presses on the edge, repeats directions after 250 ms then every 80 ms, never repeats a confirm', () => {
    const r = new Repeater();
    const right = new Set(['right'] as const), confirm = new Set(['confirm'] as const), none = new Set<never>();
    expect(r.update(right, 0)).toEqual(['right']);
    expect(r.update(right, 249)).toEqual([]);
    expect(r.update(right, 250)).toEqual(['right']);
    expect(r.update(right, 329)).toEqual([]);
    expect(r.update(right, 330)).toEqual(['right']);
    expect(r.update(none, 400)).toEqual([]);
    expect(r.update(confirm, 500)).toEqual(['confirm']);
    expect(r.update(confirm, 2000)).toEqual([]);
  });
  it('stops repeating when the device goes away mid-hold (a pad unplugged)', () => {
    const r = new Repeater();
    r.update(new Set(['down'] as const), 0);
    expect(r.update(new Set(), 300)).toEqual([]);
    expect(r.update(new Set(), 1000)).toEqual([]);
  });
  it('turns Back + START into Settings, not Paddle out', () => {
    const r = new Repeater();
    expect(r.update(new Set(['back'] as const), 0)).toEqual(['back']);
    expect(r.update(new Set(['back', 'start'] as const), 50)).toEqual(['settings']);
    const r2 = new Repeater();
    expect(r2.update(new Set(['back', 'start'] as const), 0)).toEqual(['settings']);
  });
  it('keeps a key tapped down and up between two polls (a quick press, or a scripted one)', () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const win = { addEventListener: (t: string, f: (e: unknown) => void) => { (listeners[t] ??= []).push(f); }, removeEventListener: () => {} };
    const input = new UiInput(win as unknown as Window);
    const fire = (type: string, code: string) => listeners[type].forEach((f) => f({ code, target: null, preventDefault() {} }));
    fire('keydown', 'ArrowDown');
    fire('keyup', 'ArrowDown');
    expect(input.poll(0)).toEqual({ actions: ['down'], device: 'keyboard' });
    expect(input.poll(16).actions).toEqual([]);
    fire('keydown', 'ArrowDown');
    expect(input.poll(32).actions).toEqual(['down']);
    expect(input.poll(48).actions).toEqual([]);
    expect(input.poll(300).actions).toEqual(['down']);
  });
});
