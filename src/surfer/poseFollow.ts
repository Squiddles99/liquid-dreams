import { Quaternion, Vector3 } from 'three/webgpu';
import type { RiderDrive } from '../ride/riderBody';
import type { ClipSample } from './clipPlayer';
import { type BlendWeights, blendWeights, toeRailDown } from './poseBlend';
import type { PoseDials } from './poses';
import type { Stance } from './presets';
import { BONES } from './rig';
import { type BoardFrame, type SolvedPose, boardQuaternion } from './solvePose';

/**
 * What the body shows follows what the ride asks for at a real body's pace (Andrew 2026-10-15: the blend snapped,
 * crouch ↔ stand above all). The physics' dials jump as fast as the game lets them (a stall in 0.2 s, the legs at
 * COM_RATE); each layer's weight, the pump's rail, and the crouch, lean and twist dials chase them through two critically
 * damped springs in a row: the body starts gently, peaks mid-move and settles (95 %) by the times below, with no jump in
 * speed or in acceleration (a person's minimum-jerk reach). The physics is untouched.
 */
/** Seconds to settle, into a pose and out of it: a crouch goes down quicker than the legs push back up under load; the
 * tall and stand-up stalls are the rise, so slower in. A full tuck from standing (~0.5 m of hip travel, the hand ~1 m to
 * the rail) in 0.85 s peaks near 1.2 m/s at the hips, a fast real squat's descent. */
export const FOLLOW = {
  pump: { in: 0.7, out: 0.8 },
  tuck: { in: 0.85, out: 0.95 },
  stallTall: { in: 0.85, out: 0.7 },
  stallHand: { in: 0.75, out: 0.85 },
  stallLowBarrel: { in: 0.75, out: 0.9 },
  stallStandBarrel: { in: 0.85, out: 0.75 },
  driveOut: { in: 0.6, out: 0.85 },
  /** The compression dial: in = crouching (it grows), out = rising. */
  compression: { in: 0.75, out: 0.95 },
} as const;
/** The lean and twist (the carve), the pump's rail (toe ↔ heel half) and its phase, and the fade from another pose. */
export const LEAN_S = 0.7, TOE_S = 0.6, PHASE_S = 0.25, FADE_S = 0.6;
/** The fastest the body pumps (cycles a second): Andrew's approved pump clip's pace (0.6 a second; he asked for it
 * slower and smoother). The physics' legs can pump much faster (COM_RATE, ~3 a second): the body then skips a pump,
 * never hurries. Its speed through the cycle eases to what it needs over PUMP_SPEED_S. */
export const PUMP_MAX_HZ = 0.6, PUMP_SPEED_S = 0.35;

/** 95 % settled at ωt ≈ 4.74 for one critically damped spring from rest… */
const OMEGA_95 = 4.744;
/** …and at ωt ≈ 7.75 for two in a row (the step response 1 − e^(−s)(1 + s + s²/2 + s³/6)). */
const OMEGA2_95 = 7.754;
/** One step of a critically damped spring toward `target`, settling (95 %) in `settleS`; solved exactly, any dt. */
export function spring(x: number, v: number, target: number, settleS: number, dt: number, omega95 = OMEGA_95): [number, number] {
  const w = omega95 / settleS, e = x - target, a = v + w * e, k = Math.exp(-w * dt);
  return [target + (e + a * dt) * k, (v - w * a * dt) * k];
}
/** Two springs in a row: the first chases the target, the body follows the first (no jump in acceleration). */
export interface Smooth { y: number; vy: number; x: number; v: number }
export const smoothAt = (x: number): Smooth => ({ y: x, vy: 0, x, v: 0 });
export function stepSmooth(s: Smooth, target: number, settleS: number, dt: number): number {
  [s.y, s.vy] = spring(s.y, s.vy, target, settleS, dt, OMEGA2_95);
  [s.x, s.v] = spring(s.x, s.v, s.y, settleS, dt, OMEGA2_95);
  return s.x;
}

type Layer = keyof BlendWeights;
const LAYERS: Layer[] = ['pump', 'tuck', 'stallTall', 'stallHand', 'stallLowBarrel', 'stallStandBarrel', 'driveOut'];
export interface Follow {
  w: Record<Layer, Smooth>;
  toe: Smooth;
  /** The pump's phase unwrapped (whole cycles counted), so a new pump runs on from the top instead of back. */
  phase: number; phaseV: Smooth; cycles: number; lastRaw: number;
  compression: Smooth; lean: Smooth; twist: Smooth;
  /** The pose shown before the blend took over (sampleFromSolved), fading out over FADE_S; null when none. */
  from: ClipSample | null;
  fadeT: number;
}
export function newFollow(): Follow {
  return {
    w: Object.fromEntries(LAYERS.map((k) => [k, smoothAt(0)])) as Record<Layer, Smooth>,
    toe: smoothAt(1), phase: 0, phaseV: smoothAt(0), cycles: 0, lastRaw: 0,
    compression: smoothAt(0), lean: smoothAt(0), twist: smoothAt(0), from: null, fadeT: 0,
  };
}

export interface Followed { w: BlendWeights; toe: number; phase: number; dials: PoseDials; from?: { sample: ClipSample; k: number } }
/** 0 → 1 with no jump in speed or acceleration at either end. */
const smoother = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * x * (x * (6 * x - 15) + 10); };

/** One frame: everything the body shows, a step nearer what the ride asks for. */
export function stepFollow(f: Follow, d: RiderDrive & { pumpIdleT: number }, dials: PoseDials, stance: Stance, dt: number): Followed {
  const target = blendWeights(d), w = {} as BlendWeights;
  for (const k of LAYERS) {
    const s = f.w[k];
    w[k] = Math.max(0, stepSmooth(s, target[k], target[k] > s.y ? FOLLOW[k].in : FOLLOW[k].out, dt));
  }
  const sum = LAYERS.reduce((a, k) => a + w[k], 0);
  if (sum > 1) for (const k of LAYERS) w[k] /= sum;
  const toe = stepSmooth(f.toe, toeRailDown(d.carve, stance) ? 1 : 0, TOE_S, dt);
  // The phase runs top → bottom → top over 0 → 1 and a new pump starts back at 0: both ends are the clip's top (the
  // same key within 0.3°), so the body runs on through the top into the next pump. More than a pump behind, it skips one.
  if (d.pumpPhase < f.lastRaw - 0.5) f.cycles += 1;
  else if (d.pumpPhase > f.lastRaw + 0.5) f.cycles -= 1;
  f.lastRaw = d.pumpPhase;
  if (f.cycles + d.pumpPhase - f.phase > 1) f.cycles -= 1;
  // The body's speed through the cycle: what closes the gap in PHASE_S, never past the approved pace, eased to.
  const want = Math.max(-PUMP_MAX_HZ, Math.min(PUMP_MAX_HZ, (f.cycles + d.pumpPhase - f.phase) / PHASE_S));
  f.phase += stepSmooth(f.phaseV, want, PUMP_SPEED_S, dt) * dt;
  const cIn = dials.compression > f.compression.y;
  const out: PoseDials = {
    compression: stepSmooth(f.compression, dials.compression, cIn ? FOLLOW.compression.in : FOLLOW.compression.out, dt),
    lean: stepSmooth(f.lean, dials.lean, LEAN_S, dt),
    twist: stepSmooth(f.twist, dials.twist, LEAN_S, dt),
    reach: dials.reach,
  };
  let from: Followed['from'];
  if (f.from) {
    from = { sample: f.from, k: 1 - smoother(f.fadeT / FADE_S) };
    f.fadeT += dt;
    if (f.fadeT >= FADE_S) { f.from = null; f.fadeT = 0; }
  }
  return { w, toe: Math.min(1, Math.max(0, toe)), phase: f.phase - Math.floor(f.phase), dials: out, from };
}

/** A solved pose (the code poses': the drop, the pop-up) as a clip sample, so the blend can fade from it with the feet
 * planted (clipPose's IK): each bone's rotation from rest in the stance's character frame, the pelvis likewise. */
export function sampleFromSolved(p: SolvedPose, board: BoardFrame, stance: Stance, restQ?: Partial<Record<string, Quaternion>>): ClipSample {
  const toBoard = boardQuaternion(board).invert();
  const S = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), stance === 'regular' ? 0 : Math.PI).invert();
  const rot: Partial<Record<string, Quaternion>> = {};
  for (const b of BONES) {
    if (b === 'root') continue;
    const r = restQ?.[b];
    rot[b] = S.clone().multiply(toBoard).multiply(p.world[b]).multiply(r ? r.clone().invert() : new Quaternion());
  }
  return { pelvis: p.pelvisWorld.clone().sub(board.position).applyQuaternion(toBoard).applyQuaternion(S), rot };
}
