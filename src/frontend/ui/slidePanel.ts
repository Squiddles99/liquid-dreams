// src/frontend/ui/slidePanel.ts
import { PRESETS, type PresetName } from '../../surfer/presets';
import type { FrontAction, FrontState } from '../frontEnd';
import { glyphFor } from '../glyphs';
import { riderView } from '../riderView';
import type { Device } from '../uiInput';

type Intent = { kind: 'rider'; rider: PresetName } | { kind: 'action'; action: FrontAction };

/**
 * A block in the panel's column, `gap` px under the one before: at 100% text the column lands on the mockup's spots
 * (roster 92, lockup 190, descriptors 430, line 735, note 820), and at larger text it flows instead of overlapping.
 */
const place = (el: HTMLElement, gap: number, width = 600): HTMLElement => {
  // The gaps tighten at large text (to half at 200%) so the column still fits the 1080-high design.
  Object.assign(el.style, { marginTop: `calc(${gap}px * clamp(0.5, calc(1.5 - 0.5 * var(--fe-text)), 1))`, width: `calc(${width}px * (0.6 + 0.4 * var(--fe-text)))`, maxWidth: '100%' });
  return el;
};

/**
 * The panel from the right edge (spec §4.2): 900 px wide, a 110 px rake on its leading edge with a 6 px orange cut line,
 * near-opaque so the other two riders stay hidden behind it. Focus moves cross-fade its text; the panel itself stays.
 */
export class SlidePanel {
  readonly el = document.createElement('div');
  private readonly body = document.createElement('div');
  private shown: PresetName | null = null;
  private device: Device = 'keyboard';

  constructor(private readonly onPointer: (p: Intent) => void) {
    // 900 px at 16:9; a wider window gives the panel half its extra width (the rider keeps the left half).
    Object.assign(this.el.style, { position: 'absolute', right: '0', top: '0', bottom: '0', width: 'calc(900px + max(0px, (100% - 1920px) / 2))' });
    const plate = document.createElement('div');
    plate.className = 'fe-plate';
    Object.assign(plate.style, {
      position: 'absolute', inset: '0', clipPath: 'polygon(110px 0, 100% 0, 100% 100%, 0 100%)',
      background: 'linear-gradient(100deg, rgba(10, 18, 22, 0.9) 0, rgba(10, 18, 22, 0.95) 40%, rgba(8, 14, 18, 0.97) 100%)',
    });
    const cut = document.createElement('div');
    Object.assign(cut.style, { position: 'absolute', inset: '0', background: 'var(--fe-sun)', clipPath: 'polygon(110px 0, 116px 0, 6px 100%, 0 100%)' });
    Object.assign(this.body.style, { position: 'absolute', left: '150px', right: 'var(--fe-safe-x)', top: '92px', display: 'flex', flexDirection: 'column' });
    this.el.append(plate, cut, this.body);
    this.el.addEventListener('pointerover', (e) => {
      const tab = (e.target as HTMLElement).closest('[data-rider]') as HTMLElement | null;
      if (tab) this.onPointer({ kind: 'rider', rider: tab.dataset.rider as PresetName });
    });
    this.el.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest('[data-hit]') as HTMLElement | null;
      if (hit?.dataset.hit === 'tabMinus' || hit?.dataset.hit === 'tabPlus') this.onPointer({ kind: 'action', action: hit.dataset.hit });
      else if (hit?.dataset.rider) this.onPointer({ kind: 'action', action: 'confirm' });
    });
  }

  setDevice(d: Device): void {
    if (d !== this.device) { this.device = d; this.shown = null; }
  }

  render(s: FrontState, calm: boolean): void {
    if (this.shown === s.rider) return;
    const fade = this.shown !== null && !calm;
    this.shown = s.rider;
    const v = riderView(s);

    const tabs = place(document.createElement('div'), 0, 640);
    tabs.className = 'fe-tabs';
    // Large text: the roster grows to 150% and wraps rather than running off the panel.
    tabs.style.font = '700 calc(26px * min(var(--fe-text), 1.5)) / 1 "Barlow Semi Condensed", sans-serif';
    tabs.style.flexWrap = 'wrap';
    tabs.style.rowGap = '12px';
    tabs.style.letterSpacing = '0.14em';
    const tabGlyph = (a: 'tabMinus' | 'tabPlus'): HTMLElement => {
      const g = document.createElement('span');
      g.dataset.hit = a;
      g.innerHTML = glyphFor(this.device, a).svg;
      return g;
    };
    tabs.append(tabGlyph('tabMinus'), ...v.tabs.map((t) => {
      const el = document.createElement('span');
      el.className = `fe-tab${t.focused ? ' is-focus' : ''}`;
      el.dataset.rider = t.rider;
      el.dataset.hit = 'rider';
      el.textContent = t.label;
      return el;
    }), tabGlyph('tabPlus'));

    const lock = place(document.createElement('div'), 64, 680);
    const nick = document.createElement('div'), real = document.createElement('div');
    Object.assign(nick.style, {
      font: '400 128px / 1 Knewave, sans-serif', color: 'var(--fe-cream)',
      textShadow: '5px 5px 0 var(--fe-teal)', webkitTextStroke: '2px var(--fe-sun)',
    });
    nick.textContent = v.nickname;
    real.className = 'fe-line';
    Object.assign(real.style, { fontSize: 'calc(46px * min(var(--fe-text), 1.3))', margin: '2px 0 0 6px' });
    real.textContent = v.realName;
    lock.append(nick, real);

    const rows = place(document.createElement('div'), 60);
    for (const r of v.rows) {
      const row = document.createElement('div'), l = document.createElement('span'), val = document.createElement('span');
      Object.assign(row.style, { display: 'grid', gridTemplateColumns: '170px 1fr', alignItems: 'baseline', padding: '15px 0', borderTop: '1px solid rgba(247, 236, 210, 0.16)' });
      l.className = 'fe-label';
      l.style.fontSize = 'calc(21px * min(var(--fe-text), 1.4))';
      l.textContent = r.label;
      // The descriptors grow to 140%: the panel's column holds no more at 1080 high (the ledger's known limit).
      val.style.font = '600 calc(32px * min(var(--fe-text), 1.4)) / 1.15 "Barlow Semi Condensed", sans-serif';
      val.textContent = r.value;
      row.append(l, val);
      rows.append(row);
    }

    const line = place(document.createElement('div'), 33);
    line.className = 'fe-line';
    line.style.fontSize = 'calc(40px * min(var(--fe-text), 1.3))';
    line.textContent = `“${v.line}”`;

    // The crew note, the two mates' names in bold (the mockup).
    const note = place(document.createElement('div'), 40);
    Object.assign(note.style, { font: '500 calc(24px * min(var(--fe-text), 1.3)) / 1.35 "Barlow Semi Condensed", sans-serif', color: 'rgba(247, 236, 210, 0.7)' });
    const mates = new Set(Object.values(PRESETS).map((p) => p.nickname).filter((n) => n !== v.nickname));
    for (const part of v.note.split(new RegExp(`(${[...mates].map((m) => m.replace(/[-]/g, '\\-')).join('|')})`))) {
      if (!part) continue;
      if (mates.has(part)) {
        const b = document.createElement('b');
        Object.assign(b.style, { color: 'var(--fe-cream)', fontWeight: '600' });
        b.textContent = part;
        note.append(b);
      } else note.append(part);
    }

    if (fade) this.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
    this.body.replaceChildren(tabs, lock, rows, line, note);
  }
}
