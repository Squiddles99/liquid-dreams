import { Euler, Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { type BoardKind, deckYAt, halfWidthAt, layoutFor, makeBoard, uAt } from '../board/boardSpec';
import { flexDeg } from './ik';
import { posesFor } from './poseNames';
import { type PoseDials, poseTargets, sideOf } from './poses';
import { PRESETS, type Stance } from './presets';
import { BONES, LIMITS, PARENT, type SkeletonRest, referenceSkeleton } from './rig';
import { POSE_PHASE, POSE_ZONE } from './rideState';
import { type BoardFrame, boardQuaternion, solvePose } from './solvePose';

const frame = (e: Euler, p = new Vector3(3, 1, -2)): BoardFrame => {
  const q = new Quaternion().setFromEuler(e);
  return { position: p, forward: new Vector3(1, 0, 0).applyQuaternion(q), up: new Vector3(0, 1, 0).applyQuaternion(q) };
};
/** Flat; tilted every way; pitched 70° nose-up; rolled 60° (Review Focus 5). */
const FRAMES = [frame(new Euler(0, 0, 0), new Vector3()), frame(new Euler(0.3, 1.1, -0.5)), frame(new Euler(0, 0, 1.22)), frame(new Euler(1.05, 0.4, 0))];
const LEVELS = [-1, 0, 1];
const PHASES = [0, 0.25, 0.5, 0.75, 1];
const RESTS = [referenceSkeleton(PRESETS.female.heightM), referenceSkeleton(PRESETS.male.heightM)];
const KINDS: BoardKind[] = ['thruster', 'stepUp', 'bodyboard'];

describe.each(KINDS)('every %s pose, both stances, both bodies, every dial extreme, every tilt', (kind) => {
  for (const pose of posesFor(kind)) {
    it(pose, () => {
      let ankle = 0, knee = 0, elbow = 0, spine = 0, head = 0, poleSide = Infinity, bad = 0;
      for (const rest of RESTS) {
        const spec = makeBoard(kind, PRESETS[rest.heightM < 1.7 ? 'female' : 'male'].quiver[kind]);
        const layout = layoutFor(spec, rest.heightM);
        for (const stance of ['regular', 'goofy'] as Stance[])
          for (const c of LEVELS) for (const l of LEVELS) for (const tw of LEVELS) for (const r of LEVELS)
            for (const phaseT of PHASES)
              for (const fr of FRAMES) {
                const dials: PoseDials = { compression: c, lean: l, twist: tw, reach: r };
                const t = poseTargets(pose, { spec, layout, rest, stance, dials, phaseT });
                const Qb = boardQuaternion(fr);
                const s = solvePose(rest, t, fr, fr.position.clone().add(t.look.clone().applyQuaternion(Qb).multiplyScalar(10)));
                for (const side of ['l', 'r'] as const) {
                  const target = t.feet[side].ankle.clone().applyQuaternion(Qb).add(fr.position);
                  ankle = Math.max(ankle, s.joint[`foot_${side}`].distanceTo(target));
                  const H = s.joint[`thigh_${side}`], K = s.joint[`shin_${side}`], A = s.joint[`foot_${side}`];
                  knee = Math.max(knee, flexDeg(H, K, A));
                  elbow = Math.max(elbow, flexDeg(s.joint[`upperarm_${side}`], s.joint[`forearm_${side}`], s.joint[`hand_${side}`]));
                  const along = A.clone().sub(H).normalize(), off = K.clone().sub(H);
                  off.sub(along.clone().multiplyScalar(off.dot(along)));
                  const pole = t.feet[side].pole.clone().applyQuaternion(Qb);
                  if (flexDeg(H, K, A) > 5) poleSide = Math.min(poleSide, off.dot(pole.sub(along.multiplyScalar(pole.dot(along)))));
                }
                for (const b of ['spine_01', 'spine_02', 'spine_03'] as const) spine = Math.max(spine, (2 * Math.acos(Math.min(1, Math.abs(s.local[b].w))) * 180) / Math.PI);
                const headFwd = new Vector3(0, 0, 1).applyQuaternion(s.world.head).applyQuaternion(s.world.spine_03.clone().invert());
                head = Math.max(head, Math.abs((Math.atan2(headFwd.x, headFwd.z) * 180) / Math.PI));
                for (const b of BONES) if (![s.local[b].x, s.local[b].y, s.local[b].z, s.local[b].w].every(Number.isFinite)) bad++;
              }
      }
      expect(bad, 'non-finite rotations').toBe(0);
      expect(ankle, 'worst ankle miss (m)').toBeLessThan(0.01);
      expect(knee, 'worst knee flex (°)').toBeLessThanOrEqual(LIMITS.kneeMaxDeg + 0.5);
      expect(elbow, 'worst elbow flex (°)').toBeLessThanOrEqual(LIMITS.elbowMaxDeg + 0.5);
      expect(spine, 'worst spine bone (°)').toBeLessThanOrEqual(LIMITS.spineBoneMaxDeg + 0.5);
      expect(head, 'worst head yaw (°)').toBeLessThanOrEqual(LIMITS.headYawMaxDeg + 0.5);
      expect(poleSide, 'a knee bent away from its pole').toBeGreaterThan(-1e-9);
    });
  }
});

describe('stance', () => {
  const rest = referenceSkeleton(1.78), spec = makeBoard('thruster', PRESETS.male.quiver.thruster), layout = layoutFor(spec, 1.78);
  const dials = { compression: 0, lean: 0, twist: 0, reach: 0 };
  it('puts the left foot forward for regular and the right for goofy', () => {
    const reg = poseTargets('trim', { spec, layout, rest, stance: 'regular', dials, phaseT: 0 });
    const goofy = poseTargets('trim', { spec, layout, rest, stance: 'goofy', dials, phaseT: 0 });
    expect(reg.feet.l.ankle.x).toBeGreaterThan(reg.feet.r.ankle.x);
    expect(goofy.feet.r.ankle.x).toBeGreaterThan(goofy.feet.l.ankle.x);
  });
  it('rides the Womb backside regular and frontside goofy', () => {
    expect(sideOf('regular')).toBe('backside');
    expect(sideOf('goofy')).toBe('frontside');
  });
});

describe('the rotations drive a real hierarchy (what Surfer.applyPose relies on)', () => {
  it('rebuilds every joint from the local rotations, even when the rest bones are rotated', () => {
    const ref = referenceSkeleton(1.65);
    const q = (i: number): Quaternion => new Quaternion().setFromEuler(new Euler(0.3 * i, -0.2 * i, 0.1 * i));
    const rest: SkeletonRest = { ...ref, restQ: Object.fromEntries(BONES.map((b, i) => [b, q(i)])) as SkeletonRest['restQ'] };
    const spec = makeBoard('stepUp', PRESETS.female.quiver.stepUp);
    const t = poseTargets('barrel', { spec, layout: layoutFor(spec, 1.65), rest, stance: 'regular', dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, phaseT: 0 });
    const s = solvePose(rest, t, FRAMES[1], null);
    // Three stores each bone's rest offset in its parent's rest frame: restQ[p]⁻¹ · (joint − parentJoint).
    const world: Record<string, Quaternion> = {}, pos: Record<string, Vector3> = {};
    for (const b of BONES) {
      const p = PARENT[b];
      if (!p) { world[b] = s.local[b].clone(); pos[b] = rest.joint[b].clone(); continue; }
      world[b] = world[p].clone().multiply(s.local[b]);
      const localOffset = rest.joint[b].clone().sub(rest.joint[p]).applyQuaternion(rest.restQ[p].clone().invert());
      pos[b] = b === 'pelvis' ? s.pelvisWorld.clone() : pos[p].clone().add(localOffset.applyQuaternion(world[p]));
    }
    for (const b of BONES) expect(pos[b].distanceTo(s.joint[b]), b).toBeLessThan(1e-6);
  });
});

describe('ride state', () => {
  it('gives every pose a phase and a zone', () => {
    for (const k of KINDS) for (const p of posesFor(k)) expect([POSE_PHASE[p], POSE_ZONE[p]].every(Boolean)).toBe(true);
  });
});

describe('nothing sinks through the board (Andrew, gate 2: the drop-knee knee went through the bodyboard)', () => {
  const inside = (spec: ReturnType<typeof makeBoard>, x: number, z: number): boolean => Math.abs(x) < spec.lengthM / 2 && Math.abs(z) < halfWidthAt(spec, uAt(spec, x));
  for (const kind of KINDS) {
    it(`${kind}: every joint over the deck sits on or above it; knees a kneecap above (4 cm)`, () => {
      const worst: string[] = [];
      for (const rest of RESTS) {
        const spec = makeBoard(kind, PRESETS[rest.heightM < 1.7 ? 'female' : 'male'].quiver[kind]);
        const layout = layoutFor(spec, rest.heightM);
        for (const pose of posesFor(kind)) for (const stance of ['regular', 'goofy'] as Stance[])
          for (const c of LEVELS) for (const l of LEVELS) for (const phaseT of PHASES) {
            const t = poseTargets(pose, { spec, layout, rest, stance, dials: { compression: c, lean: l, twist: 0, reach: 0 }, phaseT });
            const s = solvePose(rest, t, FRAMES[0], null); // flat board at the origin: world = board frame
            for (const b of BONES) {
              const p = s.joint[b];
              if (b === 'root' || !inside(spec, p.x, p.z)) continue; // root is the skeleton's origin, not a body part
              const clearance = p.y - deckYAt(spec, p.x, p.z), need = b.startsWith('shin') ? 0.04 : -0.005;
              if (clearance < need) worst.push(`${pose}/${stance}/c${c}/l${l}/t${phaseT}: ${b} ${(clearance * 100).toFixed(1)} cm`);
            }
          }
      }
      const tally: Record<string, number> = {};
      for (const w of worst) { const k = w.split(':')[0].split('/')[0] + ' ' + w.split(': ')[1].split(' ')[0]; tally[k] = (tally[k] ?? 0) + 1; }
      expect(JSON.stringify(tally), `${worst.length} joints through the deck; e.g. ${worst.slice(0, 3).join('; ')}`).toBe('{}');
    });
  }
});
