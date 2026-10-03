import type { TrackNetwork } from '../land/tracks';
import { Vector3 } from 'three/webgpu';
import type { CameraPose } from '../dev/momentLink';
import type { BoardFrame } from './solvePose';

/** HeightProbe slots the stand uses: 1–4 (slot 0 is the camera's). */
export const STAND_PROBE_FIRST = 1;
/** How far a board with a rider sits into the water. */
export const SINK_M = 0.03;
const DEG = Math.PI / 180;
const CHASE_BACK_M = 4.5, CHASE_UP_M = 1.8;

export interface Placement {
  x: number;
  z: number;
  headingDeg: number;
  heightNudgeM: number;
  pitchNudgeDeg: number;
}

/** Compass heading → the nose's and the right rail's horizontal directions (north = −z, east = +x). */
export function headingAxes(deg: number): { fwd: [number, number]; right: [number, number] } {
  const h = deg * DEG;
  return { fwd: [Math.sin(h), -Math.cos(h)], right: [Math.cos(h), Math.sin(h)] };
}

/** Where to read the water: nose, tail (80% of the way out), right rail, left rail. */
export function probePoints(p: Placement, halfLen: number, halfWidth: number): [number, number][] {
  const { fwd, right } = headingAxes(p.headingDeg), l = 0.8 * halfLen;
  return [
    [p.x + fwd[0] * l, p.z + fwd[1] * l], [p.x - fwd[0] * l, p.z - fwd[1] * l],
    [p.x + right[0] * halfWidth, p.z + right[1] * halfWidth], [p.x - right[0] * halfWidth, p.z - right[1] * halfWidth],
  ];
}

/** The board on the water (spec §6): pitched by nose vs tail, rolled by the rails; the tide until the probe reads. */
export function boardFrameFrom(p: Placement, halfLen: number, halfWidth: number, heights: readonly (number | null)[], fallbackY: number): BoardFrame {
  const h = [0, 1, 2, 3].map((i) => heights[i] ?? fallbackY);
  const pitch = Math.atan2(h[0] - h[1], 1.6 * halfLen) + p.pitchNudgeDeg * DEG;
  const roll = Math.atan2(h[2] - h[3], 2 * halfWidth);
  const { fwd, right } = headingAxes(p.headingDeg);
  const forward = new Vector3(fwd[0] * Math.cos(pitch), Math.sin(pitch), fwd[1] * Math.cos(pitch));
  const right3 = new Vector3(right[0] * Math.cos(roll), Math.sin(roll), right[1] * Math.cos(roll));
  const up = new Vector3().crossVectors(right3, forward).normalize();
  const y = (h[0] + h[1] + h[2] + h[3]) / 4 - SINK_M + p.heightNudgeM;
  return { position: new Vector3(p.x, y, p.z), forward, up };
}

/** A rough chase view (spec §6): behind and above the board, looking along its heading at the rider's chest. */
/**
 * Where the eyes aim, 10 m out: the pose's board-frame look turned by the board's heading only, so the gaze holds level
 * while the board pitches and rolls under the rider (spec §3.6; it used to swing with the board).
 */
export function stableLookAt(frame: BoardFrame, look: Vector3): Vector3 {
  const fwd = new Vector3(frame.forward.x, 0, frame.forward.z);
  if (fwd.lengthSq() < 1e-10) fwd.set(1, 0, 0);
  fwd.normalize();
  const up = new Vector3(0, 1, 0), right = fwd.clone().cross(up);
  const dir = fwd.multiplyScalar(look.x).add(up.multiplyScalar(look.y)).add(right.multiplyScalar(look.z));
  if (dir.lengthSq() < 1e-10) dir.set(frame.forward.x, 0, frame.forward.z);
  return frame.position.clone().add(dir.normalize().multiplyScalar(10));
}

export function chaseCamera(frame: BoardFrame, headingDeg: number): CameraPose {
  const { fwd } = headingAxes(headingDeg);
  const pos: [number, number, number] = [frame.position.x - fwd[0] * CHASE_BACK_M, frame.position.y + CHASE_UP_M, frame.position.z - fwd[1] * CHASE_BACK_M];
  return { mode: 'free', position: pos, yawDeg: headingDeg, pitchDeg: -Math.atan2(CHASE_UP_M - 1.0, CHASE_BACK_M) / DEG };
}

/** Thong soles under the feet when walking (tools/surfer/clothes.py builds them 12 mm thick). */
export const SOLE_M = 0.012;

/**
 * Feet on the land (walking spec §4): a level frame at the spot, turned to the heading, on the land's height (or the
 * fallback while the land loads), lifted by the soles; the water isn't probed.
 */
export function groundFrame(p: Placement, groundY: number | null, fallbackY: number, liftM: number): BoardFrame {
  const { fwd } = headingAxes(p.headingDeg);
  const y = (groundY !== null && Number.isFinite(groundY) ? groundY : fallbackY) + liftM + p.heightNudgeM;
  return { position: new Vector3(p.x, y, p.z), forward: new Vector3(fwd[0], 0, fwd[1]), up: new Vector3(0, 1, 0) };
}

export interface LandSurface {
  heightAt(x: number, z: number): number;
  waterlineAt(z: number): number;
}
export interface LandSpot {
  x: number;
  z: number;
  headingDeg: number;
}
/** The Womb's lineup z (DEFAULT_SURFER_PARAMS.z): "above the Womb" is straight inland of it. */
export const WOMB_Z = 45;

export interface TrackedSurface extends LandSurface {
  trackNetwork: TrackNetwork | null;
}

/**
 * Named spots on land: the crew's stand spot in the junction clearing where the beach path leaves the Cape to Cape
 * (dune-up-close §4.1), facing inland to the gang camera with the break behind them; and the dry sand in front of the
 * lineup, facing the sea. `duneCrest` is the stand spot under its old name until the select screen (step 4) lands.
 */
export function landSpots(land: TrackedSurface, beach: { wetWidthM: number; dryWidthM: number }, z = WOMB_Z): { standSpot: LandSpot; duneCrest: LandSpot; beach: LandSpot } {
  if (!land.trackNetwork) throw new Error('landSpots: the land has no tracks yet (they come with its build)');
  const xs = land.waterlineAt(z), standSpot = land.trackNetwork.standSpot();
  return { standSpot, duneCrest: standSpot, beach: { x: xs + beach.wetWidthM + 0.6 * beach.dryWidthM, z, headingDeg: 270 } };
}

export function placeAhead(c: CameraPose): { x: number; z: number; headingDeg: number } {
  const { fwd } = headingAxes(c.yawDeg);
  const tidy = (v: number): number => Math.round(v * 1e6) / 1e6 || 0; // `|| 0` turns -0 into 0
  return { x: tidy(c.position[0] + fwd[0] * 6), z: tidy(c.position[2] + fwd[1] * 6), headingDeg: c.yawDeg };
}
