// Ride pose blend Task 4 (spec §3): an authored sample (no motion-capture corrections) and the one-hand contact pull.
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { layoutFor } from '../board/boardSpec';
import { sampleClip } from './clipPlayer';
import { CLIP_BASE_COMPRESSION, CLIP_COMPRESSION_DROP, type ClipPoseContext, clipPose } from './clipPose';
import { clipFor } from './clips';
import { type KeyPoseName, type PoseLib, contactFor } from './poseLib';
import { PRESETS, type Stance, boardFor } from './presets';
import { measures, referenceSkeleton } from './rig';
import type { BoardFrame } from './solvePose';

const lib = JSON.parse(readFileSync('public/surfer/poses/poses.json', 'utf8')) as PoseLib;
const FLAT: BoardFrame = { position: new Vector3(), forward: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) };

function solve(name: 'female' | 'male', stance: Stance, pose: KeyPoseName, weight: number | null) {
  const preset = PRESETS[name], rest = referenceSkeleton(preset.heightM), spec = boardFor(preset, 'thruster');
  const layout = layoutFor(spec, rest.heightM);
  const sample = sampleClip(clipFor(lib, pose, stance)!, lib.fps, 0);
  const c = contactFor(lib, pose, stance);
  const ctx: ClipPoseContext = {
    spec, layout, stance, dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, balance: null, authored: true,
    pull: c && weight !== null ? { side: c.side, wrist: new Vector3(...c.wrist), weight } : undefined,
  };
  return { J: clipPose(rest, sample, ctx, FLAT, null).joint, c, sample, rest, layout };
}

describe('clipPose: authored samples and the contact pull (ride pose blend spec §3)', () => {
  for (const name of ['female', 'male'] as const) for (const stance of ['regular', 'goofy'] as const) {
    it(`${name} ${stance}: each contact hand lands on its spot (distance and height from the ankle within 2 cm)`, () => {
      for (const pose of ['tuck', 'stallHand', 'stallStandBarrel'] as const) {
        const { J, c } = solve(name, stance, pose, 1);
        const w = new Vector3(...c!.wrist), hand = J[`hand_${c!.side}`], ankle = J[`foot_${c!.side}`];
        expect(hand.distanceTo(ankle), `${pose} distance`).toBeCloseTo(w.length(), 1.4);
        expect(hand.y - ankle.y, `${pose} height`).toBeCloseTo(w.y, 1.4);
      }
    });
  }

  it('with no pull weight the hand stays where the pose put it', () => {
    const a = solve('female', 'regular', 'tuck', 0).J, b = solve('female', 'regular', 'tuck', null).J;
    expect(a.hand_r.distanceTo(b.hand_r)).toBeLessThan(1e-6);
  });

  it('the feet stay on their stance spots (1 cm) with the pull on', () => {
    const { J, rest, layout } = solve('female', 'regular', 'tuck', 1), m = measures(rest);
    const front = new Vector3(...layout.spots.front).setY(layout.spots.front[1] + m.ankleH), back = new Vector3(...layout.spots.back).setY(layout.spots.back[1] + m.ankleH);
    expect(J.foot_l.distanceTo(front)).toBeLessThan(0.01);
    expect(J.foot_r.distanceTo(back)).toBeLessThan(0.01);
  });

  it('an authored pose keeps its own crouch: no motion-capture base drop (the hips that drop higher than unflagged)', () => {
    // Poses carry over as joint angles, so the hips' height follows each body's legs: compare flagged and unflagged.
    const preset = PRESETS.female, rest = referenceSkeleton(preset.heightM), spec = boardFor(preset, 'thruster'), layout = layoutFor(spec, rest.heightM);
    const sample = sampleClip(clipFor(lib, 'stallTall', 'regular')!, lib.fps, 0);
    const base = { spec, layout, stance: 'regular' as const, dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, balance: null };
    const a = clipPose(rest, sample, { ...base, authored: true }, FLAT, null).joint.pelvis.y;
    const b = clipPose(rest, sample, base, FLAT, null).joint.pelvis.y;
    expect(a - b).toBeCloseTo(CLIP_COMPRESSION_DROP * measures(rest).legLen * CLIP_BASE_COMPRESSION, 2);
  });
});
