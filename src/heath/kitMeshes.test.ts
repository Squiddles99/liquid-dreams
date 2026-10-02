import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { type Kit, type KitManifest, bandWeights } from './kit';
import { KitMeshes } from './KitMeshes';
import { BAND_FADE_M, MID_M, NEAR_M } from './plantRing';
import { PLANT_KINDS, PLANT_SHAPES, type Plant } from './plants';

describe('bandWeights', () => {
  it('sum to 1 and hand over across 3 m at 12 and 40 m', () => {
    for (let d = 0; d < 60; d += 0.25) {
      const w = bandWeights(d);
      expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 6);
      for (const x of w) expect(x).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(bandWeights(NEAR_M - BAND_FADE_M)).toEqual([1, 0, 0]);
    expect(bandWeights(NEAR_M + BAND_FADE_M / 2 + 0.01)[0]).toBe(0);
    expect(bandWeights(MID_M + BAND_FADE_M)).toEqual([0, 0, 1]);
  });
});

/** A kit of boxes with the attributes a built kit carries (position, normal, uv, color). */
function stubKit(): Kit {
  const variants = PLANT_KINDS.flatMap((kind) => Array.from({ length: PLANT_SHAPES }, (_, v) => ({
    kind, variant: v, lods: [{ name: `plant_${kind}_${v}_L0`, triangles: 12 }, { name: `plant_${kind}_${v}_L1`, triangles: 12 }],
    boundsUnit: [1, 1, 1] as [number, number, number], leafColour: [0.1, 0.15, 0.05] as [number, number, number], checks: {},
  })));
  const manifest: KitManifest = { version: 1, units: 'unit', variants, items: [], atlas: { file: 'heathAtlas.png', size: 2048, tiles: {} } };
  const geometry = (): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4).fill(1), 4));
    return g;
  };
  return { manifest, atlas: new THREE.DataTexture(new Uint8Array(4), 1, 1), geometry };
}

const plant = (x: number, z: number, kind: Plant['kind'] = 'daisy'): Plant =>
  ({ x, z, kind, shape: 1, width: 1.2, height: 1, yTrue: 0, yCoarse: 0, yaw: 0, cosYaw: 1, sinYaw: 0, seed: 0.4, tint: [0.2, 0.22, 0.17] });

describe('KitMeshes', () => {
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 500);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 1.6, -10);
  camera.updateMatrixWorld();
  const patch = { cx: 0, cz: 0, on: true };
  it('lays a plant ahead in L0, culls one behind, and puts a mid-band plant in L1', () => {
    const k = new KitMeshes(stubKit(), new Sky(DEFAULT_ATMOSPHERE));
    const r = k.update([plant(0, -5), plant(0, 5), plant(0, -25)], camera, patch);
    expect(r.culled).toBe(1);
    const count = (lod: number) => k.meshes.filter((m) => m.name.endsWith(`_L${lod}`)).reduce((n, m) => n + m.count, 0);
    expect(count(0)).toBe(1);
    expect(count(1)).toBe(1);
  });
  it('lays near plants whether or not the patch shows (seated on the surface drawn: Review Focus 3)', () => {
    const k = new KitMeshes(stubKit(), new Sky(DEFAULT_ATMOSPHERE));
    const p = { ...plant(0, -5), yTrue: 2, yCoarse: 1 };
    k.update([p], camera, { ...patch, on: false });
    const m = k.meshes.find((x) => x.count > 0)!;
    expect((m.instanceMatrix.array as Float32Array)[13]).toBe(1);
  });
  it('draws nothing from an empty list and keeps every attribute (never an empty build)', () => {
    const k = new KitMeshes(stubKit(), new Sky(DEFAULT_ATMOSPHERE));
    const before = k.meshes.map((m) => [m.geometry, ...Object.values(m.geometry.attributes)]);
    k.update([], camera, patch);
    expect(k.meshes.every((m) => m.count === 0)).toBe(true);
    expect(k.meshes.every((m, i) => Object.values(m.geometry.attributes).every((a) => before[i].includes(a)))).toBe(true);
  });
});
