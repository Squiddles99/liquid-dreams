// src/surfer/selectStand.test.ts
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { LIMB_RADIUS, PACK_PARTS, boardBoxes, distanceToBoxes } from './carry';
import { flexDeg } from './ik';
import { LAND_POSES, isCarryPose, posesOn } from './poseNames';
import { builtRest, depthIn, packPoints, solveStand, standCases, toW } from './poseTestKit';
import { PRESETS, boardsFor } from './presets';
import type { BoneName, Limb } from './rig';

describe('selectStand (dune select spec §13): natural, cool, every rider, board and side, at rest', () => {
  it('is a land pose that carries the board', () => {
    expect(LAND_POSES).toContain('selectStand');
    expect(posesOn('thruster', true)).toContain('selectStand');
    expect(posesOn('thruster', false)).not.toContain('selectStand');
    expect(isCarryPose('selectStand')).toBe(true);
    expect(isCarryPose('carry')).toBe(true);
    expect(isCarryPose('trim')).toBe(false);
  });
  for (const c of standCases()) {
    it(c.tag, () => {
      const { spec, t, s, board } = solveStand('selectStand', c, 0);
      const H = c.rest.heightM, side = c.side, free: Limb = side === 'l' ? 'r' : 'l';
      expect(s.joint[`hand_${side}`].distanceTo(toW(t.carry!.hand)), 'hand to the board').toBeLessThan(0.02);
      const boxes = boardBoxes(board, spec), pressed = 0.005 / H;
      const seg = (a: BoneName, b: BoneName): number => distanceToBoxes(s.joint[a], s.joint[b], boxes);
      const clear: [BoneName, BoneName, number][] = [
        ['pelvis', 'spine_03', LIMB_RADIUS.torso - pressed], ['thigh_l', 'shin_l', LIMB_RADIUS.thigh], ['thigh_r', 'shin_r', LIMB_RADIUS.thigh],
        ['shin_l', 'foot_l', LIMB_RADIUS.shin], ['shin_r', 'foot_r', LIMB_RADIUS.shin],
        [`upperarm_${side}`, `forearm_${side}`, LIMB_RADIUS.upperarm - pressed], [`forearm_${side}`, `hand_${side}`, LIMB_RADIUS.forearm - pressed],
        [`upperarm_${free}`, `forearm_${free}`, LIMB_RADIUS.upperarm],
      ];
      // Grommet's free hand rests on his bodyboard's nose (the hug): the hand may touch it; everyone else's stays clear.
      if (c.name !== 'grommet') clear.push([`forearm_${free}`, `hand_${free}`, LIMB_RADIUS.forearm]);
      for (const [a, b, r] of clear) expect(seg(a, b), `${a}–${b} clear of the board`).toBeGreaterThanOrEqual(r * H);
      // Contrapposto: the hips counter-tilted 4–8°.
      const tilt = (Math.asin(Math.min(1, Math.hypot(t.pelvisUp.x, t.pelvisUp.z) / t.pelvisUp.length())) * 180) / Math.PI;
      expect(tilt).toBeGreaterThanOrEqual(4);
      expect(tilt).toBeLessThanOrEqual(8);
      // The standing knee near straight, the free one soft, the ankles where they're put.
      for (const l of ['l', 'r'] as const) {
        expect(flexDeg(s.joint[`thigh_${l}`], s.joint[`shin_${l}`], s.joint[`foot_${l}`]), `knee ${l}`).toBeLessThanOrEqual(30);
        expect(s.joint[`foot_${l}`].distanceTo(toW(t.feet[l].ankle)), `ankle ${l}`).toBeLessThan(0.012);
      }
      // The free hand clear of the head and its own thigh (everything renders).
      expect(s.joint[`hand_${free}`].distanceTo(s.joint.head), 'free hand off the head').toBeGreaterThan(0.09);
      const a = s.joint[`thigh_${free}`], b = s.joint[`shin_${free}`], ab = b.clone().sub(a), p = s.joint[`hand_${free}`];
      const k = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
      expect(p.distanceTo(a.clone().add(ab.multiplyScalar(k))), 'free hand off the thigh').toBeGreaterThan((LIMB_RADIUS.thigh + 0.4 * LIMB_RADIUS.forearm) * H);
    });
  }
  it('gives each rider their own stance', () => {
    const pick = (name: string, kind: string, side: string) => standCases().find((c) => c.name === name && c.kind === kind && c.side === side)!;
    const t = solveStand('selectStand', pick('male', 'thruster', 'r')).t;
    const z = solveStand('selectStand', pick('female', 'thruster', 'r')).t;
    const g = solveStand('selectStand', pick('grommet', 'bodyboard', 'l')).t;
    expect(t.look.y).toBeGreaterThan(z.look.y);                         // T-Bone's chin up
    expect(t.pelvis.x).toBeLessThan(z.pelvis.x);                        // his weight back
    expect(g.feet.l.ankle.y).toBeGreaterThan(z.feet.l.ankle.y + 0.015); // Grommet up on his toes
  });
  it('keeps the tucked board clear of the rider\'s own pack', () => {
    for (const name of ['female', 'male', 'grommet'] as const) for (const kind of boardsFor(PRESETS[name])) for (const side of ['l', 'r'] as Limb[]) {
      const rest = builtRest(name);
      const { s, board, spec } = solveStand('selectStand', { tag: '', name, rest, kind, side });
      const boxes = boardBoxes(board, spec), R = s.world.spine_03, at = rest.joint.spine_03;
      const bag = packPoints(name, PACK_PARTS.filter((m) => m !== 'packTrim'));
      const deepest = Math.max(0, ...bag.map((q) => depthIn(new Vector3(...q).sub(at).applyQuaternion(R).add(s.joint.spine_03), boxes)));
      expect(deepest, `${name} ${kind} ${side}`).toBeLessThan(0.005);
    }
  });
});
