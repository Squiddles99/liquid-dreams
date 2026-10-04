// src/frontend/ui/pauseMenu.ts
import type { SettingsStorage } from '../../dev/devSettings';
import { FRONT_SETTINGS_KEY, loadJson, safeAreaFraction, sanitizeFrontSettings } from '../frontSettings';
import { MENU_ITEMS, type MenuPick, type MenuState, stepMenu } from '../sessionMenu';
import { type Device, UiInput } from '../uiInput';
import { UiSounds } from '../uiSounds';
import { ControlsPage } from './controlsPage';
import { applyLayout, layoutFor, mountFrontEndRoot } from './layout';
import { Legend } from './legend';

type SoundOut = () => { ctx: BaseAudioContext; out: AudioNode } | null;

/**
 * The menu while surfing, in the front end's look: the game dimmed under a scrim, "Paused" and three rows on the left
 * (Keep surfing, Controls, Back to the dune), the legend bottom-right. Controls opens the Controls page (the drawn pad and
 * keys, and remapping) on the tab of the device last used. Keys, pads and the mouse all drive it.
 */
export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly rows: HTMLElement[] = [];
  private readonly legend: Legend;
  private readonly controls: ControlsPage;
  private readonly input = new UiInput(window);
  private sounds: UiSounds | null = null;
  private state: MenuState = { focus: 0 };
  private device: Device = 'keyboard';
  private picked: MenuPick | null = null;
  private primed = false;
  private readonly settings;

  constructor(parent: HTMLElement, private readonly soundOut: SoundOut, storage: SettingsStorage | null) {
    this.settings = sanitizeFrontSettings(storage ? loadJson(storage, FRONT_SETTINGS_KEY) : null);
    if (this.settings.glyphs !== 'auto') this.device = this.settings.glyphs;
    this.root = mountFrontEndRoot(parent);
    this.root.classList.add('fe-pause');
    this.resize(window.innerWidth, window.innerHeight);
    const scrim = document.createElement('div');
    scrim.className = 'fe-pause-scrim';
    const col = document.createElement('div');
    col.className = 'fe-pause-rows';
    Object.assign(col.style, { position: 'absolute', left: 'var(--fe-safe-x)', top: '360px', width: 'calc(520px * (0.6 + 0.4 * var(--fe-text)))' });
    const title = document.createElement('h1');
    title.className = 'fe-title';
    title.textContent = 'Paused';
    col.appendChild(title);
    MENU_ITEMS.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'fe-row';
      row.dataset.hit = m.id;
      row.style.gridTemplateColumns = '1fr';
      const v = document.createElement('span');
      v.className = 'fe-value';
      v.textContent = m.label;
      row.appendChild(v);
      row.addEventListener('pointerover', () => this.focus(i));
      row.addEventListener('click', () => { this.focus(i); this.act('confirm'); });
      this.rows.push(row);
      col.appendChild(row);
    });
    this.controls = new ControlsPage((s) => this.play(s));
    this.legend = new Legend((a) => this.act(a));
    this.root.append(scrim, col, this.controls.el, this.legend.el);
    this.render();
  }

  /** The Controls page (the self-tests read it). */
  get controlsPage(): ControlsPage {
    return this.controls;
  }

  /** The choice once made (then the menu is done), else null. */
  update(): MenuPick | null {
    const { actions, device } = this.input.poll(performance.now());
    // The first poll only learns what's already held (the START or Esc that opened the menu).
    if (!this.primed) { this.primed = true; return this.picked; }
    if (actions.length && this.settings.glyphs === 'auto') this.device = device;
    this.controls.setDevice(this.device);
    this.controls.update();
    for (const a of actions) this.act(a);
    this.render();
    return this.picked;
  }

  resize(w: number, h: number): void {
    applyLayout(this.root, layoutFor(w, h, safeAreaFraction(this.settings)), this.settings);
  }

  close(): void {
    this.input.dispose();
    this.controls.dispose();
    this.root.remove();
  }

  private act(a: Parameters<typeof stepMenu>[1]): void {
    if (this.picked) return;
    if (this.controls.isOpen) {
      // START keeps surfing from the Controls page too (unless it's cancelling a remap).
      if (this.controls.act(a) === 'ignored' && a === 'start') { this.picked = 'resume'; this.play('back'); }
      this.render();
      return;
    }
    const r = stepMenu(this.state, a);
    this.state = r.state;
    if (r.moved) this.play('focus');
    if (r.controls) { this.play('confirm'); this.controls.open(this.device); }
    if (r.pick) { this.picked = r.pick; this.play(r.pick === 'resume' ? 'back' : 'confirm'); }
    this.render();
  }

  private focus(i: number): void {
    if (this.controls.isOpen || i === this.state.focus) return;
    this.state = { focus: i };
    this.play('focus');
    this.render();
  }

  private play(s: 'focus' | 'confirm' | 'back'): void {
    if (!this.sounds) { const o = this.soundOut(); if (o) this.sounds = new UiSounds(o.ctx, o.out); }
    this.sounds?.play(s, { durS: 0.2 });
  }

  private render(): void {
    const open = this.controls.isOpen;
    this.root.classList.toggle('is-controls', open);
    this.rows.forEach((r, i) => r.classList.toggle('is-focus', i === this.state.focus));
    if (open) {
      const l = this.controls.legend(this.device);
      this.legend.set(l.entries, l.device);
    } else this.legend.set([{ action: 'confirm', text: 'Choose' }, { action: 'back', text: 'Keep surfing' }], this.device);
  }
}
