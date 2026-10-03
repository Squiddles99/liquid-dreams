import { type BakedClip, POSE_CLIP, type RiderClips, clipFor } from './clips';
import type { PoseName } from './poseNames';
import type { Stance } from './presets';

/** The dev panel's switch (spec §4.2): the hand-made code pose, or the motion clip. */
export type Motion = 'code' | 'clip';
export interface MotionChoice {
  use: Motion;
  /** The panel's readout: what plays, or why a clip can't. */
  status: string;
  clip: BakedClip | null;
  rc: RiderClips | null;
}

/** A clip plays only when asked for, the pose has one, and the rider's clips loaded; otherwise the code pose. */
export function chooseMotion(asked: Motion, pose: PoseName, loaded: { clips: RiderClips | null } | null, stance: Stance): MotionChoice {
  const code = (status: string): MotionChoice => ({ use: 'code', status, clip: null, rc: null });
  if (asked === 'code') return code('code');
  if (loaded === null) return code('clip: loading');
  if (loaded.clips === null) return code('clip: not built');
  const name = POSE_CLIP[pose], clip = name ? clipFor(loaded.clips, name, stance) : null;
  if (!clip) return code('clip: none for this pose');
  return { use: 'clip', status: 'clip: ready', clip, rc: loaded.clips };
}

/** Seconds into the clip: the sim's clock when playing (as the paddle's), else the phase slider through one loop. */
export const clipTime = (play: boolean, simTime: number, phaseT: number, duration: number): number => (play ? simTime : phaseT * duration);
