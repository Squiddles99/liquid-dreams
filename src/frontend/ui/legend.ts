// src/frontend/ui/legend.ts
import { PRESETS } from '../../surfer/presets';
import type { FrontState } from '../frontEnd';
import { type LegendAction, glyphFor } from '../glyphs';
import type { Device } from '../uiInput';

export interface LegendEntry { action: LegendAction; text: string; accent?: boolean }
const ORDER: LegendAction[] = ['controls', 'random', 'details', 'toggle', 'confirm', 'back', 'start'];

/** What each beat offers, in the fixed order View, Y, X, A, B, START (spec §5.5; View: Controls, Andrew 2026-10-04). */
export function legendFor(s: FrontState): LegendEntry[] {
  const e: LegendEntry[] = [];
  if (s.beat === 'map') {
    if (s.breakDetails) e.push({ action: 'confirm', text: 'Surf here', accent: true }, { action: 'back', text: 'Close' });
    else e.push({ action: 'confirm', text: 'Surf here', accent: true }, { action: 'details', text: 'Break details' }, { action: 'toggle', text: s.source === 'forecast' ? 'Custom conditions' : 'Game forecast' }, { action: 'back', text: 'Title' });
  } else if (s.beat === 'conditions') e.push({ action: 'random', text: 'Roll the dice' }, { action: 'details', text: 'Swell details' }, { action: 'confirm', text: 'Done' }, { action: 'back', text: 'Back' });
  else if (s.beat === 'rider') e.push({ action: 'confirm', text: `Ride as ${PRESETS[s.rider].nickname}` }, { action: 'back', text: 'Back' });
  else if (s.beat === 'gear') e.push({ action: 'confirm', text: 'Choose' }, { action: 'back', text: 'Back' }, { action: 'start', text: 'Paddle out', accent: true });
  if (s.beat !== 'out') e.push({ action: 'controls', text: 'Controls' });
  return e.sort((a, b) => ORDER.indexOf(a.action) - ORDER.indexOf(b.action));
}

/** The legend, bottom-right inside the safe area. The glyphs switch at once when the device does (no animation). */
export class Legend {
  readonly el = document.createElement('div');
  private key = '';

  constructor(private readonly onClick: (a: LegendAction) => void) {
    this.el.className = 'fe-legend';
  }

  set(entries: LegendEntry[], device: Device): void {
    const key = device + JSON.stringify(entries);
    if (key === this.key) return;
    this.key = key;
    this.el.replaceChildren(...entries.map((e) => {
      const item = document.createElement('span');
      item.dataset.hit = e.action;
      item.className = e.accent ? 'fe-start' : '';
      Object.assign(item.style, { display: 'inline-flex', alignItems: 'center', gap: '12px' });
      const g = document.createElement('span');
      g.innerHTML = glyphFor(device, e.action).svg;
      g.dataset.glyph = glyphFor(device, e.action).label;
      const t = document.createElement('span');
      t.textContent = e.text;
      item.append(g, t);
      item.addEventListener('click', () => this.onClick(e.action));
      return item;
    }));
  }
}
