import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, storage, uniform, vec2, vec4 } from 'three/tsl';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { type BreakParams, DEFAULT_BREAK_PARAMS, normalizeBreakParams, onsetPsi } from './breaking';
import { type ReefField, computeReefField, sampleField, sampleOnset } from './reefField';
import { SetWaves } from './SetWaves';
import { type BreakOptions, breakOptions, sumWaves, toActiveWave } from './setWaveModel';
import { churnHeightNode, churnSlopeNode } from '../whitewater/pileChurn';

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
  name: 'breaker: GPU field sampling matches the CPU field (inside and far field, the breaking depth included)',
  async run(renderer) {
    const field = getField();
    const sets = new SetWaves(uniform(0));
    sets.setField(field);
    const { pass, outAttr } = readPass(POINTS.length, (xz) => {
      const s = sets.sample(xz);
      return [vec4(s.tau, s.amp, s.hmin, s.k), vec4(s.dir.x, s.dir.y, s.depth, s.hminBreak)];
    });
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const notes: string[] = [];
    POINTS.forEach(([x, z], i) => {
      const c = sampleField(field, x, z);
      const g = out.slice(i * 8, i * 8 + 8);
      // The breaking depth runs to ~100 m over the far field's deep water: compared relative to its size there.
      const errs = [g[0] - c.tau, g[1] - c.amp, g[2] - c.hmin, (g[3] - c.k) * 100, g[4] - c.dirX, g[5] - c.dirZ, g[6] - c.depth,
        (g[7] - c.hminBreak) / Math.max(1, c.hminBreak / 10)].map(Math.abs);
      const e = Math.max(...errs);
      worst = Math.max(worst, e);
      notes.push(`(${x},${z}) τ ${g[0].toFixed(2)}/${c.tau.toFixed(2)} amp ${g[1].toFixed(2)}/${c.amp.toFixed(2)} depth ${g[7].toFixed(2)}/${c.hminBreak.toFixed(2)}`);
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


registerSelfTest({
  name: 'breaker: long-tail waves match the CPU (Gaussian behind the crest only; flag packed with can-break, breaking on)',
  async run(renderer) {
    const field = getField();
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    sets.setBreakParams(DEFAULT_BREAK_PARAMS);
    const points = [...peakRay(field), ...OFF_RAY, ...AROUND_PEAK];
    const { pass, outAttr } = computeAt(points, 2, (xz) => {
      const b = sets.breakSampleNode(xz);
      return [vec4(b.disp, b.foam), vec4(b.stage, 0.0, 0.0, 0.0)];
    });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const o: BreakOptions = breakOptions(field, DEFAULT_BREAK_PARAMS);
    const disp = new Worst(true, 0), stage = new Worst(true, 0);
    let flagsOk = true, tails = 0, breakers = 0;
    // Before, at and after the biggest wave: points both ahead of crests (tight side) and behind them (Gaussian side).
    for (const dt of [-8, 0, 1.2, 8]) {
      const t = REF_BIGGEST.arrivalS + dt;
      time.value = t;
      const events = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).map((e, i) => ({ ...e, longTail: i % 2 === 0 }));
      sets.setEvents(events);
      events.forEach((e, i) => {
        if (sets.longTailFlag(i) !== (e.longTail ? 1 : 0)) flagsOk = false;
        if (e.longTail) tails++;
        if (e.longTail && sets.canBreakFlag(i) === 1) breakers++;
      });
      renderer.compute(pass);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      const waves = events.map(toActiveWave);
      points.forEach(([x, z], i) => {
        const c = sumWaves(x, z, t, sampleField(field, x, z), waves, ctx, o);
        const g = out.slice(i * 8, i * 8 + 8);
        disp.see(Math.max(Math.abs(g[0] - c.dx), Math.abs(g[1] - c.eta), Math.abs(g[2] - c.dz)), dt, i);
        stage.see(Math.abs(g[4] - c.stage), dt, i);
      });
    }
    const ok = disp.value < 0.05 && stage.value < 0.02 && flagsOk && tails > 0 && breakers > 0;
    return {
      pass: ok,
      detail: `${points.length} points × dt −8/0/1.2/8 s, every other wave a long tail (${tails} slots, ${breakers} also flagged can-break); ` +
        `flags read back ${flagsOk ? 'ok' : 'WRONG'}; worst |Δdisp| ${disp} m; |Δstage| ${stage}`,
    };
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

/** Where the pile rolls: 20–70 m shoreward of the peak along its ray, every 5 m, and one point off the record grid. */
function pileRay(field: ReefField): [number, number][] {
  let x = 0, z = 0;
  const out: [number, number][] = [];
  for (let d = 0; d <= 70 + 1e-9; d += 0.5) {
    if (d >= 20 && Math.abs(d % 5) < 1e-9) out.push([x, z]);
    const s = sampleField(field, x, z); x += s.dirX * 0.5; z += s.dirZ * 0.5;
  }
  out.push([field.grid.x0 - 30, 0]);
  return out;
}

/** 64 points around the peak: an 8 × 8 grid 4 m apart, from −14 to +14 m in x and z. */
const AROUND_PEAK: [number, number][] = Array.from({ length: 64 }, (_, i) => [-14 + 4 * (i % 8), -14 + 4 * Math.floor(i / 8)]);

/** The biggest wave of the default set 1, and the times after its arrival at the peak that the break tests read (1.8
 * and 2.4 s catch the whitewater rising as the section settles: foam between 0 and 1). */
const REF_BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const BREAK_DTS = [0, 0.3, 0.6, 0.9, 1.2, 1.8, 2.4, 4, 7];

/** A non-default shape, so every break uniform the sheet reads is exercised away from its default (normalized, as the GPU uploads). */
const ALT_BREAK_PARAMS: BreakParams = (() => {
  const p = { ...DEFAULT_BREAK_PARAMS, gamma: 0.7, stageSpan: 0.6, beta: 0.5, collapseStart: 0.2, faceWidth: 0.7, ribbonOnset: 0.45, troughDrain: 0.5, drainEnd: 0.3, pileHalfM: 30, pileSurge: 0.15 };
  normalizeBreakParams(p);
  return p;
})();
/** The game rules on ψ away from their defaults: the random dial (each wave's own draw) and the nudge. */
const DIAL_BREAK_PARAMS: BreakParams = { ...DEFAULT_BREAK_PARAMS, randomDial: 0.15, psiNudge: 0.2 };
const PARAM_SETS = [['default', DEFAULT_BREAK_PARAMS], ['alt', ALT_BREAK_PARAMS], ['dial', DIAL_BREAK_PARAMS]] as const;
const f3 = (v: number): string => v.toFixed(3);

/** Tracks the worst value of one comparison, with the dt and point it came from. */
class Worst {
  value: number;
  at = '';
  constructor(private readonly larger: boolean, start: number) { this.value = start; }
  see(v: number, dt: number, i: number, tag = ''): void {
    if (this.larger ? v > this.value : v < this.value) { this.value = v; this.at = `${tag}dt ${dt} #${i}`; }
  }
  toString(): string { return `${this.value.toFixed(4)} (${this.at || 'none'})`; }
}

registerSelfTest({
  name: 'breaker: GPU breaking sheet matches the CPU (sharpening, drain, collapse, whitewater pile: displacement, foam, stage)',
  async run(renderer) {
    const field = getField();
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    const points = [...peakRay(field), ...OFF_RAY, ...pileRay(field)];
    const { pass, outAttr } = computeAt(points, 2, (xz) => {
      const b = sets.breakSampleNode(xz);
      return [vec4(b.disp, b.foam), vec4(b.stage, b.pile, 0.0, 0.0)];
    });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const disp = new Worst(true, 0), foam = new Worst(true, 0), stage = new Worst(true, 0), pile = new Worst(true, 0);
    let pileSamples = 0;
    const tables: string[] = [];
    // Samples where the CPU foam is strictly between 0 and 1 (the landing window), per param set: the foam terms compared.
    const partialFoam: number[] = [];
    for (const [setName, params] of PARAM_SETS) {
      sets.setBreakParams(params);
      const o: BreakOptions = breakOptions(field, params);
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
          const c = sumWaves(x, z, t, sampleField(field, x, z), waves, ctx, o);
          const g = out.slice(i * 8, i * 8 + 8);
          const gd = [g[0], g[1], g[2]], cd = [c.dx, c.eta, c.dz];
          disp.see(Math.max(...gd.map((v, k) => Math.abs(v - cd[k]))), dt, i, `${setName} `);
          foam.see(Math.abs(g[3] - c.foam), dt, i, `${setName} `);
          stage.see(Math.abs(g[4] - c.stage), dt, i, `${setName} `);
          pile.see(Math.abs(g[5] - c.pile), dt, i, `${setName} `);
          if (c.pile > 0.3) pileSamples++;
          if (c.foam > 0.05 && c.foam < 0.95) partial++;
          rows.push(`#${i} (${x.toFixed(1)},${z.toFixed(1)}) GPU/CPU d ${gd.map(f3).join(',')}/${cd.map(f3).join(',')} foam ${f3(g[3])}/${f3(c.foam)} stage ${f3(g[4])}/${f3(c.stage)} pile ${f3(g[5])}/${f3(c.pile)}`);
        });
        tables.push(`${setName} dt ${dt}: ${rows.join('; ')}`);
      }
      partialFoam.push(partial);
    }
    for (const line of tables) console.log(`[selftest]   sheet ${line}`);
    const ok = disp.value < 0.05 && foam.value < 0.05 && stage.value < 0.02 && pile.value < 0.05 && pileSamples > 0 && partialFoam.every((n) => n > 0);
    return {
      pass: ok,
      detail: `${points.length} points × dt ${BREAK_DTS.join('/')} s × default and alt params; worst |Δdisp| ${disp} m; |Δfoam| ${foam}; ` +
        `|Δstage| ${stage}; |Δpile| ${pile} m (${pileSamples} samples with pile > 0.3 m); samples with 0.05 < foam < 0.95 (default/alt) ${partialFoam.join('/')}${ok ? '' : `. Per point (GPU/CPU): ${tables.join(' || ')}`}`,
    };
  },
});

registerSelfTest({
  name: 'breaker: GPU slope with breaking matches the CPU',
  async run(renderer) {
    const field = getField();
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    const points = [...peakRay(field), ...OFF_RAY, ...AROUND_PEAK];
    const { pass, outAttr } = computeAt(points, 1, (xz) => [vec4(sets.slopeNode(xz), 0.0, 0.0)]);
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    // Each component within 2e-3 absolute or 2% of the CPU's, whichever is looser: `excess` > 0 is a failure.
    const excess = new Worst(true, -Infinity);
    let breakingPart = 0;
    const tables: string[] = [];
    for (const [setName, params] of PARAM_SETS) {
      sets.setBreakParams(params);
      const o: BreakOptions = breakOptions(field, params);
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
          const c = sumWaves(x, z, t, f, waves, ctx, o), unbroken = sumWaves(x, z, t, f, waves, ctx);
          const g = out.slice(i * 4, i * 4 + 2);
          const e = Math.max(...[[g[0], c.slopeX], [g[1], c.slopeZ]].map(([gv, cv]) => Math.abs(gv - cv) - Math.max(2e-3, 0.02 * Math.abs(cv))));
          excess.see(e, dt, i, `${setName} `);
          breakingPart = Math.max(breakingPart, Math.abs(c.slopeX - unbroken.slopeX), Math.abs(c.slopeZ - unbroken.slopeZ));
          rows.push(`#${i} (${x.toFixed(1)},${z.toFixed(1)}) GPU/CPU slope ${f3(g[0])},${f3(g[1])}/${f3(c.slopeX)},${f3(c.slopeZ)} (Phase 1 ${f3(unbroken.slopeX)},${f3(unbroken.slopeZ)})`);
        });
        tables.push(`${setName} dt ${dt}: ${rows.join('; ')}`);
      }
    }
    for (const line of tables) console.log(`[selftest]   slope ${line}`);
    // The breaking part of the slope must actually be there: at least 0.05 off Phase 1's somewhere.
    const ok = excess.value <= 0 && breakingPart > 0.05;
    return {
      pass: ok,
      detail: `${points.length} points × dt ${BREAK_DTS.join('/')} s × default and alt params; worst excess over max(2e-3, 2%) ${excess}; ` +
        `largest breaking change to the CPU slope ${breakingPart.toFixed(3)}${ok ? '' : `. Per point: ${tables.join(' || ')}`}`,
    };
  },
});

registerSelfTest({
  name: "breaker: the rendered sheet is the probe's surface",
  async run(renderer) {
    const field = getField();
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    sets.setBreakParams(DEFAULT_BREAK_PARAMS);
    const points = [...POINTS, ...AROUND_PEAK];
    const { pass, outAttr } = computeAt(points, 2, (xz) => [vec4(sets.breakSampleNode(xz).disp, 0.0), vec4(sets.displacementNode(xz), 0.0)]);
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const o: BreakOptions = breakOptions(field, DEFAULT_BREAK_PARAMS);
    const gap = new Worst(true, 0);
    let breaking = 0;
    for (const dt of BREAK_DTS) {
      const t = REF_BIGGEST.arrivalS + dt;
      time.value = t;
      const events = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
      sets.setEvents(events);
      renderer.compute(pass);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      const waves = events.map(toActiveWave);
      points.forEach(([x, z], i) => {
        const g = out.slice(i * 8, i * 8 + 8);
        gap.see(Math.max(Math.abs(g[0] - g[4]), Math.abs(g[1] - g[5]), Math.abs(g[2] - g[6])), dt, i);
        const f = sampleField(field, x, z);
        breaking = Math.max(breaking, Math.abs(sumWaves(x, z, t, f, waves, ctx, o).eta - sumWaves(x, z, t, f, waves, ctx).eta));
      });
    }
    // The points must see the break (at least 5 cm off Phase 1 somewhere), or the comparison proves nothing.
    const ok = gap.value <= 1e-5 && breaking > 0.05;
    return {
      pass: ok,
      detail: `${points.length} points × dt ${BREAK_DTS.join('/')} s; worst |render − probe| ${gap.value.toExponential(2)} m (${gap.at || 'none'}); ` +
        `largest CPU breaking change from Phase 1 ${breaking.toFixed(3)} m`,
    };
  },
});

registerSelfTest({
  name: 'breaker: the probe path (the sheet) matches the CPU, with the sharpening, drain and bore in it',
  async run(renderer) {
    const field = getField();
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    sets.setBreakParams(DEFAULT_BREAK_PARAMS);
    const points = [...peakRay(field), ...OFF_RAY];
    const { pass, outAttr } = computeAt(points, 1, (xz) => [vec4(sets.displacementNode(xz), 0.0)]);
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const o: BreakOptions = breakOptions(field, DEFAULT_BREAK_PARAMS);
    const disp = new Worst(true, 0);
    let drained = 0;
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
        drained = Math.max(drained, Math.abs(c.eta - unbroken.eta));
        rows.push(`#${i} (${x.toFixed(1)},${z.toFixed(1)}) GPU/CPU d ${gd.map(f3).join(',')}/${cd.map(f3).join(',')} (Phase 1 η ${f3(unbroken.eta)})`);
      });
      tables.push(`dt ${dt}: ${rows.join('; ')}`);
    }
    for (const line of tables) console.log(`[selftest]   probe ${line}`);
    // The sharpening, the drain and the bore must actually be there (the probe reads them): at least 5 cm off Phase 1 somewhere.
    const ok = disp.value < 0.05 && drained > 0.05;
    return {
      pass: ok,
      detail: `${points.length} points × dt ${BREAK_DTS.join('/')} s; worst |Δdisp| ${disp} m; ` +
        `largest sharpening/drain/bore change from Phase 1 ${drained.toFixed(3)} m${ok ? '' : `. Per point: ${tables.join(' || ')}`}`,
    };
  },
});

registerSelfTest({
  name: "breaker: the pile's churn is bounded by churnSize × pile, zero off the pile, and its slope is finite",
  async run(renderer) {
    const time = uniform(3.7);
    const u = { churnSize: uniform(0.2), churnSpeed: uniform(1) };
    const piles = [0, 0.5, 2];
    const frames: [number, number][] = Array.from({ length: 40 }, (_, i) => [-12 + 0.61 * i, 7 - 0.37 * i]);
    let worstOver = -Infinity, nonZero = 0, zeroOff = true, finite = true;
    for (const pile of piles) {
      const { pass, outAttr } = computeAt(frames, 1, (frame) => {
        const h = churnHeightNode(float(pile), frame, time, u);
        const s = churnSlopeNode(float(pile), frame, vec2(0.6, 0.8), time, u);
        return [vec4(h, s.x, s.y, 0.0)];
      });
      renderer.compute(pass);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      frames.forEach((_, i) => {
        const [h, sx, sz] = out.slice(i * 4, i * 4 + 3);
        worstOver = Math.max(worstOver, Math.abs(h) - 0.5 * 0.2 * pile);
        if (pile === 0 && h !== 0) zeroOff = false;
        if (pile > 0 && Math.abs(h) > 0.02 * pile) nonZero++;
        if (![h, sx, sz].every(Number.isFinite)) finite = false;
      });
    }
    const ok = worstOver <= 1e-5 && zeroOff && finite && nonZero > 20;
    return { pass: ok, detail: `worst |h| over its bound ${worstOver.toExponential(2)} m; zero off the pile ${zeroOff}; finite ${finite}; lumps > 2% of the pile ${nonZero}/80` };
  },
});

registerSelfTest({
  name: 'breaker: GPU onset psi0 matches the CPU (the pair texture, level interpolation)',
  async run(renderer) {
    const field = getField();
    const sets = new SetWaves(uniform(0));
    sets.setField(field);
    // Where the waves break on the softened ramp too: the peak's ray 150 m seaward.
    const seaward: [number, number][] = [];
    { let x = 0, z = 0; for (let d = 0; d <= 150; d += 0.5) { if (Math.abs(d % 10) < 1e-9) seaward.push([x, z]); const s = sampleField(field, x, z); x -= s.dirX * 0.5; z -= s.dirZ * 0.5; } }
    const points = [...peakRay(field), ...OFF_RAY, ...seaward];
    let worst = 0, at = '';
    for (const h of [REF_BIGGEST.heightM, 2 * REF_BIGGEST.heightM, 4.5]) {
      const { pass, outAttr } = computeAt(points, 1, (xz) => [vec4(sets.onsetPsiAt(xz, float(h)), 0.0, 0.0, 0.0)]);
      renderer.compute(pass);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      points.forEach(([x, z], i) => {
        const rec = sampleOnset(field, x, z);
        if (!rec) return;
        const d = Math.abs(out[i * 4] - onsetPsi(rec, 0, h, DEFAULT_BREAK_PARAMS));
        if (d > worst) { worst = d; at = `h ${h.toFixed(2)} (${x.toFixed(1)}, ${z.toFixed(1)}) GPU ${out[i * 4].toFixed(5)}`; }
      });
    }
    return { pass: worst < 1e-4, detail: `${points.length} points × 3 heights; worst |Δψ₀| ${worst.toExponential(2)} ${at}` };
  },
});

registerSelfTest({
  name: "breaker: at the reef grid's edge the GPU sheet eases the crest's ψ to PSI_NORMAL as the CPU does (12 ft)",
  async run(renderer) {
    const field = getField(), g = field.grid;
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    sets.setBreakParams(DEFAULT_BREAK_PARAMS);
    // Just inside the north and south edges, where the reef record's ψ is far from PSI_NORMAL (final review I2).
    const z1 = g.z0 + (g.nz - 1) * g.cellM, points: [number, number][] = [];
    for (let x = 80; x <= 230; x += 30) for (const d of [2, 8, 15, 22]) points.push([x, z1 - d], [x, g.z0 + d]);
    const { pass, outAttr } = computeAt(points, 2, (xz) => {
      const b = sets.breakSampleNode(xz);
      return [vec4(b.disp, b.foam), vec4(b.stage, b.pile, 0.0, 0.0)];
    });
    const c12 = cloneConditions(DEFAULT_CONDITIONS);
    c12.swell.sizeFt = 12;
    const big = wavesOfSet(1, c12, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const o: BreakOptions = breakOptions(field, DEFAULT_BREAK_PARAMS);
    const disp = new Worst(true, 0), stage = new Worst(true, 0);
    let breaking = 0, stageAt = '';
    for (let dt = -40; dt <= 40; dt += 4) {
      const t = big.arrivalS + dt;
      time.value = t;
      const events = wavesNear(t, c12, DEFAULT_SET_PARAMS);
      sets.setEvents(events);
      renderer.compute(pass);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      const waves = events.map(toActiveWave);
      points.forEach(([x, z], i) => {
        const c = sumWaves(x, z, t, sampleField(field, x, z), waves, ctx, o);
        const gg = out.slice(i * 8, i * 8 + 8);
        disp.see(Math.max(Math.abs(gg[0] - c.dx), Math.abs(gg[1] - c.eta), Math.abs(gg[2] - c.dz)), dt, i, '');
        if (Math.abs(gg[4] - c.stage) > stage.value) stageAt = `(${x}, ${z.toFixed(1)}) dt ${dt}: GPU stage ${gg[4].toFixed(3)} foam ${gg[3].toFixed(3)} pile ${gg[5].toFixed(3)}; CPU stage ${c.stage.toFixed(3)} foam ${c.foam.toFixed(3)} pile ${c.pile.toFixed(3)}`;
        stage.see(Math.abs(gg[4] - c.stage), dt, i, '');
        if (c.stage > 0.1) breaking++;
      });
    }
    // The ψ's fade shows in the displacement (the sheet's shape), and the reported stage agrees too: a wave past its
    // envelope cutoff reports none on either side (setWaveModel.beyondEnvelope), though its crest lookup, 60 m on, lands
    // on a broken crest (before, the CPU reported it: stage 1.000 against the GPU's 0.432 at (140, 297.3), dt +20 s).
    const ok = breaking > 0 && disp.value < 0.05 && stage.value < 0.02;
    return { pass: ok, detail: `${points.length} points within 22 m of the grid's north and south edges × dt −40…40 s (12 ft); ${breaking} breaking samples (> 0); worst |Δdisp| ${disp} m (< 0.05); worst |Δstage| ${stage} (< 0.02) [${stageAt}]` };
  },
});
