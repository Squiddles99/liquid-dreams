import type * as THREE from 'three/webgpu';

/**
 * Runs `render` with only `shown` drawable under `root`: those objects (and the groups holding them) shown with frustum
 * culling off, everything else hidden. A render builds only what it draws, so this builds the materials of objects that
 * first show mid-game (the breaking ribbon) and nothing else: a mesh whose geometry is filled in later (the land, the
 * rocks) must not be built yet, since three keeps a material built against its empty geometry. Visibility and culling go
 * back as they were as soon as `render` returns (it builds synchronously; what it returns, such as the background builds
 * it started, is handed back), even when the render fails.
 */
export function withOnlyShown<T>(root: THREE.Object3D, shown: readonly THREE.Object3D[], render: () => T): T {
  const keep = new Set<THREE.Object3D>();
  for (const o of shown) o.traverseAncestors((a) => keep.add(a));
  for (const o of shown) keep.add(o);
  const saved: { o: THREE.Object3D; visible: boolean; culled: boolean }[] = [];
  root.traverse((o) => {
    saved.push({ o, visible: o.visible, culled: o.frustumCulled });
    o.visible = keep.has(o) || o === root;
  });
  for (const o of shown) o.frustumCulled = false;
  try {
    return render();
  } finally {
    for (const { o, visible, culled } of saved) {
      o.visible = visible;
      o.frustumCulled = culled;
    }
  }
}
