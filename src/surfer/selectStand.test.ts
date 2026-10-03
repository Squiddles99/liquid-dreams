// src/surfer/selectStand.test.ts
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { LIMB_RADIUS, PACK_PARTS, boardBoxes, distanceToBoxes } from './carry';
import { flexDeg } from './ik';
import { LAND_POSES, isCarryPose, posesOn } from './poseNames';
import { builtRest, depthIn, packPoints, solveStand, standCases, toW } from './poseTestKit';
import { PRESETS, boardsFor } from './presets';
import type { BoneName, Limb } from './rig';
import { layoutFor } from '../board/boardSpec';
import { DIALS } from './poseTestKit';
import { SELECT_IDLE_S, poseTargets } from './poses';
import { playPhase } from './surferParams';

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

describe('the select stances\' idles (spec §13: 4–8 s loops with small secondary motion)', () => {
  const pick = (name: string, kind: string, side: string) => standCases().find((c) => c.name === name && c.kind === kind && c.side === side)!;
  it('cycles each rider\'s loop at its own length', () => {
    expect(SELECT_IDLE_S).toEqual({ female: 7, male: 6, grommet: 4 });
    expect(playPhase('selectStand', 3.5, 0, 'female')).toBeCloseTo(0.5, 9);
    expect(playPhase('selectStand', 6, 0, 'male')).toBeCloseTo(0, 9);
    expect(playPhase('selectStand', 1, 0, 'grommet')).toBeCloseTo(0.25, 9);
  });
  it('lifts Shazza\'s hand to tuck her hair behind her ear mid-loop, and back', () => {
    const c = pick('female', 'thruster', 'r'); // carrying right: her free hand is the left
    const rest0 = solveStand('selectStand', c, 0).s, tuck = solveStand('selectStand', c, 0.46).s;
    expect(tuck.joint.hand_l.y).toBeGreaterThan(rest0.joint.hand_l.y + 0.4);
    expect(tuck.joint.hand_l.distanceTo(tuck.joint.head)).toBeLessThan(0.2);
    expect(solveStand('selectStand', c, 0.99).s.joint.hand_l.distanceTo(rest0.joint.hand_l)).toBeLessThan(0.03);
  });
  it('bounces Grommet on his toes and has him push his glasses up', () => {
    const c = pick('grommet', 'bodyboard', 'l'); // carrying left: his free hand is the right
    const ys = [0, 0.125, 0.25, 0.375].map((p) => solveStand('selectStand', c, p).t.pelvis.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.008);
    const push = solveStand('selectStand', c, 0.69).s;
    expect(push.joint.hand_r.distanceTo(push.joint.head)).toBeLessThan(0.22);
  });
  it('leaves Grommet\'s hand down when he isn\'t wearing his glasses (a surf outfit on the Outfit tab)', () => {
    const c = pick('grommet', 'bodyboard', 'l');
    const spec = solveStand('selectStand', c, 0.69);
    const t = poseTargets('selectStand', { spec: spec.spec, layout: layoutFor(spec.spec, c.rest.heightM), rest: c.rest, stance: 'regular', dials: DIALS, phaseT: 0.69, carrySide: c.side, who: c.name, glasses: false });
    expect(t.hands.r.pos.y).toBeLessThan(spec.t.hands.r.pos.y - 0.2);
  });
  it('rolls T-Bone\'s shoulder', () => {
    const c = pick('male', 'thruster', 'r');
    expect(Math.abs(solveStand('selectStand', c, 0.3).t.chest.twist - solveStand('selectStand', c, 0).t.chest.twist)).toBeGreaterThan(0.04);
  });
  it('renders through the whole loop: every case, every 5% of it, limbs clear of the board, the hand off the head', () => {
    for (const c of standCases()) for (let ph = 0; ph < 1; ph += 0.05) {
      const { s, board, spec, t } = solveStand('selectStand', c, ph);
      const H = c.rest.heightM, free: Limb = c.side === 'l' ? 'r' : 'l', boxes = boardBoxes(board, spec), at = `${c.tag} @${ph.toFixed(2)}`;
      expect(s.joint[`hand_${c.side}`].distanceTo(toW(t.carry!.hand)), `${at} hand`).toBeLessThan(0.02);
      expect(distanceToBoxes(s.joint[`upperarm_${free}`], s.joint[`forearm_${free}`], boxes), `${at} free arm`).toBeGreaterThanOrEqual(LIMB_RADIUS.upperarm * H);
      expect(s.joint[`hand_${free}`].distanceTo(s.joint.head), `${at} hand off the head`).toBeGreaterThan(0.09);
      expect(distanceToBoxes(s.joint.pelvis, s.joint.spine_03, boxes), `${at} torso`).toBeGreaterThanOrEqual((LIMB_RADIUS.torso - 0.005 / H) * H);
    }
  });
});
