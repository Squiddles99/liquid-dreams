import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { readBakedLand } from './bakedLand.testutil';
import { Land } from './Land';
import { type LandBuild, buildInThread } from './landBuild';
import { DEFAULT_LAND_PARAMS, beachProfileFor } from './landParams';

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

  it('lends a stand-in mesh laid out like the loaded land, with its current material, so the material builds while loading', async () => {
    // What three keys a material build on (RenderObject.getGeometryCacheKey), plus each array's type (what the build reads).
    const layout = (g: THREE.BufferGeometry) => [
      ...Object.keys(g.attributes).sort().map((k) => {
        const a = g.attributes[k] as THREE.BufferAttribute;
        return `${k}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`;
      }),
      `index:${g.index?.array.constructor.name}`,
    ];
    const land = new Land(new Sky(DEFAULT_ATMOSPHERE));
    land.setHole({ centre: uniform(new THREE.Vector2()), half: uniform(32), on: uniform(0) });
    const standIn = land.standIn();
    expect(standIn.material).toBe(land.mesh.material);
    expect(standIn.geometry.getAttribute('position').count).toBeGreaterThan(0);
    await land.load(async () => readBakedLand());
    expect(layout(standIn.geometry)).toEqual(layout(land.mesh.geometry));
  }, 30_000);

  it("shows the builder's mesh and march heights once loaded (the worker's, in the game)", async () => {
    const land = new Land(new Sky(DEFAULT_ATMOSPHERE));
    let built: LandBuild | null = null;
    const profiles: unknown[] = [];
    await land.load(async () => readBakedLand(), async (bytes, profile) => {
      profiles.push(profile);
      built = await buildInThread(bytes, profile);
      return built;
    });
    expect(profiles).toEqual([beachProfileFor(DEFAULT_LAND_PARAMS)]);
    expect(land.mesh.visible).toBe(true);
    expect(land.mesh.geometry.getAttribute('position').array).toBe(built!.mesh.positions);
    expect(land.height).not.toBeNull();
  }, 30_000);
  it('rebuilds with the new beach shape when it changed while the builder was busy', async () => {
    const land = new Land(new Sky(DEFAULT_ATMOSPHERE));
    let built: LandBuild | null = null;
    await land.load(async () => readBakedLand(), async (bytes, profile) => {
      built = await buildInThread(bytes, profile);
      expect(land.setParams({ ...DEFAULT_LAND_PARAMS, beachWidthM: 35 })).toBe(false); // no file yet: nothing to rebuild
      return built;
    });
    expect(land.mesh.geometry.getAttribute('position').array).not.toBe(built!.mesh.positions);
    expect(land.height?.profile.dryWidthM).toBe(35);
  }, 60_000);
});
