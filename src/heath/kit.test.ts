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
  it('grows branches that obey the pipe model and stay inside their hull (§7.1)', () => {
    for (const e of m.variants) {
      expect(e.checks.pipeModel, `${e.kind} ${e.variant}`).toBe(true);
      expect(e.checks.branchesInsideHull, `${e.kind} ${e.variant}`).toBeGreaterThanOrEqual(0.95);
    }
  });
});
