import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, storage, texture, texture3D, uint, vec2, vec3 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { CloudTextures, SHAPE_SIZE, WEATHER_SIZE } from './CloudTextures';

type N = any;

/** Read `count` values from a compute pass that writes value(i) (a float node) for each i. */
async function readFloats(renderer: THREE.WebGPURenderer, count: number, value: (i: N) => N): Promise<Float32Array> {
  const attr = new THREE.StorageBufferAttribute(new Float32Array(count), 1);
  const out = storage(attr, 'float', count);
  renderer.compute(Fn(() => { out.element(instanceIndex).assign(value(instanceIndex)); })().compute(count) as THREE.ComputeNode);
  return new Float32Array(await renderer.getArrayBufferAsync(attr));
}

let shared: CloudTextures | null = null;
function textures(renderer: THREE.WebGPURenderer): CloudTextures {
  if (!shared) shared = new CloudTextures();
  shared.build(renderer);
  return shared;
}

const mean = (a: ArrayLike<number>): number => Array.from(a).reduce((s, v) => s + v, 0) / a.length;
const std = (a: ArrayLike<number>): number => { const m = mean(a); return Math.sqrt(mean(Array.from(a, (v) => (v - m) ** 2))); };

registerSelfTest({
  name: 'clouds: the shape noise varies (mean and spread)',
  async run(renderer) {
    const t = textures(renderer);
    // 16³ points through the volume, off the texel grid.
    const v = await readFloats(renderer, 4096, (i: N) => {
      const c = vec3(float(i.mod(uint(16))), float(i.div(uint(16)).mod(uint(16))), float(i.div(uint(256)))).add(0.37).div(16.0);
      return texture3D(t.shape, c, float(0)).x;
    });
    const m = mean(v), s = std(v);
    return { pass: m > 0.1 && m < 0.9 && s > 0.1 && v.every(Number.isFinite), detail: `mean ${m.toFixed(3)} std ${s.toFixed(3)} min ${Math.min(...v).toFixed(3)} max ${Math.max(...v).toFixed(3)}` };
  },
});

registerSelfTest({
  name: 'clouds: the shape noise tiles (no step across its seam)',
  async run(renderer) {
    const t = textures(renderer);
    const n = SHAPE_SIZE;
    // Differences between x-neighbours at texel centres: across the seam (x = n−1 → 0) and inside (x = n/2−1 → n/2).
    const diffs = (x0: number) => readFloats(renderer, n * n, (i: N) => {
      const y = float(i.mod(uint(n))).add(0.5).div(n), z = float(i.div(uint(n))).add(0.5).div(n);
      const a = texture3D(t.shape, vec3((x0 + 0.5) / n, y, z), float(0)).x;
      const b = texture3D(t.shape, vec3(((x0 + 1) % n + 0.5) / n, y, z), float(0)).x;
      return a.sub(b).abs();
    });
    const seam = mean(await diffs(n - 1)), inside = mean(await diffs(n / 2 - 1));
    return { pass: seam < inside * 1.5 + 0.01, detail: `mean |Δ| across the seam ${seam.toFixed(4)}, inside ${inside.toFixed(4)}` };
  },
});

registerSelfTest({
  name: 'clouds: a new seed moves the weather map',
  async run(renderer) {
    const t = textures(renderer);
    const sample = () => readFloats(renderer, 1024, (i: N) => {
      const uv = vec2(float(i.mod(uint(32))), float(i.div(uint(32)))).add(0.5).div(32.0);
      return texture(t.weather, uv).level(float(0)).x;
    });
    t.setSeed(1); t.build(renderer);
    const a = await sample();
    t.setSeed(2); t.build(renderer);
    const b = await sample();
    const moved = mean(Array.from(a, (v, i) => Math.abs(v - b[i])));
    const spread = std(a);
    return { pass: moved > 0.05 && spread > 0.1, detail: `mean |Δ| between seeds ${moved.toFixed(3)}, coverage spread ${spread.toFixed(3)} (${WEATHER_SIZE}² map)` };
  },
});
