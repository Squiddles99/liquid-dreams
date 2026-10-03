// src/frontend/frontEndCore.ts: the front end without the DOM: the state machine, the world, the crew and the camera.
import type { Conditions } from '../conditions/types';
import type { SettingsStorage } from '../dev/devSettings';
import type { CameraPose } from '../dev/momentLink';
import type { LandSpot } from '../surfer/placement';
import type { PresetName } from '../surfer/presets';
import { conditionsShot, crewFor, easePose, gearShot, riderShot } from './beatCamera';
import { ConditionsGate } from './conditionsGate';
import { lineFor } from './conditionsView';
import { type Beat, type FrontAction, type FrontEvent, type FrontState, type SessionChoice, focusTo, initialFront, savedOf, step, tick } from './frontEnd';
import { FRONT_CHOICES_KEY, type SavedChoices, saveJson } from './frontSettings';
import { gearView } from './gearView';
import { toConditions } from './sessionSetup';
import { type GangStaging, PICK_S, TURN_S, stagingFor } from './staging';
import { type UiSound, soundFor } from './uiSounds';

export interface FrontEndHost {
  /** The stand spot; null until the land and its tracks have loaded. */
  standSpot(): LandSpot | null;
  groundAt(x: number, z: number): number | null;
  baseConditions(): Readonly<Conditions>;
  /** The heavy apply: the App's conditions edited (the spectrum, set waves, the sky). */
  applyConditions(c: Conditions): void;
  stage(staging: GangStaging | null, pose: CameraPose | null): void;
  paddleOut(choice: SessionChoice): void;
  /** Whether the crew's bodies have loaded (absent: always); the page veils the front end until they have. */
  crewReady?(): boolean;
}

export interface CoreCue {
  /** Everything the state machine said this call (the page layer animates from them). */
  events: FrontEvent[];
  sounds: UiSound[];
  line: { speaker: PresetName; text: string } | null;
  haptic: boolean;
  settings: boolean;
  landed: Beat | null;
}

const empty = (): CoreCue => ({ events: [], sounds: [], line: null, haptic: false, settings: false, landed: null });

export class FrontEndCore {
  private s: FrontState;
  private readonly gate = new ConditionsGate();
  private turnT = 1;
  private pickT = 0;
  private lineSeed = 0;
  private moveFrom: CameraPose | null = null;
  private calm: boolean;

  constructor(private readonly host: FrontEndHost, saved: SavedChoices, private readonly opts: { today: Date; seed: number; calm: boolean; storage: SettingsStorage | null }) {
    this.s = initialFront(saved);
    this.calm = opts.calm;
    this.lineSeed = opts.seed;
    // The world takes the shown conditions at once: the sky, sea and light match the panel from the first frame.
    host.applyConditions(toConditions(this.s.setup, host.baseConditions(), opts.today));
  }

  get state(): FrontState {
    return this.s;
  }

  setCalm(on: boolean): void {
    this.calm = on;
  }

  act(a: FrontAction, nowMs: number): CoreCue {
    const before = this.s;
    const r = step(this.s, a, { seed: this.opts.seed + Math.floor(nowMs), today: this.opts.today, calm: this.calm });
    this.s = r.state;
    return this.react(r.events, before, nowMs);
  }

  pointer(target: Parameters<typeof focusTo>[1], nowMs: number): CoreCue {
    const before = this.s, r = focusTo(this.s, target);
    this.s = r.state;
    return this.react(r.events, before, nowMs);
  }

  update(dtS: number, nowMs: number): CoreCue {
    const before = this.s, r = tick(this.s, dtS, { seed: this.opts.seed, today: this.opts.today, calm: this.calm });
    this.s = r.state;
    const cue = this.react(r.events, before, nowMs);
    if (this.gate.due(nowMs)) this.host.applyConditions(toConditions(this.s.setup, this.host.baseConditions(), this.opts.today));
    this.turnT = Math.min(1, this.turnT + dtS / (this.calm ? 0.2 : TURN_S));
    if (this.pickT > 0) this.pickT = this.pickT + dtS / PICK_S >= 1 ? 0 : this.pickT + dtS / PICK_S;
    this.stage();
    return cue;
  }

  private react(events: FrontEvent[], before: FrontState, nowMs: number): CoreCue {
    const cue = empty();
    cue.events = events;
    for (const e of events) {
      const snd = soundFor(e);
      if (snd) cue.sounds.push(snd);
      if (e.kind === 'value' || e.kind === 'roll') {
        this.gate.edit(nowMs);
        cue.line = lineFor(this.s, e.kind === 'value' ? e.row : 'swell', this.lineSeed++);
      }
      if (e.kind === 'end') this.gate.hold(nowMs);
      if (e.kind === 'move') {
        this.moveFrom = this.shot(before);
        if (e.from === 'conditions' && e.to === 'rider') this.turnT = 0;
        cue.haptic ||= e.to !== 'conditions';
      }
      if (e.kind === 'pick') { this.pickT = 1e-3; cue.haptic = true; }
      if (e.kind === 'chosen') cue.haptic = true;
      if (e.kind === 'landed') {
        cue.landed = e.beat;
        this.moveFrom = null;
        if (e.beat === 'gear') { const v = gearView(this.s, this.opts.today, this.lineSeed++); cue.line = { speaker: this.s.rider, text: v.line.text }; }
      }
      if (e.kind === 'settings') cue.settings = true;
      if (e.kind === 'paddleOut') {
        if (this.opts.storage) saveJson(this.opts.storage, FRONT_CHOICES_KEY, savedOf(this.s));
        this.host.applyConditions(toConditions(this.s.setup, this.host.baseConditions(), this.opts.today));
        this.host.paddleOut(e.choice);
      }
    }
    return cue;
  }

  /** The camera for a state's beat, or null before the land is ready. */
  private shot(s: FrontState): CameraPose | null {
    const stand = this.host.standSpot();
    if (!stand) return null;
    const ground = (x: number, z: number): number => this.host.groundAt(x, z) ?? 0;
    if (s.beat === 'conditions' || s.beat === 'out') return conditionsShot(stand, ground);
    const place = crewFor(s.beat === 'gear' ? 'gear' : 'rider', stand).find((p) => p.preset === s.rider)!;
    return s.beat === 'gear' ? gearShot(place, ground) : riderShot(place, ground);
  }

  private stage(): void {
    const stand = this.host.standSpot();
    if (!stand || this.s.beat === 'out') return;
    let pose = this.shot(this.s);
    if (this.s.move && this.moveFrom && pose) pose = easePose(this.moveFrom, pose, this.s.move.t);
    this.host.stage(stagingFor(this.s, stand, { turnT: this.turnT, pickT: this.pickT }), pose);
  }
}
