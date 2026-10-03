// src/frontend/gearView.test.ts
import { describe, expect, it } from 'vitest';
import { type FrontState, initialFront } from './frontEnd';
import { DEFAULT_CHOICES } from './frontSettings';
import { gearView } from './gearView';
import { FIRST_PRESET, presetById } from './sessionSetup';

const today = new Date('2026-07-10T09:00:00+08:00');
const front = (patch: Partial<FrontState> = {}): FrontState => ({ ...initialFront(DEFAULT_CHOICES), beat: 'gear', ...patch });

describe('Grab your gear\'s panel (spec §4.3, §8, §9)', () => {
  it('lists the quiver with lengths, fit badges, and the rider\'s pick marked', () => {
    const v = gearView(front({ rider: 'female' }), today, 1);
    expect(v.tab).toBe('board');
    expect(v.rows.map((r) => r.name)).toEqual(['Thruster', 'Step-up', 'Bodyboard']);
    expect(v.rows.every((r) => r.badge !== null)).toBe(true);
    expect(v.rows.filter((r) => r.pick).map((r) => r.pick)).toEqual(["Shazza's pick"]);
    expect(v.rows[0].detail).toMatch(/^\d'\d+"$/);
    expect(v.bars).not.toBeNull();
    expect(gearView(front({ rider: 'female', showSpecs: true }), today, 1).specs).toMatch(/ × .* · .* tail · /);
  });
  it('gives Grommet only his bodyboard, his pick', () => {
    const v = gearView(front({ rider: 'grommet' }), today, 1);
    expect(v.rows.map((r) => r.name)).toEqual(['Bodyboard']);
    expect(v.rows[0].pick).toBe("Grommet's pick");
  });
  it('lists the outfits on the Outfit tab, the month\'s marked "for July", with the looks-only note and no bars', () => {
    const v = gearView(front({ rider: 'female', gearTab: 'outfit' }), today, 1);
    expect(v.rows.length).toBe(3);
    expect(v.rows.filter((r) => r.season).map((r) => r.season)).toEqual(['for July']);
    expect(v.note).toBe('Looks only, no effect on your surfing.');
    expect(v.bars).toBeNull();
  });
  it('toggles between the bars and the specs line', () => {
    expect(gearView(front({ rider: 'female', showSpecs: false }), today, 1)).toMatchObject({ specs: null });
    expect(gearView(front({ rider: 'female', showSpecs: true }), today, 1)).toMatchObject({ bars: null });
  });
  it('names the outfits in title case, like the boards', () => {
    const v = gearView(front({ rider: 'female', gearTab: 'outfit' }), today, 1);
    for (const r of v.rows) expect(r.name[0]).toBe(r.name[0].toUpperCase());
  });
  it('has a mate tease a bikini in the WA winter (spec §9)', () => {
    const v = gearView(front({ rider: 'female', gearTab: 'outfit', gearFocus: 0 }), today, 1);
    expect(v.rows[0].id).toBe('bikini');
    expect(v.line.speaker).toBe('T-Bone');
    expect(v.line.text).not.toContain('{');
    expect(v.line.text).toContain('Shaz');
  });
  it('says why the rider picked the board, in their voice', () => {
    const s = front({ rider: 'female', setup: presetById(FIRST_PRESET)!.setup });
    const v = gearView(s, today, 3);
    expect(v.line.speaker).toBe('Shazza');
    expect(v.line.text.length).toBeGreaterThan(5);
  });
});
