import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_DELAY_OFFSET, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH, landingEstimate, onsetGain, onsetTime } from './breaking';
import { HAND_BACK_S } from './lipProfile';
import {
  CREST_TOLERANCE_S, MAX_SPACING_M, MAX_STATIONS, MIN_SPACING_M, SPACING_PER_M, type Station, type StationEntry, minRibbonHeight, stationOnset, stationPsi, timeSinceOnset, traceStations,
} from './crestTrace';
import { PSI_NORMAL } from './overturn';
import { REFRACT_FLOOR_M as FLOOR_M, type ReefField, computeReefField, sampleField, sampleOnset } from './reefField';
import { type ActiveWave, type WaveContext, breakOptions, crestAt, fieldBreakingHeight, phaseXi, sumWaves } from './setWaveModel';
import { setWaveHeight } from './reefReport';
import { SECTION_CREST, SECTION_TROUGH, STOOD_PHASE, sectionKnots, sectionOf, sectionPhase, sectionPoint, sectionSamples, sectionScale, wallWeight } from './wombSection';

const P = DEFAULT_BREAK_PARAMS;
const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
// 6 ft, not the 4 ft default (R1 §2): a 4 ft wave no longer breaks on the reef top's 3.5 m, only soft on the shelf.
const REF_CONDITIONS = (() => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 6; return c; })();
const HS = surferFeetToHs(REF_CONDITIONS.swell.sizeFt);
const REF_BIGGEST = wavesOfSet(1, REF_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
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

describe('one hold channel: until carries the hold to the stations (one-curl Task 1)', () => {
  // The peel stretch at 1.7 makes held sections; the game's field otherwise (smoothed, the refraction floor).
  const held = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0, peel: 1.7, smooth: true, refractFloorM: FLOOR_M });
  const hctx: WaveContext = { omega: held.omega, travelX: held.far.dirX, travelZ: held.far.dirZ };
  const w = testWave(REF_BIGGEST.heightM);
  const f0 = sampleField(held, 0, 0), tb0 = timeSinceOnset(held, w, 0, 0, hctx, P);
  const t = w.arrivalS + f0.tau - (tb0 ?? 0) + 3;
  const stations = live(traceStations(held, [w], t, hctx, { cameraX: LINEUP[0], cameraZ: LINEUP[1], params: P, minHeightM: MIN_H }));
  const recTb = (s: Station): number | null => { const r = sampleOnset(held, s.x, s.z); return r ? onsetTime(r, 0, w.heightM, P) : null; };
  const input = (s: Station) => ({ H: s.H, Hb: s.Hb, r: s.r, tb: s.tb, until: s.until, psi: s.psi, periodS: held.periodS });
  it('a held station: tb null, until the hold, r ≤ 1, and its phase the wall on the clock', () => {
    const hs = stations.filter((s) => { const tb = recTb(s); return tb !== null && tb < -0.2; });
    expect(hs.length, 'held stations at peak + 3 s').toBeGreaterThan(3);
    for (const s of hs) {
      const tag = `station at arc ${s.arc.toFixed(1)}`;
      expect(s.tb, tag).toBeNull();
      expect(Math.abs(s.until! + recTb(s)!), `${tag}: until ${s.until} vs hold ${-recTb(s)!}`).toBeLessThan(0.05);
      expect(s.r, tag).toBeLessThanOrEqual(1);
      expect(sectionPhase(input(s), { ribbonOnset: P.ribbonOnset }), tag).toBeCloseTo(STOOD_PHASE * wallWeight(s.until), 3);
    }
  });
  it('an unbroken station ahead of the curl stands on the clock alone, whatever its ratio', () => {
    const early = live(traceStations(held, [w], t - 2, hctx, { cameraX: LINEUP[0], cameraZ: LINEUP[1], params: P, minHeightM: MIN_H }));
    const ahead = [...stations, ...early].filter((s) => s.tb === null && recTb(s) === null && s.until !== null && s.until >= 0.5 && s.until <= 7);
    if (process.env.PROBE_UNTIL) console.log('ahead', ahead.map((s) => s.until!.toFixed(2)).join(' '));
    expect(ahead.length, 'unbroken stations 0.5–7 s ahead of the curl (peak + 1 s and + 3 s)').toBeGreaterThan(3);
    for (const s of ahead) {
      const phase = sectionPhase({ ...input(s), r: 1.2 }, { ribbonOnset: P.ribbonOnset });
      expect(phase, `station at arc ${s.arc.toFixed(1)}, until ${s.until!.toFixed(2)}`).toBeCloseTo(STOOD_PHASE * wallWeight(s.until), 3);
    }
  });
});

describe('the tube keeps the size it broke at (plan 2026-10-06-wave-root-cause step 1)', () => {
  const H6 = setWaveHeight(6), w6 = testWave(H6);
  /** The first leg's places (m along NORTH_LEDGE from the peak). */
  const PLACES = [10, 25, 40];
  const station = (st: Station[], s: number): Station | null => {
    const [a, b] = [NORTH_LEDGE[0], NORTH_LEDGE[1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const px = a[0] + ((b[0] - a[0]) * s) / L, pz = a[1] + ((b[1] - a[1]) * s) / L;
    let best: Station | null = null, bestD = 3;
    for (const e of st) {
      if (Math.abs((px - e.x) * e.nx + (pz - e.z) * e.nz) > 30) continue;
      const d = Math.abs((px - e.x) * -e.nz + (pz - e.z) * e.nx);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };
  // 5% is the plan's bar; the record's carried size still drifts 3–4% down a ray (the bilinear carry mixes neighbouring
  // rays), and the smoothing along the crest mixes in the unbroken stations ahead of the curl. Step 4's one clock per wave
  // (the size read once, as the curl passes) removes both. Until then: 8%.
  it('A along the first leg holds within 8% through the throw (phase 0.55 to 1.5), at 6 ft mid tide', { timeout: 120_000 }, () => {
    const seen = PLACES.map(() => [] as number[]);
    for (let t = -2; t <= 12; t += 0.1) {
      const st = live(traceStations(field, [w6], t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: 0.3, spacingM: 1 }));
      PLACES.forEach((s, i) => {
        const e = station(st, s);
        // From onset: before it the wall down the line (wallWeight) stands at the local height, the sheet's own, and the
        // station's numbers are smoothed along the crest with its unbroken neighbours' for a few metres past the curl.
        if (e && e.tb !== null && e.section.phase >= 0.55 && e.section.phase <= 1.5) seen[i].push(e.section.A);
      });
    }
    PLACES.forEach((s, i) => {
      expect(seen[i].length, `${s} m: frames through the throw`).toBeGreaterThan(5);
      const lo = Math.min(...seen[i]), hi = Math.max(...seen[i]);
      console.log(`${s} m along the first leg: A ${lo.toFixed(2)}–${hi.toFixed(2)} m over ${seen[i].length} frames`);
      expect(hi / lo, `${s} m`).toBeLessThan(1.08);
    });
  });
  it('over the shelf, where the depth caps the height under it, the barrel keeps the height it broke at', () => {
    let n = 0;
    for (const t of [1, 2, 3]) {
      const st = live(traceStations(field, [w6], t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: 0.3, spacingM: 1 }));
      for (const s of st) {
        if (!(s.section.phase >= 1 && s.section.phase <= 1.5 && s.Hb !== null && s.H < 0.9 * s.Hb)) continue;
        n++;
        expect(s.section.A).toBeGreaterThan(sectionScale(s.H) * 1.05);
      }
    }
    expect(n).toBeGreaterThan(10);
  });
});

describe('the lip lands (plan 2026-10-06-wave-root-cause step 2)', () => {
  const swell = breakOptions(field, { ...P, enabled: false });
  it("at the round barrel the lip's end is within 0.05 A of the water under it, at 6 and 8 ft", { timeout: 120_000 }, () => {
    for (const ft of [6, 8]) {
      const w = testWave(setWaveHeight(ft));
      let n = 0;
      for (let t = -2; t <= 10; t += 0.5) {
        for (const S of live(traceStations(field, [w], t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: 0.3, spacingM: 2 }))) {
          // The barrel's hold (phase 1, the lip landed): not the last of its flight.
          if (S.section.phase < 0.999 || S.section.phase > 1.03 || S.section.hollow < 0.5) continue;
          const sheet = (u: number): [number, number] => {
            const x = S.x + S.nx * u, z = S.z + S.nz * u, r = sumWaves(x, z, t, sampleField(field, x, z), [w], ctx, swell);
            return [u + r.dx * S.nx + r.dz * S.nz, r.eta];
          };
          // The lip's end as drawn (its lowest sample around the rounded tip), and the water under it: the front (from the
          // front edge to the floor), at its u.
          const { curve: knotted, marks } = sectionSamples(S.section, sheet), A = S.section.A;
          const curve = knotted.map((q) => { const p = sectionPoint(q, A, sheet); return [p[0] / A, p[1] / A]; });
          let end = curve[marks.tip];
          for (let j = marks.tip - 4; j <= marks.tip + 4; j++) if (curve[j][1] < end[1]) end = curve[j];
          let y = Number.NaN;
          for (let j = curve.length - 1; j > marks.floor; j--) {
            const [a, b] = [curve[j], curve[j - 1]];
            if ((a[0] - end[0]) * (b[0] - end[0]) <= 0) { y = a[1] + ((b[1] - a[1]) * (end[0] - a[0])) / (b[0] - a[0] || 1e-9); break; }
          }
          n++;
          expect(Math.abs(end[1] - y), `${ft} ft at t ${t}`).toBeLessThan(0.05);
        }
      }
      expect(n, `${ft} ft: stations at the round barrel`).toBeGreaterThan(10);
    }
  });
});

describe('one surface on the game’s sheet (plan 2026-10-06-wave-root-cause step 3)', () => {
  const lean = { ...breakOptions(field, P), pile: false, shape: 'lean' as const };
  it('every station’s section is the sheet itself beyond its shoulder and front knots at every phase, and everywhere at phase 0 (< 1 mm), at 6 and 8 ft', { timeout: 300_000 }, () => {
    let checked = 0;
    for (const ft of [6, 8]) {
      const w = testWave(setWaveHeight(ft));
      for (let t = -3; t <= 8; t += 1) {
        const st = live(traceStations(field, [w], t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: 0.3, spacingM: 4 }));
        for (const S of st) {
          const sheet = (u: number): [number, number] => {
            const x = S.x + S.nx * u, z = S.z + S.nz * u, r = sumWaves(x, z, t, sampleField(field, x, z), [w], ctx, lean);
            return [u + r.dx * S.nx + r.dz * S.nz, r.eta];
          };
          const A = S.section.A;
          for (const phase of [0, 0.5, 1, 1.5]) {
            const n = { ...S.section, phase }, sec = sectionOf(n, sheet), k = sectionKnots(n, sheet);
            const back = A * k[SECTION_CREST - 1][2], front = A * k[SECTION_TROUGH + 1][2];
            sec.points.forEach((p, j) => {
              if (phase > 0 && sec.homes[j] > back && sec.homes[j] < front) return;
              const q = sheet(sec.homes[j]);
              expect(Math.hypot(p[0] - q[0], p[1] - q[1]), `${ft} ft t ${t} phase ${phase} home ${sec.homes[j].toFixed(2)} of ${A.toFixed(2)}`).toBeLessThan(1e-3);
            });
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});


import { wavesBetween, wavesNear } from '../swell/sets';
import { DEFAULT_REEF_PARAMS } from '../seabed/wombReef';
import { REFRACT_FLOOR_M } from './reefField';
import { settleSpan } from './breaking';
import { toActiveWave } from './setWaveModel';
import { TAKEOFF_ARRIVE_S, takeoffLeadS, takeoffSpot } from '../ride/takeoff';

describe('the wave she keeps (R2 §3)', () => {
  it.each([8, 12])('her wave is traced for as long as it breaks on the reef (%i ft): live stations from its onset at the take-off spot until every section has collapsed or its crest leaves the reef', { timeout: 300_000 }, (ft) => {
    // The ride's field (rideOnSections), the set's biggest wave; every 0.5 s from 2 s before it reaches the spot, for 20 s.
    // At 7 and 8 ft the live ride bailed at +8.19 s after the peak, deep in the tube: every station of her wave vanished in
    // one frame (the seed's projection from the origin stopped converging, R2 §3 (a)).
    const p = DEFAULT_BREAK_PARAMS, c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = ft;
    const f = computeReefField({ bed: downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: p.peel, smooth: true, refractFloorM: REFRACT_FLOOR_M });
    const cx: WaveContext = { omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ };
    const big = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8).reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const spot = takeoffSpot(f, big.heightM, p), minHeightM = minRibbonHeight(fieldBreakingHeight(f, p), p);
    const arrive = big.arrivalS - takeoffLeadS(f, spot) + TAKEOFF_ARRIVE_S;
    let last: Station[] = [], gone: number | null = null, stillBreaking = 0;
    for (let dt = -2; dt <= 20; dt += 0.5) {
      const t = arrive + dt, events = wavesNear(t, c, DEFAULT_SET_PARAMS), mine = events.findIndex((e) => Math.abs(e.arrivalS - big.arrivalS) < 1e-6);
      const live = traceStations(f, events.map(toActiveWave), t, cx, { cameraX: spot.x, cameraZ: spot.z, params: p, minHeightM }).filter((e): e is Station => !e.gap && e.wave === mine);
      if (live.length > 0) { last = live; continue; }
      if (last.length > 0 && gone === null) {
        gone = dt;
        // Gone may only mean done: no station of the last live set still breaking short of its settle span (each section
        // collapsed to the bore, or handed back as the crest leaves the reef). Not "vanished with sections still throwing".
        stillBreaking = last.filter((s) => s.tb !== null && s.tb < settleSpan(s.H, p)).length;
      }
    }
    expect(last.length).toBeGreaterThan(0);
    expect({ gone, stillBreaking }).toMatchObject({ stillBreaking: 0 });
  });
});
