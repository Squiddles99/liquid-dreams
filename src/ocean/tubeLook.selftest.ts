// breaking-look item 2: the tube's reflected light (tubeSeenNode) on the GPU matches its CPU mirror (skyOpen 0, ½, 1).
import { type ComputeNode, StorageBufferAttribute } from 'three/webgpu';
import { Fn, float, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { tubeSeenCpu, tubeSeenNode } from './waterShading';

registerSelfTest({
  name: 'tube look: the reflected ray inside the tube (item 2) matches tubeSeenCpu (mouth sky open, lip light roofed)',
  async run(renderer) {
    const cases = [[5, 0.4, 2, 100, 0.5, 0.2, 1, 0], [5, 0.4, 2, 100, 0.5, 0.2, 1, 0.5], [5, 0.4, 2, 100, 0.5, 0.2, 1, 1], [0.3, 0.7, 1.1, 40, 0.3, 0.6, 0.5, 0.2]];
    const attr = new StorageBufferAttribute(new Float32Array(cases.length * 4), 4);
    const out = storage(attr, 'vec4', cases.length);
    const pass = Fn(() => {
      cases.forEach((c, i) => out.element(i).assign(vec4(tubeSeenNode(float(c[0]), float(c[1]), float(c[2]), float(c[3]), float(c[4]), float(c[5]), float(c[6]), float(c[7])), 0.0, 0.0, 0.0)));
    })().compute(1) as ComputeNode;
    renderer.compute(pass);
    const g = new Float32Array(await renderer.getArrayBufferAsync(attr));
    let worst = 0;
    cases.forEach((c, i) => { const cpu = tubeSeenCpu(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]); worst = Math.max(worst, Math.abs(g[i * 4] - cpu) / Math.max(Math.abs(cpu), 1e-6)); });
    return { pass: worst < 1e-5, detail: `worst relative error ${worst.toExponential(2)} over ${cases.length} cases` };
  },
});
