import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { BONES, type SurferManifest, manifestProblems } from './rig';

/** The JSON chunk of a .glb (the binary glTF container: 12-byte header, then a JSON chunk). */
export function glbJson(path: string): any {
  const b = readFileSync(path);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(0, true) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  if (v.getUint32(16, true) !== 0x4e4f534a) throw new Error(`${path}: the first chunk is not JSON`);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + v.getUint32(12, true))));
}

for (const name of ['female', 'male'] as const) {
  describe(`the ${name} surfer build`, () => {
    const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
    const gltf = glbJson(`public/surfer/${name}.glb`);
    it('keeps the skeleton contract (names, parents, lengths, legs down)', () => expect(manifestProblems(man)).toEqual([]));
    it('is the preset’s height (±1 cm)', () => expect(Math.abs(man.heightM - PRESETS[name].heightM)).toBeLessThan(0.01));
    it('skins to exactly the contract bones', () => {
      expect(gltf.skins.length).toBe(1);
      expect(gltf.skins[0].joints.map((i: number) => gltf.nodes[i].name).sort()).toEqual([...BONES].sort());
    });
    it('keeps the body within budget (≤ 24k triangles, ≤ 4 materials; ≤ 40k in all)', () => {
      const body = man.meshes.find((m) => m.materials.includes('body'))!;
      expect(body.triangles).toBeLessThanOrEqual(24000);
      expect(body.materials.length).toBeLessThanOrEqual(4);
      expect(man.meshes.reduce((s, m) => s + m.triangles, 0)).toBeLessThanOrEqual(40000);
    });
  });
}
