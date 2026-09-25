import { describe, expect, it } from 'vitest';
import { shouldIgnoreKeyTarget } from './Input';

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
