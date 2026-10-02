import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, uniform, vec4 } from 'three/tsl';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { flowAt, flowFromEta } from './flow';
import { ReefFlow, flowFromEtaNode } from './flowNodes';
import { computeReefField, sampleField } from './reefField';
import { SetWaves } from './SetWaves';
import { toActiveWave } from './setWaveModel';

const field = () => computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });

async function run4(renderer: THREE.WebGPURenderer, rows: number[][], body: (q: any) => any): Promise<Float32Array> {
  const n = rows.length;
  const inAttr = new THREE.StorageBufferAttribute(new Float32Array(rows.flat()), 4);
  const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
  const input = storage(inAttr, 'vec4', n).toReadOnly();
  const output = storage(outAttr, 'vec4', n);
  renderer.compute(Fn(() => { output.element(instanceIndex).assign(body(input.element(instanceIndex))); })().compute(n) as THREE.ComputeNode);
  return new Float32Array(await renderer.getArrayBufferAsync(outAttr));
}

registerSelfTest({
  name: 'flow: the GPU formula matches flow.flowFromEta (η, k, depth, height, the cap, zero depth)',
  async run(renderer) {
    const omega = (2 * Math.PI) / 15;
    const rows: number[][] = [];
    for (const eta of [-4, -1.3, 0, 0.7, 6, 50]) for (const k of [0, 0.038, 0.056]) for (const depth of [0, 2, 6, 13]) for (const yf of [0, 0.5, 1]) rows.push([eta, k, depth, -depth * yf]);
    const out = await run4(renderer, rows, (q) => vec4(flowFromEtaNode(q.x, q.y, q.z, vec4(0.6, 0.8, 0, 0).xy, uniform(omega), q.w), 0.0, 0.0));
    let worst = 0;
    rows.forEach(([eta, k, depth, y], i) => {
      const c = flowFromEta(eta, { k, depth, dirX: 0.6, dirZ: 0.8 }, omega, y);
      worst = Math.max(worst, Math.abs(out[i * 4] - c.ux), Math.abs(out[i * 4 + 1] - c.uz));
    });
    return { pass: worst < 0.01, detail: `${rows.length} cases; worst ${worst.toExponential(2)} m/s` };
  },
});

registerSelfTest({
  name: 'flow: the GPU flow at the reef matches the CPU model (breaking off, ±0.05 m/s)',
  async run(renderer) {
    const f = field();
    const t = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)[2].arrivalS;
    const events = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
    const sets = new SetWaves(uniform(t));
    sets.setField(f);
    sets.setEvents(events);
    sets.setBreakParams({ ...DEFAULT_BREAK_PARAMS, enabled: false });
    const flow = new ReefFlow(sets);
    const pts = [[0, 0], [-20, 30], [-30, -60], [25, 28], [50, -110], [-120, 10], [-5, -1]];
    const out = await run4(renderer, pts.map(([x, z]) => [x, z, 0, 0]), (q) => vec4(flow.flowNode(q.xy, 0.5), 0.0, 0.0));
    const ctx = { omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ };
    const waves = events.map(toActiveWave);
    let worst = 0;
    const notes: string[] = [];
    pts.forEach(([x, z], i) => {
      const s = sampleField(f, x, z);
      const c = flowAt(x, z, -s.depth + 0.5, t, s, waves, ctx);
      worst = Math.max(worst, Math.hypot(out[i * 4] - c.ux, out[i * 4 + 1] - c.uz));
      notes.push(`(${x},${z}) ${out[i * 4].toFixed(2)},${out[i * 4 + 1].toFixed(2)} / ${c.ux.toFixed(2)},${c.uz.toFixed(2)}`);
    });
    return { pass: worst < 0.05, detail: `worst ${worst.toFixed(4)} m/s; ${notes.join('; ')}` };
  },
});
