// src/frontend/ui/libraryPanel.ts: the Library (library spec §4, mockup B Codex): over the dimmed chart, the categories on
// the left, the tile grid (LIBRARY_COLS columns, scrolled to keep the focus in sight), the focused entry on the right;
// A opens the painting full screen with its card. Facts only from the cards (art/loading/cards.json).
import { libraryImage, type SlideCard } from '../../app/loadingSlides';
import type { FrontAction, FrontState } from '../frontEnd';
import { LIBRARY, LIBRARY_COLS, subLine } from '../library';

export type LibPointer = { kind: 'cat'; index: number } | { kind: 'entry'; index: number } | { kind: 'action'; action: FrontAction };
const STEP_PX = 120;
/** library.css's edge fades (.fe-lib-grid.is-scrolled 56 px, .is-more 72 px): a focused row stays clear of them. */
const FADE_TOP_PX = 56, FADE_BOTTOM_PX = 72;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e;
};
const img = (cls: string, pic: { src: string; srcset: string }, sizes: string): HTMLImageElement => {
  const i = h('img', cls); i.src = pic.src; if (pic.srcset) { i.srcset = pic.srcset; i.sizes = sizes; } i.alt = ''; i.draggable = false; return i;
};

/** A card's lines, as the loading cover writes them (kicker, name, common · Latin, fact, Noongar). */
function cardEls(card: SlideCard): HTMLElement[] {
  const sub = h('div', 'fe-lib-sub'), { common, latin } = subLine(card);
  sub.append(h('span', 'fe-lib-common', common), h('i', 'fe-lib-latin', latin));
  const els: HTMLElement[] = [h('div', 'fe-lib-kicker', card.kicker), h('div', 'fe-lib-name', card.name), sub, h('p', 'fe-lib-fact', card.fact)];
  if (card.noongar) {
    const n = h('p', 'fe-lib-fact fe-lib-noongar'), b = h('b', '', 'Noongar ');
    n.append(b, card.noongar);
    els.push(n);
  }
  return els;
}

export class LibraryPanel {
  readonly el = h('div', 'fe-lib');
  private readonly cats = h('div', 'fe-lib-cats');
  private readonly grid = h('div', 'fe-lib-grid');
  private readonly inner = h('div', 'fe-lib-grid-inner');
  private readonly entry = h('div', 'fe-lib-entry');
  private readonly open = h('div', 'fe-lib-open');
  private gridCat = -1;
  private entryKey = '';
  private openKey = '';
  private scrollY = 0;
  private wheel = 0;

  constructor(private readonly onPointer: (p: LibPointer) => void) {
    LIBRARY.forEach((c, i) => {
      const r = h('div', 'fe-lib-cat');
      r.dataset.hit = `cat:${i}`;
      r.append(h('span', '', c.label), h('span', 'fe-lib-cat-n', String(c.entries.length)));
      r.addEventListener('mouseenter', () => onPointer({ kind: 'cat', index: i }));
      r.addEventListener('click', () => onPointer({ kind: 'cat', index: i }));
      this.cats.appendChild(r);
    });
    this.grid.appendChild(this.inner);
    // A trackpad sends many small wheel events: whole rows only (as the details page).
    this.grid.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheel += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      while (Math.abs(this.wheel) >= STEP_PX) { onPointer({ kind: 'action', action: this.wheel > 0 ? 'down' : 'up' }); this.wheel -= Math.sign(this.wheel) * STEP_PX; }
    }, { passive: false });
    this.open.addEventListener('click', () => onPointer({ kind: 'action', action: 'back' }));
    this.el.append(this.cats, this.grid, this.entry, h('div', 'fe-lib-credit', 'Coastline © OpenStreetMap contributors'), this.open);
  }

  render(s: FrontState): void {
    const on = s.beat === 'map' && s.hubTab === 'library' && !s.breakDetails, L = s.library;
    this.el.classList.toggle('is-on', on);
    this.el.classList.toggle('is-open', on && L.open);
    if (!on) return;
    this.el.classList.toggle('is-big-text', parseFloat(getComputedStyle(this.el).getPropertyValue('--fe-text')) >= 1.5);
    [...this.cats.children].forEach((r, i) => { r.classList.toggle('is-on', i === L.cat); r.classList.toggle('is-focus', L.zone === 'cats' && i === L.cat); });
    const cat = LIBRARY[L.cat], e = cat.entries[L.entry];
    if (this.gridCat !== L.cat) {
      this.gridCat = L.cat; this.scrollY = 0;
      this.inner.replaceChildren(...cat.entries.map((x, i) => {
        const t = h('div', 'fe-lib-tile');
        t.dataset.hit = `tile:${i}`;
        t.append(img('', libraryImage(x.key, 'tile'), '248px'), h('div', 'fe-lib-tile-name', x.card.name));
        // Only a real move takes the focus: the grid sliding under a resting cursor fires hover events with no movement,
        // and they would yank the focus from the keyboard or the wheel.
        t.addEventListener('pointermove', (ev) => { if (ev.movementX || ev.movementY) this.onPointer({ kind: 'entry', index: i }); });
        t.addEventListener('click', () => { this.onPointer({ kind: 'entry', index: i }); this.onPointer({ kind: 'action', action: 'confirm' }); });
        return t;
      }));
    }
    [...this.inner.children].forEach((t, i) => { t.classList.toggle('is-sel', i === L.entry); t.classList.toggle('is-focus', L.zone === 'grid' && i === L.entry); });
    this.scrollTo(L.entry);
    if (this.entryKey !== e.key) {
      this.entryKey = e.key;
      this.entry.replaceChildren(img('fe-lib-entry-img', libraryImage(e.key, 'full'), '604px'), ...cardEls(e.card));
    }
    const openKey = L.open ? `${e.key}` : '';
    if (openKey && openKey !== this.openKey) {
      const card = h('div', 'fe-lib-card');
      card.append(...cardEls(e.card), h('div', 'fe-lib-count', `${L.entry + 1} / ${cat.entries.length}`));
      this.open.replaceChildren(img('fe-lib-open-img', libraryImage(e.key, 'full'), '100vw'), h('div', 'fe-lib-shade'), card);
    }
    this.openKey = openKey;
  }

  /** Keeps the focused tile's row in sight (the least move), hides the names of tiles the viewport clips, fades the edges. */
  private scrollTo(index: number): void {
    const tile = this.inner.children[index] as HTMLElement | undefined;
    if (!tile) return;
    // The grid's padding is the focus scale's room; inner rows sit clear of the edge fades (library.css is-scrolled / is-more).
    const pad = parseFloat(getComputedStyle(this.grid).paddingTop) || 0, n = this.inner.children.length;
    const row = Math.floor(index / LIBRARY_COLS), lastRow = Math.floor((n - 1) / LIBRARY_COLS);
    const above = row === 0 ? pad : FADE_TOP_PX, below = row === lastRow ? pad : FADE_BOTTOM_PX;
    const view = this.grid.clientHeight, max = Math.max(0, this.topIn(this.inner) + this.inner.offsetHeight + pad - view);
    const top = this.topIn(tile), bottom = top + tile.offsetHeight;
    if (row === 0) this.scrollY = 0;                     // the ends snap: row heights round, and a 1 px miss leaves a fade on
    else if (row === lastRow) this.scrollY = max;
    else if (top - above < this.scrollY) this.scrollY = top - above;
    else if (bottom + below > this.scrollY + view) this.scrollY = bottom + below - view;
    this.scrollY = Math.min(max, Math.max(0, this.scrollY));
    this.inner.style.transform = `translateY(${-this.scrollY}px)`;
    for (const t of this.inner.children as HTMLCollectionOf<HTMLElement>) {
      const name = t.lastElementChild as HTMLElement, nTop = this.topIn(name) - this.scrollY, nBottom = nTop + name.offsetHeight;
      t.classList.toggle('is-clipped', nTop < 0 || nBottom > view);
    }
    this.grid.classList.toggle('is-scrolled', this.scrollY > 1);
    this.grid.classList.toggle('is-more', this.scrollY < max - 1);
  }

  /** An element's top inside the grid, unscrolled (offsetTop is from the nearest positioned ancestor, not the parent). */
  private topIn(el: HTMLElement): number {
    let y = 0;
    for (let e: HTMLElement | null = el; e && e !== this.grid; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
    return y;
  }
}
