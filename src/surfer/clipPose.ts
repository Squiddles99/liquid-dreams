import { Quaternion, Vector3 } from 'three/webgpu';
import type { BoardLayout, BoardSpec } from '../board/boardSpec';
import type { Balance } from './balance';
import type { ClipSample } from './clipPlayer';
import { aimRotation, minReach, twoBoneIK } from './ik';
import type { HandTarget, PoseDials } from './poses';
import type { Stance } from './presets';
import { BONES, type BoneName, FINGER_BONES, type FingerBone, LIMITS, type Limb, PARENT, type SkeletonRest, measures } from './rig';
import { type BoardFrame, type SolvedPose, boardQuaternion } from './solvePose';

const DEG = Math.PI / 180;
const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1), NEG_Z = new Vector3(0, 0, -1);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The dials' reach on a clip (§4.1 step 3), the code poses' own (poses.ts LEAN_MAX, TWIST_DIAL; standing()'s 0.42). */
export const CLIP_LEAN_MAX = 35 * DEG;
export const CLIP_TWIST_DIAL = 0.6;
export const CLIP_COMPRESSION_DROP = 0.42;
/** A clip's own crouch before the dial (Andrew, Gate C: bend the knees a little more; a skater stands taller than a surfer). */
export const CLIP_BASE_COMPRESSION = 0.3;
/** The balance layer's hand drift (m) as small chest roll and pitch (rad per m, and the caps; §4.1 step 3). */
const BAL_ROLL = 1.5, BAL_ROLL_MAX = 0.06, BAL_PITCH = 0.75, BAL_PITCH_MAX = 0.04;
/** A clip turned to put its feet along the board is held to ±60° (Review Focus 4): a wrong-footed clip shows as such. */
const YAW_MAX = 60 * DEG;
/** The chest opened toward the nose on top of a clip, as the code trim's is (Andrew, Gate C): a skater's shoulders face
 * the rail more squarely than a surfer trimming, and the neck then did all the turning. */
export const CLIP_CHEST_OPEN = 20 * DEG;

export interface ClipPoseContext {
  spec: BoardSpec;
  layout: BoardLayout;
  stance: Stance;
  /** As for the code poses; `compression` already carries the balance layer's (SurferStand adds it). */
  dials: PoseDials;
  balance: Balance | null;
  /** The surfer pose's hand targets (Andrew, Gate C: a skater's arms hang; a surfer holds them out): when given, the
   * arms are solved to them as solvePose does, the clip keeping everything below the shoulders. */
  hands?: Record<Limb, HandTarget>;
}
export interface ClipSolved extends SolvedPose {
  /** The clip's finger bones' world rotations from rest; absent ones take the relaxed curl (Surfer.applyPose). */
  fingers: Partial<Record<FingerBone, Quaternion>>;
}

const SPINE_SHARE: Partial<Record<string, number>> = { spine_01: 1 / 3, spine_02: 2 / 3, spine_03: 1 };
const ABOVE_CHEST = new Set<string>(['neck', 'head', 'clavicle_l', 'upperarm_l', 'forearm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'forearm_r', 'hand_r', ...FINGER_BONES]);
const chestShare = (b: string): number => SPINE_SHARE[b] ?? (ABOVE_CHEST.has(b) ? 1 : 0);
const whole = (): number => 1;

/**
 * A clip's pose on the board (spec §4.1): the clip's rotations turned onto the board, its ankles' midpoint over the
 * stance spots' midpoint, the dials and the balance as corrections on top, then two-bone IK pinning each ankle on its
 * spot (the knee bending the clip's way, the hips giving way if a leg can't reach) and the head turned to `lookAt`.
 * Worked in the board frame, returned in world terms in solvePose's shape.
 */
export function clipPose(rest: SkeletonRest, sample: ClipSample, ctx: ClipPoseContext, board: BoardFrame, lookAt: Vector3 | null): ClipSolved {
  const m = measures(rest), regular = ctx.stance === 'regular';
  const f = new Vector3(0, 0, regular ? 1 : -1); // the toes' way
  const leanAxis = Y.clone().cross(f).normalize();
  const lead: Limb = regular ? 'l' : 'r', trail: Limb = regular ? 'r' : 'l';

  // The clip's rotations in the board frame: its character frame turned to face the stance's rail.
  const S = new Quaternion().setFromAxisAngle(Y, regular ? 0 : Math.PI);
  const D = {} as Record<BoneName, Quaternion>;
  for (const b of BONES) D[b] = b === 'root' ? new Quaternion() : S.clone().multiply(sample.rot[b] ?? new Quaternion());
  const F: Partial<Record<FingerBone, Quaternion>> = {};
  for (const g of FINGER_BONES) { const q = sample.rot[g]; if (q) F[g] = S.clone().multiply(q); }
  let P = sample.pelvis.clone().applyQuaternion(S);
  const turn = (q: Quaternion, share: (b: string) => number): void => {
    const by = (k: number): Quaternion => (k === 1 ? q.clone() : new Quaternion().slerp(q, k));
    for (const b of BONES) { const k = share(b); if (b !== 'root' && k > 0) D[b] = by(k).multiply(D[b]); }
    for (const g of Object.keys(F) as FingerBone[]) { const k = share(g); if (k > 0) F[g] = by(k).multiply(F[g]!); }
  };

  const offset = (b: BoneName): Vector3 => rest.joint[b].clone().sub(rest.joint[PARENT[b]!]);
  const restDir = (a: BoneName, b: BoneName): Vector3 => rest.joint[b].clone().sub(rest.joint[a]).normalize();
  const len = (a: BoneName, b: BoneName): number => rest.joint[a].distanceTo(rest.joint[b]);
  const J = {} as Record<BoneName, Vector3>;
  const fk = (b: BoneName): Vector3 => J[PARENT[b]!].clone().add(offset(b).applyQuaternion(D[PARENT[b]!]));
  const fkAll = (): void => {
    J.root = rest.joint.root.clone();
    J.pelvis = P.clone();
    for (const b of BONES) if (b !== 'root' && b !== 'pelvis') J[b] = fk(b);
  };

  // Feet along the board: turn about the vertical so the trail→lead ankle line runs to the nose (±60° at most).
  fkAll();
  const line = J[`foot_${lead}`].clone().sub(J[`foot_${trail}`]).setY(0);
  if (line.lengthSq() > 1e-8) {
    const yaw = new Quaternion().setFromAxisAngle(Y, clamp(Math.atan2(line.z, line.x), -YAW_MAX, YAW_MAX));
    turn(yaw, whole);
    P.applyQuaternion(yaw);
  }
  // The ankles' midpoint over the spots' midpoint.
  const ankleAt = { l: new Vector3(), r: new Vector3() };
  ankleAt[lead] = new Vector3(...ctx.layout.spots.front).add(new Vector3(0, m.ankleH, 0));
  ankleAt[trail] = new Vector3(...ctx.layout.spots.back).add(new Vector3(0, m.ankleH, 0));
  const pivot = ankleAt.l.clone().add(ankleAt.r).multiplyScalar(0.5);
  fkAll();
  P.add(pivot.clone().sub(J.foot_l.clone().add(J.foot_r).multiplyScalar(0.5)));

  // The dials and the balance, as corrections on top of the clip.
  P.y -= CLIP_COMPRESSION_DROP * m.legLen * clamp(CLIP_BASE_COMPRESSION + ctx.dials.compression, -1, 1.3);
  const lean = clamp(ctx.dials.lean, -1, 1) * CLIP_LEAN_MAX;
  if (lean !== 0) {
    const q = new Quaternion().setFromAxisAngle(leanAxis, lean);
    turn(q, whole);
    P = P.sub(pivot).applyQuaternion(q).add(pivot);
  }
  const twist = (regular ? 1 : -1) * (CLIP_CHEST_OPEN + clamp(ctx.dials.twist, -1, 1) * CLIP_TWIST_DIAL);
  if (twist !== 0) turn(new Quaternion().setFromAxisAngle(Y.clone().applyQuaternion(D.pelvis), twist), chestShare);
  if (ctx.balance) {
    const { lead: bl, trail: bt } = ctx.balance;
    const roll = clamp((bl.y - bt.y) * BAL_ROLL, -BAL_ROLL_MAX, BAL_ROLL_MAX), pitch = clamp((bl.z + bt.z) * BAL_PITCH, -BAL_PITCH_MAX, BAL_PITCH_MAX);
    turn(new Quaternion().setFromAxisAngle(Z, roll).multiply(new Quaternion().setFromAxisAngle(leanAxis, pitch)), chestShare);
  }
  fkAll();

  // The legs: each knee keeps the clip's bend direction; each foot keeps the clip's angle on the deck.
  const pole = {} as Record<Limb, Vector3>, footDir = {} as Record<Limb, Vector3>;
  for (const s of ['l', 'r'] as const) {
    const p = J[`shin_${s}`].clone().sub(J[`thigh_${s}`].clone().add(J[`foot_${s}`]).multiplyScalar(0.5));
    pole[s] = p.length() > 0.01 ? p.normalize() : f.clone();
    const d = J[`toe_${s}`].clone().sub(J[`foot_${s}`]).setY(0);
    footDir[s] = d.lengthSq() > 1e-8 ? d.normalize() : f.clone();
  }
  const legs = (['l', 'r'] as const).map((s) => {
    const l1 = len(`thigh_${s}`, `shin_${s}`), l2 = len(`shin_${s}`, `foot_${s}`);
    return { s, l1, l2, maxR: (l1 + l2) * 0.995, minR: minReach(l1, l2, LIMITS.kneeMaxDeg) * 1.01, hipOffset: rest.joint[`thigh_${s}`].clone().sub(rest.joint.pelvis).applyQuaternion(D.pelvis) };
  });
  // Move the hips (never the feet) until each ankle is in reach: planted feet stay planted (as solvePose).
  for (let it = 0; it < 16; it++) {
    let moved = false;
    for (const g of legs) {
      const v = ankleAt[g.s].clone().sub(P).sub(g.hipOffset), d = v.length();
      if (d > g.maxR) { P.add(v.multiplyScalar((d - g.maxR + 1e-4) / d)); moved = true; }
      else if (d < g.minR) { P.add(d > 1e-6 ? v.multiplyScalar(-(g.minR - d + 1e-4) / d) : Y.clone().multiplyScalar(g.minR)); moved = true; }
    }
    if (!moved) break;
  }
  fkAll();
  for (const g of legs) {
    const th: BoneName = `thigh_${g.s}`, sh: BoneName = `shin_${g.s}`, ft: BoneName = `foot_${g.s}`, to: BoneName = `toe_${g.s}`;
    const ik = twoBoneIK(J[th], ankleAt[g.s], g.l1, g.l2, pole[g.s], LIMITS.kneeMaxDeg);
    D[th] = aimRotation(restDir(th, sh), Z, ik.mid.clone().sub(J[th]), pole[g.s]);
    J[sh] = fk(sh);
    D[sh] = aimRotation(restDir(sh, ft), Z, ik.end.clone().sub(J[sh]), pole[g.s]);
    J[ft] = fk(ft);
    const toe = ankleAt[g.s].clone().add(new Vector3(0, m.toeH - m.ankleH, 0)).add(footDir[g.s].clone().multiplyScalar(m.footLenH));
    D[ft] = aimRotation(restDir(ft, to), Y, toe.sub(J[ft]), Y);
    J[to] = fk(to);
    D[to] = D[ft].clone();
  }

  // The arms from the surfer pose's targets, when given: the clavicles ride the chest, two-bone IK to each hand (elbow
  // toward its pole), the hand following the forearm and the fingers relaxed (as solvePose).
  if (ctx.hands) for (const s of ['l', 'r'] as const) {
    const cl: BoneName = `clavicle_${s}`, ua: BoneName = `upperarm_${s}`, fa: BoneName = `forearm_${s}`, h: BoneName = `hand_${s}`;
    const Ds3 = D.spine_03, ht = ctx.hands[s];
    D[cl] = Ds3.clone();
    J[cl] = fk(cl);
    J[ua] = fk(ua);
    const target = ht.frame === 'board' ? ht.pos.clone() : J.spine_03.clone().add(ht.pos.clone().applyQuaternion(Ds3));
    const pole = ht.frame === 'board' ? ht.pole.clone() : ht.pole.clone().applyQuaternion(Ds3);
    const ik = twoBoneIK(J[ua], target, len(ua, fa), len(fa, h), pole, LIMITS.elbowMaxDeg);
    D[ua] = aimRotation(restDir(ua, fa), NEG_Z, ik.mid.clone().sub(J[ua]), pole);
    J[fa] = fk(fa);
    D[fa] = aimRotation(restDir(fa, h), NEG_Z, ik.end.clone().sub(J[fa]), pole);
    J[h] = fk(h);
    D[h] = D[fa].clone();
    for (const g of Object.keys(F) as FingerBone[]) if (g.endsWith(`_${s}`)) delete F[g];
  }

  // The head looks where the game says, off the chest as in solvePose (the neck takes 40%), not the capture's own neck
  // (Andrew, Gate C: CMU's skater glances down at the deck; a surfer trimming looks down the line).
  const Qb = boardQuaternion(board), Ds3 = D.spine_03;
  let look = new Quaternion();
  if (lookAt) {
    const dir = lookAt.clone().sub(board.position).applyQuaternion(Qb.clone().invert()).sub(J.neck).normalize().applyQuaternion(Ds3.clone().invert());
    const yaw = clamp(Math.atan2(dir.x, dir.z), -LIMITS.headYawMaxDeg * DEG, LIMITS.headYawMaxDeg * DEG);
    const pitch = clamp(Math.asin(clamp(dir.y, -1, 1)), -LIMITS.headPitchDownDeg * DEG, LIMITS.headPitchUpDeg * DEG);
    look = new Quaternion().setFromAxisAngle(Y, yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -pitch));
  }
  D.neck = Ds3.clone().multiply(new Quaternion().slerp(look, 0.4));
  J.head = fk('head');
  D.head = Ds3.clone().multiply(look);

  // Board frame → world, in solvePose's shape (root stays the skeleton's origin, as there).
  const toW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Qb).add(board.position);
  const joint = {} as Record<BoneName, Vector3>, world = {} as Record<BoneName, Quaternion>, local = {} as Record<BoneName, Quaternion>;
  for (const b of BONES) joint[b] = b === 'root' ? rest.joint.root.clone() : toW(J[b]);
  for (const b of BONES) world[b] = (b === 'root' ? new Quaternion() : Qb.clone().multiply(D[b])).multiply(rest.restQ[b]);
  for (const b of BONES) { const p = PARENT[b]; local[b] = p ? world[p].clone().invert().multiply(world[b]) : world[b].clone(); }
  const fingers: Partial<Record<FingerBone, Quaternion>> = {};
  for (const g of Object.keys(F) as FingerBone[]) fingers[g] = Qb.clone().multiply(F[g]!);
  return { pelvisWorld: toW(P), joint, world, local, fingers };
}
