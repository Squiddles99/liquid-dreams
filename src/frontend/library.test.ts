// src/frontend/library.test.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { libraryImage } from '../app/loadingSlides';
import { LIBRARY, LIBRARY_COLS, buildLibrary, subLine } from './library';

describe('the Library\'s data (library spec §1, §3)', () => {
  it('has the six categories in order, with their counts, 66 in all', () => {
    expect(LIBRARY.map((c) => [c.label, c.entries.length])).toEqual([
      ['COASTAL PLANTS', 12], ['SEAWEED & SEAGRASS', 10], ['SEA LIFE', 15], ['BIRDS', 14], ['REPTILES', 8], ['MARSUPIALS', 7],
    ]);
    expect(LIBRARY.flatMap((c) => c.entries).length).toBe(66);
    expect(LIBRARY_COLS).toBe(3);
  });
  it('puts sea-flora- in Seaweed & seagrass, never in Coastal plants', () => {
    expect(LIBRARY[0].entries.some((e) => e.key.startsWith('sea-'))).toBe(false);
    expect(LIBRARY[1].entries.every((e) => e.key.startsWith('sea-flora-'))).toBe(true);
  });
  it('sorts each category A–Z by name', () => {
    for (const c of LIBRARY) {
      const names = c.entries.map((e) => e.card.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    }
    expect(LIBRARY[0].entries[0].card.name).toBe('Balga');
  });
  it('throws on a card that matches no category, and skips "_" notes', () => {
    const card = { kicker: 'k', name: 'n', common: '', latin: 'l', fact: 'f' };
    expect(() => buildLibrary({ 'frogs-motorbike': card })).toThrow(/frogs-motorbike/);
    expect(buildLibrary({ _: card as never, 'birds-x': card }).flatMap((c) => c.entries).map((e) => e.key)).toEqual(['birds-x']);
  });
  it('writes the common name with its dot only when there is one', () => {
    const base = { kicker: 'k', name: 'n', latin: 'Tiliqua rugosa', fact: 'f' };
    expect(subLine({ ...base, common: 'Shingleback' })).toEqual({ common: 'Shingleback · ', latin: 'Tiliqua rugosa' });
    expect(subLine({ ...base, common: '' })).toEqual({ common: '', latin: 'Tiliqua rugosa' });
  });
  it('has a tile and both full-size pictures on disk for every entry', () => {
    const missing = LIBRARY.flatMap((c) => c.entries).flatMap((e) => [`${e.key}-tile.webp`, `${e.key}-1920.webp`, `${e.key}-full.webp`])
      .filter((f) => !existsSync(join('public', 'loading', f)));
    expect(missing).toEqual([]);
  });
  it('names the tile and the full picture', () => {
    expect(libraryImage('flora-balga', 'tile')).toEqual({ src: '/loading/flora-balga-tile.webp', srcset: '' });
    expect(libraryImage('flora-balga', 'full').srcset).toContain('/loading/flora-balga-full.webp 3840w');
  });
});
