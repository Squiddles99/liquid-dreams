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
