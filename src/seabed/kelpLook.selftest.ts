import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, length, storage, vec2, vec3, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { WEED_ALBEDO, luminance } from './bedLook';
import { KELP_HEIGHT_M } from './kelp';
import { KelpMap } from './KelpMap';
import { KELP_MIN_DOWN, kelpCanopyAlbedoNode, kelpParallaxNode, kelpWeedAlbedoNode } from './kelpLook';

async function sample(renderer: THREE.WebGPURenderer, rows: number[][], body: (q: any) => any): Promise<Float32Array> {
  const n = rows.length;
  const inA = new THREE.StorageBufferAttribute(new Float32Array(rows.flat()), 4);
  const outA = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
  const i = storage(inA, 'vec4', n).toReadOnly(), o = storage(outA, 'vec4', n);
  renderer.compute(Fn(() => { o.element(instanceIndex).assign(body(i.element(instanceIndex))); })().compute(n) as THREE.ComputeNode);
  return new Float32Array(await renderer.getArrayBufferAsync(outA));
}

registerSelfTest({
  name: 'kelp: the canopy keeps the weed\'s tone in every channel (±15%), is build A\'s weed when off, and stays bounded on level rays',
  async run(renderer) {
    const map = new KelpMap();
    const rows: number[][] = [];
    for (let x = 0; x < 40; x += 0.37) for (let z = 0; z < 40; z += 0.41) rows.push([x, z, 0, 0]);
    const notes: string[] = [];
    let pass = true;
    // The upright canopy (no lean: the map's motion off), seen straight down and along a tilted ray (parallax), channel
    // by channel: through 10–15 m of water only blue and green survive, so a luminance match alone let the canopy read
    // pale against the plain weed outside its window (2026-10-11). The leaning canopy's tone is checked by eye in Gate
    // 2's stills.
    map.on.value = 0;
    map.show.value = 1;
    for (const tilt of [0, 0.5]) {
      const out = await sample(renderer, rows, (q) => vec4(kelpWeedAlbedoNode(vec3(q.x, -6.0, q.y), vec3(tilt, -1.0, 0.0).normalize(), map), 0.0));
      const sum = [0, 0, 0];
      for (let k = 0; k < rows.length; k++) for (let c = 0; c < 3; c++) sum[c] += out[k * 4 + c];
      const ratio = sum.map((v, c) => v / rows.length / WEED_ALBEDO[c]);
      pass &&= ratio.every((r) => Math.abs(r - 1) <= 0.15);
      notes.push(`ray tilt ${tilt}: mean rgb ${ratio.map((r) => r.toFixed(3)).join('/')} × weed (luminance ${(luminance([sum[0], sum[1], sum[2]].map((v) => v / rows.length) as [number, number, number]) / luminance(WEED_ALBEDO)).toFixed(3)})`);
    }
    map.show.value = 0;
    const off = await sample(renderer, rows.slice(0, 50), (q) => vec4(kelpWeedAlbedoNode(vec3(q.x, -6.0, q.y), vec3(0.0, -1.0, 0.0), map), 0.0));
    let worstOff = 0;
    for (let k = 0; k < 50; k++) for (let c = 0; c < 3; c++) worstOff = Math.max(worstOff, Math.abs(off[k * 4 + c] - WEED_ALBEDO[c]));
    pass &&= worstOff < 1e-4;
    notes.push(`off: worst ${worstOff.toExponential(1)} from WEED_ALBEDO`);
    const dirs = [[1, 0, 0], [0.7, 0.05, 0.7], [0, 0.3, 1], [0, -1, 0]].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l, 0]; });
    const shift = await sample(renderer, dirs, (q) => vec4(length(kelpParallaxNode(q.xyz, KELP_HEIGHT_M)), 0.0, 0.0, 0.0));
    const maxShift = Math.max(...dirs.map((_, k) => shift[k * 4]));
    pass &&= Number.isFinite(maxShift) && maxShift <= KELP_HEIGHT_M / KELP_MIN_DOWN + 1e-4;
    notes.push(`level/rising rays: shift ≤ ${maxShift.toFixed(2)} m`);
    return { pass, detail: notes.join('; ') };
  },
});

registerSelfTest({
  name: 'kelp: the canopy changes a little for a little lean, through a flow reversal and over a tick, far from the origin (final review C1)',
  async run(renderer) {
    const noiseMap = new KelpMap();
    // Points 200–240 m from the origin, late in a session (sim time 1400 s): the pattern must sway, not fizz or pop.
    const rows: number[][] = [];
    for (let x = 200; x < 240; x += 0.53) for (let z = -20; z < 20; z += 0.61) rows.push([x, z, 0, 0]);
    const at = async (lx: number, time: number): Promise<number[]> => {
      const out = await sample(renderer, rows, (q) => vec4(kelpCanopyAlbedoNode(vec3(q.x, -6.0, q.y), vec3(0.0, -1.0, 0.0), vec2(lx, 0.0), float(time), float(1.0), noiseMap.noise), 0.0));
      return rows.map((_, k) => luminance([out[k * 4], out[k * 4 + 1], out[k * 4 + 2]]));
    };
    const change = (a: number[], b: number[]): number => {
      let d = 0, m = 0;
      a.forEach((v, k) => { d += Math.abs(v - b[k]); m += v; });
      return d / m;
    };
    const base = await at(0.5, 1400);
    const lean = change(base, await at(0.52, 1400));
    const flip = change(await at(0.02, 1400), await at(-0.02, 1400));
    const tick = change(base, await at(0.5, 1400.05));
    const pass = lean < 0.08 && flip < 0.08 && tick < 0.08;
    return { pass, detail: `mean relative change: lean 0.50→0.52 ${lean.toFixed(3)}; flow reversal ±0.02 ${flip.toFixed(3)}; one tick ${tick.toFixed(3)} (each < 0.08)` };
  },
});

registerSelfTest({
  name: 'kelp: the canopy is drawn only on weed inside the lean window, fading to build A’s weed at its edge; elsewhere that weed exactly (final review I3: its cost)',
  async run(renderer) {
    const map = new KelpMap(); // window centred on the origin (min −64, −64)
    const far: number[][] = [], near: number[][] = [];
    for (let k = 0; k < 64; k++) { far.push([200 + k * 0.7, 30 - k * 0.9, 1, 0]); near.push([5 + k * 0.37, -7 + k * 0.29, 1, 0]); }
    const run = (rows: number[][]) => sample(renderer, rows, (q) => vec4(kelpWeedAlbedoNode(vec3(q.x, -6.0, q.y), vec3(0.0, -1.0, 0.0), map, q.z), 0.0));
    const off = (out: Float32Array, n: number): number => {
      let worst = 0;
      for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(out[k * 4 + c] - WEED_ALBEDO[c]));
      return worst;
    };
    // Along the window's west edge (x = −64) and its north edge (z = +64), just inside: the look continues from the weed outside.
    const edge: number[][] = [];
    for (let k = 0; k < 64; k++) { edge.push([-64 + 0.02, -60 + k * 1.9, 1, 0]); edge.push([-60 + k * 1.9, 64 - 0.02, 1, 0]); }
    const farWorst = off(await run(far), far.length);
    const nearWorst = off(await run(near), near.length);
    const bare = off(await run(near.map(([x, z]) => [x, z, 0, 0])), near.length);
    const edgeWorst = off(await run(edge), edge.length);
    const pass = farWorst < 1e-6 && bare < 1e-6 && nearWorst > 0.01 && edgeWorst < 1e-3;
    return { pass, detail: `beyond the window: worst ${farWorst.toExponential(1)} from WEED_ALBEDO; no weed: ${bare.toExponential(1)}; inside on weed: ${nearWorst.toFixed(3)} (the canopy); at the window's edge: ${edgeWorst.toExponential(1)}` };
  },
});
