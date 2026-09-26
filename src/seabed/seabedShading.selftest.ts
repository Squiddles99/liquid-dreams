import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { bedHeightAt, buildBathymetry } from './bathymetry';
import { Seabed } from './Seabed';
import { marchSeabedNode } from './seabedShading';
import { marchSeabed } from './waterColumn';

const RAYS: [[number, number, number], [number, number, number]][] = [
  [[-25, 0, 45], [0.3, -0.5, -0.81]], [[0, 0, 0], [0, -1, 0]], [[40, 0, -120], [0.2, -0.9, 0.39]],
  [[-300, 0, 100], [0, -1, 0]], [[20, 0, -40], [-0.6, -0.3, -0.74]], [[-10, 0, 20], [0.1, 0.5, 0.86]],
];

registerSelfTest({
  name: 'seabed shading: GPU ray-march hits match the CPU march (±0.15 m)',
  async run(renderer) {
    const bathy = buildBathymetry();
    const seabed = new Seabed(bathy);
    const n = RAYS.length;
    const norm = (d: number[]) => { const l = Math.hypot(d[0], d[1], d[2]); return [d[0] / l, d[1] / l, d[2] / l]; };
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(RAYS.flatMap(([p, d]) => [...p, 0, ...norm(d), 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n * 2).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const p = input.element(instanceIndex.mul(2)).xyz;
      const d = input.element(instanceIndex.mul(2).add(1)).xyz;
      output.element(instanceIndex).assign(vec4(marchSeabedNode(p, d, seabed), 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let ok = true;
    const notes = RAYS.map(([p, d], i) => {
      const cpu = marchSeabed(p, norm(d) as [number, number, number], (x, z) => bedHeightAt(bathy, x, z));
      const gpuHit = out[i * 4 + 1] > 0.5;
      if (gpuHit !== cpu.hit || (cpu.hit && Math.abs(out[i * 4] - cpu.distance) > 0.15)) ok = false;
      return `ray ${i}: gpu ${gpuHit ? out[i * 4].toFixed(2) : 'miss'} cpu ${cpu.hit ? cpu.distance.toFixed(2) : 'miss'}`;
    });
    return { pass: ok, detail: notes.join('; ') };
  },
});
