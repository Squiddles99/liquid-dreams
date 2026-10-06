// The loading cover's pictures: index.html lists them on #ld-cover's data-slides (names of the copies
// tools/loadingArt.py makes from art/loading/slides/). Its inline script picks the start-up one; each later cover picks
// again here, never the one just shown when there is another.

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
