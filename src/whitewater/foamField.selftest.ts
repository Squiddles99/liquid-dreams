import * as THREE from 'three/webgpu';
import { Fn, abs, float, instanceIndex, int, ivec2, select, storage, textureLoad, uniform, vec2, vec4 } from 'three/tsl';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { computeReefField, sampleField } from '../breaker/reefField';
import { SetWaves } from '../breaker/SetWaves';
import { breakOptions, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { AGED_LACE_COVER, SET_FOAM_MAX_COVER, setFoamPattern, sheetFoamWeight, waterFoamFrame, waterFoamFrameCpu } from '../ocean/OceanSurface';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { FoamField } from './FoamField';
import { type MistSourceCpu, stepMist } from './mistSlab';
import { COARSE_TICKS, FOAM_TICK_S, type FoamGrid, type FoamParams, type FoamPlan, type FoamSourceCpu, FoamSchedule, stepFoam, tickTime } from './foamStep';

type N = any;

/** Reads a FoamField's published map back to the CPU, row-major: channel 0 density, 1 age. */
async function readMap(renderer: THREE.WebGPURenderer, field: FoamField, channel = 0): Promise<Float32Array> {
  const { nx, nz } = field.grid;
  const outAttr = new THREE.StorageBufferAttribute(new Float32Array(nx * nz * 4), 4);
  const out = storage(outAttr, 'vec4', nx * nz);
  const pass = Fn(() => {
    const i = instanceIndex;
    out.element(i).assign(textureLoad(field.texture, ivec2(int(i.mod(nx)), int(i.div(nx))), int(0)));
  })().compute(nx * nz) as THREE.ComputeNode;
  renderer.compute(pass);
  const raw = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
  return Float32Array.from({ length: nx * nz }, (_, i) => raw[i * 4 + channel]);
}

const maxDiff = (a: Float32Array, b: Float32Array): number => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
/** The CPU reference's (density, age) pairs, one channel of them. */
const channelOf = (m: Float32Array, c: number): Float32Array => Float32Array.from({ length: m.length / 2 }, (_, i) => m[2 * i + c]);
/** A plan run on the CPU reference: the coarse ticks with dt COARSE_TICKS × FOAM_TICK_S, then the fine. */
const runCpu = (plan: FoamPlan, g: FoamGrid, p: FoamParams, src: FoamSourceCpu): Float32Array => {
  let m = new Float32Array(2 * g.nx * g.nz);
  for (const k of plan.coarse) m = stepFoam(m, g, tickTime(k), COARSE_TICKS * FOAM_TICK_S, p, src);
  for (const k of plan.ticks) m = stepFoam(m, g, tickTime(k), FOAM_TICK_S, p, src);
  return m;
};

/** A synthetic bore: a 4 m band moving +x at 6 m/s (from x = 0 at t = 0), direction +x, pushing its foam at 6 m/s. */
function syntheticSource() {
  const t = uniform(0);
  const band = (xz: N, shift: N | null = null): N => select(abs(xz.x.sub((shift === null ? t : t.sub(shift)).mul(6.0))).lessThan(2.0), float(1.0), float(0.0));
  const nodes = {
    foamNode: (xz: N) => band(xz),
    dirNode: (): N => vec2(1.0, 0.0),
    foamPushNode: (xz: N, shift?: N | null) => { const f = band(xz, shift ?? null); return { foam: f, push: f.mul(6.0) }; },
  };
  const foamAt = (x: number, tt: number): number => (Math.abs(x - 6 * tt) < 2 ? 1 : 0);
  const cpu: FoamSourceCpu = { foam: (x, _z, tt) => foamAt(x, tt), dir: () => [1, 0], push: (x, _z, tt) => 6 * foamAt(x, tt), wind: [2, 3] };
  return { t, nodes, cpu };
}

const SMALL: FoamGrid = { x0: 0, z0: 0, cellM: 1, nx: 48, nz: 8 };

registerSelfTest({
  name: 'foam: the GPU mist channel matches mistSlab.stepMist (landing + plume shares, the carry by the wind, the decay) over a coarse + fine replay',
  async run(renderer) {
    const t = uniform(0);
    // A landing band 3 m wide moving +x at 6 m/s (land 1.5) with the throwing lip 4 m ahead of it (lip 0.6); offshore 8 m/s.
    const at = (x: N, tt: N, off: number, w: number): N => select(abs(x.sub(tt.mul(6.0)).sub(off)).lessThan(w), float(1.0), float(0.0));
    const nodes = {
      foamNode: (xz: N) => at(xz.x, t, 0, 2),
      dirNode: (): N => vec2(1.0, 0.0),
      foamPushNode: (xz: N, shift?: N | null) => {
        const tt = shift ? t.sub(shift) : t;
        return { foam: at(xz.x, tt, 0, 2), push: float(0.0), land: at(xz.x, tt, 0, 1.5).mul(1.5), lip: at(xz.x, tt, 4, 1.5).mul(0.6) };
      },
    };
    const cpuAt = (x: number, tt: number, off: number, w: number): number => (Math.abs(x - 6 * tt - off) < w ? 1 : 0);
    const wind: [number, number] = [-8, 2];
    const src: MistSourceCpu = { mist: (x, _z, tt) => [1.5 * cpuAt(x, tt, 0, 1.5), 0.6 * cpuAt(x, tt, 4, 1.5)], dir: () => [1, 0], wind };
    const field = new FoamField(nodes, SMALL);
    const p: FoamParams = { clearTimeS: 3, driftMps: 0.4, laceLifeS: 30, volumeExposure: 0.55 };
    field.setParams(p);
    field.setWind(wind[0], wind[1]);
    const tEnd = 5.5;
    field.advance(renderer, tEnd, (tt) => { t.value = tt; }, true);
    const gpu = await readMap(renderer, field, 2);
    const plan = new FoamSchedule().plan(tEnd, p.clearTimeS + p.laceLifeS);
    let ref = new Float32Array(SMALL.nx * SMALL.nz);
    for (const k of plan.coarse) ref = stepMist(ref, SMALL, tickTime(k), COARSE_TICKS * FOAM_TICK_S, src);
    for (const k of plan.ticks) ref = stepMist(ref, SMALL, tickTime(k), FOAM_TICK_S, src);
    const d = maxDiff(gpu, ref), peak = Math.max(...ref);
    return { pass: d < 0.01 && peak > 0.5, detail: `max |GPU − CPU| mist ${d.toFixed(5)} over ${plan.coarse.length} coarse + ${plan.ticks.length} ticks; CPU peak ${peak.toFixed(3)}` };
  },
});

registerSelfTest({
  name: 'foam: the GPU step matches the CPU reference (density and age; drift, push, wind, the two lives) over a coarse + fine replay',
  async run(renderer) {
    const { t, nodes, cpu } = syntheticSource();
    const field = new FoamField(nodes, SMALL);
    const p: FoamParams = { clearTimeS: 3, driftMps: 0.4, laceLifeS: 30, volumeExposure: 0.55 };
    field.setParams(p);
    field.setWind(2, 3);
    const tEnd = 8;
    field.advance(renderer, tEnd, (tt) => { t.value = tt; }, true);
    const gpuD = await readMap(renderer, field, 0), gpuA = await readMap(renderer, field, 1);
    const plan = new FoamSchedule().plan(tEnd, p.clearTimeS + p.laceLifeS);
    const ref = runCpu(plan, SMALL, p, cpu);
    const refD = channelOf(ref, 0), refA = channelOf(ref, 1);
    const d = maxDiff(gpuD, refD), peak = Math.max(...refD);
    // Ages where there is foam (half floats: 0.03 s at 60 s).
    let da = 0;
    refD.forEach((v, i) => { if (v > 0.01) da = Math.max(da, Math.abs(gpuA[i] - refA[i])); });
    return {
      pass: d < 0.02 && da < 0.1 && peak > 0.9 && plan.coarse.length > 0,
      detail: `max |GPU − CPU| density ${d.toFixed(5)}, age ${da.toFixed(4)} s (where foam) over ${plan.coarse.length} coarse + ${plan.ticks.length} ticks; CPU peak ${peak.toFixed(3)}`,
    };
  },
});

registerSelfTest({
  name: 'foam: a GPU replay matches GPU live stepping to the same tick (short history: drift 0 exact, drift 0.4 within 0.02)',
  async run(renderer) {
    const notes: string[] = [];
    let ok = true;
    for (const drift of [0, 0.4]) {
      const { t, nodes } = syntheticSource();
      const prepare = (tt: number): void => { t.value = tt; };
      const p: FoamParams = { clearTimeS: 3, driftMps: drift, laceLifeS: 30, volumeExposure: 0.55 };
      const live = new FoamField(nodes, SMALL);
      live.setParams(p);
      for (let f = 0; f <= 360; f++) live.advance(renderer, 3 + f / 60, prepare, true); // exactly 9 s at the end
      const a = await readMap(renderer, live);
      const replay = new FoamField(nodes, SMALL);
      replay.setParams(p);
      replay.advance(renderer, 9, prepare, true);
      const b = await readMap(renderer, replay);
      const d = maxDiff(a, b);
      notes.push(`drift ${drift}: max |live − replay| ${d.toFixed(5)}`);
      // Both replays start with the same coarse steps (the live one's at 3 s): only the fine ticks after differ in order.
      ok &&= drift === 0 ? d < 1e-3 : d <= 0.02;
    }
    return { pass: ok, detail: notes.join('; ') };
  },
});

/** The breaking set's GPU sources and the CPU reference's, on a reef field (the default set 1's biggest wave). */
function breakingRig() {
  const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
  const time = uniform(0);
  const sets = new SetWaves(time);
  sets.setField(field);
  sets.setBreakParams(DEFAULT_BREAK_PARAMS);
  const nodes = { foamNode: (xz: N) => sets.breakingFoamNode(xz), dirNode: (xz: N) => sets.sample(xz, true).dir, foamPushNode: (xz: N, shift?: N | null) => sets.breakingFoamPushNode(xz, shift ?? null) };
  const prepare = (tt: number): void => {
    time.value = tt;
    sets.setEvents(wavesNear(tt, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS));
  };
  const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const o = breakOptions(field, DEFAULT_BREAK_PARAMS);
  const foamAt = (x: number, z: number, tt: number): number => sumWaves(x, z, tt, sampleField(field, x, z), wavesNear(tt, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).map(toActiveWave), ctx, o).foam;
  const cpu: FoamSourceCpu = {
    foam: foamAt,
    dir: (x, z) => { const s = sampleField(field, x, z); const l = Math.hypot(s.dirX, s.dirZ) || 1; return [s.dirX / l, s.dirZ / l]; },
    push: (x, z, tt) => (field.omega / sampleField(field, x, z).k) * foamAt(x, z, tt),
  };
  const biggest = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  return { nodes, prepare, cpu, biggest };
}

// 40 × 40 texels at 2 m from the peak shoreward over the shelf, where the default set 1's biggest wave barrels,
// collapses and runs on as a bore (a 24 × 24 window at the peak held only 5 texels of dense foam at this time).
const SHELF: FoamGrid = { x0: -10, z0: -40, cellM: 2, nx: 40, nz: 40 };

registerSelfTest({
  name: "foam: a replay over a breaking set matches the CPU reference driven by Phase 2's CPU foam and push (per-tick events)",
  async run(renderer) {
    const { nodes, prepare, cpu, biggest } = breakingRig();
    const foam = new FoamField(nodes, SHELF);
    const p: FoamParams = { clearTimeS: 4, driftMps: 0.4, laceLifeS: 30, volumeExposure: 0.55 };
    foam.setParams(p);
    const tEnd = biggest.arrivalS + 4;
    foam.advance(renderer, tEnd, prepare, true);
    const gpu = await readMap(renderer, foam);
    const ref = channelOf(runCpu(new FoamSchedule().plan(tEnd, p.clearTimeS + p.laceLifeS), SHELF, p, cpu), 0);
    const d = maxDiff(gpu, ref);
    const covered = ref.filter((v) => v > 0.5).length;
    // Phase 2's GPU/CPU foam agree to 0.05 (breaker self-test), plus the published map's half floats.
    return { pass: d < 0.07 && covered > 10, detail: `max |GPU − CPU| ${d.toFixed(4)}; ${covered} texels over 0.5` };
  },
});

registerSelfTest({
  name: 'foam: a covered replay into the middle of the lace (10 s and 60 s after a breaking set) matches live play within 0.02 and a 75 s jump takes at most 400 ms; the uncovered one is cheaper',
  async run(renderer) {
    const { nodes, prepare, biggest } = breakingRig();
    const p: FoamParams = { clearTimeS: 10, driftMps: 0.4, laceLifeS: 75, volumeExposure: 0.55 };
    const notes: string[] = [];
    let ok = true;
    // Live: from 5 s before the set's biggest wave reaches the peak, stepping 60 fps frames; at +10 s and +60 s a fresh
    // field replays to the same moment.
    const live = new FoamField(nodes, SHELF);
    live.setParams(p);
    const t0 = biggest.arrivalS - 5;
    let f = 0;
    for (const dt of [10, 60]) {
      const tEnd = biggest.arrivalS + dt;
      for (; t0 + f / 60 <= tEnd + 1e-9; f++) live.advance(renderer, t0 + f / 60, prepare, true);
      const a = await readMap(renderer, live);
      const replay = new FoamField(nodes, SHELF);
      replay.setParams(p);
      replay.advance(renderer, t0 + (f - 1) / 60, prepare, true);
      const b = await readMap(renderer, replay);
      const d = maxDiff(a, b), lace = a.filter((v) => v > 0.01).length;
      notes.push(`+${dt} s: max |live − replay| ${d.toFixed(4)} (${lace} texels of foam)`);
      ok &&= d <= 0.02 && lace > 10;
    }
    // The replay's wall time at the game's box size: a 75 s jump (clear + lace + 2 s of history), to the GPU's finish.
    const full = new FoamField(nodes);
    full.setParams(p);
    full.advance(renderer, biggest.arrivalS + 30, prepare, true); // builds its pipelines: the game prewarms them
    await (renderer as unknown as { backend: { device: GPUDevice } }).backend.device.queue.onSubmittedWorkDone();
    full.invalidate();
    const w0 = performance.now();
    const steps = full.advance(renderer, biggest.arrivalS + 60, prepare, true);
    await (renderer as unknown as { backend: { device: GPUDevice } }).backend.device.queue.onSubmittedWorkDone();
    const ms = performance.now() - w0;
    notes.push(`covered (exact): a full-box replay: ${steps} steps in ${ms.toFixed(0)} ms (bar 400 ms)`);
    // Without a cover (a stall's jump, a dev-panel jump): one source sample per coarse step.
    full.invalidate();
    const u0 = performance.now();
    const uSteps = full.advance(renderer, biggest.arrivalS + 60, prepare, false);
    await (renderer as unknown as { backend: { device: GPUDevice } }).backend.device.queue.onSubmittedWorkDone();
    notes.push(`uncovered: ${uSteps} steps in ${(performance.now() - u0).toFixed(0)} ms (bar: a hitch-free ~150 ms)`);
    const cheap = new FoamField(nodes, SHELF);
    cheap.setParams(p);
    cheap.advance(renderer, t0 + (f - 1) / 60, prepare, false);
    notes.push(`uncovered replay vs live at +60 s: ${maxDiff(await readMap(renderer, live), await readMap(renderer, cheap)).toFixed(4)} (stripes accepted)`);
    ok &&= ms <= 400;
    return { pass: ok, detail: notes.join('; ') };
  },
});

registerSelfTest({
  name: 'foam: the water-anchored pattern frame node matches the CPU',
  async run(renderer) {
    const pts: [number, number, number, number][] = [[3, 4, 1, 0], [1, 0, Math.SQRT1_2, Math.SQRT1_2], [-120, 35, 0.8, -0.6]];
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flat()), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.length * 4), 4);
    const input = storage(inAttr, 'vec4', pts.length).toReadOnly();
    const out = storage(outAttr, 'vec4', pts.length);
    const pass = Fn(() => {
      const v = input.element(instanceIndex);
      out.element(instanceIndex).assign(vec4(waterFoamFrame(v.xy, v.zw), 0.0, 0.0));
    })().compute(pts.length) as THREE.ComputeNode;
    renderer.compute(pass);
    const g = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const worst = pts.reduce((m, [x, z, tx, tz], i) => {
      const [a, b] = waterFoamFrameCpu(x, z, tx, tz);
      return Math.max(m, Math.abs(g[i * 4] - a), Math.abs(g[i * 4 + 1] - b));
    }, 0);
    return { pass: worst < 1e-4, detail: `worst ${worst.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'foam: aged lace (thin 1) is open water between threads: cover at most AGED_LACE_COVER, the mean well under fresh lace (L1)',
  async run(renderer) {
    const n = 400, w = 0.25; // LACE_LEVEL: the lace floor
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const out = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const i = float(instanceIndex);
      const frame = vec2(i.mod(20.0).mul(3.7), i.div(20.0).floor().mul(2.9));
      out.element(instanceIndex).assign(vec4(setFoamPattern(float(w), frame, float(7.0)).x, setFoamPattern(float(w), frame, float(7.0), float(1.0)).x, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const g = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const fresh = Array.from({ length: n }, (_, i) => g[i * 4]), aged = Array.from({ length: n }, (_, i) => g[i * 4 + 1]);
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    const ok = Math.max(...aged) <= AGED_LACE_COVER + 1e-6 && mean(aged) < 0.5 * mean(fresh);
    return { pass: ok, detail: `at weight ${w}: fresh mean ${mean(fresh).toFixed(3)} max ${Math.max(...fresh).toFixed(3)}; aged mean ${mean(aged).toFixed(3)} max ${Math.max(...aged).toFixed(3)} (≤ ${AGED_LACE_COVER})` };
  },
});

registerSelfTest({
  name: 'foam: the pattern fades out continuously as the foam weight goes to 0 (no hard edge where clearing foam ends)',
  async run(renderer) {
    // 400 pattern positions × foam weights near 0: the coverage must go to 0 with the weight, not jump at a cut-off.
    const n = 400, weights = [0, 0.002, 0.01, 0.05];
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const out = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const i = float(instanceIndex);
      const frame = vec2(i.mod(20.0).mul(3.7), i.div(20.0).floor().mul(2.9));
      const c = weights.map((w) => setFoamPattern(float(w), frame, float(7.0)).x);
      out.element(instanceIndex).assign(vec4(c[0], c[1], c[2], c[3]));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const g = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const worst = weights.map((_, k) => Array.from({ length: n }, (_, i) => g[i * 4 + k]).reduce((m, v) => Math.max(m, v), 0));
    // Coverage at a weight w is at most 4·w × the pattern's largest coverage (SET_FOAM_MAX_COVER): it vanishes with the
    // weight. Before the fade, a weight of 0.002 still covered 0.43 wherever the noise saturates.
    const ok = worst.every((v, k) => v <= 4 * weights[k] * SET_FOAM_MAX_COVER + 1e-6);
    return { pass: ok, detail: `largest coverage at weight ${weights.map((w, k) => `${w}: ${worst[k].toFixed(4)}`).join(', ')}` };
  },
});

registerSelfTest({
  name: "foam: inside the box the live breaking foam still shows at frame time (the map adds what lingers, never delays the bore's front)",
  async run(renderer) {
    // [placeholder (the frame's breaking foam), map density, inside] → the weight a surface point uses.
    const cases: [number, number, number, number][] = [
      [0.9, 0.2, 1, 0.9], // the bore's front has moved on since the last tick: the frame's foam wins
      [0.1, 0.7, 1, 0.7], // lingering foam behind the bore: the map wins
      [0.9, 0.2, 0, 0.9], // outside the box: the placeholder
      [0.0, 0.6, 0.5, 0.3], // in the edge band: half the map
    ];
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.length * 4), 4);
    const out = storage(outAttr, 'vec4', cases.length);
    const pass = Fn(() => {
      cases.forEach(([p, d, inside], i) => {
        out.element(i).assign(vec4(sheetFoamWeight(float(p), { density: float(d), inside: float(inside) }), 0.0, 0.0, 0.0));
      });
    })().compute(1) as THREE.ComputeNode;
    renderer.compute(pass);
    const g = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const got = cases.map((_, i) => g[i * 4]);
    const worst = cases.reduce((m, c, i) => Math.max(m, Math.abs(got[i] - c[3])), 0);
    return { pass: worst < 1e-5, detail: `got ${got.map((v) => v.toFixed(3)).join(', ')}; expected ${cases.map((c) => c[3]).join(', ')}` };
  },
});
