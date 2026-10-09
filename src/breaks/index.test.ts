// src/breaks/index.test.ts
import { describe, expect, it } from 'vitest';
import { SURF_BREAKS, breakById } from './index';
import raw from './womb.json';

describe('the Womb file', () => {
  it('parses, sits at the spot Andrew chose, and has no unfilled placeholder', () => {
    expect(breakById('womb')?.lonLat).toEqual([114.982, -33.8952]);
    expect(JSON.stringify(raw)).not.toMatch(/<[^>]*>|…|TODO/);
  });
  it('keeps the panel lines short enough for the panel', () => {
    for (const p of (raw as { summary: { text: string }[] }).summary) expect(p.text.length).toBeLessThanOrEqual(44);
    expect((raw as { subtitle: string }).subtitle.length).toBeLessThanOrEqual(34);
  });
  it('lists only built breaks (one today)', () => { expect(SURF_BREAKS.map((b) => b.id)).toEqual(['womb']); });
});
