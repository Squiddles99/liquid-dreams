import type * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { PlantMeshes } from './PlantMeshes';
import type { Plant } from './plants';

/** Every attribute a mesh draws with, by identity: App.prewarm builds the plants' materials before any plant is laid. */
const attributes = (ms: readonly THREE.InstancedMesh[]) => ms.map((m) => [m.geometry, m.instanceMatrix, m.instanceColor, ...Object.values(m.geometry.attributes)]);

describe('the plant meshes ahead of the land', () => {
  it('lay plants out without adding or replacing an attribute (a material built before the land stays right)', () => {
    const plants = new PlantMeshes(new Sky(DEFAULT_ATMOSPHERE));
    const before = attributes(plants.meshes);
    const near: Plant = { x: 2, z: 1, kind: 'rice', shape: 1, width: 0.6, height: 0.4, yTrue: 3, yCoarse: 3, yaw: 0, cosYaw: 1, sinYaw: 0, seed: 0.5, tint: [0.2, 0.3, 0.1] };
    const far: Plant = { ...near, x: 90, kind: 'daisy' };
    expect(plants.update([near, far], 0, 0, { cx: 0, cz: 0, on: true }).drawn).toBe(2);
    expect(attributes(plants.meshes).every((a, k) => a.length === before[k].length && a.every((x, i) => x === before[k][i]))).toBe(true);
  });
});

describe('the far plants laid cell by cell (dune-up-close §4.5)', () => {
  const plant = (x: number, kind: Plant['kind'] = 'daisy'): Plant => ({ x, z: 0, kind, shape: 0, width: 1, height: 1, yTrue: 0, yCoarse: 0, yaw: 0, cosYaw: 1, sinYaw: 0, seed: 0.5, tint: [0.2, 0.3, 0.1] });
  const xsOf = (m: THREE.InstancedMesh) => Array.from({ length: m.count }, (_, i) => (m.instanceMatrix.array as Float32Array)[i * 16 + 12]).sort((a, b) => a - b);
  it("adds and removes cells, keeping the other cells' plants in the mesh (swap-remove)", () => {
    const plants = new PlantMeshes(new Sky(DEFAULT_ATMOSPHERE));
    const before = attributes(plants.meshes);
    const seat = () => 0, lod = () => 2 as const;
    plants.addCell(1, [plant(100), plant(101)], seat, lod);
    plants.addCell(2, [plant(200)], seat, lod);
    plants.addCell(3, [plant(300), plant(301), plant(302)], seat, lod);
    const mesh = plants.meshes.find((m) => m.count > 0)!;
    expect(xsOf(mesh)).toEqual([100, 101, 200, 300, 301, 302]);
    plants.removeCell(1);
    expect(xsOf(mesh)).toEqual([200, 300, 301, 302]);
    plants.removeCell(3);
    expect(xsOf(mesh)).toEqual([200]);
    plants.addCell(2, [plant(250)], seat, lod); // re-adding a cell replaces it
    expect(xsOf(mesh)).toEqual([250]);
    plants.removeCell(9); // not held: nothing
    expect(plants.drawn).toBe(1);
    expect(attributes(plants.meshes).every((a, k) => a.length === before[k].length && a.every((x, i) => x === before[k][i]))).toBe(true);
  });
});
