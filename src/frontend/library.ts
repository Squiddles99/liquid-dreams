// src/frontend/library.ts: the Library's data (library spec §1, §3): the loading slides' fact cards in six categories, A–Z.
import cardsJson from '../../art/loading/cards.json';
import type { SlideCard } from '../app/loadingSlides';

/** The grid's columns, at every resolution and text size (spec §4). */
export const LIBRARY_COLS = 3;

export interface LibraryEntry { key: string; card: SlideCard }
export interface LibraryCategory { id: string; label: string; entries: readonly LibraryEntry[] }

/** Mockup B's order (Andrew, ruling L4). */
const CATS = [
  { id: 'flora', label: 'COASTAL PLANTS', prefix: 'flora-' },
  { id: 'sea-flora', label: 'SEAWEED & SEAGRASS', prefix: 'sea-flora-' },
  { id: 'sea-fauna', label: 'SEA LIFE', prefix: 'sea-fauna-' },
  { id: 'birds', label: 'BIRDS', prefix: 'birds-' },
  { id: 'reptiles', label: 'REPTILES', prefix: 'reptiles-' },
  { id: 'marsupials', label: 'MARSUPIALS', prefix: 'marsupials-' },
] as const;

/** The cards by category (longest prefix wins), A–Z by name; keys starting "_" are notes. Throws on a card in no category. */
export function buildLibrary(cards: Record<string, SlideCard>): LibraryCategory[] {
  const byPrefix = [...CATS].sort((a, b) => b.prefix.length - a.prefix.length);
  const out = CATS.map((c) => ({ id: c.id, label: c.label, entries: [] as LibraryEntry[] }));
  for (const [key, card] of Object.entries(cards)) {
    if (key.startsWith('_')) continue;
    const c = byPrefix.find((p) => key.startsWith(p.prefix));
    if (!c) throw new Error(`library: card '${key}' matches no category`);
    out[CATS.indexOf(c)].entries.push({ key, card });
  }
  for (const c of out) c.entries.sort((a, b) => a.card.name.localeCompare(b.card.name, 'en'));
  return out;
}

export const LIBRARY: readonly LibraryCategory[] = buildLibrary(cardsJson as Record<string, SlideCard>);

/** Under the name: "Common · " (only when there is one) and the Latin name. */
export function subLine(card: SlideCard): { common: string; latin: string } {
  return { common: card.common ? `${card.common} · ` : '', latin: card.latin };
}
