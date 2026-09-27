import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, int, length, max, storage, uniform, vec2, vec3, vec4 } from 'three/tsl';
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
import { PROFILE_SAMPLES, PROFILE_SEGMENTS, type ProfileFrame, SEGMENT_ID, type Vec2, buildProfile, profileFrame } from './lipProfile';
import { FRAME_BASE_OFFSET, FRAME_LAYOUT, FRAME_VEC4S, SEGMENT_OF_SAMPLE, packFrameCpu } from './lipProfileNodes';
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
/** Frame fields that matter only through the geometry: compared directly only where the station's curve is drawn. */
const GEOMETRY_ONLY = new Set<string>(['vj', 'tauLand', 'reach', 'prog', 'collapse', 'landing', 'weight']);
/** The frame tolerance (controller ruling): 1e-3 × max(1, |CPU value|). */
const frameTol = (c: number): number => 1e-3 * Math.max(1, Math.abs(c));
/** Whether a station's constructed curve shows: CPU weight > 0.01, or a finite tb before the collapse ends. */
const drawn = (e: Station, f: ProfileFrame): boolean =>
  f.weight > 0.01 || (e.tb !== null && Number.isFinite(e.tb) && e.tb < f.tauLand * (1 + P.collapseTime));

const isEdge = (j: number): boolean => SEGMENT_OF_SAMPLE[j] === SEGMENT_ID.front || SEGMENT_OF_SAMPLE[j] === SEGMENT_ID.back;

registerSelfTest({
  name: 'ribbon: GPU profile matches lipProfile',
  async run(renderer) {
    const { time, sets, ribbon } = setsRig();
    // Front/back samples are the sheet itself (their error is the sheet's own GPU/CPU gap); the rest are constructed.
    // Frame A: the GPU frame against the CPU frame on the CPU base (the ruling's rule; excess over frameTol, > 0 fails).
    // Frame B: the mirror alone: the CPU profileFrame fed the GPU's own four base samples, against the GPU frame. A
    // station failing A but passing B differs only through the sheet's GPU/CPU gap (amplified by the frame's maths).
    const edge = new Worst(), constructed = new Worst(), skirt = new Worst(), extras = new Worst();
    const frameA = new Worst(), frameB = new Worst();
    frameA.value = frameB.value = -Infinity;
    const perField = FRAME_LAYOUT.map(() => 0);
    let stations = 0, deadLive = 0, unexplained = 0;
    const failuresA: string[] = [];
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
        const g = gf.subarray(i * FRAME_FLOATS, (i + 1) * FRAME_FLOATS);
        const cf = packFrameCpu(prof.frame);
        const isDrawn = drawn(e, prof.frame);
        let failA = false;
        cf.forEach((c, m) => {
          const err = Math.abs(g[m] - c);
          perField[m] = Math.max(perField[m], err);
          if (GEOMETRY_ONLY.has(FRAME_LAYOUT[m]) && !isDrawn) return;
          const excess = err - frameTol(c);
          frameA.see(excess, `${where} ${FRAME_LAYOUT[m]}`);
          if (excess > 0) failA = true;
        });
        // B: profileFrame on the GPU's base samples, in profileFrame's call order (K, F, Fb, the landing guess).
        const gpuBase: Vec2[] = [[g[0], g[1]], [g[2], g[3]], [g[FRAME_BASE_OFFSET], g[FRAME_BASE_OFFSET + 1]], [g[FRAME_BASE_OFFSET + 2], g[FRAME_BASE_OFFSET + 3]]];
        let call = 0;
        const mirrored = packFrameCpu(profileFrame(() => gpuBase[Math.min(call++, 3)], e, P));
        let failB = false;
        mirrored.forEach((c, m) => {
          const excess = Math.abs(g[m] - c) - frameTol(c);
          frameB.see(excess, `${where} ${FRAME_LAYOUT[m]}`);
          if (excess > 0) failB = true;
        });
        if (failA) {
          if (failB) unexplained++;
          if (failuresA.length < 6) {
            const f = prof.frame, at = (n: (typeof FRAME_LAYOUT)[number]) => g[FRAME_LAYOUT.indexOf(n)];
            failuresA.push(`${where}: tb ${e.tb === null ? 'null' : e.tb.toFixed(3)}, drop K.y − F.y CPU ${(f.K[1] - f.F[1]).toFixed(4)} GPU ${(at('K.y') - at('F.y')).toFixed(4)}, ` +
              `tauLand CPU ${f.tauLand.toFixed(4)} GPU ${at('tauLand').toFixed(4)}, vj CPU ${f.vj.toFixed(3)} GPU ${at('vj').toFixed(3)} (mirror on GPU base ${mirrored[FRAME_LAYOUT.indexOf('vj')].toFixed(3)}), ` +
              `weight CPU ${f.weight.toFixed(3)} GPU ${at('weight').toFixed(3)}; mirror ${failB ? 'FAILS' : 'passes'}`);
          }
        }
        if (Math.hypot(e.x, e.z) < 3) peaks.push(`dt ${dt} (${e.x.toFixed(1)},${e.z.toFixed(1)}) tb ${e.tb === null ? 'null' : e.tb.toFixed(2)} prog ${prof.frame.prog.toFixed(2)} weight ${prof.frame.weight.toFixed(2)}`);
      });
    }
    // Positions are what the ribbon draws; the frame passes when the mirror is exact (B) and every A failure is explained by B.
    // Bounds (controller ruling): the constructed samples are the mirror (5 mm). The edge samples and the skirts are pure
    // sheet evaluations, so they measure the sheet's own f32 GPU/CPU gap (pinned by breaker.selftest), not the mirror:
    // 1 cm. Extras 2e-3: rho and curlFoam amplify the same gap through the frame's timings.
    const ok = stations > 0 && deadLive === 0 && constructed.value < 5e-3 && Math.max(edge.value, skirt.value) < 1e-2 &&
      frameB.value <= 0 && unexplained === 0 && extras.value < 2e-3;
    const fields = FRAME_LAYOUT.map((n, m) => `${n} ${perField[m].toExponential(1)}`).join(', ');
    return {
      pass: ok,
      detail: `${stations} live stations × dt ${PROFILE_DTS.join('/')} s; worst |Δpos| (m) constructed ${constructed} (< 5e-3, the mirror), ` +
        `edge samples ${edge} and skirts ${skirt} (< 1e-2: pure sheet evaluations, so the sheet's own GPU/CPU gap, which breaker.selftest pins); frame A (vs the CPU base; excess over 1e-3·max(1, |v|), geometry-only fields where drawn) worst ${frameA}, ` +
        `frame B (the mirror on the GPU's base samples) worst ${frameB} (≤ 0), A failures not explained by B ${unexplained}; worst |Δextras| (thickness, lipness, curlFoam, rho; < 2e-3: rho and curlFoam carry the sheet's gap through the frame's timings) ${extras}; live rows flagged dead ${deadLive}. ` +
        `Per frame field |Δ| (all stations): ${fields}. A failures: ${failuresA.join(' | ') || 'none'}. Near the peak: ${peaks.slice(0, 8).join('; ')}`,
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
    // Where the lip is thrown the blend must engage: the most constructed face or lip sample of those stations.
    const frameAt = (i: number, name: (typeof FRAME_LAYOUT)[number]): number => gf[i * FRAME_FLOATS + FRAME_LAYOUT.indexOf(name)];
    let lipConstructed = 0, peaks = 0;
    entries.forEach((e, i) => {
      if (e.gap || !(frameAt(i, 'weight') > 0.9 && frameAt(i, 'prog') > 0.3)) return;
      peaks++;
      for (let j = PROFILE_SEGMENTS.front; j < PROFILE_SAMPLES - PROFILE_SEGMENTS.back; j++) lipConstructed = Math.max(lipConstructed, gd[(i * V + j + 1) * 4 + 3]);
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
    const o: BreakOptions = { sample: (x, z) => sampleField(field, x, z), params: P };
    const frameAt = (i: number, name: (typeof FRAME_LAYOUT)[number]): number => gf[i * FRAME_FLOATS + FRAME_LAYOUT.indexOf(name)];
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
      const peak = Math.hypot(e.x, e.z) < 15 && frameAt(i, 'weight') > 0.9 && frameAt(i, 'prog') > 0.3;
      if (peak) peakStations++;
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
        if (peak && SEGMENT_OF_SAMPLE[j] === SEGMENT_ID.under && !(gn[k + 1] <= underMax)) { underMax = gn[k + 1]; underAt = `#${i} j ${j}`; }
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
        `${peakStations} peak stations with a thrown lip (|xz| < 15 m, weight > 0.9, prog > 0.3); highest underside normal y ${underMax.toFixed(3)} (${underAt}; < 0)`,
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
    const o: BreakOptions = { sample: (x, z) => sampleField(field, x, z), params: P };
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
    const frameAt = (i: number, name: (typeof FRAME_LAYOUT)[number]): number => gf[i * FRAME_FLOATS + FRAME_LAYOUT.indexOf(name)];
    const mirror = new Worst(), place = new Worst(), edges = new Worst(), skirts = new Worst();
    let live = 0, peaks = 0, faceShort = Infinity, faceAt = '';
    entries.forEach((e, i) => {
      if (e.gap) return;
      live++;
      const pts = Array.from({ length: PROFILE_SAMPLES }, (_, j): Vec2 => {
        const k = (i * V + j + 1) * 4;
        return [(gp[k] - e.x) * e.nx + (gp[k + 2] - e.z) * e.nz, gp[k + 1]];
      });
      const dev = developedU(pts, frameAt(i, 'uFront'), frameAt(i, 'uBack'));
      for (let j = 0; j < PROFILE_SAMPLES; j++) {
        const k = (i * V + j + 1) * 4;
        mirror.see(Math.abs(gd[k + 2] - dev[j]), `#${i} j ${j}`);
        place.see(Math.max(Math.abs(gd[k] - (e.x + e.nx * gd[k + 2])), Math.abs(gd[k + 1] - (e.z + e.nz * gd[k + 2]))), `#${i} j ${j}`);
      }
      for (const j of [0, LAST]) {
        const k = (i * V + j + 1) * 4;
        edges.see(Math.max(Math.abs(gd[k] - gh[k]), Math.abs(gd[k + 1] - gh[k + 1])), `#${i} ${j === 0 ? 'front' : 'back'}`);
      }
      const s0 = i * V * 4, s1 = (i * V + V - 1) * 4, e0 = (i * V + 1) * 4, e1 = (i * V + PROFILE_SAMPLES) * 4;
      skirts.see(Math.max(...[0, 1, 2].map((m) => Math.max(Math.abs(gd[s0 + m] - gd[e0 + m]), Math.abs(gd[s1 + m] - gd[e1 + m])))), `#${i}`);
      // Where the lip is thrown, the face gets a face's worth of detail: its developed span is its own arc length.
      if (frameAt(i, 'weight') > 0.9 && frameAt(i, 'prog') > 0.3) {
        peaks++;
        const f0 = PROFILE_SEGMENTS.front, f1 = f0 + PROFILE_SEGMENTS.face;
        let arc = 0;
        for (let j = f0 + 1; j <= f1; j++) arc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
        const span = gd[(i * V + f0 + 1) * 4 + 2] - gd[(i * V + f1 + 1) * 4 + 2];
        const homeSpan = gh[(i * V + f0 + 1) * 4] * e.nx + gh[(i * V + f0 + 1) * 4 + 1] * e.nz - (gh[(i * V + f1 + 1) * 4] * e.nx + gh[(i * V + f1 + 1) * 4 + 1] * e.nz);
        const ratio = span / Math.max(arc, 1e-9);
        if (ratio < faceShort) { faceShort = ratio; faceAt = `#${i}: face arc ${arc.toFixed(2)} m, developed span ${span.toFixed(2)} m, home span ${homeSpan.toFixed(2)} m`; }
      }
    });
    const ok = live > 0 && mirror.value < 1e-3 && place.value < 1e-3 && edges.value <= 1e-5 && skirts.value === 0 && peaks > 0 && faceShort > 0.99;
    return {
      pass: ok,
      detail: `${live} live stations at dt 0.6 s; worst |GPU developed u − developedU on the GPU's positions| ${mirror} m (< 1e-3); ` +
        `worst |detail xz − (S + n·u)| ${place} m (< 1e-3); worst |detail − home| at the edges ${edges} m (≤ 1e-5); skirts vs their edge ${skirts} (0); ` +
        `${peaks} stations with a thrown lip, lowest face developed span / face arc ${faceShort.toFixed(4)} (> 0.99) [${faceAt}]`,
    };
  },
});
