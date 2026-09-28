import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, select, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { raggedKeepNode } from './PlantMeshes';

registerSelfTest({
  name: 'heath: the ragged edge keeps a camera-facing surface whole and cuts most of an edge-on one',
  async run(renderer) {
    // (noise, facing) pairs: noise 0…1 in 21 steps, at facing 1 and 0.05.
    const pts: [number, number][] = [];
    for (const f of [1, 0.05]) for (let i = 0; i <= 20; i++) pts.push([i / 20, f]);
    const n = pts.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flatMap(([a, b]) => [a, b, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly(), output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const e = input.element(instanceIndex);
      output.element(instanceIndex).assign(vec4(select(raggedKeepNode(e.x, e.y), float(1.0), float(0.0)), 0.0, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const kept = (f: number) => pts.filter((p, i) => p[1] === f && out[i * 4] === 1).length;
    const facingKept = kept(1), edgeKept = kept(0.05);
    return { pass: facingKept === 21 && edgeKept <= 5, detail: `facing: kept ${facingKept}/21; edge-on: kept ${edgeKept}/21` };
  },
});
