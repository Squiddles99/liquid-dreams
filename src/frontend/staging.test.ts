// src/frontend/staging.test.ts
import { describe, expect, it } from 'vitest';
import { crewFor } from './beatCamera';
import { DEFAULT_CHOICES } from './frontSettings';
import { type FrontState, initialFront } from './frontEnd';
import { stagingFor, stepTurn } from './staging';

const stand = { x: 300, z: 50, headingDeg: 90 };
const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), ...patch });
const NONE = { turnT: 1, pickT: 0 };
const angle = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

describe('staging the crew (dune select spec §4, §13)', () => {
  it('turns in two steps, not a spin, with a little dip each step', () => {
    expect(stepTurn(270, 90, 0)).toEqual({ headingDeg: 270, bobM: 0 });
    expect(angle(stepTurn(270, 90, 1).headingDeg, 90)).toBeLessThan(1e-9);
    expect(angle(stepTurn(270, 90, 0.5).headingDeg, 270)).toBeCloseTo(90, 6); // halfway round after the first step
    expect(stepTurn(270, 90, 0.25).bobM).toBeLessThan(0);
    expect(stepTurn(270, 90, 0.5).bobM).toBeCloseTo(0, 9);
  });
  it('shows all three facing the sea in walking clothes in Conditions, in their select stances', () => {
    const g = stagingFor(front(), stand, NONE);
    for (const n of ['female', 'male', 'grommet'] as const) {
      expect(g[n].visible).toBe(true);
      expect(g[n].headingDeg).toBe(270);
      expect(g[n].pose).toBe('selectStand');
      expect(g[n].outfit).toBe('walking');
    }
    expect(g.male.x).toBe(crewFor('conditions', stand).find((p) => p.preset === 'male')!.x);
  });
  it('faces them inland, spread, the focused rider grinning and the others easy, in Choose your rider', () => {
    const g = stagingFor(front({ beat: 'rider', rider: 'male' }), stand, NONE);
    expect(g.male.expression).toBe('grin');
    expect(g.female.expression).toBe('easy');
    expect(g.grommet.headingDeg).toBe(90);
  });
  it('steps the picked rider forward half a pace, stoked and waving, on the pick', () => {
    const s = front({ beat: 'gear', rider: 'female', move: { from: 'rider', to: 'gear', t: 0.1, durS: 1.6 } });
    const g = stagingFor(s, stand, { turnT: 1, pickT: 0.5 });
    expect(g.female.expression).toBe('stoked');
    expect(g.female.reach).toBeGreaterThan(0.5);
    const place = crewFor('rider', stand).find((p) => p.preset === 'female')!;
    expect(Math.hypot(g.female.x - place.x, g.female.z - place.z)).toBeGreaterThan(0.15);
  });
  it('shows only the chosen rider in Grab your gear, holding the focused board, in the focused outfit on the Outfit tab', () => {
    let g = stagingFor(front({ beat: 'gear', rider: 'female', gearTab: 'board', gearFocus: 1 }), stand, NONE);
    expect(g.female.visible).toBe(true);
    expect(g.male.visible).toBe(false);
    expect(g.grommet.visible).toBe(false);
    expect(g.female.board).toBe('stepUp');
    expect(g.female.outfit).toBe('walking');
    g = stagingFor(front({ beat: 'gear', rider: 'female', gearTab: 'outfit', gearFocus: 2 }), stand, NONE);
    expect(g.female.outfit).toBe('shortArmSteamer');
  });
});
