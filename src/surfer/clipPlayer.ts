import { Quaternion, Vector3 } from 'three/webgpu';
import type { BakedClip } from './clips';

/** A clip at one moment: the pelvis from the ankles' midpoint, and each bone's world rotation from rest. */
export interface ClipSample {
  pelvis: Vector3;
  rot: Partial<Record<string, Quaternion>>;
}

/** The clip at t seconds (§4.1 step 1): between frames, slerped; a loop wraps, a one-shot holds its ends. */
export function sampleClip(c: BakedClip, fps: number, t: number): ClipSample {
  let i0: number, i1: number, u: number;
  if (c.loop) {
    u = (((t * fps) % c.frames) + c.frames) % c.frames;
    if (!(u < c.frames)) u = 0; // float rounding at the wrap
    i0 = Math.floor(u);
    i1 = (i0 + 1) % c.frames;
  } else {
    u = Math.min(Math.max(t * fps, 0), c.frames - 1);
    i0 = Math.min(Math.floor(u), c.frames - 2);
    i1 = i0 + 1;
  }
  const f = u - i0;
  const P = (i: number): Vector3 => new Vector3(c.pelvis[3 * i], c.pelvis[3 * i + 1], c.pelvis[3 * i + 2]);
  const Q = (q: number[], i: number): Quaternion => new Quaternion(q[4 * i], q[4 * i + 1], q[4 * i + 2], q[4 * i + 3]);
  const rot: Partial<Record<string, Quaternion>> = {};
  for (const [b, q] of Object.entries(c.rot)) rot[b] = Q(q, i0).slerp(Q(q, i1), f);
  return { pelvis: P(i0).lerp(P(i1), f), rot };
}
