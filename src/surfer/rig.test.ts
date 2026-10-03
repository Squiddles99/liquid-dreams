import { describe, expect, it } from 'vitest';
import { BONES, FINGER_BONES, FINGER_PARENT, PARENT, type SurferManifest, assertManifest, manifestProblems, measures, referenceSkeleton } from './rig';

describe('the skeleton contract (spec §3.3)', () => {
  it('has 23 bones, each parent listed before its children', () => {
    expect(BONES.length).toBe(23);
    BONES.forEach((b, i) => {
      const p = PARENT[b];
      if (p) expect(BONES.indexOf(p)).toBeLessThan(i);
    });
  });
  it('scales the reference skeleton to the rider: legs about 0.49 H, stance joints where expected', () => {
    const m = measures(referenceSkeleton(1.78));
    expect(m.legLen / 1.78).toBeGreaterThan(0.47);
    expect(m.legLen / 1.78).toBeLessThan(0.51);
    expect(m.hipDrop).toBeGreaterThan(0);
    expect(m.ankleH).toBeCloseTo(0.039 * 1.78, 9);
  });
});

describe('a body’s manifest at load (final review: a stale one broke the frame loop instead of failing the load)', () => {
  const good = (): SurferManifest => ({ name: 't', heightM: 1.7, bones: BONES.map((name) => ({ name, parent: PARENT[name], head: [0, 0, 0], tail: [0, 0.1, 0] })) } as unknown as SurferManifest);
  it('throws, naming the file and the problem, when a contract bone is missing', () => {
    const m = good();
    m.bones = m.bones.filter((b) => b.name !== 'neck');
    expect(() => assertManifest(m, 'surfer/x.manifest.json')).toThrow(/x\.manifest\.json.*neck/);
  });
});

describe('the fingers (clip slice spec §2)', () => {
  it('are MPFB’s 30, each finger base under its hand and each joint under the one before', () => {
    expect(FINGER_BONES.length).toBe(30);
    expect(FINGER_PARENT.index_01_l).toBe('hand_l');
    expect(FINGER_PARENT.index_02_l).toBe('index_01_l');
    expect(FINGER_PARENT.thumb_03_r).toBe('thumb_02_r');
    FINGER_BONES.forEach((f, i) => {
      const p = FINGER_PARENT[f];
      if (!p.startsWith('hand_')) expect(FINGER_BONES.indexOf(p as never)).toBeLessThan(i);
    });
  });
  const manifest = (withFingers: boolean): SurferManifest => ({
    name: 't', heightM: 1.7,
    bones: [
      ...BONES.map((name) => ({ name, parent: PARENT[name], head: [0, 0, 0], tail: [0, 0.1, 0] })),
      ...(withFingers ? FINGER_BONES.map((name) => ({ name, parent: FINGER_PARENT[name], head: [0, 0, 0], tail: [0, 0.02, 0] })) : []),
    ],
  } as unknown as SurferManifest);
  // Fixture: legs that point down and a head high enough, so only the bone list is under test.
  const fix = (m: SurferManifest): SurferManifest => {
    for (const b of m.bones) {
      if (/^(thigh|shin)_/.test(b.name)) { b.head = [0, 1, 0]; b.tail = [0, 0.5, 0]; }
      if (b.name === 'head') { b.head = [0, 1.6, 0]; b.tail = [0, 1.7, 0]; }
    }
    return m;
  };
  it('accepts a 23-bone build (Review Focus 1) and a 53-bone one', () => {
    expect(manifestProblems(fix(manifest(false)))).toEqual([]);
    expect(manifestProblems(fix(manifest(true)))).toEqual([]);
  });
  it('rejects a half set of fingers and a finger under the wrong parent', () => {
    const half = fix(manifest(true));
    half.bones = half.bones.filter((b) => !b.name.endsWith('_r') || !FINGER_BONES.includes(b.name as never));
    expect(manifestProblems(half).join()).toMatch(/contract/);
    const wrong = fix(manifest(true));
    wrong.bones.find((b) => b.name === 'index_02_l')!.parent = 'hand_l';
    expect(manifestProblems(wrong).join()).toMatch(/index_02_l: parent hand_l/);
  });
});
