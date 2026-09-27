import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, int, storage, uniform, vec3, vec4 } from 'three/tsl';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { OceanSimulation } from '../ocean/OceanSimulation';
import { WaterSurfaceModel } from '../ocean/waterSurface';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { BreakingRibbon, type RibbonSurface, SKIRT_DEPTH_M, VERTS_PER_STATION, modelRibbonSurface } from './BreakingRibbon';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { type Station, type StationEntry, minRibbonHeight, traceStations } from './crestTrace';
import { PROFILE_SAMPLES, SEGMENT_ID, type Vec2, buildProfile } from './lipProfile';
import { FRAME_LAYOUT, FRAME_VEC4S, SEGMENT_OF_SAMPLE, packFrameCpu } from './lipProfileNodes';
import { type ReefField, computeReefField, sampleField } from './reefField';
import { SetWaves } from './SetWaves';
import { type ActiveWave, type BreakOptions, type SetWaveResult, type WaveContext, fieldBreakingHeight, sumWaves, toActiveWave } from './setWaveModel';

const P = DEFAULT_BREAK_PARAMS;
const V = VERTS_PER_STATION;
const LAST = PROFILE_SAMPLES - 1;
/** The default lineup camera (referenceMoments.DEFAULT_LINEUP_POSITION). */
const LINEUP = new THREE.Vector3(-25, 0.8, 45);
/** The biggest wave of the default set 1 (as breaker.selftest.ts), and the times after its arrival the profile test reads. */
const REF_BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const PROFILE_DTS = [0.3, 0.6, 1.0, 1.6];
const FRAME_FLOATS = FRAME_VEC4S * 4;

let fieldCache: ReefField | null = null;
const getField = (): ReefField => (fieldCache ??= computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 }));
const ctxOf = (f: ReefField): WaveContext => ({ omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ });

/** One SetWaves-only ribbon (chop 0) shared by the tests that compare with the CPU: its passes are three large pipelines. */
let rig: { time: ReturnType<typeof uniform>; sets: SetWaves; ribbon: BreakingRibbon } | null = null;
function setsRig() {
  if (!rig) {
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(getField());
    sets.setBreakParams(P);
    const surface: RibbonSurface = { smooth: (xz) => sets.displacementNode(xz), chop: () => vec3(0.0) };
    rig = { time, sets, ribbon: new BreakingRibbon(surface, P) };
  }
  return rig;
}

/** Uploads t's events to `sets` and traces the stations at t from the lineup camera. */
function traceAt(t: number, sets: SetWaves): { waves: ActiveWave[]; entries: StationEntry[] } {
  const field = getField();
  const events = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
  sets.setEvents(events);
  const waves = events.map(toActiveWave);
  const minHeightM = minRibbonHeight(fieldBreakingHeight(field, P), P);
  return { waves, entries: traceStations(field, waves, t, ctxOf(field), { cameraX: LINEUP.x, cameraZ: LINEUP.z, params: P, minHeightM }) };
}

const read = async (renderer: THREE.WebGPURenderer, attr: THREE.StorageBufferAttribute): Promise<Float32Array> =>
  new Float32Array(await renderer.getArrayBufferAsync(attr));

/** The CPU ribbon row of a station: buildProfile on the sumWaves base along n, placed in the world as the vertex pass places it. */
function cpuRow(st: Station, t: number, waves: readonly ActiveWave[]) {
  const field = getField(), ctx = ctxOf(field);
  const o: BreakOptions = { sample: (x, z) => sampleField(field, x, z), params: P };
  const memo = new Map<number, SetWaveResult>();
  const at = (u: number): SetWaveResult => {
    let r = memo.get(u);
    if (!r) {
      const x = st.x + st.nx * u, z = st.z + st.nz * u;
      r = sumWaves(x, z, t, sampleField(field, x, z), waves, ctx, o);
      memo.set(u, r);
    }
    return r;
  };
  const base = (u: number): Vec2 => { const d = at(u); return [u + d.dx * st.nx + d.dz * st.nz, d.eta]; };
  const prof = buildProfile(base, st, P);
  const tx = -st.nz, tz = st.nx;
  const world = prof.points.map(([u, y], j): [number, number, number] => {
    const d = at(prof.homes[j]);
    const lat = d.dx * tx + d.dz * tz;
    return [st.x + st.nx * u + tx * lat, y, st.z + st.nz * u + tz * lat];
  });
  return { prof, world };
}

/** The worst of one comparison, with where it came from. */
class Worst {
  value = 0;
  at = '';
  see(v: number, where: string): void {
    if (!(v <= this.value)) { this.value = Number.isNaN(v) ? Infinity : v; this.at = where; }
  }
  toString(): string { return `${this.value.toExponential(2)} (${this.at || 'none'})`; }
}

const dist3 = (g: Float32Array, k: number, w: readonly number[]): number => Math.max(Math.abs(g[k] - w[0]), Math.abs(g[k + 1] - w[1]), Math.abs(g[k + 2] - w[2]));
const isEdge = (j: number): boolean => SEGMENT_OF_SAMPLE[j] === SEGMENT_ID.front || SEGMENT_OF_SAMPLE[j] === SEGMENT_ID.back;

registerSelfTest({
  name: 'ribbon: GPU profile matches lipProfile',
  async run(renderer) {
    const { time, sets, ribbon } = setsRig();
    // Front/back samples are the sheet itself (their error is the sheet's own GPU/CPU gap); the rest are constructed.
    const edge = new Worst(), constructed = new Worst(), skirt = new Worst(), frame = new Worst(), extras = new Worst();
    const perField = FRAME_LAYOUT.map(() => 0);
    let stations = 0, deadLive = 0;
    const peaks: string[] = [];
    for (const dt of PROFILE_DTS) {
      const t = REF_BIGGEST.arrivalS + dt;
      time.value = t;
      const { waves, entries } = traceAt(t, sets);
      ribbon.setStations(entries, LINEUP);
      ribbon.compute(renderer);
      const gp = await read(renderer, ribbon.positions), gf = await read(renderer, ribbon.frames), ge = await read(renderer, ribbon.extras);
      entries.forEach((e, i) => {
        if (e.gap) return;
        stations++;
        const where = `dt ${dt} #${i}`;
        const { prof, world } = cpuRow(e, t, waves);
        for (let j = 0; j < PROFILE_SAMPLES; j++) {
          const k = (i * V + j + 1) * 4;
          (isEdge(j) ? edge : constructed).see(dist3(gp, k, world[j]), `${where} j ${j}`);
          if (gp[k + 3] !== 0) deadLive++;
          const cx = [prof.thickness[j], prof.lipness[j], prof.curlFoam[j], prof.frame.rho];
          extras.see(Math.max(...cx.map((c, m) => Math.abs(ge[k + m] - c))), `${where} j ${j}`);
        }
        const lowered = (w: readonly number[]) => [w[0], w[1] - SKIRT_DEPTH_M, w[2]];
        skirt.see(Math.max(dist3(gp, i * V * 4, lowered(world[0])), dist3(gp, (i * V + V - 1) * 4, lowered(world[LAST]))), where);
        const cf = packFrameCpu(prof.frame);
        cf.forEach((c, m) => {
          const err = Math.abs(gf[i * FRAME_FLOATS + m] - c);
          perField[m] = Math.max(perField[m], err);
          frame.see(err, `${where} ${FRAME_LAYOUT[m]}`);
        });
        if (Math.hypot(e.x, e.z) < 3) peaks.push(`dt ${dt} (${e.x.toFixed(1)},${e.z.toFixed(1)}) tb ${e.tb === null ? 'null' : e.tb.toFixed(2)} prog ${prof.frame.prog.toFixed(2)} weight ${prof.frame.weight.toFixed(2)}`);
      });
    }
    const ok = stations > 0 && deadLive === 0 && Math.max(edge.value, constructed.value, skirt.value) < 5e-3 && frame.value < 1e-3 && extras.value < 1e-3;
    const fields = FRAME_LAYOUT.map((n, m) => `${n} ${perField[m].toExponential(1)}`).join(', ');
    return {
      pass: ok,
      detail: `${stations} live stations × dt ${PROFILE_DTS.join('/')} s; worst |Δpos| (m, < 5e-3) constructed ${constructed}, edge samples (the sheet's own GPU/CPU gap) ${edge}, ` +
        `skirts ${skirt}; worst |Δframe| (< 1e-3) ${frame}; worst |Δextras| (thickness, lipness, curlFoam, rho; < 1e-3) ${extras}; live rows flagged dead ${deadLive}. ` +
        `Per frame field: ${fields}. Near the peak: ${peaks.slice(0, 8).join('; ')}`,
    };
  },
});

registerSelfTest({
  name: 'ribbon: edges are the sheet',
  async run(renderer) {
    const sim = new OceanSimulation();
    sim.setConditions(DEFAULT_CONDITIONS);
    const sets = new SetWaves(sim.time);
    sets.setField(getField());
    sets.setBreakParams(P);
    const model = new WaterSurfaceModel(sim, new Seabed(buildBathymetry()), sets);
    const surface = modelRibbonSurface(model);
    const ribbon = new BreakingRibbon(surface, P);
    const t = REF_BIGGEST.arrivalS + 0.6;
    const { entries } = traceAt(t, sets);
    sim.update(renderer, t, 1 / 60);
    ribbon.setStations(entries, LINEUP);
    ribbon.compute(renderer);
    // The first and last profile vertex of every live station, and the sheet at their homes (same camera, same fades).
    const idx: number[] = [];
    entries.forEach((e, i) => { if (!e.gap) idx.push(i * V + 1, i * V + PROFILE_SAMPLES); });
    const n = idx.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(idx.flatMap((k) => [k, 0, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 8), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n * 2);
    const homes = storage(ribbon.homes, 'vec4', ribbon.homes.count).toReadOnly();
    const pass = Fn(() => {
      const xz = homes.element(int(input.element(instanceIndex).x)).xy.toVar();
      const d = vec3(model.displacement(xz, surface.lod(xz))).toVar();
      output.element(instanceIndex.mul(2)).assign(vec4(xz.x.add(d.x), d.y, xz.y.add(d.z), 0.0));
      output.element(instanceIndex.mul(2).add(1)).assign(vec4(surface.chop(xz), 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const gp = await read(renderer, ribbon.positions), out = await read(renderer, outAttr);
    const gap = new Worst();
    let chop = 0;
    idx.forEach((k, m) => {
      gap.see(dist3(gp, k * 4, Array.from(out.slice(m * 8, m * 8 + 3))), `vertex ${k} (station ${Math.floor(k / V)}, ${k % V === 1 ? 'front' : 'back'})`);
      chop = Math.max(chop, Math.hypot(out[m * 8 + 4], out[m * 8 + 5], out[m * 8 + 6]));
    });
    // The chop must be there (FFT on) or the comparison proves nothing about it.
    const ok = n > 0 && gap.value < 1e-3 && chop > 0.01;
    return { pass: ok, detail: `${n / 2} live stations at dt 0.6 s; worst |ribbon edge − sheet| ${gap} m (< 1e-3); largest |cascade-2 chop| at the edges ${chop.toFixed(3)} m (> 0.01)` };
  },
});

registerSelfTest({
  name: 'ribbon: gap rows are zero-width and dead',
  async run(renderer) {
    const { time, sets, ribbon } = setsRig();
    const t = REF_BIGGEST.arrivalS + 0.6;
    time.value = t;
    const { entries } = traceAt(t, sets);
    ribbon.setStations(entries, LINEUP);
    ribbon.compute(renderer);
    const gp = await read(renderer, ribbon.positions), gn = await read(renderer, ribbon.normals), ge = await read(renderer, ribbon.extras);
    const waves = new Set(entries.filter((e): e is Station => !e.gap).map((e) => e.wave)).size;
    const width = new Worst();
    let gaps = 0, badFlags = 0, nonFinite = 0;
    entries.forEach((e, i) => {
      for (let l = 0; l < V; l++) {
        const k = (i * V + l) * 4;
        if (gp[k + 3] !== (e.gap ? 1 : 0)) badFlags++;
        for (let m = 0; m < 4; m++) if (!Number.isFinite(gp[k + m]) || !Number.isFinite(gn[k + m]) || !Number.isFinite(ge[k + m])) nonFinite++;
        if (e.gap) width.see(dist3(gp, k, Array.from(gp.slice(k - V * 4, k - V * 4 + 3))), `row ${i} vertex ${l}`);
      }
      if (e.gap) gaps++;
    });
    const ok = waves >= 2 && gaps > 0 && width.value <= 1e-6 && badFlags === 0 && nonFinite === 0 && ribbon.stationCount === entries.length;
    return {
      pass: ok,
      detail: `${entries.length} rows (${waves} waves, ${gaps} gap rows); worst |gap row − previous row| ${width} m (≤ 1e-6); wrong dead flags ${badFlags}; non-finite values ${nonFinite}`,
    };
  },
});

registerSelfTest({
  name: 'ribbon: normals face up out of the water on the back slope and down under the lip',
  async run(renderer) {
    const { time, sets, ribbon } = setsRig();
    const t = REF_BIGGEST.arrivalS + 0.6;
    time.value = t;
    const { entries } = traceAt(t, sets);
    ribbon.setStations(entries, LINEUP);
    ribbon.compute(renderer);
    const gn = await read(renderer, ribbon.normals), gf = await read(renderer, ribbon.frames);
    const field = (i: number, name: (typeof FRAME_LAYOUT)[number]): number => gf[i * FRAME_FLOATS + FRAME_LAYOUT.indexOf(name)];
    let backMin = Infinity, backAt = '', underMax = -Infinity, underAt = '', peakStations = 0, live = 0;
    entries.forEach((e, i) => {
      if (e.gap) return;
      live++;
      const by = gn[(i * V + LAST + 1) * 4 + 1];
      if (!(by >= backMin)) { backMin = by; backAt = `#${i}`; }
      // At the peak, with the lip thrown and the constructed curve at (nearly) full weight.
      if (Math.hypot(e.x, e.z) < 15 && field(i, 'weight') > 0.9 && field(i, 'prog') > 0.3) {
        peakStations++;
        for (let j = 0; j < PROFILE_SAMPLES; j++) {
          if (SEGMENT_OF_SAMPLE[j] !== SEGMENT_ID.under) continue;
          const y = gn[(i * V + j + 1) * 4 + 1];
          if (!(y <= underMax)) { underMax = y; underAt = `#${i} j ${j}`; }
        }
      }
    });
    const ok = live > 0 && backMin > 0.8 && peakStations > 0 && underMax < 0;
    return {
      pass: ok,
      detail: `${live} live stations at dt 0.6 s; lowest back-edge normal y ${backMin.toFixed(3)} (${backAt}; > 0.8); ` +
        `${peakStations} peak stations with a thrown lip (|xz| < 15 m, weight > 0.9, prog > 0.3); highest underside normal y ${underMax.toFixed(3)} (${underAt}; < 0)`,
    };
  },
});
