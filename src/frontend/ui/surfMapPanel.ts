// src/frontend/ui/surfMapPanel.ts: the surf map beat (surf-map hub spec §3, mockup A): the chart full screen; top-left
// the tabs (Surf map · Library, locked), today's conditions and the source switch; top-right the Local tag; on the right
// the focused break's panel; a dotted leader from its pin to the panel.
import { SURF_BREAKS, breakById } from '../../breaks/index';
import { compass16 } from '../capesGeom';
import { breakToday, conditionsNow, todaysSetup } from '../conditionsSource';
import type { FrontAction, FrontState } from '../frontEnd';
import { CapesChart } from './capesChart';

type Pointer = { kind: 'pin'; id: string } | { kind: 'action'; action: FrontAction } | { kind: 'locked'; what: 'realtime' | 'library' };
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e;
};
const LEVEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;
const TIDE = { low: 'Low', mid: 'Mid', high: 'High' } as const;

export class SurfMapPanel {
  readonly el = h('div', 'fe-map');
  private readonly chart = new CapesChart({ view: 'full' });
  private readonly strip = h('div', 'fe-map-strip');
  private readonly sw = h('div', 'fe-map-source');
  private readonly panel = h('div', 'fe-map-panel');
  private readonly leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private key = '';

  constructor(private readonly onPointer: (p: Pointer) => void) {
    const tabs = h('div', 'fe-map-tabs');
    const map = h('span', 'fe-map-tab is-on', 'SURF MAP'), lib = h('span', 'fe-map-tab is-locked', 'LIBRARY');
    lib.dataset.hit = 'library'; lib.addEventListener('click', () => onPointer({ kind: 'locked', what: 'library' }));
    tabs.append(map, lib);
    const local = h('div', 'fe-map-local', 'LOCAL');
    for (const [id, label] of [['forecast', 'GAME FORECAST'], ['realtime', 'REAL-TIME · SOON'], ['custom', 'CUSTOM']] as const) {
      const b = h('span', 'fe-map-src', label); b.dataset.src = id; b.dataset.hit = `src:${id}`;
      b.addEventListener('click', () => (id === 'realtime' ? onPointer({ kind: 'locked', what: 'realtime' }) : onPointer({ kind: 'action', action: 'toggle' })));
      this.sw.appendChild(b);
    }
    this.leader.setAttribute('class', 'fe-map-leader');
    this.chart.onPin = (id) => onPointer({ kind: 'pin', id });
    this.panel.dataset.hit = 'panel';
    // ODbL credit (plan ruling 2), as UI text inside the safe area: a window that isn't 16:9 crops the chart's own edges.
    const credit = h('div', 'fe-map-credit', 'Coastline © OpenStreetMap contributors');
    const left = h('div', 'fe-map-left');
    left.append(tabs, this.strip, this.sw, credit);
    this.el.append(this.chart.el, this.leader, left, local, this.panel);
  }

  load(): Promise<void> { return this.chart.load(); }

  render(s: FrontState, today: Date): void {
    const forecast = todaysSetup(today), now = conditionsNow(s.source, { forecast, custom: s.setup });
    const b = breakById(s.breakId) ?? SURF_BREAKS[0];
    const key = JSON.stringify([s.source, s.breakId, now]);
    for (const el of this.sw.children) (el as HTMLElement).classList.toggle('is-on', (el as HTMLElement).dataset.src === s.source);
    if (key === this.key) return;
    this.key = key;
    this.chart.setConditions(now);
    this.chart.setPins(SURF_BREAKS.map((x) => ({ id: x.id, name: x.name, lonLat: x.lonLat })), s.breakId);
    const kmh = Math.round(now.windMs * 3.6);
    this.strip.replaceChildren(
      h('div', 'fe-map-strip-k', s.source === 'forecast' ? 'TODAY · GAME FORECAST' : 'CUSTOM CONDITIONS'),
      line('Swell', `${now.swellFt} ft @ ${now.periodS} s ${compass16(now.swellFromDeg)}`),
      line('Wind', now.windFromDeg === null || now.windMs < 1 ? 'Glassy' : `${kmh} km/h ${compass16(now.windFromDeg)} · ${now.windLabel.toLowerCase()}`),
      line('Tide', now.tideLabel),
    );
    const today_ = breakToday(now, b.best);
    const verdictText = { on: 'ON TODAY', fair: 'FAIR TODAY', off: 'OFF TODAY' }[today_.verdict];
    const stat = (k: string, v: string) => { const d = h('div', 'fe-map-stat'); d.append(h('div', 'fe-map-stat-k', k), h('div', 'fe-map-stat-v', v)); return d; };
    const stats = h('div', 'fe-map-stats');
    if (b.bestShown.swell) stats.appendChild(stat('BEST SWELL', `${compass16(b.best.swellFromDeg[0])} – ${compass16(b.best.swellFromDeg[1])}`));
    if (b.bestShown.wind) stats.appendChild(stat('BEST WIND', `${compass16(b.best.windFromDeg[0])} – ${compass16(b.best.windFromDeg[1])} · offshore`));
    if (b.bestShown.tide) stats.appendChild(stat('BEST TIDE', b.best.tide.map((t) => TIDE[t]).join(', ')));
    stats.appendChild(stat('LEVEL', LEVEL[b.best.level]));
    const verdict = h('div', `fe-map-verdict is-${today_.verdict}`);
    verdict.append(h('span', 'fe-map-verdict-dot'), h('div', 'fe-map-verdict-t', verdictText), h('div', 'fe-map-verdict-s', today_.reason));
    const more = h('div', 'fe-map-more', 'DETAILS ›'); more.dataset.hit = 'details';
    more.addEventListener('click', () => this.onPointer({ kind: 'action', action: 'details' }));
    this.panel.replaceChildren(h('div', 'fe-map-kick', b.kicker), h('div', 'fe-map-name', b.name), h('div', 'fe-map-sub', b.subtitle),
      verdict, stats, ...b.summary.map((p) => h('p', 'fe-map-para', p.text)), more);
    this.drawLeader(b.id);
  }

  private drawLeader(id: string): void {
    const p = this.chart.pinPoint(id), svg = this.chart.el.querySelector('svg');
    if (!p || !svg) return;
    const ctm = svg.getScreenCTM(), box = this.el.getBoundingClientRect(), panel = this.panel.getBoundingClientRect();
    if (!ctm || box.width === 0) return;
    const pt = svg.createSVGPoint(); pt.x = p[0]; pt.y = p[1];
    const s = pt.matrixTransform(ctm), sx = box.width / this.el.offsetWidth || 1;
    const x1 = (s.x - box.left) / sx + 18, y = (s.y - box.top) / sx, x2 = (panel.left - box.left) / sx;
    this.leader.innerHTML = `<path d="M${x1.toFixed(0)},${y.toFixed(0)} L${x2.toFixed(0)},${y.toFixed(0)}"/>`;
  }

  update(nowMs: number): void { this.chart.update(nowMs); }
}

function line(k: string, v: string): HTMLElement {
  const d = document.createElement('div'); d.className = 'fe-map-strip-l';
  const a = document.createElement('span'); a.textContent = `${k} `; const b = document.createElement('b'); b.textContent = v;
  d.append(a, b); return d;
}
