import type { CameraPose } from '../dev/momentLink';
import { PadEdges, type RideKeys, readPad, rideControls } from './rideInput';
import { type RideBody, type RideEvent, POPUP_S, speedOf, startBody, stepRide } from './ridePhysics';
import { RideCamera, rideBoardFrame, rideSurferParams } from './ridePose';
import type { WaterFn } from './water';

/** Longest physics step (s): a slow frame is split into steps no longer than this. */
export const MAX_STEP_S = 1 / 60;
const MAX_STEPS = 4;

export const RIDE_MESSAGES: Record<RideEvent, string> = {
  caught: "You're on it: Space to pop up!",
  popup: 'Up!',
  tooSoon: 'Not yet: paddle (W) as the wave lifts your tail',
  wipeout: 'Wiped out!',
  kickout: 'Ride over',
  reset: 'Next wave',
  aground: 'Washed up on the shallows: R for the next wave',
};

const HINTS: Record<RideBody['phase'], string> = {
  paddle: 'W paddle · A/D turn · Space pop up · R next wave · Esc menu',
  popup: '',
  ride: 'A/D carve · S crouch · W stand tall',
  bail: '',
};

/** The playable ride (first-ride spec): the board's physics, its controls, the chase camera and a crude HUD. */
export class RideSession {
  body: RideBody | null = null;
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

  begin(x: number, z: number, headingDeg: number, water: WaterFn): void {
    this.body = startBody(x, z, headingDeg, water);
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
    // R: the next wave of the set (the app moves the clock, then calls begin()).
    if (keys.consumePressed('KeyR') || this.edges.pressed(pad, 1)) return 'reset';
    const c = rideControls(keys, pad, this.edges);
    let event: RideEvent | null = null;
    const n = Math.min(MAX_STEPS, Math.ceil(dt / MAX_STEP_S));
    for (let i = 0; i < n && dt > 0; i++) {
      const e = stepRide(b, i === 0 ? c : { ...c, popup: false }, water, dt / n);
      if (e) event = e;
    }
    const kmh = Math.round(speedOf(b) * 3.6);
    this.hud.textContent = `${kmh} km/h   ${HINTS[b.phase]}`;
    return event;
  }

  cameraPose(dt: number, water: WaterFn): CameraPose | null {
    return this.body ? this.camera.update(this.body, dt, (x, z) => water(x, z).y) : null;
  }

  surfer(bodyboard = false): ReturnType<typeof rideSurferParams> | null {
    return this.body ? rideSurferParams(this.body, POPUP_S, bodyboard) : null;
  }

  boardFrame(): ReturnType<typeof rideBoardFrame> | null {
    return this.body ? rideBoardFrame(this.body) : null;
  }
}
