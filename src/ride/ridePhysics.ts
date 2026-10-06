import type { WaterAt, WaterFn } from './water';

/**
 * The board on the water (first-ride spec §2): a point on the set waves' surface with a heading. Gravity pulls it down
 * the surface, the water drags it (lightly along the board, hard across it: the rail and fins grip), paddling pushes it,
 * and a face lifting the tail helps it onto the wave (the assisted takeoff).
 */

export type RidePhase = 'paddle' | 'popup' | 'ride' | 'bail';
export type RideEvent = 'caught' | 'popup' | 'tooSoon' | 'wipeout' | 'kickout' | 'reset' | 'aground';

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
  /** The board's heave (m/s): floating, it rides over the water under it with some weight. */
  vy: number;
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
  /** The board's own tilt (∂y/∂x, ∂y/∂z): the water under its nose, middle and tail, eased (it is drawn on this). */
  tiltX: number;
  tiltZ: number;
  /** The water's height under the whole board last step (boardSurface). */
  surfY: number;
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
/** Carving at speed (Andrew 2026-10-04: the turn wasn't responsive enough to set the rail and keep up with the wave). */
export const CARVE_TURN_DEG_S = 170;
/** Popping up, you already set your line (at this fraction of the carve rate). */
export const POPUP_TURN = 0.6;
/**
 * The rail's grip turns the board's slide into speed along it instead of scrubbing it off: of the sideways speed the rail
 * takes out (relative to the water), this fraction of its energy goes into the board's run.
 */
export const RAIL_KEEP = 0.85;
/** The assisted takeoff's push (m/s²) at full lift, up to ASSIST_TO × the wave's speed. 12, not 8, with the wall down the
 * line (plan 2026-10-06-wave-root-cause): the face reaching the take-off is a steep wall a second from breaking, and it
 * passes under a paddler in about 0.6 s; at 8 he reached 5.0 m/s against the 5.9 the catch needs on the 13 m/s crest
 * (CATCH_RATIO; the ride test, 6 and 12 ft). The catch itself is unchanged. */
export const ASSIST_ACCEL = 12;
export const ASSIST_TO = 0.8;
/** Caught once moving with the wave this fast (× its speed) on its face. 0.4, not 0.45, with the wall down the line (plan
 * 2026-10-06-wave-root-cause): the take-off's crest runs at 13 m/s over the basin (the wave breaks in 16 m of water until
 * step 5 moves it in), its face is a steep wall that passes a paddler in half a second, and at 0.45 he reached catch speed
 * a frame after the face had gone under him and went over the back (the ride test, 6 ft). */
export const CATCH_RATIO = 0.4;
/** Too slow to pop up below this (m/s). */
export const POPUP_MIN_SPEED = 2.5;
/** Andrew 2026-10-04: at 0.6 s he was on his feet only at the bottom of a ~1 s drop. */
export const POPUP_S = 0.4;
export const BAIL_S = 2;
/** Whitewater over this and you're gone. */
export const WIPEOUT_FOAM = 0.5;
/** A face steeper than this (|∇y|, ≈ 68°) and you go over the falls. */
export const WIPEOUT_SLOPE = 2.5;
/** Riding slower than this (m/s) for STALL_S and the board sinks: the ride is over. */
export const STALL_SPEED = 3;
export const STALL_S = 0.6;
export const MAX_SPEED = 18;
/** Half the board's length (m): its height and tilt come from the water under its nose and tail as well as its middle. */
export const BOARD_HALF_M = 0.9;
/**
 * Floating (prone, or after a wipeout), the board and rider heave onto the water under them, critically damped over this
 * period (s), falling no faster than g and never more than FLOAT_OVER_M above it. Read at one point, the takeoff's
 * pitching face flicked the board up 3 m in 0.2 s at 16 m/s (Andrew 2026-10-04: "fast-forward"); now ~9 m/s, the face
 * washing over the nose (> 1 m) for under 0.2 s. Shorter periods snap, longer ones bury it.
 */
export const FLOAT_PERIOD_S = 0.5;
export const FLOAT_OVER_M = 0.25;
/** Standing, the board planes on the surface; a gap left from floating closes over this long (s). */
export const PLANE_TAU_S = 0.05;
/** The board's tilt follows the water under it over this long (s): floating, and planing. */
export const FLOAT_TILT_TAU_S = 0.18;
export const PLANE_TILT_TAU_S = 0.05;
/** Water shallower than this (m) over the bed, the beach or a rock and the board runs aground: it stops there. */
export const AGROUND_DEPTH_M = 0.3;

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
  return { phase: 'paddle', phaseT: 0, x, z, y: w.y, vy: 0, vx: 0, vz: 0, headingDeg, carve: 0, compression: 0, caught: false, stallT: 0, idleT: 10, water: w, tiltX: w.slopeX, tiltZ: w.slopeZ, surfY: w.y };
}

/** The water under the whole board: its height (nose, middle and tail) and slope (nose to tail along it, across from the middle). */
export function boardSurface(water: WaterFn, x: number, z: number, headingDeg: number, mid: WaterAt): { y: number; slopeX: number; slopeZ: number } {
  const [fx, fz] = forwardOf(headingDeg), [rx, rz] = rightOf(headingDeg);
  const nose = water(x + fx * BOARD_HALF_M, z + fz * BOARD_HALF_M), tail = water(x - fx * BOARD_HALF_M, z - fz * BOARD_HALF_M);
  if (!Number.isFinite(nose.y) || !Number.isFinite(tail.y)) return { y: mid.y, slopeX: mid.slopeX, slopeZ: mid.slopeZ };
  const along = (nose.y - tail.y) / (2 * BOARD_HALF_M), across = mid.slopeX * rx + mid.slopeZ * rz;
  return { y: (nose.y + 2 * mid.y + tail.y) / 4, slopeX: along * fx + across * rx, slopeZ: along * fz + across * rz };
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
  const carveRate = CARVE_TURN_DEG_S * Math.max(0.5, Math.min(1, speed0 / 5));
  const turn = b.phase === 'paddle' ? PADDLE_TURN_DEG_S : b.phase === 'ride' ? carveRate : b.phase === 'popup' ? POPUP_TURN * carveRate : 0;
  b.headingDeg = (((b.headingDeg + steer * turn * dt) % 360) + 360) % 360;
  const ease = 1 - Math.exp(-dt / 0.15);
  b.carve += ((b.phase === 'ride' || b.phase === 'popup' ? steer : 0) - b.carve) * ease;
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
  // Against the water itself, not the wave: the wave runs on through the water, and that water running up the face past
  // the rail is what drives the board along the line. (Dragging against water carried with the wave, as first tuned,
  // ate the drop's speed: a hard bottom turn made ~4 m/s along the line and the lip landed on it, Andrew 2026-10-04.)
  const ux = w.ux, uz = w.uz;
  const relX = b.vx - ux, relZ = b.vz - uz;
  let along = relX * fx + relZ * fz, side = relX * rx + relZ * rz;
  along *= Math.exp(-d.lin * dt);
  along /= 1 + d.quad * Math.abs(along) * dt;
  const gripped = side * Math.exp(-d.side * (b.phase === 'ride' ? 1 + 0.3 * b.compression : 1) * dt);
  // On its feet, the rail turns the slide it grips into run (a bottom turn keeps its speed); prone, the water just takes it.
  if (standing && along > 0) along = Math.sqrt(along * along + RAIL_KEEP * (side * side - gripped * gripped));
  side = gripped;
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

  const x0 = b.x, z0 = b.z, moving = speedOf(b) > 0.5;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  let next = water(b.x, b.z);
  if (next.bedY !== undefined && next.bedY > next.y - AGROUND_DEPTH_M) {
    // Aground (Andrew: he rode all the way up the beach and under it): the board stops short, off its feet.
    b.x = x0;
    b.z = z0;
    b.vx = 0;
    b.vz = 0;
    next = water(b.x, b.z);
    if (b.phase === 'ride' || b.phase === 'popup') {
      setPhase(b, 'paddle');
      b.idleT = 10;
    }
    if (moving) event = 'aground';
  }
  if (Number.isFinite(next.y) && Number.isFinite(next.slopeX) && Number.isFinite(next.slopeZ)) b.water = next;
  // The board on the water under it: planing on it standing; floating, heaving over it with the rider's weight.
  const surf = boardSurface(water, b.x, b.z, b.headingDeg, b.water), y0 = b.y;
  const onFeet = standing && event !== 'aground';
  if (onFeet) b.y = surf.y + (y0 - b.surfY) * Math.exp(-dt / PLANE_TAU_S);
  else {
    const w0 = (2 * Math.PI) / FLOAT_PERIOD_S;
    b.vy += Math.max(-G, w0 * w0 * (surf.y - b.y) - 2 * w0 * b.vy) * dt;
    b.y += b.vy * dt;
    if (b.y > surf.y + FLOAT_OVER_M) {
      b.y = surf.y + FLOAT_OVER_M;
      b.vy = (b.y - y0) / dt;
    }
  }
  b.y = Math.max(b.y, b.water.bedY ?? -Infinity);
  if (!Number.isFinite(b.y)) {
    b.y = Number.isFinite(b.water.y) ? b.water.y : y0;
    b.vy = 0;
  } else if (onFeet) b.vy = (b.y - y0) / dt;
  if (Number.isFinite(surf.y)) b.surfY = surf.y;
  const tilt = 1 - Math.exp(-dt / (onFeet ? PLANE_TILT_TAU_S : FLOAT_TILT_TAU_S));
  if (Number.isFinite(surf.slopeX) && Number.isFinite(surf.slopeZ)) {
    b.tiltX += (surf.slopeX - b.tiltX) * tilt;
    b.tiltZ += (surf.slopeZ - b.tiltZ) * tilt;
  }

  if (event === 'aground') return event;
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
