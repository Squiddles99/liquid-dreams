// src/app/loading.selftest.ts: the loading cover's DOM behaviour (loading screens spec §1–§4), run with ?selftest=loading.
import { registerSelfTest } from '../dev/selfTest';
import { STAGES } from './loadingProgress';
import { LoadingScreen } from './loadingScreen';

/** A copy of index.html's cover in its own document, and a fake clock driving it. */
function fixture(): { el: HTMLElement; t: { now: number }; screen: LoadingScreen } {
  const doc = document.implementation.createHTMLDocument('cover');
  const live = document.getElementById('ld-cover');
  const el = live ? (doc.importNode(live, true) as HTMLElement) : doc.createElement('div');
  if (!live) {
    el.id = 'ld-cover';
    el.innerHTML = '<div class="ld-cover-bg"></div><div class="ld-logo"></div><div class="ld-progress"><div class="ld-bar"><div class="ld-bar-fill"></div></div><div class="ld-line"></div></div>';
  }
  el.hidden = false;
  el.className = 'ld-cover is-in';
  el.dataset.mode = 'boot';
  doc.body.appendChild(el);
  const t = { now: 0 };
  return { el, t, screen: LoadingScreen.adopt(doc, () => t.now)! };
}

const smooth = (s: LoadingScreen, t: { now: number }, n: number): void => {
  for (let i = 0; i < n; i++) {
    t.now += 16;
    s.frameDrawn(16);
  }
};

registerSelfTest({
  name: 'loading: the boot cover shows each stage line, and dissolves only after every stage and 10 smooth frames',
  async run() {
    const { el, t, screen } = fixture();
    const lines: string[] = [];
    let dissolved = 0;
    screen.onBootDissolve(() => dissolved++);
    const line = (): string => el.querySelector('.ld-line')!.textContent ?? '';
    for (const s of STAGES) {
      lines.push(line());
      t.now += 100;
      screen.stageDone(s.id);
      smooth(screen, t, 12);
      if (s.id !== 'crew' && dissolved) return { pass: false, detail: `dissolved after ${s.id}` };
    }
    const bad: string[] = [];
    if (lines.join('|') !== STAGES.map((s) => s.line).join('|')) bad.push(`lines ${lines.join('|')}`);
    if (dissolved !== 1) bad.push(`dissolve callbacks ${dissolved}`);
    if (!el.classList.contains('is-out')) bad.push('no is-out');
    if (document.documentElement.dataset.ldLoading !== 'dissolving') bad.push(`state ${document.documentElement.dataset.ldLoading}`);
    screen.remove();
    return { pass: bad.length === 0, detail: bad.join('; ') || 'five lines in order, one dissolve after the crew' };
  },
});

registerSelfTest({
  name: 'loading: the bar fills as stages end and never goes back',
  async run() {
    const { el, t, screen } = fixture();
    const fill = (): number => parseFloat((el.querySelector('.ld-bar-fill') as HTMLElement).style.width || '0');
    const seen: number[] = [];
    for (const s of STAGES) {
      for (let i = 0; i < 20; i++) {
        t.now += 16;
        screen.tick(16);
        seen.push(fill());
      }
      screen.stageDone(s.id);
    }
    for (let i = 0; i < 30; i++) {
      t.now += 16;
      screen.tick(16);
      seen.push(fill());
    }
    screen.remove();
    const back = seen.findIndex((v, i) => i > 0 && v < seen[i - 1] - 1e-6);
    return { pass: back < 0 && seen[seen.length - 1] > 99, detail: `end ${seen[seen.length - 1].toFixed(1)}%, first step back at ${back}` };
  },
});

registerSelfTest({
  name: 'loading: a transition cover refuses a second cover, holds 1.5 s, and blocks input until halfway out',
  async run() {
    const { el, t, screen } = fixture();
    for (const s of STAGES) screen.stageDone(s.id);
    smooth(screen, t, 12);
    t.now += 1300;
    screen.tick(16);
    const bad: string[] = [];
    let dissolved = 0;
    const first = screen.cover({ line: 'Paddling out…', minHoldMs: 1500, calm: false, onDissolve: () => dissolved++ });
    const second = await screen.cover({ line: 'Walking back up the dune…', minHoldMs: 1500, calm: false });
    if (second !== false) bad.push('a second cover was accepted');
    t.now += 400;
    screen.tick(16);
    if ((await first) !== true) bad.push('the first cover did not come in');
    if (el.dataset.mode !== 'cover') bad.push(`mode ${el.dataset.mode}`);
    if (!screen.blocking) bad.push('not blocking while in');
    screen.release();
    smooth(screen, t, 12);
    if (dissolved) bad.push('dissolved before the 1.5 s hold');
    t.now += 1500;
    screen.frameDrawn(16);
    if (dissolved !== 1) bad.push(`dissolves ${dissolved}`);
    if (!screen.blocking) bad.push('stopped blocking as soon as the dissolve began');
    t.now += 650;
    screen.tick(16);
    if (screen.blocking) bad.push('still blocking past halfway');
    screen.remove();
    return { pass: bad.length === 0, detail: bad.join('; ') || 'refused, held, released halfway' };
  },
});

registerSelfTest({
  name: 'loading: remove() takes the cover away at once (errors, selftests)',
  async run() {
    const { el, screen } = fixture();
    screen.remove();
    return { pass: el.hidden && !screen.blocking, detail: `hidden ${el.hidden}, blocking ${screen.blocking}` };
  },
});

registerSelfTest({
  name: 'loading: a transition asked for while the last cover is still dissolving takes it back over (never refused into nothing)',
  async run() {
    const { el, t, screen } = fixture();
    for (const s of STAGES) screen.stageDone(s.id);
    smooth(screen, t, 12);
    t.now += 700;
    screen.tick(16);
    const bad: string[] = [];
    if (screen.blocking) bad.push('still blocking past halfway out');
    const again = screen.cover({ line: 'Paddling out…', minHoldMs: 1500, calm: false });
    t.now += 400;
    screen.tick(16);
    if ((await again) !== true) bad.push('refused while dissolving');
    if (el.classList.contains('is-out') || el.hidden) bad.push(`class ${el.className}, hidden ${el.hidden}`);
    if (el.dataset.mode !== 'cover') bad.push(`mode ${el.dataset.mode}`);
    screen.remove();
    return { pass: bad.length === 0, detail: bad.join('; ') || 'taken back over mid-dissolve' };
  },
});

registerSelfTest({
  name: 'loading: a transition cover fades in (no pop) and sits above every piece of game UI (perf graphs, dev panel, ride hints)',
  async run() {
    const el = document.getElementById('ld-cover');
    if (!el) return { pass: false, detail: 'no #ld-cover in the page' };
    const screen = LoadingScreen.adopt(document)!;
    screen.remove();
    const bad: string[] = [];
    const z = Number(getComputedStyle(el).zIndex);
    if (!(z > 10000)) bad.push(`z-index ${getComputedStyle(el).zIndex} (the perf overlay is 10000)`);
    const coming = screen.cover({ line: 'Paddling out…', minHoldMs: 0, calm: false });
    await new Promise((r) => setTimeout(r, 150));
    const mid = parseFloat(getComputedStyle(el).opacity);
    if (!(mid > 0.05 && mid < 0.95)) bad.push(`opacity ${mid.toFixed(2)} 150 ms in (should be part-way through 400 ms)`);
    await coming;
    screen.remove();
    return { pass: bad.length === 0, detail: bad.join('; ') || `z ${z}, opacity ${mid.toFixed(2)} at 150 ms` };
  },
});
