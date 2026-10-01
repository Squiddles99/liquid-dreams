import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { layoutFor } from '../board/boardSpec';
import { HAND_REACH, LIMB_RADIUS, boardBoxes, carriedBoard, distanceToBoxes } from './carry';
import { flexDeg } from './ik';
import { groundFrame } from './placement';
import { poseTargets } from './poses';
import { PRESETS, type PresetName, boardFor, boardsFor } from './presets';
import { BONES, type BoneName, type Limb, type SkeletonRest, type SurferManifest, referenceSkeleton, restFromManifest } from './rig';
import { boardQuaternion, solvePose } from './solvePose';

const DIALS = { compression: 0, lean: 0, twist: 0, reach: 0 };
const NAMES: PresetName[] = ['female', 'male', 'grommet'];

/** The built body's rest skeleton (joints from its manifest; rest rotations don't change where the joints go). */
function builtRest(name: PresetName): SkeletonRest {
  const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
  return restFromManifest(man, Object.fromEntries(BONES.map((b) => [b, new Quaternion()])) as Record<BoneName, Quaternion>);
}

/** Every rider × skeleton (reference, built) × board × side, solved on a tilted-heading ground frame (Review Focus 5). */
function cases(): { tag: string; name: PresetName; rest: SkeletonRest; kind: ReturnType<typeof boardsFor>[number]; side: Limb }[] {
  const out = [];
  for (const name of NAMES) for (const [skel, rest] of [['ref', referenceSkeleton(PRESETS[name].heightM)], ['built', builtRest(name)]] as const)
    for (const kind of boardsFor(PRESETS[name])) for (const side of ['l', 'r'] as Limb[]) out.push({ tag: `${name} ${skel} ${kind} ${side}`, name, rest, kind, side });
  return out;
}

const ground = groundFrame({ x: 5, z: -2, headingDeg: 137, heightNudgeM: 0, pitchNudgeDeg: 0 }, 3, 0, 0);
const Qg = boardQuaternion(ground);
const toW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Qg).add(ground.position);

function solveCarry(c: ReturnType<typeof cases>[number], lookYawDeg = 0) {
  const spec = boardFor(PRESETS[c.name], c.kind);
  const t = poseTargets('carry', { spec, layout: layoutFor(spec, c.rest.heightM), rest: c.rest, stance: 'regular', dials: DIALS, phaseT: 0, carrySide: c.side });
  const look = t.look.clone().applyAxisAngle(new Vector3(0, 1, 0), (lookYawDeg * Math.PI) / 180).applyQuaternion(Qg);
  const head = toW(c.rest.joint.head);
  const s = solvePose(c.rest, t, ground, head.add(look.multiplyScalar(10)));
  return { spec, t, s, board: carriedBoard(t.carry!, ground, s) };
}

describe('the carry (walking spec §4): the board under the arm, every rider, board and side', () => {
  for (const c of cases()) {
    it(c.tag, () => {
      const { spec, t, s, board } = solveCarry(c);
      const H = c.rest.heightM, side = c.side, free: Limb = side === 'l' ? 'r' : 'l';
      expect(t.carry!.side).toBe(side);
      // The hand reaches its target.
      expect(s.joint[`hand_${side}`].distanceTo(toW(t.carry!.hand)), 'hand to target').toBeLessThan(0.02);
      // The fingers reach under the lower rail (surfboards) or rest on the bottom face (the bodyboard: ruling).
      const hand = s.joint[`hand_${side}`], Qb = boardQuaternion(board);
      const rail = new Vector3(0, 0, 1).applyQuaternion(Qb), fwd = board.forward.clone().normalize();
      const lowerSign = rail.y < 0 ? 1 : -1;
      const onRail = board.position.clone().add(rail.clone().multiplyScalar(lowerSign * spec.maxWidthM / 2)).add(board.up.clone().multiplyScalar(spec.thicknessM / 2));
      const rel = hand.clone().sub(onRail);
      const toRailLine = rel.clone().sub(fwd.clone().multiplyScalar(rel.dot(fwd))).length();
      const toBottom = Math.abs(hand.clone().sub(board.position).dot(board.up.clone().normalize()));
      const reach = HAND_REACH * H + 0.02;
      if (c.kind === 'bodyboard') expect(Math.min(toRailLine, toBottom), 'hand to the bottom face').toBeLessThan(reach);
      else expect(toRailLine, 'hand to the lower rail').toBeLessThan(reach);
      // Nothing in the board: the torso, legs and both arms are clear of it by their radius.
      const boxes = boardBoxes(board, spec);
      const seg = (a: BoneName, b: BoneName): number => distanceToBoxes(s.joint[a], s.joint[b], boxes);
      // The board is clamped against the ribs and under the arm, the forearm along its bottom: up to 5 mm of contact
      // there is soft tissue pressed on it, not a limb through it.
      const pressed = 0.005 / H;
      const clear: [BoneName, BoneName, number][] = [
        ['pelvis', 'spine_03', LIMB_RADIUS.torso - pressed], ['thigh_l', 'shin_l', LIMB_RADIUS.thigh], ['thigh_r', 'shin_r', LIMB_RADIUS.thigh],
        ['shin_l', 'foot_l', LIMB_RADIUS.shin], ['shin_r', 'foot_r', LIMB_RADIUS.shin],
        [`upperarm_${side}`, `forearm_${side}`, LIMB_RADIUS.upperarm - pressed], [`forearm_${side}`, `hand_${side}`, LIMB_RADIUS.forearm - pressed],
        [`upperarm_${free}`, `forearm_${free}`, LIMB_RADIUS.upperarm], [`forearm_${free}`, `hand_${free}`, LIMB_RADIUS.forearm],
      ];
      for (const [a, b, r] of clear) expect(seg(a, b), `${a}–${b} clear of the board`).toBeGreaterThanOrEqual(r * H);
      // Carried about level, nose ahead of the hand (Andrew's photo: level to a touch up; tuned at the gate).
      expect(Math.abs(fwd.y), 'board pitch').toBeLessThan(Math.sin((10 * Math.PI) / 180));
      const heading = ground.forward.clone().normalize();
      expect(board.position.clone().add(fwd.clone().multiplyScalar(spec.lengthM / 2)).sub(hand).dot(heading)).toBeGreaterThan(0);
      // Standing: knees nearly straight, ankles where they're put.
      for (const l of ['l', 'r'] as const) {
        expect(flexDeg(s.joint[`thigh_${l}`], s.joint[`shin_${l}`], s.joint[`foot_${l}`]), `knee ${l}`).toBeLessThanOrEqual(25);
        expect(s.joint[`foot_${l}`].distanceTo(toW(t.feet[l].ankle)), `ankle ${l}`).toBeLessThan(0.01);
      }
      // The free hand hangs clear of its thigh (everything renders).
      const thigh = (p: Vector3): number => {
        const a = s.joint[`thigh_${free}`], b = s.joint[`shin_${free}`], ab = b.clone().sub(a);
        const k = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
        return p.distanceTo(a.clone().add(ab.multiplyScalar(k)));
      };
      expect(thigh(s.joint[`hand_${free}`]), 'free hand clear of the thigh').toBeGreaterThan((LIMB_RADIUS.thigh + 0.5 * LIMB_RADIUS.forearm) * H);
    });
  }

  it('keeps the board still while the head looks around (idle life turns the head ±20°)', () => {
    for (const c of cases()) {
      const a = solveCarry(c, 0).board, b = solveCarry(c, 20).board, d = solveCarry(c, -20).board;
      expect(a.position.distanceTo(b.position), c.tag).toBeLessThan(0.001);
      expect(a.position.distanceTo(d.position), c.tag).toBeLessThan(0.001);
    }
  });

  it('follows the hand, not the feet', () => {
    const c = cases()[0], { t, s } = solveCarry(c);
    const before = carriedBoard(t.carry!, ground, s).position.clone();
    s.joint[`hand_${c.side}`].add(new Vector3(0, 0.05, 0));
    expect(carriedBoard(t.carry!, ground, s).position.clone().sub(before).y).toBeCloseTo(0.05, 9);
  });
});
