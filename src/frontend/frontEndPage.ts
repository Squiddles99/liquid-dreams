// src/frontend/frontEndPage.ts: the front end in the page (class FrontEnd): the DOM, input, sounds and the core.
import type { SettingsStorage } from '../dev/devSettings';
import { PRESETS } from '../surfer/presets';
import { type CoreCue, type FrontEndHost, FrontEndCore } from './frontEndCore';
import { DEFAULT_FRONT_SETTINGS, FRONT_CHOICES_KEY, FRONT_SETTINGS_KEY, type FrontSettings, loadJson, safeAreaFraction, sanitizeChoices, sanitizeFrontSettings } from './frontSettings';
import { gearView } from './gearView';
import { BreakMap } from './ui/breakMap';
import { ConditionsPanel } from './ui/conditionsPanel';
import { GearPanel } from './ui/gearPanel';
import { applyLayout, layoutFor, mountFrontEndRoot } from './ui/layout';
import { Legend, legendFor } from './ui/legend';
import { RiderLine } from './ui/riderLine';
import { SlidePanel } from './ui/slidePanel';
import { type Device, UiInput } from './uiInput';
import { UiSounds, hapticPulse } from './uiSounds';

type SoundHooks = { uiOut(): { ctx: BaseAudioContext; out: AudioNode } | null; setFrontEndMusic(on: boolean): void };

export class FrontEnd {
  private root: HTMLElement | null = null;
  private core: FrontEndCore | null = null;
  private input: UiInput | null = null;
  private sounds: UiSounds | null = null;
  private settings: FrontSettings = DEFAULT_FRONT_SETTINGS;
  private device: Device = 'keyboard';
  private beatEls: Record<'conditions' | 'rider' | 'gear', HTMLElement> | null = null;
  private parts: { cond: ConditionsPanel; map: BreakMap; slide: SlidePanel; gear: GearPanel; legend: Legend; line: RiderLine; bottom: HTMLElement } | null = null;
  private shownBeat: string | null = null;
  private size = { w: window.innerWidth, h: window.innerHeight };
  private readonly today = new Date();

  constructor(private readonly host: FrontEndHost, private readonly parent: HTMLElement, private readonly sound: SoundHooks, private readonly storage: SettingsStorage | null) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(): void {
    if (this.root) return;
    this.settings = sanitizeFrontSettings(this.storage ? loadJson(this.storage, FRONT_SETTINGS_KEY) : null);
    const saved = sanitizeChoices(this.storage ? loadJson(this.storage, FRONT_CHOICES_KEY) : null);
    this.core = new FrontEndCore(this.host, saved, { today: this.today, seed: Date.now() % 100000, calm: this.settings.calmMenus, storage: this.storage });
    this.root = mountFrontEndRoot(this.parent);
    const act = (a: Parameters<FrontEndCore['act']>[0]): void => this.cue(this.core!.act(a, performance.now()));
    const cond = new ConditionsPanel((p) => (p.kind === 'focus' ? this.cue(this.core!.pointer({ row: p.row }, performance.now())) : act(p.action)));
    const slide = new SlidePanel((p) => (p.kind === 'rider' ? this.cue(this.core!.pointer({ rider: p.rider }, performance.now())) : act(p.action)));
    const gear = new GearPanel((p) => (p.kind === 'gear' ? this.cue(this.core!.pointer({ gear: p.index }, performance.now())) : act(p.action)));
    const map = new BreakMap(), legend = new Legend((a) => act(a)), line = new RiderLine(), bottom = document.createElement('div');
    bottom.className = 'fe-scrim-bottom';
    void map.load().then(() => { const s = this.host.standSpot(); if (s) map.setLookout(s); map.setConditions(this.core!.state.setup, true); });
    const wrap = (...els: HTMLElement[]): HTMLElement => { const d = document.createElement('div'); d.append(...els); return d; };
    this.beatEls = { conditions: wrap(cond.el, map.el), rider: wrap(slide.el), gear: wrap(gear.el) };
    this.root.append(bottom, this.beatEls.conditions, this.beatEls.rider, this.beatEls.gear, line.el, legend.el);
    this.parts = { cond, map, slide, gear, legend, line, bottom };
    this.input = new UiInput(window);
    this.sound.setFrontEndMusic(true);
    this.resize(this.size.w, this.size.h);
  }

  resize(w: number, h: number): void {
    this.size = { w, h };
    if (this.root) applyLayout(this.root, layoutFor(w, h, safeAreaFraction(this.settings)), this.settings);
  }

  update(dtS: number): void {
    if (!this.root || !this.core || !this.parts || !this.input) return;
    const now = performance.now(), { actions, device } = this.input.poll(now);
    if (actions.length) this.device = this.settings.glyphs === 'auto' ? device : this.settings.glyphs;
    for (const a of actions) this.cue(this.core.act(a, now));
    this.cue(this.core.update(dtS, now));
    this.render(now);
    if (this.core.state.beat === 'out') this.close();
  }

  close(): void {
    this.input?.dispose();
    this.root?.remove();
    this.host.stage(null, null);
    this.sound.setFrontEndMusic(false);
    this.root = this.core = this.input = this.parts = this.beatEls = null;
    this.shownBeat = null;
  }

  private cue(c: CoreCue): void {
    if (!this.sounds) { const o = this.sound.uiOut(); if (o) this.sounds = new UiSounds(o.ctx, o.out); }
    for (const s of c.sounds) this.sounds?.play(s, { durS: this.settings.calmMenus ? 0.2 : 1.6 });
    if (c.haptic) hapticPulse();
    if (c.line && this.parts) this.parts.line.show(PRESETS[c.line.speaker].nickname, c.line.text, performance.now());
    if (this.parts && this.core) {
      const calm = this.settings.calmMenus;
      for (const e of c.events) {
        this.parts.cond.event(e, calm, performance.now(), this.today);
        if (e.kind === 'value' || e.kind === 'roll') this.parts.map.setConditions(this.core.state.setup, calm);
      }
    }
    if (c.settings) this.openSettings();
  }

  /** Task 23 fills this in. */
  private openSettings(): void {}

  private render(now: number): void {
    const s = this.core!.state, p = this.parts!, calm = this.settings.calmMenus;
    const visibleBeat = s.move ? (s.move.t >= 0.7 ? s.move.to : s.move.t < 0.18 ? s.move.from : null) : s.beat;
    if (visibleBeat !== this.shownBeat) {
      for (const [k, el] of Object.entries(this.beatEls!)) {
        const on = k === visibleBeat;
        el.style.transition = on ? `opacity ${calm ? 200 : 280}ms cubic-bezier(0.33, 1, 0.68, 1)` : `opacity ${calm ? 200 : 180}ms cubic-bezier(0.32, 0, 0.67, 0)`;
        el.style.opacity = on ? '1' : '0';
        el.style.pointerEvents = on ? '' : 'none';
      }
      this.shownBeat = visibleBeat;
    }
    p.cond.render(s, this.today);
    p.cond.update(now);
    p.slide.setDevice(this.device);
    p.slide.render(s, calm);
    if (s.beat === 'gear') p.gear.render(gearView(s, this.today, 1), this.device, calm);
    p.legend.set(legendFor(s), this.device);
    p.line.update(now);
    const pos = s.beat === 'gear' ? { left: '120px', top: '200px' } : { left: '760px', top: '520px' };
    Object.assign(p.line.el.style, pos);
  }
}
