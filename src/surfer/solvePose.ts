import { Quaternion, Vector3 } from 'three/webgpu';
import { aimRotation, basisQ, minReach, twoBoneIK } from './ik';
import type { PoseTargets } from './poses';
import { BONES, type BoneName, LIMITS, type Limb, PARENT, type SkeletonRest } from './rig';

export interface BoardFrame {
  position: Vector3;
  /** Toward the nose. */
  forward: Vector3;
  /** The deck's normal. */
  up: Vector3;
}

export interface SolvedPose {
  pelvisWorld: Vector3;
  /** Every bone's joint, world space. */
  joint: Record<BoneName, Vector3>;
  world: Record<BoneName, Quaternion>;
  /** Relative to the parent bone: what three's Bone.quaternion takes. */
  local: Record<BoneName, Quaternion>;
}

const DEG = Math.PI / 180;
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1), NEG_Z = new Vector3(0, 0, -1);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Board frame → world: +x to `forward`, +y to `up`, +z to forward × up (the right rail). */
export function boardQuaternion(b: BoardFrame): Quaternion {
  return basisQ(b.forward, b.up);
}

function chestRotation(c: PoseTargets['chest']): Quaternion {
  const q = new Quaternion().setFromAxisAngle(Y, clamp(c.twist, -60 * DEG, 60 * DEG))
    .multiply(new Quaternion().setFromAxisAngle(X, clamp(c.bend, -60 * DEG, 80 * DEG)))
    .multiply(new Quaternion().setFromAxisAngle(Z, clamp(c.side, -40 * DEG, 40 * DEG)));
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w))), max = 3 * LIMITS.spineBoneMaxDeg * DEG;
  return angle > max ? new Quaternion().slerp(q, max / angle) : q;
}

/**
 * Joint rotations for the targets (spec §3.2): the pelvis is moved as little as needed for both ankles to be reachable,
 * the chest's bend and twist are shared over the three spine bones, the legs and arms are solved by two-bone IK, and
 * the head turns toward `lookAt` within its limits.
 */
export function solvePose(rest: SkeletonRest, t: PoseTargets, board: BoardFrame, lookAt: Vector3 | null): SolvedPose {
  const Qb = boardQuaternion(board);
  const toW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Qb).add(board.position);
  const dirW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Qb);
  const D = {} as Record<BoneName, Quaternion>, J = {} as Record<BoneName, Vector3>;
  const offset = (b: BoneName): Vector3 => rest.joint[b].clone().sub(rest.joint[PARENT[b]!]);
  const fk = (b: BoneName): Vector3 => J[PARENT[b]!].clone().add(offset(b).applyQuaternion(D[PARENT[b]!]));
  const restDir = (a: BoneName, b: BoneName): Vector3 => rest.joint[b].clone().sub(rest.joint[a]).normalize();
  const len = (a: BoneName, b: BoneName): number => rest.joint[a].distanceTo(rest.joint[b]);

  const Dp = basisQ(dirW(t.pelvisUp), dirW(t.pelvisForward)).multiply(basisQ(Y, Z).invert());
  const P = toW(t.pelvis);
  const legs = (['l', 'r'] as const).map((s: Limb) => {
    const l1 = len(`thigh_${s}`, `shin_${s}`), l2 = len(`shin_${s}`, `foot_${s}`);
    return {
      s, l1, l2, maxR: (l1 + l2) * 0.995, minR: minReach(l1, l2, LIMITS.kneeMaxDeg) * 1.01,
      ankle: toW(t.feet[s].ankle), toe: toW(t.feet[s].toe), pole: dirW(t.feet[s].pole), instep: dirW(t.feet[s].instep),
      hipOffset: rest.joint[`thigh_${s}`].clone().sub(rest.joint.pelvis).applyQuaternion(Dp),
    };
  });
  // Move the pelvis (never the feet) until each ankle is within reach: planted feet stay planted.
  for (let it = 0; it < 16; it++) {
    let moved = false;
    for (const g of legs) {
      const v = g.ankle.clone().sub(P).sub(g.hipOffset), d = v.length();
      if (d > g.maxR) { P.add(v.multiplyScalar((d - g.maxR + 1e-4) / d)); moved = true; }
      else if (d < g.minR) { P.add(d > 1e-6 ? v.multiplyScalar(-(g.minR - d + 1e-4) / d) : dirW(Y).multiplyScalar(g.minR)); moved = true; }
    }
    if (!moved) break;
  }

  D.root = new Quaternion();
  J.root = rest.joint.root.clone();
  D.pelvis = Dp;
  J.pelvis = P;
  const chest = chestRotation(t.chest);
  (['spine_01', 'spine_02', 'spine_03'] as const).forEach((b, i) => {
    D[b] = Dp.clone().multiply(new Quaternion().slerp(chest, (i + 1) / 3));
    J[b] = fk(b);
  });
  const Ds3 = D.spine_03;
  J.neck = fk('neck');
  let look = new Quaternion();
  if (lookAt) {
    const dir = lookAt.clone().sub(J.neck).normalize().applyQuaternion(Ds3.clone().invert());
    const yaw = clamp(Math.atan2(dir.x, dir.z), -LIMITS.headYawMaxDeg * DEG, LIMITS.headYawMaxDeg * DEG);
    const pitch = clamp(Math.asin(clamp(dir.y, -1, 1)), -LIMITS.headPitchDownDeg * DEG, LIMITS.headPitchUpDeg * DEG);
    look = new Quaternion().setFromAxisAngle(Y, yaw).multiply(new Quaternion().setFromAxisAngle(X, -pitch));
  }
  D.neck = Ds3.clone().multiply(new Quaternion().slerp(look, 0.4));
  J.head = fk('head');
  D.head = Ds3.clone().multiply(look);

  for (const s of ['l', 'r'] as const) {
    const cl: BoneName = `clavicle_${s}`, ua: BoneName = `upperarm_${s}`, fa: BoneName = `forearm_${s}`, h: BoneName = `hand_${s}`;
    D[cl] = Ds3.clone();
    J[cl] = fk(cl);
    J[ua] = fk(ua);
    const ht = t.hands[s];
    const target = ht.frame === 'board' ? toW(ht.pos) : J.spine_03.clone().add(ht.pos.clone().applyQuaternion(Ds3));
    const pole = ht.frame === 'board' ? dirW(ht.pole) : ht.pole.clone().applyQuaternion(Ds3);
    const ik = twoBoneIK(J[ua], target, len(ua, fa), len(fa, h), pole, LIMITS.elbowMaxDeg);
    D[ua] = aimRotation(restDir(ua, fa), NEG_Z, ik.mid.clone().sub(J[ua]), pole);
    J[fa] = fk(fa);
    D[fa] = aimRotation(restDir(fa, h), NEG_Z, ik.end.clone().sub(J[fa]), pole);
    J[h] = fk(h);
    const inW = (v: Vector3): Vector3 => (ht.frame === 'board' ? dirW(v) : v.clone().applyQuaternion(Ds3));
    const palm = rest.hand?.[s];
    // The hand aimed where its fingers point, its palm turned where it faces (the rail grip), or straight on.
    D[h] = ht.dir && ht.palm && palm ? aimRotation(palm.axis, palm.palm, inW(ht.dir), inW(ht.palm))
      : ht.dir ? aimRotation(restDir(fa, h), NEG_Z, inW(ht.dir), pole) : D[fa].clone();
  }

  for (const g of legs) {
    const th: BoneName = `thigh_${g.s}`, sh: BoneName = `shin_${g.s}`, ft: BoneName = `foot_${g.s}`, to: BoneName = `toe_${g.s}`;
    J[th] = fk(th);
    const ik = twoBoneIK(J[th], g.ankle, g.l1, g.l2, g.pole, LIMITS.kneeMaxDeg);
    D[th] = aimRotation(restDir(th, sh), Z, ik.mid.clone().sub(J[th]), g.pole);
    J[sh] = fk(sh);
    D[sh] = aimRotation(restDir(sh, ft), Z, ik.end.clone().sub(J[sh]), g.pole);
    J[ft] = fk(ft);
    D[ft] = aimRotation(restDir(ft, to), Y, g.toe.clone().sub(J[ft]), g.instep);
    J[to] = fk(to);
    D[to] = D[ft].clone();
  }

  const world = {} as Record<BoneName, Quaternion>, local = {} as Record<BoneName, Quaternion>;
  for (const b of BONES) world[b] = D[b].clone().multiply(rest.restQ[b]);
  for (const b of BONES) {
    const p = PARENT[b];
    local[b] = p ? world[p].clone().invert().multiply(world[b]) : world[b].clone();
  }
  return { pelvisWorld: P.clone(), joint: J, world, local };
}
