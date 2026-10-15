// Hero swap final review (2026-10-16): fades between what draws the body ride the board, never the world.
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { type BoardClips, boardClipPose, sampleBoardClip } from './boardClips';
import { fadeApplies, fadeFingers, rebaseSolved } from './poseFollow';
import { PRESETS, boardFor } from './presets';
import { BONES, referenceSkeleton } from './rig';
import type { BoardFrame } from './solvePose';

const lib = JSON.parse(readFileSync('public/surfer/poses/board-clips.json', 'utf8')) as BoardClips;
const rest = referenceSkeleton(PRESETS.female.heightM), spec = boardFor(PRESETS.female, 'thruster');
const sample = sampleBoardClip(lib, 'paddleCycle', 0.3)!;
const A: BoardFrame = { position: new Vector3(10, 0.2, -4), forward: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) };
const tilt = new Quaternion().setFromAxisAngle(new Vector3(0.3, 1, 0.2).normalize(), 0.9);
const B: BoardFrame = { position: new Vector3(11.2, 0.5, -3.1), forward: new Vector3(1, 0, 0).applyQuaternion(tilt), up: new Vector3(0, 1, 0).applyQuaternion(tilt) };

describe('fades ride the board (final review C1, C2, I1)', () => {
  it('C1: a pose shown on the board a frame ago, carried to where the board is now, is the same pose on the board now', () => {
    const onA = boardClipPose(rest, sample, spec, A), onB = boardClipPose(rest, sample, spec, B);
    const moved = rebaseSolved(onA, A, B);
    for (const b of BONES) {
      if (b === 'root') continue;
      expect(moved.joint[b].distanceTo(onB.joint[b]), b).toBeLessThan(1e-4);
      expect(Math.abs(moved.world[b].dot(onB.world[b])), b).toBeCloseTo(1, 4);
      expect(Math.abs(moved.local[b].dot(onB.local[b])), b).toBeCloseTo(1, 4);
    }
    expect(moved.pelvisWorld.distanceTo(onB.pelvisWorld)).toBeLessThan(1e-4);
  });
  it('C2: no fade across a jump (next wave, a respawn) or a clock jump; a board moving at speed still fades', () => {
    const near: BoardFrame = { ...A, position: A.position.clone().add(new Vector3(0.3, 0, 0)) };
    expect(fadeApplies(A, near, 1 / 30)).toBe(true);
    const far: BoardFrame = { ...A, position: A.position.clone().add(new Vector3(60, 0, 20)) };
    expect(fadeApplies(A, far, 1 / 60)).toBe(false);
    expect(fadeApplies(A, near, 2)).toBe(false);
  });
  it('I1: the fingers fade with the body: all the old curl at the start, the new at the end, between in between', () => {
    const from = boardClipPose(rest, sample, spec, A).fingers, to = boardClipPose(rest, sampleBoardClip(lib, 'sitIdle', 1)!, spec, A).fingers;
    const g = 'index_02_l' as const;
    expect(Math.abs(fadeFingers(from, to, 1)[g]!.dot(from[g]!))).toBeCloseTo(1, 4);
    expect(Math.abs(fadeFingers(from, to, 0)[g]!.dot(to[g]!))).toBeCloseTo(1, 4);
    const mid = fadeFingers(from, to, 0.5)[g]!;
    expect(Math.abs(mid.dot(from[g]!))).toBeLessThan(1);
    expect(Math.abs(mid.dot(to[g]!))).toBeLessThan(1);
  });
});
