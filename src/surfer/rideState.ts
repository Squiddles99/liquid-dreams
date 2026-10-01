import type { Vector3 } from 'three/webgpu';
import type { PoseName } from './poseNames';
import type { BoardFrame } from './solvePose';

export type Zone = 'flats' | 'face' | 'pocket' | 'tube' | 'lip' | 'whitewater';
export type Phase = 'sit' | 'paddle' | 'popup' | 'ride' | 'kickout' | 'bail';

/**
 * The seam between riding physics and posing (spec §3.4). On the stand the dev panel fills it; in sub-project 2 the
 * physics will, and the surfer code will not change.
 */
export interface RideState {
  board: BoardFrame;
  speedMs: number;
  /** + into the wave face. */
  railAngleRad: number;
  compression: number;
  zone: Zone;
  phase: Phase;
  phaseT: number;
  lookAt: Vector3;
}

export const POSE_PHASE: Record<PoseName, Phase> = {
  sit: 'sit', paddle: 'paddle', popup: 'popup', drop: 'ride', bottomTurn: 'ride', trim: 'ride', barrel: 'ride',
  kickout: 'kickout', bail: 'bail', prone: 'ride', proneBarrel: 'ride', dropKnee: 'ride',
  // Standing on land with the board (walking spec §4): nothing downstream reads phases or zones on land yet.
  carry: 'sit',
};

export const POSE_ZONE: Record<PoseName, Zone> = {
  sit: 'flats', paddle: 'flats', popup: 'face', drop: 'face', bottomTurn: 'face', trim: 'face', barrel: 'tube',
  kickout: 'face', bail: 'whitewater', prone: 'face', proneBarrel: 'tube', dropKnee: 'face', carry: 'flats',
};
