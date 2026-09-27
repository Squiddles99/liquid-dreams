import * as THREE from 'three/webgpu';
import { Fn, abs, float, instanceIndex, int, ivec2, select, storage, textureLoad, uniform, vec2 } from 'three/tsl';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { computeReefField, sampleField } from '../breaker/reefField';
import { SetWaves } from '../breaker/SetWaves';
import { sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { FoamField } from './FoamField';
import { type FoamGrid, type FoamParams, type FoamSourceCpu, FoamSchedule, stepFoam, tickTime } from './foamStep';

type N = any;

/** Reads a FoamField's published map (.r) back to the CPU, row-major. */
async function readMap(renderer: THREE.WebGPURenderer, field: FoamField): Promise<Float32Array> {
  const { nx, nz } = field.grid;
  const outAttr = new THREE.StorageBufferAttribute(new Float32Array(nx * nz * 4), 4);
  const out = storage(outAttr, 'vec4', nx * nz);
  const pass = Fn(() => {
    const i = instanceIndex;
    out.element(i).assign(textureLoad(field.texture, ivec2(int(i.mod(nx)), int(i.div(nx))), int(0)));
  })().compute(nx * nz) as THREE.ComputeNode;
  renderer.compute(pass);
  const raw = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
  return Float32Array.from({ length: nx * nz }, (_, i) => raw[i * 4]);
}

const maxDiff = (a: Float32Array, b: Float32Array): number => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

/** A synthetic bore: a 4 m band moving +x at 6 m/s (from x = 0 at t = 0), direction +x (the CPU test's bore). */
function syntheticSource() {
  const t = uniform(0);
  const nodes = {
    foamNode: (xz: N): N => select(abs(xz.x.sub(t.mul(6.0))).lessThan(2.0), float(1.0), float(0.0)),
    dirNode: (): N => vec2(1.0, 0.0),
  };
  const cpu: FoamSourceCpu = { foam: (x, _z, tt) => (Math.abs(x - 6 * tt) < 2 ? 1 : 0), dir: () => [1, 0] };
  return { t, nodes, cpu };
}

const SMALL: FoamGrid = { x0: 0, z0: 0, cellM: 1, nx: 48, nz: 8 };

registerSelfTest({
  name: 'foam: the GPU step matches the CPU reference (drift, clear, inject) over a replay',
  async run(renderer) {
    const { t, nodes, cpu } = syntheticSource();
    const field = new FoamField(nodes, SMALL);
    const p: FoamParams = { clearTimeS: 3, driftMps: 0.4 };
    field.setParams(p);
    const tEnd = 5;
    field.advance(renderer, tEnd, (tt) => { t.value = tt; });
    const gpu = await readMap(renderer, field);
    const plan = new FoamSchedule().plan(tEnd, p.clearTimeS);
    const ref = plan.ticks.reduce((m, k) => stepFoam(m, SMALL, tickTime(k), p, cpu), new Float32Array(SMALL.nx * SMALL.nz));
    const d = maxDiff(gpu, ref);
    const peak = Math.max(...ref);
    // rgba16float rounds every step (half an ulp is 2.4e-4 in [0.5, 1)); over a clear of 60 ticks that can add up to ~0.012.
    return { pass: d < 0.02 && peak > 0.9, detail: `max |GPU − CPU| ${d.toFixed(5)} over ${plan.ticks.length} ticks; CPU peak ${peak.toFixed(3)}` };
  },
});

registerSelfTest({
  name: 'foam: a GPU replay matches GPU live stepping to the same tick (drift 0 exact, drift 0.4 within 0.02)',
  async run(renderer) {
    const notes: string[] = [];
    let ok = true;
    for (const drift of [0, 0.4]) {
      const { t, nodes } = syntheticSource();
      const prepare = (tt: number): void => { t.value = tt; };
      const live = new FoamField(nodes, SMALL);
      live.setParams({ clearTimeS: 3, driftMps: drift });
      for (let f = 0; f <= 360; f++) live.advance(renderer, 3 + f / 60, prepare); // exactly 9 s at the end
      const a = await readMap(renderer, live);
      const replay = new FoamField(nodes, SMALL);
      replay.setParams({ clearTimeS: 3, driftMps: drift });
      replay.advance(renderer, 9, prepare);
      const b = await readMap(renderer, replay);
      const d = maxDiff(a, b);
      notes.push(`drift ${drift}: max |live − replay| ${d.toFixed(5)}`);
      ok &&= drift === 0 ? d === 0 : d <= 0.02;
    }
    return { pass: ok, detail: notes.join('; ') };
  },
});

registerSelfTest({
  name: "foam: a replay over a breaking set matches the CPU reference driven by Phase 2's CPU foam (per-tick events)",
  async run(renderer) {
    const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    sets.setBreakParams(DEFAULT_BREAK_PARAMS);
    // 40 × 40 texels at 2 m from the peak shoreward over the shelf, where the default set 1's biggest wave barrels,
    // collapses and runs on as a bore (a 24 × 24 window at the peak held only 5 texels of dense foam at this time).
    const grid: FoamGrid = { x0: -10, z0: -40, cellM: 2, nx: 40, nz: 40 };
    const foam = new FoamField({ foamNode: (xz) => sets.breakingFoamNode(xz), dirNode: (xz) => sets.sample(xz, true).dir }, grid);
    const p: FoamParams = { clearTimeS: 2, driftMps: 0.4 };
    foam.setParams(p);
    const biggest = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const tEnd = biggest.arrivalS + 4;
    foam.advance(renderer, tEnd, (tt) => {
      time.value = tt;
      sets.setEvents(wavesNear(tt, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS));
    });
    const gpu = await readMap(renderer, foam);
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const o = { sample: (x: number, z: number) => sampleField(field, x, z), params: DEFAULT_BREAK_PARAMS };
    const cpuSource: FoamSourceCpu = {
      foam: (x, z, tt) => sumWaves(x, z, tt, sampleField(field, x, z), wavesNear(tt, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).map(toActiveWave), ctx, o).foam,
      dir: (x, z) => { const s = sampleField(field, x, z); const l = Math.hypot(s.dirX, s.dirZ) || 1; return [s.dirX / l, s.dirZ / l]; },
    };
    const ticks = new FoamSchedule().plan(tEnd, p.clearTimeS).ticks;
    const ref = ticks.reduce((m, k) => stepFoam(m, grid, tickTime(k), p, cpuSource), new Float32Array(grid.nx * grid.nz));
    const d = maxDiff(gpu, ref);
    const covered = ref.filter((v) => v > 0.5).length;
    // Phase 2's GPU/CPU foam agree to 0.05 (breaker self-test), plus rgba16float's rounding (≤ 0.02, the step test).
    return { pass: d < 0.07 && covered > 10, detail: `max |GPU − CPU| ${d.toFixed(4)} over ${ticks.length} ticks; ${covered} texels over 0.5` };
  },
});
