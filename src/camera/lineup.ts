import { type SpringState, stepCriticalSpring } from './floatSpring';
import type { Look } from './look';
import { type MoveKeys, planarMoveXZ } from './movement';

export const LINEUP = { eyeHeightM: 0.8, riseHeightM: 2, driftSpeedMs: 0.5, springOmega: 4 } as const;

export interface LineupState {
  x: number;
  z: number;
  look: Look;
  /** Eye height (world Y), riding the water through a spring, like sitting on a board. */
  height: SpringState;
}

export function initialLineupState(x: number, z: number, look: Look, waterHeight = 0): LineupState {
  return { x, z, look, height: { value: waterHeight + LINEUP.eyeHeightM, velocity: 0 } };
}

export function stepLineup(s: LineupState, keys: MoveKeys, waterHeight: number, dt: number): LineupState {
  const move = planarMoveXZ(s.look.yawDeg, keys, LINEUP.driftSpeedMs * dt);
  const target = waterHeight + LINEUP.eyeHeightM + (keys.rise ? LINEUP.riseHeightM : 0);
  return { ...s, x: s.x + move.x, z: s.z + move.z, height: stepCriticalSpring(s.height, target, LINEUP.springOmega, dt) };
}
