// Hero swap (2026-10-16): which approved board clip plays, and the changes between them never snap.
import { describe, expect, it } from 'vitest';
import type { BoardClips } from './boardClips';
import { BOARD_FADE_S, type BoardClipState, stepBoardClip } from './boardClipState';
import { BONES } from './rig';

const DT = 1 / 60;
const ident = [0, 0, 0, 1];
// Each clip a still pose told apart by its pelvis height: sitIdle 0.3, sitToProne 0.3 → 0.1 over 1 s, paddleCycle 0.1.
const clip = (loop: boolean, heights: number[]) => ({
  loop, frames: heights.length, pelvis: heights.flatMap((h) => [0, h, 0]),
  rot: Object.fromEntries(BONES.filter((b) => b !== 'root').map((b) => [b, heights.flatMap(() => ident)])),
});
const lib = (withTransition = true): BoardClips => ({
  rider: 't', fps: 24, boardLengthM: 1.83,
  clips: { sitIdle: clip(true, [0.3, 0.3]), paddleCycle: clip(true, [0.1, 0.1]), ...(withTransition ? { sitToProne: clip(false, Array.from({ length: 25 }, (_, i) => 0.3 - (0.2 * i) / 24)) } : {}) },
});

function run(L: BoardClips, script: ('sit' | 'paddle')[]) {
  let st: BoardClipState | null = null;
  const names: string[] = [], h: number[] = [];
  script.forEach((pose, i) => {
    const r = stepBoardClip(st, pose, i * DT, DT, L)!;
    st = r.state;
    names.push(r.state.name);
    h.push(r.sample.pelvis.y);
  });
  return { names, h };
}
const frames = (s: number) => Math.round(s / DT);

describe('which board clip plays', () => {
  it('sitting: the sit-and-wait loop; paddling: the stroke', () => {
    expect(run(lib(), Array(10).fill('sit')).names.at(-1)).toBe('sitIdle');
    expect(run(lib(), Array(10).fill('paddle')).names.at(-1)).toBe('paddleCycle');
  });
  it('paddling from sitting: Andrew\'s sit-to-paddle once, then the stroke', () => {
    const { names } = run(lib(), [...Array(30).fill('sit'), ...Array(frames(1.5)).fill('paddle')]);
    expect(names[31]).toBe('sitToProne');
    expect(names[30 + frames(0.9)]).toBe('sitToProne');
    expect(names.at(-1)).toBe('paddleCycle');
  });
  it('without the transition in the file, sitting to paddling fades straight to the stroke', () => {
    const { names, h } = run(lib(false), [...Array(30).fill('sit'), ...Array(frames(1)).fill('paddle')]);
    expect(names.at(-1)).toBe('paddleCycle');
    expect(h.at(-1)).toBeCloseTo(0.1, 6);
  });
  it('stopping paddling: a fade to the sit, starting where the stroke was', () => {
    const { names, h } = run(lib(), [...Array(30).fill('paddle'), ...Array(frames(BOARD_FADE_S + 0.2)).fill('sit')]);
    expect(names.at(-1)).toBe('sitIdle');
    expect(h[30]).toBeCloseTo(0.1, 3);
    expect(h.at(-1)).toBeCloseTo(0.3, 6);
  });
  it('no change snaps: the pelvis never moves faster than the hips of a body (1.3 m/s, the poseSmooth bar) through every change', () => {
    const script: ('sit' | 'paddle')[] = [...Array(30).fill('sit'), ...Array(20).fill('paddle'), ...Array(30).fill('sit'), ...Array(90).fill('paddle'), ...Array(40).fill('sit')];
    const { h } = run(lib(), script);
    for (let i = 1; i < h.length; i++) expect(Math.abs(h[i] - h[i - 1]) / DT, `frame ${i}`).toBeLessThan(1.3);
  });
});
