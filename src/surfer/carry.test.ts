import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { layoutFor } from '../board/boardSpec';
import { HAND_REACH, LIMB_RADIUS, PACK_PARTS, boardBoxes, carriedBoard, distanceToBoxes, feetOnGround } from './carry';
import { flexDeg } from './ik';
import { groundFrame } from './placement';
import { poseTargets } from './poses';
import { DIALS, GROUND, NAMES, Qg, builtRest, depthIn, handIntoBoard, packPoints, solveStand, standCases, toW } from './poseTestKit';
import { PRESETS, boardFor, boardsFor } from './presets';
import { type BoneName, type Limb, referenceSkeleton } from './rig';
import { boardQuaternion, solvePose } from './solvePose';

const cases = standCases;
const ground = GROUND;

function solveCarry(c: ReturnType<typeof cases>[number], lookYawDeg = 0) {
  return solveStand('carry', c, 0, lookYawDeg);
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

  it('lays the carrying hand along the board, the fingers clear of it (Gate A: the hand cut through the lower rail)', () => {
    for (const c of cases()) {
      const { s, board, spec } = solveCarry(c);
      expect(handIntoBoard(s, c.rest, c.side, board, spec), c.tag).toBeLessThan(0.001);
    }
  });

  it('keeps the board still while the head looks around (idle life turns the head ±20°)', () => {
    for (const c of cases()) {
      const a = solveCarry(c, 0).board, b = solveCarry(c, 20).board, d = solveCarry(c, -20).board;
      expect(a.position.distanceTo(b.position), c.tag).toBeLessThan(0.001);
      expect(a.position.distanceTo(d.position), c.tag).toBeLessThan(0.001);
    }
  });

  it('keeps its own copy of the hand’s target: whatever moves the hand target (the balance layer) moves the board with it (final review)', () => {
    const c = cases()[0], spec = boardFor(PRESETS[c.name], c.kind);
    const t = poseTargets('carry', { spec, layout: layoutFor(spec, c.rest.heightM), rest: c.rest, stance: 'regular', dials: DIALS, phaseT: 0, carrySide: c.side });
    const before = t.carry!.hand.clone();
    t.hands[c.side].pos.add(new Vector3(0, 0.03, 0.02));
    expect(t.carry!.hand.distanceTo(before)).toBe(0);
  });

  it('follows the hand, not the feet', () => {
    const c = cases()[0], { t, s } = solveCarry(c);
    const before = carriedBoard(t.carry!, ground, s).position.clone();
    s.joint[`hand_${c.side}`].add(new Vector3(0, 0.05, 0));
    expect(carriedBoard(t.carry!, ground, s).position.clone().sub(before).y).toBeCloseTo(0.05, 9);
  });
});

describe('the free hand waves (the reach dial on land: the gang, stoked; Andrew: "the surf’s up!")', () => {
  for (const c of cases().filter((x) => x.kind !== 'stepUp')) {
    it(c.tag, () => {
      const spec = boardFor(PRESETS[c.name], c.kind), free: Limb = c.side === 'l' ? 'r' : 'l';
      const t = poseTargets('carry', { spec, layout: layoutFor(spec, c.rest.heightM), rest: c.rest, stance: 'regular', dials: { ...DIALS, reach: 1 }, phaseT: 0, carrySide: c.side });
      const s = solvePose(c.rest, t, ground, toW(c.rest.joint.head).add(t.look.clone().applyQuaternion(Qg).multiplyScalar(10)));
      // Up beside the head, out to the side, clear of the head and the board.
      expect(s.joint[`hand_${free}`].y).toBeGreaterThan(s.joint.head.y);
      expect(s.joint[`hand_${free}`].distanceTo(s.joint.head)).toBeGreaterThan(0.15);
      const boxes = boardBoxes(carriedBoard(t.carry!, ground, s), spec);
      expect(distanceToBoxes(s.joint[`upperarm_${free}`], s.joint[`hand_${free}`], boxes)).toBeGreaterThan(0.1);
      // The carrying arm and the board are as they were.
      expect(s.joint[`hand_${c.side}`].distanceTo(toW(t.carry!.hand))).toBeLessThan(0.02);
    });
  }
});

describe('feet on the ground (final review: a level frame on a cross-slope buried one foot and floated the other)', () => {
  it('stands each foot flat on a slope: the heel and the ball both on the ground, the instep along its normal (Gate A: thongs sank)', () => {
    const rest = referenceSkeleton(1.78), spec = boardFor(PRESETS.male, 'thruster');
    const frame = groundFrame({ x: 10, z: 5, headingDeg: 90, heightNudgeM: 0, pitchNudgeDeg: 0 }, 1, 0, 0);
    const t = poseTargets('carry', { spec, layout: layoutFor(spec, 1.78), rest, stance: 'regular', dials: DIALS, phaseT: 0, carrySide: 'r' });
    const ankleH = t.feet.l.ankle.y, toeH = t.feet.l.toe.y;
    // Rising 0.4 m per m along the heading (+x, east) and 0.25 across it.
    const slope = (x: number, z: number): number => 1 + 0.4 * (x - 10) + 0.25 * (z - 5);
    feetOnGround(t.feet, frame, slope, 0.012);
    const Q = boardQuaternion(frame), w = (v: Vector3): Vector3 => v.clone().applyQuaternion(Q).add(frame.position);
    const n = new Vector3(-0.4, 1, -0.25).normalize();
    for (const s of ['l', 'r'] as const) {
      const a = w(t.feet[s].ankle), b = w(t.feet[s].toe);
      expect(a.y - slope(a.x, a.z), `${s} ankle over its ground`).toBeCloseTo(ankleH + 0.012, 2);
      expect(b.y - slope(b.x, b.z), `${s} ball over its ground`).toBeCloseTo(toeH + 0.012, 2);
      expect(t.feet[s].instep.clone().applyQuaternion(Q).angleTo(n), `${s} instep along the ground's normal`).toBeLessThan(0.02);
    }
  });

  it('sets each foot on the ground under it, the frame where it is', () => {
    const rest = referenceSkeleton(1.52), spec = boardFor(PRESETS.grommet, 'bodyboard');
    const frame = groundFrame({ x: 10, z: 5, headingDeg: 90, heightNudgeM: 0, pitchNudgeDeg: 0 }, 1, 0, 0.012);
    const t = poseTargets('carry', { spec, layout: layoutFor(spec, 1.52), rest, stance: 'regular', dials: DIALS, phaseT: 0, carrySide: 'l' });
    const slope = (x: number, z: number): number => 1 + 0.3 * (z - 5); // rising toward his right (+z facing east)
    const before = { l: t.feet.l.ankle.y, r: t.feet.r.ankle.y };
    feetOnGround(t.feet, frame, slope, 0.012);
    const Q = boardQuaternion(frame);
    for (const s of ['l', 'r'] as const) {
      const w = t.feet[s].ankle.clone().applyQuaternion(Q).add(frame.position);
      expect(t.feet[s].ankle.y - before[s], s).toBeCloseTo(slope(w.x, w.z) + 0.012 - frame.position.y, 2);
    }
    expect(t.feet.r.ankle.y).toBeGreaterThan(t.feet.l.ankle.y + 0.04);
    feetOnGround(t.feet, frame, () => null, 0);
  });
});

describe('the carried board clear of the rider’s own pack (final review: it cut through straps, sleeve and bag)', () => {
  for (const name of NAMES) for (const kind of boardsFor(PRESETS[name])) for (const side of ['l', 'r'] as Limb[]) {
    it(`${name} ${kind} ${side}`, () => {
      const rest = builtRest(name), spec = boardFor(PRESETS[name], kind);
      const bag = packPoints(name, PACK_PARTS.filter((m) => m !== 'packTrim')), straps = packPoints(name, ['packTrim']);
      expect(bag.length).toBeGreaterThan(100);
      const t = poseTargets('carry', { spec, layout: layoutFor(spec, rest.heightM), rest, stance: 'regular', dials: DIALS, phaseT: 0, carrySide: side });
      const s = solvePose(rest, t, ground, toW(rest.joint.head).add(t.look.clone().applyQuaternion(Qg).multiplyScalar(10)));
      const boxes = boardBoxes(carriedBoard(t.carry!, ground, s), spec);
      // The pack rides spine_03 (its straps over the shoulders half the clavicles: about a centimetre off here).
      const R = s.world.spine_03, at = rest.joint.spine_03;
      const deepest = (pts: number[][]): number => Math.max(0, ...pts.map((q) => depthIn(new Vector3(...q).sub(at).applyQuaternion(R).add(s.joint.spine_03), boxes)));
      // The bag, the wetsuit, the fins and the towel stay out of the board.
      expect(deepest(bag), 'deepest bag point inside the board (m)').toBeLessThan(0.005);
      // The straps under the arm are pressed flat by the board against the tee and the ribs (ruling), never through it:
      // no deeper than the strap stands off the skin.
      expect(deepest(straps), 'deepest strap point inside the board (m)').toBeLessThan(0.035);
      expect(s.joint[`hand_${side}`].distanceTo(toW(t.carry!.hand)), 'hand to target').toBeLessThan(0.02);
      // And everything else still holds with the board moved out for the pack.
      const H = rest.heightM, pressed = 0.005 / H, free: Limb = side === 'l' ? 'r' : 'l';
      const clear: [BoneName, BoneName, number][] = [
        ['pelvis', 'spine_03', LIMB_RADIUS.torso - pressed], [`thigh_${side}`, `shin_${side}`, LIMB_RADIUS.thigh],
        [`upperarm_${side}`, `forearm_${side}`, LIMB_RADIUS.upperarm - pressed], [`forearm_${side}`, `hand_${side}`, LIMB_RADIUS.forearm - pressed],
        [`upperarm_${free}`, `forearm_${free}`, LIMB_RADIUS.upperarm],
      ];
      for (const [a, b, r] of clear) expect(distanceToBoxes(s.joint[a], s.joint[b], boxes), `${a}–${b}`).toBeGreaterThanOrEqual(r * H);
      if (kind !== 'bodyboard') {
        const board = carriedBoard(t.carry!, ground, s), Qb = boardQuaternion(board);
        const rail = new Vector3(0, 0, 1).applyQuaternion(Qb), fwd = board.forward.clone().normalize(), lower = rail.y < 0 ? 1 : -1;
        const on = board.position.clone().add(rail.multiplyScalar(lower * spec.maxWidthM / 2)).add(board.up.clone().multiplyScalar(spec.thicknessM / 2));
        const rel = s.joint[`hand_${side}`].clone().sub(on);
        expect(rel.sub(fwd.clone().multiplyScalar(rel.dot(fwd))).length(), 'hand to the lower rail').toBeLessThan(HAND_REACH * H + 0.02);
      }
    });
  }
});
