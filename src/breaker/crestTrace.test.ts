import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_REACH_S } from './breaking';
import {
  MAX_SPACING_M, MAX_STATIONS, MIN_SPACING_M, SPACING_PER_M, type Station, type StationEntry, minRibbonHeight, timeSinceOnset, traceStations,
} from './crestTrace';
import { computeReefField, sampleField } from './reefField';
import { type ActiveWave, type WaveContext, fieldBreakingHeight, phaseXi } from './setWaveModel';

const P = DEFAULT_BREAK_PARAMS;
const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const HS = surferFeetToHs(DEFAULT_CONDITIONS.swell.sizeFt);
const REF_BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const testWave = (heightM: number): ActiveWave => ({ arrivalS: 0, heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 });
const MIN_H = minRibbonHeight(fieldBreakingHeight(field, P), P);
const LINEUP: [number, number] = [-25, 45];
const trace = (waves: ActiveWave[], t: number, cam: [number, number] = LINEUP): StationEntry[] =>
  traceStations(field, waves, t, ctx, { cameraX: cam[0], cameraZ: cam[1], params: P, minHeightM: MIN_H });
const live = (e: StationEntry[]): Station[] => e.filter((s): s is Station => !s.gap);
/** Position along a ledge polyline's first segment from its start (m). */
const alongLedge = (line: readonly (readonly [number, number])[], x: number, z: number): number => {
  const [a, b] = [line[0], line[1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / len;
};

describe('crestTrace', () => {
  const big = testWave(REF_BIGGEST.heightM), peeler = testWave(1.8 * HS);

  it('every station sits on its crest (|ξ| < 2 ms) and a trace takes a few ms at most', () => {
    for (const w of [big, peeler]) for (const t of [-1, 0, 1, 2, 3, 4]) {
      const st = live(trace([w], t));
      for (const s of st) expect(Math.abs(phaseXi(s.x, s.z, t, sampleField(field, s.x, s.z), w, ctx))).toBeLessThan(2e-3);
    }
    const times: number[] = [];
    for (let i = 0; i < 10; i++) { const t0 = performance.now(); trace([peeler, big], 2); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    console.log(`trace (two waves) median ${times[5].toFixed(2)} ms, stations ${trace([peeler, big], 2).length}`);
    // A regression guard, not the budget: wall-clock time under the parallel suite measures worker contention. The
    // 2 ms per-frame target (plan Q7) is measured in the running app.
    expect(times[5]).toBeLessThan(20);
  });

  it('a fixed spacingM traces the same stations wherever the camera is (spray emitters, offshore-spray plan S1)', () => {
    const base = { params: P, minHeightM: MIN_H, spacingM: 1.5 };
    const a = traceStations(field, [peeler], 2, ctx, { ...base, cameraX: 0, cameraZ: 0 });
    const b = traceStations(field, [peeler], 2, ctx, { ...base, cameraX: 500, cameraZ: -300 });
    expect(b).toEqual(a);
    const st = live(a);
    expect(st.length).toBeGreaterThan(20);
    for (let i = 1; i < st.length; i++) {
      if (st[i].wave !== st[i - 1].wave) continue;
      const d = Math.abs(st[i].arc - st[i - 1].arc);
      if (d < 3) expect(d).toBeCloseTo(1.5, 1);
    }
  });

  it('spaces stations by distance from the camera, within the cap', () => {
    const cam: [number, number] = [8, 2];
    const st = live(trace([peeler], 2, cam));
    expect(st.length).toBeGreaterThan(50);
    for (let i = 1; i < st.length; i++) {
      const a = st[i - 1], b = st[i];
      if (a.wave !== b.wave || Math.abs(b.arc - a.arc) > 5) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      const rule = Math.min(MAX_SPACING_M, Math.max(MIN_SPACING_M, SPACING_PER_M * Math.hypot(a.x - cam[0], a.z - cam[1])));
      expect(d).toBeGreaterThan(rule * 0.5);
      expect(d).toBeLessThan(rule * 1.5);
    }
    const crowded = trace([peeler, big, testWave(1.6 * HS)], 2, [10, 0]);
    expect(crowded.length).toBeLessThanOrEqual(MAX_STATIONS);
  });

  it('is deterministic, and separates waves and undrawn stretches with single gaps', () => {
    const a = trace([big, peeler], 2), b = trace([big, peeler], 2);
    expect(a).toEqual(b);
    expect(a[0].gap).toBe(false);
    expect((a.at(-1) as StationEntry).gap).toBe(false);
    for (let i = 1; i < a.length; i++) expect(a[i].gap && a[i - 1].gap).toBe(false);
  });

  it('traces nothing for a wave too small to steepen, a lull, or a flat day', () => {
    expect(trace([testWave(0.3 * MIN_H)], 0)).toEqual([]);
    expect(trace([], 0)).toEqual([]);
  });

  it('the left peels north along the ledge at 8–20 m/s (time since onset falls toward the shoulder)', () => {
    // P8: the 1.8·Hs wave peels over the first 100 m. Stations north of the peak on the north ledge's first segment.
    const t = 6;
    const st = live(trace([peeler], t)).filter((s) => s.tb !== null && Number.isFinite(s.tb) && s.tb > 0.05 && s.z < 0);
    const pts = st.map((s) => ({ d: alongLedge(NORTH_LEDGE, s.x, s.z), tb: s.tb as number })).filter((p) => p.d > 5 && p.d < 110);
    expect(pts.length).toBeGreaterThan(10);
    const n = pts.length, md = pts.reduce((a, p) => a + p.d, 0) / n, mt = pts.reduce((a, p) => a + p.tb, 0) / n;
    const slope = pts.reduce((a, p) => a + (p.d - md) * (p.tb - mt), 0) / pts.reduce((a, p) => a + (p.d - md) ** 2, 0);
    console.log(`peel: ${n} stations, d ${pts[0].d.toFixed(0)}..${pts.at(-1)?.d.toFixed(0)} m, speed ${(-1 / slope).toFixed(1)} m/s`);
    expect(-1 / slope).toBeGreaterThan(8);
    expect(-1 / slope).toBeLessThan(20);
  });

  it('the right closes out: the south ledge’s first 40 m broke within 1.5 s of each other', () => {
    const w = peeler;
    let checked = 0;
    for (const t of [1, 1.5, 2]) {
      const st = live(trace([w], t)).filter((s) => s.tb !== null && Number.isFinite(s.tb));
      const onSouth = st.filter((s) => { const d = alongLedge(SOUTH_LEDGE, s.x, s.z); return d > 0 && d < 40 && s.z > 0; });
      if (onSouth.length < 5) continue;
      const tbs = onSouth.map((s) => s.tb as number);
      console.log(`closeout t ${t}: ${onSouth.length} stations, onset spread ${(Math.max(...tbs) - Math.min(...tbs)).toFixed(2)} s`);
      expect(Math.max(...tbs) - Math.min(...tbs)).toBeLessThan(1.5);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('timeSinceOnset: null before breaking, grows with the crest, Infinity past the record (13 s)', () => {
    const f0 = sampleField(field, 0, 0);
    // The crest at the peak at t = τ(0,0) = 0, then points shoreward along the ray.
    expect(timeSinceOnset(field, testWave(0.5), 0, 0, ctx, P)).toBeNull();
    const along = (d: number): [number, number] => [f0.dirX * d, f0.dirZ * d];
    const seq = [0, 5, 10, 20].map((d) => timeSinceOnset(field, peeler, ...along(d), ctx, P));
    console.log(`tb along the ray from the peak: ${seq.map((v) => (v === null ? 'null' : v.toFixed(2))).join(', ')}`);
    for (let i = 1; i < seq.length; i++) if (seq[i - 1] !== null && seq[i] !== null && Number.isFinite(seq[i] as number)) expect(seq[i] as number).toBeGreaterThanOrEqual(seq[i - 1] as number);
    // 80 m in: long past the hand-back (the ribbon has dropped the section), but within the record's 13 s, so finite.
    const far = timeSinceOnset(field, peeler, ...along(80), ctx, P) as number;
    expect(far).toBeGreaterThan(8);
    expect(far).toBeLessThanOrEqual(ONSET_REACH_S);
    expect(timeSinceOnset(field, peeler, ...along(160), ctx, P)).toBe(Infinity);
  });
});
