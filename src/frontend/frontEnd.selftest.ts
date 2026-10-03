// src/frontend/frontEnd.selftest.ts: the front end's DOM checks (spec §15), run with ?selftest=frontend.
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { type FrontState, initialFront, step } from './frontEnd';
import { DEFAULT_CHOICES, DEFAULT_FRONT_SETTINGS } from './frontSettings';
import type { FrontEndHost } from './frontEndCore';
import { FrontEnd } from './frontEndPage';
import { gearView } from './gearView';
import { FIRST_PRESET, presetById } from './sessionSetup';
import { BreakMap } from './ui/breakMap';
import { ConditionsPanel } from './ui/conditionsPanel';
import { GearPanel } from './ui/gearPanel';
import { Legend, legendFor } from './ui/legend';
import { SlidePanel } from './ui/slidePanel';
import { UI_SOUND_MS, type UiSound, UiSounds } from './uiSounds';
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
  name: 'frontend: each Conditions row\'s arrows stay put as its value changes (a mouse can keep clicking one spot)',
  async run() {
    return withRoot(1920, 1080, async (root, l) => {
      // The faces load on first use: measure with them, not the fallback.
      await Promise.all(['500 21px "Barlow Semi Condensed"', '600 34px "Barlow Semi Condensed"', '400 23px "Barlow Semi Condensed"'].map((f) => document.fonts.load(f, 'Aa0')));
      const p = new ConditionsPanel(() => {}), today = new Date('2026-07-10T09:00:00+08:00'), ctx = { seed: 1, today, calm: true };
      root.appendChild(p.el);
      const moved: string[] = [], clipped = new Set<string>();
      for (const row of ['preset', 'month', 'time', 'sky', 'wind', 'swell', 'from', 'tide'] as const) {
        let s: FrontState = { ...initialFront(DEFAULT_CHOICES), rowFocus: row };
        const xs: number[] = [];
        for (const a of [...Array(14).fill('left'), ...Array(28).fill('right')] as ('left' | 'right')[]) {
          s = step(s, a, ctx).state;
          p.render(s, today);
          xs.push(designBox(p.el.querySelector('.fe-row.is-focus [data-hit$=":right"]')!, root, l.scale).x);
          const v = p.el.querySelector('.fe-row.is-focus .fe-value')!;
          if (v.scrollWidth > v.clientWidth + 0.5) clipped.add(`${row} "${v.querySelector('.fe-small')?.textContent}" by ${v.scrollWidth - v.clientWidth} px`);
        }
        const spread = Math.max(...xs) - Math.min(...xs);
        if (spread > 0.5) moved.push(`${row} ${spread.toFixed(1)} px`);
      }
      const said = moved.length ? `the right arrow moves: ${moved.join(', ')}` : 'every row\'s right arrow holds its place';
      return { pass: moved.length === 0 && clipped.size === 0, detail: `${said}; ${clipped.size ? `clipped: ${[...clipped].join(', ')}` : 'nothing clipped'}` };
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

registerSelfTest({
  name: 'frontend: the gear panel\'s rows and bars are inside the safe area and 18 px or more',
  async run() {
    return withRoot(1920, 1080, (root, l) => {
      const p = new GearPanel(() => {});
      root.appendChild(p.el);
      let tiny = 0, outside = 0;
      const rows: number[] = [];
      // Each tab: Shazza's two surfboards, her three surf outfits, the two stances.
      for (const gearTab of ['board', 'outfit', 'stance'] as const) {
        p.render(gearView({ ...initialFront(DEFAULT_CHOICES), beat: 'gear', gearTab }, new Date('2026-07-10T09:00:00+08:00'), 1), 'xbox', true);
        const texts = [...p.el.querySelectorAll('span, div')].filter((e) => e.childElementCount === 0 && e.textContent);
        tiny += texts.filter((t) => parseFloat(getComputedStyle(t).fontSize) < 18).length;
        outside += texts.filter((t) => { const r = designBox(t, root, l.scale); return r.x + r.w > l.designW - l.safeX + 0.5 || r.y + r.h > l.designH - l.safeY + 0.5; }).length;
        rows.push(p.el.querySelectorAll('[data-index]').length);
      }
      return { pass: tiny === 0 && outside === 0 && rows.join() === '2,3,2', detail: `${tiny} small, ${outside} outside, rows ${rows.join('/')}` };
    });
  },
});

registerSelfTest({
  name: 'frontend: a choice shows as locked in: the chosen board, outfit or stance carries a tick, focused or not (Andrew, Gate B)',
  async run() {
    return withRoot(1920, 1080, (root) => {
      const p = new GearPanel(() => {}), today = new Date('2026-07-10T09:00:00+08:00');
      root.appendChild(p.el);
      const bad: string[] = [];
      const base = { ...initialFront(DEFAULT_CHOICES), beat: 'gear' as const };
      const cases = [
        { tab: 'board' as const, s: { ...base, gearTab: 'board' as const, gearFocus: 0, boards: { female: 'stepUp' as const } }, want: 1 },
        { tab: 'outfit' as const, s: { ...base, gearTab: 'outfit' as const, gearFocus: 0, outfits: { female: 'shortArmSteamer' as const } }, want: 2 },
        { tab: 'stance' as const, s: { ...base, gearTab: 'stance' as const, gearFocus: 0, stances: { female: 'goofy' as const } }, want: 1 },
      ];
      for (const c of cases) {
        p.render(gearView(c.s, today, 1), 'keyboard', true);
        const rows = [...p.el.querySelectorAll('[data-index]')];
        const ticked = rows.map((r, i) => (r.classList.contains('is-chosen') && r.querySelector('.fe-tick svg') ? i : -1)).filter((i) => i >= 0);
        if (ticked.join() !== String(c.want)) bad.push(`${c.tab}: ticked ${ticked.join() || 'none'}, want ${c.want}`);
        const tick = rows[c.want]?.querySelector('.fe-tick');
        if (tick && getComputedStyle(tick).visibility === 'hidden') bad.push(`${c.tab}: tick hidden`);
      }
      return { pass: bad.length === 0, detail: bad.join('; ') || 'board, outfit and stance each tick their choice' };
    });
  },
});

registerSelfTest({
  name: 'frontend: the UI sounds render, their lengths match, the focus tick sits about 12 dB under the confirm',
  async run() {
    const rms = async (s: UiSound): Promise<{ rms: number; lenMs: number }> => {
      const ctx = new OfflineAudioContext(1, 48000 * 2, 48000);
      new UiSounds(ctx, ctx.destination, () => 0.5).play(s, { durS: 1.6 });
      const d = (await ctx.startRendering()).getChannelData(0);
      let sum = 0, last = 0;
      for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; if (Math.abs(d[i]) > 1e-4) last = i; }
      return { rms: Math.sqrt(sum / Math.max(1, last)), lenMs: (last / 48000) * 1000 };
    };
    const out: string[] = [];
    let pass = true;
    for (const s of ['focus', 'value', 'end', 'confirm', 'back', 'swing'] as const) {
      const r = await rms(s);
      const ok = r.rms > 1e-3 && r.lenMs <= UI_SOUND_MS[s] * 1.15 + 15;
      pass &&= ok;
      out.push(`${s} ${r.lenMs.toFixed(0)} ms rms ${r.rms.toFixed(4)}${ok ? '' : ' ✗'}`);
    }
    const f = await rms('focus'), c = await rms('confirm'), db = 20 * Math.log10(f.rms / c.rms);
    pass &&= db < -8 && db > -18;
    return { pass, detail: `${out.join('; ')}; focus vs confirm ${db.toFixed(1)} dB` };
  },
});

const SIZES: [number, number][] = [[1920, 1080], [1280, 800], [2560, 1080], [1024, 768]];
const fakeHost = (): FrontEndHost => ({
  standSpot: () => ({ x: 305, z: 49.8, headingDeg: 90 }), groundAt: () => 20, baseConditions: () => DEFAULT_CONDITIONS,
  applyConditions: () => {}, stage: () => {}, paddleOut: () => {},
});
const memory = (): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
};
const noSound = { uiOut: () => null, setFrontEndMusic: () => {} };
const press = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code })); window.dispatchEvent(new KeyboardEvent('keyup', { code })); };
const frames = async (fe: FrontEnd, n: number): Promise<void> => { for (let i = 0; i < n; i++) { fe.update(1 / 60); await new Promise((r) => setTimeout(r, 0)); } };

/**
 * Whether an element is in the shown beat: its beat wrapper's (or the rider's line's) target opacity, not the computed
 * one (a hidden browser pane never finishes the fade, so a leaving beat would still compute as visible).
 */
const shown = (e: Element): boolean => {
  const wrap = e.closest('.fe-root > [style*="opacity"]') as HTMLElement | null;
  return !wrap || wrap.style.opacity !== '0';
};

/** Every visible text box in the root: its design box and font size. */
function texts(root: HTMLElement, scale: number) {
  return [...root.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && e.textContent?.trim() && getComputedStyle(e).visibility !== 'hidden' && shown(e))
    .map((e) => ({ e, b: designBox(e, root, scale), px: parseFloat(getComputedStyle(e).fontSize) }));
}
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

for (const [w, h] of SIZES) for (const text of [1, 2]) {
  registerSelfTest({
    name: `frontend: every beat at ${w}×${h}, text ${text * 100}%: inside the safe area, nothing under 18 px, nothing overlapping`,
    async run() {
      const store = memory();
      store.setItem('liquid-dreams.front-settings.v1', JSON.stringify({ textScale: text }));
      const host = document.createElement('div');
      Object.assign(host.style, { position: 'fixed', left: '0', top: '0', width: `${w}px`, height: `${h}px`, overflow: 'hidden' });
      document.body.appendChild(host);
      const fe = new FrontEnd(fakeHost(), host, noSound, store);
      const problems: string[] = [];
      try {
        fe.open();
        fe.resize(w, h);
        await document.fonts.ready;
        for (const beat of ['conditions', 'rider', 'gear']) {
          await frames(fe, 120);
          // The settled layout: a hidden browser pane never advances the fades and slide-ins, so finish them.
          for (const a of document.getAnimations()) a.finish();
          const root = host.querySelector('.fe-root') as HTMLElement, scale = Math.min(w / 1920, h / 1080), l = { designW: w / scale, designH: h / scale, safe: 0.03 };
          const t = texts(root, scale);
          for (const { e, b, px } of t) {
            if (px < 18) problems.push(`${beat}: "${e.textContent!.slice(0, 20)}" ${px.toFixed(0)} px`);
            if (b.x < l.designW * l.safe - 0.5 || b.y < l.designH * l.safe - 0.5 || b.x + b.w > l.designW * (1 - l.safe) + 0.5 || b.y + b.h > l.designH * (1 - l.safe) + 0.5) problems.push(`${beat}: "${e.textContent!.slice(0, 20)}" outside`);
          }
          const blocks = ['.fe-legend', '.fe-title', '.fe-tabs'].flatMap((q) => [...root.querySelectorAll(q)]).filter(shown).map((e) => designBox(e, root, scale));
          for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) if (overlaps(blocks[i], blocks[j])) problems.push(`${beat}: blocks ${i} and ${j} overlap`);
          press('Enter');
        }
      } finally {
        fe.close();
        host.remove();
      }
      return { pass: problems.length === 0, detail: problems.slice(0, 6).join('; ') || 'clean' };
    },
  });
}

registerSelfTest({
  name: 'frontend: every focusable is reached by arrows alone, and B leaves every beat',
  async run() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    const seen = new Set<string>(), problems: string[] = [];
    try {
      fe.open();
      await frames(fe, 30);
      // The shown beat's focused row (Conditions, gear), else its focused tab (the roster).
      const focusedEl = (): HTMLElement | null => ([...host.querySelectorAll('.fe-row.is-focus'), ...host.querySelectorAll('.fe-tab.is-focus')].find(shown) as HTMLElement | undefined) ?? null;
      const focused = (): string => { const f = focusedEl(); return f?.dataset.rider ?? f?.dataset.index ?? f?.dataset.hit ?? f?.textContent ?? '?'; };
      for (let k = 0; k < 12; k++) { seen.add(`c:${focused()}`); press('ArrowDown'); await frames(fe, 3); }
      if ([...seen].filter((s) => s.startsWith('c:')).length < 8) problems.push(`conditions reached ${[...seen].join(',')}`);
      press('Enter');
      await frames(fe, 120);
      for (let k = 0; k < 4; k++) { seen.add(`r:${focused()}`); press('ArrowRight'); await frames(fe, 40); }
      if ([...seen].filter((s) => s.startsWith('r:')).length < 3) problems.push('not every rider reached');
      press('Enter');
      await frames(fe, 160);
      for (let k = 0; k < 4; k++) { seen.add(`g:${focused()}`); press('ArrowDown'); await frames(fe, 3); }
      press('KeyE');
      await frames(fe, 10);
      for (let k = 0; k < 4; k++) { seen.add(`o:${focused()}`); press('ArrowDown'); await frames(fe, 3); }
      for (const beat of ['gear', 'rider']) { press('Escape'); await frames(fe, 120); if (!host.querySelector('.fe-root')) problems.push(`B from ${beat} closed the front end`); }
    } finally {
      fe.close();
      host.remove();
    }
    return { pass: problems.length === 0, detail: problems.join('; ') || `reached ${seen.size} focus states` };
  },
});

registerSelfTest({
  name: 'frontend: a pad press swaps every legend glyph to the pad set',
  async run() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    const real = navigator.getGamepads.bind(navigator);
    let pad: Gamepad | null = null;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    try {
      fe.open();
      press('ArrowDown');
      await frames(fe, 5);
      const keys = [...host.querySelectorAll('.fe-legend [data-glyph]')].map((g) => (g as HTMLElement).dataset.glyph).join(',');
      const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 13, touched: false, value: i === 13 ? 1 : 0 }));
      pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
      await frames(fe, 5);
      const pads = [...host.querySelectorAll('.fe-legend [data-glyph]')].map((g) => (g as HTMLElement).dataset.glyph).join(',');
      return { pass: keys === 'R,F,Enter,Esc' && pads === 'Y,X,A,B', detail: `keys ${keys} → pad ${pads}` };
    } finally {
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: real });
      fe.close();
      host.remove();
    }
  },
});

registerSelfTest({
  name: 'frontend: a veil covers the front end until the crew have loaded, then lifts (no floating boards)',
  async run() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let ready = false;
    const fe = new FrontEnd({ ...fakeHost(), crewReady: () => ready }, host, noSound, memory());
    try {
      fe.open();
      await frames(fe, 10);
      const veil = (): HTMLElement | null => host.querySelector('.fe-veil');
      const before = veil()?.style.opacity ?? 'none';
      ready = true;
      await frames(fe, 10);
      for (const a of document.getAnimations()) a.finish();
      const after = veil()?.style.opacity ?? 'gone';
      return { pass: before === '1' && (after === '0' || after === 'gone'), detail: `veil before ${before}, after ${after}` };
    } finally {
      fe.close();
      host.remove();
    }
  },
});
