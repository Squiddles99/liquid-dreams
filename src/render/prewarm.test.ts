import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { withOnlyShown } from './prewarm';

function tree() {
  const root = new THREE.Scene();
  const other = new THREE.Mesh();
  const target = new THREE.Mesh();
  target.visible = false;
  const hiddenGroup = new THREE.Group();
  hiddenGroup.visible = false;
  const nested = new THREE.Mesh();
  const sibling = new THREE.Mesh();
  sibling.frustumCulled = false;
  hiddenGroup.add(nested, sibling);
  root.add(other, target, hiddenGroup);
  return { root, other, target, hiddenGroup, nested, sibling };
}

const state = (os: THREE.Object3D[]) => os.map((o) => [o.visible, o.frustumCulled]);

describe('withOnlyShown (a load-time render that builds just the objects that first show mid-game)', () => {
  it('shows the given objects (and the groups holding them) with culling off, and hides everything else', () => {
    const t = tree();
    let seen: boolean[][] = [];
    withOnlyShown(t.root, [t.target, t.nested], () => {
      seen = state([t.root, t.other, t.target, t.hiddenGroup, t.nested, t.sibling]);
    });
    expect(seen).toEqual([[true, true], [false, true], [true, false], [true, true], [true, false], [false, false]]);
  });

  it('puts visibility and culling back as soon as the render returns, and hands back what it returned', async () => {
    const t = tree();
    const before = state([t.root, t.other, t.target, t.hiddenGroup, t.nested, t.sibling]);
    let finish = (): void => undefined;
    const built = new Promise<void>((resolve) => { finish = resolve; });
    const out = withOnlyShown(t.root, [t.target, t.nested], () => built);
    expect(out).toBe(built);
    expect(state([t.root, t.other, t.target, t.hiddenGroup, t.nested, t.sibling])).toEqual(before);
    finish();
    await out;
  });

  it('puts them back when the render fails, and passes the failure on', () => {
    const t = tree();
    const before = state([t.root, t.other, t.target, t.hiddenGroup, t.nested, t.sibling]);
    expect(() => withOnlyShown(t.root, [t.target], () => { throw new Error('boom'); })).toThrow('boom');
    expect(state([t.root, t.other, t.target, t.hiddenGroup, t.nested, t.sibling])).toEqual(before);
  });
});
