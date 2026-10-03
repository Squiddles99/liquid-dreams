import { describe, expect, it } from 'vitest';
import { Input, shouldIgnoreKeyTarget } from './Input';

describe('shouldIgnoreKeyTarget', () => {
  it('ignores typing in form fields (dev panel)', () => {
    expect(shouldIgnoreKeyTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreKeyTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreKeyTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreKeyTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });
  it('accepts keys on the canvas / body', () => {
    expect(shouldIgnoreKeyTarget({ tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false);
    expect(shouldIgnoreKeyTarget(null)).toBe(false);
  });
});

describe('Input while the front end is open (spec §10)', () => {
  it('drops keys and their presses while suspended, and takes them again after', () => {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const fakeTarget = { addEventListener: (t: string, f: (e: unknown) => void) => { (listeners[t] ??= []).push(f); }, removeEventListener: () => {} };
    Object.assign(globalThis, { window: fakeTarget, document: fakeTarget });
    const input = new Input(fakeTarget as unknown as HTMLElement);
    const key = (type: string, code: string) => listeners[type].forEach((f) => f({ code, target: null, preventDefault() {} }));
    input.suspended = true;
    key('keydown', 'KeyW');
    expect(input.isDown('KeyW')).toBe(false);
    expect(input.consumePressed('KeyW')).toBe(false);
    key('keyup', 'KeyW');
    input.suspended = false;
    key('keydown', 'KeyW');
    expect(input.isDown('KeyW')).toBe(true);
  });
});
