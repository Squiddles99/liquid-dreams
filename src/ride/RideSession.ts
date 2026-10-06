import type { CameraPose } from '../dev/momentLink';
import { type Bindings, currentBindings, keyLabel } from './bindings';
import { PadEdges, type RideKeys, lookFrom, readPad, rideControls } from './rideInput';
import { type RideBody, type RideEvent, type RideTuning, POPUP_S, TUNING, speedOf, startBody, stepRide } from './ridePhysics';
import { type LookInput, RideCamera, rideBoardFrame, rideSurferParams } from './ridePose';
import type { WaterFn } from './water';

/** Longest physics step (s): a slow frame is split into steps no longer than this. */
export const MAX_STEP_S = 1 / 60;
const MAX_STEPS = 4;

/** What happened, in the player's keys. */
export function rideMessage(e: RideEvent, b: Bindings = currentBindings()): string {
  const k = (a: keyof Bindings['keys']): string => keyLabel(b.keys[a]);
  const messages: Record<RideEvent, string> = {
    caught: `You're on it: ${k('popup')} to pop up!`,
    popup: 'Up!',
    tooSoon: `Not yet: paddle (${k('paddle')}) as the wave lifts your tail`,
    wipeout: 'Wiped out!',
    kickout: 'Ride over',
    reset: 'Next wave',
    aground: `Washed up on the shallows: ${k('next')} for the next wave`,
  };
  return messages[e];
}

function hint(phase: RideBody['phase'], b: Bindings): string {
  const k = (a: keyof Bindings['keys']): string => keyLabel(b.keys[a]);
  if (phase === 'paddle') return `${k('paddle')} paddle · ${k('left')}/${k('right')} turn · ${k('popup')} pop up · ${k('next')} next wave · Esc menu`;
  if (phase === 'ride') return `${k('left')}/${k('right')} carve · ${k('crouch')} crouch · ${k('paddle')} stand tall`;
  return '';
}

/** The playable ride (first-ride spec): the board's physics, its controls, the chase camera and a crude HUD. */
export class RideSession {
  body: RideBody | null = null;
  /** The Experience setting's tuning for this ride (R1 §3), set at begin(). */
  tune: RideTuning = TUNING.intermediate;
  private readonly camera = new RideCamera();
  private readonly edges = new PadEdges();
  private readonly hud: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.hud = document.createElement('div');
    Object.assign(this.hud.style, {
      position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', padding: '6px 14px',
      font: '600 14px system-ui, sans-serif', color: '#fff', background: 'rgba(0,0,0,0.35)', borderRadius: '6px',
      pointerEvents: 'none', display: 'none', whiteSpace: 'nowrap', textShadow: '0 1px 2px #000',
    });
    parent.appendChild(this.hud);
  }

  get active(): boolean {
    return this.body !== null;
  }

  begin(x: number, z: number, headingDeg: number, water: WaterFn, tune: RideTuning = TUNING.intermediate): void {
    this.body = startBody(x, z, headingDeg, water);
    this.tune = tune;
    this.camera.reset();
    this.hud.style.display = '';
  }

  end(): void {
    this.body = null;
    this.hud.style.display = 'none';
  }

  /** One frame: the controls, the physics (split into short steps), the HUD. Returns the last thing that happened. */
  step(dt: number, keys: RideKeys, water: WaterFn): RideEvent | null {
    const b = this.body;
    if (!b) return null;
    const pad = readPad();
    // The next wave of the set (R by default; the app moves the clock, then calls begin()).
    const bindings = currentBindings();
    if (keys.consumePressed(bindings.keys.next) || this.edges.pressed(pad, bindings.pad.next)) return 'reset';
    const c = rideControls(keys, pad, this.edges, bindings);
    let event: RideEvent | null = null;
    const n = Math.min(MAX_STEPS, Math.ceil(dt / MAX_STEP_S));
    for (let i = 0; i < n && dt > 0; i++) {
      const e = stepRide(b, i === 0 ? c : { ...c, popup: false }, water, dt / n, this.tune);
      if (e) event = e;
    }
    const kmh = Math.round(speedOf(b) * 3.6);
    this.hud.textContent = `${kmh} km/h   ${hint(b.phase, bindings)}`;
    return event;
  }

  /**
   * The camera this frame; `mouse` is the drag since the last frame (px), the right stick is read here; `cover`: how far
   * she is under a curl (tubeCover), for the over-the-shoulder camera.
   */
  cameraPose(dt: number, water: WaterFn, mouse: { dx: number; dy: number } = { dx: 0, dy: 0 }, cover = 0): CameraPose | null {
    if (!this.body) return null;
    const look: LookInput = lookFrom(readPad(), mouse, dt);
    return this.camera.update(this.body, dt, (x, z) => water(x, z).y, look, cover);
  }

  surfer(bodyboard = false): ReturnType<typeof rideSurferParams> | null {
    return this.body ? rideSurferParams(this.body, POPUP_S, bodyboard) : null;
  }

  boardFrame(): ReturnType<typeof rideBoardFrame> | null {
    return this.body ? rideBoardFrame(this.body) : null;
  }
}
