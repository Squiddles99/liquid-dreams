import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_DELAY_OFFSET, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH, landingEstimate, onsetGain } from './breaking';
import { HAND_BACK_S } from './lipProfile';
import {
  CREST_TOLERANCE_S, MAX_SPACING_M, MAX_STATIONS, MIN_SPACING_M, SPACING_PER_M, type Station, type StationEntry, minRibbonHeight, stationOnset, stationPsi, timeSinceOnset, traceStations,
} from './crestTrace';
import { PSI_NORMAL } from './overturn';
import { type ReefField, computeReefField, sampleField } from './reefField';
import { type ActiveWave, type WaveContext, breakOptions, crestAt, fieldBreakingHeight, phaseXi } from './setWaveModel';
import { cloneConditions } from '../conditions/defaults';

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

/** When the peak's section broke (the crest's arrival at (0, 0) less its time since onset there). */
const peakBreak = (w: ActiveWave): number => {
  const f = sampleField(field, 0, 0), tb = timeSinceOnset(field, w, 0, 0, ctx, P);
  return w.arrivalS + f.tau - (tb ?? 0);
};

describe('crestTrace', () => {
  const big = testWave(REF_BIGGEST.heightM), peeler = testWave(1.8 * HS);

  it('every station sits on its crest (|ξ| < 2 ms) and a trace takes a few ms at most', () => {
    for (const w of [big, peeler]) for (const t of [-1, 0, 1, 2, 3, 4]) {
      const st = live(trace([w], t));
      // Stations kept on only by the tube's hold (TUBE_HOLD_S, 2026-10-03: old bore, its crest flat) within the trace's own
      // acceptance (CREST_TOLERANCE_S; 7 ms at the peak's bore 4.2 s after it broke); the rest within 2 ms (ruling).
      for (const s of st) {
        const old = s.tb !== null && s.tb > landingEstimate(s.H, P) * (1 + P.collapseTime) + HAND_BACK_S;
        expect(Math.abs(phaseXi(s.x, s.z, t, sampleField(field, s.x, s.z), w, ctx))).toBeLessThan(old ? CREST_TOLERANCE_S : 2e-3);
      }
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
    // P8: the 1.8·Hs wave peels over the first 100 m. Stations north of the peak on the north ledge's first segment,
    // 6.9 s after the peak broke (it broke 0.9 s before the crest reached (0, 0) on the old ledge, where this was t = 6).
    const t = peakBreak(peeler) + 6.9;
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
    // Each section's break time (its crest's arrival less its time since onset, from the onset record carried along its
    // ray), at points on the south ledge's first 40 m. On the softened ramp the sections break ~100 m seaward: a trace's
    // stations projecting onto those 40 m then swept in crest far from the ledge (283 stations, 1.53 s).
    const w = peeler, [a, b] = [SOUTH_LEDGE[0], SOUTH_LEDGE[1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const times: number[] = [];
    for (let d = 0; d <= 40; d += 2) {
      const x = a[0] + ((b[0] - a[0]) * d) / len, z = a[1] + ((b[1] - a[1]) * d) / len;
      const tb = timeSinceOnset(field, w, x, z, ctx, P);
      if (tb !== null) times.push(w.arrivalS + sampleField(field, x, z).tau - tb);
    }
    expect(times.length).toBeGreaterThan(15);
    console.log(`closeout: ${times.length} sections, break spread ${(Math.max(...times) - Math.min(...times)).toFixed(2)} s`);
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(1.5);
  });

  it('timeSinceOnset: null before breaking, grows with the crest, however long ago it broke', () => {
    const f0 = sampleField(field, 0, 0);
    // The crest at the peak at t = τ(0,0) = 0, then points shoreward along the ray.
    expect(timeSinceOnset(field, testWave(0.5), 0, 0, ctx, P)).toBeNull();
    const along = (d: number): [number, number] => [f0.dirX * d, f0.dirZ * d];
    const seq = [0, 5, 10, 20].map((d) => timeSinceOnset(field, peeler, ...along(d), ctx, P));
    console.log(`tb along the ray from the peak: ${seq.map((v) => (v === null ? 'null' : v.toFixed(2))).join(', ')}`);
    for (let i = 1; i < seq.length; i++) if (seq[i - 1] !== null && seq[i] !== null && Number.isFinite(seq[i] as number)) expect(seq[i] as number).toBeGreaterThanOrEqual(seq[i - 1] as number);
    // 80 m and 160 m in: long past the hand-back (the ribbon has dropped the section), and still counting (the record is
    // carried along the rays, with no reach limit: the whitewater pile decays on it).
    const far = timeSinceOnset(field, peeler, ...along(80), ctx, P) as number, further = timeSinceOnset(field, peeler, ...along(160), ctx, P) as number;
    expect(far).toBeGreaterThan(8);
    expect(Number.isFinite(further)).toBe(true);
    expect(further).toBeGreaterThan(far);
  });
});

describe('station ψ (barrel from the maths)', () => {
  const c12 = cloneConditions(DEFAULT_CONDITIONS); c12.swell.sizeFt = 12;
  const big = wavesOfSet(1, c12, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const w = testWave(big.heightM);
  const t = sampleField(field, 0, 0).tau + 0.5;
  it("each station's ψ is the sheet's crest ψ there (the lip lands on water drained for its own shape)", () => {
    const input = { cameraX: 0, cameraZ: 0, params: DEFAULT_BREAK_PARAMS, minHeightM: 0, offshoreMs: 5 };
    const o = breakOptions(field, DEFAULT_BREAK_PARAMS, 5);
    const stations = traceStations(field, [w], t, ctx, input).filter((e): e is Station => !e.gap);
    expect(stations.length).toBeGreaterThan(20);
    let worst = 0, worstStored = 0;
    for (const s of stations) {
      const c = crestAt(s.x, s.z, t, sampleField(field, s.x, s.z), w, ctx, o);
      if (!c) continue;
      worst = Math.max(worst, Math.abs(c.psi - stationPsi(field, w, s.x, s.z, input)));
      worstStored = Math.max(worstStored, Math.abs(c.psi - s.psi));
    }
    expect(worst).toBeLessThan(1e-6);
    expect(worstStored).toBeLessThan(0.003); // stations between keys are interpolated (5% of a normal ψ)
  });
});

describe("each station's throw height (spec 2026-10-03 barrel-size, option A)", () => {
  it("is the sheet's crest lipH there: the tube hangs from the crest the sheet threw", () => {
    const big = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const w = testWave(big.heightM), t = sampleField(field, 0, 0).tau + 0.8;
    const input = { cameraX: 0, cameraZ: 0, params: DEFAULT_BREAK_PARAMS, minHeightM: 0 };
    const o = breakOptions(field, DEFAULT_BREAK_PARAMS, 0);
    const stations = traceStations(field, [w], t, ctx, input).filter((e): e is Station => !e.gap);
    let broken = 0, worst = 0;
    for (const s of stations) {
      const c = crestAt(s.x, s.z, t, sampleField(field, s.x, s.z), w, ctx, o);
      if (!c) continue;
      if (c.lipH === null) { expect(s.lipH).toBeNull(); continue; }
      broken++;
      worst = Math.max(worst, Math.abs((s.lipH ?? NaN) - c.lipH));
    }
    expect(broken).toBeGreaterThan(5);
    expect(worst).toBeLessThan(1e-6);
  });
});

describe("the crest's ψ at the reef grid's edge (final review I2)", () => {
  it('eases to PSI_NORMAL at the edge, so a crest crossing it keeps its shape', () => {
    const g = field.grid, w = testWave(REF_BIGGEST.heightM), input = { cameraX: 0, cameraZ: 0, params: P, minHeightM: 0 };
    const x1 = g.x0 + (g.nx - 1) * g.cellM, z1 = g.z0 + (g.nz - 1) * g.cellM;
    let worst = 0, inner = 0;
    for (let k = 1; k < 20; k++) {
      const x = g.x0 + ((x1 - g.x0) * k) / 20, z = g.z0 + ((z1 - g.z0) * k) / 20;
      // Just inside each of the four edges against just outside: the jump across the edge.
      for (const [a, b] of [[[x, g.z0 + 0.01], [x, g.z0 - 0.01]], [[x, z1 - 0.01], [x, z1 + 0.01]], [[g.x0 + 0.01, z], [g.x0 - 0.01, z]], [[x1 - 0.01, z], [x1 + 0.01, z]]] as const) {
        worst = Math.max(worst, Math.abs(stationPsi(field, w, a[0], a[1], input) - stationPsi(field, w, b[0], b[1], input)));
      }
      // Deep inside, the record's own ψ is untouched.
      inner = Math.max(inner, Math.abs(stationPsi(field, w, x, z, input) - PSI_NORMAL));
    }
    expect(worst).toBeLessThan(1e-3);
    expect(inner).toBeGreaterThan(0.01);
  });
});

describe('a held section reads as unbroken to the stations (spec 2026-10-04 §4)', () => {
  it('timeSinceOnset is null while the stretched clock is negative, the time once it runs', () => {
    const k = 5, q = ONSET_LEVEL_Q[k], heightM = 1 / (q * onsetGain(DEFAULT_BREAK_PARAMS));
    const fieldWith = (tb: number): ReefField => {
      const onset = new Float32Array(4 * ONSET_RECORD_LENGTH);
      for (let i = 0; i < 4; i++) { onset[i * ONSET_RECORD_LENGTH] = 1.3; for (let j = 0; j <= k + 1; j++) onset[i * ONSET_RECORD_LENGTH + 1 + 2 * j] = tb; }
      return { grid: { x0: 0, z0: 0, cellM: 1, nx: 2, nz: 2 }, onset } as unknown as ReefField;
    };
    const w = { heightM } as Parameters<typeof timeSinceOnset>[1];
    const ctx = { omega: 1, travelX: 1, travelZ: 0 };
    expect(timeSinceOnset(fieldWith(-0.5), w, 0.5, 0.5, ctx, DEFAULT_BREAK_PARAMS)).toBeNull();
    expect(timeSinceOnset(fieldWith(0.5), w, 0.5, 0.5, ctx, DEFAULT_BREAK_PARAMS)).toBeCloseTo(0.5, 5);
  });
});

describe("a held section's station carries the held ratio, so the ribbon stands as the sheet does (spec 2026-10-04 §3-4)", () => {
  it('stationOnset: held → tb null and r capped at 1; turned → the time and its ratio', () => {
    const k = 5, q = ONSET_LEVEL_Q[k], heightM = 1 / (q * onsetGain(DEFAULT_BREAK_PARAMS));
    const fieldWith = (tb: number, d: number): ReefField => {
      const onset = new Float32Array(4 * ONSET_RECORD_LENGTH);
      for (let i = 0; i < 4; i++) {
        onset[i * ONSET_RECORD_LENGTH] = 1.3;
        for (let j = 0; j <= k + 1; j++) { onset[i * ONSET_RECORD_LENGTH + 1 + 2 * j] = tb; onset[i * ONSET_RECORD_LENGTH + ONSET_DELAY_OFFSET + j] = d; }
      }
      return { grid: { x0: 0, z0: 0, cellM: 1, nx: 2, nz: 2 }, onset } as unknown as ReefField;
    };
    const w = { heightM } as Parameters<typeof stationOnset>[1];
    const held = { x: 0.5, z: 0.5, H: 3, r: 2.4, tb: null } as Station;
    stationOnset(fieldWith(-0.5, 2), w, held, DEFAULT_BREAK_PARAMS);
    expect(held.tb).toBeNull();
    expect(held.r).toBe(1);
    const late = { x: 0.5, z: 0.5, H: 3, r: 2.4, tb: null } as Station;
    stationOnset(fieldWith(5, 2), w, late, DEFAULT_BREAK_PARAMS);
    expect(late.tb).toBeCloseTo(5, 5);
    expect(late.r).toBeCloseTo(2.4, 6);
  });
});
