// src/frontend/ui/conditionsPanel.ts
import type { FrontAction, FrontEvent, FrontState } from '../frontEnd';
import { conditionsView, rollFrames, tideCurve } from '../conditionsView';
import { type RowId, rowWords } from '../sessionSetup';
import { SKY_GLYPHS } from './skyGlyphs';
import { ValueRow } from './valueRow';

export type PointerIntent = { kind: 'focus'; row: RowId } | { kind: 'action'; action: FrontAction };

/** Conditions' left column over its scrim: the title, the rows, and the tide's little curve on the Tide row. */
export class ConditionsPanel {
  readonly el = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly rows = new Map<RowId, ValueRow>();
  private readonly tide = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private rolling: { startMs: number; seed: number; today: Date } | null = null;

  constructor(private readonly onPointer: (p: PointerIntent) => void) {
    const scrim = document.createElement('div');
    scrim.className = 'fe-scrim-left';
    const col = document.createElement('div');
    Object.assign(col.style, { position: 'absolute', left: 'var(--fe-safe-x)', top: 'calc(var(--fe-safe-y) + 40px)', width: 'calc(640px * (0.6 + 0.4 * var(--fe-text)))' });
    const title = document.createElement('h1');
    title.className = 'fe-title';
    title.textContent = 'Conditions';
    col.append(title, this.list);
    this.tide.setAttribute('width', '120');
    this.tide.setAttribute('height', '40');
    this.tide.setAttribute('viewBox', '0 0 120 40');
    this.el.append(scrim, col);
    this.el.addEventListener('pointerover', (e) => {
      const row = (e.target as HTMLElement).closest('.fe-row') as HTMLElement | null;
      if (row?.dataset.hit) this.onPointer({ kind: 'focus', row: row.dataset.hit as RowId });
    });
    this.el.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest('[data-hit]') as HTMLElement | null;
      if (hit?.dataset.hit?.endsWith(':left')) this.onPointer({ kind: 'action', action: 'left' });
      else if (hit?.dataset.hit?.endsWith(':right')) this.onPointer({ kind: 'action', action: 'right' });
    });
    this.el.addEventListener('wheel', (e) => {
      if ((e.target as HTMLElement).closest('.fe-row.is-focus')) this.onPointer({ kind: 'action', action: e.deltaY > 0 ? 'left' : 'right' });
    }, { passive: true });
  }

  render(s: FrontState, today: Date): void {
    const view = conditionsView(s, today);
    const ids = view.map((v) => v.row).join();
    if ([...this.rows.keys()].join() !== ids) {
      this.rows.clear();
      this.list.replaceChildren(...view.map((v) => {
        const r = new ValueRow(v.row, v.row === 'sky' ? SKY_GLYPHS[s.setup.sky] : '', rowWords(v.row));
        this.rows.set(v.row, r);
        return r.el;
      }));
    }
    for (const v of view) if (!this.rolling) this.rows.get(v.row)!.set(v);
    const tideRow = this.rows.get('tide');
    if (tideRow) {
      this.tide.innerHTML = `<path d="${tideCurve(s.setup.tide)}" fill="none" stroke="#f7ecd2" stroke-width="2.5" opacity="0.8"/>`;
      // The curve sits between the word and its number, as in the mockup.
      const value = tideRow.el.querySelector('.fe-value')!;
      value.insertBefore(this.tide, value.querySelector('.fe-small'));
    }
    const skyIcon = this.rows.get('sky')?.el.querySelector('.fe-icon');
    if (skyIcon) skyIcon.innerHTML = SKY_GLYPHS[s.setup.sky];
  }

  event(e: FrontEvent, calm: boolean, nowMs: number, today: Date): void {
    if (e.kind === 'value') this.rows.get(e.row)?.slide(e.dir, calm);
    if (e.kind === 'end') this.rows.get(e.row)?.nudge(1, calm, 3);
    if (e.kind === 'roll' && !calm) this.rolling = { startMs: nowMs, seed: e.seed, today };
  }

  /** Roll the dice: each row ticks through its frames over 240 ms, staggered 40 ms (spec §5.6). Returns true when done. */
  update(nowMs: number): boolean {
    const r = this.rolling;
    if (!r) return true;
    let done = true, i = 0;
    for (const [row, vr] of this.rows) {
      const t = nowMs - r.startMs - 40 * i++;
      const frames = rollFrames(r.seed, row, r.today);
      if (t < 240) done = false;
      if (t >= 0) vr.flash(frames[Math.min(frames.length - 1, Math.floor((t / 240) * frames.length))]);
    }
    if (done) this.rolling = null;
    return done;
  }
}
