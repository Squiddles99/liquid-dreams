import { Quaternion, Vector3 } from 'three/webgpu';
import type { RiderClips } from './clips';
import { BONES, FINGER_BONES, type SkeletonRest } from './rig';

const DEG = Math.PI / 180;
const ax = (x: number, y: number, z: number, deg: number): Quaternion => new Quaternion().setFromAxisAngle(new Vector3(x, y, z), deg * DEG);

/**
 * A made-up riding loop for tests (clip slice spec §5): the paid clip isn't in git. 2 s at 30 fps, nose on the
 * character's left (regular): the thighs spread and bent forward, the shins near upright, the arms out, a 2 cm pelvis
 * bob and a wrist roll. `fingers` adds the finger bones (following their hands) to test that they pass through.
 */
export function syntheticRiderClips(rest: SkeletonRest, opts: { fingers?: boolean } = {}): RiderClips {
  const frames = 60, fps = 30;
  const h0 = 0.9 * (rest.joint.pelvis.y - rest.joint.foot_l.y);
  const pelvis: number[] = [], rot: Record<string, number[]> = {};
  const push = (b: string, q: Quaternion): void => { (rot[b] ??= []).push(q.x, q.y, q.z, q.w); };
  for (let i = 0; i < frames; i++) {
    const w = Math.sin((2 * Math.PI * i) / frames);
    pelvis.push(0, h0 + 0.02 * w, 0);
    const D: Record<string, Quaternion> = {};
    for (const b of BONES) D[b] = new Quaternion();
    D.thigh_l = ax(0, 0, 1, 14).multiply(ax(1, 0, 0, -30));
    D.thigh_r = ax(0, 0, 1, -14).multiply(ax(1, 0, 0, -30));
    D.shin_l = ax(0, 0, 1, 14).multiply(ax(1, 0, 0, 10));
    D.shin_r = ax(0, 0, 1, -14).multiply(ax(1, 0, 0, 10));
    for (const [s, k] of [['l', 1], ['r', -1]] as const) {
      D[`upperarm_${s}`] = ax(0, 0, 1, 40 * k);
      D[`forearm_${s}`] = ax(0, 0, 1, 40 * k);
      D[`hand_${s}`] = ax(0, 0, 1, 40 * k).multiply(ax(0, 1, 0, 10 * w));
    }
    for (const b of BONES) if (b !== 'root') push(b, D[b]);
    if (opts.fingers) for (const f of FINGER_BONES) push(f, D[`hand_${f.slice(-1)}`]);
  }
  return { rider: 'test', fps, clips: { trim: { loop: true, frames, noseSide: 'left', pelvis, rot } } };
}
