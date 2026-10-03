// src/frontend/glyphs.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHOICES } from './frontSettings';
import { type FrontState, initialFront } from './frontEnd';
import { glyphFor } from './glyphs';
import { legendFor } from './ui/legend';

const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), ...patch });
const ACTIONS = ['random', 'details', 'confirm', 'back', 'start', 'tabMinus', 'tabPlus', 'toggle', 'fineMinus', 'finePlus'] as const;

describe('glyphs (spec §5.5, §10)', () => {
  it('has our own SVG for every device and action, with no text baked into an image', () => {
    for (const d of ['xbox', 'playstation', 'keyboard'] as const) for (const a of ACTIONS) {
      const g = glyphFor(d, a);
      expect(g.svg.startsWith('<svg'), `${d} ${a}`).toBe(true);
      expect(g.svg).not.toMatch(/<image|href=/);
      expect(g.label.length).toBeGreaterThan(0);
    }
  });
  it('confirms with A on Xbox, Cross on PlayStation, Enter on the keyboard', () => {
    expect(glyphFor('xbox', 'confirm').label).toBe('A');
    expect(glyphFor('playstation', 'confirm').label).toBe('Cross');
    expect(glyphFor('keyboard', 'confirm').label).toBe('Enter');
    expect(glyphFor('keyboard', 'back').label).toBe('Esc');
    expect(glyphFor('keyboard', 'random').label).toBe('R');
    expect(glyphFor('keyboard', 'start').label).toBe('P');
    expect(glyphFor('playstation', 'random').label).toBe('Triangle');
  });
  it('colours the Xbox face buttons (A green, B red, X blue, Y yellow) and keeps the PlayStation shapes', () => {
    expect(glyphFor('xbox', 'confirm').svg).toContain('#3fae49');
    expect(glyphFor('xbox', 'back').svg).toContain('#d8433b');
    expect(glyphFor('xbox', 'details').svg).toContain('#3a7fd5');
    expect(glyphFor('xbox', 'random').svg).toContain('#e8b52a');
    expect(glyphFor('playstation', 'confirm').svg).toContain('data-shape="cross"');
  });
});

describe('the legend (spec §4, §5.5): Y, X, A, B, START, absent actions left out', () => {
  it('Conditions: Roll the dice, Swell details, Done, Back', () => {
    expect(legendFor(front()).map((e) => [e.action, e.text])).toEqual([['random', 'Roll the dice'], ['details', 'Swell details'], ['confirm', 'Done'], ['back', 'Back']]);
  });
  it('Choose your rider: the confirm carries the name', () => {
    expect(legendFor(front({ beat: 'rider', rider: 'male' })).map((e) => e.text)).toEqual(['Ride as T-Bone', 'Back']);
  });
  it('Grab your gear: Choose, Back, and Paddle out in sun orange', () => {
    const l = legendFor(front({ beat: 'gear' }));
    expect(l.map((e) => e.text)).toEqual(['Choose', 'Back', 'Paddle out']);
    expect(l[2]).toMatchObject({ action: 'start', accent: true });
  });
});
