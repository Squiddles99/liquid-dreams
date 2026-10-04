import { ARROW_FOR, type Bindings, currentBindings } from './bindings';
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

/** Looking around (Andrew 2026-10-04): the right stick's rate at full tilt (degrees per second), and a mouse drag's. */
export const STICK_LOOK_DEG_S = { yaw: 150, pitch: 90 };
export const MOUSE_LOOK_DEG_PX = 0.18;

const dead = (v: number): number => (Math.abs(v) < STICK_DEADZONE ? 0 : (v - Math.sign(v) * STICK_DEADZONE) / (1 - STICK_DEADZONE));

/**
 * The player's bindings (bindings.ts). Defaults: keyboard W/↑ paddle (stand tall riding), S/↓ crouch, A/D or ←/→ steer,
 * Space pop up; pad (standard mapping) left stick steer, RT paddle / stand tall, LT crouch, A pop up. The arrow keys and
 * the left stick always work.
 */
export function rideControls(keys: RideKeys, pad: PadState | null, edges: PadEdges, b: Bindings = currentBindings()): RideControls {
  const k = (a: keyof typeof b.keys): boolean => keys.isDown(b.keys[a]) || (!!ARROW_FOR[a] && keys.isDown(ARROW_FOR[a]!));
  const stick = pad ? dead(pad.axes[0] ?? 0) : 0;
  const held = (i: number): number => pad?.values[i] ?? (pad?.pressed[i] ? 1 : 0);
  const steer = (k('right') ? 1 : 0) - (k('left') ? 1 : 0) + stick;
  const paddle = k('paddle') || held(b.pad.paddle) > 0.3;
  const crouch = (k('crouch') ? 1 : 0) + held(b.pad.crouch) - (paddle ? 1 : 0);
  const popup = keys.consumePressed(b.keys.popup) || edges.pressed(pad, b.pad.popup);
  return { paddle, steer: Math.max(-1, Math.min(1, steer)), crouch: Math.max(-1, Math.min(1, crouch)), popup };
}

/** The look this frame: the right stick (axes 2, 3: right turns right, up looks up) plus a mouse drag (px). */
export function lookFrom(pad: PadState | null, mouse: { dx: number; dy: number }, dt: number): { yawDeg: number; pitchDeg: number } {
  const sx = pad ? dead(pad.axes[2] ?? 0) : 0, sy = pad ? dead(pad.axes[3] ?? 0) : 0;
  return {
    yawDeg: sx * STICK_LOOK_DEG_S.yaw * dt + mouse.dx * MOUSE_LOOK_DEG_PX,
    pitchDeg: -sy * STICK_LOOK_DEG_S.pitch * dt - mouse.dy * MOUSE_LOOK_DEG_PX,
  };
}
