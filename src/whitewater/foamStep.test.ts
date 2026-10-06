import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, breakingHeight } from '../breaker/breaking';
import { computeReefField } from '../breaker/reefField';
import { setWaveHeight } from '../breaker/reefReport';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { SHORE_X } from '../seabed/coastProfile';
import {
  DEFAULT_FOAM_PARAMS, FOAM_EDGE_BAND_M, FOAM_GRID, FOAM_TICK_S, type FoamGrid, type FoamParams, FoamSchedule, type FoamSourceCpu,
  bilinearFoam, boxWeight, normalizeFoamParams, replayTickCount, stepFoam, tickIndex, tickTime,
} from './foamStep';

const G: FoamGrid = { x0: 0, z0: 0, cellM: 1, nx: 40, nz: 8 };
const none: FoamSourceCpu = { foam: () => 0, dir: () => [1, 0] };
const P = (clearTimeS: number, driftMps: number): FoamParams => ({ clearTimeS, driftMps });
const run = (map: Float32Array<ArrayBuffer>, g: FoamGrid, ticks: number[], p: FoamParams, src: FoamSourceCpu): Float32Array<ArrayBuffer> =>
  ticks.reduce((m, k) => stepFoam(m, g, tickTime(k), p, src), map);
const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** A bore: a 4 m band of foam moving +x at 6 m/s through the grid (the source, from t = 0). */
const bore: FoamSourceCpu = { foam: (x, _z, t) => (Math.abs(x - 6 * t) < 2 ? 1 : 0), dir: () => [1, 0] };

describe('the foam step', () => {
  it('a texel takes the larger of its (cleared) foam and the source', () => {
    const map = new Float32Array(G.nx * G.nz).fill(0.5);
    const src: FoamSourceCpu = { foam: (x) => (x < 20 ? 0.9 : 0.1), dir: () => [1, 0] };
    const out = stepFoam(map, G, 0, P(10, 0), src);
    expect(out[5]).toBeCloseTo(0.9, 6);
    expect(out[30]).toBeCloseTo(0.5 - FOAM_TICK_S / 10, 6);
  });
  it('after the source stops, foam stays above 0 until clearTime and is exactly 0 a tick after it', () => {
    let map = new Float32Array(G.nx * G.nz).fill(1);
    const p = P(2, 0), n = Math.round(2 / FOAM_TICK_S);
    for (let k = 1; k < n; k++) map = stepFoam(map, G, tickTime(k), p, none);
    expect(Math.min(...map)).toBeGreaterThan(0);
    map = stepFoam(map, G, tickTime(n), p, none);
    map = stepFoam(map, G, tickTime(n + 1), p, none);
    expect(Math.max(...map)).toBe(0);
  });
  it('a blob drifts at foamDrift along the wave direction', () => {
    let map = new Float32Array(G.nx * G.nz);
    for (let r = 0; r < G.nz; r++) for (let c = 8; c <= 12; c++) map[r * G.nx + c] = 1 - Math.abs(c - 10) * 0.15;
    const centroid = (m: Float32Array): number => {
      let s = 0, w = 0;
      m.forEach((v, i) => { s += v * ((i % G.nx) + 0.5); w += v; });
      return s / w;
    };
    const before = centroid(map);
    for (let k = 1; k <= 20; k++) map = stepFoam(map, G, tickTime(k), P(30, 0.4), none);
    expect(centroid(map) - before).toBeCloseTo(0.4 * 20 * FOAM_TICK_S, 1);
  });
  it('bilinear sampling clamps to the edge texels and is exact at texel centres', () => {
    const map = new Float32Array(G.nx * G.nz).map((_, i) => i % G.nx);
    expect(bilinearFoam(map, G, 3.5, 2.5)).toBeCloseTo(3, 9);
    expect(bilinearFoam(map, G, 4.0, 2.5)).toBeCloseTo(3.5, 9);
    expect(bilinearFoam(map, G, -50, 2.5)).toBe(0);
    expect(bilinearFoam(map, G, 500, 2.5)).toBe(G.nx - 1);
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
    const p = P(0.1, 9);
    normalizeFoamParams(p);
    expect(p).toEqual({ clearTimeS: 2, driftMps: 2 });
    const d = { ...DEFAULT_FOAM_PARAMS };
    normalizeFoamParams(d);
    expect(d).toEqual({ clearTimeS: 10, driftMps: 0.4 });
  });
});

describe('the foam schedule', () => {
  it("a frame's steps are exactly the ticks in (previous, current]", () => {
    const s = new FoamSchedule();
    s.plan(10, 10);
    expect(s.plan(10.05, 10)).toEqual({ clear: false, ticks: [201] });
    expect(s.plan(10.149, 10)).toEqual({ clear: false, ticks: [202] });
    expect(s.plan(10.2, 10)).toEqual({ clear: false, ticks: [203, 204] });
  });
  it('a paused clock runs no steps', () => {
    const s = new FoamSchedule();
    s.plan(5, 10);
    for (let i = 0; i < 5; i++) expect(s.plan(5, 10)).toEqual({ clear: false, ticks: [] });
  });
  it('the first plan, an invalidate, a backwards jump or one of more than 1 s replays clearTime + 2 s', () => {
    const s = new FoamSchedule();
    const first = s.plan(30, 10);
    expect(first.clear).toBe(true);
    expect(first.ticks).toEqual(range(600 - 240 + 1, 600));
    expect(s.plan(29, 10).clear).toBe(true); // backwards
    expect(s.plan(29.5, 10).clear).toBe(false); // 0.5 s forward
    expect(s.plan(30.5, 10).clear).toBe(false); // exactly 1 s forward: still live
    expect(s.plan(31.6, 10).clear).toBe(true); // 1.1 s forward: a jump
    s.invalidate();
    expect(s.plan(31.6, 10).clear).toBe(true);
    expect(replayTickCount(30)).toBe(640);
  });
  it('plan at t = 0 replays ticks from before zero', () => {
    const ticks = new FoamSchedule().plan(0, 10).ticks;
    expect(ticks[0]).toBe(-239);
    expect(ticks[ticks.length - 1]).toBe(0);
    const map = run(new Float32Array(G.nx * G.nz), G, ticks, DEFAULT_FOAM_PARAMS, bore);
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

describe('a replay against live play (ruling R2)', () => {
  const replayVsLive = (p: FoamParams): number => {
    const tEnd = 9;
    // Live: replay at 3 s, then 60 fps frames to exactly 9 s (frame index, not an accumulated float).
    const s = new FoamSchedule();
    let live = new Float32Array(G.nx * G.nz);
    for (let f = 0; f <= 360; f++) {
      const plan = s.plan(3 + f / 60, p.clearTimeS);
      if (plan.clear) live = new Float32Array(G.nx * G.nz);
      live = run(live, G, plan.ticks, p, bore);
    }
    const replay = run(new Float32Array(G.nx * G.nz), G, new FoamSchedule().plan(tEnd, p.clearTimeS).ticks, p, bore);
    return Math.max(...live.map((v, i) => Math.abs(v - replay[i])));
  };
  it('with no drift they agree exactly', () => {
    expect(replayVsLive(P(3, 0))).toBe(0);
  });
  it('with drift they agree to within 0.02 foam density', () => {
    expect(replayVsLive(P(3, 0.4))).toBeLessThanOrEqual(0.02);
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
