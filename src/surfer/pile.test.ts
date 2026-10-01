import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glbFloats, glbJson } from './glbData';
import { PILE_PARTS, pileMaterial } from './pile';
import { DEFAULT_SURFER_PARAMS, sanitizeSurferParams } from './surferParams';

interface PileManifest {
  parts: { name: string; part: string; preset: string | null }[];
  footprint: [number, number];
}

describe('the beach pile (walking spec §5)', () => {
  const path = 'public/surfer/beachPile.glb', gltf = glbJson(path);
  const man: PileManifest = JSON.parse(readFileSync('public/surfer/beachPile.manifest.json', 'utf8'));
  const count = (part: string): number => man.parts.filter((p) => p.part === part).length;
  const points = (material: (name: string) => boolean): number[][] => gltf.meshes.flatMap((m: any) => m.primitives
    .filter((p: any) => material(gltf.materials[p.material].name))
    .flatMap((p: any) => {
      const f = glbFloats(path, gltf, p.attributes.POSITION), out: number[][] = [];
      for (let i = 0; i < f.length; i += 3) out.push([f[i], f[i + 1], f[i + 2]]);
      return out;
    }));

  it('holds the crew’s clothes and packs: 3 tees, the cutoffs, 2 hats, 3 packs, 2 towels, 3 pairs of thongs, the glasses', () => {
    expect([count('tee'), count('shorts'), count('hat'), count('pack'), count('towel'), count('thongs'), count('glasses')]).toEqual([3, 1, 2, 3, 2, 3, 1]);
  });
  it('names every material for a part and a rider the game can shade', () => {
    for (const m of gltf.materials) expect(pileMaterial(m.name), m.name).not.toBeNull();
    expect(pileMaterial('pile_tee_male')).toEqual({ part: 'tee', preset: 'male' });
    expect(pileMaterial('glasses')).toEqual({ part: 'glasses', preset: 'grommet' });
    expect(pileMaterial('pile_tee_nobody')).toBeNull();
    for (const part of Object.keys(PILE_PARTS)) expect(pileMaterial(`pile_${part}_female`)?.part).toBe(part);
  });
  it('rests on the sand within 1.6 × 1.2 m', () => {
    const all = points(() => true);
    expect(Math.min(...all.map((p) => p[1]))).toBeGreaterThanOrEqual(-0.001);
    const w = Math.max(...all.map((p) => p[0])) - Math.min(...all.map((p) => p[0]));
    const d = Math.max(...all.map((p) => p[2])) - Math.min(...all.map((p) => p[2]));
    expect(Math.max(w, d)).toBeLessThanOrEqual(1.6);
    expect(Math.min(w, d)).toBeLessThanOrEqual(1.2);
  });
  it('rests Grommet’s glasses on his school bag', () => {
    const glasses = points((n) => n === 'glasses' || n === 'lens'), bag = points((n) => n === 'pile_pack_grommet');
    const top = Math.max(...bag.map((p) => p[1])), low = Math.min(...glasses.map((p) => p[1]));
    expect(low - top).toBeGreaterThan(-0.01);
    expect(low - top).toBeLessThan(0.03);
    const gx = glasses.reduce((s, p) => s + p[0], 0) / glasses.length, gz = glasses.reduce((s, p) => s + p[2], 0) / glasses.length;
    expect(gx).toBeGreaterThan(Math.min(...bag.map((p) => p[0])));
    expect(gx).toBeLessThan(Math.max(...bag.map((p) => p[0])));
    expect(gz).toBeGreaterThan(Math.min(...bag.map((p) => p[2])));
    expect(gz).toBeLessThan(Math.max(...bag.map((p) => p[2])));
  });
});

describe('the pile in settings and links', () => {
  it('is off by default, on the beach in front of the Womb; old links get the defaults and junk is repaired', () => {
    expect(DEFAULT_SURFER_PARAMS).toMatchObject({ pile: false });
    const old = sanitizeSurferParams({ preset: 'male' });
    expect([old.pile, old.pileX, old.pileZ, old.pileHeadingDeg]).toEqual([false, DEFAULT_SURFER_PARAMS.pileX, DEFAULT_SURFER_PARAMS.pileZ, DEFAULT_SURFER_PARAMS.pileHeadingDeg]);
    const junk = sanitizeSurferParams({ pile: 'yes', pileX: 'far', pileZ: 9999, pileHeadingDeg: -90 });
    expect(junk.pile).toBe(false);
    expect(junk.pileX).toBe(DEFAULT_SURFER_PARAMS.pileX);
    expect(junk.pileZ).toBe(400);
    expect(junk.pileHeadingDeg).toBe(270);
  });
});
