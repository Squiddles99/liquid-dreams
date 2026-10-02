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
const item = (kind: ScatterItem['kind'], x: number, z: number, variant = 0): ScatterItem => ({ kind, variant, x, z, y: 0, yaw: 0, tiltX: 0, tiltZ: 0, scale: 1, seed: 0.3 });

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
  it('draws nothing from an empty list, keeping every attribute', () => {
    const s = new ScatterMeshes(stubKit(), new Sky(DEFAULT_ATMOSPHERE));
    s.update([], camera);
    expect(s.meshes.every((m) => m.count === 0)).toBe(true);
  });
});
