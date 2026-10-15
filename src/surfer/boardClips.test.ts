// Hero swap (2026-10-16): Andrew's approved lying and sitting clips ride the board itself (boardClips.ts).
import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { deckYAt } from '../board/boardSpec';
import { type BoardClips, boardClipPose, boardClipsProblems, sampleBoardClip } from './boardClips';
import { PRESETS, boardFor } from './presets';
import { BONES, referenceSkeleton } from './rig';
import type { BoardFrame } from './solvePose';

const rest = referenceSkeleton(PRESETS.female.heightM), spec = boardFor(PRESETS.female, 'thruster');
const ident = [0, 0, 0, 1];
// One still frame: every bone at rest, the pelvis 40 % of the way from the middle to the nose, 0.3 m over the deck,
// 5 cm toward the right rail.
const still = (pelvis: number[]): BoardClips => ({
  rider: 'test', fps: 24, boardLengthM: 1.83,
  clips: { sitIdle: { loop: true, frames: 2, pelvis: [...pelvis, ...pelvis], rot: Object.fromEntries(BONES.filter((b) => b !== 'root').map((b) => [b, [...ident, ...ident]])) } },
});
const FLAT: BoardFrame = { position: new Vector3(), forward: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) };

describe('board clips: the approved lying and sitting clips ride the board', () => {
  it('the validator rejects a clip with the wrong number of values, and passes a good file', () => {
    expect(boardClipsProblems(still([0.2, 0.3, 0.05]))).toEqual([]);
    const bad = still([0.2, 0.3, 0.05]);
    bad.clips.sitIdle.pelvis.pop();
    expect(boardClipsProblems(bad).length).toBeGreaterThan(0);
    expect(boardClipsProblems({ rider: 'x' }).length).toBeGreaterThan(0);
  });
  it('the pelvis sits at the same share of the game board, the same height over its deck', () => {
    const lib = still([0.2, 0.3, 0.05]), s = sampleBoardClip(lib, 'sitIdle', 0)!;
    const J = boardClipPose(rest, s, spec, FLAT).joint;
    const x = 0.2 * spec.lengthM;
    expect(J.pelvis.x).toBeCloseTo(x, 4);
    expect(J.pelvis.y).toBeCloseTo(deckYAt(spec, x, 0) + 0.3, 4);
    expect(J.pelvis.z).toBeCloseTo(0.05, 4);
  });
  it('she moves with the board: the board rolled and moved, every joint rolled and moved with it', () => {
    const lib = still([0.2, 0.3, 0.05]), s = sampleBoardClip(lib, 'sitIdle', 0)!;
    const roll = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4), at = new Vector3(3, 1, -2);
    const B: BoardFrame = { position: at.clone(), forward: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0).applyQuaternion(roll) };
    const J0 = boardClipPose(rest, s, spec, FLAT).joint, J1 = boardClipPose(rest, s, spec, B).joint;
    for (const b of BONES) if (b !== 'root') expect(J1[b].distanceTo(J0[b].clone().applyQuaternion(roll).add(at)), b).toBeLessThan(1e-4);
  });
  it('a missing clip samples as null (the stand falls back to the code poses)', () => {
    expect(sampleBoardClip(still([0, 0.3, 0]), 'paddleCycle', 0)).toBeNull();
  });
});

describe('the exported clips on the game riders (public/surfer/poses/board-clips.json)', async () => {
  const { readFileSync } = await import('node:fs');
  const real = JSON.parse(readFileSync('public/surfer/poses/board-clips.json', 'utf8')) as BoardClips;
  it('the file passes the validator and has the three clips the game plays', () => {
    expect(boardClipsProblems(real)).toEqual([]);
    for (const n of ['sitIdle', 'sitToProne', 'paddleCycle']) expect(real.clips[n], n).toBeTruthy();
  });
  for (const name of ['female', 'male'] as const) {
    const r = referenceSkeleton(PRESETS[name].heightM), sp = boardFor(PRESETS[name], 'thruster');
    it(`${name}: lying to paddle, the trunk and head stay on or above the deck, every frame`, () => {
      const c = real.clips.paddleCycle;
      for (let f = 0; f < c.frames; f++) {
        const J = boardClipPose(r, sampleBoardClip(real, 'paddleCycle', f / real.fps)!, sp, FLAT).joint;
        for (const b of ['pelvis', 'spine_02', 'spine_03', 'neck', 'head'] as const) {
          const x = Math.max(-sp.lengthM / 2, Math.min(sp.lengthM / 2, J[b].x));
          expect(J[b].y - deckYAt(sp, x, 0), `${b} frame ${f}`).toBeGreaterThan(0);
        }
      }
    });
    it(`${name}: lying down from sitting (sitToProne), the hips never sink into the deck (final review: the clip dips 4 cm)`, () => {
      const c = real.clips.sitToProne;
      for (let f = 0; f < c.frames; f++) {
        const J = boardClipPose(r, sampleBoardClip(real, 'sitToProne', f / real.fps)!, sp, FLAT).joint;
        expect(J.pelvis.y - deckYAt(sp, Math.max(-sp.lengthM / 2, Math.min(sp.lengthM / 2, J.pelvis.x)), 0), `frame ${f}`).toBeGreaterThan(0.08);
      }
    });
    it(`${name}: sitting, the pelvis is on the deck (not floating, not sunk) every frame`, () => {
      const c = real.clips.sitIdle;
      for (let f = 0; f < c.frames; f += 4) {
        const J = boardClipPose(r, sampleBoardClip(real, 'sitIdle', f / real.fps)!, sp, FLAT).joint;
        const h = J.pelvis.y - deckYAt(sp, J.pelvis.x, 0);
        expect(h, `frame ${f}`).toBeGreaterThan(0.03);
        expect(h, `frame ${f}`).toBeLessThan(0.3);
      }
    });
  }
});
