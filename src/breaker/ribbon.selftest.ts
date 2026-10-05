import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, int, length, max, storage, uniform, vec2, vec3, vec4 } from 'three/tsl';
type Vec2 = readonly [number, number];
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { OceanSimulation } from '../ocean/OceanSimulation';
import { sheetNormal } from '../ocean/OceanSurface';
import { WaterSurfaceModel } from '../ocean/waterSurface';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import {
  BreakingRibbon, CHOP_CASCADE, FOOTPRINT_END_MARGIN_M, FOOTPRINT_GRID, MIN_PROFILE_STEP_M, NORMAL_SEARCH, type RibbonSurface, SKIRT_DEPTH_M,
  VERTS_PER_STATION, developedU, modelRibbonSurface, ribbonShadingNormal,
} from './BreakingRibbon';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { type Station, type StationEntry, minRibbonHeight, traceStations } from './crestTrace';
import { PROFILE_SAMPLES } from './BreakingRibbon';
import { profileSamples } from './wombProfile';
import { sectionOf } from './wombSection';
import { WOMB_FRAME_VEC4S } from './wombSectionNodes';
import { hollowFromPsi } from './reefReport';
import { type ReefField, computeReefField, sampleField } from './reefField';
import { SetWaves } from './SetWaves';
import { type ActiveWave, type BreakOptions, breakOptions, type SetWaveResult, type WaveContext, fieldBreakingHeight, sumWaves, toActiveWave } from './setWaveModel';

const P = DEFAULT_BREAK_PARAMS;
const V = VERTS_PER_STATION;
const LAST = PROFILE_SAMPLES - 1;
/** The default lineup camera (referenceMoments.DEFAULT_LINEUP_POSITION). */
const LINEUP = new THREE.Vector3(-25, 0.8, 45);
/** The biggest wave of the default set 1 (as breaker.selftest.ts), and the times after its arrival the profile test reads. */
const REF_BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const FRAME_FLOATS = WOMB_FRAME_VEC4S * 4;

let fieldCache: ReefField | null = null;
const getField = (): ReefField => (fieldCache ??= computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0, peel: DEFAULT_BREAK_PARAMS.peel }));
const ctxOf = (f: ReefField): WaveContext => ({ omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ });

/** One SetWaves-only ribbon (chop 0) shared by the tests that compare with the CPU: its passes are three large pipelines. */
let rig: { time: ReturnType<typeof uniform>; sets: SetWaves; ribbon: BreakingRibbon } | null = null;
function setsRig() {
  if (!rig) {
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(getField());
    sets.setBreakParams(P);
    const surface: RibbonSurface = { smooth: (xz) => sets.displacementNode(xz), chop: () => vec3(0.0), frameBase: (xz) => sets.displacementNode(xz, false) };
    rig = { time, sets, ribbon: new BreakingRibbon(surface) };
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

/** The CPU ribbon row of a station: wombSection on the sumWaves sheet along n, placed in the world as the vertex pass
 * places it (the sheet's lateral displacement at each sample's home carried along t̂). */
function cpuRow(st: Station, t: number, waves: readonly ActiveWave[]) {
  const field = getField(), ctx = ctxOf(field);
  const o: BreakOptions = breakOptions(field, P);
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
  const sheet = (u: number): Vec2 => { const d = at(u); return [u + d.dx * st.nx + d.dz * st.nz, d.eta]; };
  // The station's own numbers, smoothed along the crest (as the GPU reads them from the station buffer).
  const sec = sectionOf(st.section, sheet);
  const { A, phase, hollow } = sec.numbers;
  const { curve, marks } = profileSamples(phase, hollow);
  const homes = curve.map(([u]) => A * u).reverse();
  const n = PROFILE_SAMPLES, tx = -st.nz, tz = st.nx;
  const world = sec.points.map(([u, y], j): [number, number, number] => {
    const d = at(homes[j]);
    const lat = d.dx * tx + d.dz * tz;
    return [st.x + st.nx * u + tx * lat, y, st.z + st.nz * u + tz * lat];
  });
  return { sec, homes, world, marks: { tip: n - 1 - marks.tip, crest: n - 1 - marks.crest, floor: n - 1 - marks.floor } };
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

/** The distance (m) from p to the polyline through `pts`. */
function toPolyline(p: readonly number[], pts: readonly (readonly number[])[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = Math.max(0, Math.min(1, (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1)));
    best = Math.min(best, Math.hypot(w[0] - t * d[0], w[1] - t * d[1], w[2] - t * d[2]));
  }
  return best;
}

const dist3 = (g: Float32Array, k: number, w: readonly number[]): number => Math.max(Math.abs(g[k] - w[0]), Math.abs(g[k + 1] - w[1]), Math.abs(g[k + 2] - w[2]));

/** The ψ the mirror test forces on every station (oval, cylinder, thrown, past it) and its times around the biggest wave's
 * arrival at the take-off: standing up, held by the peel, the throw, the barrel, the collapse. */
const MIRROR_PSI = [0.03, 0.065, 0.09, 0.2];
const MIRROR_DTS = [-5, -3.5, -2, -1, 0, 0.6, 2];
/** Every MIRROR_STRIDE-th live station is compared (the CPU reference is ~160 sheet evaluations a station). */
const MIRROR_STRIDE = 3;

registerSelfTest({
  name: 'ribbon: GPU section matches wombSection',
  async run(renderer) {
    const { time, sets, ribbon } = setsRig();
    const pos = new Worst(), skirt = new Worst(), numbers = new Worst(), marks = new Worst(), rhoX = new Worst(), slide = new Worst();
    let stations = 0, deadLive = 0, nonFinite = 0, thrown = 0, collapsing = 0, standing = 0, worstDetail = '';
    for (const psi of MIRROR_PSI) for (const dt of MIRROR_DTS) {
      const t = REF_BIGGEST.arrivalS + dt;
      time.value = t;
      const traced = traceAt(t, sets);
      // Every station's hollowness forced from ψ (the smoothed numbers otherwise as traced).
      const entries = traced.entries.map((e) => (e.gap ? e : { ...e, psi, section: { ...e.section, hollow: hollowFromPsi(psi) } }));
      ribbon.setStations(entries, LINEUP);
      ribbon.compute(renderer);
      const gp = await read(renderer, ribbon.positions), gf = await read(renderer, ribbon.frames), ge = await read(renderer, ribbon.extras), gl = await read(renderer, ribbon.lights);
      let live = 0;
      entries.forEach((e, i) => {
        if (e.gap || live++ % MIRROR_STRIDE !== 0) return;
        stations++;
        const where = `ψ ${psi} dt ${dt} #${i}`;
        const { sec, world, marks: cm } = cpuRow(e, t, traced.waves);
        const { A, phase, hollow, rho } = sec.numbers;
        if (phase > 0.6 && phase < 1.2 && rho > 0.9) thrown++;
        if (phase > 1.2 && rho > 0.5) collapsing++;
        if (phase > 0.1 && phase <= 0.45) standing++;
        for (let j = 0; j < PROFILE_SAMPLES; j++) {
          const k = (i * V + j + 1) * 4;
          // The GPU's sample against the CPU's curve near it (the polyline of samples j ± 3): the walk spreads the samples
          // in f32 on the GPU, so a sample may slide along the curve by millimetres, which changes nothing drawn; on a
          // near-vertical stretch of sheet that slide reads centimetres sample to sample.
          const dj = toPolyline([gp[k], gp[k + 1], gp[k + 2]], world.slice(Math.max(0, j - 3), Math.min(PROFILE_SAMPLES, j + 4)));
          slide.see(dist3(gp, k, world[j]), `${where} j ${j}`);
          if (!(dj <= pos.value)) {
            worstDetail = `${where} j ${j}: GPU (${[gp[k], gp[k + 1], gp[k + 2]].map((v) => v.toFixed(3)).join(', ')}) CPU (${world[j].map((v) => v.toFixed(3)).join(', ')}); ` +
              `A ${A.toFixed(3)} phase ${phase.toFixed(3)} hollow ${hollow.toFixed(3)} ρ ${rho.toFixed(3)}`;
          }
          pos.see(dj, `${where} j ${j}`);
          if (gp[k + 3] !== 0) deadLive++;
          if (![gp[k], gp[k + 1], gp[k + 2], ge[k], ge[k + 1], ge[k + 2], ge[k + 3], gl[k], gl[k + 1], gl[k + 2], gl[k + 3]].every(Number.isFinite)) nonFinite++;
          rhoX.see(Math.abs(ge[k + 3] - rho), `${where} j ${j}`);
        }
        const lowered = (w: readonly number[]) => [w[0], w[1] - SKIRT_DEPTH_M, w[2]];
        skirt.see(Math.max(dist3(gp, i * V * 4, lowered(world[0])), dist3(gp, (i * V + V - 1) * 4, lowered(world[LAST]))), where);
        const g = gf.subarray(i * FRAME_FLOATS, (i + 1) * FRAME_FLOATS);
        const nm = [A, phase, hollow, rho].map((c, m) => Math.abs(g[m] - c) / Math.max(1, Math.abs(c))), nw = nm.indexOf(Math.max(...nm));
        numbers.see(nm[nw], `${where} ${['A', 'phase', 'hollow', 'rho'][nw]} GPU ${g[nw].toFixed(5)} CPU ${[A, phase, hollow, rho][nw].toFixed(5)}`);
        const mm = [cm.tip, cm.crest, cm.floor].map((c, m) => Math.abs(g[4 + m] - c)), mw = mm.indexOf(Math.max(...mm));
        marks.see(mm[mw], `${where} ${['tip', 'crest', 'floor'][mw]} GPU ${g[4 + mw]} CPU ${[cm.tip, cm.crest, cm.floor][mw]}`);
      });
    }
    // Bounds: the samples are the mirror plus the sheet's own f32 GPU/CPU gap (pinned by breaker.selftest), 5 mm; the
    // numbers 1e-4 relative; the marks within one sample (a walk's threshold in f32 against f64).
    const ok = stations > 0 && thrown > 0 && collapsing > 0 && standing > 0 && deadLive === 0 && nonFinite === 0 && pos.value < 5e-3 && skirt.value < 5e-3 &&
      numbers.value < 1e-4 && marks.value <= 1 && rhoX.value < 1e-4;
    return {
      pass: ok,
      detail: `${stations} stations (ψ ${MIRROR_PSI.join('/')} × dt ${MIRROR_DTS.join('/')} s; ${standing} standing up, ${thrown} thrown, ${collapsing} collapsing); ` +
        `worst distance from the CPU's curve ${pos} (< 5e-3), sample-to-sample ${slide} (diagnostic), skirts ${skirt} (< 5e-3); numbers (A, phase, hollow, ρ; relative) ${numbers} (< 1e-4); marks ${marks} samples (≤ 1); ` +
        `extras' ρ ${rhoX} (< 1e-4); live rows flagged dead ${deadLive}, non-finite values ${nonFinite} (0). Worst sample: ${worstDetail}`,
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
    const ribbon = new BreakingRibbon(surface);
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
    const W = 4; // vec4s out per vertex: sheet position, chop, ribbon shading normal + constructed, sheet normal + |detail − home|
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * W * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n * W);
    const homes = storage(ribbon.homes, 'vec4', ribbon.homes.count).toReadOnly();
    const positions = storage(ribbon.positions, 'vec4', ribbon.positions.count).toReadOnly();
    const normals = storage(ribbon.normals, 'vec4', ribbon.normals.count).toReadOnly();
    const extras = storage(ribbon.extras, 'vec4', ribbon.extras.count).toReadOnly();
    const details = storage(ribbon.details, 'vec4', ribbon.details.count).toReadOnly();
    const camera = uniform(LINEUP.clone());
    const slopeVariance = sim.sizes.map(() => uniform(0));
    const pass = Fn(() => {
      const k = int(input.element(instanceIndex).x).toVar();
      const h = homes.element(k).toVar();
      const xz = h.xy.toVar();
      const d = vec3(model.displacement(xz, surface.lod(xz))).toVar();
      const o = instanceIndex.mul(W);
      output.element(o).assign(vec4(xz.x.add(d.x), d.y, xz.y.add(d.z), 0.0));
      output.element(o.add(1)).assign(vec4(surface.chop(xz), 0.0));
      // The ribbon's shading normal as its material composes it, and the sheet's as OceanSurface does, at this vertex.
      const det = details.element(k).toVar();
      const lipness = extras.element(k).y.toVar();
      const toCamera = camera.sub(positions.element(k).xyz).toVar();
      const distance = length(toCamera).toVar();
      const viewDir = toCamera.div(max(distance, 1e-4));
      const slope = vec2(sets.breakSampleNode(xz).slope).toVar();
      const fftRibbon = model.fftSlopes(det.xy, distance, slopeVariance, (c) => (c === CHOP_CASCADE ? float(1.0).sub(lipness) : float(1.0)));
      const ribbonNormal = ribbonShadingNormal({
        geometric: normals.element(k).xyz, tangent: vec3(h.z, 0.0, h.w), fft: fftRibbon, setSlope: slope, constructed: det.w, viewDir,
      }).normal;
      output.element(o.add(2)).assign(vec4(ribbonNormal, det.w));
      output.element(o.add(3)).assign(vec4(sheetNormal(model.fftSlopes(xz, distance, slopeVariance), slope), length(det.xy.sub(xz))));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const gp = await read(renderer, ribbon.positions), out = await read(renderer, outAttr);
    const gd = await read(renderer, ribbon.details), gf = await read(renderer, ribbon.frames);
    const gap = new Worst(), shade = new Worst(), constructedAtEdge = new Worst(), detailAtEdge = new Worst();
    let chop = 0, tilt = 0;
    idx.forEach((k, m) => {
      const where = `vertex ${k} (station ${Math.floor(k / V)}, ${k % V === 1 ? 'front' : 'back'})`;
      const q = m * W * 4;
      gap.see(dist3(gp, k * 4, Array.from(out.slice(q, q + 3))), where);
      chop = Math.max(chop, Math.hypot(out[q + 4], out[q + 5], out[q + 6]));
      shade.see(Math.max(...[0, 1, 2].map((c) => Math.abs(out[q + 8 + c] - out[q + 12 + c]))), where);
      constructedAtEdge.see(out[q + 11], where);
      detailAtEdge.see(out[q + 15], where);
      tilt = Math.max(tilt, Math.hypot(out[q + 12], out[q + 14]));
    });
    // Where the lip is thrown the blend must engage: the most constructed sample from the floor to the crest of those stations.
    let lipConstructed = 0, peaks = 0;
    entries.forEach((e, i) => {
      const f = gf.subarray(i * FRAME_FLOATS, (i + 1) * FRAME_FLOATS);
      if (e.gap || !(f[3] > 0.9 && f[1] > 0.6 && f[1] < 1.2)) return;
      peaks++;
      for (let j = Math.min(f[6], f[5]); j <= Math.max(f[6], f[5]); j++) lipConstructed = Math.max(lipConstructed, gd[(i * V + j + 1) * 4 + 3]);
    });
    // The chop must be there (FFT on) or the comparison proves nothing about it. The default sea's 35 m cascade is only
    // millimetres high at the lineup (6 mm measured), so the bound is 1 mm; the equality itself holds to ~1e-5 m.
    const ok = n > 0 && gap.value < 1e-3 && chop > 1e-3 && shade.value < 1e-3 && constructedAtEdge.value === 0 && detailAtEdge.value <= 1e-5 &&
      tilt > 1e-3 && peaks > 0 && lipConstructed > 0.9;
    return {
      pass: ok,
      detail: `${n / 2} live stations at dt 0.6 s; worst |ribbon edge − sheet| ${gap} m (< 1e-3); largest |cascade-2 chop| at the edges ${chop.toFixed(4)} m (> 1e-3). ` +
        `Shading at the edges: worst |ribbon shading normal − the sheet's normal| ${shade} (< 1e-3), constructed weight there ${constructedAtEdge} (0), ` +
        `|detail coordinate − home| ${detailAtEdge} m (≤ 1e-5); largest sheet-normal tilt there ${tilt.toFixed(4)} (> 1e-3, or the comparison proves nothing); ` +
        `${peaks} stations with a thrown lip, most constructed face/lip sample ${lipConstructed.toFixed(3)} (> 0.9: the ribbon's own normal takes over there)`,
    };
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

/**
 * The normal pass on the CPU (BreakingRibbon.buildNormalPass): cross(∂P/∂station, ∂P/∂j) from central differences of
 * the rows' positions (one-sided next to a gap or the ends; t̂ for a lone station), the nearest live profile difference
 * (MIN_PROFILE_STEP_M across the crest) within ±NORMAL_SEARCH (else up), oriented so the station's back-edge normal points up.
 */
function cpuNormal(rows: readonly (readonly (readonly number[])[] | null)[], entries: readonly StationEntry[], i: number, j: number): number[] {
  const r = rows[i] as (readonly number[])[], e = entries[i] as Station;
  const sub = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const prev = i > 0 ? rows[i - 1] : null, next = i + 1 < rows.length ? rows[i + 1] : null;
  const dS = (jj: number) => (prev && next ? sub(next[jj], prev[jj]) : next ? sub(next[jj], r[jj]) : prev ? sub(r[jj], prev[jj]) : [-e.nz, 0, e.nx]);
  const dJ = (jj: number) => (jj === 0 ? sub(r[1], r[0]) : jj === LAST ? sub(r[LAST], r[LAST - 1]) : sub(r[jj + 1], r[jj - 1]));
  const t = [-e.nz, 0, e.nx];
  const live = (jj: number) => {
    const d = dJ(jj), a = d[0] * t[0] + d[2] * t[2];
    const across = [d[0] - t[0] * a, d[1], d[2] - t[2] * a];
    return across[0] ** 2 + across[1] ** 2 + across[2] ** 2 >= MIN_PROFILE_STEP_M * MIN_PROFILE_STEP_M;
  };
  let jn = j;
  if (!live(j)) {
    for (let k = 1; k <= NORMAL_SEARCH; k++) {
      if (j - k >= 0 && live(j - k)) { jn = j - k; break; }
      if (j + k <= LAST && live(j + k)) { jn = j + k; break; }
    }
    if (!live(jn)) return [0, 1, 0];
  }
  let n = cross(dS(jn), dJ(jn));
  if (cross(dS(LAST), dJ(LAST))[1] < 0) n = n.map((c) => -c);
  const l = Math.hypot(...n);
  return l > 1e-12 ? n.map((c) => c / l) : [0, 1, 0];
}

registerSelfTest({
  name: 'ribbon: normals face up out of the water on the back slope and down under the lip',
  async run(renderer) {
    const { time, sets, ribbon } = setsRig();
    const t = REF_BIGGEST.arrivalS + 0.6;
    time.value = t;
    const { waves, entries } = traceAt(t, sets);
    ribbon.setStations(entries, LINEUP);
    ribbon.compute(renderer);
    const gn = await read(renderer, ribbon.normals), gf = await read(renderer, ribbon.frames), gp = await read(renderer, ribbon.positions);
    const field = getField(), ctx = ctxOf(field);
    const o: BreakOptions = breakOptions(field, P);
    // The mirror runs on the GPU's own positions, so it checks the normal pass alone (test 1 checks the positions).
    const rows = entries.map((e, i) => (e.gap ? null : Array.from({ length: PROFILE_SAMPLES }, (_, j) => Array.from(gp.slice((i * V + j + 1) * 4, (i * V + j + 1) * 4 + 3)))));
    /** The sheet's own normal y at a station's back edge, from central differences of sumWaves 0.25 m apart (the true
     * surface: the analytic slope omits the field's gradients, which are steep over reef heads). */
    const sheetNormalY = (e: Station): number => {
      const uB = -(0.5 * e.H + 2), x = e.x + e.nx * uB, z = e.z + e.nz * uB, d = 0.25;
      const h = (xx: number, zz: number) => sumWaves(xx, zz, t, sampleField(field, xx, zz), waves, ctx, o).eta;
      return 1 / Math.hypot((h(x + d, z) - h(x - d, z)) / (2 * d), (h(x, z + d) - h(x, z - d)) / (2 * d), 1);
    };
    const mirror = new Worst();
    let mirrorNote = '';
    let backMin = Infinity, backAt = '', gentleMin = Infinity, gentleAt = '', gentle = 0, underMax = -Infinity, underAt = '', peakStations = 0, live = 0;
    entries.forEach((e, i) => {
      if (e.gap) return;
      live++;
      // Any station with a thrown lip.
      const f = gf.subarray(i * FRAME_FLOATS, (i + 1) * FRAME_FLOATS);
      const peak = f[3] > 0.9 && f[1] > 0.7 && f[1] < 1.1;
      if (peak) peakStations++;
      // The lip's underside: the samples just inside the tip, toward the tube's floor (front → back: floor … ceiling … tip).
      const tipJ = f[4], floorJ = f[6], underFrom = tipJ - 0.25 * (tipJ - floorJ);
      for (let j = 0; j < PROFILE_SAMPLES; j++) {
        const k = (i * V + j + 1) * 4;
        const cn = cpuNormal(rows, entries, i, j), err = dist3(gn, k, cn);
        if (!(err <= mirror.value)) {
          const r = rows[i] as number[][], f3 = (v: readonly number[]) => `(${v.map((c) => c.toFixed(5)).join(', ')})`;
          const near = [j - 1, j, j + 1].filter((q) => q >= 0 && q <= LAST);
          mirrorNote = `#${i} j ${j}: GPU normal ${f3(Array.from(gn.slice(k, k + 3)))} CPU mirror ${f3(cn)}; positions j−1/j/j+1 ${near.map((q) => f3(r[q])).join(' ')}; ` +
            `rows i±1 at j ${[i - 1, i + 1].map((q) => (rows[q] ? f3((rows[q] as number[][])[j]) : 'none')).join(' ')}`;
        }
        mirror.see(err, `#${i} j ${j}`);
        const lipUnder = j >= underFrom && j < tipJ - 1;
        if (peak && lipUnder && !(gn[k + 1] <= underMax)) { underMax = gn[k + 1]; underAt = `#${i} j ${j}`; }
      }
      const by = gn[(i * V + LAST + 1) * 4 + 1];
      if (!(by >= backMin)) { backMin = by; backAt = `#${i} (sheet's own normal y there ${sheetNormalY(e).toFixed(3)})`; }
      // Where the sheet's back slope is gentle (its own normal y > 0.95), the ribbon's must face up (> 0.8).
      if (sheetNormalY(e) > 0.95) {
        gentle++;
        if (!(by >= gentleMin)) { gentleMin = by; gentleAt = `#${i}`; }
      }
    });
    const ok = live > 0 && mirror.value < 0.05 && backMin > 0 && gentle > live / 2 && gentleMin > 0.8 && peakStations > 0 && underMax < 0;
    return {
      pass: ok,
      detail: `${live} live stations at dt 0.6 s; worst |GPU normal − CPU mirror of the normal pass| ${mirror} (< 0.05) [${mirrorNote}]; ` +
        `lowest back-edge normal y ${backMin.toFixed(3)} (${backAt}; > 0); on the ${gentle} gentle back slopes (sheet normal y > 0.95) lowest ${gentleMin.toFixed(3)} (${gentleAt}; > 0.8); ` +
        `${peakStations} stations with a thrown lip (ρ > 0.9, phase 0.7–1.1); highest lip underside normal y (the quarter of the tube's inside next to the tip) ${underMax.toFixed(3)} (${underAt}; < 0)`,
    };
  },
});

/** A station is interior (the footprint test) with this much live crest (m of arc) on both sides. */
const INTERIOR_ARC_M = FOOTPRINT_END_MARGIN_M + 1;

/** The footprint mask read back: texel (col, row) → 0/1, rows padded to WebGPU's 256-byte copy alignment. */
async function readFootprint(renderer: THREE.WebGPURenderer, ribbon: BreakingRibbon) {
  const w = FOOTPRINT_GRID.size.x, h = FOOTPRINT_GRID.size.y;
  const data = await renderer.readRenderTargetPixelsAsync(ribbon.footprintTarget, 0, 0, w, h);
  const stride = Math.ceil(w / 256) * 256;
  const at = (col: number, row: number): number => (data[row * stride + col] > 127 ? 1 : 0);
  let marked = 0;
  for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) marked += at(col, row);
  return { at, marked, lengthOk: data.length >= (h - 1) * stride + w, w, h };
}

/** The footprint texel (col, row) under world xz (row = z), or null outside the grid. `flip` mirrors the rows (diagnostic). */
function texelOf(x: number, z: number, flip = false): [number, number] | null {
  const { origin, cellM, size } = FOOTPRINT_GRID;
  const col = Math.floor((x - origin.x) / cellM), row = Math.floor((z - origin.y) / cellM);
  if (col < 0 || row < 0 || col >= size.x || row >= size.y) return null;
  return [col, flip ? size.y - 1 - row : row];
}

registerSelfTest({
  name: "ribbon: the footprint covers the stations' inner strip and nothing else",
  async run(renderer) {
    const { time, sets, ribbon } = setsRig();
    const t = REF_BIGGEST.arrivalS + 0.6;
    time.value = t;
    const { waves, entries } = traceAt(t, sets);
    ribbon.setStations(entries, LINEUP);
    ribbon.compute(renderer);
    ribbon.renderFootprint(renderer);
    const mask = await readFootprint(renderer, ribbon);
    const gp = await read(renderer, ribbon.positions), ge = await read(renderer, ribbon.extras);
    const field = getField(), ctx = ctxOf(field);
    const o: BreakOptions = breakOptions(field, P);
    const rhoAt = (i: number): number => ge[(i * V + 1) * 4 + 3];
    const liveAt = (i: number): boolean => i >= 0 && i < entries.length && !entries[i].gap && rhoAt(i) >= 0.02;
    /** Whether the stations within INTERIOR_ARC_M of arc on both sides of i are live and in the ribbon (ρ ≥ 0.02): away from a
     * run's end, including the FOOTPRINT_END_MARGIN_M its footprint leaves out there, plus 1 m for the texels. */
    const interior = (i: number): boolean => {
      const e = entries[i] as Station;
      for (const step of [-1, 1]) {
        let k = i + step;
        for (;;) {
          if (!liveAt(k)) return false;
          if (Math.abs((entries[k] as Station).arc - e.arc) >= INTERIOR_ARC_M) break;
          k += step;
        }
      }
      return liveAt(i);
    };
    let covered = 0, coveredChecks = 0, clear = 0, clearChecks = 0, coveredFlipped = 0, clearFlipped = 0;
    const missed: string[] = [], stray: string[] = [];
    entries.forEach((e, i) => {
      if (e.gap) return;
      // The u = 0 point as the ribbon places it: the crest S, carried along t̂ by the sheet's lateral displacement there.
      if (interior(i)) {
        const d = sumWaves(e.x, e.z, t, sampleField(field, e.x, e.z), waves, ctx, o);
        const lat = d.dx * -e.nz + d.dz * e.nx;
        const x = e.x - e.nz * lat, z = e.z + e.nx * lat;
        const q = texelOf(x, z), qf = texelOf(x, z, true);
        if (q && qf) {
          coveredChecks++;
          if (mask.at(...q)) covered++;
          else if (missed.length < 5) missed.push(`#${i} (${x.toFixed(2)}, ${z.toFixed(2)}) ρ ${rhoAt(i).toFixed(3)}`);
          coveredFlipped += mask.at(...qf);
        }
      }
      // 3 m beyond the front edge (profile sample 0, as drawn), along the station's normal.
      const k = (i * V + 1) * 4;
      const fx = gp[k] + e.nx * 3, fz = gp[k + 2] + e.nz * 3;
      const q = texelOf(fx, fz), qf = texelOf(fx, fz, true);
      if (q && qf) {
        clearChecks++;
        if (!mask.at(...q)) clear++;
        else if (stray.length < 5) stray.push(`#${i} (${fx.toFixed(2)}, ${fz.toFixed(2)})`);
        clearFlipped += 1 - mask.at(...qf);
      }
    });
    const live = entries.filter((e) => !e.gap).length;
    const ok = mask.lengthOk && coveredChecks >= 10 && covered === coveredChecks && clearChecks === live && clear === clearChecks;
    return {
      pass: ok,
      detail: `${live} live stations at dt 0.6 s, ${mask.marked} texels marked; under the u = 0 point of ${coveredChecks} interior stations (ρ ≥ 0.02 within ${INTERIOR_ARC_M} m of arc each side; ≥ 10): ` +
        `${covered} marked (all) [missed: ${missed.join('; ') || 'none'}]; 3 m beyond the front edge of ${clearChecks} stations (all ${live} in the grid): ${clear} clear (all) ` +
        `[marked: ${stray.join('; ') || 'none'}]. Diagnostic, rows mirrored: ${coveredFlipped} marked under u = 0, ${clearFlipped} clear ahead (a row-order mistake would pass this way).` +
        `${mask.lengthOk ? '' : ' Readback shorter than the padded rows expect.'}`,
    };
  },
});

registerSelfTest({
  name: 'ribbon: an empty trace draws nothing and keeps the sheet whole',
  async run(renderer) {
    const { time, sets, ribbon } = setsRig();
    // Mark the footprint first (the trace at +0.6 s), so a stale mask would show.
    const t = REF_BIGGEST.arrivalS + 0.6;
    time.value = t;
    const { entries } = traceAt(t, sets);
    ribbon.setStations(entries, LINEUP);
    ribbon.compute(renderer);
    ribbon.renderFootprint(renderer);
    const before = (await readFootprint(renderer, ribbon)).marked;
    ribbon.setStations([], LINEUP);
    ribbon.compute(renderer);
    ribbon.renderFootprint(renderer);
    const after = await readFootprint(renderer, ribbon);
    const drawn = ribbon.mesh.geometry.drawRange.count;
    const ok = before > 0 && ribbon.stationCount === 0 && after.marked === 0 && after.lengthOk && drawn === 0 && !ribbon.mesh.visible;
    return {
      pass: ok,
      detail: `with the trace at dt 0.6 s ${before} texels marked (> 0); after setStations([]): stationCount ${ribbon.stationCount} (0), ${after.marked} texels marked (0), ` +
        `draw range ${drawn} indices (0), mesh ${ribbon.mesh.visible ? 'visible' : 'hidden'} (hidden)`,
    };
  },
});

registerSelfTest({
  name: 'ribbon: the detail coordinate is the developed profile',
  async run(renderer) {
    const { time, sets, ribbon } = setsRig();
    const t = REF_BIGGEST.arrivalS + 0.6;
    time.value = t;
    const { entries } = traceAt(t, sets);
    ribbon.setStations(entries, LINEUP);
    ribbon.compute(renderer);
    // The rig's chop is 0, so the positions are the chop-free profile the develop pass measured.
    const gp = await read(renderer, ribbon.positions), gd = await read(renderer, ribbon.details), gh = await read(renderer, ribbon.homes);
    const gf = await read(renderer, ribbon.frames);
    const mirror = new Worst(), place = new Worst(), edges = new Worst(), skirts = new Worst(), flat = new Worst();
    let live = 0, flatStations = 0;
    entries.forEach((e, i) => {
      if (e.gap) return;
      live++;
      const f = gf.subarray(i * FRAME_FLOATS, (i + 1) * FRAME_FLOATS);
      const pts = Array.from({ length: PROFILE_SAMPLES }, (_, j): Vec2 => {
        const k = (i * V + j + 1) * 4;
        return [(gp[k] - e.x) * e.nx + (gp[k + 2] - e.z) * e.nz, gp[k + 1]];
      });
      // The detail coordinate: mix(home u, developed u, ρ) on the GPU's own positions and homes, blended from the floor's
      // sample to the crest's.
      const homes = Array.from({ length: PROFILE_SAMPLES }, (_, j) => { const k = (i * V + j + 1) * 4; return (gh[k] - e.x) * e.nx + (gh[k + 1] - e.z) * e.nz; });
      const weight = f[3];
      const dev = developedU(pts, homes[0], homes[LAST], [f[6], f[5]], { homes, weight });
      if (weight === 0) flatStations++;
      for (let j = 0; j < PROFILE_SAMPLES; j++) {
        const k = (i * V + j + 1) * 4;
        mirror.see(Math.abs(gd[k + 2] - dev[j]), `#${i} j ${j} ρ ${weight.toFixed(3)}`);
        // Where ρ is 0 the profile is the sheet's own: the detail is the sheet's home, exactly.
        if (weight === 0) flat.see(Math.max(Math.abs(gd[k] - gh[k]), Math.abs(gd[k + 1] - gh[k + 1])), `#${i} j ${j}`);
        place.see(Math.max(Math.abs(gd[k] - (e.x + e.nx * gd[k + 2])), Math.abs(gd[k + 1] - (e.z + e.nz * gd[k + 2]))), `#${i} j ${j}`);
      }
      for (const j of [0, LAST]) {
        const k = (i * V + j + 1) * 4;
        edges.see(Math.max(Math.abs(gd[k] - gh[k]), Math.abs(gd[k + 1] - gh[k + 1])), `#${i} ${j === 0 ? 'front' : 'back'}`);
      }
      const s0 = i * V * 4, s1 = (i * V + V - 1) * 4, e0 = (i * V + 1) * 4, e1 = (i * V + PROFILE_SAMPLES) * 4;
      skirts.see(Math.max(...[0, 1, 2].map((m) => Math.max(Math.abs(gd[s0 + m] - gd[e0 + m]), Math.abs(gd[s1 + m] - gd[e1 + m])))), `#${i}`);
    });
    const ok = live > 0 && mirror.value < 1e-3 && place.value < 1e-3 && edges.value <= 1e-5 && flat.value <= 1e-5 && skirts.value === 0;
    return {
      pass: ok,
      detail: `${live} live stations at dt 0.6 s; worst |GPU detail u − developedU(mix(home, developed, ρ)) on the GPU's positions and homes| ${mirror} m (< 1e-3); ` +
        `worst |detail xz − (S + n·u)| ${place} m (< 1e-3); worst |detail − home| at the edges ${edges} m (≤ 1e-5); ` +
        `${flatStations} stations at ρ 0, worst |detail − home| there ${flat} m (≤ 1e-5); skirts vs their edge ${skirts} (0)`,
    };
  },
});
