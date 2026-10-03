import type { RideControls } from './ridePhysics';

/** What the keys and a pad say this frame (first-ride spec §3). */
export interface RideKeys {
  isDown(code: string): boolean;
  consumePressed(code: string): boolean;
}

/** The first standard-mapping pad's axes and buttons, or null. */
export interface PadState {
  axes: readonly number[];
  pressed: readonly boolean[];
  values: readonly number[];
}

export const STICK_DEADZONE = 0.15;

export function readPad(): PadState | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (p && p.connected) return { axes: p.axes, pressed: p.buttons.map((b) => b.pressed), values: p.buttons.map((b) => b.value) };
  }
  return null;
}

/** Rising edges of the pad's buttons, so a held button pops up once. */
export class PadEdges {
  private last: boolean[] = [];
  pressed(pad: PadState | null, i: number): boolean {
    const now = pad?.pressed[i] === true, was = this.last[i] === true;
    this.last[i] = now;
    return now && !was;
  }
}

const dead = (v: number): number => (Math.abs(v) < STICK_DEADZONE ? 0 : (v - Math.sign(v) * STICK_DEADZONE) / (1 - STICK_DEADZONE));

/**
 * Keyboard: W/↑ paddle (stand tall riding), S/↓ crouch, A/D or ←/→ steer, Space pop up.
 * Pad (standard mapping): left stick steer, right trigger (7) paddle / stand tall, left trigger (6) crouch, A (0) pop up.
 */
export function rideControls(keys: RideKeys, pad: PadState | null, edges: PadEdges): RideControls {
  const k = (...codes: string[]): boolean => codes.some((c) => keys.isDown(c));
  const stick = pad ? dead(pad.axes[0] ?? 0) : 0;
  const rt = pad?.values[7] ?? 0, lt = pad?.values[6] ?? 0;
  const steer = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0) + stick;
  const paddle = k('KeyW', 'ArrowUp') || rt > 0.3;
  const crouch = (k('KeyS', 'ArrowDown') ? 1 : 0) + lt - (paddle ? 1 : 0);
  const popup = keys.consumePressed('Space') || edges.pressed(pad, 0);
  return { paddle, steer: Math.max(-1, Math.min(1, steer)), crouch: Math.max(-1, Math.min(1, crouch)), popup };
}
