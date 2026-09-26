import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { bedHeightAt, buildBathymetry } from './bathymetry';
import { Seabed } from './Seabed';

const POINTS: [number, number][] = [
  [0, 0], [-30, -60], [50, -110], [20, -40], [-300, 100], [-1000, 0], [400, 0], [0, -449], [120, 10], [-399.9, 299.9],
];

registerSelfTest({
  name: 'seabed: GPU bed heights match the CPU bathymetry (±3 cm)',
  async run(renderer) {
    const bathy = buildBathymetry();
    const seabed = new Seabed(bathy);
    const n = POINTS.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(POINTS.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const xz = input.element(instanceIndex).xy;
      output.element(instanceIndex).assign(vec4(seabed.bedHeightNode(xz), seabed.insideNode(xz), 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const rows = POINTS.map(([x, z], i) => {
      const gpu = out[i * 4], cpu = bedHeightAt(bathy, x, z);
      worst = Math.max(worst, Math.abs(gpu - cpu));
      return `(${x},${z}) gpu ${gpu.toFixed(3)} cpu ${cpu.toFixed(3)}`;
    });
    return { pass: worst < 0.03, detail: `worst ${worst.toFixed(4)} m; ${rows.join('; ')}` };
  },
});
