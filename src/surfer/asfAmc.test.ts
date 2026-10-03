import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { asfPose, eulerQ, parseAmc, parseAsf } from './asfAmc';

/** A two-bone leg: the femur straight down, the tibia below it, both with all three dofs. */
const ASF = `:version 1.10
:name TEST
:units
  mass 1.0
  length 0.45
  angle deg
:root
   order TX TY TZ RX RY RZ
   axis XYZ
   position 0 0 0
   orientation 0 0 0
:bonedata
  begin
     id 1
     name lfemur
     direction 0 -1 0
     length 2
     axis 0 0 0  XYZ
    dof rx ry rz
    limits (-160.0 20.0)
           (-70.0 70.0)
           (-60.0 70.0)
  end
  begin
     id 2
     name ltibia
     direction 0 -1 0
     length 3
     axis 0 0 90  XYZ
    dof rx
    limits (-10.0 170.0)
  end
:hierarchy
  begin
    root lfemur
    lfemur ltibia
  end
`;
const AMC = `#!OML:ASF test
:FULLY-SPECIFIED
:DEGREES
1
root 1 2 3 0 0 0
lfemur 0 0 0
ltibia 0
2
root 1 2 3 0 0 0
lfemur 90 0 0
ltibia 0
3
root 0 0 0 0 0 0
lfemur 0 0 0
ltibia 90
`;
const near = (a: Vector3, b: Vector3): number => a.distanceTo(b);

describe('ASF/AMC (CMU motion capture; clip slice Task 8)', () => {
  const asf = parseAsf(ASF), frames = parseAmc(AMC);
  it('reads the skeleton: bones parent-first, directions, lengths, dofs, the axis frame', () => {
    expect(asf.order).toEqual(['root', 'lfemur', 'ltibia']);
    expect(asf.bones.ltibia.parent).toBe('lfemur');
    expect(asf.bones.ltibia.length).toBe(3);
    expect(asf.bones.ltibia.dof).toEqual(['rx']);
    expect(asf.bones.ltibia.C.angleTo(eulerQ(0, 0, 90))).toBeLessThan(1e-6);
  });
  it('reads the frames', () => {
    expect(frames.length).toBe(3);
    expect(frames[1].lfemur).toEqual([90, 0, 0]);
    expect(frames[0].root).toEqual([1, 2, 3, 0, 0, 0]);
  });
  it('uses static x, then y, then z Euler angles (R = Rz Ry Rx)', () => {
    const q = eulerQ(90, 90, 0), v = new Vector3(0, 0, 1).applyQuaternion(q);
    // Rx(90) takes +z to −y; Ry(90) leaves −y.
    expect(near(v, new Vector3(0, -1, 0))).toBeLessThan(1e-6);
  });
  it('at rest, each bone ends at its parent’s end plus direction × length, unrotated', () => {
    const p = asfPose(asf, frames[0]);
    expect(near(p.end.root, new Vector3(1, 2, 3))).toBeLessThan(1e-9);
    expect(near(p.end.lfemur, new Vector3(1, 0, 3))).toBeLessThan(1e-9);
    expect(near(p.end.ltibia, new Vector3(1, -3, 3))).toBeLessThan(1e-9);
    expect(p.rot.ltibia.angleTo(new Quaternion())).toBeLessThan(1e-6);
  });
  it('a hip flexion swings the whole leg; children inherit their parent’s rotation', () => {
    const p = asfPose(asf, frames[1]);
    expect(near(p.end.lfemur.clone().sub(p.end.root), new Vector3(0, 0, -2))).toBeLessThan(1e-6);
    expect(near(p.end.ltibia.clone().sub(p.end.lfemur), new Vector3(0, 0, -3))).toBeLessThan(1e-6);
  });
  it('a dof turns about the bone’s own axis frame (C R C⁻¹): the tibia’s rx with axis z90 turns about y', () => {
    const p = asfPose(asf, frames[2]);
    // C = Rz(90) maps x to y, so rx 90 in the bone frame is a 90° turn about world y: the tibia still points down.
    expect(near(p.end.ltibia.clone().sub(p.end.lfemur), new Vector3(0, -3, 0))).toBeLessThan(1e-6);
    expect(p.rot.ltibia.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2))).toBeLessThan(1e-6);
  });
});
