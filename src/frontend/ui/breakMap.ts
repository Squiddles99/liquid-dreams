// src/frontend/ui/breakMap.ts
import type { LandSpot } from '../../surfer/placement';
import { MAP, swellCrests, swellLabel, windArrows, windDirOf, windLabel, windSpeedOf, worldToMap, type BreakMapData } from '../mapGeom';
import type { SessionSetup } from '../sessionSetup';

const NS = 'http://www.w3.org/2000/svg';
const INK = '#10171a', CREAM = '#f7ecd2', SUN = '#ef7d2e', SUN_HI = '#ffa14f';
/** A dark halo under text that sits over the crests or the reef. */
const HALO = 'stroke="#0b2029" stroke-width="3" paint-order="stroke" stroke-linejoin="round"';
/** The reef fade's inner stops: 28 px in from each end of its data (a fraction of the gradient's run). */
const fade = (d: BreakMapData, end: 0 | 1): string => {
  const run = Math.max(1, d.reefEdgeY[0] - d.reefEdgeY[1]), f = Math.min(0.45, 28 / run);
  return (end ? 1 - f : f).toFixed(4);
};
const line = (pts: [number, number][]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
const label = (x: number, y: number, text: string, fill: string, size = 18, extra = ''): string =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Barlow Semi Condensed" font-weight="700" font-size="${size}" letter-spacing="1" fill="${fill}" ${extra}>${text}</text>`;

/**
 * The map of the break, top-right inside the safe area (spec §7), drawn as the approved mockup: the baked reef, land and
 * beach over a deep-water gradient, the live swell (sun orange, on the sea) and wind (ink, on the land), and the inset.
 */
export class BreakMap {
  readonly el = document.createElement('div');
  private readonly svg = document.createElementNS(NS, 'svg');
  private readonly swell = document.createElementNS(NS, 'g');
  private readonly wind = document.createElementNS(NS, 'g');
  private readonly lookout = document.createElementNS(NS, 'g');

  constructor() {
    Object.assign(this.el.style, {
      position: 'absolute', right: 'var(--fe-safe-x)', top: 'var(--fe-safe-y)', width: `${MAP.w}px`, height: `${MAP.h + 5}px`, // the 5 px top border sits inside the border box
      background: '#0d2530', borderTop: '5px solid var(--fe-sun)', boxShadow: '0 10px 34px rgba(0, 0, 0, 0.45)', overflow: 'hidden',
    });
    this.svg.setAttribute('width', String(MAP.w));
    this.svg.setAttribute('height', String(MAP.h));
    this.svg.setAttribute('viewBox', `0 0 ${MAP.w} ${MAP.h}`);
    this.svg.style.display = 'block';
    this.el.appendChild(this.svg);
  }

  async load(url = '/ui/breakMap.json'): Promise<void> {
    const d: BreakMapData = await (await fetch(url)).json();
    const mainW = MAP.w - MAP.insetW, bar = 250 / MAP.mPerPx;
    this.svg.innerHTML = `
      <defs>
        <clipPath id="fe-map-main"><rect width="${mainW}" height="${MAP.h}"/></clipPath>
        <linearGradient id="fe-map-deep" x1="0" x2="1"><stop offset="0" stop-color="#0b2029"/><stop offset="1" stop-color="#14424e"/></linearGradient>
        <linearGradient id="fe-map-reef-fade" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${d.reefEdgeY[1]}" y2="${d.reefEdgeY[0]}">
          <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${fade(d, 0)}" stop-color="#fff"/><stop offset="${fade(d, 1)}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <mask id="fe-map-reef" maskUnits="userSpaceOnUse" x="0" y="0" width="${mainW}" height="${MAP.h}"><rect width="${mainW}" height="${MAP.h}" fill="url(#fe-map-reef-fade)"/></mask>
        <marker id="fe-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="${SUN_HI}"/></marker>
        <marker id="fe-arrow-ink" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="${INK}"/></marker>
      </defs>
      <g clip-path="url(#fe-map-main)">
        <rect width="${mainW}" height="${MAP.h}" fill="url(#fe-map-deep)"/>
        <g mask="url(#fe-map-reef)">
        <path d="${d.reef.d9}" fill="none" stroke="rgba(120, 200, 205, 0.35)" stroke-width="0.9"/>
        <path d="${d.reef.d6}" fill="none" stroke="rgba(120, 200, 205, 0.6)" stroke-width="1.1"/>
        <path d="${d.reef.d3}" fill="none" stroke="rgba(150, 225, 225, 0.85)" stroke-width="1.3" stroke-dasharray="2.9 2.2"/>
        </g>
        <path d="${d.land}" fill="#c9b07e" fill-rule="evenodd"/>
        <path d="${d.dune20}" fill="none" stroke="rgba(90, 70, 40, 0.45)" stroke-width="1.1"/>
        <path d="${d.beach}" fill="none" stroke="#efe1bd" stroke-width="2.2"/>
      </g>
      <g data-layer="live"></g>
      <circle cx="${d.peak[0]}" cy="${d.peak[1]}" r="6.3" fill="${SUN}" stroke="${INK}" stroke-width="1.4"/>
      <text x="${d.peak[0] - 63}" y="${d.peak[1] - 18}" font-family="Knewave" font-size="26" fill="${CREAM}" stroke="${INK}" stroke-width="0.5" paint-order="stroke">The Womb</text>
      <g transform="translate(${mainW - 16} 266)"><path d="M0 -15 L5 0 L0 -3.5 L-5 0z" fill="${INK}"/>${label(0, 15, 'N', INK, 18, 'text-anchor="middle"')}</g>
      <g transform="translate(${mainW - 10 - bar} 318)"><rect width="${bar.toFixed(1)}" height="3.5" fill="${INK}"/>${label(0, -5, '250 M', INK)}</g>
      <rect x="${mainW}" width="${MAP.insetW}" height="${MAP.h}" fill="#0a1d26"/>
      <path d="${d.inset.coast}" fill="none" stroke="#c9b07e" stroke-width="1.4"/>
      <rect x="${d.inset.box[0]}" y="${d.inset.box[1]}" width="${Math.max(8, d.inset.box[2])}" height="${Math.max(10, d.inset.box[3])}" fill="none" stroke="${SUN}" stroke-width="1.7"/>
      <text transform="translate(${mainW + 56} 122) rotate(90)" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="600" font-size="18" letter-spacing="0.7" fill="rgba(247, 236, 210, 0.8)">${d.inset.north}</text>
      <text transform="translate(${mainW + 56} 280) rotate(90)" text-anchor="middle" font-family="Barlow Semi Condensed" font-weight="600" font-size="18" letter-spacing="0.7" fill="rgba(247, 236, 210, 0.8)">${d.inset.south}</text>
      <line x1="${mainW}" y1="0" x2="${mainW}" y2="${MAP.h}" stroke="rgba(247, 236, 210, 0.18)"/>`;
    const live = this.svg.querySelector('[data-layer="live"]')!;
    live.setAttribute('clip-path', 'url(#fe-map-main)');
    live.append(this.wind, this.swell, this.lookout);
  }

  setLookout(spot: LandSpot): void {
    const [x, y] = worldToMap(spot.x, spot.z);
    this.lookout.innerHTML = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.9" fill="${CREAM}" stroke="${INK}" stroke-width="1.4"/>${label(x - 23, y + 26, 'LOOKOUT', INK)}`;
  }

  /** The live layers: re-drawn on each change, with the 140 ms value-change fade. */
  setConditions(s: SessionSetup, calm: boolean): void {
    const c = swellCrests(s.fromDeg, s.periodS, s.swellFt);
    this.swell.innerHTML = c.lines.map((l, k) => `<path d="${line(l)}" fill="none" stroke="${SUN_HI}" stroke-width="${c.widths[k].toFixed(1)}" opacity="${c.opacities[k].toFixed(2)}" stroke-linecap="round"/>`).join('')
      + `<path d="${line(c.arrow)}" fill="none" stroke="${SUN_HI}" stroke-width="2.1" stroke-linecap="round" marker-end="url(#fe-arrow)"/>`
      + label(13, MAP.h - 12, swellLabel(s), SUN_HI, 20, HALO);
    const w = windArrows(windDirOf(s), windSpeedOf(s));
    this.wind.innerHTML = w.arrows.map((a) => `<path d="${line(a)}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity="0.75" marker-end="url(#fe-arrow-ink)"/>`).join('')
      // The wind's words sit over the swell's, on the sea: the coast strip is too narrow for "E · LIGHT OFFSHORE".
      + label(13, MAP.h - 38, windLabel(s), CREAM, 19, HALO);
    if (!calm) for (const g of [this.swell, this.wind]) g.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
  }
}
