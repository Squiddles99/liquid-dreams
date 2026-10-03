import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, select, storage, uniform, vec4 } from 'three/tsl';
import { fmt, registerSelfTest } from '../dev/selfTest';
import { LAND_URL } from '../land/Land';
import { decodeLandFile } from '../land/landData';
import { LandHeight } from '../land/landHeight';
import { createLandLookUniforms, patchHoleMaskNode } from '../land/landShading';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { createWaterOpticsUniforms } from '../ocean/waterShading';
import { buildBathymetry } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { Sky } from '../sky/Sky';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { PATCH_GRID_N, PATCH_HOLE_INSET_M, buildPatchGrids } from './groundPatch';
import { GroundPatch } from './GroundPatchMesh';
import { Rocks } from './RockMeshes';
import type { Rock } from './rocks';

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

registerSelfTest({
  name: 'beach: a sunlit rock on the beach renders in its own colour, not black (the underwater switch keeps its normal)',
  async run(renderer) {
    // Built as App builds it (with the water, so the above/underwater select is in the shader), at a midday sun.
    const sky = new Sky(DEFAULT_ATMOSPHERE);
    sky.update(renderer, new THREE.Vector3(0.25, 0.93, -0.27).normalize(), 25);
    const rocks = new Rocks(sky, undefined, { seabed: new Seabed(buildBathymetry()), optics: createWaterOpticsUniforms(DEFAULT_WATER_OPTICS) });
    const rust: [number, number, number] = [0.29, 0.2, 0.12];
    const rock: Rock = { x: 240, z: 45, y: 4, kind: 'toe', shape: 1, radius: 0.8, height: 1.2, yaw: 0.4, tiltX: 0, tiltZ: 0, tint: rust, topTint: rust };
    rocks.update([rock], 240, 45);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    cam.position.set(244, 6.5, 45);
    cam.lookAt(240, 4.6, 45);
    const scene = new THREE.Scene();
    for (const m of rocks.meshes) scene.add(m);
    const target = new THREE.RenderTarget(64, 64, { type: THREE.FloatType });
    const clear = new THREE.Color();
    renderer.getClearColor(clear);
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, alpha);
    const px = new Float32Array((await renderer.readRenderTargetPixelsAsync(target, 0, 0, 64, 64)) as Float32Array);
    target.dispose();
    let drawn = 0, dark = 0;
    const sum = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] <= 0) continue;
      drawn++;
      for (let k = 0; k < 3; k++) sum[k] += Number.isFinite(px[i + k]) ? px[i + k] : 0;
      if (!(px[i] + px[i + 1] + px[i + 2] > 0.01)) dark++;
    }
    const mean = sum.map((v) => v / Math.max(drawn, 1));
    // Drawn, nowhere black, and rust: red over blue.
    const pass = drawn > 200 && dark === 0 && mean[0] > 0.05 && mean[0] > mean[2];
    return { pass, detail: `${drawn} px drawn, ${dark} black; mean rgb ${fmt(mean)}` };
  },
});
