import { wrapDegrees } from '../conditions/sanitize';

export interface Look {
  /** Compass bearing (0 = north, 90 = east). */
  yawDeg: number;
  pitchDeg: number;
}

export const MAX_PITCH_DEG = 89;
export const DEFAULT_DEG_PER_PIXEL = 0.12;
const DEG = Math.PI / 180;

export function applyMouseLook(look: Look, dx: number, dy: number, degPerPixel = DEFAULT_DEG_PER_PIXEL): Look {
  return {
    yawDeg: wrapDegrees(look.yawDeg + dx * degPerPixel),
    pitchDeg: Math.max(-MAX_PITCH_DEG, Math.min(MAX_PITCH_DEG, look.pitchDeg - dy * degPerPixel)),
  };
}

export function lookDirection(look: Look): [number, number, number] {
  const yaw = look.yawDeg * DEG, pitch = look.pitchDeg * DEG;
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}
