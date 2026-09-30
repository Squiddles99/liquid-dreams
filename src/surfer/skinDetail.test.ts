import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SurferManifest } from './rig';
import { skinZones } from './skinDetail';

const load = (n: string): SurferManifest => JSON.parse(readFileSync(`public/surfer/${n}.manifest.json`, 'utf8'));

describe('skin zones from the manifest (grommet spec §5; Review Focus 3)', () => {
  it('gives none for a manifest without landmarks (Shazza and T-Bone as built)', () => {
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
