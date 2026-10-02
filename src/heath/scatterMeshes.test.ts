import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import type { Kit, KitManifest } from './kit';
import type { ScatterItem } from './nearScatter';
import { ScatterMeshes } from './ScatterMeshes';

function stubKit(): Kit {
  const manifest: KitManifest = { version: 1, units: 'unit', variants: [], items: [], atlas: { file: '', size: 2048, tiles: {} } };
  const box = (): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(1), 4));
    return g;
  };
  return { manifest, atlas: new THREE.DataTexture(new Uint8Array(4), 1, 1), geometry: box, item: box };
}
const item = (kind: ScatterItem['kind'], x: number, z: number, variant = 0): ScatterItem => ({ kind, variant, x, z, y: 0, yaw: 0, upX: 0, upZ: 0, scale: 1, seed: 0.3 });

describe('ScatterMeshes (dune-up-close §4.4)', () => {
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 200);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 1.6, -10);
  camera.updateMatrixWorld();
  const count = (s: ScatterMeshes, pred: (name: string) => boolean) => s.meshes.filter((m) => pred(m.name)).reduce((n, m) => n + m.count, 0);
  it('lays near tufts at L0, mid ones at L1, items only within 12 m, and culls what is behind', () => {
    const s = new ScatterMeshes(stubKit(), new Sky(DEFAULT_ATMOSPHERE));
    const r = s.update([item('tuft_clubrush', 0, -5), item('tuft_clubrush', 0, -16), item('item_stone', 0, -6), item('item_stone', 0, -15), item('tuft_tussock', 0, 6)], camera);
    expect(r.culled).toBe(1);
    expect(count(s, (n) => n.startsWith('scatter_tuft_clubrush') && n.endsWith('L0'))).toBe(1);
    expect(count(s, (n) => n.startsWith('scatter_tuft_clubrush') && n.endsWith('L1'))).toBe(1);
    expect(count(s, (n) => n.startsWith('scatter_item_stone'))).toBe(1);
  });
  it('stands an item along its up vector (the ground normal), whatever its yaw', () => {
    const s = new ScatterMeshes(stubKit(), new Sky(DEFAULT_ATMOSPHERE));
    s.update([{ ...item('item_twig', 0, -4), yaw: 1.3, upX: -0.4, upZ: 0.25 }], camera);
    const mesh = s.meshes.find((m) => m.count > 0)!;
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(m);
    const want = new THREE.Vector3(-0.4, 1, 0.25).normalize();
    expect(up.distanceTo(want)).toBeLessThan(1e-6);
    // The yaw still turns it about that up: its local x lies in the plane square to it.
    const x = new THREE.Vector3(1, 0, 0).transformDirection(m);
    expect(Math.abs(x.dot(want))).toBeLessThan(1e-6);
  });
  it('draws nothing from an empty list, keeping every attribute', () => {
    const s = new ScatterMeshes(stubKit(), new Sky(DEFAULT_ATMOSPHERE));
    s.update([], camera);
    expect(s.meshes.every((m) => m.count === 0)).toBe(true);
  });
});
