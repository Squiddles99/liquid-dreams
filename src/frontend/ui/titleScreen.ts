// src/frontend/ui/titleScreen.ts: the title (surf-map hub spec §2): the surf chart close-up drifting with today's swell,
// the emblem and wordmark upper left, the main menu down the left (Surf · Online, locked · Settings · Quit on desktop).
// It sits above the loading cover; the game boots behind it. The first press starts the sound (App.titleSurf).
import type { SettingsStorage } from '../../dev/devSettings';
import { nowOf, todaysSetup } from '../conditionsSource';
import { safeAreaFraction } from '../frontSettings';
import { TITLE_LABELS, type TitleItem, stepTitle, titleItems } from '../titleMenu';
import { type Device, UiInput } from '../uiInput';
import { UiSounds } from '../uiSounds';
import { CapesChart } from './capesChart';
import { applyLayout, layoutFor, mountFrontEndRoot } from './layout';
import { Legend } from './legend';
import { SettingsController } from './settingsController';

type SoundOut = () => { ctx: BaseAudioContext; out: AudioNode } | null;

export class TitleScreen {
  private readonly root: HTMLElement;
  private readonly chart = new CapesChart({ view: 'title' });
  private readonly rows: HTMLElement[] = [];
  private readonly items: TitleItem[];
  private readonly legend: Legend;
  private readonly settingsCtl: SettingsController;
  private readonly input = new UiInput(window);
  private readonly toastEl = document.createElement('div');
  private toastTimer = 0;
  private sounds: UiSounds | null = null;
  private focus = 0;
  private device: Device = 'keyboard';
  private open = true;

  constructor(parent: HTMLElement, private readonly opts: { storage: SettingsStorage | null; soundOut: SoundOut; electron: boolean; onSurf: () => void }) {
    this.root = mountFrontEndRoot(parent);
    this.root.classList.add('fe-title-screen');
    this.items = titleItems(opts.electron);
    const logo = document.createElement('div'); logo.className = 'fe-title-logo';
    logo.innerHTML = `<img src="${import.meta.env.BASE_URL}loading/emblem.webp" alt=""><img src="${import.meta.env.BASE_URL}ui/logo-wordmark.svg" alt="Liquid Dreams">`;
    const col = document.createElement('div'); col.className = 'fe-title-rows';
    this.items.forEach((it, i) => {
      const row = document.createElement('div'); row.className = `fe-row fe-title-row${it === 'online' ? ' is-locked' : ''}`;
      row.dataset.hit = it;
      row.innerHTML = `<span class="fe-value">${TITLE_LABELS[it]}</span>${it === 'online' ? '<span class="fe-title-soon">COMING SOON</span>' : ''}`;
      row.addEventListener('pointerover', () => { this.focus = i; this.render(); });
      row.addEventListener('click', () => { this.focus = i; this.act('confirm'); });
      this.rows.push(row); col.appendChild(row);
    });
    this.toastEl.className = 'fe-toast';
    this.legend = new Legend((a) => this.act(a));
    this.settingsCtl = new SettingsController(this.root, opts.storage, () => this.resize(), this.legend);
    this.root.append(this.chart.el, logo, col, this.toastEl, this.legend.el);
    this.resize();
    const today = nowOf(todaysSetup(new Date()));
    void this.chart.load().then(() => this.chart.setConditions(today));
    window.addEventListener('resize', this.resize);
    this.render();
  }

  get isOpen(): boolean { return this.open; }

  private readonly resize = (): void => {
    const s = this.settingsCtl.settings;
    applyLayout(this.root, layoutFor(window.innerWidth, window.innerHeight, safeAreaFraction(s)), s);
  };

  /** Shown again (B on the map): presses made while hidden, the B among them, are dropped. */
  show(): void { this.input.poll(performance.now()); this.settingsCtl.reload(); this.open = true; this.root.style.display = ''; this.render(); }
  hide(): void { this.open = false; this.root.style.display = 'none'; }

  act(a: Parameters<typeof stepTitle>[1]): void {
    if (!this.open) return;
    if (this.settingsCtl.isOpen) { this.settingsCtl.act(a); this.render(); return; }
    const r = stepTitle({ focus: this.focus }, a, this.items);
    this.focus = r.state.focus;
    if (r.moved) this.play('focus');
    if (r.toast) { this.play('deny'); this.toast(r.toast); }
    if (r.pick === 'surf') { this.play('confirm'); this.hide(); this.opts.onSurf(); return; }
    if (r.pick === 'settings') { this.play('confirm'); this.settingsCtl.open(); }
    if (r.pick === 'quit') window.close();
    this.render();
  }

  private toast(text: string): void {
    this.toastEl.textContent = text; this.toastEl.classList.add('is-on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('is-on'), 1800);
  }

  private play(kind: 'focus' | 'confirm' | 'deny'): void {
    const out = this.opts.soundOut();
    if (!out) return;
    this.sounds ??= new UiSounds(out.ctx, out.out);
    this.sounds.play(kind === 'deny' ? 'back' : kind);
  }

  private render(): void {
    this.rows.forEach((r, i) => r.classList.toggle('is-focus', i === this.focus));
    this.legend.set(this.settingsCtl.isOpen ? [{ action: 'back', text: 'Back' }] : [{ action: 'confirm', text: 'Select' }], this.device);
  }

  update(nowMs: number): void {
    if (!this.open) return;
    const { actions, device } = this.input.poll(nowMs);
    if (device) this.device = device;
    for (const a of actions) this.act(a);
    this.chart.update(nowMs);
  }
}
