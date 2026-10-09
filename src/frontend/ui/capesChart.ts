// src/frontend/ui/capesChart.ts: the surf chart (surf-map hub spec §3–4, mockup A): our own Admiralty-style chart of the
// Capes. Paper land with a fine hatch over a deep-teal sea with depth bands and a compass rose; today's swell lines roll
// in under the land, wind arrows drift over it; one pin per built break. 'full' fills the window (the map beat); 'title'
// is a 3× close-up between Gracetown and the river mouth (no pins, no wind, no labels but the capes and towns in view).
import { CHART, CHART_LABELS, type CapesChartData, TITLE_VIEW, capesToChart, chartSwellLines, chartWindArrows } from '../capesGeom';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const SOUNDINGS: readonly [number, number, string][] = [[560, 300, '38'], [430, 520, '61'], [300, 760, '84'], [620, 860, '45'], [240, 380, '96'], [520, 960, '70']];

export class CapesChart {
  readonly el = document.createElement('div');
  onPin: ((id: string) => void) | null = null;
  private readonly svg = el('svg');
  private readonly swell = el('g');
  private readonly wind = el('g');
  private readonly pins = el('g');
  private swellStep: [number, number] = [0, 0];
  private pinAt = new Map<string, [number, number]>();
  private readonly view: { x: number; y: number; w: number; h: number };

  constructor(private readonly opts: { view: 'full' | 'title' }) {
    this.view = opts.view === 'title' ? TITLE_VIEW : { x: 0, y: 0, w: CHART.w, h: CHART.h };
    this.el.className = 'fe-chart';
    // 'slice' covers any window shape: a 21:9 or 4:3 window crops the chart instead of showing bare edges (Review Focus 2).
    this.svg.setAttribute('viewBox', `${this.view.x} ${this.view.y} ${this.view.w} ${this.view.h}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    this.el.appendChild(this.svg);
  }

  async load(base = import.meta.env.BASE_URL): Promise<void> {
    const r = await fetch(`${base}ui/capesChart.json`);
    if (!r.ok) throw new Error(`surf chart: ${r.status} fetching capesChart.json`);
    this.draw((await r.json()) as CapesChartData);
  }

  private draw(d: CapesChartData): void {
    const defs = el('defs');
    defs.innerHTML = `
      <radialGradient id="ch-sea" cx="40%" cy="45%" r="75%"><stop offset="0" stop-color="#17565f"/><stop offset="1" stop-color="#0a2c34"/></radialGradient>
      <linearGradient id="ch-paper" x1="0" x2="1"><stop offset="0" stop-color="#efe1c1"/><stop offset="1" stop-color="#e2d1ab"/></linearGradient>
      <pattern id="ch-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="9" stroke="#b9a57f" stroke-width="1.1" opacity=".55"/></pattern>`;
    this.svg.appendChild(defs);
    this.svg.appendChild(el('rect', { x: -2000, y: -2000, width: CHART.w + 4000, height: CHART.h + 4000, fill: 'url(#ch-sea)' }));
    for (const [w, o] of [[150, 0.05], [96, 0.07], [52, 0.1], [22, 0.16]] as const)
      this.svg.appendChild(el('path', { d: d.coast, fill: 'none', stroke: '#a8d6d0', 'stroke-opacity': o, 'stroke-width': w, 'stroke-linejoin': 'round' }));
    if (this.opts.view === 'full') {
      for (const [x, y, t] of SOUNDINGS) { const s = el('text', { x, y, class: 'fe-chart-sounding' }); s.textContent = t; this.svg.appendChild(s); }
      const rose = el('g', { transform: 'translate(330,880)', class: 'fe-chart-rose' });
      rose.innerHTML = '<circle r="70"/><circle r="58" stroke-dasharray="2 4"/><path d="M0,-92 L9,0 L0,92 L-9,0 Z M-92,0 L0,9 L92,0 L0,-9 Z"/><text y="-100" text-anchor="middle">N</text>';
      this.svg.appendChild(rose);
    }
    this.svg.appendChild(this.swell);
    this.svg.appendChild(el('path', { d: d.land, fill: 'url(#ch-paper)' }));
    this.svg.appendChild(el('path', { d: d.land, fill: 'url(#ch-hatch)' }));
    this.svg.appendChild(el('path', { d: d.coast, fill: 'none', stroke: '#2c4a4c', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }));
    if (d.islands) this.svg.appendChild(el('path', { d: d.islands, fill: '#efe1c1', stroke: '#2c4a4c', 'stroke-width': 1.5 }));
    this.svg.appendChild(this.wind);
    for (const l of CHART_LABELS) {
      const [x, y] = capesToChart(...l.lonLat);
      if (l.dot) this.svg.appendChild(el('circle', { cx: x, cy: y, r: l.kind === 'cape' ? 4 : 5, class: 'fe-chart-dot' }));
      const t = el('text', { x: x + l.dx, y: y + l.dy, 'text-anchor': l.anchor, class: `fe-chart-${l.kind}` });
      t.textContent = l.text;
      this.svg.appendChild(t);
    }
    this.svg.appendChild(this.pins);
    if (this.opts.view === 'full') {
      const c = el('text', { x: 24, y: CHART.h - 16, class: 'fe-chart-credit' });
      c.textContent = 'Coastline © OpenStreetMap contributors';
      this.svg.appendChild(c);
    }
  }

  setConditions(c: { swellFromDeg: number; periodS: number; swellFt: number; windFromDeg: number | null; windMs: number }): void {
    const s = chartSwellLines(c.swellFromDeg, c.periodS, c.swellFt);
    this.swell.replaceChildren(...s.lines.map(([[x1, y1], [x2, y2]]) => el('line', { x1, y1, x2, y2 })));
    Object.assign(this.swell.style, { stroke: '#e8f6f2', strokeOpacity: String(s.opacity), strokeWidth: String(s.width), strokeLinecap: 'round' });
    this.swellStep = [s.travel[0] * s.spacing, s.travel[1] * s.spacing];
    const w = this.opts.view === 'full' ? chartWindArrows(c.windFromDeg, c.windMs) : { arrows: [], glassy: true };
    this.wind.replaceChildren(...w.arrows.map((a) => {
      const g = el('g', { transform: `translate(${a.x},${a.y}) rotate(${a.angleDeg})`, class: 'fe-chart-wind' });
      g.appendChild(el('path', { d: 'M-30,0 L30,0 M30,0 l-14,-8 M30,0 l-14,8' }));
      return g;
    }));
  }

  setPins(pins: { id: string; name: string; lonLat: [number, number] }[], focusId: string | null): void {
    if (this.opts.view !== 'full') return;
    this.pinAt.clear();
    this.pins.replaceChildren(...pins.map((p) => {
      const [x, y] = capesToChart(...p.lonLat);
      this.pinAt.set(p.id, [x, y]);
      const g = el('g', { class: `fe-chart-pin${p.id === focusId ? ' is-focus' : ''}`, 'data-hit': `pin:${p.id}` });
      g.append(el('circle', { cx: x, cy: y, r: 16, class: 'fe-chart-pin-pulse' }), el('circle', { cx: x, cy: y, r: 13, class: 'fe-chart-pin-dot' }));
      const t = el('text', { x: x - 26, y: y + 12, 'text-anchor': 'end', class: 'fe-chart-pin-name' });
      t.textContent = p.name;
      g.appendChild(t);
      g.addEventListener('pointerover', () => this.onPin?.(p.id));
      g.addEventListener('click', () => this.onPin?.(p.id));
      return g;
    }));
  }

  pinPoint(id: string): [number, number] | null {
    return this.pinAt.get(id) ?? null;
  }

  /** Rolls the swell in: one crest spacing every 3.2 s (calm, not the real wave speed; spec §3). */
  update(nowMs: number): void {
    const k = (nowMs / 3200) % 1;
    this.swell.setAttribute('transform', `translate(${(this.swellStep[0] * k).toFixed(2)},${(this.swellStep[1] * k).toFixed(2)})`);
    if (this.opts.view === 'title') {
      const drift = ((nowMs / 60000) * 20) % 40; // ~20 px a minute, there and back
      this.svg.setAttribute('viewBox', `${this.view.x + (drift > 20 ? 40 - drift : drift)} ${this.view.y} ${this.view.w} ${this.view.h}`);
    }
  }
}
