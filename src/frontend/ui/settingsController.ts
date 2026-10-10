// src/frontend/ui/settingsController.ts: the Settings overlay and the front-end settings it edits (spec §11), shared by
// the front end's beats and the title (surf-map hub plan Task 11): load, show, step, save, and tell the owner to re-apply.
import type { SettingsStorage } from '../../dev/devSettings';
import type { FrontAction } from '../frontEnd';
import { FRONT_SETTINGS_KEY, type FrontSettings, loadJson, sanitizeFrontSettings, saveJson } from '../frontSettings';
import { SETTING_ROWS, type SettingRow, stepSetting } from '../settingsView';
import type { UiSounds } from '../uiSounds';
import type { Legend } from './legend';
import { SettingsPanel } from './settingsPanel';

export class SettingsController {
  private current: FrontSettings;
  /** The Settings overlay while it's open (Back + START), and its focused row. */
  private settingsPanel: SettingsPanel | null = null;
  private settingsFocus: SettingRow = 'textScale';

  constructor(
    private readonly root: HTMLElement,
    private readonly storage: SettingsStorage | null,
    private readonly onApply: (s: FrontSettings) => void,
    private readonly legend: Legend,
    /** The owner's UI sounds, once its audio exists (null: silent). */
    private readonly sounds: () => UiSounds | null = () => null,
  ) {
    this.current = sanitizeFrontSettings(storage ? loadJson(storage, FRONT_SETTINGS_KEY) : null);
  }

  get isOpen(): boolean {
    return this.settingsPanel !== null;
  }

  get settings(): FrontSettings {
    return this.current;
  }

  /** Re-reads the saved settings: the title and the front end each hold a controller, and the other may have saved since. */
  reload(): void {
    this.current = sanitizeFrontSettings(this.storage ? loadJson(this.storage, FRONT_SETTINGS_KEY) : null);
    this.onApply(this.current);
  }

  /** Save and apply new settings without opening the overlay (the surf map's source switch). */
  set(s: FrontSettings): void {
    this.current = s;
    this.applySettings();
    this.settingsPanel?.render(this.current, this.settingsFocus);
  }

  /** The Settings overlay over everything (spec §11). */
  open(): void {
    if (this.settingsPanel) return;
    this.settingsPanel = new SettingsPanel();
    this.settingsFocus = 'textScale';
    this.root.appendChild(this.settingsPanel.el);
    this.root.classList.add('is-settings');
    this.root.appendChild(this.legend.el); // the legend stays above the overlay's scrim
    this.settingsPanel.render(this.current, this.settingsFocus);
  }

  close(): void {
    this.settingsPanel?.el.remove();
    this.settingsPanel = null;
    this.root.classList.remove('is-settings');
  }

  /** While Settings is open: up and down move the focus (wrapping), left and right change the value, B or the chord closes. */
  act(a: FrontAction): boolean {
    const panel = this.settingsPanel;
    if (!panel) return false;
    const calm = this.current.calmMenus, sounds = this.sounds();
    if (a === 'back' || a === 'settings') {
      sounds?.play('back');
      this.close();
      return true;
    }
    if (a === 'up' || a === 'down') {
      const i = SETTING_ROWS.indexOf(this.settingsFocus), n = SETTING_ROWS.length;
      this.settingsFocus = SETTING_ROWS[(i + (a === 'down' ? 1 : -1) + n) % n];
      sounds?.play('focus');
    } else if (a === 'left' || a === 'right') {
      const dir = a === 'right' ? 1 : -1, r = stepSetting(this.current, this.settingsFocus, dir);
      if (r.atEnd) {
        sounds?.play('end');
        panel.nudge(this.settingsFocus, dir, calm);
      } else {
        this.current = r.settings;
        sounds?.play('value');
        panel.slide(this.settingsFocus, dir, calm);
        this.applySettings();
      }
    }
    panel.render(this.current, this.settingsFocus);
    return true;
  }

  /** A settings change: saved, then the owner re-applies it (layout, calm, glyphs). */
  private applySettings(): void {
    if (this.storage) saveJson(this.storage, FRONT_SETTINGS_KEY, this.current);
    this.onApply(this.current);
  }
}
