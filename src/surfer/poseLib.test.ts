import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BONES } from './rig';
import { KEY_POSES, type PoseLib, contactFor, posesProblems } from './poseLib';

const lib = JSON.parse(readFileSync('public/surfer/poses/poses.json', 'utf8')) as PoseLib;

describe('the poses file (ride pose blend spec §2)', () => {
  it('validates: trim, the pump loop and every key pose, every core bone', () => {
    expect(posesProblems(lib)).toEqual([]);
    for (const k of ['trim', 'pumpCycle', ...KEY_POSES]) expect(lib.clips[k], k).toBeTruthy();
    for (const k of KEY_POSES) for (const b of BONES.filter((b) => b !== 'root')) expect(lib.clips[k].rot[b], `${k} ${b}`).toBeTruthy();
  });
  it('the pump loop closes: its last frame is near its first', () => {
    const c = lib.clips.pumpCycle, n = c.frames;
    const d = (b: string) => { const q = c.rot[b]; const i = 4 * (n - 1); return Math.abs(q[0] * q[i] + q[1] * q[i + 1] + q[2] * q[i + 2] + q[3] * q[i + 3]); };
    for (const b of ['pelvis', 'spine_03', 'thigh_l', 'shin_r']) expect(d(b)).toBeGreaterThan(0.99);
  });
  it('rejects a broken file', () => {
    expect(posesProblems({ ...lib, contacts: { tuck: { side: 'x', wrist: [0, 0] } } })).not.toEqual([]);
    const { tuck: _t, ...rest } = lib.clips;
    expect(posesProblems({ ...lib, clips: rest })).not.toEqual([]);
  });
  it('a goofy rider grips with the other hand, the point mirrored', () => {
    const r = contactFor(lib, 'tuck', 'regular')!, g = contactFor(lib, 'tuck', 'goofy')!;
    expect(r.side).toBe('r');
    expect(g.side).toBe('l');
    expect(g.wrist[0]).toBeCloseTo(-r.wrist[0], 6);
    expect(g.wrist[1]).toBeCloseTo(r.wrist[1], 6);
    expect(g.wrist[2]).toBeCloseTo(r.wrist[2], 6);
  });
});
