import { Vector3 } from 'three/webgpu';
import type { CameraPose } from '../dev/momentLink';
import type { PoseName } from '../surfer/poseNames';
import { SINK_M } from '../surfer/placement';
import type { BoardFrame } from '../surfer/solvePose';
import type { SurferParams } from '../surfer/surferParams';
import { type RideBody, forwardOf, speedOf } from './ridePhysics';

const DEG = Math.PI / 180;
/** The board rolls onto its rail this far at full carve and speed. */
export const RAIL_ROLL_DEG = 30;
/** Sit up after this long without paddling. */
export const SIT_AFTER_S = 1.5;
/** The pop-up's pose plays over the physics' pop-up; the drop holds this long after it. */
export const DROP_HOLD_S = 0.5;

/** The pose and dials for the ride's state (first-ride spec §5). */
export function rideSurferParams(b: RideBody, popupS: number): Pick<SurferParams, 'pose' | 'phaseT' | 'play' | 'lean' | 'compression' | 'twist' | 'x' | 'z' | 'headingDeg' | 'onLand' | 'enabled'> {
  let pose: PoseName, phaseT = 0, play = false;
  switch (b.phase) {
    case 'paddle':
      if (b.idleT > SIT_AFTER_S && !b.caught) pose = 'sit';
      else {
        pose = 'paddle';
        play = true;
      }
      break;
    case 'popup':
      pose = 'popup';
      phaseT = Math.min(1, b.phaseT / popupS);
      break;
    case 'ride':
      pose = b.phaseT < DROP_HOLD_S ? 'drop' : 'trim';
      break;
    case 'bail':
      pose = 'bail';
      phaseT = Math.min(1, b.phaseT / 0.8);
      break;
  }
  const riding = b.phase === 'ride';
  return {
    enabled: true, onLand: false, pose, phaseT, play,
    lean: riding ? 0.8 * b.carve : 0,
    compression: riding ? Math.max(-1, Math.min(1, b.compression + 0.4 * Math.abs(b.carve))) : 0,
    twist: riding ? 0.5 * b.carve : 0,
    x: b.x, z: b.z, headingDeg: b.headingDeg,
  };
}

/** The board on the surface: its normal, the nose along the heading, rolled onto the inside rail in a carve. */
export function rideBoardFrame(b: RideBody): BoardFrame {
  const w = b.water;
  const n = new Vector3(-w.slopeX, 1, -w.slopeZ).normalize();
  const [fx, fz] = forwardOf(b.headingDeg);
  const f = new Vector3(fx, 0, fz);
  f.addScaledVector(n, -f.dot(n)).normalize();
  const r = new Vector3().crossVectors(f, n).normalize();
  const roll = b.phase === 'ride' ? b.carve * RAIL_ROLL_DEG * DEG * Math.min(1, speedOf(b) / 4) : 0;
  const up = n.clone().multiplyScalar(Math.cos(roll)).addScaledVector(r, Math.sin(roll)).normalize();
  return { position: new Vector3(b.x, b.y - SINK_M, b.z), forward: f, up };
}

export const CHASE_BACK_M = 7;
export const CHASE_UP_M = 3.2;
/** The camera stays at least this far over the water under it (the wave's back or crest behind the rider). */
export const CHASE_CLEAR_M = 1.8;
/** Seconds for the camera to settle on a new spot. */
export const CHASE_TAU_S = 0.35;
/**
 * Up and riding (Andrew: "front-on, slightly looking into the barrel"): ahead of the rider along the wave, out in front of
 * its face, low, looking back at her and the curl behind her.
 */
export const FRONT_AHEAD_M = 7;
export const FRONT_OUT_M = 4;
export const FRONT_UP_M = 1.4;
/** The look aims this far behind her along the line, into the curl. */
export const FRONT_LOOK_BACK_M = 2.5;

/**
 * The ride's camera, easing after the board: paddling, behind it along its travel (its heading when slow); up and riding,
 * front-on from the shoulder.
 */
export class RideCamera {
  private pos: Vector3 | null = null;
  private dir = new Vector3(1, 0, 0);
  /** Which way along the wave the rider is going (horizontal unit), smoothed so it doesn't flip in a carve. */
  private line: Vector3 | null = null;

  reset(): void {
    this.pos = null;
    this.line = null;
  }

  update(b: RideBody, dt: number, waterY: (x: number, z: number) => number): CameraPose {
    const a = this.pos ? 1 - Math.exp(-dt / CHASE_TAU_S) : 1;
    const up = b.phase === 'ride' || b.phase === 'popup' || b.phase === 'bail';
    let target: Vector3, lookAt: Vector3;
    if (up) {
      const w = b.water, d = new Vector3(w.dirX, 0, w.dirZ).normalize();
      // Along the wave: the board's motion (its heading when slow) less its part along the swell's travel.
      const sp = speedOf(b), [fx, fz] = forwardOf(b.headingDeg);
      const v = sp > 2 ? new Vector3(b.vx, 0, b.vz) : new Vector3(fx, 0, fz);
      const along = v.addScaledVector(d, -v.dot(d));
      if (along.lengthSq() < 1e-6) along.set(-d.z, 0, d.x);
      along.normalize();
      if (!this.line) this.line = along.clone();
      else this.line.lerp(along, 1 - Math.exp(-dt / 0.8)).normalize();
      const L = this.line;
      target = new Vector3(b.x, 0, b.z).addScaledVector(L, FRONT_AHEAD_M).addScaledVector(d, FRONT_OUT_M);
      target.y = waterY(target.x, target.z) + FRONT_UP_M;
      lookAt = new Vector3(b.x, b.y + 1, b.z).addScaledVector(L, -FRONT_LOOK_BACK_M);
    } else {
      this.line = null;
      const sp = speedOf(b);
      const [fx, fz] = forwardOf(b.headingDeg);
      const want = sp > 2 ? new Vector3(b.vx / sp, 0, b.vz / sp) : new Vector3(fx, 0, fz);
      this.dir.lerp(want, a).normalize();
      target = new Vector3(b.x - this.dir.x * CHASE_BACK_M, b.y + CHASE_UP_M, b.z - this.dir.z * CHASE_BACK_M);
      target.y = Math.max(target.y, waterY(target.x, target.z) + CHASE_CLEAR_M, waterY((target.x + b.x) / 2, (target.z + b.z) / 2) + CHASE_CLEAR_M);
      lookAt = new Vector3(b.x, b.y + 1, b.z);
    }
    if (!this.pos) this.pos = target.clone();
    else this.pos.lerp(target, a);
    // Never under the water where the camera is now (the face can rise under it while it eases).
    this.pos.y = Math.max(this.pos.y, waterY(this.pos.x, this.pos.z) + 0.5);
    const look = lookAt.sub(this.pos);
    const yawDeg = Math.atan2(look.x, -look.z) / DEG;
    const pitchDeg = Math.atan2(look.y, Math.hypot(look.x, look.z)) / DEG;
    return { mode: 'free', position: [this.pos.x, this.pos.y, this.pos.z], yawDeg: ((yawDeg % 360) + 360) % 360, pitchDeg };
  }
}
