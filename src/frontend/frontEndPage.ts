// src/frontend/frontEndPage.ts: the front end in the page (class FrontEnd): the DOM, input, sounds and the core.
import type { SettingsStorage } from '../dev/devSettings';
import { PRESETS } from '../surfer/presets';
import type { FrontAction, FrontState } from './frontEnd';
import { type CoreCue, type FrontEndHost, FrontEndCore } from './frontEndCore';
import { DEFAULT_FRONT_SETTINGS, FRONT_CHOICES_KEY, type FrontSettings, loadJson, safeAreaFraction, sanitizeChoices } from './frontSettings';
import { SettingsController } from './ui/settingsController';
import { gearView } from './gearView';
import { BreakMap } from './ui/breakMap';
import { ControlsPage } from './ui/controlsPage';
import { ConditionsPanel } from './ui/conditionsPanel';
import { GearPanel } from './ui/gearPanel';
import { applyLayout, layoutFor, mountFrontEndRoot } from './ui/layout';
import { Legend, legendFor } from './ui/legend';
import { RiderLine } from './ui/riderLine';
import { RIDER_HALF_W, RIDER_STAND } from './backdrop/backdropMath';
import { SlidePanel } from './ui/slidePanel';
import { SurfMapPanel } from './ui/surfMapPanel';
import { BreakDetails } from './ui/breakDetails';
import { type Device, UiInput } from './uiInput';
import { UiSounds, hapticPulse } from './uiSounds';

/** Each beat's title and its place in the three (spec §2's titles; the mockup's progress pips). Conditions' title is in its panel. */
const BEAT_HEAD: Record<'conditions' | 'rider' | 'gear', { title: string | null; pips: number }> = {
  conditions: { title: null, pips: 1 }, rider: { title: 'Choose your rider', pips: 2 }, gear: { title: 'Grab your gear', pips: 3 },
};

/** The beat's progress pips (top-left in the safe area) and, for the rider and gear beats, its title under them. */
function beatHead(beat: 'conditions' | 'rider' | 'gear'): HTMLElement {
  const head = document.createElement('div'), pips = document.createElement('div');
  Object.assign(pips.style, { position: 'absolute', left: 'var(--fe-safe-x)', top: 'var(--fe-safe-y)', display: 'flex', gap: '8px' });
  for (let k = 1; k <= 3; k++) {
    const i = document.createElement('i');
    Object.assign(i.style, { display: 'block', width: '34px', height: '5px', background: k <= BEAT_HEAD[beat].pips ? 'var(--fe-sun)' : 'rgba(247, 236, 210, 0.35)' });
    pips.appendChild(i);
  }
  head.appendChild(pips);
  const title = BEAT_HEAD[beat].title;
  if (title) {
    const h = document.createElement('h1');
    h.className = 'fe-title';
    Object.assign(h.style, { position: 'absolute', left: 'var(--fe-safe-x)', top: 'calc(var(--fe-safe-y) + 40px)' });
    h.textContent = title;
    head.appendChild(h);
  }
  return head;
}

type SoundHooks = { uiOut(): { ctx: BaseAudioContext; out: AudioNode } | null; setFrontEndMusic(on: boolean): void };

export class FrontEnd {
  private root: HTMLElement | null = null;
  private core: FrontEndCore | null = null;
  private input: UiInput | null = null;
  private sounds: UiSounds | null = null;
  private device: Device = 'keyboard';
  private beatEls: Record<'map' | 'conditions' | 'rider' | 'gear', HTMLElement> | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private parts: { surf: SurfMapPanel; details: BreakDetails; cond: ConditionsPanel; map: BreakMap; slide: SlidePanel; gear: GearPanel; legend: Legend; line: RiderLine; bottom: HTMLElement } | null = null;
  private shownBeat: string | null = null;
  /** Black over everything until the crew have loaded and the land is ready (no boards floating without riders). */
  /** While the loading cover is up, key presses are read and dropped, so nothing changes under it (loading screens §2). */
  inputHeld = false;
  /** The Settings overlay and the settings it edits (shared with the title). */
  private settingsCtl: SettingsController | null = null;
  /** The Controls page (View or C, on any beat): the drawn pad and keys, and remapping. */
  private controlsPage: ControlsPage | null = null;
  private size = { w: window.innerWidth, h: window.innerHeight };
  readonly today = new Date();

  constructor(private readonly host: FrontEndHost, private readonly parent: HTMLElement, private readonly sound: SoundHooks, private readonly storage: SettingsStorage | null) {}

  private get settings(): FrontSettings {
    return this.settingsCtl?.settings ?? DEFAULT_FRONT_SETTINGS;
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** The state machine's state while open (dev checks drive the beats with it). */
  get state(): FrontState | null {
    return this.core?.state ?? null;
  }

  /** One action, as if pressed (dev checks). */
  act(a: FrontAction): void {
    if (this.core) this.route(a, performance.now());
  }

  /** The Controls page while it's open (the self-tests read it). */
  get controls(): ControlsPage | null {
    return this.controlsPage?.isOpen ? this.controlsPage : null;
  }

  /** An action to whatever has the input: the Controls page, Settings, or the beats. */
  private route(a: FrontAction, now: number): void {
    if (this.controlsPage?.isOpen) {
      if (this.controlsPage.act(a) === 'closed') this.root?.classList.remove('is-controls-open');
    } else if (this.settingsCtl?.isOpen) this.settingsCtl.act(a);
    else this.cue(this.core!.act(a, now));
  }

  open(): void {
    if (this.root) return;
    this.root = mountFrontEndRoot(this.parent);
    const act = (a: Parameters<FrontEndCore['act']>[0]): void => this.cue(this.core!.act(a, performance.now()));
    const routed = (a: FrontAction): void => this.route(a, performance.now());
    const legend = new Legend((a) => routed(a));
    this.settingsCtl = new SettingsController(this.root, this.storage, () => this.applySettings(), legend, () => this.sounds);
    const saved = sanitizeChoices(this.storage ? loadJson(this.storage, FRONT_CHOICES_KEY) : null);
    this.core = new FrontEndCore(this.host, saved, { today: this.today, seed: Date.now() % 100000, calm: this.settings.calmMenus, storage: this.storage, source: this.settings.conditionsSource });
    const surf = new SurfMapPanel((p) => (p.kind === 'pin' ? this.cue(this.core!.pointer({ pin: p.id }, performance.now()))
      : p.kind === 'locked' ? this.toast('Real-time conditions: coming soon') : act(p.action)));
    void surf.load().then(() => { if (this.core) surf.render(this.core.state, this.today); });
    const details = new BreakDetails((a) => act(a));
    const cond = new ConditionsPanel((p) => (p.kind === 'focus' ? this.cue(this.core!.pointer({ row: p.row }, performance.now())) : act(p.action)));
    const slide = new SlidePanel((p) => (p.kind === 'rider' ? this.cue(this.core!.pointer({ rider: p.rider }, performance.now())) : act(p.action)));
    const gear = new GearPanel((p) => {
      if (p.kind === 'gear') this.cue(this.core!.pointer({ gear: p.index }, performance.now()));
      else if (p.kind === 'tab') this.cue(this.core!.pointer({ tab: p.tab }, performance.now()));
      else act(p.action);
    });
    const map = new BreakMap(), line = new RiderLine(), bottom = document.createElement('div');
    bottom.className = 'fe-scrim-bottom';
    void map.load().then(() => { const s = this.host.standSpot(); if (s) map.setLookout(s); map.setConditions(this.core!.state.setup, true); });
    const wrap = (...els: HTMLElement[]): HTMLElement => { const d = document.createElement('div'); d.append(...els); return d; };
    this.beatEls = { map: wrap(surf.el, details.el), conditions: wrap(cond.el, map.el, beatHead('conditions')), rider: wrap(slide.el, beatHead('rider')), gear: wrap(gear.el, beatHead('gear')) };
    this.root.append(bottom, this.beatEls.map, this.beatEls.conditions, this.beatEls.rider, this.beatEls.gear, line.el, legend.el);
    this.parts = { surf, details, cond, map, slide, gear, legend, line, bottom };
    this.input = new UiInput(window);
    this.sound.setFrontEndMusic(true);
    this.resize(this.size.w, this.size.h);
  }

  /** Back from the title (its Surf): drops the press it saw. */
  resume(): void {
    this.dropInput();
    this.settingsCtl?.reload(); // the title's Settings may have changed them
  }

  /** Drops input seen so far (the title's Surf press must not also press Surf here on the map). */
  dropInput(): void {
    this.input?.poll(performance.now());
  }

  resize(w: number, h: number): void {
    this.size = { w, h };
    if (this.root) applyLayout(this.root, layoutFor(w, h, safeAreaFraction(this.settings)), this.settings);
  }

  update(dtS: number): void {
    if (!this.root || !this.core || !this.parts || !this.input) return;
    const now = performance.now(), polled = this.input.poll(now);
    const { device } = polled, actions = this.inputHeld ? [] : polled.actions;
    if (actions.length) this.device = this.settings.glyphs === 'auto' ? device : this.settings.glyphs;
    this.controlsPage?.setDevice(this.device);
    this.controlsPage?.update();
    for (const a of actions) this.route(a, now);
    this.cue(this.core.update(dtS, now));
    this.render(now);
    if (this.core.state.beat === 'out') this.close();
  }

  close(): void {
    this.input?.dispose();
    this.controlsPage?.dispose();
    this.controlsPage = null;
    this.root?.remove();
    this.host.stage(null, null);
    this.sound.setFrontEndMusic(false);
    this.root = this.core = this.input = this.parts = this.beatEls = this.toastEl = null;
    window.clearTimeout(this.toastTimer);
    this.settingsCtl = null;
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
        if (e.kind === 'value' || e.kind === 'roll' || e.kind === 'surfHere') this.parts.map.setConditions(this.core.state.setup, calm);
        // A mate's tease when the focus lands on a bikini or boardies in the WA winter (spec §9).
        if (e.kind === 'gear' && e.tab === 'outfit') {
          const s = this.core.state, line = gearView(s, this.today, Math.floor(performance.now())).line;
          if (line.speaker !== PRESETS[s.rider].nickname) this.parts.line.show(line.speaker, line.text, performance.now());
        }
        if (e.kind === 'source' && this.settingsCtl) this.settingsCtl.set({ ...this.settingsCtl.settings, conditionsSource: e.source });
        if (e.kind === 'locked') this.toast('Real-time conditions: coming soon');
      }
    }
    if (c.settings) this.settingsCtl?.open();
    if (c.controls) this.openControls();
  }

  /** The Controls page over everything, on the tab of the device last used. */
  private openControls(): void {
    if (!this.root || this.settingsCtl?.isOpen) return;
    if (!this.controlsPage) {
      this.controlsPage = new ControlsPage((s) => this.sounds?.play(s, { durS: 0.2 }));
      this.root.appendChild(this.controlsPage.el);
    }
    this.sounds?.play('confirm', { durS: 0.2 });
    this.controlsPage.open(this.device);
    this.root.classList.add('is-controls-open');
    if (this.parts) this.root.appendChild(this.parts.legend.el); // the legend stays above the page's scrim
  }

  /** A short message at the top (locked items: Real-time), gone after 1.8 s. */
  toast(text: string): void {
    if (!this.root) return;
    if (!this.toastEl) { this.toastEl = document.createElement('div'); this.toastEl.className = 'fe-toast'; this.root.appendChild(this.toastEl); }
    this.toastEl.textContent = text;
    this.toastEl.classList.add('is-on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl?.classList.remove('is-on'), 1800);
  }

  /** A settings change (saved by the controller): the layout re-applied (text size, safe area), calm passed on, glyphs overridden. */
  private applySettings(): void {
    this.resize(this.size.w, this.size.h);
    this.core?.setCalm(this.settings.calmMenus);
    if (this.settings.glyphs !== 'auto') this.device = this.settings.glyphs;
  }

  private render(now: number): void {
    const s = this.core!.state, p = this.parts!, calm = this.settings.calmMenus;
    const visibleBeat = s.move ? (s.move.t >= 0.7 ? s.move.to : s.move.t < 0.18 ? s.move.from : null) : s.beat;
    if (visibleBeat !== this.shownBeat) {
      for (const [k, el] of Object.entries(this.beatEls!)) {
        const on = k === visibleBeat;
        el.style.transition = on ? `opacity ${calm ? 200 : 280}ms cubic-bezier(0.33, 1, 0.68, 1)` : `opacity ${calm ? 200 : 180}ms cubic-bezier(0.32, 0, 0.67, 0)`;
        el.style.opacity = on ? '1' : '0';
        el.classList.toggle('fe-beat-off', !on);
      }
      this.root?.classList.toggle('is-map', visibleBeat === 'map');
      this.shownBeat = visibleBeat;
    }
    if (visibleBeat === 'map' || s.beat === 'map') { p.surf.render(s, this.today); p.surf.update(now); p.details.render(s, this.today); const m = p.details.maxStep; if (m !== null) this.core!.setDetailsMax(m); }
    p.cond.render(s, this.today);
    p.cond.update(now);
    p.slide.setDevice(this.device);
    p.slide.render(s, calm);
    if (s.beat === 'gear') p.gear.render(gearView(s, this.today, 1), this.device, calm);
    // The legend follows the beat on screen: mid-swing (no beat's UI showing) it's empty, then the new beat's.
    if (this.controlsPage?.isOpen) {
      const l = this.controlsPage.legend(this.device);
      p.legend.set(l.entries, l.device);
    } else {
      const legend = this.settingsCtl?.isOpen ? [{ action: 'back' as const, text: 'Back' }] : visibleBeat ? legendFor({ ...s, beat: visibleBeat }) : [];
      p.legend.set(legend, this.device);
    }
    p.line.update(now);
    // Grab your gear: over the sky under the title, ending 24 px short of the painted rider's widest outline (T-Bone and
    // his pack reach RIDER_HALF_W left of the figure's centre), so a mate's line never crosses the rider's face (Andrew
    // 2026-10-08). Conditions: over the water, as the mockup.
    const pos = s.beat === 'gear'
      ? { left: 'var(--fe-safe-x)', top: '24vh', maxWidth: `calc(${((RIDER_STAND.centreU - RIDER_HALF_W) * 100).toFixed(2)}vw - var(--fe-safe-x) - 24px)` }
      : { left: '760px', top: '438px', maxWidth: '760px' };
    Object.assign(p.line.el.style, pos);
  }
}
