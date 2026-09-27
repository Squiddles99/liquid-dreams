import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, storage, uniform, vec4 } from 'three/tsl';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { type BreakParams, DEFAULT_BREAK_PARAMS, normalizeBreakParams } from './breaking';
import { type ReefField, computeReefField, sampleField } from './reefField';
import { SetWaves } from './SetWaves';
import { type BreakOptions, sumWaves, sumWavesWithNormal, toActiveWave } from './setWaveModel';

// Inside the reef grid, the inflow far field (west, south) and the outflow edge continuation (east, north).
const POINTS: [number, number][] = [
  [0, 0], [-20, 30], [-30, -60], [25, 28], [50, -110], [-300, 100], [150, -300], [-800, 50], [0, 600], [300, 0], [50, -600],
];

function readPass(n: number, body: (xz: any) => [any, any]) {
  const inAttr = new THREE.StorageBufferAttribute(new Float32Array(POINTS.flatMap(([x, z]) => [x, z, 0, 0])), 4);
  const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 8), 4);
  const input = storage(inAttr, 'vec4', n).toReadOnly();
  const output = storage(outAttr, 'vec4', n * 2);
  const pass = Fn(() => {
    const [a, b] = body(input.element(instanceIndex).xy);
    output.element(instanceIndex.mul(2)).assign(a);
    output.element(instanceIndex.mul(2).add(1)).assign(b);
  })().compute(n) as THREE.ComputeNode;
  return { pass, outAttr };
}

let shared: { field: ReturnType<typeof computeReefField> } | null = null;
const getField = () => (shared ??= { field: computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 }) }).field;

registerSelfTest({
  name: 'breaker: GPU field sampling matches the CPU field (inside and far field)',
  async run(renderer) {
    const field = getField();
    const sets = new SetWaves(uniform(0));
    sets.setField(field);
    const { pass, outAttr } = readPass(POINTS.length, (xz) => {
      const s = sets.sample(xz);
      return [vec4(s.tau, s.amp, s.hmin, s.k), vec4(s.dir.x, s.dir.y, s.depth, 0.0)];
    });
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const notes: string[] = [];
    POINTS.forEach(([x, z], i) => {
      const c = sampleField(field, x, z);
      const g = out.slice(i * 8, i * 8 + 8);
      const errs = [g[0] - c.tau, g[1] - c.amp, g[2] - c.hmin, (g[3] - c.k) * 100, g[4] - c.dirX, g[5] - c.dirZ, g[6] - c.depth].map(Math.abs);
      const e = Math.max(...errs);
      worst = Math.max(worst, e);
      notes.push(`(${x},${z}) τ ${g[0].toFixed(2)}/${c.tau.toFixed(2)} amp ${g[1].toFixed(2)}/${c.amp.toFixed(2)}`);
    });
    return { pass: worst < 0.02, detail: `worst ${worst.toFixed(4)}; ${notes.join('; ')}` };
  },
});

registerSelfTest({
  name: 'breaker: GPU set-wave height, displacement and slope match the CPU model',
  async run(renderer) {
    const field = getField();
    const t = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)[2].arrivalS;
    const events = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
    const sets = new SetWaves(uniform(t));
    sets.setField(field);
    sets.setEvents(events);
    sets.setBreakParams({ ...DEFAULT_BREAK_PARAMS, enabled: false });
    const { pass, outAttr } = readPass(POINTS.length, (xz) => {
      const d = sets.displacementNode(xz), s = sets.slopeNode(xz);
      return [vec4(d, 0.0), vec4(s, 0.0, 0.0)];
    });
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const waves = events.map(toActiveWave);
    let worst = 0;
    const notes: string[] = [];
    POINTS.forEach(([x, z], i) => {
      const c = sumWaves(x, z, t, sampleField(field, x, z), waves, ctx);
      const g = out.slice(i * 8, i * 8 + 8);
      const e = Math.max(Math.abs(g[0] - c.dx), Math.abs(g[1] - c.eta), Math.abs(g[2] - c.dz), Math.abs(g[4] - c.slopeX) * 4, Math.abs(g[5] - c.slopeZ) * 4);
      worst = Math.max(worst, e);
      notes.push(`(${x},${z}) η ${g[1].toFixed(3)}/${c.eta.toFixed(3)}`);
    });
    return { pass: worst < 0.02, detail: `${events.length} waves; worst ${worst.toFixed(4)}; ${notes.join('; ')}` };
  },
});

/** One compute pass over arbitrary points, `perPoint` vec4 outputs each (body runs inside the pass's Fn). */
function computeAt(points: [number, number][], perPoint: number, body: (xz: any) => any[]) {
  const n = points.length;
  const inAttr = new THREE.StorageBufferAttribute(new Float32Array(points.flatMap(([x, z]) => [x, z, 0, 0])), 4);
  const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * perPoint * 4), 4);
  const input = storage(inAttr, 'vec4', n).toReadOnly();
  const output = storage(outAttr, 'vec4', n * perPoint);
  const pass = Fn(() => {
    const outs = body(input.element(instanceIndex).xy);
    outs.forEach((v, k) => output.element(instanceIndex.mul(perPoint).add(k)).assign(v));
  })().compute(n) as THREE.ComputeNode;
  return { pass, outAttr };
}

/** Points on the ray through the peak, from 8 m seaward to 16 m shoreward, every 2 m (where the biggest wave barrels). */
function peakRay(field: ReefField): [number, number][] {
  let x = 0, z = 0;
  for (let d = 0; d < 8; d += 0.5) { const s = sampleField(field, x, z); x -= s.dirX * 0.5; z -= s.dirZ * 0.5; }
  const out: [number, number][] = [];
  for (let d = 0; d <= 24 + 1e-9; d += 0.5) {
    if (Math.abs(d % 2) < 1e-9) out.push([x, z]);
    const s = sampleField(field, x, z); x += s.dirX * 0.5; z += s.dirZ * 0.5;
  }
  return out;
}

/**
 * Off the peak ray: just shoreward of the peak where the rays turn (the old crest-lookup seams, x 18–30), on the north
 * ledge 30 m up the peel, and on the south ledge (the closeout).
 */
const OFF_RAY: [number, number][] = [[20, -6], [27, -6.5], [30, -9], [10.3, -28.2], [12.5, 14], [42.5, 33]];

/** The biggest wave of the default set 1, and the times after its arrival at the peak that the break tests read (0.6
 * and 0.9 s catch the lip landing: foam between 0 and 1). */
const REF_BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const BREAK_DTS = [0, 0.3, 0.6, 0.9, 1.2, 4];

/** A non-default shape, so every break uniform is exercised away from its default (normalized, as the GPU uploads). */
const ALT_BREAK_PARAMS: BreakParams = (() => {
  const p = { ...DEFAULT_BREAK_PARAMS, gamma: 0.7, stageSpan: 1.4, thetaMaxDeg: 130, lipZone: 0.3, lipBackReach: 0.9, beta: 0.5, collapseStart: 0.7 };
  normalizeBreakParams(p);
  return p;
})();
const EPS = 0.25;
const f3 = (v: number): string => v.toFixed(3);

/** Tracks the worst value of one comparison, with the dt and point it came from. */
class Worst {
  value: number;
  at = '';
  constructor(private readonly larger: boolean, start: number) { this.value = start; }
  see(v: number, dt: number, i: number): void {
    if (this.larger ? v > this.value : v < this.value) { this.value = v; this.at = `dt ${dt} #${i}`; }
  }
  toString(): string { return `${this.value.toFixed(4)} (${this.at || 'none'})`; }
}

registerSelfTest({
  name: 'breaker: GPU breaking surface matches the CPU (drain, tube, collapse: displacement, normal, foam, lip, stage)',
  async run(renderer) {
    const field = getField();
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    const points = [...peakRay(field), ...OFF_RAY];
    const { pass, outAttr } = computeAt(points, 3, (xz) => {
      const b = sets.breakSampleNode(xz, float(EPS));
      return [vec4(b.disp, b.foam), vec4(b.normal, b.lip), vec4(b.stage, 0.0, 0.0, 0.0)];
    });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const disp = new Worst(true, 0), foam = new Worst(true, 0), lip = new Worst(true, 0), stage = new Worst(true, 0), dotN = new Worst(false, 1);
    const tables: string[] = [];
    // Samples where the CPU foam is strictly between 0 and 1 (the landing window), per param set: the foam terms compared.
    const partialFoam: number[] = [];
    for (const [setName, params] of [['default', DEFAULT_BREAK_PARAMS], ['alt', ALT_BREAK_PARAMS]] as const) {
      sets.setBreakParams(params);
      const o: BreakOptions = { sample: (x, z) => sampleField(field, x, z), params, includeCurl: true };
      let partial = 0;
      for (const dt of BREAK_DTS) {
        const t = REF_BIGGEST.arrivalS + dt;
        time.value = t;
        const events = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
        sets.setEvents(events);
        renderer.compute(pass);
        const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
        const waves = events.map(toActiveWave);
        const rows: string[] = [];
        points.forEach(([x, z], i) => {
          const c = sumWavesWithNormal(x, z, t, sampleField(field, x, z), waves, ctx, o, EPS);
          const g = out.slice(i * 12, i * 12 + 12);
          const gd = [g[0], g[1], g[2]], cd = [c.dx, c.eta, c.dz];
          const d = Math.max(...gd.map((v, k) => Math.abs(v - cd[k])));
          const nDot = g[4] * c.normal[0] + g[5] * c.normal[1] + g[6] * c.normal[2];
          disp.see(d, dt, i); foam.see(Math.abs(g[3] - c.foam), dt, i); lip.see(Math.abs(g[7] - c.lip), dt, i);
          stage.see(Math.abs(g[8] - c.stage), dt, i); dotN.see(nDot, dt, i);
          if (c.foam > 0.05 && c.foam < 0.95) partial++;
          rows.push(
            `#${i} (${x.toFixed(1)},${z.toFixed(1)}) GPU/CPU d ${gd.map(f3).join(',')}/${cd.map(f3).join(',')} n.y ${f3(g[5])}/${f3(c.normal[1])} ` +
            `n·n ${nDot.toFixed(4)} foam ${f3(g[3])}/${f3(c.foam)} lip ${f3(g[7])}/${f3(c.lip)} stage ${f3(g[8])}/${f3(c.stage)}`,
          );
        });
        tables.push(`${setName} dt ${dt}: ${rows.join('; ')}`);
      }
      partialFoam.push(partial);
    }
    for (const line of tables) console.log(`[selftest]   breaking ${line}`);
    const ok = disp.value < 0.05 && foam.value < 0.05 && lip.value < 0.05 && dotN.value > 0.99 && stage.value < 0.02 && partialFoam.every((n) => n > 0);
    return {
      pass: ok,
      detail: `${points.length} points × dt ${BREAK_DTS.join('/')} s × default and alt params; worst |Δdisp| ${disp} m; |Δfoam| ${foam}; ` +
        `|Δlip| ${lip}; min n·n ${dotN}; |Δstage| ${stage}; samples with 0.05 < foam < 0.95 (default/alt) ${partialFoam.join('/')}` +
        `${ok ? '' : `. Per point (GPU/CPU): ${tables.join(' || ')}`}`,
    };
  },
});

registerSelfTest({
  name: 'breaker: the probe path has the drain and the bore but no curl, and matches the CPU',
  async run(renderer) {
    const field = getField();
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    sets.setBreakParams(DEFAULT_BREAK_PARAMS);
    const points = [...peakRay(field), ...OFF_RAY];
    const { pass, outAttr } = computeAt(points, 1, (xz) => [vec4(sets.displacementNode(xz), 0.0)]);
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const o: BreakOptions = { sample: (x, z) => sampleField(field, x, z), params: DEFAULT_BREAK_PARAMS, includeCurl: false };
    const disp = new Worst(true, 0);
    let cpuLip = 0, drained = 0;
    const tables: string[] = [];
    for (const dt of BREAK_DTS) {
      const t = REF_BIGGEST.arrivalS + dt;
      time.value = t;
      const events = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
      sets.setEvents(events);
      renderer.compute(pass);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      const waves = events.map(toActiveWave);
      const rows: string[] = [];
      points.forEach(([x, z], i) => {
        const f = sampleField(field, x, z);
        const c = sumWaves(x, z, t, f, waves, ctx, o);
        const unbroken = sumWaves(x, z, t, f, waves, ctx);
        const g = out.slice(i * 4, i * 4 + 4);
        const gd = [g[0], g[1], g[2]], cd = [c.dx, c.eta, c.dz];
        disp.see(Math.max(...gd.map((v, k) => Math.abs(v - cd[k]))), dt, i);
        cpuLip = Math.max(cpuLip, c.lip);
        drained = Math.max(drained, Math.abs(c.eta - unbroken.eta));
        rows.push(`#${i} (${x.toFixed(1)},${z.toFixed(1)}) GPU/CPU d ${gd.map(f3).join(',')}/${cd.map(f3).join(',')} (Phase 1 η ${f3(unbroken.eta)})`);
      });
      tables.push(`dt ${dt}: ${rows.join('; ')}`);
    }
    for (const line of tables) console.log(`[selftest]   probe ${line}`);
    // The drain and the bore must actually be there (the probe reads them): at least 5 cm off Phase 1 somewhere.
    const ok = disp.value < 0.05 && cpuLip === 0 && drained > 0.05;
    return {
      pass: ok,
      detail: `${points.length} points × dt ${BREAK_DTS.join('/')} s; worst |Δdisp| ${disp} m; CPU probe max lip ${cpuLip}; ` +
        `largest drain/bore change from Phase 1 ${drained.toFixed(3)} m${ok ? '' : `. Per point: ${tables.join(' || ')}`}`,
    };
  },
});
