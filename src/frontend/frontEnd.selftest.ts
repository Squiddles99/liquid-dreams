// src/frontend/frontEnd.selftest.ts: the front end's DOM checks (spec §15), run with ?selftest=frontend.
import { registerSelfTest } from '../dev/selfTest';
import { initialFront } from './frontEnd';
import { DEFAULT_CHOICES, DEFAULT_FRONT_SETTINGS } from './frontSettings';
import { FIRST_PRESET, presetById } from './sessionSetup';
import { BreakMap } from './ui/breakMap';
import { ConditionsPanel } from './ui/conditionsPanel';
import { Legend, legendFor } from './ui/legend';
import { SlidePanel } from './ui/slidePanel';
import { applyLayout, layoutFor, mountFrontEndRoot } from './ui/layout';

/** A front-end root laid out for a window size, for the duration of one check. */
export async function withRoot<T>(w: number, h: number, f: (root: HTMLElement, l: ReturnType<typeof layoutFor>) => Promise<T> | T): Promise<T> {
  const root = mountFrontEndRoot(document.body), l = layoutFor(w, h, 0.03);
  applyLayout(root, l, DEFAULT_FRONT_SETTINGS);
  try {
    await document.fonts.ready;
    return await f(root, l);
  } finally {
    root.remove();
  }
}

/** A box in design px (relative to the root, unscaled). */
export function designBox(el: Element, root: HTMLElement, scale: number): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect(), o = root.getBoundingClientRect();
  return { x: (r.left - o.left) / scale, y: (r.top - o.top) / scale, w: r.width / scale, h: r.height / scale };
}

registerSelfTest({
  name: 'frontend: the fonts load and Barlow has tabular figures',
  async run() {
    return withRoot(1920, 1080, async (root) => {
      const faces = ['400 34px "Knewave"', '400 44px "Caveat Brush"', '600 34px "Barlow Semi Condensed"', '400 23px "Barlow"'];
      // font-display: block faces load on first use; ask for each so the check doesn't race the first paint.
      await Promise.all(faces.map((f) => document.fonts.load(f, '0123')));
      const probe = (text: string): number => {
        const s = document.createElement('span');
        s.className = 'fe-small';
        s.textContent = text;
        root.appendChild(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      const missing = faces.filter((f) => !document.fonts.check(f));
      const ones = probe('1111'), zeros = probe('0000');
      const pass = missing.length === 0 && Math.abs(ones - zeros) < 0.5;
      return { pass, detail: `missing: ${missing.join(', ') || 'none'}; 1111 ${ones.toFixed(1)} px vs 0000 ${zeros.toFixed(1)} px` };
    });
  },
});

registerSelfTest({
  name: 'frontend: the legend sits bottom-right inside the safe area and swaps glyphs at once',
  async run() {
    return withRoot(1920, 1080, (root, l) => {
      const legend = new Legend(() => {});
      root.appendChild(legend.el);
      const s = { ...initialFront(DEFAULT_CHOICES), beat: 'gear' as const };
      legend.set(legendFor(s), 'keyboard');
      const b = designBox(legend.el, root, l.scale);
      const keys = [...legend.el.querySelectorAll('[data-glyph]')].map((g) => (g as HTMLElement).dataset.glyph).join(',');
      legend.set(legendFor(s), 'xbox');
      const pads = [...legend.el.querySelectorAll('[data-glyph]')].map((g) => (g as HTMLElement).dataset.glyph).join(',');
      const inside = b.x + b.w <= l.designW - l.safeX + 0.5 && b.y + b.h <= l.designH - l.safeY + 0.5 && b.x + b.w > l.designW - l.safeX - 2;
      return { pass: inside && keys === 'Enter,Esc,P' && pads === 'A,B,START', detail: `box ${JSON.stringify(b)}; keys ${keys}; pad ${pads}` };
    });
  },
});

registerSelfTest({
  name: 'frontend: the Conditions rows are inside the safe area, 18 px or more, and one row is focused',
  async run() {
    return withRoot(1920, 1080, (root, l) => {
      const p = new ConditionsPanel(() => {});
      root.appendChild(p.el);
      p.render(initialFront(DEFAULT_CHOICES), new Date('2026-07-10T09:00:00+08:00'));
      const rows = [...p.el.querySelectorAll('.fe-row')];
      const outside = rows.filter((r) => { const b = designBox(r, root, l.scale); return b.x < l.safeX - 0.5 || b.y < l.safeY - 0.5 || b.y + b.h > l.designH - l.safeY + 0.5; });
      const tiny = [...p.el.querySelectorAll('.fe-label, .fe-value, .fe-small, .fe-title')].filter((t) => parseFloat(getComputedStyle(t).fontSize) < 18);
      const focused = p.el.querySelectorAll('.fe-row.is-focus').length;
      return { pass: rows.length === 8 && outside.length === 0 && tiny.length === 0 && focused === 1, detail: `${rows.length} rows, ${outside.length} outside, ${tiny.length} under 18 px, ${focused} focused` };
    });
  },
});

registerSelfTest({
  name: 'frontend: the map loads, sits top-right inside the safe area, and its text is 18 px or more',
  async run() {
    return withRoot(1920, 1080, async (root, l) => {
      const m = new BreakMap();
      root.appendChild(m.el);
      await m.load();
      m.setConditions(presetById(FIRST_PRESET)!.setup, true);
      const b = designBox(m.el, root, l.scale);
      const tiny = [...m.el.querySelectorAll('text')].filter((t) => parseFloat(t.getAttribute('font-size') ?? '0') < 18);
      const inside = Math.abs(b.x + b.w - (l.designW - l.safeX)) < 1 && Math.abs(b.y - l.safeY) < 1;
      const reef = (m.el.querySelector('path[stroke-dasharray]')?.getAttribute('d') ?? '').length;
      return { pass: inside && tiny.length === 0 && reef > 20, detail: `box ${JSON.stringify(b)}, ${tiny.length} small labels, 3 m contour ${reef} chars` };
    });
  },
});

registerSelfTest({
  name: 'frontend: the slide panel is 900 px from the right edge, its text inside the safe area and 18 px or more',
  async run() {
    return withRoot(1920, 1080, (root, l) => {
      const p = new SlidePanel(() => {});
      root.appendChild(p.el);
      p.render({ ...initialFront(DEFAULT_CHOICES), beat: 'rider' }, true);
      const b = designBox(p.el, root, l.scale);
      const texts = [...p.el.querySelectorAll('span, div')].filter((e) => e.childElementCount === 0 && e.textContent);
      const tiny = texts.filter((t) => parseFloat(getComputedStyle(t).fontSize) < 18);
      const outside = texts.filter((t) => { const r = designBox(t, root, l.scale); return r.x + r.w > l.designW - l.safeX + 0.5 || r.y + r.h > l.designH - l.safeY + 0.5; });
      return { pass: Math.abs(b.w - 900) < 1 && Math.abs(b.x + b.w - l.designW) < 1 && tiny.length === 0 && outside.length === 0, detail: `box ${JSON.stringify(b)}, ${tiny.length} small, ${outside.length} outside` };
    });
  },
});
