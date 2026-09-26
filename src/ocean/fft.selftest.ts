import * as THREE from 'three/webgpu';
import { storage } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { createInverseFftPass } from './fft';
import { FFT_SIZE } from './spectrum';

const n = FFT_SIZE;
const cascades = 3;
const at = (c: number, x: number, z: number) => ((c * n + z) * n + x) * 4;

async function runIfft(renderer: THREE.WebGPURenderer, fill: (a: Float32Array, b: Float32Array) => void) {
  const count = cascades * n * n;
  const aAttr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
  const bAttr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
  fill(aAttr.array as Float32Array, bAttr.array as Float32Array);
  const a = storage(aAttr, 'vec4', count);
  const b = storage(bAttr, 'vec4', count);
  renderer.compute([createInverseFftPass(a, b, cascades, 'rows'), createInverseFftPass(a, b, cascades, 'columns')]);
  return {
    a: new Float32Array(await renderer.getArrayBufferAsync(aAttr)),
    b: new Float32Array(await renderer.getArrayBufferAsync(bAttr)),
  };
}

const SAMPLES: Array<[number, number]> = [[0, 0], [1, 0], [37, 5], [128, 200], [255, 255]];

registerSelfTest({
  name: 'fft: DC impulse gives a constant field',
  async run(renderer) {
    const { a } = await runIfft(renderer, (A) => { A[at(0, 0, 0)] = 1; });
    let err = 0;
    for (const [x, z] of SAMPLES) err = Math.max(err, Math.abs(a[at(0, x, z)] - 1), Math.abs(a[at(0, x, z) + 1]));
    return { pass: err < 1e-3, detail: `max error ${err.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'fft: one x-frequency in cascade 1 gives e^{2πix/n}; other cascades untouched',
  async run(renderer) {
    const { a } = await runIfft(renderer, (A) => { A[at(1, 1, 0)] = 1; });
    let err = 0;
    for (const [x, z] of SAMPLES) {
      const ang = (2 * Math.PI * x) / n;
      err = Math.max(err, Math.abs(a[at(1, x, z)] - Math.cos(ang)), Math.abs(a[at(1, x, z) + 1] - Math.sin(ang)));
      err = Math.max(err, Math.abs(a[at(0, x, z)]), Math.abs(a[at(2, x, z)]));
    }
    return { pass: err < 1e-3, detail: `max error ${err.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'fft: packed zw channel of buffer B along z',
  async run(renderer) {
    const { b } = await runIfft(renderer, (_A, B) => { B[at(2, 0, 3) + 3] = 1; }); // value i at kz index 3
    let err = 0;
    for (const [x, z] of SAMPLES) {
      const ang = (2 * Math.PI * 3 * z) / n; // i·e^{iθ} = (-sin θ, cos θ)
      err = Math.max(err, Math.abs(b[at(2, x, z) + 2] + Math.sin(ang)), Math.abs(b[at(2, x, z) + 3] - Math.cos(ang)));
    }
    return { pass: err < 1e-3, detail: `max error ${err.toExponential(2)}` };
  },
});
