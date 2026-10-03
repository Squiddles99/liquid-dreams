// src/frontend/riderView.test.ts
import { describe, expect, it } from 'vitest';
import { type FrontState, initialFront } from './frontEnd';
import { DEFAULT_CHOICES } from './frontSettings';
import { riderView } from './riderView';

const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), beat: 'rider', ...patch });

describe('Choose your rider\'s panel (spec §4.2)', () => {
  it('has the roster tabs in order, the focused one marked', () => {
    const v = riderView(front({ rider: 'female' }));
    expect(v.tabs.map((t) => t.label)).toEqual(['T-BONE', 'SHAZZA', 'GROMMET']);
    expect(v.tabs.filter((t) => t.focused).map((t) => t.rider)).toEqual(['female']);
  });
  it('locks up the nickname with the real name, then Stance, Rides, Style, Loves', () => {
    const v = riderView(front({ rider: 'grommet' }));
    expect(v.nickname).toBe('Grommet');
    expect(v.realName).toBe('Bradley');
    expect(v.rows.map((r) => r.label)).toEqual(['Stance', 'Rides', 'Style', 'Loves']);
    expect(v.rows[1].value).toBe('Bodyboard');
  });
  it('shows the stance the player chose, Natural or Goofy (Andrew, Gate B)', () => {
    expect(riderView(front({ rider: 'female' })).rows[0].value).toBe('Natural');
    expect(riderView(front({ rider: 'female', stances: { female: 'goofy' } })).rows[0].value).toBe('Goofy');
  });
  it('closes with the rider\'s line and the crew note', () => {
    const v = riderView(front({ rider: 'male' }));
    expect(v.line).toBe('Let\'s get pitted.');
    expect(v.note).toMatch(/paddles out together/);
  });
});
