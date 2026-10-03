import { Vector3 } from 'three/webgpu';
import { type BoardSpec, bottomYAt, deckYAt, halfWidthAt, uAt } from '../board/boardSpec';
import type { FootTarget } from './poses';
import type { Limb } from './rig';
import { type BoardFrame, type SolvedPose, boardQuaternion } from './solvePose';

/** Limb radii for clearance, as fractions of height (measured off the built bodies; tuned at the gate). */
export const LIMB_RADIUS = { thigh: 0.045, shin: 0.032, torso: 0.075, upperarm: 0.026, forearm: 0.022 } as const;
/** The palm and fingers past the hand joint, as a fraction of height: how far the fingers reach round a rail. */
export const HAND_REACH = 0.075;

/** The build's materials on a rider's back: the pack, its straps, and what's strapped to it (tools/surfer/packs.py). */
export const PACK_PARTS = ['pack', 'packTrim', 'neoprene', 'fins', 'towel'] as const;

/** The carry's board (walking spec §4), from the pose. */
export interface CarryBoard {
  side: Limb;
  /** The board's frame in the ground frame (+x the heading, +y up, +z the character's right). */
  board: BoardFrame;
  /** The carrying hand's target in the ground frame (the wrist). */
  hand: Vector3;
}

/**
 * The carried board in the world (walking spec §4: it follows the arm, not the feet): the pose's board, moved by however
 * far the solved hand sits from its target.
 */
export function carriedBoard(c: CarryBoard, ground: BoardFrame, solved: SolvedPose): BoardFrame {
  const Q = boardQuaternion(ground);
  const toW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Q).add(ground.position);
  const shift = solved.joint[`hand_${c.side}`].clone().sub(toW(c.hand));
  return { position: toW(c.board.position).add(shift), forward: c.board.forward.clone().applyQuaternion(Q), up: c.board.up.clone().applyQuaternion(Q) };
}

/** A box: its centre, unit axes and half sizes along them. */
export interface Box {
  centre: Vector3;
  axes: [Vector3, Vector3, Vector3];
  half: [number, number, number];
}

const SLICES = 12;
/** Bands across the width: the rails are thin and round, so a box the board's full thickness out to the rail would
 * stand ~2 cm proud of it at the corners. */
const BANDS: readonly [number, number][] = [[0, 0.6], [0.6, 0.85], [0.85, 1]];

/**
 * The board as boxes in the world: 12 slices along its length, each spanning its rocker, and across it a thick middle
 * and thinner bands toward each rail (the real section's deck and bottom at each band's inner edge).
 */
export function boardBoxes(frame: BoardFrame, spec: BoardSpec): Box[] {
  const Q = boardQuaternion(frame);
  const axes: [Vector3, Vector3, Vector3] = [new Vector3(1, 0, 0).applyQuaternion(Q), new Vector3(0, 1, 0).applyQuaternion(Q), new Vector3(0, 0, 1).applyQuaternion(Q)];
  const L = spec.lengthM, out: Box[] = [];
  for (let i = 0; i < SLICES; i++) {
    const x0 = -L / 2 + (i * L) / SLICES, x1 = x0 + L / SLICES, xs = [x0, (x0 + x1) / 2, x1];
    const W = Math.max(...xs.map((x) => halfWidthAt(spec, uAt(spec, x))));
    for (const [f0, f1] of BANDS) {
      let lo = Infinity, hi = -Infinity;
      for (const x of xs) {
        const z = Math.min(f0 * W, 0.999 * halfWidthAt(spec, uAt(spec, x)));
        lo = Math.min(lo, bottomYAt(spec, x, z));
        hi = Math.max(hi, deckYAt(spec, x, z));
      }
      const zs = f0 === 0 ? [0] : [-(f0 + f1) / 2, (f0 + f1) / 2];
      for (const zc of zs) {
        const local = new Vector3((x0 + x1) / 2, (lo + hi) / 2, zc * W);
        out.push({ centre: local.applyQuaternion(Q).add(frame.position), axes, half: [L / SLICES / 2, (hi - lo) / 2, f0 === 0 ? f1 * W : ((f1 - f0) * W) / 2] });
      }
    }
  }
  return out;
}

function pointBox(p: Vector3, b: Box): number {
  const d = p.clone().sub(b.centre);
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const e = Math.abs(d.dot(b.axes[k])) - b.half[k];
    if (e > 0) s += e * e;
  }
  return Math.sqrt(s);
}

/** The shortest distance from segment a–b to any of the boxes (0 inside), sampled every ~1 cm (at least 24 steps). */
export function distanceToBoxes(a: Vector3, b: Vector3, boxes: readonly Box[]): number {
  const n = Math.max(24, Math.ceil(a.distanceTo(b) / 0.01));
  let best = Infinity;
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    for (const box of boxes) best = Math.min(best, pointBox(p, box));
  }
  return best;
}

/** The steepest ground a foot tilts to stand flat on (rad); past it the foot stays at this tilt. */
const FOOT_TILT_MAX = 35 * Math.PI / 180;

/**
 * Each foot flat on the ground under it (final review: a level frame on a cross-slope buried one foot and floated the
 * other; Gate A: on the dune's slope the soles sank, the whole foot lifted by the ground under the ankle alone). The
 * ankle rises with the ground under it and the ball with the ground under it, so the foot pitches with the slope, and the
 * instep turns to the ground's normal (from a third sample beside the foot), so it rolls with it; plus the soles, less the
 * frame's height (the targets are frame-relative, the frame level). Where the ground is unknown the foot stays.
 */
export function feetOnGround(feet: Record<Limb, FootTarget>, frame: BoardFrame, ground: (x: number, z: number) => number | null, liftM: number): void {
  const Q = boardQuaternion(frame), toFrame = Q.clone().invert();
  const at = (x: number, z: number): number | null => {
    const g = ground(x, z);
    return g === null || !Number.isFinite(g) ? null : g;
  };
  for (const s of ['l', 'r'] as const) {
    const f = feet[s];
    const a = f.ankle.clone().applyQuaternion(Q).add(frame.position), b = f.toe.clone().applyQuaternion(Q).add(frame.position);
    const gA = at(a.x, a.z);
    if (gA === null) continue;
    const gB = at(b.x, b.z) ?? gA;
    // Beside the ankle, square to the foot (on the ground plane): the third point that gives the ground its roll.
    const along = new Vector3(b.x - a.x, 0, b.z - a.z);
    if (along.lengthSq() < 1e-8) along.set(1, 0, 0);
    along.normalize();
    const side = new Vector3(-along.z, 0, along.x).multiplyScalar(0.06);
    const gS = at(a.x + side.x, a.z + side.z) ?? gA;
    const pA = new Vector3(a.x, gA, a.z), pB = new Vector3(b.x, gB, b.z), pS = new Vector3(a.x + side.x, gS, a.z + side.z);
    const n = pB.clone().sub(pA).cross(pS.clone().sub(pA)).normalize();
    if (n.y < 0) n.negate();
    if (!(n.y > 0) || Number.isNaN(n.x)) n.set(0, 1, 0);
    const tilt = Math.acos(Math.min(1, n.y));
    if (tilt > FOOT_TILT_MAX) {
      const flat = new Vector3(n.x, 0, n.z).normalize();
      n.copy(flat.multiplyScalar(Math.sin(FOOT_TILT_MAX))).setY(Math.cos(FOOT_TILT_MAX));
    }
    f.ankle.y += gA + liftM - frame.position.y;
    f.toe.y += gB + liftM - frame.position.y;
    f.instep = n.applyQuaternion(toFrame);
  }
}
