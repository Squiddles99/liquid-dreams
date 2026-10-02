import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLANT_KINDS, PLANT_SHAPES } from './plants';

const MANIFEST = 'public/heath/heathKit.manifest.json';
const m = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;

describe('the heath kit (dune-up-close §4.2, §7.1)', () => {
  it('is built', () => expect(m).not.toBeNull());
  it("has every kind's four variants, each with L0 and L1", () => {
    for (const kind of PLANT_KINDS) {
      for (let v = 0; v < PLANT_SHAPES; v++) {
        const e = m.variants.find((x: { kind: string; variant: number }) => x.kind === kind && x.variant === v);
        expect(e, `${kind} ${v}`).toBeTruthy();
        expect(e.lods.map((l: { name: string }) => l.name)).toEqual([`plant_${kind}_${v}_L0`, `plant_${kind}_${v}_L1`]);
      }
    }
  });
  const L0_CAP: Record<string, number> = { daisy: 8000, green: 8000, tall: 8000, pigface: 6000, rice: 3000, dead: 2000, cushion: 6000, spinach: 6000 };
  it("keeps L0 within its caps, leaves on twigs, the silhouette its hull's, normals sound, AO in range (§7.1)", () => {
    for (const e of m.variants) {
      const id = `${e.kind} ${e.variant}`;
      // A dead shrub is bare twigs: a third of its hull's outline. Pigface's fingers stand 5–10 cm off trailing stems
      // under a 17 cm hull: three-quarters of it from above, half from the side (Rulings, Task 10).
      const mat = e.kind === 'pigface' || e.kind === 'spinach';
      const top = e.kind === 'dead' ? 0.3 : mat ? 0.75 : 0.85;
      const side = e.kind === 'dead' ? 0.3 : mat ? 0.5 : 0.85;
      expect(e.lods[0].triangles, id).toBeLessThanOrEqual(L0_CAP[e.kind]);
      expect(e.checks.leavesAttached, id).toBeLessThanOrEqual(0.01);
      expect(e.checks.silhouetteTop, id).toBeGreaterThanOrEqual(top);
      expect(e.checks.silhouetteSide, id).toBeGreaterThanOrEqual(side);
      expect(e.checks.outsideHull, id).toBeLessThanOrEqual(0.05);
      expect(e.checks.badNormals, id).toBe(0);
      expect(e.checks.badNormalsL1, id).toBe(0);
      expect(e.checks.aoMin, id).toBeGreaterThanOrEqual(0.15);
      expect(e.checks.aoMax, id).toBeLessThanOrEqual(1);
      if (e.kind !== 'dead') expect(Math.max(...e.leafColour), id).toBeGreaterThan(0.02);
    }
  });
  it('keeps L1 within 800 triangles and maps every canopy into the atlas', () => {
    for (const e of m.variants) {
      const id = `${e.kind} ${e.variant}`;
      expect(e.lods[1].triangles, id).toBeLessThanOrEqual(800);
      expect(m.atlas.tiles[`canopy_${e.kind}_${e.variant}`], id).toHaveLength(4);
    }
    expect(existsSync('public/heath/heathAtlas.png')).toBe(true);
  });
  it('grows branches that obey the pipe model and stay inside their hull (§7.1)', () => {
    for (const e of m.variants) {
      expect(e.checks.pipeModel, `${e.kind} ${e.variant}`).toBe(true);
      expect(e.checks.branchesInsideHull, `${e.kind} ${e.variant}`).toBeGreaterThanOrEqual(0.95);
    }
  });
});
