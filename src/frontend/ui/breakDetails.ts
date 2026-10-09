// src/frontend/ui/breakDetails.ts: a break's details page (surf-map hub spec §8): over the dimmed chart, the in-game hero
// capture, name and today's verdict on the left; the seven sections (only those with claims the game backs) on the right,
// scrolled by up/down, the arrow keys or the wheel (one step = 120 design px).
import { breakById } from '../../breaks/index';
import { breakToday, conditionsNow, todaysSetup } from '../conditionsSource';
import type { FrontAction, FrontState } from '../frontEnd';

const STEP_PX = 120;

export class BreakDetails {
  readonly el = document.createElement('div');
  private readonly left = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly inner = document.createElement('div');
  private key = '';

  constructor(onAction: (a: FrontAction) => void) {
    this.el.className = 'fe-details';
    this.left.className = 'fe-details-left';
    this.body.className = 'fe-details-body';
    this.inner.className = 'fe-details-inner';
    this.body.appendChild(this.inner);
    this.el.append(this.left, this.body);
    this.body.addEventListener('wheel', (e) => { e.preventDefault(); onAction(e.deltaY > 0 ? 'down' : 'up'); }, { passive: false });
  }

  render(s: FrontState, today: Date): void {
    this.el.classList.toggle('is-open', s.breakDetails);
    if (!s.breakDetails) return;
    const b = breakById(s.breakId);
    if (!b) return;
    const key = `${b.id}|${s.source}`;
    if (key !== this.key) {
      this.key = key;
      const t = breakToday(conditionsNow(s.source, { forecast: todaysSetup(today), custom: s.setup }), b.best);
      const img = document.createElement('img');
      img.className = 'fe-details-hero'; img.src = `${import.meta.env.BASE_URL}${b.hero}`; img.alt = '';
      const name = document.createElement('div'); name.className = 'fe-map-name'; name.textContent = b.name;
      const sub = document.createElement('div'); sub.className = 'fe-map-sub'; sub.textContent = b.subtitle;
      const v = document.createElement('div'); v.className = `fe-map-verdict is-${t.verdict}`;
      v.innerHTML = '<span class="fe-map-verdict-dot"></span>';
      const vt = document.createElement('div'); vt.className = 'fe-map-verdict-t'; vt.textContent = { on: 'ON TODAY', fair: 'FAIR TODAY', off: 'OFF TODAY' }[t.verdict];
      const vs = document.createElement('div'); vs.className = 'fe-map-verdict-s'; vs.textContent = t.reason;
      v.append(vt, vs);
      this.left.replaceChildren(img, name, sub, v);
      this.inner.replaceChildren(...b.details.map((sec) => {
        const d = document.createElement('section'); d.className = 'fe-details-sec';
        const hd = document.createElement('div'); hd.className = 'fe-details-h'; hd.textContent = sec.heading.toUpperCase();
        d.appendChild(hd);
        for (const p of sec.paragraphs) { const e = document.createElement('p'); e.textContent = p.text; d.appendChild(e); }
        return d;
      }));
    }
    const max = Math.max(0, this.inner.scrollHeight - this.body.clientHeight);
    const y = Math.min(max, s.detailsScroll * STEP_PX);
    this.inner.style.transform = `translateY(${-y}px)`;
    // Fade the edges where text runs on: the top once scrolled, the bottom while more is below.
    this.body.classList.toggle('is-scrolled', y > 0);
    this.body.classList.toggle('is-more', y < max);
  }
}
