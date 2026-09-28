import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, vec4 } from 'three/tsl';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { buildBathymetry } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { shoreReefWidth } from '../seabed/shoreReef';
import { CoastalSurf } from './CoastalSurf';
import { DEFAULT_SURF_PARAMS, surfFoam, swashLevel, tableAt, wetLevel } from './surfModel';

registerSelfTest({
  name: 'surf: the GPU foam, swash and wet level match the CPU model (±0.02)',
  async run(renderer) {
    const seabed = new Seabed(buildBathymetry());
    const surf = new CoastalSurf();
    const c = cloneConditions(DEFAULT_CONDITIONS);
    const t = 1234.5;
    // No field: τ = 0 along the coast (a straight breaker), with a set wave that breaks just before t.
    surf.update(t, c, () => [{ arrivalS: 1230, heightM: 2.6 } as never], null, { ...DEFAULT_SURF_PARAMS });
    const s = surf.state;
    const cases: [number, number, number][] = [];
    for (const z of [0, 800, -2500]) {
      const W = shoreReefWidth(z), tb = Math.floor((t - tableAt(s.tau, z)) / s.periodS) * s.periodS + tableAt(s.tau, z);
      for (const d of [W, W - 5, W / 2, 3, -2]) for (const dt of [0.3, 4, 11]) cases.push([d, z, tb + dt]);
    }
    const n = cases.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([d, z, tt]) => [190 - d, z, tt, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    renderer.compute(Fn(() => {
      const q = input.element(instanceIndex);
      output.element(instanceIndex).assign(vec4(surf.foamNearNode(q.xy, seabed, q.z), surf.swashLevelNode(q.y, q.z), surf.wetLevelNode(q.y, q.z), 0.0));
    })().compute(n) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const rows = cases.map(([d, z, tt], i) => {
      const f = surfFoam(d, z, tt, s), sw = swashLevel(z, tt, s), w = wetLevel(z, tt, s);
      worst = Math.max(worst, Math.abs(out[i * 4] - f), Math.abs(out[i * 4 + 1] - sw), Math.abs(out[i * 4 + 2] - w));
      return `(d ${d.toFixed(0)}, z ${z}, t ${tt.toFixed(1)}) foam ${out[i * 4].toFixed(2)}/${f.toFixed(2)} swash ${out[i * 4 + 1].toFixed(2)}/${sw.toFixed(2)} wet ${out[i * 4 + 2].toFixed(2)}/${w.toFixed(2)}`;
    });
    return { pass: worst <= 0.02, detail: `worst ${worst.toFixed(4)}; ${rows.join('; ')}` };
  },
});
