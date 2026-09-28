import { type SpringState, stepCriticalSpring } from '../camera/floatSpring';
import type { Look } from '../camera/look';
import { type MoveKeys, planarMoveXZ } from '../camera/movement';

/** Standing on the beach (spec 2026-09-28-on-the-beach-design.md §3.1). */
export const WALK = { eyeHeightM: 1.7, speedMs: 1.4, runMultiplier: 3, springOmega: 10, wadeLimitM: 1.2 } as const;

/** Where you can stand: the ground's height (the land, the seabed, the rock tops) and the still water's level. */
export interface Ground {
  groundAt(x: number, z: number): number;
  waterLevel(): number;
}

export interface WalkState {
  x: number;
  z: number;
  look: Look;
  height: SpringState;
}

const depthAt = (g: Ground, x: number, z: number): number => g.waterLevel() - g.groundAt(x, z);

/** Standable: finite ground, still water over it at most the wading limit. */
export function canStand(g: Ground, x: number, z: number): boolean {
  const d = depthAt(g, x, z);
  return Number.isFinite(d) && d <= WALK.wadeLimitM;
}

export function initialWalkState(x: number, z: number, look: Look, g: Ground): WalkState {
  const ground = g.groundAt(x, z);
  return { x, z, look, height: { value: (Number.isFinite(ground) ? ground : 0) + WALK.eyeHeightM, velocity: 0 } };
}

/**
 * One frame of walking: move at WALK.speedMs (× runMultiplier with the fast key) where the step stays standable, else
 * slide along whichever axis does; a step to shallower water is always allowed (a rising tide never traps you). The eye
 * follows the ground through a critical spring.
 */
export function stepWalk(s: WalkState, keys: MoveKeys, g: Ground, dt: number): WalkState {
  const m = planarMoveXZ(s.look.yawDeg, keys, WALK.speedMs * (keys.fast ? WALK.runMultiplier : 1) * dt);
  const here = depthAt(g, s.x, s.z);
  const ok = (x: number, z: number): boolean => {
    const d = depthAt(g, x, z);
    return Number.isFinite(d) && (d <= WALK.wadeLimitM || (Number.isFinite(here) && d < here));
  };
  let x = s.x, z = s.z;
  if (ok(s.x + m.x, s.z + m.z)) { x += m.x; z += m.z; }
  else if (ok(s.x + m.x, s.z)) x += m.x;
  else if (ok(s.x, s.z + m.z)) z += m.z;
  const ground = g.groundAt(x, z);
  const target = (Number.isFinite(ground) ? ground : s.height.value - WALK.eyeHeightM) + WALK.eyeHeightM;
  return { ...s, x, z, height: stepCriticalSpring(s.height, target, WALK.springOmega, dt) };
}
