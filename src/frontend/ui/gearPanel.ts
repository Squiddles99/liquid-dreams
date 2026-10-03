// src/frontend/ui/gearPanel.ts
import type { FrontAction } from '../frontEnd';
import type { GearView } from '../gearView';
import { glyphFor } from '../glyphs';
import type { Device } from '../uiInput';

type Intent = { kind: 'gear'; index: number } | { kind: 'action'; action: FrontAction };
/** The fit badges, the mockup's: IDEAL in teal, GOOD and OK in cream tints. */
const BADGE: Record<'IDEAL' | 'GOOD' | 'OK', { bg: string; fg: string }> = {
  IDEAL: { bg: 'var(--fe-teal)', fg: '#e9fbf8' },
  GOOD: { bg: 'rgba(247, 236, 210, 0.18)', fg: 'var(--fe-cream)' },
  OK: { bg: 'rgba(247, 236, 210, 0.1)', fg: 'rgba(247, 236, 210, 0.75)' },
};

/**
 * Grab your gear's right panel over its scrim (spec §4.3), laid out as the approved mockup: 600 px wide at 150 px down,
 * the tabs, 84 px rows (the focused one scaled from its right edge), then the Paddle / Hold / Turn bars or the specs line.
 */
export class GearPanel {
  readonly el = document.createElement('div');
  private readonly col = document.createElement('div');
  private key = '';

  constructor(private readonly onPointer: (p: Intent) => void) {
    const scrim = document.createElement('div');
    scrim.className = 'fe-scrim-right';
    Object.assign(this.col.style, { position: 'absolute', right: 'var(--fe-safe-x)', top: '150px', width: '600px' });
    this.el.append(scrim, this.col);
    this.el.addEventListener('pointerover', (e) => {
      const row = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
      if (row) this.onPointer({ kind: 'gear', index: Number(row.dataset.index) });
    });
    this.el.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest('[data-hit]') as HTMLElement | null;
      if (!hit) return;
      if (hit.dataset.index !== undefined) this.onPointer({ kind: 'action', action: 'confirm' });
      else this.onPointer({ kind: 'action', action: hit.dataset.hit as FrontAction });
    });
  }

  render(v: GearView, device: Device, calm: boolean): void {
    const key = device + JSON.stringify(v);
    if (key === this.key) return;
    this.key = key;
    const glyph = (a: 'tabMinus' | 'tabPlus' | 'toggle'): HTMLElement => {
      const g = document.createElement('span');
      g.dataset.hit = a;
      g.style.display = 'inline-flex';
      g.innerHTML = glyphFor(device, a).svg;
      return g;
    };
    const tabs = document.createElement('div');
    tabs.className = 'fe-tabs';
    tabs.style.marginBottom = '26px';
    const tab = (label: string, on: boolean): HTMLElement => {
      const t = document.createElement('span');
      t.className = `fe-tab${on ? ' is-focus' : ''}`;
      t.textContent = label;
      return t;
    };
    tabs.append(glyph('tabMinus'), tab('Board', v.tab === 'board'), tab('Outfit', v.tab === 'outfit'), glyph('tabPlus'));

    const rows = v.rows.map((r, i) => {
      const el = document.createElement('div');
      el.className = `fe-row${r.focused ? ' is-focus' : ''}`;
      el.dataset.index = String(i);
      el.dataset.hit = 'row';
      Object.assign(el.style, { gridTemplateColumns: '1fr auto', minHeight: 'calc(84px * var(--fe-text))', padding: '0 20px', transformOrigin: '100% 50%' });
      const name = document.createElement('span');
      name.className = 'fe-value';
      Object.assign(name.style, { fontSize: 'calc(36px * var(--fe-text))', gap: '12px', minWidth: '0' });
      name.append(r.name);
      if (r.detail) {
        const d = document.createElement('span');
        d.className = 'fe-small';
        d.textContent = r.detail;
        name.appendChild(d);
      }
      const mark = r.pick ?? r.season;
      if (mark) {
        const m = document.createElement('span');
        Object.assign(m.style, { font: '500 calc(20px * var(--fe-text)) / 1 "Barlow Semi Condensed", sans-serif', letterSpacing: '0.06em', color: 'var(--fe-sun)' });
        m.textContent = mark;
        name.appendChild(m);
      }
      const badge = document.createElement('span');
      if (r.badge) {
        badge.textContent = r.badge;
        Object.assign(badge.style, {
          font: '700 calc(19px * var(--fe-text)) / 1 "Barlow Semi Condensed", sans-serif', letterSpacing: '0.14em', padding: '5px 10px 4px',
          borderRadius: '2px', background: BADGE[r.badge].bg, color: BADGE[r.badge].fg,
        });
      }
      el.append(name, badge);
      return el;
    });

    const extra: HTMLElement[] = [];
    if (v.bars) {
      const bars = document.createElement('div');
      Object.assign(bars.style, { marginTop: '30px', padding: '0 20px' });
      for (const [label, n] of [['Paddle', v.bars.paddle], ['Hold', v.bars.hold], ['Turn', v.bars.turn]] as const) {
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center', height: '44px' });
        const l = document.createElement('span');
        l.className = 'fe-label';
        l.textContent = label;
        const segs = document.createElement('span');
        Object.assign(segs.style, { display: 'flex', gap: '6px' });
        for (let k = 1; k <= 5; k++) {
          const sgm = document.createElement('i');
          Object.assign(sgm.style, { display: 'block', width: '58px', height: '12px', transform: 'skewX(-18deg)', background: k <= n ? 'var(--fe-sun)' : 'rgba(247, 236, 210, 0.18)' });
          segs.appendChild(sgm);
        }
        row.append(l, segs);
        bars.append(row);
      }
      extra.push(bars);
    }
    // The specs line, or (with the bars) the hint that RS / R shows it.
    if (v.specs || v.bars) {
      const sp = document.createElement('div');
      Object.assign(sp.style, {
        marginTop: '22px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '14px',
        font: '500 calc(25px * var(--fe-text)) / 1.2 "Barlow Semi Condensed", sans-serif', color: 'rgba(247, 236, 210, 0.8)', fontVariantNumeric: 'tabular-nums',
      });
      const t = document.createElement('span');
      t.textContent = v.specs ?? 'Specs';
      if (!v.specs) Object.assign(t.style, { fontSize: 'calc(21px * var(--fe-text))', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(247, 236, 210, 0.6)' });
      sp.append(glyph('toggle'), t);
      extra.push(sp);
    }
    if (v.note) {
      const n = document.createElement('div');
      Object.assign(n.style, { marginTop: '26px', padding: '0 20px', font: '500 calc(22px * var(--fe-text)) / 1.35 Barlow, sans-serif', color: 'rgba(247, 236, 210, 0.72)' });
      n.textContent = v.note;
      extra.push(n);
    }
    this.col.replaceChildren(tabs, ...rows, ...extra);
    if (!calm) rows.slice(0, 6).forEach((r, i) => r.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 280, delay: 35 * i, easing: 'cubic-bezier(0.33, 1, 0.68, 1)', fill: 'backwards' }));
  }
}
