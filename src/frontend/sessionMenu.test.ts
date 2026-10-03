// src/frontend/sessionMenu.test.ts
import { describe, expect, it } from 'vitest';
import { MENU_ITEMS, PadStartWatch, stepMenu } from './sessionMenu';

describe('the menu while surfing: Keep surfing or Back to the dune (Andrew, Gate B)', () => {
  it('offers Keep surfing first, then Back to the dune', () => {
    expect(MENU_ITEMS.map((m) => m.label)).toEqual(['Keep surfing', 'Back to the dune']);
  });
  it('moves the focus up and down (round), A takes the focused item', () => {
    let s = { focus: 0 };
    s = stepMenu(s, 'down').state;
    expect(s.focus).toBe(1);
    expect(stepMenu(s, 'down').state.focus).toBe(0);
    expect(stepMenu(s, 'up').state.focus).toBe(0);
    expect(stepMenu(s, 'confirm').pick).toBe('dune');
    expect(stepMenu({ focus: 0 }, 'confirm').pick).toBe('resume');
  });
  it('closes on B or START (keep surfing), and ignores the rest', () => {
    expect(stepMenu({ focus: 1 }, 'back').pick).toBe('resume');
    expect(stepMenu({ focus: 1 }, 'start').pick).toBe('resume');
    expect(stepMenu({ focus: 1 }, 'random')).toEqual({ state: { focus: 1 }, pick: null, moved: false });
  });
  it('says when the focus moved (the focus tick)', () => {
    expect(stepMenu({ focus: 0 }, 'down').moved).toBe(true);
    expect(stepMenu({ focus: 0 }, 'confirm').moved).toBe(false);
  });
});

describe('a pad\'s START opens the menu on the press, not while it is held', () => {
  const pad = (start: boolean, index = 0) => ({ index, buttons: Array.from({ length: 16 }, (_, i) => i === 9 && start) });
  it('fires once per press', () => {
    const w = new PadStartWatch();
    expect(w.poll([pad(false)])).toBe(false);
    expect(w.poll([pad(true)])).toBe(true);
    expect(w.poll([pad(true)])).toBe(false);
    expect(w.poll([pad(false)])).toBe(false);
    expect(w.poll([pad(true)])).toBe(true);
  });
  it('a START already held when first seen is not a press (the paddle-out press, still down)', () => {
    const w = new PadStartWatch();
    expect(w.poll([pad(true)])).toBe(false);
    expect(w.poll([pad(false), null])).toBe(false);
    expect(w.poll([pad(true)])).toBe(true);
  });
  it('watches each pad on its own', () => {
    const w = new PadStartWatch();
    w.poll([pad(false, 0), pad(false, 1)]);
    expect(w.poll([pad(false, 0), pad(true, 1)])).toBe(true);
  });
});
