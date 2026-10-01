import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { layoutFor } from '../board/boardSpec';
import { LIMB_RADIUS, boardBoxes, carriedBoard, distanceToBoxes } from './carry';
import { GANG_SPACING_M, gangCamera, gangPlaces, gangTrack } from './gang';
import { groundFrame, headingAxes } from './placement';
import { poseTargets } from './poses';
import { PRESETS, type PresetName, boardFor, boardsFor } from './presets';
import { BONES, type BoneName, type SurferManifest, restFromManifest } from './rig';
import { boardQuaternion, solvePose } from './solvePose';

const CENTRE = { x: 317, z: 45, headingDeg: 90 };

describe('the gang mockup’s lineup (walking spec §6)', () => {
  it('puts Grommet in the middle, Shazza on his left and T-Bone on his right, all facing the heading', () => {
    const [a, b, c] = gangPlaces(CENTRE);
    expect([a.preset, b.preset, c.preset]).toEqual(['female', 'grommet', 'male']);
    expect([b.x, b.z]).toEqual([CENTRE.x, CENTRE.z]);
    // Facing east (+x), his left is north (−z).
    expect(a.z).toBeCloseTo(CENTRE.z - GANG_SPACING_M, 9);
    expect(c.z).toBeCloseTo(CENTRE.z + GANG_SPACING_M, 9);
    for (const p of [a, b, c]) expect(p.headingDeg).toBe(90);
  });
  it('gives the outer two their outside arms for the boards, and Grommet his left', () => {
    expect(gangPlaces(CENTRE).map((p) => p.carrySide)).toEqual(['l', 'l', 'r']);
  });
  it('keeps every carried board clear of the other two riders (Andrew: step 6 must too)', () => {
    const solved = gangPlaces(CENTRE).map((p) => {
      const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${p.preset}.manifest.json`, 'utf8'));
      const rest = restFromManifest(man, Object.fromEntries(BONES.map((b) => [b, new Quaternion()])) as Record<BoneName, Quaternion>);
      const spec = boardFor(PRESETS[p.preset], boardsFor(PRESETS[p.preset])[0]);
      const ground = groundFrame({ ...p, heightNudgeM: 0, pitchNudgeDeg: 0 }, 0, 0, 0);
      const t = poseTargets('carry', { spec, layout: layoutFor(spec, rest.heightM), rest, stance: 'regular', dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, phaseT: 0, carrySide: p.carrySide });
      const look = ground.position.clone().add(t.look.clone().applyQuaternion(boardQuaternion(ground)).multiplyScalar(10)).add(new Vector3(0, 1.5, 0));
      const s = solvePose(rest, t, ground, look);
      return { preset: p.preset as PresetName, H: rest.heightM, s, boxes: boardBoxes(carriedBoard(t.carry!, ground, s), spec) };
    });
    const limbs: [BoneName, BoneName, keyof typeof LIMB_RADIUS][] = [
      ['pelvis', 'spine_03', 'torso'], ['spine_03', 'head', 'torso'], ['thigh_l', 'shin_l', 'thigh'], ['thigh_r', 'shin_r', 'thigh'], ['shin_l', 'foot_l', 'shin'], ['shin_r', 'foot_r', 'shin'],
      ['upperarm_l', 'forearm_l', 'upperarm'], ['upperarm_r', 'forearm_r', 'upperarm'], ['forearm_l', 'hand_l', 'forearm'], ['forearm_r', 'hand_r', 'forearm'],
    ];
    for (const holder of solved) for (const other of solved) {
      if (other === holder) continue;
      for (const [a, b, r] of limbs) {
        expect(distanceToBoxes(other.s.joint[a], other.s.joint[b], holder.boxes), `${holder.preset}'s board vs ${other.preset}'s ${a}`).toBeGreaterThan(LIMB_RADIUS[r] * other.H + 0.05);
      }
    }
  });
  it('puts the camera in front of them, a little below their chests, looking back at them', () => {
    const cam = gangCamera(CENTRE, 34, 5.5);
    const { fwd } = headingAxes(CENTRE.headingDeg);
    expect((cam.position[0] - CENTRE.x) * fwd[0] + (cam.position[2] - CENTRE.z) * fwd[1]).toBeCloseTo(5.5, 6);
    expect(cam.position[1]).toBeGreaterThan(34 + 0.8);
    expect(cam.position[1]).toBeLessThan(34 + 1.15);
    expect(cam.yawDeg).toBe(270);
    expect(cam.pitchDeg).toBeGreaterThan(0);
    expect(cam.mode).toBe('free');
  });
  it('stays above the ground where it stands when the land rises inland of them, looking down to their chests', () => {
    const cam = gangCamera(CENTRE, 34, 5.5, 36);
    expect(cam.position[1]).toBeGreaterThanOrEqual(36 + 0.5 - 1e-9);
    expect(cam.pitchDeg).toBeLessThan(0);
  });
  it('tramples a track through the heath from them to the camera', () => {
    const track = gangTrack(CENTRE, 5.5);
    const { fwd } = headingAxes(CENTRE.headingDeg);
    expect(track.length).toBeGreaterThanOrEqual(4);
    for (const t of track) {
      const along = (t.x - CENTRE.x) * fwd[0] + (t.z - CENTRE.z) * fwd[1];
      expect(along).toBeGreaterThan(0);
      expect(along).toBeLessThanOrEqual(5.5 + 1e-9);
      expect(t.r).toBeGreaterThanOrEqual(GANG_SPACING_M + 0.6);
    }
  });
});
