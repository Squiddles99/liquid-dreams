// The loading cover's pictures: index.html names the start-up one on #ld-cover's data-boot (the crew surfing, shown only
// while the game first loads) and lists the slides on data-slides (copies tools/loadingArt.py makes from
// art/loading/slides/). Each later cover (paddling out, back to the dune) picks a slide here, never the one just shown
// when there is another.

/** The names in a data-slides attribute. */
export function parseSlides(attr: string | undefined): string[] {
  return (attr ?? '').split(/\s+/).filter(Boolean);
}

/** One picture for random number r in [0, 1), skipping `avoid` unless it is the only one. */
export function pickSlide(list: readonly string[], r: number, avoid?: string | null): string | null {
  const pool = list.length > 1 && avoid ? list.filter((n) => n !== avoid) : list;
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
}

/** The 1080p and 4K copies of a picture. */
export function slideImage(name: string): { src: string; srcset: string } {
  const small = `/loading/${name}-1920.webp`;
  return { src: small, srcset: `${small} 1920w, /loading/${name}-full.webp 3840w` };
}

/** The Library's pictures (library spec §3): its 4:3 tile (tools/loadingArt.py), or the full picture as the cover uses. */
export function libraryImage(name: string, size: 'tile' | 'full'): { src: string; srcset: string } {
  return size === 'tile' ? { src: `/loading/${name}-tile.webp`, srcset: '' } : slideImage(name);
}

/** A picture's fact card (art/loading/cards.json, written into index.html's #ld-cards by tools/loadingArt.py). */
export interface SlideCard {
  /** The small heading, e.g. "Local flora · Cape to Cape". */
  kicker: string;
  /** The big name, e.g. "Balga". */
  name: string;
  /** Under it: another everyday name (may be empty, when the big name is the only one) and the Latin name. */
  common: string;
  latin: string;
  fact: string;
  /** A Noongar name or use, only from a checked source (Andrew 2026-10-08); absent when none is known. */
  noongar?: string;
}

/** The cards by picture name, from #ld-cards' JSON; empty when it is missing or broken (the cover then shows none). */
export function parseCards(json: string | null | undefined): Record<string, SlideCard> {
  try {
    const v = JSON.parse(json ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, SlideCard>) : {};
  } catch {
    return {};
  }
}

