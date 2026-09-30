import { Euler, Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { type BoardKind, deckYAt, halfWidthAt, layoutFor, makeBoard, uAt } from '../board/boardSpec';
import { flexDeg } from './ik';
import { posesFor } from './poseNames';
import { type PoseDials, poseTargets, sideOf } from './poses';
import { PRESETS, type Stance, boardFor, boardsFor } from './presets';
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
/** Each preset with a reference skeleton at its height (grommet spec §7: the sweeps run over his proportions too). */
const RIDERS = (['female', 'male', 'grommet'] as const).map((name) => ({ name, preset: PRESETS[name], rest: referenceSkeleton(PRESETS[name].heightM) }));
const KINDS: BoardKind[] = ['thruster', 'stepUp', 'bodyboard'];

describe.each(KINDS)('every %s pose, both stances, both bodies, every dial extreme, every tilt', (kind) => {
  for (const pose of posesFor(kind)) {
    it(pose, () => {
      let ankle = 0, knee = 0, elbow = 0, spine = 0, head = 0, poleSide = Infinity, bad = 0;
      for (const { preset, rest } of RIDERS) {
        if (!boardsFor(preset).includes(kind)) continue;
        const spec = boardFor(preset, kind);
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
  const rest = referenceSkeleton(1.78), spec = makeBoard('thruster', PRESETS.male.quiver.thruster!), layout = layoutFor(spec, 1.78);
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
    const spec = makeBoard('stepUp', PRESETS.female.quiver.stepUp!);
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
      for (const { preset, rest } of RIDERS) {
        if (!boardsFor(preset).includes(kind)) continue;
        const spec = boardFor(preset, kind);
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

describe('drop-knee', () => {
  it('rests the back knee on its spot (within 3 cm of a kneecap above it) for every stance, body and dial', () => {
    let worst = 0;
    for (const { preset, rest } of RIDERS) {
      const spec = boardFor(preset, 'bodyboard');
      const layout = layoutFor(spec, rest.heightM);
      const spot = new Vector3(...layout.spots.dkKnee).add(new Vector3(0, 0.085, 0));
      for (const stance of ['regular', 'goofy'] as Stance[]) for (const c of LEVELS) for (const l of LEVELS) for (const tw of LEVELS) {
        const t = poseTargets('dropKnee', { spec, layout, rest, stance, dials: { compression: c, lean: l, twist: tw, reach: 0 }, phaseT: 0 });
        const s = solvePose(rest, t, FRAMES[0], null);
        worst = Math.max(worst, s.joint[stance === 'regular' ? 'shin_r' : 'shin_l'].distanceTo(spot));
      }
    }
    expect(worst).toBeLessThan(0.03);
  });
});

/** Distance from p to the segment a-b, and where along it (0…1) the nearest point is. */
function toSegment(p: Vector3, a: Vector3, b: Vector3): { d: number; u: number } {
  const ab = b.clone().sub(a), u = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return { d: p.distanceTo(a.clone().add(ab.multiplyScalar(u))), u };
}

describe('every limb shows (Andrew, gate 2: the bottom turn buried a hand in his boardies)', () => {
  // Rough flesh around the reference skeleton's bones: radius at the first joint, then at the second.
  const FLESH: [string, string, string, number, number][] = [
    ['thigh', 'thigh_l', 'shin_l', 0.09, 0.06], ['thigh', 'thigh_r', 'shin_r', 0.09, 0.06],
    ['shin', 'shin_l', 'foot_l', 0.055, 0.04], ['shin', 'shin_r', 'foot_r', 0.055, 0.04],
    ['torso', 'pelvis', 'spine_03', 0.14, 0.14], ['chest', 'spine_03', 'neck', 0.13, 0.1],
  ];
  for (const kind of KINDS) {
    it(`${kind}: no palm inside a thigh, shin or the torso, for every pose, stance, body, dial and phase`, () => {
      const worst: string[] = [];
      for (const { preset, rest } of RIDERS) {
        if (!boardsFor(preset).includes(kind)) continue;
        const spec = boardFor(preset, kind);
        const layout = layoutFor(spec, rest.heightM);
        for (const pose of posesFor(kind)) for (const stance of ['regular', 'goofy'] as Stance[])
          for (const c of LEVELS) for (const l of LEVELS) for (const tw of LEVELS) for (const r of LEVELS) for (const phaseT of PHASES) {
            const t = poseTargets(pose, { spec, layout, rest, stance, dials: { compression: c, lean: l, twist: tw, reach: r }, phaseT });
            const J = solvePose(rest, t, FRAMES[0], null).joint as Record<string, Vector3>;
            for (const side of ['l', 'r'] as const) {
              const wrist = J[`hand_${side}`], palm = wrist.clone().add(wrist.clone().sub(J[`forearm_${side}`]).normalize().multiplyScalar(0.06));
              for (const [part, a, b, r0, r1] of FLESH) {
                const { d, u } = toSegment(palm, J[a], J[b]), depth = r0 + (r1 - r0) * u - d;
                if (depth > 0) worst.push(`${pose}/${stance}/c${c}/l${l}/tw${tw}/r${r}/t${phaseT}: hand_${side} ${(depth * 100).toFixed(1)} cm into the ${part}`);
              }
            }
          }
      }
      const tally: Record<string, number> = {};
      for (const w of worst) { const k = `${w.split('/')[0]} ${w.split(': ')[1].replace(/ [\d.]+ cm/, '')}`; tally[k] = (tally[k] ?? 0) + 1; }
      expect(JSON.stringify(tally), `${worst.length} buried hands; e.g. ${worst.slice(0, 3).join('; ')}`).toBe('{}');
    });
  }
});

describe('standing knees stay up (Andrew, gate 2: the bottom turn knelt on the deck)', () => {
  // Standing as designed, a knee stays a good 15 cm off the deck; at the dials' extremes (full compression on a full
  // lean) a crouched back knee comes down, as in his photos, but its kneecap stays clear of the deck (8 cm to the joint).
  // The pig-dog drops its back knee close to the deck (his photos): 5 cm.
  const STANDING = ['drop', 'bottomTurn', 'trim', 'kickout', 'barrel'] as const;
  it('every stand-up pose, board, stance, body and dial; and the pop-up once it is up', () => {
    const worst: string[] = [];
    for (const kind of ['thruster', 'stepUp'] as BoardKind[]) for (const { preset, rest } of RIDERS) {
      if (!boardsFor(preset).includes(kind)) continue;
      const spec = boardFor(preset, kind);
      const layout = layoutFor(spec, rest.heightM);
      for (const pose of [...STANDING, 'popup'] as const) for (const stance of ['regular', 'goofy'] as Stance[])
        for (const c of LEVELS) for (const l of LEVELS) for (const tw of LEVELS) {
          const t = poseTargets(pose, { spec, layout, rest, stance, dials: { compression: c, lean: l, twist: tw, reach: 0 }, phaseT: 1 });
          const J = solvePose(rest, t, FRAMES[0], null).joint;
          const pigDog = pose === 'barrel' && sideOf(stance) === 'backside';
          for (const side of ['l', 'r'] as const) {
            const k = J[`shin_${side}`], h = k.y - deckYAt(spec, Math.max(-spec.lengthM / 2, Math.min(spec.lengthM / 2, k.x)), 0);
            const need = pigDog ? 0.05 : c === 0 && l === 0 ? 0.15 : 0.08;
            if (h < need) worst.push(`${kind}/${pose}/${stance}/c${c}/l${l}/tw${tw}: knee_${side} ${(h * 100).toFixed(1)} cm`);
          }
        }
    }
    const tally: Record<string, number> = {};
    for (const w of worst) { const k = w.split('/').slice(1, 3).join(' '); tally[k] = (tally[k] ?? 0) + 1; }
    expect(JSON.stringify(tally), `${worst.length} low knees; e.g. ${worst.slice(0, 3).join('; ')}`).toBe('{}');
  });
});

describe('prone elbows (Andrew, gate 2: the elbow pointed up and pinched, the forearm hanging to the nose)', () => {
  it('a prone rider holds the board with the elbows out and low, never above the shoulders', () => {
    const worst: string[] = [];
    for (const { preset, rest } of RIDERS) {
      const spec = boardFor(preset, 'bodyboard');
      const layout = layoutFor(spec, rest.heightM);
      for (const pose of ['prone', 'proneBarrel'] as const) for (const stance of ['regular', 'goofy'] as Stance[])
        for (const c of LEVELS) for (const l of LEVELS) for (const tw of LEVELS) for (const r of LEVELS) {
          const t = poseTargets(pose, { spec, layout, rest, stance, dials: { compression: c, lean: l, twist: tw, reach: r }, phaseT: 0 });
          const J = solvePose(rest, t, FRAMES[0], null).joint;
          for (const side of ['l', 'r'] as const) {
            const up = J[`forearm_${side}`].y - J[`upperarm_${side}`].y;
            if (up > 0) worst.push(`${pose}/${stance}: elbow_${side} ${(up * 100).toFixed(1)} cm above the shoulder`);
          }
        }
    }
    expect(worst.length, worst.slice(0, 3).join('; ')).toBe(0);
  });
});
