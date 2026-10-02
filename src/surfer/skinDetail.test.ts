import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SurferManifest } from './rig';
import { PRESETS } from './presets';
import { skinZones } from './skinDetail';

const load = (n: string): SurferManifest => JSON.parse(readFileSync(`public/surfer/${n}.manifest.json`, 'utf8'));

describe('skin zones from the manifest (grommet spec §5; Review Focus 3)', () => {
  it('gives zones for all three as built now (closeup spec §4.2), the eyes’ centres and radius from the landmarks', () => {
    for (const n of ['female', 'male', 'grommet']) {
      const m = load(n), z = skinZones(m)!;
      expect(z, n).not.toBeNull();
      expect(z.eyes).toEqual(m.landmarks!.eyes);
      expect(z.eyeRadius).toBe(m.landmarks!.eyeRadius);
      expect(z.nose).toEqual(m.landmarks!.nose);
    }
  });
  it('gives stubble only to T-Bone, and the soft blush and eye shadow most to Shazza', () => {
    expect(PRESETS.male.stubble).toBeGreaterThan(0);
    expect(PRESETS.female.stubble).toBe(0);
    expect(PRESETS.grommet.stubble).toBe(0);
    expect(PRESETS.female.blush).toBeGreaterThan(PRESETS.male.blush);
    expect(PRESETS.female.eyeShadow).toBeGreaterThan(0);
    expect(PRESETS.male.eyeShadow).toBe(0);
  });
  it('puts nipples on every chest: in front, either side of the midline, at chest height (Andrew: T-Bone had none)', () => {
    for (const n of ['female', 'male', 'grommet']) {
      const m = load(n), z = skinZones(m)!, H = m.heightM;
      const spine = m.bones.find((b) => b.name === 'spine_03')!.head;
      expect(z.nipples, n).not.toBeNull();
      const [l, r] = z.nipples!;
      for (const p of [l, r]) {
        expect(p[1], `${n} height`).toBeGreaterThan(0.66 * H);
        expect(p[1], `${n} height`).toBeLessThan(0.78 * H);
        expect(p[2], `${n} in front`).toBeGreaterThan(spine[2] + 0.06);
        expect(Math.abs(p[0]), `${n} off the midline`).toBeGreaterThan(0.05 * H / 1.78);
        expect(Math.abs(p[0]), `${n} off the midline`).toBeLessThan(0.15 * H / 1.78);
      }
      expect(l[0]).toBeGreaterThan(0);
      expect(Math.abs(l[0] + r[0])).toBeLessThan(0.01);
      expect(z.areolaRadius).toBeGreaterThan(0.008);
      expect(z.areolaRadius).toBeLessThan(0.02);
    }
  });
  it('gives none for a manifest without landmarks (an older build)', () => {
    const m = load('female');
    expect(skinZones({ ...m, landmarks: undefined })).toBeNull();
  });
  it('puts his cheek centres below and outside each eye, the nose bridge between them, and 8 pimples', () => {
    const z = skinZones(load('grommet'))!;
    const L = load('grommet').landmarks!;
    for (const [i, c] of z.cheeks.entries()) {
      expect(c[1]).toBeLessThan(L.eyes[i][1]);
      expect(Math.abs(c[0])).toBeGreaterThan(Math.abs(L.eyes[i][0]) - 0.005);
    }
    expect(Math.abs(z.bridge[0])).toBeLessThan(0.005);
    expect(z.pimples.length).toBe(8);
  });
});
