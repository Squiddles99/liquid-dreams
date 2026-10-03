import { Quaternion } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { syntheticRiderClips } from './clipFixture';
import { sampleClip } from './clipPlayer';
import { clipDuration, clipFor, loadRiderClips, mirrorClip, riderClipsProblems } from './clips';
import { referenceSkeleton } from './rig';

const rc = syntheticRiderClips(referenceSkeleton(1.7), { fingers: true });
const trim = rc.clips.trim;
const deg = (a: Quaternion, b: Quaternion): number => (a.angleTo(b) * 180) / Math.PI;
const fakeFetch = (status: number, body: string, type: string) => (async () => new Response(body, { status, headers: { 'content-type': type } })) as unknown as typeof fetch;

describe('baked clips (clip slice spec §3.3, §4.2)', () => {
  it('the synthetic clip is well formed', () => expect(riderClipsProblems(rc)).toEqual([]));
  it('names what is wrong: lengths, unknown bones, non-numbers (Review Focus 3)', () => {
    const bad = structuredClone(rc);
    bad.clips.trim.pelvis.pop();
    bad.clips.trim.rot.tail_l = [0, 0, 0, 1];
    bad.clips.trim.rot.head[0] = Number.NaN;
    const p = riderClipsProblems(bad).join(' | ');
    expect(p).toMatch(/pelvis/);
    expect(p).toMatch(/tail_l/);
    expect(p).toMatch(/head/);
    expect(riderClipsProblems({ fps: 30 }).length).toBeGreaterThan(0);
  });
  it('loads: a 404 or Vite’s index.html fallback is “not built”; a broken file throws, naming it (Review Focus 2, 3)', async () => {
    expect(await loadRiderClips('x.clips.json', fakeFetch(404, '', 'text/html'))).toBeNull();
    expect(await loadRiderClips('x.clips.json', fakeFetch(200, '<!doctype html>', 'text/html'))).toBeNull();
    expect(await loadRiderClips('x.clips.json', fakeFetch(200, JSON.stringify(rc), 'application/json'))).toEqual(JSON.parse(JSON.stringify(rc)));
    await expect(loadRiderClips('x.clips.json', fakeFetch(200, '{"fps":30}', 'application/json'))).rejects.toThrow(/x\.clips\.json/);
    await expect(loadRiderClips('x.clips.json', fakeFetch(500, '', 'text/plain'))).rejects.toThrow(/500/);
  });
  it('mirrors: left and right swapped, reflected in x = 0; twice is the original', () => {
    const m = mirrorClip(trim);
    expect(m.noseSide).toBe('right');
    expect(m.rot.thigh_r[0]).toBeCloseTo(trim.rot.thigh_l[0], 12);
    expect(m.rot.thigh_r[1]).toBeCloseTo(-trim.rot.thigh_l[1], 12);
    expect(m.pelvis[0]).toBeCloseTo(-trim.pelvis[0], 12);
    const back = mirrorClip(m);
    for (const [b, q] of Object.entries(trim.rot)) q.forEach((v, i) => expect(Math.abs(back.rot[b][i] - v)).toBeLessThan(1e-6));
  });
  it('picks the stance: regular plays a left-nosed clip as is, goofy its mirror (cached)', () => {
    expect(clipFor(rc, 'trim', 'regular')).toBe(trim);
    const g = clipFor(rc, 'trim', 'goofy')!;
    expect(g.noseSide).toBe('right');
    expect(clipFor(rc, 'trim', 'goofy')).toBe(g);
    expect(clipFor(rc, 'paddle', 'regular')).toBeNull();
    expect(clipDuration(rc, trim)).toBeCloseTo(2, 12);
  });
});

describe('sampling (clip slice spec §4.1 step 1)', () => {
  const q = (i: number, b = 'hand_l'): Quaternion => new Quaternion(...(trim.rot[b].slice(4 * i, 4 * i + 4) as [number, number, number, number]));
  it('is exact at frame times', () => {
    const s = sampleClip(trim, 30, 7 / 30);
    expect(deg(s.rot.hand_l!, q(7))).toBeLessThan(1e-6);
    expect(s.pelvis.y).toBeCloseTo(trim.pelvis[3 * 7 + 1], 9);
  });
  it('slerps between frames', () => {
    const s = sampleClip(trim, 30, 7.5 / 30);
    expect(Math.abs(deg(s.rot.hand_l!, q(7)) - deg(s.rot.hand_l!, q(8)))).toBeLessThan(1e-6);
  });
  it('loops with no jump at the seam (< 2°), and wraps negative times', () => {
    const end = sampleClip(trim, 30, 2 - 1e-6), start = sampleClip(trim, 30, 0);
    for (const b of Object.keys(trim.rot)) expect(deg(end.rot[b]!, start.rot[b]!), b).toBeLessThan(2);
    expect(deg(sampleClip(trim, 30, -0.5).rot.hand_l!, sampleClip(trim, 30, 1.5).rot.hand_l!)).toBeLessThan(1e-6);
  });
  it('holds the ends of a clip that doesn’t loop', () => {
    const once = { ...trim, loop: false };
    expect(deg(sampleClip(once, 30, 99).rot.hand_l!, q(59))).toBeLessThan(1e-6);
    expect(deg(sampleClip(once, 30, -3).rot.hand_l!, q(0))).toBeLessThan(1e-6);
  });
});
