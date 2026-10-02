import type * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { buildBathymetry } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { createWaterOpticsUniforms } from '../ocean/waterShading';
import { Rocks } from './RockMeshes';
import type { Rock } from './rocks';

/** Every attribute a mesh draws with, by identity: App.prewarm builds the rocks' materials before any rock is laid. */
const attributes = (ms: readonly THREE.InstancedMesh[]) => ms.map((m) => [m.geometry, m.instanceMatrix, m.instanceColor, ...Object.values(m.geometry.attributes)]);

describe('the rock meshes ahead of the land', () => {
  it('lay rocks out without adding or replacing an attribute (a material built before the land stays right)', () => {
    const rocks = new Rocks(new Sky(DEFAULT_ATMOSPHERE));
    const before = attributes(rocks.meshes);
    const rock: Rock = { x: 3, z: 4, y: 1, kind: 'shore', shape: 2, radius: 0.8, height: 1.2, yaw: 0.3, tiltX: 0, tiltZ: 0, tint: [0.4, 0.4, 0.4], topTint: [0.2, 0.3, 0.1] };
    expect(rocks.update([rock], 0, 0)).toBe(1);
    expect(attributes(rocks.meshes).every((a, k) => a.length === before[k].length && a.every((x, i) => x === before[k][i]))).toBe(true);
  });
  it('seen from underwater, hide what lies below the bed and show the rest through the water: one material, switched by a uniform', () => {
    const rocks = new Rocks(new Sky(DEFAULT_ATMOSPHERE), undefined, { seabed: new Seabed(buildBathymetry()), optics: createWaterOpticsUniforms(DEFAULT_WATER_OPTICS) });
    const materials = new Set(rocks.meshes.map((m) => m.material));
    expect(materials.size).toBe(1);
    const m = [...materials][0] as THREE.MeshBasicNodeMaterial;
    expect(m.maskNode).toBeTruthy();
    expect(rocks.underwater.value).toBe(0);
    rocks.setUnderwater(true);
    expect(rocks.underwater.value).toBe(1);
    expect(rocks.meshes.every((r) => r.material === m)).toBe(true);
    rocks.setUnderwater(false);
    expect(rocks.underwater.value).toBe(0);
  });
});
