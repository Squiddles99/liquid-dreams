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
  /**
   * Each hand at rest (dune select Gate A, from a built body's grip data): its axis (the wrist to the middle knuckle, which
   * isn't the forearm's line: the rest hand is bent at the wrist), the way the palm faces, and the axis's length (m).
   * Absent on the reference skeleton: its hands run straight on from the forearm.
   */
  hand?: Record<Limb, { axis: Vector3; palm: Vector3; palmLen: number }>;
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
  /**
   * Each hand's finger joints from the hand bone's head (knuckle, middle, tip joint, fingertip; index, middle, ring, pinky,
   * thumb), at rest, curled round a rail, and open flat on a bodyboard (tools/surfer/grip.py; dune select Gate A).
   */
  grip?: Record<Limb, { rest: Vec3[][]; grip: Vec3[][]; flat?: Vec3[][] }>;
  /** `morphs`: the mesh's morph target names, in order (closeup spec §4.1). */
  meshes: { name: string; triangles: number; materials: string[]; morphs?: string[] }[];
  /** Body triangles weighted to the head (kept whole through decimation; closeup spec §4.1). */
  headTriangles?: number;
  /** Build-time checks (closeup spec §4.1): the closed lids cover the eyes, and the open lids don't. */
  checks?: {
    blinkCovers: boolean;
    eyesOpen: boolean;
    garmentsOutside?: boolean;
    hatHairUnder?: boolean;
    /** Long dry hair (dune select spec §13.1): the spread of the locks' turn heights, the turn's blend, and how far the
     * fall's cards beside the face face forward (mean |forward · normal|). */
    hairTurnSpreadCm?: number;
    hairTurnBlendCm?: number;
    hairFaceFrontness?: number;
    /** The hairline (§13.1): the sideburn's lowest root above the eyes, less the roots' inset (cm). */
    sideburnAboveEyeCm?: number;
    /** The upper lip's height above the mouth line before and after the build thins it (mm; §13.1). */
    upperLipMm?: number;
    upperLipSculptedMm?: number;
    /** Shazza's braids (§13.2): how many, dry and wet; each end's drop below its clavicle (cm; dry l, dry r, wet l, wet
     * r); the ends in front of the shoulders; and no braid vertex inside the body. */
    braidsDry?: number;
    braidsWet?: number;
    braidEndDropCm?: number[];
    braidEndsInFront?: boolean;
    braidsOutside?: boolean;
    /** The braids' smoothness (§13.2): the worst turn between neighbouring points (degrees, 1.5 mm apart) of the
     * centreline, of the weave's sideways axis, and of a plait strand, over both braids dry and wet; and the tightest a
     * strand bends, over its tube's radius (under 1 it folds). */
    braidPathTurnDeg?: number;
    braidTwistDeg?: number;
    braidStrandTurnDeg?: number;
    braidBendRatio?: number;
    /** Grommet's mop (grommet spec §3): the ringlets' tightest bend over their own radius (under 1 a tube folds), and
     * the frizz: its longest wisp (cm) and the most its ends span of its length (1 straight). */
    /** How much of the scalp just inside the hairline (5 mm to 2.5 cm) the hair covers, worst over 10° sectors round
     * the head (0 … 1), wet and dry. */
    hairCoverWet?: number;
    hairCoverDry?: number;
    curlBendRatio?: number;
    frizzMaxCm?: number;
    frizzChordRatio?: number;
  };
  blender: string;
  mpfb: string;
  /** Face landmarks in the rest pose (glTF axes, metres), for the glasses fit and the skin detail (grommet spec §4, §5). */
  landmarks?: SurferLandmarks;
  /** Seeded skin spots: x, y, z and radius (grommet spec §5). */
  skin?: { pimples: [number, number, number, number][] };
}

export type Vec3 = [number, number, number];
export interface SurferLandmarks {
  /** Left, then right. */
  eyes: [Vec3, Vec3];
  ears: [Vec3, Vec3];
  nose: Vec3;
  mouth: Vec3;
  lipFront: Vec3;
  teethFront: Vec3;
  /** The eyeballs' radius (fitted to MPFB's eye helper; closeup spec §4.1). */
  eyeRadius?: number;
  /** The chest's apex each side, where the nipples are painted (left, right). */
  nipples?: [Vec3, Vec3];
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
  const hand = m.grip ? handsFrom(m.grip) : undefined;
  return hand ? { heightM: m.heightM, joint, restQ, hand } : { heightM: m.heightM, joint, restQ };
}

/**
 * Each hand from the grip data. The palm: the middle finger curls about one axis (the normal of its curled chain's
 * plane), so the palm faces square to that axis and to the finger at rest, on the side its fingertip moves toward.
 */
function handsFrom(grip: NonNullable<SurferManifest['grip']>): Record<Limb, { axis: Vector3; palm: Vector3; palmLen: number }> {
  const one = (g: { rest: Vec3[][]; grip: Vec3[][] }) => {
    const knuckle = new Vector3(...g.rest[1][0]);
    const [a, b, , tip] = g.grip[1].map((p) => new Vector3(...p));
    const curl = b.clone().sub(a).cross(tip.clone().sub(b)).normalize();
    const finger = new Vector3(...g.rest[1][3]).sub(knuckle).normalize();
    const palm = curl.clone().cross(finger).normalize();
    if (palm.dot(tip.clone().sub(new Vector3(...g.rest[1][3]))) < 0) palm.negate();
    return { axis: knuckle.clone().normalize(), palm, palmLen: knuckle.length() };
  };
  return { l: one(grip.l), r: one(grip.r) };
}

/** Throws (naming the file) when a body's manifest breaks the skeleton contract, so the loader's warn-once path handles a
 * stale build instead of the pose solver failing every frame (final review). */
export function assertManifest(m: SurferManifest, url: string): void {
  const problems = manifestProblems(m);
  if (problems.length) throw new Error(`${url}: ${problems.join('; ')}`);
}
