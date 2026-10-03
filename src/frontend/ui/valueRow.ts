// src/frontend/ui/valueRow.ts
import type { RowView } from '../conditionsView';

const ARROW = (d: -1 | 1): string => `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28" aria-hidden="true"><path d="${d < 0 ? 'M17 3 L5 14 L17 25' : 'M5 3 L17 14 L5 25'}" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/></svg>`;

/** A label, a word value with its small number, and the ◀ ▶ arrows (shown on the focused row only). */
export class ValueRow {
  readonly el = document.createElement('div');
  private readonly label = document.createElement('span');
  private readonly value = document.createElement('span');
  private readonly word = document.createElement('span');
  private readonly small = document.createElement('span');
  readonly left = document.createElement('span');
  readonly right = document.createElement('span');
  private last = '';

  constructor(readonly row: string, glyph = '') {
    this.el.className = 'fe-row';
    this.el.dataset.hit = row;
    this.label.className = 'fe-label';
    this.value.className = 'fe-value';
    this.small.className = 'fe-small';
    this.left.className = this.right.className = 'fe-arrow';
    this.left.innerHTML = ARROW(-1);
    this.right.innerHTML = ARROW(1);
    this.left.dataset.hit = `${row}:left`;
    this.right.dataset.hit = `${row}:right`;
    const arrows = document.createElement('span');
    Object.assign(arrows.style, { display: 'flex', gap: '10px' });
    arrows.append(this.left, this.right);
    if (glyph) {
      const icon = document.createElement('span');
      icon.innerHTML = glyph;
      this.value.append(icon);
    }
    this.value.append(this.word, this.small);
    this.el.append(this.label, this.value, arrows);
  }

  set(v: Omit<RowView, 'row'>): void {
    this.label.textContent = v.label;
    this.word.textContent = v.value;
    this.small.textContent = v.small;
    this.el.classList.toggle('is-focus', v.focused);
    this.el.style.marginBottom = v.gapAfter ? '24px' : '0';
    this.last = v.value;
  }

  /** The value change (140 ms): the old word slides 10 px out in the press direction, the new one in. */
  slide(dir: -1 | 1, calm: boolean): void {
    if (calm) return;
    this.word.animate([{ transform: `translateX(${-10 * dir}px)`, opacity: 0.2 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 140, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' });
    this.nudge(dir, calm);
  }

  /** That side's arrow nudges 4 px (an end of range nudges 3 px with the dull tick). */
  nudge(dir: -1 | 1, calm: boolean, px = 4): void {
    if (calm) return;
    (dir < 0 ? this.left : this.right).animate([{ transform: 'translateX(0)' }, { transform: `translateX(${px * dir}px)` }, { transform: 'translateX(0)' }], { duration: 140, easing: 'ease-out' });
  }

  get shown(): string {
    return this.last;
  }

  /** Roll the dice: show an in-between value without the slide. */
  flash(value: string): void {
    this.word.textContent = value;
  }
}
