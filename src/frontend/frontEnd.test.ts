// src/frontend/frontEnd.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHOICES } from './frontSettings';
import { BEAT_MOVE_S, type FrontAction, type FrontState, choiceOf, conditionRows, focusTo, initialFront, savedOf, step, tick } from './frontEnd';
import { presetById } from './sessionSetup';
import { todaysSetup } from './conditionsSource';
import { LIBRARY } from './library';

const CTX = { seed: 99, today: new Date('2026-10-03T10:00:00+08:00'), calm: false };
const run = (s: FrontState, ...actions: FrontAction[]): FrontState => actions.reduce((acc, a) => step(acc, a, CTX).state, s);
const settle = (s: FrontState): FrontState => tick(s, 10, CTX).state;
/** The older beats' tests start on Conditions with the saved setup (the map's Surf here would swap in today's forecast). */
const fresh = (): FrontState => ({ ...initialFront(DEFAULT_CHOICES), beat: 'conditions' });
const onMap = (): FrontState => initialFront(DEFAULT_CHOICES);

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
    expect(step(s, 'back', CTX).state.beat).toBe('map');
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
    expect(s.outfits.female).toBe('onePiece');
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
    const s = run({ ...fresh(), source: 'custom' }, 'down', 'right'); // on Custom: the forecast's own tweaks are the session's
    expect(savedOf(s)).toEqual({ setup: s.setup, rider: 'female', boards: {}, outfits: {}, stances: {} });
  });
});

describe('the map beat (surf-map hub)', () => {
  it('opens on the map with the first break focused', () => {
    const s = onMap();
    expect(s.beat).toBe('map'); expect(s.breakId).toBe('womb'); expect(s.breakDetails).toBe(false);
  });
  it("Surf here on the forecast loads today's forecast and moves to Conditions", () => {
    const r = step(onMap(), 'confirm', CTX);
    expect(r.state.beat).toBe('conditions');
    expect(r.state.setup).toEqual(todaysSetup(CTX.today));
    expect(r.events).toContainEqual({ kind: 'surfHere', breakId: 'womb' });
  });
  it("Surf here on custom keeps the player's setup", () => {
    const s = { ...onMap(), source: 'custom' as const, customSetup: { ...onMap().setup, swellFt: 9 } };
    expect(step(s, 'confirm', CTX).state.setup.swellFt).toBe(9);
  });
  it('Back on the map asks for the title; Back on Conditions returns to the map', () => {
    expect(step(onMap(), 'back', CTX).events).toEqual([{ kind: 'title' }]);
    const onCond = settle(step(onMap(), 'confirm', CTX).state);
    const r = step(onCond, 'back', CTX);
    expect(r.state.beat).toBe('map'); expect(r.events).toContainEqual({ kind: 'back' });
  });
  it('Tab flips forecast and custom', () => {
    const s = step(onMap(), 'toggle', CTX);
    expect(s.state.source).toBe('custom'); expect(s.events).toEqual([{ kind: 'source', source: 'custom' }]);
  });
  it('Details opens the break page; up/down scroll it; Back closes it, not the map', () => {
    let s = step(onMap(), 'details', CTX).state;
    expect(s.breakDetails).toBe(true);
    s = step(s, 'down', CTX).state; s = step(s, 'down', CTX).state; s = step(s, 'up', CTX).state;
    expect(s.detailsScroll).toBe(1);
    const r = step(s, 'back', CTX);
    expect(r.state.breakDetails).toBe(false); expect(r.state.beat).toBe('map'); expect(r.events).toEqual([{ kind: 'breakDetails', open: false }]);
  });
  it('never scrolls above the top', () => {
    expect(step(step(onMap(), 'details', CTX).state, 'up', CTX).state.detailsScroll).toBe(0);
  });
  it('pointer focus on a pin selects that break', () => {
    expect(focusTo(onMap(), { pin: 'womb' }).state.breakId).toBe('womb');
  });
});

describe('review fixes (surf-map hub final review)', () => {
  it("keeps the player's custom setup when they Surf here on the forecast, and saves it, not the forecast", () => {
    const saved = onMap().setup;
    let s = settle(step(onMap(), 'confirm', CTX).state); // forecast → Conditions
    expect(s.setup).toEqual(todaysSetup(CTX.today));
    s = settle(step(s, 'back', CTX).state);              // back to the map
    s = step(s, 'toggle', CTX).state;                    // Custom
    expect(s.customSetup).toEqual(saved);
    expect(savedOf(s).setup).toEqual(saved);
    expect(step(s, 'confirm', CTX).state.setup).toEqual(saved);
  });
  it('remembers Conditions edits made on Custom as the custom setup', () => {
    let s = step(onMap(), 'toggle', CTX).state;
    s = settle(step(s, 'confirm', CTX).state);
    s = run(s, 'down', 'right');                         // the month row, one month on
    expect(s.customSetup).toEqual(s.setup);
    expect(s.customSetup.month).not.toBe(onMap().setup.month);
  });
  it('never scrolls the details page past its end', () => {
    let s = { ...step(onMap(), 'details', CTX).state, detailsMax: 2 };
    for (let k = 0; k < 9; k++) s = step(s, 'down', CTX).state;
    expect(s.detailsScroll).toBe(2);
    expect(step(s, 'up', CTX).state.detailsScroll).toBe(1);
  });
});

describe('the Library tab (library spec §2)', () => {
  const lib = (): FrontState => run(onMap(), 'tabPlus');
  it('LB and RB both flip the hub between the map and the Library, and the camera never moves', () => {
    const r = step(onMap(), 'tabPlus', CTX);
    expect(r.state.hubTab).toBe('library'); expect(r.state.beat).toBe('map'); expect(r.state.move).toBeNull();
    expect(r.events).toEqual([{ kind: 'hubTab', tab: 'library' }]);
    expect(run(onMap(), 'tabMinus').hubTab).toBe('library');
    expect(run(onMap(), 'tabPlus', 'tabMinus').hubTab).toBe('map');
  });
  it('opens on the grid, first category, first tile', () => {
    expect(lib().library).toEqual({ zone: 'grid', cat: 0, entry: 0, open: false });
    expect(onMap().hubTab).toBe('map');
  });
  it('moves over the grid in three columns, clamped, and Left from the first column goes to the categories', () => {
    let s = run(lib(), 'right', 'right');
    expect(s.library.entry).toBe(2);
    expect(run(s, 'right').library.entry).toBe(2);           // the end of the row: clamped
    s = run(s, 'down');
    expect(s.library.entry).toBe(5);
    expect(run(s, 'up', 'up').library.entry).toBe(2);         // the top row: clamped
    s = run(lib(), 'left');
    expect(s.library.zone).toBe('cats');
  });
  it('Down from the last full row lands on the last tile; Down on the last row stays', () => {
    // Reptiles: 8 entries, rows 0-2 / 3-5 / 6-7.
    let s = run(lib(), 'left', 'down', 'down', 'down', 'down', 'right');
    expect(LIBRARY[s.library.cat].label).toBe('REPTILES');
    s = run(s, 'right', 'right', 'down');                    // entry 2 -> 5
    expect(s.library.entry).toBe(5);
    s = run(s, 'down');                                      // 5 + 3 = 8 is past the end: the last tile
    expect(s.library.entry).toBe(7);
    expect(run(s, 'down').library.entry).toBe(7);
  });
  it('up/down on the categories change the category, clamped, and reset the tile', () => {
    let s = run(lib(), 'right', 'right', 'left', 'left', 'left', 'down');   // entry 2 -> 1 -> 0 -> the categories, then down
    expect(s.library).toMatchObject({ zone: 'cats', cat: 1, entry: 0 });
    expect(run(s, 'up', 'up').library.cat).toBe(0);
    s = run(s, 'down', 'down', 'down', 'down', 'down', 'down');
    expect(s.library.cat).toBe(5);
    expect(run(s, 'confirm').library.zone).toBe('grid');
  });
  it('A opens the picture, left/right page through the category (clamped), A or B closes it', () => {
    let s = step(lib(), 'confirm', CTX);
    expect(s.state.library.open).toBe(true); expect(s.events).toEqual([{ kind: 'libraryOpen', open: true }]);
    let t = run(s.state, 'left');
    expect(t.library.entry).toBe(0);
    t = run(t, 'right', 'right');
    expect(t.library.entry).toBe(2); expect(t.library.open).toBe(true);
    expect(run(t, 'back').library.open).toBe(false);
    expect(run(t, 'confirm').library.open).toBe(false);
    s = step(t, 'up', CTX);
    expect(s.state).toBe(t);
  });
  it('B (closed) asks for the title and leaves the hub on the map for next time', () => {
    const r = step(run(lib(), 'right'), 'back', CTX);
    expect(r.events).toEqual([{ kind: 'title' }]);
    expect(r.state.hubTab).toBe('map');
  });
  it('remembers its category and tile across LB/RB, and LB/RB while open closes the picture', () => {
    const s = run(lib(), 'left', 'down', 'right', 'right', 'confirm', 'tabPlus');
    expect(s.hubTab).toBe('map'); expect(s.library).toMatchObject({ cat: 1, entry: 1, open: false });
    expect(run(s, 'tabPlus').library).toMatchObject({ cat: 1, entry: 1 });
  });
  it('the map\'s own actions do nothing on the Library', () => {
    const s = run(lib(), 'right');
    for (const a of ['details', 'toggle', 'random'] as const) expect(step(s, a, CTX).state).toBe(s);
  });
  it('the mouse: a category or tile under the pointer takes the focus; pins, and tiles under the open picture, do not', () => {
    const s = lib();
    expect(focusTo(s, { libEntry: 4 }).state.library).toMatchObject({ zone: 'grid', entry: 4 });
    expect(focusTo(s, { libCat: 3 }).state.library).toMatchObject({ zone: 'cats', cat: 3, entry: 0 });
    expect(focusTo(s, { libEntry: 0 }).events).toEqual([]);                       // already there
    const open = run(s, 'confirm');
    expect(focusTo(open, { libEntry: 4 }).state).toBe(open);
    expect(focusTo(s, { pin: 'somewhere-else' }).state).toBe(s);                  // the chart under the Library
    expect(focusTo(onMap(), { libEntry: 4 }).state.library.entry).toBe(0);         // the Library isn't up
  });
});
