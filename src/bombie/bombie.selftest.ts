import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, uniform, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { SetWaves } from '../breaker/SetWaves';
import { CASCADE_FADES, fadeWeightNode } from '../ocean/cascadeFades';
import { OceanSimulation } from '../ocean/OceanSimulation';
import { EARTH_RADIUS_M } from '../ocean/OceanSurface';
import { WaterSurfaceModel } from '../ocean/waterSurface';
import { buildBathymetry } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { BombieMesh } from './BombieMesh';
import { BOMBIE_X, BOMBIE_Z } from './bombieModel';

registerSelfTest({
  name: 'bombie: the white water rides the ocean sheet (its height = the sheet’s at the same xz, ±1 mm)',
  async run(renderer) {
    const sim = new OceanSimulation();
    sim.update(renderer, 5, 1 / 60);
    const model = new WaterSurfaceModel(sim, new Seabed(buildBathymetry()), new SetWaves(sim.time));
    const b = new BombieMesh(model, new Sky(DEFAULT_ATMOSPHERE));
    const cam = uniform(new THREE.Vector2(-25, 45));
    const pts: [number, number][] = [[BOMBIE_X, BOMBIE_Z], [BOMBIE_X + 40, BOMBIE_Z - 20], [BOMBIE_X + 120, BOMBIE_Z - 50], [BOMBIE_X - 30, BOMBIE_Z + 60], [-200, 300], [-250, 400]];
    const n = pts.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly(), output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const xz = input.element(instanceIndex).xy;
      const radial = xz.sub(cam).length();
      const sheet = model.seabed.tide.add(model.displacement(xz, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry)).y).sub(radial.mul(radial).div(2 * EARTH_RADIUS_M));
      output.element(instanceIndex).assign(vec4(b.surfaceYNode(xz, cam), sheet, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(out[i * 4] - out[i * 4 + 1]));
    return { pass: worst <= 0.001, detail: `worst ${(worst * 1000).toFixed(2)} mm over ${n} points` };
  },
});

registerSelfTest({
  name: 'bombie: the mound leaves the sea alone (the long swell’s weight over its crest = beside it; final review I3)',
  async run(renderer) {
    const sim = new OceanSimulation();
    sim.update(renderer, 5, 1 / 60);
    const model = new WaterSurfaceModel(sim, new Seabed(buildBathymetry()), new SetWaves(sim.time));
    const pts: [number, number][] = [[BOMBIE_X, BOMBIE_Z], [BOMBIE_X + 10, BOMBIE_Z + 15], [BOMBIE_X, BOMBIE_Z + 80]];
    const n = pts.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly(), output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      output.element(instanceIndex).assign(vec4(model.swellWeight(input.element(instanceIndex).xy), 0.0, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const w = [out[0], out[4], out[8]];
    return { pass: Math.abs(w[0] - w[2]) < 1e-4 && Math.abs(w[1] - w[2]) < 1e-4, detail: `swell weight: crest ${w[0].toFixed(3)}, slope ${w[1].toFixed(3)}, open water ${w[2].toFixed(3)}` };
  },
});
