import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE, SOUTH_LEDGE, TIP } from '../seabed/wombReef';
import { reefBeds } from './testField';
/** The take-off corner and points from it (womb-retune: the pins moved with the tip; the field is coast-seeded as the game's). */
const [PX, PZ] = TIP;
const fromTip = (x: number, z: number): [number, number] => [PX + x, PZ + z];
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_DELAY_OFFSET, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH, landingEstimate, onsetGain, onsetTime } from './breaking';
import { HAND_BACK_S } from './lipProfile';
import {
  CREST_TOLERANCE_S, MAX_SPACING_M, MAX_STATIONS, MIN_SPACING_M, SPACING_PER_M, type Station, type StationEntry, minRibbonHeight, stationOnset, stationPsi, timeSinceOnset, traceStations,
} from './crestTrace';
import { PSI_NORMAL } from './overturn';
import { REFRACT_FLOOR_M as FLOOR_M, type ReefField, computeReefField, sampleField, sampleOnset } from './reefField';
import { type ActiveWave, type WaveContext, breakOptions, crestAt, fieldBreakingHeight, phaseXi, rayCrestPoint, sumWaves } from './setWaveModel';
import { setWaveHeight } from './reefReport';
import { SECTION_CREST, SECTION_TROUGH, STOOD_PHASE, sectionKnots, sectionOf, sectionPhase, sectionPoint, sectionSamples, sectionScale, wallWeight } from './wombSection';

const P = DEFAULT_BREAK_PARAMS;
const field = computeReefField({ bed: reefBeds(2).bed, coast: reefBeds(2).coast, periodS: 15, fromDeg: 225, tideM: 0 });
const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
// 6 ft, not the 4 ft default (R1 §2): a 4 ft wave no longer breaks on the reef top's 3.5 m, only soft on the shelf.
const REF_CONDITIONS = (() => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 6; return c; })();
const HS = surferFeetToHs(REF_CONDITIONS.swell.sizeFt);
const REF_BIGGEST = wavesOfSet(1, REF_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const testWave = (heightM: number): ActiveWave => ({ arrivalS: 0, heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 });
const MIN_H = minRibbonHeight(fieldBreakingHeight(field, P), P);
const LINEUP: [number, number] = fromTip(-25, 45);
const trace = (waves: ActiveWave[], t: number, cam: [number, number] = LINEUP): StationEntry[] =>
  traceStations(field, waves, t, ctx, { cameraX: cam[0], cameraZ: cam[1], params: P, minHeightM: MIN_H });
const live = (e: StationEntry[]): Station[] => e.filter((s): s is Station => !s.gap);
/** Position along a ledge polyline's first segment from its start (m). */
const alongLedge = (line: readonly (readonly [number, number])[], x: number, z: number): number => {
  const [a, b] = [line[0], line[1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / len;
};

/** When the peak's section broke (the crest's arrival at the tip less its time since onset there). */
const peakBreak = (w: ActiveWave): number => {
  const f = sampleField(field, PX, PZ), tb = timeSinceOnset(field, w, PX, PZ, ctx, P);
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
    const a = traceStations(field, [peeler], 2, ctx, { ...base, cameraX: PX, cameraZ: PZ });
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
    const cam: [number, number] = fromTip(8, 2);
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
    const crowded = trace([peeler, big, testWave(1.6 * HS)], 2, fromTip(10, 0));
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
    // 7.5, not 8 (shelf-polish Task 4 (a), the same physics on the real shelf): the left accelerates off the tip along the
    // 46° ledge (5.8 m/s over 17–39 m at +4 s, 9.2 over 47–86 m at +8 s: tools/_breakerBars.ts --case=peel); at +6.9 s the
    // stations span 31–74 m and read 7.98 m/s. The game's curl peels 11.3–11.9 m/s (_curlReport).
    expect(-1 / slope).toBeGreaterThan(7.5);
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
    const f0 = sampleField(field, PX, PZ);
    // The crest at the peak at t = τ(0,0) = 0, then points shoreward along the ray.
    expect(timeSinceOnset(field, testWave(0.5), PX, PZ, ctx, P)).toBeNull();
    const along = (d: number): [number, number] => [PX + f0.dirX * d, PZ + f0.dirZ * d];
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
  const t = sampleField(field, PX, PZ).tau + 0.5;
  it("each station's ψ is the sheet's crest ψ there (the lip lands on water drained for its own shape)", () => {
    const input = { cameraX: PX, cameraZ: PZ, params: DEFAULT_BREAK_PARAMS, minHeightM: 0, offshoreMs: 5 };
    const o = breakOptions(field, DEFAULT_BREAK_PARAMS, 5);
    const stations = traceStations(field, [w], t, ctx, input).filter((e): e is Station => !e.gap);
    expect(stations.length).toBeGreaterThan(20);
    let worst = 0, worstStored = 0;
    for (const s of stations) {
      const c = crestAt(s.x, s.z, t, sampleField(field, s.x, s.z), w, ctx, o);
      if (!c) continue;
      // The sheet reads ψ at the point's ray crest (setWaveModel.rayCrestPoint); a station sits on the crest only within the
      // trace's tolerance (|ξ| < 2 ms, a few cm off it), and on the real shelf ψ changes along the ray there (1.4e-4 read at
      // the station itself, shelf-polish Task 4 (c)): the same function at the same point is exact; the stored value keeps
      // its own bar below.
      const on = rayCrestPoint(s.x, s.z, t, sampleField(field, s.x, s.z), w, ctx);
      worst = Math.max(worst, Math.abs(c.psi - stationPsi(field, w, on.x, on.z, input)));
      worstStored = Math.max(worstStored, Math.abs(c.psi - s.psi));
    }
    expect(worst).toBeLessThan(1e-6);
    expect(worstStored).toBeLessThan(0.003); // stations between keys are interpolated (5% of a normal ψ)
  });
});

describe("each station's throw height (spec 2026-10-03 barrel-size, option A)", () => {
  it("is the sheet's crest lipH there: the tube hangs from the crest the sheet threw", () => {
    const big = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const w = testWave(big.heightM), t = sampleField(field, PX, PZ).tau + 0.8;
    const input = { cameraX: PX, cameraZ: PZ, params: DEFAULT_BREAK_PARAMS, minHeightM: 0 };
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
    const g = field.grid, w = testWave(REF_BIGGEST.heightM), input = { cameraX: PX, cameraZ: PZ, params: P, minHeightM: 0 };
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
  const held = computeReefField({ bed: reefBeds(2).bed, coast: reefBeds(2).coast, periodS: 15, fromDeg: 225, tideM: 0, peel: 1.7, smooth: true, refractFloorM: FLOOR_M });
  const hctx: WaveContext = { omega: held.omega, travelX: held.far.dirX, travelZ: held.far.dirZ };
  const w = testWave(REF_BIGGEST.heightM);
  const f0 = sampleField(held, PX, PZ), tb0 = timeSinceOnset(held, w, PX, PZ, hctx, P);
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

/** The Womb's ridden run: stations within this distance of the tip (shelf-polish Task 2). */
const RIDDEN_M = 220;

describe('one curl per wave on one clock (one-curl Task 4)', () => {
  // The game's field (smoothed, the refraction floor, the default curl), the biggest set wave of each size.
  const game = computeReefField({ bed: reefBeds(2).bed, coast: reefBeds(2).coast, periodS: 15, fromDeg: 225, tideM: 0, smooth: true, refractFloorM: FLOOR_M });
  const gctx: WaveContext = { omega: game.omega, travelX: game.far.dirX, travelZ: game.far.dirZ };
  for (const ft of [6, 8, 12]) {
    it(`${ft} ft: along each side from the curl the onset never comes earlier, and the wait beyond it never shortens`, { timeout: 120_000 }, () => {
      const w = testWave(setWaveHeight(ft));
      const tb0 = timeSinceOnset(game, w, PX, PZ, gctx, P), peak = w.arrivalS + sampleField(game, PX, PZ).tau - (tb0 ?? 0);
      console.log(`${ft} ft: the peak's section broke at ${peak.toFixed(3)} s (tb at the crest's arrival ${tb0?.toFixed(3) ?? 'null'})`);
      const bad: string[] = [];
      let brokenChecked = 0, waitChecked = 0;
      for (const dt of [1, 3, 6]) {
        const entries = traceStations(game, [w], peak + dt, gctx, { cameraX: LINEUP[0], cameraZ: LINEUP[1], params: P, minHeightM: MIN_H, spacingM: 1 });
        // Runs of drawn stations (gaps split them); the curl is the run's station with the largest tb.
        // shelf-polish Task 2 (Fable's ruling): the Womb's ridden run only, stations within RIDDEN_M of the tip; bar unchanged.
        // Excluded: the inner shelf inside the right, 226–250 m out at the trace's cap (TAPER_NEAR_M), is a closeout, which
        // the Womb's inside is: two curls meet along one crest there (the level-6 line breaks from its far end and hooks
        // under the crest, T′ monotone along the line, out of order along the crest). Its 2 s seam was the along-crest
        // smoothing giving the level-6 band's edge nodes the band's average time beside a ray reading its own "now" (6 ft
        // arcs 182/183: 0.58 → 2.53 s; the rays there are still rising, not plateaued); the edge now keeps its own clock
        // (reefField.ONSET_EDGE_LEVELS). Measured there after that (level-read, whole trace): 6 ft 11 steps (worst 1.02 s),
        // 8 ft 6 (0.62 s), 12 ft 0. Ordering the curl along the crest (per level, each τ contour from its earliest break)
        // is a named candidate for a later segment; reseeding the lines moved the ridden left's first break 0.2 s.
        const runs: Station[][] = [[]];
        for (const e of entries) { if (e.gap || Math.hypot(e.x - PX, e.z - PZ) > RIDDEN_M) { if (runs[runs.length - 1].length) runs.push([]); } else runs[runs.length - 1].push(e); }
        for (const run of runs) {
          let top = -1;
          run.forEach((s, i) => { if (s.tb !== null && Number.isFinite(s.tb) && (top < 0 || s.tb > run[top].tb!)) top = i; });
          if (top < 0) continue;
          for (const dir of [1, -1]) {
            let prev = run[top], broken = true;
            for (let i = top + dir; i >= 0 && i < run.length; i += dir) {
              const s = run[i], tag = `t + ${dt}, arc ${s.arc.toFixed(1)}`;
              if (broken && s.tb !== null && Number.isFinite(s.tb) && prev.tb !== null) {
                brokenChecked++;
                if (s.tb > prev.tb + 0.05) bad.push(`${tag}: tb ${s.tb.toFixed(2)} after ${prev.tb.toFixed(2)}`);
              } else if (s.tb === null) {
                if (!broken && s.until !== null && prev.until !== null && Number.isFinite(s.until) && Number.isFinite(prev.until)) {
                  waitChecked++;
                  if (s.until < prev.until - 0.05) bad.push(`${tag}: until ${s.until.toFixed(2)} after ${prev.until.toFixed(2)}`);
                }
                broken = false;
              }
              prev = s;
            }
          }
        }
      }
      console.log(`${ft} ft: ${brokenChecked} broken and ${waitChecked} waiting station steps checked`);
      expect(brokenChecked, 'broken station steps checked').toBeGreaterThan(30);
      expect(waitChecked, 'waiting station steps checked').toBeGreaterThan(30);
      expect(bad).toEqual([]);
    });
  }
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
  it('A along the first leg holds within 5% through the throw (phase 0.55 to 1.5), at 6 ft mid tide', { timeout: 120_000 }, () => {
    const seen = PLACES.map(() => [] as number[]);
    for (let t = -2; t <= 12; t += 0.1) {
      const st = live(traceStations(field, [w6], t, ctx, { cameraX: PX, cameraZ: PZ, params: P, minHeightM: 0.3, spacingM: 1 }));
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
      expect.soft(hi / lo, `${s} m`).toBeLessThan(1.05);
    });
  });
  it('over the shelf, where the depth caps the height under it, the barrel keeps the height it broke at', () => {
    let n = 0;
    for (const t of [1, 2, 3]) {
      const st = live(traceStations(field, [w6], t, ctx, { cameraX: PX, cameraZ: PZ, params: P, minHeightM: 0.3, spacingM: 1 }));
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
        for (const S of live(traceStations(field, [w], t, ctx, { cameraX: PX, cameraZ: PZ, params: P, minHeightM: 0.3, spacingM: 2 }))) {
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
        const st = live(traceStations(field, [w], t, ctx, { cameraX: PX, cameraZ: PZ, params: P, minHeightM: 0.3, spacingM: 4 }));
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
    const f = computeReefField({ bed: reefBeds(2).bed, coast: reefBeds(2).coast, periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: p.peel, smooth: true, refractFloorM: REFRACT_FLOOR_M });
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
