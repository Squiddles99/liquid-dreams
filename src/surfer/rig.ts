import { Quaternion, Vector3 } from 'three/webgpu';

/**
 * The skeleton contract (spec §3.3): the bones the game relies on, in an order where every parent comes before its
 * children. Character rest frame: +Y up, +Z the way the character faces, +X the character's left, feet on y = 0.
 */
export const BONES = [
  'root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck', 'head',
  'clavicle_l', 'upperarm_l', 'forearm_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'forearm_r', 'hand_r',
  'thigh_l', 'shin_l', 'foot_l', 'toe_l',
  'thigh_r', 'shin_r', 'foot_r', 'toe_r',
] as const;
export type BoneName = (typeof BONES)[number];
export type Limb = 'l' | 'r';

export const PARENT: Record<BoneName, BoneName | null> = {
  root: null, pelvis: 'root', spine_01: 'pelvis', spine_02: 'spine_01', spine_03: 'spine_02', neck: 'spine_03', head: 'neck',
  clavicle_l: 'spine_03', upperarm_l: 'clavicle_l', forearm_l: 'upperarm_l', hand_l: 'forearm_l',
  clavicle_r: 'spine_03', upperarm_r: 'clavicle_r', forearm_r: 'upperarm_r', hand_r: 'forearm_r',
  thigh_l: 'pelvis', shin_l: 'thigh_l', foot_l: 'shin_l', toe_l: 'foot_l',
  thigh_r: 'pelvis', shin_r: 'thigh_r', foot_r: 'shin_r', toe_r: 'foot_r',
};

export const LIMITS = {
  kneeMaxDeg: 150,
  elbowMaxDeg: 150,
  spineBoneMaxDeg: 40,
  headYawMaxDeg: 75,
  headPitchUpDeg: 45,
  headPitchDownDeg: 55,
} as const;

export interface SkeletonRest {
  heightM: number;
  /** Each bone's head (its joint) in the rest pose, character rest frame. */
  joint: Record<BoneName, Vector3>;
  /** Each bone's rest rotation in that frame (identity for the reference skeleton; from the loaded bones for a .glb). */
  restQ: Record<BoneName, Quaternion>;
}

/** A standard A-pose skeleton (Drillis & Contini segment ratios) for tests and for poses before a body loads. */
export function referenceSkeleton(heightM: number): SkeletonRest {
  const j = {} as Record<BoneName, Vector3>;
  const v = (x: number, y: number, z: number): Vector3 => new Vector3(x * heightM, y * heightM, z * heightM);
  j.root = v(0, 0, 0);
  j.pelvis = v(0, 0.56, 0);
  j.spine_01 = v(0, 0.6, -0.005);
  j.spine_02 = v(0, 0.66, -0.01);
  j.spine_03 = v(0, 0.72, -0.01);
  j.neck = v(0, 0.83, -0.01);
  j.head = v(0, 0.87, 0);
  for (const [s, k] of [['l', 1], ['r', -1]] as const) {
    j[`clavicle_${s}`] = v(0.02 * k, 0.8, 0.01);
    j[`upperarm_${s}`] = v(0.13 * k, 0.815, -0.01);
    j[`forearm_${s}`] = v(0.2615 * k, 0.6835, -0.02);
    j[`hand_${s}`] = v(0.3647 * k, 0.5803, 0);
    j[`thigh_${s}`] = v(0.085 * k, 0.53, 0);
    j[`shin_${s}`] = v(0.085 * k, 0.285, 0.005);
    j[`foot_${s}`] = v(0.085 * k, 0.039, -0.01);
    j[`toe_${s}`] = v(0.085 * k, 0.01, 0.1);
  }
  const restQ = {} as Record<BoneName, Quaternion>;
  for (const b of BONES) restQ[b] = new Quaternion();
  return { heightM, joint: j, restQ };
}

export interface RiderMeasures {
  thighLen: number;
  shinLen: number;
  legLen: number;
  upperArmLen: number;
  forearmLen: number;
  /** Ankle and ball-of-foot heights above the floor in the rest pose. */
  ankleH: number;
  toeH: number;
  /** Ankle to ball of the foot, horizontally. */
  footLenH: number;
  hipHalf: number;
  /** The pelvis joint's height above the hip joints. */
  hipDrop: number;
  /** Pelvis to spine_03 (the chest frame's origin). */
  torso: number;
}

export function measures(r: SkeletonRest): RiderMeasures {
  const j = r.joint;
  const thighLen = j.shin_l.distanceTo(j.thigh_l), shinLen = j.foot_l.distanceTo(j.shin_l);
  return {
    thighLen, shinLen, legLen: thighLen + shinLen,
    upperArmLen: j.forearm_l.distanceTo(j.upperarm_l), forearmLen: j.hand_l.distanceTo(j.forearm_l),
    ankleH: j.foot_l.y, toeH: j.toe_l.y, footLenH: Math.hypot(j.toe_l.x - j.foot_l.x, j.toe_l.z - j.foot_l.z),
    hipHalf: Math.abs(j.thigh_l.x), hipDrop: j.pelvis.y - j.thigh_l.y, torso: j.spine_03.y - j.pelvis.y,
  };
}
export interface ManifestBone {
  name: string;
  parent: string | null;
  /** glTF axes, metres. */
  head: [number, number, number];
  tail: [number, number, number];
}

/** Written by tools/surfer/export.py beside each .glb (spec §3.1). */
export interface SurferManifest {
  name: string;
  heightM: number;
  bones: ManifestBone[];
  meshes: { name: string; triangles: number; materials: string[] }[];
  blender: string;
  mpfb: string;
}

/** Everything wrong with a manifest's skeleton against the contract (empty = fine). */
export function manifestProblems(m: SurferManifest): string[] {
  const out: string[] = [];
  const byName = new Map(m.bones.map((b) => [b.name, b]));
  const names = [...byName.keys()].sort(), want = [...BONES].sort();
  if (JSON.stringify(names) !== JSON.stringify(want)) out.push(`bones ${JSON.stringify(names)} ≠ contract ${JSON.stringify(want)}`);
  for (const b of BONES) {
    const mb = byName.get(b);
    if (!mb) continue;
    if (mb.parent !== PARENT[b]) out.push(`${b}: parent ${mb.parent} ≠ ${PARENT[b]}`);
    if (Math.hypot(mb.tail[0] - mb.head[0], mb.tail[1] - mb.head[1], mb.tail[2] - mb.head[2]) < 0.01) out.push(`${b}: shorter than 1 cm`);
  }
  for (const s of ['l', 'r'] as const) {
    for (const leg of [`thigh_${s}`, `shin_${s}`] as const) {
      const mb = byName.get(leg);
      if (mb && mb.tail[1] >= mb.head[1]) out.push(`${leg}: doesn't point down`);
    }
    const foot = byName.get(`foot_${s}`);
    if (foot && foot.head[1] > 0.12 * m.heightM) out.push(`foot_${s}: ankle too high (${foot.head[1].toFixed(3)} m)`);
  }
  const head = byName.get('head');
  if (head && head.head[1] < 0.8 * m.heightM) out.push(`head: too low (${head.head[1].toFixed(3)} m)`);
  return out;
}

/** The rest skeleton of a loaded body: joints from its manifest, rest rotations from its bones. */
export function restFromManifest(m: SurferManifest, restQ: Record<BoneName, Quaternion>): SkeletonRest {
  const joint = {} as Record<BoneName, Vector3>;
  for (const b of m.bones) if ((BONES as readonly string[]).includes(b.name)) joint[b.name as BoneName] = new Vector3(...b.head);
  return { heightM: m.heightM, joint, restQ };
}

/** Throws (naming the file) when a body's manifest breaks the skeleton contract, so the loader's warn-once path handles a
 * stale build instead of the pose solver failing every frame (final review). */
export function assertManifest(m: SurferManifest, url: string): void {
  const problems = manifestProblems(m);
  if (problems.length) throw new Error(`${url}: ${problems.join('; ')}`);
}
