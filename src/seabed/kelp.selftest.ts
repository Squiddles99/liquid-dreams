import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, uniform, vec2, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { FoamSchedule } from '../whitewater/foamStep';
import { type KelpState, kelpSteadyLean, kelpStep } from './kelp';
import { KelpField } from './KelpField';
import { KelpMap } from './KelpMap';
import { kelpStepNode } from './kelpNodes';

registerSelfTest({
  name: 'kelp: the GPU spring step matches kelp.kelpStep',
  async run(renderer) {
    const cases: [KelpState, number, number, number][] = [];
    for (const l of [0, 0.4, 0.99]) for (const v of [-3, 0, 2]) for (const u of [0, 1.6, -4.7, 30]) for (const dt of [0.05, 0.5]) cases.push([{ lx: l, lz: -l / 2, vx: v, vz: v / 3 }, u, u / 2, dt]);
    const n = cases.length;
    const inA = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([s]) => [s.lx, s.lz, s.vx, s.vz])), 4);
    const inB = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([, ux, uz, dt]) => [ux, uz, dt, 0])), 4);
    const outA = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const a = storage(inA, 'vec4', n).toReadOnly(), b = storage(inB, 'vec4', n).toReadOnly(), o = storage(outA, 'vec4', n);
    renderer.compute(Fn(() => { const q = b.element(instanceIndex); o.element(instanceIndex).assign(kelpStepNode(a.element(instanceIndex), q.xy, q.z)); })().compute(n) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outA));
    let worst = 0;
    cases.forEach(([s, ux, uz, dt], i) => {
      const c = kelpStep(s, ux, uz, dt);
      worst = Math.max(worst, ...[c.lx, c.lz, c.vx, c.vz].map((v, j) => Math.abs(out[i * 4 + j] - v) / Math.max(1, Math.abs(v))));
    });
    return { pass: worst < 1e-3, detail: `${n} cases; worst ${worst.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'kelp: the grid keeps a cell\'s state as the window moves, and starts new cells at their steady lean',
  async run(renderer) {
    // A uniform flow along +x that the test sets per tick (stands in for ReefFlow).
    const u = uniform(new THREE.Vector2(1.6, 0));
    const flow = { flowNode: () => u } as never;
    const map = new KelpMap();
    const field = new KelpField(map, flow);
    const notes: string[] = [];
    let pass = true;
    const readCell = async (x: number, z: number): Promise<[number, number]> => {
      const outA = new THREE.StorageBufferAttribute(new Float32Array(4), 4);
      const o = storage(outA, 'vec4', 1);
      map.alpha.value = 1;
      renderer.compute(Fn(() => { o.element(instanceIndex).assign(vec4(map.leanNode(vec2(x + 0.5, z + 0.5)), 0.0, 0.0)); })().compute(1) as THREE.ComputeNode);
      const r = new Float32Array(await renderer.getArrayBufferAsync(outA));
      return [r[0], r[1]];
    };
    // From a jump: every cell at its steady lean.
    field.advance(renderer, 100, 0, 0, () => {});
    const steady = kelpSteadyLean(1.6, 0)[0];
    const [l0] = await readCell(3, 4);
    pass &&= Math.abs(l0 - steady) < 0.01;
    notes.push(`after the jump ${l0.toFixed(3)} (steady ${steady.toFixed(3)})`);
    // The flow drops to 0; step 0.15 s with the camera still, then 0.15 s with it 37 cells east: cell (3, 4) stays in the
    // window, mid-swing (a reset cell would read its steady lean, 0).
    u.value.set(0, 0);
    let s: KelpState = { lx: steady, lz: 0, vx: 0, vz: 0 };
    const k0 = Math.floor(100 * 20 + 1e-6);
    for (let k = 1; k <= 6; k++) {
      field.advance(renderer, (k0 + k) / 20, k <= 3 ? 0 : 37, 0, () => {});
      s = kelpStep(s, 0, 0, 0.05);
    }
    const [l1] = await readCell(3, 4);
    pass &&= Math.abs(l1 - s.lx) < 0.01 && Math.abs(l1) > 0.1;
    notes.push(`0.3 s after the flow stopped, across a 37-cell move ${l1.toFixed(3)} (CPU ${s.lx.toFixed(3)})`);
    // A teleport: every cell is new, so it starts at the steady lean of the flow now (Review Focus 1).
    u.value.set(0, -3);
    field.advance(renderer, (k0 + 7) / 20, 5000, -3000, () => {});
    const [, lz] = await readCell(5003, -2996);
    pass &&= Math.abs(lz - kelpSteadyLean(0, -3)[1]) < 0.01;
    notes.push(`after a teleport ${lz.toFixed(3)} (steady ${kelpSteadyLean(0, -3)[1].toFixed(3)})`);
    // A backwards step replays (Review Focus 5).
    const sch = new FoamSchedule();
    sch.planTicks(200, 80);
    pass &&= sch.planTicks(150, 80).clear;
    return { pass, detail: notes.join('; ') };
  },
});
