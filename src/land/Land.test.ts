import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { readBakedLand } from './bakedLand.testutil';
import { Land } from './Land';
import { DEFAULT_LAND_PARAMS } from './landParams';

describe('Land', () => {
  it('stays landless (mesh hidden, no height) when the file is bad, and the promise rejects', async () => {
    const land = new Land(new Sky(DEFAULT_ATMOSPHERE));
    await expect(land.load(async () => new Uint8Array(40))).rejects.toThrow(/land file/);
    expect(land.height).toBeNull();
    expect(land.mesh.visible).toBe(false);
  });
  it('shows the mesh once loaded, and asks for a rebuild only when the beach shape changes', async () => {
    const land = new Land(new Sky(DEFAULT_ATMOSPHERE));
    await land.load(async () => readBakedLand());
    expect(land.height).not.toBeNull();
    expect(land.mesh.visible).toBe(true);
    expect(land.setParams({ ...DEFAULT_LAND_PARAMS, sandBrightness: 1.2 })).toBe(false);
    expect(land.setParams({ ...DEFAULT_LAND_PARAMS, beachWidthM: 35 })).toBe(true);
  }, 30_000); // builds the whole mesh (~1 s alone, several under the full suite's load)
});
