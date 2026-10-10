import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, breakingHeight } from '../breaker/breaking';
import { computeReefField } from '../breaker/reefField';
import { setWaveHeight } from '../breaker/reefReport';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { SHORE_X } from '../seabed/coastProfile';
import {
  BORE_PUSH, COARSE_TICKS, DEFAULT_FOAM_PARAMS, FOAM_AGE_MAX_S, FOAM_PARAM_RANGES, FINE_REPLAY_S, FOAM_EDGE_BAND_M, FOAM_GRID, FOAM_TICK_S, type FoamGrid, type FoamParams, FoamSchedule, type FoamSourceCpu,
  LACE_LEVEL, WIND_DRIFT_SHARE, bilinearFoam, boxWeight, decayFoam, driftVector, foamPatternAxis, normalizeFoamParams, replayTickCount, stepFoam, tickIndex, tickTime,
} from './foamStep';

const G: FoamGrid = { x0: 0, z0: 0, cellM: 1, nx: 40, nz: 8 };
const none: FoamSourceCpu = { foam: () => 0, dir: () => [1, 0] };
const P = (clearTimeS: number, driftMps: number, laceLifeS = 75): FoamParams => ({ clearTimeS, driftMps, laceLifeS, volumeExposure: 0.55 });
/** A map of (density, age) pairs, every texel at density d, age 0. */
const filled = (g: FoamGrid, d: number): Float32Array<ArrayBuffer> => {
  const m = new Float32Array(2 * g.nx * g.nz);
  for (let i = 0; i < m.length; i += 2) m[i] = d;
  return m;
};
const densities = (m: Float32Array): number[] => Array.from({ length: m.length / 2 }, (_, i) => m[2 * i]);
const run = (map: Float32Array<ArrayBuffer>, g: FoamGrid, ticks: number[], p: FoamParams, src: FoamSourceCpu, dtS = FOAM_TICK_S): Float32Array<ArrayBuffer> =>
  ticks.reduce((m, k) => stepFoam(m, g, tickTime(k), dtS, p, src), map);
const runPlan = (map: Float32Array<ArrayBuffer>, g: FoamGrid, plan: { coarse: number[]; ticks: number[] }, p: FoamParams, src: FoamSourceCpu): Float32Array<ArrayBuffer> =>
  run(run(map, g, plan.coarse, p, src, COARSE_TICKS * FOAM_TICK_S), g, plan.ticks, p, src);
const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** A bore: a 4 m band of foam moving +x at 6 m/s through the grid (the source, from t = 0). */
const bore: FoamSourceCpu = { foam: (x, _z, t) => (Math.abs(x - 6 * t) < 2 ? 1 : 0), dir: () => [1, 0] };

describe('the foam map: two lives (whitewater §5.1)', () => {
  const p = P(10, 0, 75);
  const after = (d0: number, seconds: number, dt = FOAM_TICK_S): number => {
    let d = d0, a = 0;
    const n = Math.round(seconds / dt);
    for (let k = 0; k < n; k++) [d, a] = decayFoam(d, a, 0, dt, p);
    return d;
  };
  it('dense foam is lace (below LACE_LEVEL) by 12 s, still there at 60 s, gone after laceLife + clearTime', () => {
    expect(after(1, 12)).toBeLessThan(LACE_LEVEL);
    expect(after(1, 60)).toBeGreaterThan(0);
    expect(after(1, 75 + 10 + 0.1)).toBe(0);
  });
  it('reaches LACE_LEVEL exactly clearTime after the source stops', () => {
    expect(after(1, 10)).toBeCloseTo(LACE_LEVEL, 6);
  });
  it('is exact over any step: one 0.5 s step equals ten 0.05 s steps', () => {
    for (const d0 of [1, 0.6, LACE_LEVEL + 0.01, 0.2, 0.01]) expect(after(d0, 0.5, 0.5)).toBeCloseTo(after(d0, 0.5), 9);
  });
  it('age resets to 0 under a source of 0.75 or more, grows by dt otherwise; the source still max-injects', () => {
    expect(decayFoam(0.3, 7, 0.8, 0.05, p)).toEqual([0.8, 0]);
    const [d, a] = decayFoam(0.3, 7, 0.5, 0.05, p);
    expect(d).toBe(0.5);
    expect(a).toBeCloseTo(7.05, 12);
  });
});

describe('the foam map: three drifts (whitewater §5.2)', () => {
  it('the drift is the sum: shoreward, the bore push where fresh, the wind share', () => {
    const [vx, vz] = driftVector([1, 0], 0.4, 6, 1, [0, 10]);
    expect(vx).toBeCloseTo(0.4 + 6 * BORE_PUSH, 12);
    expect(vz).toBeCloseTo(10 * WIND_DRIFT_SHARE, 12);
    expect(WIND_DRIFT_SHARE).toBe(0.02);
  });
  it('fresh foam is carried faster than old (the push fades out below density 0.5)', () => {
    const fresh = driftVector([1, 0], 0.4, 6, 0.95, [0, 0])[0], old = driftVector([1, 0], 0.4, 6, 0.2, [0, 0])[0];
    expect(fresh).toBeGreaterThan(old);
    expect(old).toBeCloseTo(0.4, 12);
  });
  it('no push and no wind: the old shoreward drift alone', () => {
    const [vx, vz] = driftVector([0.6, 0.8], 0.4, 0, 1, [0, 0]);
    expect(vx).toBeCloseTo(0.24, 12);
    expect(vz).toBeCloseTo(0.32, 12);
  });
});

describe('the foam step', () => {
  it('a texel takes the larger of its (decayed) foam and the source', () => {
    const map = filled(G, 0.5);
    const src: FoamSourceCpu = { foam: (x) => (x < 20 ? 0.9 : 0.1), dir: () => [1, 0] };
    const out = stepFoam(map, G, 0, FOAM_TICK_S, P(10, 0), src);
    expect(out[2 * 5]).toBeCloseTo(0.9, 6);
    expect(out[2 * 30]).toBeCloseTo(decayFoam(0.5, 0, 0, FOAM_TICK_S, P(10, 0))[0], 6);
  });
  it('a blob drifts at foamDrift along the wave direction', () => {
    let map = new Float32Array(2 * G.nx * G.nz);
    for (let r = 0; r < G.nz; r++) for (let c = 8; c <= 12; c++) map[2 * (r * G.nx + c)] = 0.2 - Math.abs(c - 10) * 0.03;
    const centroid = (m: Float32Array): number => {
      let s = 0, w = 0;
      densities(m).forEach((v, i) => { s += v * ((i % G.nx) + 0.5); w += v; });
      return s / w;
    };
    const before = centroid(map);
    for (let k = 1; k <= 20; k++) map = stepFoam(map, G, tickTime(k), FOAM_TICK_S, P(30, 0.4, 120), none);
    expect(centroid(map) - before).toBeCloseTo(0.4 * 20 * FOAM_TICK_S, 1);
  });
  it('a coarse 0.5 s step equals ten 0.05 s steps within 2 % for a decaying, drifting patch (no source)', () => {
    const p = P(10, 0.4, 75), wind: [number, number] = [3, 1];
    const src: FoamSourceCpu = { foam: () => 0, dir: () => [1, 0], push: () => 5, wind };
    let a = new Float32Array(2 * G.nx * G.nz);
    for (let r = 0; r < G.nz; r++) for (let c = 6; c <= 16; c++) a[2 * (r * G.nx + c)] = 1 - Math.abs(c - 11) * 0.08;
    let b = a.slice();
    for (let j = 0; j < 4; j++) {
      a = stepFoam(a, G, tickTime(10 * (j + 1)), 0.5, p, src);
      for (let k = 1; k <= 10; k++) b = stepFoam(b, G, tickTime(10 * j + k), FOAM_TICK_S, p, src);
    }
    const da = densities(a), db = densities(b);
    const sa = da.reduce((x, y) => x + y, 0), sb = db.reduce((x, y) => x + y, 0);
    expect(Math.abs(sa - sb) / sb).toBeLessThan(0.02);
  });
  it('bilinear sampling clamps to the edge texels and is exact at texel centres', () => {
    const map = new Float32Array(G.nx * G.nz).map((_, i) => i % G.nx);
    expect(bilinearFoam(map, G, 3.5, 2.5)).toBeCloseTo(3, 9);
    expect(bilinearFoam(map, G, 4.0, 2.5)).toBeCloseTo(3.5, 9);
    expect(bilinearFoam(map, G, -50, 2.5)).toBe(0);
    expect(bilinearFoam(map, G, 500, 2.5)).toBe(G.nx - 1);
    const pairs = new Float32Array(2 * G.nx * G.nz).map((_, i) => (i % 2 ? 100 : Math.floor(i / 2) % G.nx));
    expect(bilinearFoam(pairs, G, 4.0, 2.5, 2, 0)).toBeCloseTo(3.5, 9);
    expect(bilinearFoam(pairs, G, 4.0, 2.5, 2, 1)).toBe(100);
  });
  it('the box weight is 0 outside, 1 from 10 m inside, linear between', () => {
    const g: FoamGrid = { x0: 0, z0: 0, cellM: 1, nx: 100, nz: 100 };
    expect(boxWeight(g, -1, 50)).toBe(0);
    expect(boxWeight(g, 101, 50)).toBe(0);
    expect(boxWeight(g, 50, 50)).toBe(1);
    expect(boxWeight(g, FOAM_EDGE_BAND_M, 50)).toBe(1);
    expect(boxWeight(g, FOAM_EDGE_BAND_M / 2, 50)).toBeCloseTo(0.5, 9);
    expect(boxWeight(g, 50, 100 - FOAM_EDGE_BAND_M / 4)).toBeCloseTo(0.25, 9);
  });
  it('normalizeFoamParams clamps into the slider ranges', () => {
    const p = P(0.1, 9, 500);
    normalizeFoamParams(p);
    expect(p).toEqual({ clearTimeS: 2, driftMps: 2, laceLifeS: 120, volumeExposure: 0.55 });
    const d = { ...DEFAULT_FOAM_PARAMS };
    normalizeFoamParams(d);
    expect(d).toEqual({ clearTimeS: 10, driftMps: 0.4, laceLifeS: 75, volumeExposure: 0.55 });
  });
  it('the age is clamped at FOAM_AGE_MAX_S as the GPU step does (final review R3)', () => {
    expect(FOAM_AGE_MAX_S).toBe(1e4);
    expect(decayFoam(0.3, FOAM_AGE_MAX_S - 0.01, 0, 0.05, DEFAULT_FOAM_PARAMS)[1]).toBe(FOAM_AGE_MAX_S);
    expect(decayFoam(0.3, 2, 0, 0.05, DEFAULT_FOAM_PARAMS)[1]).toBeCloseTo(2.05, 12);
  });
  it('the foam volume’s exposure (7b S3 ruling 3) is a dial: 0.4–1.0, default 0.55, clamped', () => {
    expect(FOAM_PARAM_RANGES.volumeExposure).toEqual({ min: 0.4, max: 1 });
    const p = { ...DEFAULT_FOAM_PARAMS, volumeExposure: 3 };
    normalizeFoamParams(p);
    expect(p.volumeExposure).toBe(1);
    const q = { ...DEFAULT_FOAM_PARAMS, volumeExposure: Number.NaN };
    normalizeFoamParams(q);
    expect(q.volumeExposure).toBe(0.55);
  });
});

describe('the foam schedule', () => {
  it("a frame's steps are exactly the ticks in (previous, current]", () => {
    const s = new FoamSchedule();
    s.plan(10, 10);
    expect(s.plan(10.05, 10)).toEqual({ clear: false, coarse: [], ticks: [201] });
    expect(s.plan(10.149, 10)).toEqual({ clear: false, coarse: [], ticks: [202] });
    expect(s.plan(10.2, 10)).toEqual({ clear: false, coarse: [], ticks: [203, 204] });
  });
  it('a paused clock runs no steps', () => {
    const s = new FoamSchedule();
    s.plan(5, 10);
    for (let i = 0; i < 5; i++) expect(s.plan(5, 10)).toEqual({ clear: false, coarse: [], ticks: [] });
  });
  it('the first plan, an invalidate, a backwards jump or one of more than 1 s replays the history + 2 s', () => {
    const s = new FoamSchedule();
    const first = s.plan(30, 10);
    expect(first.clear).toBe(true);
    // 240 ticks: the oldest 40 in four coarse steps, the last 200 (FINE_REPLAY_S) tick by tick.
    expect(first.coarse).toEqual([370, 380, 390, 400]);
    expect(first.ticks).toEqual(range(600 - 200 + 1, 600));
    expect(s.plan(29, 10).clear).toBe(true); // backwards
    expect(s.plan(29.5, 10).clear).toBe(false); // 0.5 s forward
    expect(s.plan(30.5, 10).clear).toBe(false); // exactly 1 s forward: still live
    expect(s.plan(31.6, 10).clear).toBe(true); // 1.1 s forward: a jump
    s.invalidate();
    expect(s.plan(31.6, 10).clear).toBe(true);
    expect(replayTickCount(30)).toBe(640);
  });
  it('a long history replays its oldest part at 2 Hz and its last FINE_REPLAY_S at 20 Hz', () => {
    const history = 10 + 75, k = tickIndex(400);
    const plan = new FoamSchedule().plan(400, history);
    expect(plan.clear).toBe(true);
    expect(plan.ticks).toEqual(range(k - FINE_REPLAY_S * 20 + 1, k));
    expect(plan.coarse[plan.coarse.length - 1]).toBe(k - FINE_REPLAY_S * 20);
    plan.coarse.forEach((c, i) => { if (i > 0) expect(c - plan.coarse[i - 1]).toBe(COARSE_TICKS); });
    const covered = plan.coarse.length * COARSE_TICKS + plan.ticks.length;
    expect(Math.abs(covered - replayTickCount(history))).toBeLessThan(COARSE_TICKS);
  });
  it('plan at t = 0 replays ticks from before zero', () => {
    const plan = new FoamSchedule().plan(0, 10);
    expect(plan.coarse[0]).toBe(-230);
    expect(plan.ticks[0]).toBe(-199);
    expect(plan.ticks[plan.ticks.length - 1]).toBe(0);
    const map = runPlan(new Float32Array(2 * G.nx * G.nz), G, plan, DEFAULT_FOAM_PARAMS, bore);
    expect(map.every(Number.isFinite)).toBe(true);
  });
  it('tick math is exact at three days of sim time', () => {
    const t = 3 * 86400;
    expect(tickIndex(t)).toBe(t * 20);
    expect(tickIndex(t + 0.05)).toBe(t * 20 + 1);
    expect(tickIndex(t + 0.0499)).toBe(t * 20);
    expect(tickTime(t * 20 + 1)).toBeCloseTo(t + 0.05, 9);
  });
});

describe('a replay against live play (ruling R2; whitewater §5.4)', () => {
  const replayVsLive = (p: FoamParams, tEnd: number): number => {
    const s = new FoamSchedule(), history = p.clearTimeS + p.laceLifeS;
    let live = new Float32Array(2 * G.nx * G.nz);
    const t0 = tEnd - 6;
    for (let f = 0; f <= 360; f++) {
      const plan = s.plan(t0 + f / 60, history);
      if (plan.clear) live = new Float32Array(2 * G.nx * G.nz);
      live = runPlan(live, G, plan, p, bore);
    }
    const replay = runPlan(new Float32Array(2 * G.nx * G.nz), G, new FoamSchedule().plan(tEnd, history), p, bore);
    const dl = densities(live), dr = densities(replay);
    return Math.max(...dl.map((v, i) => Math.abs(v - dr[i])));
  };
  it('with no drift and a short history they agree exactly', () => {
    expect(replayVsLive(P(3, 0, 0), 9)).toBe(0);
  });
  it('with drift they agree to within 0.02 foam density', () => {
    expect(replayVsLive(P(3, 0.4, 0), 9)).toBeLessThanOrEqual(0.02);
  });
});

describe('the foam box (ruling R1)', () => {
  // The widest breaking regions, for the biggest 12 ft set wave with the jitter: R1's range (spec 2026-10-06 §1). At the
  // slider extreme (12 ft × heightFactorMax 3 × 1.3, a ~14 m wave) the sea is as deep as the wave is tall since the 15 m
  // basin runs to the map edge, so it breaks out there and no foam box holds it (R1 handover, open).
  const cases: [number, number, number][] = [[-0.6, 18, 250], [-0.6, 15, 225], [0, 15, 225]];
  it('every cell in the water where the biggest 12 ft set wave can break lies 20 m inside the seaward edge', () => {
    const H = setWaveHeight(12) * 1.3;
    const bed = downsample(buildBathymetry(), 2);
    for (const [tideM, periodS, fromDeg] of cases) {
      const f = computeReefField({ bed, periodS, fromDeg, tideM });
      const g = f.grid;
      let seaward = Infinity, zMin = Infinity, zMax = -Infinity;
      for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) {
        const i = r * g.nx + c, x = g.x0 + c * g.cellM, z = g.z0 + r * g.cellM;
        if (x > SHORE_X || f.depth[i] <= 0.05) continue;
        if (f.amp[i] * H >= breakingHeight(f.hminBreak[i], DEFAULT_BREAK_PARAMS)) {
          seaward = Math.min(seaward, x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
        }
      }
      expect(seaward - FOAM_GRID.x0, `seaward margin at tide ${tideM}, ${periodS} s from ${fromDeg}°`).toBeGreaterThanOrEqual(20);
      expect(zMin).toBeGreaterThanOrEqual(FOAM_GRID.z0);
      expect(zMax).toBeLessThanOrEqual(FOAM_GRID.z0 + FOAM_GRID.nz * FOAM_GRID.cellM);
    }
    expect(FOAM_GRID.x0 + FOAM_GRID.nx * FOAM_GRID.cellM - FOAM_EDGE_BAND_M).toBeGreaterThanOrEqual(SHORE_X);
  }, 120_000);
});

describe('the lace pattern follows the drift (whitewater §5.3)', () => {
  it('its long axis is the swell travel in a calm (a glassy day keeps the shore foam as it was)', () => {
    expect(foamPatternAxis([0.6, 0.8], 0.4, [0.5, 0])).toEqual([0.6, 0.8]);
  });
  it('turns toward the wind as it blows: the normalised drift of travel × driftMps + the wind share', () => {
    const [ax, az] = foamPatternAxis([1, 0], 0.4, [0, 10]);
    const want = [0.4, 10 * WIND_DRIFT_SHARE], l = Math.hypot(want[0], want[1]);
    expect(ax).toBeCloseTo(want[0] / l, 9);
    expect(az).toBeCloseTo(want[1] / l, 9);
  });
});

describe('a coarse replay over a moving bore (whitewater §5.4)', () => {
  it('matches the same history stepped tick by tick within 0.02 (the source sampled across each coarse step)', () => {
    const p = P(3, 0.4, 30), tEnd = 30, history = p.clearTimeS + p.laceLifeS;
    const wide: FoamGrid = { x0: 0, z0: 0, cellM: 1, nx: 200, nz: 2 };
    // A bore crossing the grid from 5 s to 35 s at 6 m/s: well inside the replay's coarse part at tEnd.
    const moving: FoamSourceCpu = { foam: (x, _z, t) => (t > 5 && Math.abs(x - 6 * (t - 5)) < 2 ? 1 : 0), dir: () => [1, 0], push: (x, _z, t) => (t > 5 && Math.abs(x - 6 * (t - 5)) < 2 ? 6 : 0) };
    const plan = new FoamSchedule().plan(tEnd, history);
    expect(plan.coarse.length).toBeGreaterThan(0);
    const coarse = densities(runPlan(new Float32Array(2 * wide.nx * wide.nz), wide, plan, p, moving));
    const allTicks = range(plan.coarse[0] - COARSE_TICKS + 1, plan.ticks[plan.ticks.length - 1]);
    const fine = densities(run(new Float32Array(2 * wide.nx * wide.nz), wide, allTicks, p, moving));
    expect(Math.max(...coarse.map((v, i) => Math.abs(v - fine[i])))).toBeLessThanOrEqual(0.02);
  });
});
