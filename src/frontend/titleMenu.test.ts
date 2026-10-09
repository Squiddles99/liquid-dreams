// src/frontend/titleMenu.test.ts
import { describe, expect, it } from 'vitest';
import { stepTitle, titleItems } from './titleMenu';

describe('title menu', () => {
  it('shows Quit only in the desktop build', () => {
    expect(titleItems(true)).toEqual(['surf', 'online', 'settings', 'quit']);
    expect(titleItems(false)).toEqual(['surf', 'online', 'settings']);
  });
  it('wraps focus up and down', () => {
    const items = titleItems(false);
    expect(stepTitle({ focus: 0 }, 'up', items).state.focus).toBe(2);
    expect(stepTitle({ focus: 2 }, 'down', items).state.focus).toBe(0);
  });
  it('Surf, Settings and Quit pick; Online toasts and stays', () => {
    const items = titleItems(true);
    expect(stepTitle({ focus: 0 }, 'confirm', items).pick).toBe('surf');
    expect(stepTitle({ focus: 1 }, 'confirm', items)).toMatchObject({ pick: null, toast: 'Online play is coming soon.' });
    expect(stepTitle({ focus: 2 }, 'confirm', items).pick).toBe('settings');
    expect(stepTitle({ focus: 3 }, 'confirm', items).pick).toBe('quit');
  });
  it('START picks Surf from anywhere; Back does nothing on the title', () => {
    expect(stepTitle({ focus: 2 }, 'start', titleItems(false)).pick).toBe('surf');
    expect(stepTitle({ focus: 1 }, 'back', titleItems(false))).toMatchObject({ pick: null, moved: false });
  });
});
