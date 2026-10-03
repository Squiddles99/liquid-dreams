import { Euler, Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { deckYAt, halfWidthAt, layoutFor, uAt } from '../board/boardSpec';
import { balanceAt } from './balance';
import { syntheticRiderClips } from './clipFixture';
import { sampleClip } from './clipPlayer';
import { type ClipPoseContext, clipPose } from './clipPose';
import { clipFor } from './clips';
import { flexDeg } from './ik';
import { PRESETS, type Stance, boardFor } from './presets';
import { BONES, LIMITS, measures, referenceSkeleton } from './rig';
import { type BoardFrame, boardQuaternion } from './solvePose';

const frame = (e: Euler, p = new Vector3(3, 1, -2)): BoardFrame => {
  const q = new Quaternion().setFromEuler(e);
  return { position: p, forward: new Vector3(1, 0, 0).applyQuaternion(q), up: new Vector3(0, 1, 0).applyQuaternion(q) };
};
const FLAT = frame(new Euler(0, 0, 0), new Vector3());
const FRAMES = [FLAT, frame(new Euler(0.3, 1.1, -0.5)), frame(new Euler(0, 0, 1.22)), frame(new Euler(1.05, 0.4, 0))];
const LEVELS = [-1, 0, 1];
const RIDERS = (['female', 'male'] as const).map((name) => ({ name, preset: PRESETS[name], rest: referenceSkeleton(PRESETS[name].heightM) }));
const STANCES: Stance[] = ['regular', 'goofy'];
const KINDS = ['thruster', 'stepUp'] as const;

function setup(name: 'female' | 'male', kind: (typeof KINDS)[number], stance: Stance) {
  const { preset, rest } = RIDERS.find((r) => r.name === name)!;
  const spec = boardFor(preset, kind), layout = layoutFor(spec, rest.heightM);
  const rc = syntheticRiderClips(rest);
  return { rest, spec, layout, rc, clip: clipFor(rc, 'trim', stance)! };
}
const ctxOf = (s: ReturnType<typeof setup>, stance: Stance, c = 0, l = 0, tw = 0, bal: ClipPoseContext['balance'] = null): ClipPoseContext =>
  ({ spec: s.spec, layout: s.layout, stance, dials: { compression: c, lean: l, twist: tw, reach: 0 }, balance: bal });

describe('the clip on the board (clip slice spec §4.1, §5)', () => {
  it('plants each ankle on its spot (≤ 5 mm), knees toward the toes and within limits, nothing through the deck: every rider, board, stance, time, dial and balance', () => {
    const worst: string[] = [];
    for (const { name } of RIDERS) for (const kind of KINDS) for (const stance of STANCES) {
      const s = setup(name, kind, stance), m = measures(s.rest);
      const lead = stance === 'regular' ? 'l' : 'r', trail = lead === 'l' ? 'r' : 'l', f = new Vector3(0, 0, stance === 'regular' ? 1 : -1);
      const want = { [lead]: new Vector3(...s.layout.spots.front).setY(s.layout.spots.front[1] + m.ankleH), [trail]: new Vector3(...s.layout.spots.back).setY(s.layout.spots.back[1] + m.ankleH) } as Record<'l' | 'r', Vector3>;
      for (let i = 0; i < 32; i++) {
        const t = (2 * i) / 32, sample = sampleClip(s.clip, s.rc.fps, t);
        for (const c of LEVELS) for (const l of LEVELS) for (const tw of LEVELS) for (const bal of [null, balanceAt(7, t, 1, 0.5)]) {
          const J = clipPose(s.rest, sample, ctxOf(s, stance, c, l, tw, bal), FLAT, null).joint;
          const tag = `${name}/${kind}/${stance}/t${t}/c${c}l${l}w${tw}${bal ? '/bal' : ''}`;
          for (const side of ['l', 'r'] as const) {
            const err = J[`foot_${side}`].distanceTo(want[side]);
            if (err > 0.005) worst.push(`${tag}: ankle_${side} ${(err * 1000).toFixed(1)} mm off`);
            const hip = J[`thigh_${side}`], knee = J[`shin_${side}`], ankle = J[`foot_${side}`];
            if (flexDeg(hip, knee, ankle) > LIMITS.kneeMaxDeg + 0.5) worst.push(`${tag}: knee_${side} over-bent`);
            if (knee.clone().sub(hip.clone().add(ankle).multiplyScalar(0.5)).dot(f) <= 0) worst.push(`${tag}: knee_${side} bends backwards`);
          }
          for (const b of BONES) {
            const p = J[b];
            if (b === 'root' || Math.abs(p.x) >= s.spec.lengthM / 2 || Math.abs(p.z) >= halfWidthAt(s.spec, uAt(s.spec, p.x))) continue;
            const clearance = p.y - deckYAt(s.spec, p.x, p.z), need = b.startsWith('shin') ? 0.04 : -0.005;
            if (clearance < need) worst.push(`${tag}: ${b} ${(clearance * 100).toFixed(1)} cm into the deck`);
          }
        }
      }
    }
    expect(worst.length, worst.slice(0, 3).join('; ')).toBe(0);
  });

  it('is the same on the board however the board is tilted (Review Focus 5)', () => {
    const s = setup('female', 'thruster', 'regular'), sample = sampleClip(s.clip, 30, 0.4);
    const inBoard = (fr: BoardFrame, v: Vector3): Vector3 => v.clone().sub(fr.position).applyQuaternion(boardQuaternion(fr).invert());
    const ref = clipPose(s.rest, sample, ctxOf(s, 'regular', 0.5, 0.5, 0.5), FLAT, null).joint;
    for (const fr of FRAMES.slice(1)) {
      const J = clipPose(s.rest, sample, ctxOf(s, 'regular', 0.5, 0.5, 0.5), fr, null).joint;
      for (const b of BONES) if (b !== 'root') expect(inBoard(fr, J[b]).distanceTo(ref[b]), b).toBeLessThan(1e-6);
    }
  });

  it('turns the dials into corrections: compression lowers the hips, lean tips toward the toes, twist turns the chest to the nose', () => {
    for (const stance of STANCES) {
      const s = setup('male', 'thruster', stance), sample = sampleClip(s.clip, 30, 0);
      const f = new Vector3(0, 0, stance === 'regular' ? 1 : -1);
      const at = (c: number, l: number, tw: number) => clipPose(s.rest, sample, ctxOf(s, stance, c, l, tw), FLAT, null);
      const base = at(0, 0, 0);
      expect(base.pelvisWorld.y - at(1, 0, 0).pelvisWorld.y, `${stance} compression`).toBeGreaterThan(0.1);
      expect(at(0, 1, 0).joint.spine_03.dot(f) - base.joint.spine_03.dot(f), `${stance} lean`).toBeGreaterThan(0.05);
      const chestFwd = (q: Quaternion): Vector3 => new Vector3(0, 0, 1).applyQuaternion(q);
      expect(chestFwd(at(0, 0, 1).world.spine_03).x - chestFwd(base.world.spine_03).x, `${stance} twist`).toBeGreaterThan(0.2);
    }
  });

  it('faces the rail for the stance: regular toward +z, goofy toward −z', () => {
    for (const stance of STANCES) {
      const s = setup('female', 'thruster', stance);
      const w = clipPose(s.rest, sampleClip(s.clip, 30, 0), ctxOf(s, stance), FLAT, null).world.pelvis;
      expect(new Vector3(0, 0, 1).applyQuaternion(w).z * (stance === 'regular' ? 1 : -1)).toBeGreaterThan(0.8);
    }
  });

  it('never spins a wrong-footed clip round to the other rail: the yaw is held to ±60° (Review Focus 4)', () => {
    // A mislabelled clip: facing the right rail but with the left (lead) foot crossed behind the right. Unclamped, the
    // ankle line points to the tail and the rider would turn 180° to face the wrong rail.
    const s = setup('female', 'thruster', 'regular'), sample = sampleClip(s.clip, 30, 0);
    const z = (deg: number): Quaternion => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (deg * Math.PI) / 180);
    sample.rot.thigh_l = z(-30); sample.rot.shin_l = z(-30);
    sample.rot.thigh_r = z(30); sample.rot.shin_r = z(30);
    const w = clipPose(s.rest, sample, ctxOf(s, 'regular'), FLAT, null).world.pelvis;
    expect(new Vector3(0, 0, 1).applyQuaternion(w).z).toBeGreaterThan(0.4); // cos 60° = 0.5; unclamped it'd be −1
  });

  it('passes the clip’s fingers through in world terms, and none when the clip has none', () => {
    const { rest, spec, layout } = setup('female', 'thruster', 'regular');
    const withF = syntheticRiderClips(rest, { fingers: true });
    const ctx: ClipPoseContext = { spec, layout, stance: 'regular', dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, balance: null };
    const a = clipPose(rest, sampleClip(withF.clips.trim, 30, 0), ctx, FRAMES[1], null);
    expect(Object.keys(a.fingers).length).toBe(30);
    expect(a.fingers.index_01_l!.angleTo(a.world.hand_l.clone().multiply(rest.restQ.hand_l.clone().invert()))).toBeLessThan(1e-6);
    const b = clipPose(rest, sampleClip(syntheticRiderClips(rest).clips.trim, 30, 0), ctx, FRAMES[1], null);
    expect(Object.keys(b.fingers).length).toBe(0);
  });

  it('the head looks where the game says, off the chest as in the code poses, not the capture’s glance down at the deck (Andrew, Gate C)', () => {
    const s = setup('female', 'thruster', 'regular');
    const fwd = (q: Quaternion): Vector3 => new Vector3(0, 0, 1).applyQuaternion(q);
    for (let i = 0; i < 8; i++) {
      const sample = sampleClip(s.clip, 30, i / 4);
      // The capture's skater looking down at the deck, as CMU's does.
      const down = (deg: number): Quaternion => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (deg * Math.PI) / 180);
      sample.rot.neck = down(15); sample.rot.head = down(40);
      const p = clipPose(s.rest, sample, ctxOf(s, 'regular'), FLAT, new Vector3(20, 1.5, 3)); // down the line, head height
      const head = fwd(p.world.head), chest = fwd(p.world.spine_03);
      expect((Math.asin(head.y) * 180) / Math.PI, `t${i / 4} head pitch`).toBeGreaterThan(-12);
      const off = (Math.acos(Math.min(1, new Vector3(head.x, 0, head.z).normalize().dot(new Vector3(chest.x, 0, chest.z).normalize()))) * 180) / Math.PI;
      expect(off, `t${i / 4} head off the chest`).toBeLessThanOrEqual(75.5);
    }
  });
  it('opens the chest toward the nose as the code trim does, so the neck isn’t doing all the turning', () => {
    for (const stance of STANCES) {
      const s = setup('female', 'thruster', stance);
      const chest = new Vector3(0, 0, 1).applyQuaternion(clipPose(s.rest, sampleClip(s.clip, 30, 0), ctxOf(s, stance), FLAT, null).world.spine_03);
      expect(chest.x, stance).toBeGreaterThan(Math.sin((15 * Math.PI) / 180)); // ≥ 15° toward the nose (+x)
    }
  });
  it('turns the head toward a look target on top of the clip', () => {
    const s = setup('female', 'thruster', 'regular'), sample = sampleClip(s.clip, 30, 0);
    const noLook = clipPose(s.rest, sample, ctxOf(s, 'regular'), FLAT, null);
    const look = clipPose(s.rest, sample, ctxOf(s, 'regular'), FLAT, new Vector3(10, 1.5, 2));
    const fwd = (q: Quaternion): Vector3 => new Vector3(0, 0, 1).applyQuaternion(q);
    expect(fwd(look.world.head).x).toBeGreaterThan(fwd(noLook.world.head).x + 0.2);
  });
});
