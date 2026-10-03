import type { WaterAt, WaterFn } from './water';

/**
 * The board on the water (first-ride spec §2): a point on the set waves' surface with a heading. Gravity pulls it down
 * the surface, the water drags it (lightly along the board, hard across it: the rail and fins grip), paddling pushes it,
 * and a face lifting the tail helps it onto the wave (the assisted takeoff).
 */

export type RidePhase = 'paddle' | 'popup' | 'ride' | 'bail';
export type RideEvent = 'caught' | 'popup' | 'tooSoon' | 'wipeout' | 'kickout' | 'reset';

export interface RideControls {
  /** Paddling (prone), or standing tall (riding). */
  paddle: boolean;
  /** −1 hard left … +1 hard right. */
  steer: number;
  /** −1 stand tall … +1 crouch (riding). */
  crouch: number;
  /** Pop up: pressed this step. */
  popup: boolean;
}

export const NO_CONTROLS: RideControls = { paddle: false, steer: 0, crouch: 0, popup: false };

export interface RideBody {
  phase: RidePhase;
  /** Seconds in this phase. */
  phaseT: number;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  /** Compass heading of the nose (deg): forward = (sin h, −cos h), as placement.headingAxes. */
  headingDeg: number;
  /** The smoothed carve, −1 … +1 (rolls the board and leans the rider). */
  carve: number;
  /** The smoothed crouch, −1 … +1. */
  compression: number;
  /** The wave has us (paddle phase): Space now pops up. */
  caught: boolean;
  /** Seconds the ride has been stalled (too slow to plane). */
  stallT: number;
  /** Seconds since paddling stopped (the pose sits up after a while). */
  idleT: number;
  /** The water under the board this step. */
  water: WaterAt;
}

const G = 9.81;
const DEG = Math.PI / 180;

/** Prone paddling: thrust (m/s²) and drag, giving ~1.5 m/s flat out on flat water. */
export const PADDLE_THRUST = 1.6;
const PRONE_DRAG = { lin: 0.6, quad: 0.3, side: 3 };
/** Planing on its feet: terminal ~17 m/s down a 0.5 slope. */
const PLANE_DRAG = { lin: 0.03, quad: 0.012, side: 5 };
/** In the water after a wipeout: carried with the water. */
const BAIL_DRAG = { lin: 1.5, quad: 0, side: 1.5 };
export const PADDLE_TURN_DEG_S = 70;
export const CARVE_TURN_DEG_S = 110;
/** The assisted takeoff's push (m/s²) at full lift, up to ASSIST_TO × the wave's speed. */
export const ASSIST_ACCEL = 8;
export const ASSIST_TO = 0.8;
/** Caught once moving with the wave this fast (× its speed) on its face. */
export const CATCH_RATIO = 0.45;
/** Too slow to pop up below this (m/s). */
export const POPUP_MIN_SPEED = 2.5;
export const POPUP_S = 0.8;
export const BAIL_S = 2;
/** Whitewater over this and you're gone. */
export const WIPEOUT_FOAM = 0.5;
/** A face steeper than this (|∇y|, ≈ 68°) and you go over the falls. */
export const WIPEOUT_SLOPE = 2.5;
/** Riding slower than this (m/s) for STALL_S and the board sinks: the ride is over. */
export const STALL_SPEED = 3;
export const STALL_S = 0.6;
export const MAX_SPEED = 18;
/**
 * The wave carries you (the arcade part): on its front face, standing, the board grips and drags against water moving
 * with the wave at this fraction of its speed, so a rider angled along the face stays on it; over the back, nothing.
 */
export const WAVE_CARRY = 0.9;

export function forwardOf(headingDeg: number): [number, number] {
  const h = headingDeg * DEG;
  return [Math.sin(h), -Math.cos(h)];
}

export function rightOf(headingDeg: number): [number, number] {
  const h = headingDeg * DEG;
  return [Math.cos(h), Math.sin(h)];
}

export function startBody(x: number, z: number, headingDeg: number, water: WaterFn): RideBody {
  const w = water(x, z);
  return { phase: 'paddle', phaseT: 0, x, z, y: w.y, vx: 0, vz: 0, headingDeg, carve: 0, compression: 0, caught: false, stallT: 0, idleT: 10, water: w };
}

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How much the wave is lifting the board onto its face [0, 1]: on the front face, the nose pointing downhill. */
export function liftAt(w: WaterAt, headingDeg: number): number {
  const [fx, fz] = forwardOf(headingDeg);
  const front = -(w.slopeX * w.dirX + w.slopeZ * w.dirZ);
  const downhill = -(w.slopeX * fx + w.slopeZ * fz);
  return smoothstep(0.03, 0.15, front) * smoothstep(-0.02, 0.08, downhill);
}

export function speedOf(b: Pick<RideBody, 'vx' | 'vz'>): number {
  return Math.hypot(b.vx, b.vz);
}

function setPhase(b: RideBody, phase: RidePhase): void {
  b.phase = phase;
  b.phaseT = 0;
  b.stallT = 0;
  b.caught = false;
}

/** One physics step of dt seconds. Mutates and returns the body, with what happened (for the hints). */
export function stepRide(b: RideBody, c: RideControls, water: WaterFn, dt: number): RideEvent | null {
  if (!(dt > 0)) return null;
  const w = b.water;
  let event: RideEvent | null = null;
  b.phaseT += dt;

  // Steering and the carve.
  const steer = Math.max(-1, Math.min(1, c.steer));
  const speed0 = speedOf(b);
  const turn = b.phase === 'paddle' ? PADDLE_TURN_DEG_S
    : b.phase === 'ride' ? CARVE_TURN_DEG_S * Math.max(0.3, Math.min(1, speed0 / 5)) : 0;
  b.headingDeg = (((b.headingDeg + steer * turn * dt) % 360) + 360) % 360;
  const ease = 1 - Math.exp(-dt / 0.15);
  b.carve += ((b.phase === 'ride' ? steer : 0) - b.carve) * ease;
  b.compression += ((b.phase === 'ride' ? Math.max(-1, Math.min(1, c.crouch)) : 0) - b.compression) * ease;

  // Forces: gravity along the surface, paddling, the assist.
  const [fx, fz] = forwardOf(b.headingDeg), [rx, rz] = rightOf(b.headingDeg);
  const s2 = w.slopeX * w.slopeX + w.slopeZ * w.slopeZ;
  let ax = (-G * w.slopeX) / (1 + s2), az = (-G * w.slopeZ) / (1 + s2);
  const paddling = b.phase === 'paddle' && c.paddle;
  b.idleT = paddling ? 0 : b.idleT + dt;
  if (paddling) {
    let push = PADDLE_THRUST;
    const along = (b.vx - w.ux) * fx + (b.vz - w.uz) * fz;
    const lift = liftAt(w, b.headingDeg);
    if (lift > 0 && along < ASSIST_TO * w.c) push += ASSIST_ACCEL * lift;
    ax += fx * push;
    az += fz * push;
  }
  b.vx += ax * dt;
  b.vz += az * dt;

  // Drag relative to the water.
  const d = b.phase === 'bail' ? BAIL_DRAG : b.phase === 'paddle' ? PRONE_DRAG : PLANE_DRAG;
  const standing = b.phase === 'ride' || b.phase === 'popup';
  const carry = standing ? WAVE_CARRY * w.c * smoothstep(0, 0.08, -(w.slopeX * w.dirX + w.slopeZ * w.dirZ)) : 0;
  const ux = w.ux + w.dirX * carry, uz = w.uz + w.dirZ * carry;
  const relX = b.vx - ux, relZ = b.vz - uz;
  let along = relX * fx + relZ * fz, side = relX * rx + relZ * rz;
  along *= Math.exp(-d.lin * dt);
  along /= 1 + d.quad * Math.abs(along) * dt;
  side *= Math.exp(-d.side * (b.phase === 'ride' ? 1 + 0.3 * b.compression : 1) * dt);
  b.vx = ux + fx * along + rx * side;
  b.vz = uz + fz * along + rz * side;
  if (b.phase === 'bail') {
    // The whitewater shoves you shoreward.
    b.vx += w.dirX * w.c * w.foam * 1.2 * dt;
    b.vz += w.dirZ * w.c * w.foam * 1.2 * dt;
  }
  const sp = speedOf(b);
  if (sp > MAX_SPEED) {
    b.vx *= MAX_SPEED / sp;
    b.vz *= MAX_SPEED / sp;
  }

  b.x += b.vx * dt;
  b.z += b.vz * dt;
  const next = water(b.x, b.z);
  if (Number.isFinite(next.y) && Number.isFinite(next.slopeX) && Number.isFinite(next.slopeZ)) b.water = next;
  b.y = b.water.y;

  // Phases.
  const nw = b.water, speed = speedOf(b);
  const alongWave = (b.vx - nw.ux) * fx + (b.vz - nw.uz) * fz;
  switch (b.phase) {
    case 'paddle': {
      const wasCaught = b.caught;
      b.caught = liftAt(nw, b.headingDeg) > 0.3 && nw.c > 0 && alongWave > CATCH_RATIO * nw.c;
      if (b.caught && !wasCaught) event = 'caught';
      if (c.popup) {
        if (b.caught || speed > POPUP_MIN_SPEED) {
          setPhase(b, 'popup');
          event = 'popup';
        } else event = 'tooSoon';
      }
      if (nw.foam > WIPEOUT_FOAM && speed > POPUP_MIN_SPEED) {
        setPhase(b, 'bail');
        event = 'wipeout';
      }
      break;
    }
    case 'popup':
    case 'ride': {
      if (b.phase === 'popup' && b.phaseT >= POPUP_S) setPhase(b, 'ride');
      const steep = Math.hypot(nw.slopeX, nw.slopeZ);
      if (nw.foam > WIPEOUT_FOAM || steep > WIPEOUT_SLOPE) {
        setPhase(b, 'bail');
        event = 'wipeout';
        break;
      }
      b.stallT = speed < STALL_SPEED ? b.stallT + dt : 0;
      if (b.stallT > STALL_S) {
        setPhase(b, 'paddle');
        b.idleT = 10;
        event = 'kickout';
      }
      break;
    }
    case 'bail':
      if (b.phaseT >= BAIL_S) {
        setPhase(b, 'paddle');
        b.idleT = 10;
      }
      break;
  }
  return event;
}
