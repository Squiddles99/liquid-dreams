import { SLICES } from './skyMapLayout';

type V3 = readonly [number, number, number];

/** The whole sky map is re-marched at once after the sun swings this far (a time scrub)… */
export const FULL_REFRESH_SUN_RAD = (0.5 * Math.PI) / 180;
/** …or the sim clock jumps this far (a moment link, a scrub of the clock)… */
export const FULL_REFRESH_TIME_S = 2;
/** …or the camera jumps this far in one frame (a teleport; the map is centred on it). Steady travel never triggers it. */
export const FULL_REFRESH_CAMERA_M = 200;
/** Camera motion below this in a frame leaves the map as it is (the lineup's bob). */
const CAMERA_STILL_M = 0.05;

export interface RefreshState {
  /** Set to force a full march (new weather, a self-test). */
  dirty: boolean;
  settle: number;
  lastTimeS: number;
  fullSun: V3;
  lastSun: V3;
  lastCamera: V3;
}

export interface RefreshInput {
  simTimeS: number;
  sun: V3;
  camera: V3;
}

export function createRefreshState(): RefreshState {
  return { dirty: true, settle: 0, lastTimeS: Number.NaN, fullSun: [0, -1, 0], lastSun: [0, -1, 0], lastCamera: [Number.NaN, 0, 0] };
}

const angle = (a: V3, b: V3): number => {
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
  return Math.acos(Math.min(1, Math.max(-1, d)));
};
const distance = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * What the clouds march this frame: everything after a jump (weather, clock, sun, a camera teleport); a sixteenth of
 * the map while anything moves (the clock, the sun, the camera, which runs on real time even while paused) and for
 * SLICES frames after it stops, so every texel catches up; nothing while all is still.
 */
export function decideRefresh(s: RefreshState, input: RefreshInput): 'full' | 'slice' | 'none' {
  const cameraStep = distance(input.camera, s.lastCamera);
  const jumped = s.dirty
    || !(Math.abs(input.simTimeS - s.lastTimeS) <= FULL_REFRESH_TIME_S)
    || angle(input.sun, s.fullSun) > FULL_REFRESH_SUN_RAD
    || !(cameraStep <= FULL_REFRESH_CAMERA_M);
  const moved = input.simTimeS !== s.lastTimeS || angle(input.sun, s.lastSun) > 0 || cameraStep > CAMERA_STILL_M;
  s.lastTimeS = input.simTimeS;
  s.lastSun = [...input.sun];
  s.lastCamera = [...input.camera];
  if (jumped) {
    s.dirty = false;
    s.fullSun = [...input.sun];
    s.settle = 0;
    return 'full';
  }
  if (moved) s.settle = SLICES;
  if (s.settle === 0) return 'none';
  s.settle--;
  return 'slice';
}
