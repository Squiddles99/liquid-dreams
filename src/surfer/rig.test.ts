import { describe, expect, it } from 'vitest';
import { BONES, PARENT, type SurferManifest, assertManifest, measures, referenceSkeleton } from './rig';

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
