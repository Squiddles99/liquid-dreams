import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, normalize, storage, vec4 } from 'three/tsl';
import { sunForConditions } from '../astro/sunForConditions';
import { registerSelfTest } from '../dev/selfTest';
import { LAND_URL } from './Land';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { Sky } from '../sky/Sky';
import { reflectionCover, skylineTable } from './skyline';
import { SkylineTable } from './SkylineTable';
import { SunlightMap } from './SunlightMap';
import { buildMarchHeights, sunVisibility } from './sunlight';

async function bakedLand(): Promise<LandHeight> {
  const r = await fetch(LAND_URL);
  return new LandHeight(decodeLandFile(new Uint8Array(await r.arrayBuffer())));
}

/** Sample points snapped to sunlight-map texel centres (the map filters between centres; the CPU value is a point). */
const snap = (v: number, o: number): number => o + (Math.floor((v - o) / 8) + 0.5) * 8;
const POINTS: [number, number][] = ([[-25, 45], [-200, 0], [0, -300], [150, 200], [400, 0], [800, 100], [-500, -3000], [300, 2500], [1500, 0], [100, -1200]] as [number, number][])
  .map(([x, z]) => [snap(x, -600), snap(z, -4000)]);

registerSelfTest({
  name: 'land: the baked file loads; the waterline is 190 m at the reef',
  async run() {
    const land = await bakedLand();
    const xr = land.realWaterlineAt(0), xs = land.waterlineAt(-75);
    return { pass: Math.abs(xr - 190) <= 30 && xs === 190, detail: `x_r(0) ${xr.toFixed(1)} m, x_s(−75) ${xs}` };
  },
});

registerSelfTest({
  name: 'land: the GPU sunlight map matches the CPU visibility (±0.1) at 07:45 and 08:15',
  async run(renderer) {
    const land = await bakedLand();
    const heights = buildMarchHeights((x, z) => land.heightAt(x, z));
    const map = new SunlightMap();
    map.setHeights(heights);
    const n = POINTS.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(POINTS.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const read = Fn(() => { output.element(instanceIndex).assign(vec4(map.visibilityNode(input.element(instanceIndex).xy), 0.0, 0.0, 0.0)); })().compute(n) as THREE.ComputeNode;
    let worst = 0;
    const rows: string[] = [];
    for (const hours of [7.75, 8.25]) {
      const sun = sunForConditions({ date: '2026-07-15', timeOfDay: hours }).direction;
      map.update(renderer, sun);
      renderer.compute(read);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      POINTS.forEach(([x, z], i) => {
        const cpu = sunVisibility(heights, x, z, sun);
        worst = Math.max(worst, Math.abs(out[i * 4] - cpu));
        rows.push(`${hours}h (${x},${z}) gpu ${out[i * 4].toFixed(2)} cpu ${cpu.toFixed(2)}`);
      });
    }
    return { pass: worst <= 0.1, detail: `worst ${worst.toFixed(3)}; ${rows.join('; ')}` };
  },
});

registerSelfTest({
  name: 'land: the GPU reflection cover matches the CPU skyline (0/1 away from the edge)',
  async run(renderer) {
    const land = await bakedLand();
    const table = new SkylineTable();
    const eye = new THREE.Vector3(-25, 0.8, 45);
    table.update(land, 1, eye);
    const cpuTable = skylineTable((x, z) => land.heightAt(x, z), eye);
    const cases: [number[], number[]][] = [
      [[-25, 0, 45], [1, 0.02, 0]], [[-25, 0, 45], [1, 0.3, 0]], [[-25, 0, 45], [-1, 0.02, 0]],
      [[100, 0, 0], [1, 0.1, 0.1]], [[-25, 0, 45], [0.2, 0.01, -1]],
    ];
    const n = cases.length;
    const pAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([p]) => [...p, 0])), 4);
    const rAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([, r]) => [...r, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const P = storage(pAttr, 'vec4', n).toReadOnly(), R = storage(rAttr, 'vec4', n).toReadOnly(), O = storage(outAttr, 'vec4', n);
    const sky = new Sky();
    renderer.compute(Fn(() => {
      const c = table.reflectionNode(P.element(instanceIndex).xyz, normalize(R.element(instanceIndex).xyz), sky).cover;
      O.element(instanceIndex).assign(vec4(c, 0.0, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const rows = cases.map(([p, r], i) => {
      const len = Math.hypot(...r);
      const cpu = reflectionCover(cpuTable, eye, p as [number, number, number], r.map((v) => v / len) as [number, number, number]);
      worst = Math.max(worst, Math.abs(out[i * 4] - cpu));
      return `gpu ${out[i * 4].toFixed(2)} cpu ${cpu.toFixed(2)}`;
    });
    return { pass: worst <= 0.05, detail: `worst ${worst.toFixed(3)}; ${rows.join('; ')}` };
  },
});
