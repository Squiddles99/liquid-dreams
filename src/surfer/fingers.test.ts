import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { type FingerRest, fingerDeltas, fingerLocals, fingerRestFromManifest, palmNormal, relaxedFingerDeltas } from './fingers';
import { BONES, FINGER_BONES, FINGER_PARENT, type FingerBone, PARENT, type SurferManifest } from './rig';

/** Two hands hanging at the sides in an A-pose: fingers down (-Y), spread front (+Z) to back, palms toward the body. */
function restHands(): FingerRest {
  const head = {} as Record<FingerBone, Vector3>, tail = {} as Record<FingerBone, Vector3>;
  const hand = { l: new Vector3(0.6, 0.9, 0), r: new Vector3(-0.6, 0.9, 0) };
  const spread = { thumb: 0.035, index: 0.02, middle: 0.005, ring: -0.01, pinky: -0.025 } as const;
  for (const s of ['l', 'r'] as const) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) {
    const k = s === 'l' ? 1 : -1;
    let at = hand[s].clone().add(new Vector3(0.02 * k, -0.08, spread[f]));
    for (let i = 1; i <= 3; i++) {
      const b = `${f}_0${i}_${s}` as FingerBone;
      head[b] = at.clone();
      at = at.clone().add(new Vector3(0, -0.03, 0));
      tail[b] = at.clone();
    }
  }
  return { head, tail, hand };
}
/** A finger tip's position after rotating each joint by its delta (forward kinematics on the chain). */
function tip(r: FingerRest, D: Record<FingerBone, Quaternion>, f: string, s: 'l' | 'r'): Vector3 {
  let at = r.head[`${f}_01_${s}` as FingerBone].clone();
  for (let i = 1; i <= 3; i++) {
    const b = `${f}_0${i}_${s}` as FingerBone;
    at = at.add(r.tail[b].clone().sub(r.head[b]).applyQuaternion(D[b]));
  }
  return at;
}

describe('the relaxed hand (clip slice spec §2)', () => {
  const r = restHands();
  it('finds the palm facing the body: -X for the left hand, +X for the right', () => {
    expect(palmNormal(r, 'l').x).toBeLessThan(-0.9);
    expect(palmNormal(r, 'r').x).toBeGreaterThan(0.9);
  });
  it('curls every finger toward its palm, 15°, 35° and 50° down the chain (the thumb lighter)', () => {
    const D = relaxedFingerDeltas(r);
    for (const s of ['l', 'r'] as const) for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) {
      const ident = Object.fromEntries(FINGER_BONES.map((b) => [b, new Quaternion()])) as Record<FingerBone, Quaternion>;
      const moved = tip(r, D, f, s).sub(tip(r, ident, f, s));
      expect(moved.dot(palmNormal(r, s)), `${f}_${s}`).toBeGreaterThan(0.005);
    }
    const angle = (q: Quaternion): number => (2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI;
    expect(angle(D.index_01_l)).toBeCloseTo(15, 6);
    expect(angle(D.index_03_l)).toBeCloseTo(50, 6);
    expect(angle(D.thumb_03_r)).toBeCloseTo(23, 6);
  });
  it('rides on the hand: a turned hand turns the curl with it, and a clip’s fingers win', () => {
    const relaxed = relaxedFingerDeltas(r);
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7);
    const D = fingerDeltas({ l: turn, r: new Quaternion() }, relaxed, { index_02_l: new Quaternion(0, 0, 1, 0) });
    expect(D.middle_01_l.angleTo(turn.clone().multiply(relaxed.middle_01_l))).toBeLessThan(1e-6);
    expect(D.middle_01_r.angleTo(relaxed.middle_01_r)).toBeLessThan(1e-6);
    expect(D.index_02_l.angleTo(new Quaternion(0, 0, 1, 0))).toBeLessThan(1e-6);
  });
  it('gives three’s local rotations: the parent’s world × local is the finger’s world', () => {
    const restQ = Object.fromEntries(FINGER_BONES.map((b, i) => [b, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.01 * i)])) as Record<FingerBone, Quaternion>;
    const hand = { l: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.3), r: new Quaternion() };
    const D = relaxedFingerDeltas(r);
    const local = fingerLocals(hand, D, restQ);
    const world = (b: FingerBone): Quaternion => D[b].clone().multiply(restQ[b]);
    for (const b of FINGER_BONES) {
      const p = FINGER_PARENT[b];
      const pw = p.startsWith('hand_') ? hand[p.slice(-1) as 'l' | 'r'] : world(p as FingerBone);
      expect(pw.clone().multiply(local[b]).angleTo(world(b)), b).toBeLessThan(1e-6);
    }
  });
});

describe('finger rest from a manifest', () => {
  it('is null for a 23-bone build (Review Focus 1)', () => {
    const m = { name: 't', heightM: 1.7, bones: BONES.map((name) => ({ name, parent: PARENT[name], head: [0, 0, 0], tail: [0, 0.1, 0] })) } as unknown as SurferManifest;
    expect(fingerRestFromManifest(m)).toBeNull();
  });
});
