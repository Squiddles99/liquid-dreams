import { Quaternion, Vector3 } from 'three/webgpu';
import { type AmcFrame, type Asf, type AsfPose, asfPose } from './asfAmc';
import type { BakedClip } from './clips';
import { BONES, type BoneName, type SkeletonRest, measures } from './rig';

type Body = Exclude<BoneName, 'root'>;
/** Our bone ← the CMU bone whose segment it is. CMU's hands are too coarse for fingers: those stay relaxed. */
export const CMU_BONE: Record<Body, string> = {
  pelvis: 'root', spine_01: 'lowerback', spine_02: 'upperback', spine_03: 'thorax', neck: 'lowerneck', head: 'head',
  clavicle_l: 'lclavicle', upperarm_l: 'lhumerus', forearm_l: 'lradius', hand_l: 'lhand',
  clavicle_r: 'rclavicle', upperarm_r: 'rhumerus', forearm_r: 'rradius', hand_r: 'rhand',
  thigh_l: 'lfemur', shin_l: 'ltibia', foot_l: 'lfoot', toe_l: 'ltoes',
  thigh_r: 'rfemur', shin_r: 'rtibia', foot_r: 'rfoot', toe_r: 'rtoes',
};
/** Where each of our bones points at rest: toward this child's joint. */
const CHILD: Partial<Record<BoneName, BoneName>> = {
  spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck', neck: 'head',
  clavicle_l: 'upperarm_l', upperarm_l: 'forearm_l', forearm_l: 'hand_l', clavicle_r: 'upperarm_r', upperarm_r: 'forearm_r', forearm_r: 'hand_r',
  thigh_l: 'shin_l', shin_l: 'foot_l', foot_l: 'toe_l', thigh_r: 'shin_r', shin_r: 'foot_r', foot_r: 'toe_r',
};
/** Bones with no child joint take their parent's alignment. */
const SAME_AS: Partial<Record<BoneName, BoneName>> = { head: 'neck', hand_l: 'forearm_l', hand_r: 'forearm_r', toe_l: 'foot_l', toe_r: 'foot_r' };
const SEAM_S = 0.25;

/**
 * The rest alignment (clip slice spec §3.3 step 3): each of our bones turned onto CMU's rest direction for it, so CMU's
 * T-pose fits our A-pose before any motion is copied. Both skeletons share a frame: +X the left, +Y up, +Z facing.
 */
export function restAlign(asf: Asf, rest: SkeletonRest): Record<BoneName, Quaternion> {
  const A = {} as Record<BoneName, Quaternion>;
  for (const b of BONES) {
    const c = CHILD[b];
    A[b] = c ? new Quaternion().setFromUnitVectors(rest.joint[c].clone().sub(rest.joint[b]).normalize(), asf.bones[CMU_BONE[b as Body]].direction) : new Quaternion();
  }
  for (const [b, from] of Object.entries(SAME_AS) as [BoneName, BoneName][]) A[b] = A[from].clone();
  return A;
}

export interface CmuClipOptions {
  /** The AMC's frame rate (CMU: 120) and the clip's (30). */
  fps: number;
  outFps: number;
  /** AMC frame range, inclusive; the whole take when unset. */
  start?: number;
  end?: number;
  loop: boolean;
  /** Which side the board's nose is on; 'auto' reads it off the way the skater travels (toward its left: regular). */
  noseSide: 'left' | 'right' | 'auto';
}

/**
 * A CMU take as a baked clip for one rider (spec §3.3): each of our bones' world rotation from rest is CMU's for its
 * segment times the rest alignment; the pelvis from the ankles' midpoint is CMU's, scaled to our leg; resampled to
 * `outFps`; a loop's last quarter second eased into its first frame. Root travel is dropped (the board places the rider).
 */
export function cmuClip(asf: Asf, frames: AmcFrame[], rest: SkeletonRest, o: CmuClipOptions): BakedClip {
  const A = restAlign(asf, rest);
  const s = o.start ?? 0, e = Math.min(o.end ?? frames.length - 1, frames.length - 1);
  const ratio = measures(rest).legLen / (asf.bones.lfemur.length + asf.bones.ltibia.length);
  const cache = new Map<number, AsfPose>();
  const pose = (i: number): AsfPose => { let p = cache.get(i); if (!p) cache.set(i, (p = asfPose(asf, frames[i]))); return p; };
  const n = Math.max(2, Math.floor(((e - s) / o.fps) * o.outFps) + 1);
  const rots: Record<string, Quaternion[]> = {}, pelvis: Vector3[] = [];
  const pelvisOf = (p: AsfPose): Vector3 => p.end.root.clone().sub(p.end.ltibia.clone().add(p.end.rtibia).multiplyScalar(0.5)).multiplyScalar(ratio);
  for (let k = 0; k < n; k++) {
    const u = s + (k * o.fps) / o.outFps, i0 = Math.min(Math.floor(u), e), i1 = Math.min(i0 + 1, e), f = u - i0;
    const p0 = pose(i0), p1 = pose(i1);
    pelvis.push(pelvisOf(p0).lerp(pelvisOf(p1), f));
    for (const b of BONES) {
      if (b === 'root') continue;
      const c = CMU_BONE[b as Body];
      (rots[b] ??= []).push(p0.rot[c].clone().slerp(p1.rot[c], f).multiply(A[b]));
    }
  }
  if (o.loop) {
    const m = Math.min(n - 1, Math.round(SEAM_S * o.outFps));
    for (let j = 0; j < m; j++) {
      const k = n - m + j, a = (j + 1) / (m + 1);
      pelvis[k].lerp(pelvis[0], a);
      for (const qs of Object.values(rots)) qs[k].slerp(qs[0], a);
    }
  }
  let noseSide = o.noseSide;
  if (noseSide === 'auto') {
    const a = pose(s), travel = pose(e).end.root.clone().sub(a.end.root).applyQuaternion(a.rot.root.clone().invert());
    noseSide = travel.x >= 0 ? 'left' : 'right';
  }
  return {
    loop: o.loop, frames: n, noseSide,
    pelvis: pelvis.flatMap((p) => [p.x, p.y, p.z]),
    rot: Object.fromEntries(Object.entries(rots).map(([b, qs]) => [b, qs.flatMap((q) => [q.x, q.y, q.z, q.w])])),
  };
}
