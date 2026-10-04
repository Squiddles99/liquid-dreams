// src/frontend/frontEndPage.ts: the front end in the page (class FrontEnd): the DOM, input, sounds and the core.
import type { SettingsStorage } from '../dev/devSettings';
import { PRESETS } from '../surfer/presets';
import type { FrontAction, FrontState } from './frontEnd';
import { type CoreCue, type FrontEndHost, FrontEndCore } from './frontEndCore';
import { DEFAULT_FRONT_SETTINGS, FRONT_CHOICES_KEY, FRONT_SETTINGS_KEY, type FrontSettings, loadJson, safeAreaFraction, sanitizeChoices, sanitizeFrontSettings, saveJson } from './frontSettings';
import { SETTING_ROWS, type SettingRow, stepSetting } from './settingsView';
import { SettingsPanel } from './ui/settingsPanel';
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
  private settings: FrontSettings = DEFAULT_FRONT_SETTINGS;
  private device: Device = 'keyboard';
  private beatEls: Record<'conditions' | 'rider' | 'gear', HTMLElement> | null = null;
  private parts: { cond: ConditionsPanel; map: BreakMap; slide: SlidePanel; gear: GearPanel; legend: Legend; line: RiderLine; bottom: HTMLElement } | null = null;
  private shownBeat: string | null = null;
  /** Black over everything until the crew have loaded and the land is ready (no boards floating without riders). */
  /** While the loading cover is up, key presses are read and dropped, so nothing changes under it (loading screens §2). */
  inputHeld = false;
  /** The Settings overlay while it's open (Back + START), and its focused row. */
  private settingsPanel: SettingsPanel | null = null;
  private settingsFocus: SettingRow = 'textScale';
  private size = { w: window.innerWidth, h: window.innerHeight };
  private readonly today = new Date();

  constructor(private readonly host: FrontEndHost, private readonly parent: HTMLElement, private readonly sound: SoundHooks, private readonly storage: SettingsStorage | null) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** The state machine's state while open (dev checks drive the beats with it). */
  get state(): FrontState | null {
    return this.core?.state ?? null;
  }

  /** One action, as if pressed (dev checks). */
  act(a: FrontAction): void {
    if (this.core) this.cue(this.core.act(a, performance.now()));
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
    const gear = new GearPanel((p) => {
      if (p.kind === 'gear') this.cue(this.core!.pointer({ gear: p.index }, performance.now()));
      else if (p.kind === 'tab') this.cue(this.core!.pointer({ tab: p.tab }, performance.now()));
      else act(p.action);
    });
    const map = new BreakMap(), legend = new Legend((a) => act(a)), line = new RiderLine(), bottom = document.createElement('div');
    bottom.className = 'fe-scrim-bottom';
    void map.load().then(() => { const s = this.host.standSpot(); if (s) map.setLookout(s); map.setConditions(this.core!.state.setup, true); });
    const wrap = (...els: HTMLElement[]): HTMLElement => { const d = document.createElement('div'); d.append(...els); return d; };
    this.beatEls = { conditions: wrap(cond.el, map.el, beatHead('conditions')), rider: wrap(slide.el, beatHead('rider')), gear: wrap(gear.el, beatHead('gear')) };
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
    const now = performance.now(), polled = this.input.poll(now);
    const { device } = polled, actions = this.inputHeld ? [] : polled.actions;
    if (actions.length) this.device = this.settings.glyphs === 'auto' ? device : this.settings.glyphs;
    for (const a of actions) {
      if (this.settingsPanel) this.settingsAct(a);
      else this.cue(this.core.act(a, now));
    }
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
    this.settingsPanel = null;
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
        // A mate's tease when the focus lands on a bikini or boardies in the WA winter (spec §9).
        if (e.kind === 'gear' && e.tab === 'outfit') {
          const s = this.core.state, line = gearView(s, this.today, Math.floor(performance.now())).line;
          if (line.speaker !== PRESETS[s.rider].nickname) this.parts.line.show(line.speaker, line.text, performance.now());
        }
      }
    }
    if (c.settings) this.openSettings();
  }

  /** The Settings overlay over everything (spec §11). */
  private openSettings(): void {
    if (this.settingsPanel || !this.root) return;
    this.settingsPanel = new SettingsPanel();
    this.settingsFocus = 'textScale';
    this.root.appendChild(this.settingsPanel.el);
    this.root.classList.add('is-settings');
    if (this.parts) this.root.appendChild(this.parts.legend.el); // the legend stays above the overlay's scrim
    this.settingsPanel.render(this.settings, this.settingsFocus);
  }

  private closeSettings(): void {
    this.settingsPanel?.el.remove();
    this.settingsPanel = null;
    this.root?.classList.remove('is-settings');
  }

  /** While Settings is open: up and down move the focus (wrapping), left and right change the value, B or the chord closes. */
  private settingsAct(a: string): void {
    const panel = this.settingsPanel!, calm = this.settings.calmMenus;
    if (a === 'back' || a === 'settings') {
      this.sounds?.play('back');
      this.closeSettings();
      return;
    }
    if (a === 'up' || a === 'down') {
      const i = SETTING_ROWS.indexOf(this.settingsFocus), n = SETTING_ROWS.length;
      this.settingsFocus = SETTING_ROWS[(i + (a === 'down' ? 1 : -1) + n) % n];
      this.sounds?.play('focus');
    } else if (a === 'left' || a === 'right') {
      const dir = a === 'right' ? 1 : -1, r = stepSetting(this.settings, this.settingsFocus, dir);
      if (r.atEnd) {
        this.sounds?.play('end');
        panel.nudge(this.settingsFocus, dir, calm);
      } else {
        this.settings = r.settings;
        this.sounds?.play('value');
        panel.slide(this.settingsFocus, dir, calm);
        this.applySettings();
      }
    }
    panel.render(this.settings, this.settingsFocus);
  }

  /** A settings change: saved, the layout re-applied (text size, safe area), calm passed on, glyphs overridden. */
  private applySettings(): void {
    if (this.storage) saveJson(this.storage, FRONT_SETTINGS_KEY, this.settings);
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
        el.style.pointerEvents = on ? '' : 'none';
      }
      this.shownBeat = visibleBeat;
    }
    p.cond.render(s, this.today);
    p.cond.update(now);
    p.slide.setDevice(this.device);
    p.slide.render(s, calm);
    if (s.beat === 'gear') p.gear.render(gearView(s, this.today, 1), this.device, calm);
    // The legend follows the beat on screen: mid-swing (no beat's UI showing) it's empty, then the new beat's.
    const legend = this.settingsPanel ? [{ action: 'back' as const, text: 'Back' }] : visibleBeat ? legendFor({ ...s, beat: visibleBeat }) : [];
    p.legend.set(legend, this.device);
    p.line.update(now);
    // The mockup's spots: over the sea left of the panel in Grab your gear (ending 40 px short of its column, at any text
    // size), over the water in Conditions.
    const pos = s.beat === 'gear'
      ? { left: '700px', top: '250px', maxWidth: 'calc(100% - var(--fe-safe-x) - 600px * (0.6 + 0.4 * var(--fe-text)) - 740px)' }
      : { left: '760px', top: '438px', maxWidth: '760px' };
    Object.assign(p.line.el.style, pos);
  }
}
