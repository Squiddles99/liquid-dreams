import { FACE_CHANNELS, type FaceChannel, type FaceState, type IdleContext } from './idleLife';
import type { PoseName } from './poseNames';
import type { PresetName } from './presets';
import type { SurferParams } from './surferParams';

/** How hard each pose works the lungs (closeup spec §5.1): paddling most, riding some, sitting none. */
const EXERTION: Record<PoseName, number> = {
  sit: 0, paddle: 1, popup: 0.8, drop: 0.45, bottomTurn: 0.45, trim: 0.35, barrel: 0.4, kickout: 0.45, bail: 0.8,
  prone: 0.3, proneBarrel: 0.35, dropKnee: 0.45, carry: 0, selectStand: 0,
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

export type SelectExpression = 'none' | 'grin' | 'stoked' | 'easy';

/**
 * The select screen's faces (dune select spec §13.1), authored per rider from the rig's face channels (no left/right
 * channel is ever set apart). grin: a natural, symmetric open smile, eyes engaged (squint and cheek); stoked: the
 * pick; easy: the idle's resting look. Shazza's smile is held lower (her smile unit pulls the mouth wide). Tuned at
 * Gate A's face sheets.
 */
export const SELECT_EXPRESSIONS: Record<PresetName, Record<Exclude<SelectExpression, 'none'>, Partial<Record<FaceChannel, number>>>> = {
  female: { grin: { smile: 0.42, jawOpen: 0.1, squint: 0.22, browsUp: 0.08 }, stoked: { smile: 0.62, jawOpen: 0.22, squint: 0.3, browsUp: 0.3 }, easy: { smile: 0.18, jawOpen: 0.02, squint: 0.06 } },
  male: { grin: { smile: 0.55, jawOpen: 0.12, squint: 0.25, browsUp: 0.1 }, stoked: { smile: 0.8, jawOpen: 0.25, squint: 0.3, browsUp: 0.35 }, easy: { smile: 0.22, jawOpen: 0.02, squint: 0.08 } },
  grommet: { grin: { smile: 0.6, jawOpen: 0.16, squint: 0.25, browsUp: 0.15 }, stoked: { smile: 0.85, jawOpen: 0.3, squint: 0.32, browsUp: 0.4 }, easy: { smile: 0.3, jawOpen: 0.04, squint: 0.08 } },
};

/** The face with a select expression laid over idle life's (breathing, blinks and gaze stay). */
export function withExpression(face: FaceState, preset: PresetName, e: SelectExpression): FaceState {
  return e === 'none' ? face : { ...face, ...SELECT_EXPRESSIONS[preset][e] };
}
