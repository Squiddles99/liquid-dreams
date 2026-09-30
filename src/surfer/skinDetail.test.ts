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
