import { Quaternion, Vector3 } from 'three/webgpu';
import { FINGER_BONES, FINGER_PARENT, type FingerBone, type Limb, type SurferManifest } from './rig';

const DEG = Math.PI / 180;
/** The relaxed hand (clip slice spec §2): the flex at each knuckle, base to tip; the thumb lighter. */
export const RELAXED_FLEX_DEG = { finger: [15, 20, 15], thumb: [5, 10, 8] } as const;
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;

/** The fingers' rest joints, character rest frame (glTF axes, metres). */
export interface FingerRest {
  head: Record<FingerBone, Vector3>;
  tail: Record<FingerBone, Vector3>;
  hand: Record<Limb, Vector3>;
}

/** From a body's manifest; null for a build without fingers (from before the clip slice). */
export function fingerRestFromManifest(m: SurferManifest): FingerRest | null {
  const byName = new Map(m.bones.map((b) => [b.name, b]));
  if (!FINGER_BONES.every((f) => byName.has(f)) || !byName.has('hand_l') || !byName.has('hand_r')) return null;
  const head = {} as Record<FingerBone, Vector3>, tail = {} as Record<FingerBone, Vector3>;
  for (const f of FINGER_BONES) {
    head[f] = new Vector3(...byName.get(f)!.head);
    tail[f] = new Vector3(...byName.get(f)!.tail);
  }
  return { head, tail, hand: { l: new Vector3(...byName.get('hand_l')!.head), r: new Vector3(...byName.get('hand_r')!.head) } };
}

/** Out of the palm. At rest the hands hang at the sides, palms to the thighs: toward the body's midline. */
export function palmNormal(rest: FingerRest, s: Limb): Vector3 {
  const h = rest.hand[s];
  const n = rest.head[`index_01_${s}`].clone().sub(h).cross(rest.head[`pinky_01_${s}`].clone().sub(h)).normalize();
  return n.x * h.x > 0 ? n.negate() : n;
}

/**
 * Each finger bone's rotation from rest for the relaxed curl, before the hand's own: every knuckle of a finger flexes
 * about that finger's hinge (its base's rest direction × the palm normal), so the finger curls toward the palm.
 */
export function relaxedFingerDeltas(rest: FingerRest): Record<FingerBone, Quaternion> {
  const out = {} as Record<FingerBone, Quaternion>;
  for (const s of ['l', 'r'] as const) {
    const n = palmNormal(rest, s);
    for (const f of FINGERS) {
      const base = `${f}_01_${s}` as FingerBone;
      const axis = rest.tail[base].clone().sub(rest.head[base]).normalize().cross(n);
      const flex = f === 'thumb' ? RELAXED_FLEX_DEG.thumb : RELAXED_FLEX_DEG.finger;
      let total = 0;
      for (let i = 0; i < 3; i++) {
        total += flex[i];
        out[`${f}_0${i + 1}_${s}` as FingerBone] = axis.lengthSq() < 1e-12 ? new Quaternion() : new Quaternion().setFromAxisAngle(axis.clone().normalize(), total * DEG);
      }
    }
  }
  return out;
}

/** Every finger's world rotation from rest: the clip's where it has one, else the relaxed curl carried by its hand. */
export function fingerDeltas(handD: Record<Limb, Quaternion>, relaxed: Record<FingerBone, Quaternion>, clip?: Partial<Record<FingerBone, Quaternion>>): Record<FingerBone, Quaternion> {
  const out = {} as Record<FingerBone, Quaternion>;
  for (const f of FINGER_BONES) out[f] = clip?.[f]?.clone() ?? handD[f.slice(-1) as Limb].clone().multiply(relaxed[f]);
  return out;
}

/** What three's Bone.quaternion takes: world = D × rest, local = the parent's world⁻¹ × world (parents first). */
export function fingerLocals(handWorld: Record<Limb, Quaternion>, D: Record<FingerBone, Quaternion>, restQ: Record<FingerBone, Quaternion>): Record<FingerBone, Quaternion> {
  const world = {} as Record<FingerBone, Quaternion>, local = {} as Record<FingerBone, Quaternion>;
  for (const f of FINGER_BONES) {
    world[f] = D[f].clone().multiply(restQ[f]);
    const p = FINGER_PARENT[f];
    const pw = p.startsWith('hand_') ? handWorld[p.slice(-1) as Limb] : world[p as FingerBone];
    local[f] = pw.clone().invert().multiply(world[f]);
  }
  return local;
}
