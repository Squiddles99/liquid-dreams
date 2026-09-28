import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { bedHeightAt, bedMaterialAt, buildBathymetry } from './bathymetry';
import { Seabed, WATERLINE_COUNT } from './Seabed';

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

registerSelfTest({
  name: 'seabed: the waterline shift moves the coast outside the map, GPU = CPU (±3 cm)',
  async run(renderer) {
    const bathy = buildBathymetry();
    const seabed = new Seabed(bathy);
    const xs = new Float32Array(WATERLINE_COUNT);
    for (let i = 0; i < WATERLINE_COUNT; i++) xs[i] = 190 + 150 * Math.sin(i * 0.05);
    seabed.setWaterline(xs);
    const pts: [number, number][] = [[400, 1200], [-1000, 5000], [250, -9000], [0, 0], [300, 700], [150, -2000]];
    const n = pts.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    renderer.compute(Fn(() => {
      output.element(instanceIndex).assign(vec4(seabed.bedHeightNode(input.element(instanceIndex).xy), 0.0, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const rows = pts.map(([x, z], i) => {
      const cpu = bedHeightAt(bathy, x, z, (zz) => seabed.shiftAt(zz));
      worst = Math.max(worst, Math.abs(out[i * 4] - cpu));
      return `(${x},${z}) gpu ${out[i * 4].toFixed(3)} cpu ${cpu.toFixed(3)}`;
    });
    return { pass: worst < 0.03, detail: `worst ${worst.toFixed(4)} m; ${rows.join('; ')}` };
  },
});

registerSelfTest({
  name: 'seabed: the shore reef platform material, GPU = CPU (±0.02), inside and outside the map',
  async run(renderer) {
    const bathy = buildBathymetry();
    const seabed = new Seabed(bathy);
    const xs = new Float32Array(WATERLINE_COUNT);
    for (let i = 0; i < WATERLINE_COUNT; i++) xs[i] = 190 + 120 * Math.sin(i * 0.07);
    seabed.setWaterline(xs);
    const pts: [number, number][] = [[180, -20], [150, 0], [120, 100], [0, 0], [300, 3000], [250, -5000], [140, 800], [60, -200], [185, 12000]];
    const n = pts.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    renderer.compute(Fn(() => {
      const m = seabed.materialNode(input.element(instanceIndex).xy);
      output.element(instanceIndex).assign(vec4(m.x, m.y, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const rows = pts.map(([x, z], i) => {
      const [s, w] = bedMaterialAt(bathy, x, z, (zz) => seabed.shiftAt(zz));
      worst = Math.max(worst, Math.abs(out[i * 4] - s), Math.abs(out[i * 4 + 1] - w));
      return `(${x},${z}) gpu ${out[i * 4].toFixed(2)}/${out[i * 4 + 1].toFixed(2)} cpu ${s.toFixed(2)}/${w.toFixed(2)}`;
    });
    return { pass: worst < 0.02, detail: `worst ${worst.toFixed(4)}; ${rows.join('; ')}` };
  },
});
