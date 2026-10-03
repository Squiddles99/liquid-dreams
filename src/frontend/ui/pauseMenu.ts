// src/frontend/ui/pauseMenu.ts
import type { SettingsStorage } from '../../dev/devSettings';
import { FRONT_SETTINGS_KEY, loadJson, safeAreaFraction, sanitizeFrontSettings } from '../frontSettings';
import { MENU_ITEMS, type MenuPick, type MenuState, stepMenu } from '../sessionMenu';
import { type Device, UiInput } from '../uiInput';
import { UiSounds } from '../uiSounds';
import { applyLayout, layoutFor, mountFrontEndRoot } from './layout';
import { Legend } from './legend';

type SoundOut = () => { ctx: BaseAudioContext; out: AudioNode } | null;

/**
 * The menu while surfing, in the front end's look: the game dimmed under a scrim, "Paused" and two rows on the left
 * (Keep surfing, Back to the dune), the legend bottom-right. Keys, pads and the mouse all drive it.
 */
export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly rows: HTMLElement[] = [];
  private readonly legend: Legend;
  private readonly input = new UiInput(window);
  private sounds: UiSounds | null = null;
  private state: MenuState = { focus: 0 };
  private device: Device = 'keyboard';
  private picked: MenuPick | null = null;
  private primed = false;
  private readonly settings;

  constructor(parent: HTMLElement, private readonly soundOut: SoundOut, storage: SettingsStorage | null) {
    this.settings = sanitizeFrontSettings(storage ? loadJson(storage, FRONT_SETTINGS_KEY) : null);
    this.root = mountFrontEndRoot(parent);
    this.root.classList.add('fe-pause');
    this.resize(window.innerWidth, window.innerHeight);
    const scrim = document.createElement('div');
    Object.assign(scrim.style, { position: 'absolute', inset: '-2px', background: 'rgba(7, 13, 17, 0.62)', pointerEvents: 'auto' });
    const col = document.createElement('div');
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
    this.legend = new Legend((a) => this.act(a));
    this.root.append(scrim, col, this.legend.el);
    this.render();
  }

  /** The choice once made (then the menu is done), else null. */
  update(): MenuPick | null {
    const { actions, device } = this.input.poll(performance.now());
    // The first poll only learns what's already held (the START or Esc that opened the menu).
    if (!this.primed) { this.primed = true; return this.picked; }
    if (actions.length) this.device = device;
    for (const a of actions) this.act(a);
    this.render();
    return this.picked;
  }

  resize(w: number, h: number): void {
    applyLayout(this.root, layoutFor(w, h, safeAreaFraction(this.settings)), this.settings);
  }

  close(): void {
    this.input.dispose();
    this.root.remove();
  }

  private act(a: Parameters<typeof stepMenu>[1]): void {
    if (this.picked) return;
    const r = stepMenu(this.state, a);
    this.state = r.state;
    if (r.moved) this.play('focus');
    if (r.pick) { this.picked = r.pick; this.play(r.pick === 'resume' ? 'back' : 'confirm'); }
    this.render();
  }

  private focus(i: number): void {
    if (i === this.state.focus) return;
    this.state = { focus: i };
    this.play('focus');
    this.render();
  }

  private play(s: 'focus' | 'confirm' | 'back'): void {
    if (!this.sounds) { const o = this.soundOut(); if (o) this.sounds = new UiSounds(o.ctx, o.out); }
    this.sounds?.play(s, { durS: 0.2 });
  }

  private render(): void {
    this.rows.forEach((r, i) => r.classList.toggle('is-focus', i === this.state.focus));
    this.legend.set([{ action: 'confirm', text: 'Choose' }, { action: 'back', text: 'Keep surfing' }], this.device);
  }
}
