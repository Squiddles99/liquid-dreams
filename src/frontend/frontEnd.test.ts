// src/frontend/frontEnd.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHOICES } from './frontSettings';
import { BEAT_MOVE_S, type FrontAction, type FrontState, choiceOf, conditionRows, focusTo, initialFront, savedOf, step, tick } from './frontEnd';
import { presetById } from './sessionSetup';

const CTX = { seed: 99, today: new Date('2026-10-03T10:00:00+08:00'), calm: false };
const run = (s: FrontState, ...actions: FrontAction[]): FrontState => actions.reduce((acc, a) => step(acc, a, CTX).state, s);
const settle = (s: FrontState): FrontState => tick(s, 10, CTX).state;
const fresh = (): FrontState => initialFront(DEFAULT_CHOICES);

describe('the front end\'s state machine (dune select spec §3, §4)', () => {
  it('opens on Conditions, Winter offshore, Shazza in focus', () => {
    const s = fresh();
    expect(s.beat).toBe('conditions');
    expect(s.presetId).toBe('winterOffshore');
    expect(s.rider).toBe('female');
    expect(s.rowFocus).toBe('preset');
  });
  it('moves down the rows, wrapping, and changes a value at once with left and right', () => {
    let s = run(fresh(), 'up');
    expect(s.rowFocus).toBe('tide');
    s = run(fresh(), 'down', 'right');
    expect(s.rowFocus).toBe('month');
    expect(s.setup.month).toBe(7);
    expect(s.presetId).toBeNull();
  });
  it('steps through presets on the Preset row, setting every row', () => {
    const s = run(fresh(), 'right');
    expect(s.presetId).toBe('bigWinterSwell');
    expect(s.setup).toEqual(presetById('bigWinterSwell')!.setup);
  });
  it('emits a value event, or an end nudge at a stop', () => {
    const tide = run(fresh(), 'up');
    expect(step(tide, 'left', CTX).events).toContainEqual({ kind: 'value', row: 'tide', dir: -1 });
    const low = run(tide, 'left');
    expect(step(low, 'left', CTX).events).toContainEqual({ kind: 'end', row: 'tide' });
  });
  it('opens and closes the Period row under Swell with X', () => {
    let s = run(fresh(), 'details');
    expect(conditionRows(s)).toEqual(['preset', 'month', 'time', 'sky', 'wind', 'swell', 'period', 'from', 'tide']);
    s = run(s, 'up', 'up', 'up');
    expect(s.rowFocus).toBe('period');
    s = run(s, 'details');
    expect(s.rowFocus).toBe('swell');
  });
  it('rolls the dice by seed', () => {
    const r = step(fresh(), 'random', CTX);
    expect(r.events).toContainEqual({ kind: 'roll', seed: CTX.seed });
    expect(r.state.setup).not.toEqual(fresh().setup);
  });
  it('goes Conditions → rider → gear on A, with a camera move each time, and back on B', () => {
    let r = step(fresh(), 'confirm', CTX);
    expect(r.events).toContainEqual({ kind: 'move', from: 'conditions', to: 'rider' });
    expect(r.state.move?.durS).toBe(BEAT_MOVE_S);
    let s = settle(r.state);
    expect(s.beat).toBe('rider');
    r = step(s, 'confirm', CTX);
    expect(r.events).toContainEqual({ kind: 'pick', rider: 'female' });
    s = settle(r.state);
    expect(s.beat).toBe('gear');
    s = settle(run(s, 'back'));
    expect(s.beat).toBe('rider');
    s = settle(run(s, 'back'));
    expect(s.beat).toBe('conditions');
    expect(step(s, 'back', CTX).events).toEqual([]);
  });
  it('moves the rider focus with LB/RB or left/right, wrapping through T-Bone, Shazza, Grommet', () => {
    let s = settle(run(fresh(), 'confirm'));
    s = run(s, 'right');
    expect(s.rider).toBe('grommet');
    s = run(s, 'tabPlus');
    expect(s.rider).toBe('male');
    expect(step(s, 'left', CTX).events).toContainEqual({ kind: 'riderFocus', rider: 'grommet' });
  });
  it('remembers each beat\'s focus', () => {
    let s = run(fresh(), 'down', 'down');
    s = settle(run(s, 'confirm'));
    s = run(s, 'right');
    s = settle(run(s, 'back'));
    expect(s.rowFocus).toBe('time');
    s = settle(run(s, 'confirm'));
    expect(s.rider).toBe('grommet');
  });
  it('lists the rider\'s boards in Grab your gear, takes a swap on A, and tabs to Outfit', () => {
    let s = settle(run(settle(run(fresh(), 'confirm')), 'confirm'));
    expect(s.gearTab).toBe('board');
    s = run(s, 'down', 'confirm');
    expect(s.boards.female).toBe('stepUp');
    s = run(s, 'tabPlus');
    expect(s.gearTab).toBe('outfit');
    s = run(s, 'down', 'confirm');
    expect(s.outfits.female).toBe('rashieAndBottoms');
    s = run(s, 'toggle');
    expect(s.showSpecs).toBe(true);
  });
  it("switches Grab your gear's tab straight from a pointer (a click on Board or Outfit), the focus on that tab's choice (Andrew, Gate B)", () => {
    let s = settle(run(settle(run(fresh(), 'confirm')), 'confirm'));
    s = run(s, 'tabPlus', 'down', 'confirm', 'tabMinus');
    expect(s.gearTab).toBe('board');
    const r = focusTo(s, { tab: 'outfit' });
    expect(r.state.gearTab).toBe('outfit');
    expect(r.state.gearFocus).toBe(1);
    expect(r.events).toContainEqual({ kind: 'gear', tab: 'outfit', focus: 1 });
    expect(focusTo(r.state, { tab: 'outfit' }).events).toEqual([]);
  });
  it("tabs Board, Outfit, Stance and round; A on Stance takes Natural or Goofy, carried into the session (Andrew, Gate B)", () => {
    let s = settle(run(settle(run(fresh(), 'confirm')), 'confirm'));
    expect([s.gearTab, run(s, 'tabPlus').gearTab, run(s, 'tabPlus', 'tabPlus').gearTab, run(s, 'tabPlus', 'tabPlus', 'tabPlus').gearTab]).toEqual(['board', 'outfit', 'stance', 'board']);
    expect(run(s, 'tabMinus').gearTab).toBe('stance');
    s = run(s, 'tabMinus');
    expect(s.gearFocus).toBe(0);
    s = run(s, 'down', 'confirm');
    expect(s.stances.female).toBe('goofy');
    expect(choiceOf(s).stance).toBe('goofy');
    expect(savedOf(s).stances).toEqual({ female: 'goofy' });
    expect(choiceOf(fresh()).stance).toBe('regular');
    expect(choiceOf({ ...fresh(), rider: 'male' }).stance).toBe('goofy');
  });
  it('paddles out from any beat on START with every remaining choice at its default', () => {
    for (const path of [[], ['confirm'], ['confirm', 'confirm']] as FrontAction[][]) {
      let s = fresh();
      for (const a of path) s = settle(run(s, a));
      const r = step(s, 'start', CTX);
      const out = r.events.find((e) => e.kind === 'paddleOut');
      expect(out, path.join(',')).toBeDefined();
      expect(choiceOf(r.state)).toEqual({ setup: presetById('winterOffshore')!.setup, rider: 'female', board: 'thruster', outfit: 'season', stance: 'regular' });
      expect(r.state.beat).toBe('out');
    }
  });
  it('skips a camera move to its end on A or B, and buffers other input until it lands', () => {
    let s = step(fresh(), 'confirm', CTX).state;
    s = step(s, 'right', CTX).state;
    expect(s.rider).toBe('female');
    const r = step(s, 'confirm', CTX);
    expect(r.state.move).toBeNull();
    expect(r.state.beat).toBe('rider');
    expect(r.state.rider).toBe('grommet');
  });
  it('makes calm moves short', () => {
    const r = step(fresh(), 'confirm', { ...CTX, calm: true });
    expect(r.state.move?.durS).toBe(0.2);
  });
  it('forwards the settings chord', () => {
    expect(step(fresh(), 'settings', CTX).events).toEqual([{ kind: 'settings' }]);
  });
  it('saves what it should remember', () => {
    const s = run(fresh(), 'down', 'right');
    expect(savedOf(s)).toEqual({ setup: s.setup, rider: 'female', boards: {}, outfits: {}, stances: {} });
  });
});
