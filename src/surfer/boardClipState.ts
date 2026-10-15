import type { ClipSample } from './clipPlayer';
import { type BoardClipName, type BoardClips, blendBoardSamples, boardClipDuration, sampleBoardClip } from './boardClips';
import type { PoseName } from './poseNames';

/**
 * Which approved board clip plays (hero swap, 2026-10-16): sitting, the sit-and-wait loop; paddling, the paddle stroke;
 * paddling straight from sitting, Andrew's sit-to-paddle once and then the stroke. Any other change cross-fades over
 * BOARD_FADE_S (both ride the same board: nothing slides; lying to sitting up takes a body about that long).
 */
export const BOARD_FADE_S = 0.8;
export interface BoardClipState {
  name: BoardClipName;
  /** Sim time the clip started (its own clock). */
  startT: number;
  /** The pose being faded from, and how far the fade has run (s); null when none. */
  from: ClipSample | null;
  fadeT: number;
  last: ClipSample | null;
}

/** The board clip for a pose, or null when this pose isn't one (the stand uses its other paths). */
export const boardClipFor = (pose: PoseName): 'sit' | 'paddle' | null => (pose === 'sit' ? 'sit' : pose === 'paddle' ? 'paddle' : null);

const smoother = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * x * (x * (6 * x - 15) + 10); };

/** One frame: the clip that plays now and its sample; null if the file lacks it (the stand falls back). */
export function stepBoardClip(st: BoardClipState | null, pose: 'sit' | 'paddle', simTime: number, dt: number, lib: BoardClips): { state: BoardClipState; sample: ClipSample } | null {
  const want: BoardClipName = pose === 'sit' ? 'sitIdle' : 'paddleCycle';
  const start = (name: BoardClipName, fadeFrom: ClipSample | null): BoardClipState => ({ name, startT: simTime, from: fadeFrom, fadeT: 0, last: null });
  let s = st;
  if (!s) s = start(want, null);
  else if (s.name === 'sitToProne') {
    if (pose === 'sit') s = start('sitIdle', s.last);
    else if (simTime - s.startT >= boardClipDuration(lib, 'sitToProne')) s = { ...start('paddleCycle', null), from: s.from, fadeT: s.fadeT };
  } else if (s.name !== want) {
    // Paddling from sitting: the approved transition when the file has it, its first pose faded in from the sit.
    s = s.name === 'sitIdle' && want === 'paddleCycle' && lib.clips.sitToProne ? start('sitToProne', s.last) : start(want, s.last);
  }
  let sample = sampleBoardClip(lib, s.name, simTime - s.startT);
  if (!sample) return null;
  if (s.from) {
    sample = blendBoardSamples(s.from, sample, smoother(s.fadeT / BOARD_FADE_S));
    s.fadeT += dt;
    if (s.fadeT >= BOARD_FADE_S) s.from = null;
  }
  s.last = sample;
  return { state: s, sample };
}
