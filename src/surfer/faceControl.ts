import { FACE_CHANNELS, type FaceState, type IdleContext } from './idleLife';
import type { PoseName } from './poseNames';
import type { SurferParams } from './surferParams';

/** How hard each pose works the lungs (closeup spec §5.1): paddling most, riding some, sitting none. */
const EXERTION: Record<PoseName, number> = {
  sit: 0, paddle: 1, popup: 0.8, drop: 0.45, bottomTurn: 0.45, trim: 0.35, barrel: 0.4, kickout: 0.45, bail: 0.8,
  prone: 0.3, proneBarrel: 0.35, dropKnee: 0.45, carry: 0,
};

/** The idle model's context from the stand: the head may wander only sitting or on land (Review Focus 3). */
export function idleContextFor(pose: PoseName, onLand: boolean, sunFacing: number): IdleContext {
  return { still: pose === 'sit' || onLand, exertionTarget: onLand ? 0 : EXERTION[pose], onLand, sunFacing: Math.min(1, Math.max(0, sunFacing)) };
}

type V = { x: number; y: number; z: number };
/**
 * How squarely the sun meets the eyes (0–1): the facing's alignment with the sun, faded out as the sun nears the horizon
 * and gone once it has set (final review: riders held a full squint at a dawn sun on the horizon).
 */
export function sunFacing(facing: V, sun: V): number {
  const along = Math.max(0, facing.x * sun.x + facing.y * sun.y + facing.z * sun.z);
  const t = Math.min(1, Math.max(0, (sun.y - 0.02) / 0.12));
  return along * t * t * (3 - 2 * t);
}

export function restingFace(): FaceState {
  const f = Object.fromEntries(FACE_CHANNELS.map((c) => [c, 0])) as FaceState;
  return { ...f, gazeYawDeg: 0, gazePitchDeg: 0, headYawDeg: 0, headPitchDeg: 0 };
}

/** The panel's manual face over the idle one: its dials set their channels and the gaze; breathing carries on. */
export function applyFaceParams(idle: FaceState, p: SurferParams): FaceState {
  if (!p.faceManual) return idle;
  return {
    ...idle,
    blinkL: p.faceBlink, blinkR: p.faceBlink, smile: p.faceSmile, jawOpen: p.faceJaw, browsUp: p.faceBrows, squint: p.faceSquint,
    gazeYawDeg: p.gazeYawDeg, gazePitchDeg: p.gazePitchDeg,
  };
}
