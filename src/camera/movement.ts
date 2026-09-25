import { type Look, lookDirection } from './look';

export interface MoveKeys {
  forward: boolean; back: boolean; left: boolean; right: boolean;
  up: boolean; down: boolean; fast: boolean; rise: boolean;
}

export const NO_KEYS: MoveKeys = Object.freeze({
  forward: false, back: false, left: false, right: false, up: false, down: false, fast: false, rise: false,
});

export const FAST_MULTIPLIER = 5;
const DEG = Math.PI / 180;

/** Horizontal movement relative to the yaw; diagonals normalised. */
export function planarMoveXZ(yawDeg: number, keys: MoveKeys, distance: number): { x: number; z: number } {
  const yaw = yawDeg * DEG;
  const fx = Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = Math.sin(yaw);
  let x = 0, z = 0;
  if (keys.forward) { x += fx; z += fz; }
  if (keys.back) { x -= fx; z -= fz; }
  if (keys.right) { x += rx; z += rz; }
  if (keys.left) { x -= rx; z -= rz; }
  const len = Math.hypot(x, z);
  return len === 0 ? { x: 0, z: 0 } : { x: (x / len) * distance, z: (z / len) * distance };
}

export interface FreeState {
  position: [number, number, number];
  look: Look;
  baseSpeedMs: number;
}

export function stepFree(s: FreeState, keys: MoveKeys, dt: number): FreeState {
  const speed = s.baseSpeedMs * (keys.fast ? FAST_MULTIPLIER : 1) * dt;
  const f = lookDirection(s.look);
  const yaw = s.look.yawDeg * DEG;
  const r = [Math.cos(yaw), 0, Math.sin(yaw)];
  const v = [0, 0, 0];
  const add = (d: number[], sign: number) => { v[0] += d[0] * sign; v[1] += d[1] * sign; v[2] += d[2] * sign; };
  if (keys.forward) add(f, 1);
  if (keys.back) add(f, -1);
  if (keys.right) add(r, 1);
  if (keys.left) add(r, -1);
  if (keys.up) v[1] += 1;
  if (keys.down) v[1] -= 1;
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return s;
  const k = speed / len;
  return { ...s, position: [s.position[0] + v[0] * k, s.position[1] + v[1] * k, s.position[2] + v[2] * k] };
}

/** Mouse wheel scales fly speed by 15% per notch, within [0.5, 500] m/s. */
export function adjustSpeed(baseSpeedMs: number, wheelDelta: number): number {
  if (wheelDelta === 0) return baseSpeedMs;
  return Math.min(500, Math.max(0.5, baseSpeedMs * (wheelDelta > 0 ? 1 / 1.15 : 1.15)));
}
