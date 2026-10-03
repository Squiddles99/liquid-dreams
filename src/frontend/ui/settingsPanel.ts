// src/frontend/ui/settingsPanel.ts
import type { FrontSettings } from '../frontSettings';
import { type SettingRow, settingsView } from '../settingsView';
import { ValueRow } from './valueRow';

/** Settings over a full scrim, the same rows as Conditions (spec §11). */
export class SettingsPanel {
  readonly el = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly rows = new Map<SettingRow, ValueRow>();

  constructor() {
    this.el.className = 'fe-settings';
    Object.assign(this.el.style, { position: 'absolute', inset: '0', background: 'rgba(16, 23, 26, 0.88)' });
    const col = document.createElement('div');
    Object.assign(col.style, { position: 'absolute', left: 'var(--fe-safe-x)', top: 'calc(var(--fe-safe-y) + 40px)', width: '820px' });
    const title = document.createElement('h1');
    title.className = 'fe-title';
    title.textContent = 'Settings';
    col.append(title, this.list);
    this.el.appendChild(col);
  }

  render(s: FrontSettings, focus: SettingRow): void {
    for (const v of settingsView(s, focus)) {
      let r = this.rows.get(v.row);
      if (!r) {
        r = new ValueRow(v.row);
        // Wider labels than Conditions': "Opaque backplates" on one line.
        r.el.style.gridTemplateColumns = 'calc(280px * (0.5 + 0.5 * var(--fe-text))) 1fr';
        this.rows.set(v.row, r);
        this.list.appendChild(r.el);
      }
      r.set({ label: v.label, value: v.value, small: v.small, focused: v.focused, gapAfter: false });
    }
  }

  slide(row: SettingRow, dir: -1 | 1, calm: boolean): void {
    this.rows.get(row)?.slide(dir, calm);
  }

  /** An end of range: that side's arrow nudges 3 px. */
  nudge(row: SettingRow, dir: -1 | 1, calm: boolean): void {
    this.rows.get(row)?.nudge(dir, calm, 3);
  }
}
