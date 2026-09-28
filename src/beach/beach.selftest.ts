import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, select, storage, uniform, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { LAND_URL } from '../land/Land';
import { decodeLandFile } from '../land/landData';
import { LandHeight } from '../land/landHeight';
import { createLandLookUniforms, patchHoleMaskNode } from '../land/landShading';
import { Sky } from '../sky/Sky';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { PATCH_GRID_N, PATCH_HOLE_INSET_M, buildPatchGrids } from './groundPatch';
import { GroundPatch } from './GroundPatchMesh';

type N = any;

/** Runs a vec2 → float node over the points in a compute pass and reads the results back. */
async function evaluate(renderer: THREE.WebGPURenderer, points: [number, number][], fn: (xz: N) => N): Promise<Float32Array> {
  const n = points.length;
  const inAttr = new THREE.StorageBufferAttribute(new Float32Array(points.flatMap(([x, z]) => [x, z, 0, 0])), 4);
  const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
  const input = storage(inAttr, 'vec4', n).toReadOnly();
  const output = storage(outAttr, 'vec4', n);
  const pass = Fn(() => { output.element(instanceIndex).assign(vec4(fn(input.element(instanceIndex).xy), 0.0, 0.0, 0.0)); })().compute(n) as THREE.ComputeNode;
  renderer.compute(pass);
  const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
  return Float32Array.from({ length: n }, (_, i) => out[i * 4]);
}

registerSelfTest({
  name: 'beach: the ground patch\'s heights (without the relief) match the CPU grid, ±1 mm',
  async run(renderer) {
    const r = await fetch(LAND_URL);
    const land = new LandHeight(decodeLandFile(new Uint8Array(await r.arrayBuffer())));
    const g = buildPatchGrids(land, [212, -40]);
    const patch = new GroundPatch(new Sky(DEFAULT_ATMOSPHERE), createLandLookUniforms());
    patch.setGrids(g);
    const cpu = (x: number, z: number): number => {
      const fx = Math.min(Math.max(x - g.cornerX, 0), PATCH_GRID_N - 1), fz = Math.min(Math.max(z - g.cornerZ, 0), PATCH_GRID_N - 1);
      const i = Math.min(Math.floor(fx), PATCH_GRID_N - 2), j = Math.min(Math.floor(fz), PATCH_GRID_N - 2), tx = fx - i, tz = fz - j;
      const h = (a: number, b: number): number => g.heights[b * PATCH_GRID_N + a];
      return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz;
    };
    const points: [number, number][] = [[181.3, -71.2], [200.5, -40.25], [212, -40], [236.8, -12.1], [243.99, -8.01], [190.12, -55.7]];
    const gpu = await evaluate(renderer, points, (xz) => patch.heightNode(xz));
    let worst = 0;
    const rows = points.map(([x, z], k) => { worst = Math.max(worst, Math.abs(gpu[k] - cpu(x, z))); return `(${x},${z}) gpu ${gpu[k].toFixed(3)} cpu ${cpu(x, z).toFixed(3)}`; });
    return { pass: worst <= 0.001, detail: `worst ${(worst * 1000).toFixed(2)} mm; ${rows.join('; ')}` };
  },
});

registerSelfTest({
  name: 'beach: the coarse land\'s hole covers the patch\'s square less 0.5 m, only while the patch shows',
  async run(renderer) {
    const hole = { centre: uniform(new THREE.Vector2(212, -40)), half: uniform(32), on: uniform(1) };
    const e = 32 - PATCH_HOLE_INSET_M;
    // [x, z, expected draw (1) or cut (0)]
    const cases: [number, number, number][] = [[212, -40, 0], [212 + e - 0.05, -40, 0], [212 + e + 0.05, -40, 1], [212, -40 - e + 0.05, 0], [212, -40 - e - 0.05, 1], [300, 0, 1], [212 + e - 0.1, -40 + e - 0.1, 0]];
    const mask = (xz: N): N => select(patchHoleMaskNode(xz, hole), float(1.0), float(0.0));
    const on = await evaluate(renderer, cases.map(([x, z]) => [x, z]), mask);
    hole.on.value = 0;
    const off = await evaluate(renderer, cases.map(([x, z]) => [x, z]), mask);
    const bad = cases.filter(([, , want], k) => on[k] !== want || off[k] !== 1);
    return { pass: bad.length === 0, detail: bad.length ? `wrong at ${bad.map(([x, z]) => `(${x},${z})`).join(', ')}` : `${cases.length} points right, with the patch shown and hidden` };
  },
});
