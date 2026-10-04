// src/frontend/ui/controlsPage.ts: the Controls page (Andrew 2026-10-04), over the pause menu or the select screen: the
// title and the Controller / Keyboard tabs top-left, the tab's drawing with its callouts, and the remap list.
import { ACTION_LABELS, type Bindings, BINDABLE_BUTTONS, currentBindings, keyLabel, setBindings } from '../../ride/bindings';
import { type Callout, type PadFamily, controllerArt, keyboardArt } from '../controlsArt';
import { type ControlsState, type ControlsTab, type Heard, heard, openControls, remapRows, stepControls } from '../controlsMenu';
import type { FrontAction } from '../frontEnd';
import { buttonGlyph, keyCapGlyph } from '../glyphs';
import type { Device } from '../uiInput';
import type { LegendEntry } from './legend';

type Sound = (s: 'focus' | 'confirm' | 'back') => void;

/** What the page did with an action: closed itself, used it, or left it (START: the host's to take). */
export type ControlsResult = 'closed' | 'handled' | 'ignored';

export class ControlsPage {
  readonly el = document.createElement('div');
  private state: ControlsState | null = null;
  private bindings: Bindings = currentBindings();
  private family: PadFamily = 'xbox';
  private readonly tabs = new Map<ControlsTab, HTMLElement>();
  private readonly art = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly listCol = document.createElement('div');
  private readonly note = document.createElement('div');
  private artKey = '';
  private listKey = '';
  /** Listening: the key heard since the last update, the keys held, the buttons held when listening began. */
  private heardKey: string | null = null;
  private readonly keysDown = new Set<string>();
  private padBefore = new Set<number>();
  /** After a press is taken (or the listening began), the UI's own actions wait until every key and button is up. */
  private swallow = false;

  constructor(private readonly sound: Sound) {
    this.el.className = 'fe-controls';
    const scrim = document.createElement('div');
    scrim.className = 'fe-controls-scrim';
    const head = document.createElement('div');
    head.className = 'fe-controls-head';
    const title = document.createElement('h1');
    title.className = 'fe-title';
    title.textContent = 'Controls';
    const tabs = document.createElement('div');
    tabs.className = 'fe-tabs';
    for (const [id, label] of [['pad', 'Controller'], ['keys', 'Keyboard']] as const) {
      const tab = document.createElement('span');
      tab.className = 'fe-tab';
      tab.dataset.hit = `tab-${id}`;
      tab.textContent = label;
      tab.addEventListener('click', () => { if (this.state && this.state.mode !== 'listen' && this.state.tab !== id) this.act('tabPlus'); });
      this.tabs.set(id, tab);
      tabs.appendChild(tab);
    }
    head.append(title, tabs);
    this.art.className = 'fe-art';
    this.listCol.className = 'fe-remap';
    this.note.className = 'fe-small fe-remap-note';
    this.listCol.append(this.list, this.note);
    this.el.append(scrim, this.art, this.listCol, head);
    this.el.style.display = 'none';
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
  }

  get isOpen(): boolean {
    return this.state !== null;
  }

  /** The tab the page is on (the self-tests read it). */
  get tab(): ControlsTab | null {
    return this.state?.tab ?? null;
  }

  get mode(): ControlsState['mode'] | null {
    return this.state?.mode ?? null;
  }

  /** Opens on the tab of the device last used. */
  open(device: Device): void {
    this.bindings = currentBindings();
    this.setDevice(device);
    this.state = openControls(device === 'keyboard' ? 'keys' : 'pad');
    this.swallow = true;
    this.el.style.display = '';
    this.render();
  }

  close(): void {
    this.state = null;
    this.el.style.display = 'none';
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.el.remove();
  }

  setDevice(device: Device): void {
    if (device !== 'keyboard') this.family = device;
  }

  /** One UI action. While a press is being taken (and until it's let go) the UI's actions are dropped. */
  act(a: FrontAction): ControlsResult {
    if (!this.state) return 'ignored';
    if (a === 'start') return this.state.mode === 'listen' ? 'handled' : 'ignored';
    if (this.swallow) return 'handled';
    const r = stepControls(this.state, a, this.bindings);
    this.apply(r.state, r.bindings, r.sound);
    if (r.state.mode === 'listen' && this.state?.mode === 'listen') this.beginListening();
    if (r.closed) { this.close(); return 'closed'; }
    return 'handled';
  }

  /** Each frame: a key or button heard while listening, and whether everything has been let go. */
  update(): void {
    if (!this.state) { this.heardKey = null; return; }
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].filter((g) => g?.connected) : [];
    const held = new Set<number>();
    for (const g of pads) g!.buttons.forEach((btn, i) => { if (btn.pressed) held.add(i); });
    if (this.state.mode === 'listen') {
      let h: Heard | null = null;
      if (this.heardKey) h = this.heardKey === 'Escape' ? 'cancel' : this.state.tab === 'keys' ? { key: this.heardKey } : null;
      if (!h && this.state.tab === 'pad') {
        const fresh = [...held].filter((i) => !this.padBefore.has(i));
        const pick = fresh.find((i) => BINDABLE_BUTTONS.includes(i)) ?? fresh[0];
        if (pick !== undefined) h = pick === 9 ? 'cancel' : { button: pick };
      }
      if (h) {
        const r = heard(this.state, h, this.bindings, this.family);
        this.apply(r.state, r.bindings, r.sound);
        this.swallow = true;
      }
      this.padBefore = held;
    }
    this.heardKey = null;
    if (this.swallow && this.keysDown.size === 0 && held.size === 0) this.swallow = false;
  }

  /** The legend for the page, and the device its glyphs are for (listening for a key shows Esc, for a button START). */
  legend(device: Device): { entries: LegendEntry[]; device: Device } {
    const s = this.state;
    if (!s) return { entries: [], device };
    const other = s.tab === 'pad' ? 'Keyboard' : 'Controller';
    if (s.mode === 'listen') return s.tab === 'keys' ? { entries: [{ action: 'back', text: 'Cancel' }], device: 'keyboard' } : { entries: [{ action: 'start', text: 'Cancel' }], device: this.family };
    if (s.mode === 'remap') {
      const reset = remapRows(s.tab)[s.focus] === 'reset';
      return { entries: [{ action: 'tabPlus', text: other }, { action: 'confirm', text: reset ? 'Reset' : 'Change' }, { action: 'back', text: 'Done' }], device };
    }
    return { entries: [{ action: 'tabPlus', text: other }, { action: 'confirm', text: 'Remap' }, { action: 'back', text: 'Back' }], device };
  }

  private beginListening(): void {
    this.heardKey = null;
    this.swallow = true;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [];
    this.padBefore = new Set();
    for (const g of pads) g?.buttons.forEach((btn, i) => { if (btn.pressed) this.padBefore.add(i); });
  }

  private apply(state: ControlsState, bindings: Bindings, sound: 'focus' | 'confirm' | 'back' | null): void {
    this.state = state;
    if (bindings !== this.bindings) {
      this.bindings = bindings;
      setBindings(bindings);
    }
    if (sound) this.sound(sound);
    this.render();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keysDown.add(e.code);
    if (this.state?.mode === 'listen' && !e.repeat) {
      e.preventDefault();
      this.heardKey = e.code;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private render(): void {
    const s = this.state;
    if (!s) return;
    for (const [id, el] of this.tabs) el.classList.toggle('is-focus', id === s.tab);
    this.el.dataset.mode = s.mode;
    const artKey = `${s.tab}|${this.family}|${JSON.stringify(this.bindings)}`;
    if (artKey !== this.artKey) {
      this.artKey = artKey;
      const art = s.tab === 'pad' ? controllerArt(this.bindings, this.family) : keyboardArt(this.bindings);
      this.art.dataset.art = s.tab;
      this.art.innerHTML = art.svg;
      this.art.append(...art.callouts.map(calloutEl));
    }
    const listKey = `${artKey}|${s.mode}|${s.focus}`;
    if (listKey !== this.listKey) {
      this.listKey = listKey;
      this.list.replaceChildren(...remapRows(s.tab).map((row, i) => {
        const el = document.createElement('div');
        el.className = 'fe-row';
        el.dataset.hit = `remap-${row}`;
        el.style.gridTemplateColumns = '1fr auto';
        el.classList.toggle('is-focus', s.mode !== 'view' && i === s.focus);
        const label = document.createElement('span');
        label.className = 'fe-value';
        label.textContent = row === 'reset' ? 'Reset to defaults' : ACTION_LABELS[row];
        const bound = document.createElement('span');
        bound.className = 'fe-remap-bound';
        if (row !== 'reset') {
          if (s.mode === 'listen' && i === s.focus) {
            bound.className = 'fe-small fe-remap-listen';
            bound.textContent = s.tab === 'keys' ? 'Press a key' : 'Press a button';
          } else if (s.tab === 'keys') {
            bound.innerHTML = keyCapGlyph(keyLabel(this.bindings.keys[row]));
          } else {
            bound.innerHTML = buttonGlyph(this.bindings.pad[row as keyof Bindings['pad']], this.family);
          }
        }
        el.append(label, bound);
        el.addEventListener('pointerover', () => {
          if (!this.state || this.state.mode !== 'remap' || this.state.focus === i) return;
          this.apply({ ...this.state, focus: i }, this.bindings, 'focus');
        });
        el.addEventListener('click', () => {
          if (!this.state || this.state.mode !== 'remap') return;
          this.state = { ...this.state, focus: i };
          this.act('confirm');
        });
        return el;
      }));
    }
    this.note.textContent = s.note;
  }
}

/** One callout: the action over the control's name, its anchor edge at (x, y), y the action's middle. */
function calloutEl(c: Callout): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fe-callout';
  el.dataset.callout = c.text;
  Object.assign(el.style, {
    left: `${c.x}px`, top: `calc(${c.y}px - 16px * var(--fe-text))`,
    transform: c.align === 'right' ? 'translateX(-100%)' : c.align === 'center' ? 'translateX(-50%)' : '',
    alignItems: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start',
  });
  const text = document.createElement('span');
  text.className = 'fe-callout-text';
  text.textContent = c.text;
  el.appendChild(text);
  if (c.sub) {
    const sub = document.createElement('span');
    sub.className = 'fe-callout-sub';
    sub.textContent = c.sub;
    el.appendChild(sub);
  }
  return el;
}
