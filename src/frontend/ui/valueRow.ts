// src/frontend/ui/valueRow.ts
import type { RowView } from '../conditionsView';

const ARROW = (d: -1 | 1): string => `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="24" viewBox="0 0 22 28" aria-hidden="true"><path d="${d < 0 ? 'M17 3 L5 14 L17 25' : 'M5 3 L17 14 L5 25'}" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/></svg>`;

/** A label, then the value as the mockup draws it: ◀ word ▶ and its small number (the arrows on the focused row only). */
export class ValueRow {
  readonly el = document.createElement('div');
  private readonly label = document.createElement('span');
  private readonly value = document.createElement('span');
  private readonly word = document.createElement('span');
  private readonly text = document.createElement('span');
  private readonly small = document.createElement('span');
  readonly left = document.createElement('span');
  readonly right = document.createElement('span');
  private last = '';

  /** `words`: everything the row can show; the word box takes the longest one's width, so the right arrow never moves. */
  constructor(readonly row: string, glyph = '', words: readonly string[] = []) {
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
    this.value.append(this.left);
    if (glyph) {
      const icon = document.createElement('span');
      icon.className = 'fe-icon';
      icon.innerHTML = glyph;
      this.value.append(icon);
    }
    // The sizers sit in the word's grid cell, hidden: the cell is as wide as the longest word, at any text size.
    Object.assign(this.word.style, { display: 'inline-grid', justifyItems: 'start' });
    this.text.style.gridArea = '1 / 1';
    this.word.append(this.text);
    for (const w of words) {
      const sizer = document.createElement('span');
      sizer.className = 'fe-sizer';
      Object.assign(sizer.style, { gridArea: '1 / 1', visibility: 'hidden' });
      sizer.textContent = w;
      this.word.append(sizer);
    }
    this.value.append(this.word, this.right, this.small);
    this.el.style.gridTemplateColumns = 'calc(150px * (0.5 + 0.5 * var(--fe-text))) 1fr';
    this.el.append(this.label, this.value);
  }

  set(v: Omit<RowView, 'row'>): void {
    this.label.textContent = v.label;
    this.text.textContent = v.value;
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
    this.text.textContent = value;
  }
}
