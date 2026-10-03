// src/frontend/frontEnd.selftest.ts: the front end's DOM checks (spec §15), run with ?selftest=frontend.
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_FRONT_SETTINGS } from './frontSettings';
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
