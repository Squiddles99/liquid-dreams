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

/** The pose and dials for the ride's state (first-ride spec §5). On a bodyboard (Grommet) he rides prone: no pop-up. */
export function rideSurferParams(b: RideBody, popupS: number, bodyboard = false): Pick<SurferParams, 'pose' | 'phaseT' | 'play' | 'lean' | 'compression' | 'twist' | 'x' | 'z' | 'headingDeg' | 'onLand' | 'enabled'> {
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
      pose = bodyboard ? 'prone' : 'popup';
      phaseT = Math.min(1, b.phaseT / popupS);
      break;
    case 'ride':
      pose = bodyboard ? 'prone' : b.phaseT < DROP_HOLD_S ? 'drop' : 'trim';
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
  const n = new Vector3(-b.tiltX, 1, -b.tiltZ).normalize();
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
 * Up and riding (Andrew 2026-10-04: "we can't see the face of the wave ahead"): behind her, lower and closer than paddling,
 * looking ahead along her run, so the wall down the line is in view.
 */
export const RIDE_BACK_M = 5.5;
export const RIDE_UP_M = 2;
export const RIDE_LOOK_AHEAD_M = 6;
/** Seconds for the camera's direction to follow her run (it doesn't whip round in a carve). */
export const DIR_TAU_S = 0.4;
/**
 * About to be barrelled (tubeCover), over her shoulder: at her head, a little behind, on the side away from the wall (the
 * shore side), looking down the tube, so the curl doesn't block the view. Blended in by the cover, eased.
 */
export const POV_UP_M = 1.6;
export const POV_BACK_M = 0.7;
/** Her head and shoulder at the frame's edge, the line ahead clear (at 0.35 m her head filled the middle). */
export const POV_SIDE_M = 0.7;
export const POV_LOOK_AHEAD_M = 12;
/** The tube's cover (tubeCover) over which the camera commits to her shoulder: all of it by the second. */
export const POV_COVER: readonly [number, number] = [0.3, 0.6];
export const POV_IN_TAU_S = 0.2;
export const POV_OUT_TAU_S = 0.6;

/** The player's look (Andrew 2026-10-04: right stick, or a mouse drag): this long with none and the camera goes home. */
export const LOOK_HOLD_S = 3;
/** Then it eases back over about this long (the time constant). */
export const LOOK_RETURN_TAU_S = 0.5;
/** The camera's height around the rider stays between these (degrees above her). */
export const LOOK_ELEVATION_DEG: readonly [number, number] = [-4, 70];

/** A look this step, in degrees: + yaw turns the view right, + pitch looks up. */
export interface LookInput {
  yawDeg: number;
  pitchDeg: number;
}

/**
 * The ride's camera, easing after the board: always behind it along its run (its heading when slow), higher and further
 * back paddling, lower and looking ahead down the line standing; over her shoulder as a tube closes over her. The player
 * can swing it around the rider (right stick, mouse drag); LOOK_HOLD_S after the last look it eases back to its framing.
 */
export class RideCamera {
  private pos: Vector3 | null = null;
  private dir = new Vector3(1, 0, 0);
  /** The player's swing off the framed camera (degrees), and the seconds since they last moved it. */
  private yawOff = 0;
  private pitchOff = 0;
  private idleS = Infinity;
  /** The over-the-shoulder camera's share [0, 1]. */
  pov = 0;

  reset(): void {
    this.pos = null;
    this.yawOff = this.pitchOff = 0;
    this.idleS = Infinity;
    this.pov = 0;
  }

  /** The player's swing off the framed camera (degrees): tests, and the HUD. */
  get look(): LookInput {
    return { yawDeg: this.yawOff, pitchDeg: this.pitchOff };
  }

  /** `cover`: how far she is under a curl (tubeCover), 0 out in the open. */
  update(b: RideBody, dt: number, waterY: (x: number, z: number) => number, input: LookInput = { yawDeg: 0, pitchDeg: 0 }, cover = 0): CameraPose {
    if (input.yawDeg !== 0 || input.pitchDeg !== 0) {
      this.yawOff = (((this.yawOff + input.yawDeg + 180) % 360) + 360) % 360 - 180;
      this.pitchOff += input.pitchDeg;
      this.idleS = 0;
    } else {
      this.idleS += dt;
      if (this.idleS > LOOK_HOLD_S) {
        const k = Math.exp(-dt / LOOK_RETURN_TAU_S);
        this.yawOff *= k;
        this.pitchOff *= k;
        if (Math.abs(this.yawOff) < 0.01 && Math.abs(this.pitchOff) < 0.01) this.yawOff = this.pitchOff = 0;
      }
    }
    const first = !this.pos, a = first ? 1 : 1 - Math.exp(-dt / CHASE_TAU_S);
    const up = b.phase === 'ride' || b.phase === 'popup' || b.phase === 'bail';
    // Her run (her heading when slow), smoothed.
    const sp = speedOf(b), [fx, fz] = forwardOf(b.headingDeg);
    const want = sp > 2 ? new Vector3(b.vx / sp, 0, b.vz / sp) : new Vector3(fx, 0, fz);
    this.dir.lerp(want, first ? 1 : 1 - Math.exp(-dt / DIR_TAU_S));
    if (this.dir.lengthSq() < 1e-6) this.dir.copy(want);
    this.dir.normalize();
    const D = this.dir, back = up ? RIDE_BACK_M : CHASE_BACK_M;
    const target = new Vector3(b.x - D.x * back, b.y + (up ? RIDE_UP_M : CHASE_UP_M), b.z - D.z * back);
    target.y = Math.max(target.y, waterY(target.x, target.z) + CHASE_CLEAR_M, waterY((target.x + b.x) / 2, (target.z + b.z) / 2) + CHASE_CLEAR_M);
    let lookAt = up ? new Vector3(b.x, b.y + 1, b.z).addScaledVector(D, RIDE_LOOK_AHEAD_M) : new Vector3(b.x, b.y + 1, b.z);
    if (!this.pos) this.pos = target.clone();
    else this.pos.lerp(target, a);
    // Never under the water where the camera is now (the face can rise under it while it eases).
    this.pos.y = Math.max(this.pos.y, waterY(this.pos.x, this.pos.z) + 0.5);
    // Over her shoulder as the tube closes over her: rigid with her (no lag, or she'd slide out of the frame).
    const c = Math.min(1, Math.max(0, (cover - POV_COVER[0]) / (POV_COVER[1] - POV_COVER[0])));
    const povTarget = up ? c * c * (3 - 2 * c) : 0;
    this.pov += (povTarget - this.pov) * (1 - Math.exp(-dt / (povTarget > this.pov ? POV_IN_TAU_S : POV_OUT_TAU_S)));
    if (this.pov < 1e-3) this.pov = 0;
    let cam = this.pos.clone();
    if (this.pov > 0) {
      // The shore side of her run: away from the wall.
      const d = new Vector3(b.water.dirX, 0, b.water.dirZ), side = new Vector3(-D.z, 0, D.x);
      if (side.dot(d) < 0) side.negate();
      const head = new Vector3(b.x, b.y + POV_UP_M, b.z).addScaledVector(D, -POV_BACK_M).addScaledVector(side, POV_SIDE_M);
      const ahead = new Vector3(b.x, b.y + 1.1, b.z).addScaledVector(D, POV_LOOK_AHEAD_M);
      const k = this.pov * this.pov * (3 - 2 * this.pov);
      cam = cam.lerp(head, k);
      lookAt = lookAt.lerp(ahead, k);
    }
    // The player's swing: the framed camera and its aim turned around the rider by the yaw, raised or lowered by the
    // pitch (looking up drops the camera), its height kept within LOOK_ELEVATION_DEG.
    if (this.yawOff !== 0 || this.pitchOff !== 0) {
      const pivot = new Vector3(b.x, b.y + 1, b.z);
      const turn = (v: Vector3): void => {
        const t = this.yawOff * DEG, c = Math.cos(t), s = Math.sin(t), x = v.x - pivot.x, z = v.z - pivot.z;
        v.x = pivot.x + x * c - z * s;
        v.z = pivot.z + z * c + x * s;
      };
      turn(cam);
      turn(lookAt);
      const off = cam.clone().sub(pivot), flat = Math.hypot(off.x, off.z), r = off.length();
      const el = Math.max(LOOK_ELEVATION_DEG[0], Math.min(LOOK_ELEVATION_DEG[1], Math.atan2(off.y, flat) / DEG - this.pitchOff)) * DEG;
      const k = flat > 1e-6 ? (r * Math.cos(el)) / flat : 0;
      cam.set(pivot.x + off.x * k, pivot.y + r * Math.sin(el), pivot.z + off.z * k);
    }
    if (this.pov < 0.5) cam.y = Math.max(cam.y, waterY(cam.x, cam.z) + 0.5);
    const look = lookAt.sub(cam);
    const yawDeg = Math.atan2(look.x, -look.z) / DEG;
    const pitchDeg = Math.atan2(look.y, Math.hypot(look.x, look.z)) / DEG;
    return { mode: 'free', position: [cam.x, cam.y, cam.z], yawDeg: ((yawDeg % 360) + 360) % 360, pitchDeg };
  }
}
