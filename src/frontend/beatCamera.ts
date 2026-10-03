// src/frontend/beatCamera.ts
import * as THREE from 'three/webgpu';
import type { CameraPose } from '../dev/momentLink';
import { WOMB_LINEUP } from '../land/tracks';
import { GANG_SPACING_M } from '../surfer/gang';
import { type LandSpot, headingAxes } from '../surfer/placement';
import { PRESETS, type PresetName } from '../surfer/presets';
import { RIDER_ORDER } from './riderCopy';

export interface CrewPlace {
  preset: PresetName;
  x: number;
  z: number;
  headingDeg: number;
}

/**
 * In Choose your rider the crew stand this far apart. At 1.05 m a neighbour shows at the frame's left edge, and at
 * 1.7 m (the plan's first ruling) the right-hand one still peeks out left of the panel's raked edge; 2.1 m hides both.
 */
export const SELECT_SPACING_M = 2.1;
export const CAMERA_FOV_DEG = 60;

export const SHOT = {
  cond: { backM: 3.8, upM: 2.3, yawNudgeDeg: -9 },
  rider: { distM: 2.35, heightM: 0.95, offDeg: 18, atX: 0.33 },
  gear: { distM: 2.1, heightM: 1.35, offDeg: 30, atX: 0.3 },
} as const;

const DEG = Math.PI / 180;

export const stagingReady = (land: { trackNetwork: unknown } | null): boolean => !!land && !!land.trackNetwork;

/**
 * The crew's places by beat. Both beats' cameras look seaward, so the crew's order on screen is the same in each:
 * T-Bone, Shazza, Grommet left to right (the roster's order). Conditions: facing the sea, side by side. Choose your
 * rider and Grab your gear: turned to face inland and spread 1.7 m apart, the outer two side-stepping outward.
 */
export function crewFor(beat: 'conditions' | 'rider' | 'gear', stand: LandSpot): CrewPlace[] {
  if (beat === 'conditions') {
    const heading = (stand.headingDeg + 180) % 360, { right } = headingAxes(heading);
    const at = (k: number) => ({ x: stand.x + right[0] * k * GANG_SPACING_M, z: stand.z + right[1] * k * GANG_SPACING_M });
    // From behind, the screen's left is the crew's left (−right).
    return [
      { preset: 'male', ...at(-1), headingDeg: heading },
      { preset: 'female', ...at(0), headingDeg: heading },
      { preset: 'grommet', ...at(1), headingDeg: heading },
    ];
  }
  // Facing inland, the camera in front of them: their right is the screen's left.
  const heading = stand.headingDeg, { right } = headingAxes(heading);
  return RIDER_ORDER.map((preset, i) => {
    const k = 1 - i; // T-Bone +1 (screen left), Shazza 0, Grommet −1
    return { preset, x: stand.x + right[0] * k * SELECT_SPACING_M, z: stand.z + right[1] * k * SELECT_SPACING_M, headingDeg: heading };
  });
}

const aim = (from: readonly number[], to: readonly number[]): { yawDeg: number; pitchDeg: number } => {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yawDeg: ((Math.atan2(dx, -dz) / DEG) % 360 + 360) % 360, pitchDeg: Math.atan2(dy, Math.hypot(dx, dz)) / DEG };
};

/** The yaw past a subject that puts it at `atX` of the frame's width (60° vertical field, 16:9). */
const offsetFor = (atX: number): number => Math.atan((0.5 - atX) * 2 * Math.tan((CAMERA_FOV_DEG / 2) * DEG) * (16 / 9)) / DEG;

/** Conditions: 3.8 m behind and 2.3 m above the crew's centre, looking at the lineup, the crew centre-right. */
export function conditionsShot(stand: LandSpot, ground: (x: number, z: number) => number, lineup: { x: number; z: number } = WOMB_LINEUP): CameraPose {
  const { fwd } = headingAxes(stand.headingDeg); // the stand spot faces inland: behind the crew (facing the sea) is along it
  const x = stand.x + fwd[0] * SHOT.cond.backM, z = stand.z + fwd[1] * SHOT.cond.backM;
  const y = Math.max(ground(stand.x, stand.z) + SHOT.cond.upM, ground(x, z) + 0.6);
  const a = aim([x, y, z], [lineup.x, 0, lineup.z]);
  return { mode: 'free', position: [x, y, z], yawDeg: (a.yawDeg + SHOT.cond.yawNudgeDeg + 360) % 360, pitchDeg: a.pitchDeg - 2 };
}

/** The camera looks at `aimM` above the rider's ground (a fraction of their height for the portrait, so every head sits alike). */
function portrait(place: CrewPlace, ground: (x: number, z: number) => number, s: { distM: number; heightM: number; offDeg: number; atX: number }, aimM: number): CameraPose {
  const h = (place.headingDeg + s.offDeg) * DEG;
  const x = place.x + Math.sin(h) * s.distM, z = place.z - Math.cos(h) * s.distM;
  const g = ground(place.x, place.z), y = Math.max(g + s.heightM, ground(x, z) + 0.4);
  const a = aim([x, y, z], [place.x, g + aimM, place.z]);
  return { mode: 'free', position: [x, y, z], yawDeg: (a.yawDeg + offsetFor(s.atX) + 360) % 360, pitchDeg: a.pitchDeg };
}

/** Choose your rider: 2.35 m away at 0.95 m, 18° off their facing, the rider in the left third (spec §4.2). */
export const riderShot = (place: CrewPlace, ground: (x: number, z: number) => number): CameraPose => portrait(place, ground, SHOT.rider, 0.62 * PRESETS[place.preset].heightM);

/** Grab your gear: a close 3/4 at 2.1 m, 1.35 m high, 30° off their facing, in the left half (spec §4.3). */
export const gearShot = (place: CrewPlace, ground: (x: number, z: number) => number): CameraPose => portrait(place, ground, SHOT.gear, 0.95);

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Between two shots, eased in and out, the yaw the short way round. */
export function easePose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  if (t <= 0) return a;
  const k = ease(Math.min(1, t));
  const dy = ((b.yawDeg - a.yawDeg + 540) % 360) - 180;
  const lerp = (p: number, q: number): number => p + (q - p) * k;
  return {
    mode: b.mode,
    position: [lerp(a.position[0], b.position[0]), lerp(a.position[1], b.position[1]), lerp(a.position[2], b.position[2])],
    yawDeg: (((a.yawDeg + dy * k) % 360) + 360) % 360,
    pitchDeg: lerp(a.pitchDeg, b.pitchDeg),
  };
}

/** A camera at a pose (CameraRig's convention: yaw 0 looks along −z, 90 along +x; pitch up positive). */
export function poseCamera(pose: CameraPose, aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, aspect, 0.05, 2000);
  const [x, y, z] = pose.position, yaw = pose.yawDeg * DEG, pitch = pose.pitchDeg * DEG;
  cam.position.set(x, y, z);
  cam.lookAt(x + Math.sin(yaw) * Math.cos(pitch), y + Math.sin(pitch), z - Math.cos(yaw) * Math.cos(pitch));
  cam.updateMatrixWorld();
  return cam;
}
