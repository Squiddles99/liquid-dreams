import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../ride/bindings';
import { heard, openControls, remapRows, stepControls } from './controlsMenu';

const B = DEFAULT_BINDINGS;

describe('the Controls page: view, remap, listen (Andrew 2026-10-04)', () => {
  it('views a tab, switches tabs, remaps on A and closes on B', () => {
    const s = openControls('keys');
    expect(stepControls(s, 'tabPlus', B).state.tab).toBe('pad');
    expect(stepControls(s, 'right', B).state.tab).toBe('pad');
    expect(stepControls(s, 'confirm', B).state.mode).toBe('remap');
    expect(stepControls(s, 'back', B).closed).toBe(true);
  });

  it('lists the tab’s actions and Reset; A listens, B goes back to the drawing', () => {
    expect(remapRows('keys')).toEqual(['paddle', 'left', 'right', 'crouch', 'popup', 'next', 'reset']);
    expect(remapRows('pad')).toEqual(['paddle', 'crouch', 'popup', 'next', 'reset']);
    const r = { ...openControls('keys'), mode: 'remap' as const };
    expect(stepControls(r, 'up', B).state.focus).toBe(6);
    expect(stepControls(r, 'confirm', B).state.mode).toBe('listen');
    expect(stepControls(r, 'back', B).state.mode).toBe('view');
    expect(stepControls(r, 'left', B).state).toEqual(r);
  });

  it('binds the key heard, says what it swapped, and refuses the game’s own keys', () => {
    const l = { ...openControls('keys'), mode: 'listen' as const, focus: 4 }; // Pop up
    const got = heard(l, { key: 'KeyJ' }, B);
    expect(got.bindings.keys.popup).toBe('KeyJ');
    expect(got.state.mode).toBe('remap');
    const swap = heard(l, { key: 'KeyR' }, B);
    expect(swap.bindings.keys).toMatchObject({ popup: 'KeyR', next: 'Space' });
    expect(swap.state.note).toBe('Next wave moved to Space');
    const no = heard(l, { key: 'KeyH' }, B);
    expect(no.bindings).toBe(B);
    expect(no.state.mode).toBe('listen');
    expect(no.state.note).toMatch(/kept by the game/);
    expect(heard(l, 'cancel', B).state.mode).toBe('remap');
    expect(stepControls(l, 'back', B).state.mode).toBe('remap');
  });

  it('binds pad buttons on the controller tab, and ignores keys there', () => {
    const l = { ...openControls('pad'), mode: 'listen' as const, focus: 2 }; // Pop up
    expect(heard(l, { button: 3 }, B).bindings.pad.popup).toBe(3);
    expect(heard(l, { button: 1 }, B, 'playstation').state.note).toBe('Next wave moved to Cross');
    expect(heard(l, { button: 9 }, B).state.note).toMatch(/kept by the game/);
    expect(heard(l, { key: 'KeyJ' }, B).bindings).toBe(B);
  });

  it('Reset to defaults puts the tab back', () => {
    const changed = { ...B, keys: { ...B.keys, popup: 'KeyJ' }, pad: { ...B.pad, popup: 3 } };
    const r = { ...openControls('keys'), mode: 'remap' as const, focus: 6 };
    const out = stepControls(r, 'confirm', changed);
    expect(out.bindings.keys).toEqual(B.keys);
    expect(out.bindings.pad.popup).toBe(3);
  });
});
