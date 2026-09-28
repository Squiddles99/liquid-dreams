import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, vec4 } from 'three/tsl';
import { sunForConditions } from '../astro/sunForConditions';
import { registerSelfTest } from '../dev/selfTest';
import { LAND_URL } from './Land';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
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
