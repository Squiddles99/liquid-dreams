# Phase 3a: The Foam Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Breaking foam persists on the water after a bore passes, drifts slowly shoreward and clears completely over `clearTime` (10 s by default). It is held in a world-space foam map that the sheet, the view from below and the ribbon all read.

**Architecture:** A new `src/whitewater/` module:
- `foamStep.ts` is the pure-TS reference. It holds the box, the params, the tick schedule and one step on a grid.
- `FoamField.ts` is its GPU mirror. It has two `rgba16float` storage textures and one compute step per 20 Hz sim-time tick (manual bilinear drift, linear clear, max-inject Phase 2's breaking foam), followed by a copy pass back into the published texture. On a jump it replays the last `clearTime + 2 s`. It also provides a `sampleNode(xz)` the materials read at the undisplaced (base) xz.
- App steps it each frame between `setEvents` and the render. The ocean's time uniform and the waves buffer are pointed at each tick's time and restored afterwards.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU + TSL (`three/webgpu`, `three/tsl`), vitest, the in-browser GPU self-tests (`?selftest`).

**Spec:** `docs/superpowers/specs/2026-09-27-foam-field-design.md`

## Global Constraints

- Foam density lives in `.r` of `rgba16float` textures (0–1). The map is indexed by the sheet's **undisplaced** base xz.
- One step at tₖ: `F = clamp(max(bilinear(F_prev, x − u·Δ) − Δ/clearTime, S(x, tₖ)), 0, 1)`, with Δ = 0.05 s and u = `foamDrift` × the reef field's local ray direction.
- Ticks are at tₖ = k·Δ in sim time (20 Hz), never per frame. A frame runs the tₖ in (previous, current]. Paused runs nothing.
- Replay: clear, then run every tₖ in (t − clearTime − 2 s, t] (240 steps at the default setting). It is triggered by:
  - `applyMoment`;
  - "call a set";
  - new conditions (spectrum rebuild);
  - the reef field arriving;
  - foam, break or set slider edits (debounced 150 ms);
  - sim time moving backwards, or forward by more than 1 s.
- Dev sliders (Foam folder, persisted with the look): `clear time (s)` 2–30, default 10; `foam drift (m/s)` 0–2, default 0.4.
- Outside the box, the sheet uses Phase 2's per-vertex placeholder foam. A 10 m band inside the box's edge blends the two.
- The foam pattern (`setFoamPattern`) reads water-anchored coordinates (base xz rotated into the mean swell frame), not the moving crest frame.
- The FFT whitecaps (`OceanSimulation` foam) are untouched.
- WebGPU baseline: ≤ 8 storage buffers per stage and ≤ 16 sampled textures per stage. Don't raise `requiredLimits`.
- Cost targets: ≤ 0.5 ms GPU per frame and ≤ 200 ms for a replay. If either is missed, stop and give Andrew the measured numbers before choosing a lever (spec §3.4).
- Repo rules:
  - `reference/` is never committed;
  - stage files by path;
  - never commit `.superpowers/`;
  - every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - no merge to main without Andrew.

## Plan-time rulings (read before Task 1)

- **R1, the box.** The spec's draft box (x −200…190, z −300…200) doesn't contain the breaking region. I measured it on the reef field (period 12/15/18 s, from 200/225/250°, tide −0.6/0/+0.6 m):
  - the reef and shelf break along the grid's whole z range (−450…300), not just near the peak;
  - the seaward edge reaches x = −84 for an 8 ft × 1.8 × 1.3 wave, and x = −222 for the slider extreme (12 ft × heightFactorMax 3 × 1.3, tide −0.6, 18 s from 250°).

  Following the spec's rule that "the box grows if needed", the box is **x −245…210, z −450…300 at 1 m (455 × 750 = 341,250 texels)**. That covers every breaking cell in the water (x ≤ `SHORE_X` 190) with 20 m of seaward margin. North and south it stops at the reef grid's edge: beyond it the field is the straight coast solution, which runs on forever. There, the placeholder foam remains. The box is 1.7× the spec's cost estimate. Task 5 measures it.
- **R2, replay versus live play.** With drift, the bilinear blend carries a trace of older foam, so a replay and live play to the same tₖ agree to within 0.02 foam density, not exactly. They agree exactly with drift 0. Task 1 pins both and updates spec §3.3's wording. The same moment still always gives the same picture, because a replay is deterministic.
- **R3, extra triggers.** Break and set slider edits also replay (debounced). Otherwise a paused moment would show foam made by the old sliders. The spec lists only the foam sliders. This extends the same reasoning.
- **R4, the step's drift sample uses a manual bilinear** (four `textureLoad`s). Hardware filtering has only about 8 bits of sub-texel weight: at 0.4 m/s the drift is 0.02 texel per tick, which would quantise by ±20% and stall entirely below about 0.1 m/s. The materials' display samples do use hardware filtering.

## Review Focus

1. **Sim time near 0 or negative:** the startup moment runs from t = 0, so its replay steps at negative tₖ. It must produce a clean map with no NaN. (Task 1: `plan at t = 0 replays ticks from before zero`.)
2. **Large sim times:** set moments sit at arrivals of thousands of seconds, and a session may run for days. Tick math must stay exact. (Task 1: `tick math is exact at three days of sim time`.)
3. **Dragging a slider:** every change event mustn't trigger a 200 ms replay. The replay is debounced 150 ms after the last edit (Task 4, step 5; checked by hand in Task 5).
4. **The box edge:** no visible seam where the map meets the placeholder. The 10 m band blends linearly (Task 1: `the box weight is 0 outside, 1 from 10 m inside, linear between`).
5. **Before the reef field arrives,** the source is the same garbage-free zero-field state the sheet draws. On arrival the map replays (Task 4, step 3; checked by the startup capture in Task 5).

---

### Task 1: The box and the CPU reference (`foamStep.ts`)

**Files:**
- Create: `src/whitewater/foamStep.ts`
- Test: `src/whitewater/foamStep.test.ts`
- Modify: `docs/superpowers/specs/2026-09-27-foam-field-design.md` (§3.1 box, §3.3 replay wording)

**Interfaces:**
- Consumes: `computeReefField`, `ReefField` (`src/breaker/reefField.ts`); `breakingHeight`, `DEFAULT_BREAK_PARAMS` (`src/breaker/breaking.ts`); `surferFeetToHs` (`src/conditions/units.ts`); `buildBathymetry`, `downsample` (`src/seabed/bathymetry.ts`); `SHORE_X` (`src/seabed/coastProfile.ts`).
- Produces:
  - `FoamGrid { x0; z0; cellM; nx; nz }` (x0/z0 = texel (0,0)'s corner; texel centre = x0 + (c + 0.5)·cellM);
  - `FOAM_GRID`;
  - `FoamParams { clearTimeS; driftMps }`, `DEFAULT_FOAM_PARAMS`, `FOAM_PARAM_RANGES`, `normalizeFoamParams(p)`;
  - `FOAM_TICKS_PER_S = 20`, `FOAM_TICK_S`, `REPLAY_MARGIN_S = 2`, `FOAM_JUMP_S = 1`, `FOAM_EDGE_BAND_M = 10`;
  - `tickIndex(t)`, `tickTime(k)`, `replayTickCount(clearTimeS)`;
  - `FoamPlan { clear; ticks }`, `class FoamSchedule { invalidate(); plan(simTime, clearTimeS) }`;
  - `FoamSourceCpu { foam(x, z, t); dir(x, z): [number, number] }`;
  - `bilinearFoam(map, g, x, z)`, `stepFoam(prev, g, t, p, src)`, `boxWeight(g, x, z)`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/whitewater/foamStep.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, breakingHeight } from '../breaker/breaking';
import { computeReefField } from '../breaker/reefField';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { SHORE_X } from '../seabed/coastProfile';
import {
  DEFAULT_FOAM_PARAMS, FOAM_EDGE_BAND_M, FOAM_GRID, FOAM_TICK_S, type FoamGrid, type FoamParams, FoamSchedule, type FoamSourceCpu,
  bilinearFoam, boxWeight, normalizeFoamParams, replayTickCount, stepFoam, tickIndex, tickTime,
} from './foamStep';

const G: FoamGrid = { x0: 0, z0: 0, cellM: 1, nx: 40, nz: 8 };
const none: FoamSourceCpu = { foam: () => 0, dir: () => [1, 0] };
const P = (clearTimeS: number, driftMps: number): FoamParams => ({ clearTimeS, driftMps });
const run = (map: Float32Array, g: FoamGrid, ticks: number[], p: FoamParams, src: FoamSourceCpu): Float32Array =>
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
  // The widest breaking regions measured at plan time, at the slider extreme: 12 ft × heightFactorMax 3 × (1 + 2 × 0.15 jitter).
  const cases: [number, number, number][] = [[-0.6, 18, 250], [-0.6, 15, 225], [0, 15, 225]];
  it('every cell in the water where the biggest wave the sliders allow can break lies 20 m inside the seaward edge', () => {
    const H = surferFeetToHs(12) * 3 * 1.3;
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/whitewater/foamStep.test.ts`
Expected: FAIL, with "Failed to resolve import './foamStep'".

- [ ] **Step 3: Write the implementation**

```ts
// src/whitewater/foamStep.ts
/**
 * The foam field's CPU reference (spec 2026-09-27-foam-field-design.md §3.1): the box, the params, the 20 Hz tick
 * schedule and one step on a grid. FoamField.ts mirrors it on the GPU. The map is indexed by the sheet's undisplaced
 * (base) xz, so foam rides the swell and chop with the water; only the net shoreward drift is simulated here.
 */

/** A world-space grid: texel (0, 0)'s corner at (x0, z0); texel (c, r)'s centre at (x0 + (c + 0.5)·cellM, z0 + (r + 0.5)·cellM). Row = z. */
export interface FoamGrid {
  x0: number;
  z0: number;
  cellM: number;
  nx: number;
  nz: number;
}

/**
 * The foam box (plan ruling R1): x −245…210, z −450…300 at 1 m. It covers every breaking cell in the water for the
 * slider extreme with 20 m of seaward margin (foamStep.test.ts); north and south it ends with the reef grid, beyond
 * which the field is the straight coast and the placeholder foam stands.
 */
export const FOAM_GRID: Readonly<FoamGrid> = { x0: -245, z0: -450, cellM: 1, nx: 455, nz: 750 };

export interface FoamParams {
  /** Foam falls linearly from 1 to 0 over this long once its source stops (s). */
  clearTimeS: number;
  /** Net shoreward drift along the local wave direction (m/s). */
  driftMps: number;
}

export const DEFAULT_FOAM_PARAMS: Readonly<FoamParams> = { clearTimeS: 10, driftMps: 0.4 };
export const FOAM_PARAM_RANGES = { clearTimeS: { min: 2, max: 30 }, driftMps: { min: 0, max: 2 } } as const;

export function normalizeFoamParams(p: FoamParams): void {
  for (const k of Object.keys(FOAM_PARAM_RANGES) as (keyof FoamParams)[]) {
    const r = FOAM_PARAM_RANGES[k];
    p[k] = Number.isFinite(p[k]) ? Math.min(r.max, Math.max(r.min, p[k])) : DEFAULT_FOAM_PARAMS[k];
  }
}

/** Steps run at tₖ = k / FOAM_TICKS_PER_S in sim time, never per frame, so the map depends on sim time only. */
export const FOAM_TICKS_PER_S = 20;
export const FOAM_TICK_S = 1 / FOAM_TICKS_PER_S;
/** A replay covers clearTime plus this (s): the float margin that lets foam older than clearTime reach exactly 0. */
export const REPLAY_MARGIN_S = 2;
/** Sim time moving forward by more than this (s) between frames is treated as a jump (the safety net). */
export const FOAM_JUMP_S = 1;
/** Inside the box's edge the map blends to the placeholder foam over this band (m), so there is no seam. */
export const FOAM_EDGE_BAND_M = 10;

/** The last tick at or before sim time t. The epsilon keeps t = k·Δ (with its float error) on tick k. */
export function tickIndex(t: number): number {
  return Math.floor(t * FOAM_TICKS_PER_S + 1e-6);
}

export function tickTime(k: number): number {
  return k / FOAM_TICKS_PER_S;
}

export function replayTickCount(clearTimeS: number): number {
  return Math.ceil((clearTimeS + REPLAY_MARGIN_S) * FOAM_TICKS_PER_S);
}

/** A frame's work: clear the map first (a replay), then run these tick indices in order. */
export interface FoamPlan {
  clear: boolean;
  ticks: number[];
}

const ticksFrom = (a: number, b: number): number[] => (b < a ? [] : Array.from({ length: b - a + 1 }, (_, i) => a + i));

/** Which ticks each frame runs (spec §3.1, §3.3). */
export class FoamSchedule {
  private last: number | null = null;

  /** The next plan replays (a moment, a set call, new conditions, a new field, a slider). */
  invalidate(): void {
    this.last = null;
  }

  plan(simTime: number, clearTimeS: number): FoamPlan {
    const k = tickIndex(simTime);
    const last = this.last;
    this.last = k;
    if (last === null || k < last || k - last > FOAM_JUMP_S * FOAM_TICKS_PER_S) {
      return { clear: true, ticks: ticksFrom(k - replayTickCount(clearTimeS) + 1, k) };
    }
    return { clear: false, ticks: ticksFrom(last + 1, k) };
  }
}

/** The breaking foam weight S(x, z, t) ∈ [0, 1] and the unit wave direction at (x, z) (zero where unknown). */
export interface FoamSourceCpu {
  foam(x: number, z: number, t: number): number;
  dir(x: number, z: number): [number, number];
}

/** a·(1 − t) + b·t, WGSL mix()'s form: exactly a at t = 0 and exactly b at t = 1, whatever the other value is. */
const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

/**
 * Bilinear between texel centres, clamped to the edge texels (the GPU step's manual bilinear, ruling R4). Written as
 * WGSL's mix() so that with no drift a texel reads exactly itself, which the exact replay/live test relies on.
 */
export function bilinearFoam(map: Float32Array, g: FoamGrid, x: number, z: number): number {
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM - 0.5));
  const fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM - 0.5));
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * g.nx + c;
  return lerp(lerp(map[i], map[i + 1], tx), lerp(map[i + g.nx], map[i + g.nx + 1], tx), tz);
}

/** One step at sim time t (spec §3.1): drift (sampled upstream), clear, inject, clamp. Returns a new map. */
export function stepFoam(prev: Float32Array, g: FoamGrid, t: number, p: FoamParams, src: FoamSourceCpu): Float32Array {
  const out = new Float32Array(prev.length);
  const reach = p.driftMps * FOAM_TICK_S, decay = FOAM_TICK_S / p.clearTimeS;
  for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) {
    const x = g.x0 + (c + 0.5) * g.cellM, z = g.z0 + (r + 0.5) * g.cellM;
    const [dx, dz] = src.dir(x, z);
    const adv = bilinearFoam(prev, g, x - dx * reach, z - dz * reach);
    out[r * g.nx + c] = Math.min(1, Math.max(0, Math.max(adv - decay, src.foam(x, z, t))));
  }
  return out;
}

/** How much the map (vs the placeholder) decides the foam at (x, z): 0 outside the box, 1 from FOAM_EDGE_BAND_M in. */
export function boxWeight(g: FoamGrid, x: number, z: number): number {
  const inX = Math.min(x - g.x0, g.x0 + g.nx * g.cellM - x);
  const inZ = Math.min(z - g.z0, g.z0 + g.nz * g.cellM - z);
  return Math.min(1, Math.max(0, Math.min(inX, inZ) / FOAM_EDGE_BAND_M));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/whitewater/foamStep.test.ts`
Expected: PASS, 14 tests.
- If `with drift they agree to within 0.02` fails, record the measured difference and ledger a ruling. The options are to raise `REPLAY_MARGIN_S` (and re-run), or to accept the measured bound and update R2.
- If the box test fails on the seaward margin, lower `FOAM_GRID.x0` (and raise `nx` to match) until it passes, then ledger it.

- [ ] **Step 5: Update the spec to match R1 and R2**

In `docs/superpowers/specs/2026-09-27-foam-field-design.md` §3.1 ("Extent"), replace the draft-box sentence and the one after it with:

```markdown
- **Extent:** a fixed world-space box over the break, at 1 m per texel: **x −245…210, z −450…300** (455 × 750 texels). Measured at plan time (plan ruling R1): the reef and shelf break along the reef grid's whole z range, and the slider extreme (12 ft × 3 × 1.3 at low tide) breaks as far out as x = −222, so the box covers every breaking cell in the water with 20 m of seaward margin. North and south it ends with the reef grid; beyond, the field is the straight coast solution and the placeholder foam stands. The box is a constant, not a slider.
```

In §3.3, replace "So a replay gives the same map as live play that reached the same tₖ, up to floating-point differences." with:

```markdown
So with no drift a replay gives exactly the map live play reached at the same tₖ; with drift the bilinear blend carries a trace of older foam and the two agree to within 0.02 foam density (plan ruling R2). A replay is itself deterministic, so the same moment always gives the same picture.
```

- [ ] **Step 6: Run the full suite and commit**

Run: `npx vitest run` (expected: all pass) and `npm run typecheck` (expected: no errors).

```bash
git add src/whitewater/foamStep.ts src/whitewater/foamStep.test.ts docs/superpowers/specs/2026-09-27-foam-field-design.md
git commit -m "feat(foam): the foam field's box, params, tick schedule and CPU step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The GPU foam field (`FoamField.ts`) and its self-tests

**Files:**
- Create: `src/whitewater/FoamField.ts`
- Create: `src/whitewater/foamField.selftest.ts`
- Modify: `src/breaker/SetWaves.ts` (add `breakingFoamNode`)
- Modify: `src/dev/selfTests.ts` (import the new self-test)

**Interfaces:**
- Consumes (Task 1): `FoamGrid`, `FOAM_GRID`, `FoamParams`, `DEFAULT_FOAM_PARAMS`, `normalizeFoamParams`, `FOAM_TICK_S`, `FOAM_EDGE_BAND_M`, `FoamSchedule`, `tickTime`, `stepFoam`, `FoamSourceCpu`, `boxWeight`.
- Produces:
  - `interface FoamSourceNodes { foamNode(xz: N): N; dirNode(xz: N): N }`;
  - `class FoamField` with:
    - `readonly grid: FoamGrid`;
    - `readonly texture: THREE.StorageTexture` (the published map);
    - `constructor(source: FoamSourceNodes, grid?: FoamGrid)`;
    - `setParams(p: FoamParams): void`;
    - `invalidate(): void`;
    - `advance(renderer, simTime: number, prepare: (t: number) => void): number` (steps run);
    - `sampleNode(xz: N): { density: N; inside: N }`.
  - `SetWaves.breakingFoamNode(xz: N): N`: compute-safe, called inside an Fn; Phase 2's foam weight without the foam frame.

- [ ] **Step 1: Add `breakingFoamNode` to SetWaves**

Its test is the self-test in Step 2, which compares against the CPU `sumWaves(...).foam`. In `src/breaker/SetWaves.ts`, after `breakSampleNode`:

```ts
  /**
   * The breaking foam weight at undisplaced xz (Phase 2's placeholder weight; the foam field's source, spec
   * 2026-09-27-foam-field-design.md §3.1): breakSampleNode's foam without the foam frame's work. Compute-safe; must be
   * called inside an Fn.
   */
  breakingFoamNode(xz: N): N {
    return this.sumBreaking(xz, false).foam;
  }
```

- [ ] **Step 2: Write the failing self-tests**

```ts
// src/whitewater/foamField.selftest.ts
import * as THREE from 'three/webgpu';
import { Fn, abs, float, instanceIndex, int, ivec2, select, storage, textureLoad, uniform, vec2, vec4 } from 'three/tsl';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { computeReefField, sampleField } from '../breaker/reefField';
import { SetWaves } from '../breaker/SetWaves';
import { sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { FoamField } from './FoamField';
import { type FoamGrid, type FoamParams, type FoamSourceCpu, FoamSchedule, stepFoam, tickTime } from './foamStep';

type N = any;

/** Reads a FoamField's published map (.r) back to the CPU, row-major. */
async function readMap(renderer: THREE.WebGPURenderer, field: FoamField): Promise<Float32Array> {
  const { nx, nz } = field.grid;
  const outAttr = new THREE.StorageBufferAttribute(new Float32Array(nx * nz * 4), 4);
  const out = storage(outAttr, 'vec4', nx * nz);
  const pass = Fn(() => {
    const i = instanceIndex;
    out.element(i).assign(textureLoad(field.texture, ivec2(int(i.mod(nx)), int(i.div(nx))), int(0)));
  })().compute(nx * nz) as THREE.ComputeNode;
  renderer.compute(pass);
  const raw = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
  return Float32Array.from({ length: nx * nz }, (_, i) => raw[i * 4]);
}

const maxDiff = (a: Float32Array, b: Float32Array): number => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

/** A synthetic bore: a 4 m band moving +x at 6 m/s (from x = 0 at t = 0), direction +x (the CPU test's bore). */
function syntheticSource() {
  const t = uniform(0);
  const nodes = {
    foamNode: (xz: N): N => select(abs(xz.x.sub(t.mul(6.0))).lessThan(2.0), float(1.0), float(0.0)),
    dirNode: (): N => vec2(1.0, 0.0),
  };
  const cpu: FoamSourceCpu = { foam: (x, _z, tt) => (Math.abs(x - 6 * tt) < 2 ? 1 : 0), dir: () => [1, 0] };
  return { t, nodes, cpu };
}

const SMALL: FoamGrid = { x0: 0, z0: 0, cellM: 1, nx: 48, nz: 8 };

registerSelfTest({
  name: 'foam: the GPU step matches the CPU reference (drift, clear, inject) over a replay',
  async run(renderer) {
    const { t, nodes, cpu } = syntheticSource();
    const field = new FoamField(nodes, SMALL);
    const p: FoamParams = { clearTimeS: 3, driftMps: 0.4 };
    field.setParams(p);
    const tEnd = 5;
    field.advance(renderer, tEnd, (tt) => { t.value = tt; });
    const gpu = await readMap(renderer, field);
    const plan = new FoamSchedule().plan(tEnd, p.clearTimeS);
    const ref = plan.ticks.reduce((m, k) => stepFoam(m, SMALL, tickTime(k), p, cpu), new Float32Array(SMALL.nx * SMALL.nz));
    const d = maxDiff(gpu, ref);
    const peak = Math.max(...ref);
    // rgba16float rounds every step (half an ulp is 2.4e-4 in [0.5, 1)); over a clear of 60 ticks that can add up to ~0.012.
    return { pass: d < 0.02 && peak > 0.9, detail: `max |GPU − CPU| ${d.toFixed(5)} over ${plan.ticks.length} ticks; CPU peak ${peak.toFixed(3)}` };
  },
});

registerSelfTest({
  name: 'foam: a GPU replay matches GPU live stepping to the same tick (drift 0 exact, drift 0.4 within 0.02)',
  async run(renderer) {
    const notes: string[] = [];
    let ok = true;
    for (const drift of [0, 0.4]) {
      const { t, nodes } = syntheticSource();
      const prepare = (tt: number): void => { t.value = tt; };
      const live = new FoamField(nodes, SMALL);
      live.setParams({ clearTimeS: 3, driftMps: drift });
      for (let f = 0; f <= 360; f++) live.advance(renderer, 3 + f / 60, prepare); // exactly 9 s at the end
      const a = await readMap(renderer, live);
      const replay = new FoamField(nodes, SMALL);
      replay.setParams({ clearTimeS: 3, driftMps: drift });
      replay.advance(renderer, 9, prepare);
      const b = await readMap(renderer, replay);
      const d = maxDiff(a, b);
      notes.push(`drift ${drift}: max |live − replay| ${d.toFixed(5)}`);
      ok &&= drift === 0 ? d === 0 : d <= 0.02;
    }
    return { pass: ok, detail: notes.join('; ') };
  },
});

registerSelfTest({
  name: "foam: a replay over a breaking set matches the CPU reference driven by Phase 2's CPU foam (per-tick events)",
  async run(renderer) {
    const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
    const time = uniform(0);
    const sets = new SetWaves(time);
    sets.setField(field);
    sets.setBreakParams(DEFAULT_BREAK_PARAMS);
    // 24 × 24 texels at 2 m around the peak, where the default set 1's biggest wave barrels and collapses.
    const grid: FoamGrid = { x0: -10, z0: -24, cellM: 2, nx: 24, nz: 24 };
    const foam = new FoamField({ foamNode: (xz) => sets.breakingFoamNode(xz), dirNode: (xz) => sets.sample(xz, true).dir }, grid);
    const p: FoamParams = { clearTimeS: 2, driftMps: 0.4 };
    foam.setParams(p);
    const biggest = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const tEnd = biggest.arrivalS + 3;
    foam.advance(renderer, tEnd, (tt) => {
      time.value = tt;
      sets.setEvents(wavesNear(tt, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS));
    });
    const gpu = await readMap(renderer, foam);
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const o = { sample: (x: number, z: number) => sampleField(field, x, z), params: DEFAULT_BREAK_PARAMS };
    const cpuSource: FoamSourceCpu = {
      foam: (x, z, tt) => sumWaves(x, z, tt, sampleField(field, x, z), wavesNear(tt, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).map(toActiveWave), ctx, o).foam,
      dir: (x, z) => { const s = sampleField(field, x, z); const l = Math.hypot(s.dirX, s.dirZ) || 1; return [s.dirX / l, s.dirZ / l]; },
    };
    const ticks = new FoamSchedule().plan(tEnd, p.clearTimeS).ticks;
    const ref = ticks.reduce((m, k) => stepFoam(m, grid, tickTime(k), p, cpuSource), new Float32Array(grid.nx * grid.nz));
    const d = maxDiff(gpu, ref);
    const covered = ref.filter((v) => v > 0.5).length;
    // Phase 2's GPU/CPU foam agree to 0.05 (breaker self-test), plus rgba16float's rounding (≤ 0.02, the step test).
    return { pass: d < 0.07 && covered > 10, detail: `max |GPU − CPU| ${d.toFixed(4)} over ${ticks.length} ticks; ${covered} texels over 0.5` };
  },
});
```

In `src/dev/selfTests.ts`, add after `import '../breaker/ribbon.selftest';`:

```ts
import '../whitewater/foamField.selftest';
```

- [ ] **Step 3: Verify that they fail**

Run: `npm run typecheck`
Expected: FAIL, with "Cannot find module './FoamField'". The self-tests can't build without it.

- [ ] **Step 4: Write `FoamField.ts`**

```ts
// src/whitewater/FoamField.ts
import * as THREE from 'three/webgpu';
import { Fn, clamp, float, floor, instanceIndex, int, ivec2, max, min, mix, texture, textureLoad, textureStore, uniform, uvec2, vec2, vec4 } from 'three/tsl';
import { DEFAULT_FOAM_PARAMS, FOAM_EDGE_BAND_M, FOAM_GRID, FOAM_TICK_S, type FoamGrid, type FoamParams, FoamSchedule, normalizeFoamParams, tickTime } from './foamStep';

type N = any;

/** What the foam map is made from (each called inside the step's Fn, at a texel centre's base xz). */
export interface FoamSourceNodes {
  /** The breaking foam weight [0, 1] at the time the last prepare() set (App: SetWaves.breakingFoamNode). */
  foamNode(xz: N): N;
  /** The unit wave travel direction at xz, zero where unknown (App: the reef field's ray direction). */
  dirNode(xz: N): N;
}

function mapTexture(g: FoamGrid): THREE.StorageTexture {
  const t = new THREE.StorageTexture(g.nx, g.nz);
  t.type = THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

/**
 * The foam field on the GPU (spec 2026-09-27-foam-field-design.md §3; CPU reference foamStep.ts). `texture` is the
 * published map every material samples; each tick steps it into a scratch texture (drift by a manual bilinear, plan
 * ruling R4; linear clear; max-inject the source; clamp) and a copy pass publishes the result, so the materials' texture
 * bindings never change. advance() runs the ticks the schedule plans for this frame: none while paused, a replay after
 * invalidate() or a jump.
 */
export class FoamField {
  readonly texture: THREE.StorageTexture;
  private readonly scratch: THREE.StorageTexture;
  private readonly schedule = new FoamSchedule();
  private readonly decay = uniform(FOAM_TICK_S / DEFAULT_FOAM_PARAMS.clearTimeS);
  private readonly reach = uniform(DEFAULT_FOAM_PARAMS.driftMps * FOAM_TICK_S);
  private readonly origin: N;
  private readonly params: FoamParams = { ...DEFAULT_FOAM_PARAMS };
  private readonly stepPass: THREE.ComputeNode;
  private readonly copyPass: THREE.ComputeNode;
  private readonly clearPass: THREE.ComputeNode;

  constructor(source: FoamSourceNodes, readonly grid: FoamGrid = FOAM_GRID) {
    const g = grid, count = g.nx * g.nz;
    this.texture = mapTexture(g);
    this.scratch = mapTexture(g);
    this.origin = uniform(new THREE.Vector2(g.x0, g.z0));
    const maxIndex = vec2(g.nx - 1, g.nz - 1);
    const texel = (i: N): N => uvec2(i.mod(g.nx), i.div(g.nx));
    const centre = (i: N): N => vec2(float(i.mod(g.nx)).add(0.5), float(i.div(g.nx)).add(0.5)).mul(g.cellM).add(this.origin);
    // foamStep.bilinearFoam: between texel centres, clamped to the edge texels, exact f32 weights.
    const bilinear = (xz: N): N => {
      const f = clamp(xz.sub(this.origin).div(g.cellM).sub(0.5), vec2(0.0), maxIndex);
      const base = min(floor(f), maxIndex.sub(1.0));
      const t = f.sub(base);
      const i0 = ivec2(base);
      const load = (dx: number, dz: number): N => textureLoad(this.texture, i0.add(ivec2(dx, dz)), int(0)).x;
      return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
    };
    this.stepPass = Fn(() => {
      const xz = centre(instanceIndex).toVar();
      const adv = bilinear(xz.sub(source.dirNode(xz).mul(this.reach)));
      const next = clamp(max(adv.sub(this.decay), source.foamNode(xz)), 0.0, 1.0);
      textureStore(this.scratch, texel(instanceIndex), vec4(next, 0.0, 0.0, 1.0));
    })().compute(count) as THREE.ComputeNode;
    this.copyPass = Fn(() => {
      textureStore(this.texture, texel(instanceIndex), textureLoad(this.scratch, ivec2(texel(instanceIndex)), int(0)));
    })().compute(count) as THREE.ComputeNode;
    this.clearPass = Fn(() => {
      textureStore(this.texture, texel(instanceIndex), vec4(0.0, 0.0, 0.0, 1.0));
    })().compute(count) as THREE.ComputeNode;
  }

  /** Copies the params in (normalized). The caller decides when the map replays (App debounces slider edits). */
  setParams(p: FoamParams): void {
    Object.assign(this.params, p);
    normalizeFoamParams(this.params);
    this.decay.value = FOAM_TICK_S / this.params.clearTimeS;
    this.reach.value = this.params.driftMps * FOAM_TICK_S;
  }

  /** The next advance() clears the map and replays clearTime + 2 s. */
  invalidate(): void {
    this.schedule.invalidate();
  }

  /**
   * Runs this frame's ticks (FoamSchedule.plan). Before each tick `prepare(tₖ)` points the source at that time (App:
   * the ocean's time uniform and SetWaves' events); the caller restores its own state afterwards. Returns the steps run.
   */
  advance(renderer: THREE.WebGPURenderer, simTime: number, prepare: (t: number) => void): number {
    const plan = this.schedule.plan(simTime, this.params.clearTimeS);
    if (plan.clear) renderer.compute(this.clearPass);
    for (const k of plan.ticks) {
      prepare(tickTime(k));
      renderer.compute(this.stepPass);
      renderer.compute(this.copyPass);
    }
    return plan.ticks.length;
  }

  /**
   * The map at base xz for the materials (any stage): density [0, 1] (hardware-filtered), and `inside`: how much the map
   * rather than the placeholder decides the foam (foamStep.boxWeight: 0 outside the box, 1 from FOAM_EDGE_BAND_M in).
   */
  sampleNode(xz: N): { density: N; inside: N } {
    const g = this.grid;
    const local = xz.sub(this.origin);
    const size = vec2(g.nx * g.cellM, g.nz * g.cellM);
    const edge = min(min(local.x, size.x.sub(local.x)), min(local.y, size.y.sub(local.y)));
    const inside = clamp(edge.div(FOAM_EDGE_BAND_M), 0.0, 1.0);
    const density = texture(this.texture, local.div(size)).level(float(0)).x; // three typings gap: level() wants a node
    return { density, inside };
  }
}
```

- [ ] **Step 5: Typecheck, then run the self-tests**

Run: `npm run typecheck`
Expected: no errors.

Start the dev server (`preview_start` with the project's launch config). Open `/?selftest&fresh` in a **fronted** tab (a hidden tab throttles rAF), then read the console.
Expected: `[selftest] PASS` for the three `foam:` tests, and all earlier self-tests still passing (`SUMMARY 36/36`).
- If the per-tick self-test fails but the synthetic ones pass, the waves buffer or the time uniform isn't reaching the GPU between the `renderer.compute` calls. Use systematic debugging: read back `sets.breakingFoamNode` at one texel after a single `advance` with a known tₖ.

- [ ] **Step 6: Run the vitest suite and commit**

Run: `npx vitest run`
Expected: all pass.

```bash
git add src/whitewater/FoamField.ts src/whitewater/foamField.selftest.ts src/breaker/SetWaves.ts src/dev/selfTests.ts
git commit -m "feat(foam): the GPU foam field (20 Hz steps, drift, clear, inject, replay) with self-tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The materials read the map (sheet above, below, ribbon), the water-anchored pattern, and the overlay

**Files:**
- Modify: `src/ocean/OceanSurface.ts`
- Modify: `src/ocean/waterShading.ts` (overlay input: foam map)
- Modify: `src/breaker/BreakingRibbon.ts` (`RibbonShading.foamMap`, foam at the home)
- Modify: `src/breaker/BreakingRibbon.limits.test.ts` (the sheet's materials; sampled textures)
- Modify: `src/whitewater/foamField.selftest.ts` (the water frame node)

**Interfaces:**
- Consumes (Task 2): `FoamField` (`sampleNode`, `grid`, `texture`).
- Produces:
  - `interface SheetFoamMap { sampleNode(xz: N): { density: N; inside: N } }` (in `OceanSurface.ts`; `FoamField` satisfies it structurally);
  - `OceanSurfaceOptions.foamMap?: SheetFoamMap`;
  - `RibbonShading.foamMap?: SheetFoamMap`;
  - `sheetFoamWeight(placeholder: N, sample: { density: N; inside: N } | null): N`;
  - `waterFoamFrame(xz: N, travel: N): N`, and its CPU mirror `waterFoamFrameCpu(x, z, travelX, travelZ): [number, number]`;
  - `DebugOverlays.foamMap: boolean`;
  - `OceanSurface.setOverlays` drives it.

- [ ] **Step 1: Write the failing tests**

Add to `src/breaker/BreakingRibbon.limits.test.ts`. Imports go at the top:

```ts
import { OceanSurface } from '../ocean/OceanSurface';
import { FoamField } from '../whitewater/FoamField';
```

Add a helper next to `storageBindings`:

```ts
/** Sampled (non-storage) texture bindings in a WGSL stage: the baseline allows 16 per stage. */
const sampledTextures = (wgsl: string): number => (wgsl.match(/var\s+\w+\s*:\s*texture_(?!storage)/g) ?? []).length;
```

Add the tests inside the `describe`:

```ts
  describe("the sheet's materials", () => {
    const sky = new Sky(DEFAULT_ATMOSPHERE);
    const optics = createWaterOpticsUniforms(DEFAULT_WATER_OPTICS);
    const foam = new FoamField({ foamNode: (xz) => sets.breakingFoamNode(xz), dirNode: (xz) => sets.sample(xz, true).dir });
    const plain = new OceanSurface(model, sky, optics);
    const withFoam = new OceanSurface(model, sky, optics, { foamMap: foam });
    for (const which of ['aboveMaterial', 'belowMaterial'] as const) {
      const wgsl = (s: OceanSurface): { vertex: string; fragment: string } => renderWgsl(new THREE.Mesh(s.mesh.geometry, s[which]));
      it(`${which}: at most ${MAX_STORAGE_BUFFERS_PER_STAGE} storage buffers and 16 sampled textures per stage, with the foam map`, () => {
        const w = wgsl(withFoam);
        console.log(`sheet ${which} sampled textures: vertex ${sampledTextures(w.vertex)}, fragment ${sampledTextures(w.fragment)}`);
        for (const stage of [w.vertex, w.fragment]) {
          expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
          expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
        }
      });
      it(`${which}: the foam map adds exactly one sampled texture to the fragment stage`, () => {
        expect(sampledTextures(wgsl(withFoam).fragment) - sampledTextures(wgsl(plain).fragment)).toBe(1);
      });
    }
    it('the ribbon with the foam map stays within the limits and samples the map in its vertex stage', () => {
      const shading = { model, sky, optics };
      const r0 = new BreakingRibbon(modelRibbonSurface(model), DEFAULT_BREAK_PARAMS, shading);
      const r1 = new BreakingRibbon(modelRibbonSurface(model), DEFAULT_BREAK_PARAMS, { ...shading, foamMap: foam });
      const w0 = renderWgsl(r0.mesh), w1 = renderWgsl(r1.mesh);
      expect(sampledTextures(w1.vertex) - sampledTextures(w0.vertex)).toBe(1);
      for (const stage of [w1.vertex, w1.fragment]) {
        expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
        expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
      }
    });
  });
```

Add to `src/ocean/OceanSurface.test.ts`:

```ts
import { waterFoamFrameCpu } from './OceanSurface';

describe('the foam pattern rides the water, not the crest', () => {
  it('is base xz in the mean swell frame: (along travel, across it), so it stays put while crests pass', () => {
    expect(waterFoamFrameCpu(3, 4, 1, 0)).toEqual([3, 4]);
    const [a, b] = waterFoamFrameCpu(1, 0, Math.SQRT1_2, Math.SQRT1_2);
    expect(a).toBeCloseTo(Math.SQRT1_2, 12);
    expect(b).toBeCloseTo(-Math.SQRT1_2, 12);
  });
});
```

Add to `src/dev/DevPanel.test.ts` nothing: the existing "one binding per DebugOverlays field" test will fail once `foamMap` is added to `DebugOverlays` in Step 3 and pass once `OVERLAY_BINDINGS` has it.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/breaker/BreakingRibbon.limits.test.ts src/ocean/OceanSurface.test.ts`
Expected: FAIL. `waterFoamFrameCpu` isn't exported; `foamMap` isn't an option (a type error at runtime is ignored, so the "adds exactly one" tests fail with a difference of 0).

- [ ] **Step 3: Implement in `OceanSurface.ts`**

Add, after `setFoamPattern`:

```ts
/**
 * The foam pattern's water-anchored coordinates (spec 2026-09-27-foam-field-design.md §3.2): base xz in the mean
 * swell frame, vec2(metres along travel, metres across it). Crests pass through it; foam stays where the water put
 * it, and the pattern keeps its streaks along the crests (setFoamPattern's x is its long axis). CPU mirror below.
 */
export function waterFoamFrame(xz: N, travel: N): N {
  return vec2(xz.x.mul(travel.x).add(xz.y.mul(travel.y)), xz.y.mul(travel.x).sub(xz.x.mul(travel.y)));
}

export function waterFoamFrameCpu(x: number, z: number, travelX: number, travelZ: number): [number, number] {
  return [x * travelX + z * travelZ, z * travelX - x * travelZ];
}

/** The breaking foam map (FoamField), sampled at the undisplaced base xz. */
export interface SheetFoamMap {
  sampleNode(xz: N): { density: N; inside: N };
}

/**
 * The foam weight a surface point uses: the map inside its box, the Phase 2 placeholder outside, blended over the edge
 * band. Takes one sample (sampleNode's result, or null without a map) so each material binds the map once.
 */
export function sheetFoamWeight(placeholder: N, sample: { density: N; inside: N } | null): N {
  return sample ? mix(placeholder, sample.density, sample.inside) : placeholder;
}
```

Add `mix` to the `three/tsl` import. In `DebugOverlays`, add:

```ts
  /** The foam map: its box tinted faintly and its density in cyan, to see foam build up and clear. */
  foamMap: boolean;
```

Then set `DEFAULT_DEBUG_OVERLAYS` to `{ depthContours: false, crestLines: false, ribbonTint: false, foamMap: false }`.

Add `foamMap?: SheetFoamMap;` to `OceanSurfaceOptions`, and `private readonly overlayFoam = uniform(0);` to the class fields.

In the constructor, replace:

```ts
    const setFoamLook = setFoamPattern(setFoam, setFoamFrame, model.sim.time);
```

with:

```ts
    // The foam map inside its box, Phase 2's placeholder outside (spec 2026-09-27-foam-field-design.md §3.2); the
    // pattern rides the water. setFoamFrame (the crest frame) stays computed for the spec's fallback, unused here.
    // One sample, shared by the weight and the overlay (one texture binding).
    const foamOverlay = options.foamMap ? options.foamMap.sampleNode(vBaseXZ) : null;
    const foamWeight = sheetFoamWeight(setFoam, foamOverlay);
    const setFoamLook = setFoamPattern(foamWeight, waterFoamFrame(vBaseXZ, model.sets.meanTravel), model.sim.time);
```

Extend the `overlay:` object passed to `shadeWater` with:

```ts
foamMap: foamOverlay ? foamOverlay.density.add(foamOverlay.inside.mul(0.15)) : float(0.0), foamOn: this.overlayFoam
```

In `setOverlays`, add `this.overlayFoam.value = o.foamMap ? 1 : 0;`. The below material already uses `setFoamLook.x`, so it follows automatically.

- [ ] **Step 4: Implement the overlay in `waterShading.ts`**

Change the overlay type to:

```ts
  overlay?: { depth: N; tau: N; depthOn: N; crestOn: N; foamMap?: N; foamOn?: N };
```

In `withOverlay`'s `Fn`, after the crest line:

```ts
      if (o.foamMap && o.foamOn) {
        const map = o.foamMap;
        If(o.foamOn.greaterThan(0.5), () => { c.assign(mix(c, foamLight.mul(vec3(0.25, 0.9, 1.0)), saturate(map).mul(0.8))); });
      }
```

- [ ] **Step 5: Implement in `BreakingRibbon.ts`**

Add `foamMap?: SheetFoamMap;` to `RibbonShading`, importing `type SheetFoamMap, sheetFoamWeight, waterFoamFrame` from `../ocean/OceanSurface` next to the existing imports from that module. In `buildMaterial`, change the destructure to `const { model, sky, optics, foamMap } = shading;`. Replace the `vSetFoam` varying's body so the foam at the home comes from the map:

```ts
    const vSetFoam: N = varying(Fn(() => {
      const b = model.sets.breakSampleNode(home.xy);
      vSetSlope.assign(b.slope);
      return sheetFoamWeight(b.foam, foamMap ? foamMap.sampleNode(home.xy) : null);
    })());
```

Replace the `foamLook` line with:

```ts
    const foamLook = setFoamPattern(max(vSetFoam, curlFoam.mul(rho)), waterFoamFrame(vHome.xy, model.sets.meanTravel), model.sim.time);
```

(`vSetFoam` is now a float, so the `.x` and `.yz` uses go away.)

- [ ] **Step 6: Add the overlay's panel binding**

In `src/dev/DevPanel.ts` `OVERLAY_BINDINGS`, add `foamMap: { label: 'foam map' },`. In `src/dev/devSettings.test.ts` `tweaked()`, add `s.overlays.foamMap = true;`.

- [ ] **Step 7: Add the water frame node self-test**

Append to `src/whitewater/foamField.selftest.ts`, adding `waterFoamFrame, waterFoamFrameCpu` to its imports from `'../ocean/OceanSurface'`:

```ts
registerSelfTest({
  name: 'foam: the water-anchored pattern frame node matches the CPU',
  async run(renderer) {
    const pts: [number, number, number, number][] = [[3, 4, 1, 0], [1, 0, Math.SQRT1_2, Math.SQRT1_2], [-120, 35, 0.8, -0.6]];
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flat()), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.length * 4), 4);
    const input = storage(inAttr, 'vec4', pts.length).toReadOnly();
    const out = storage(outAttr, 'vec4', pts.length);
    const pass = Fn(() => {
      const v = input.element(instanceIndex);
      out.element(instanceIndex).assign(vec4(waterFoamFrame(v.xy, v.zw), 0.0, 0.0));
    })().compute(pts.length) as THREE.ComputeNode;
    renderer.compute(pass);
    const g = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const worst = pts.reduce((m, [x, z, tx, tz], i) => {
      const [a, b] = waterFoamFrameCpu(x, z, tx, tz);
      return Math.max(m, Math.abs(g[i * 4] - a), Math.abs(g[i * 4 + 1] - b));
    }, 0);
    return { pass: worst < 1e-4, detail: `worst ${worst.toExponential(2)}` };
  },
});
```

- [ ] **Step 8: Run all the tests and commit**

Run: `npx vitest run` (expected: all pass, including the new limits tests; the logged fragment count should read 14 or fewer) and `npm run typecheck` (expected: no errors).

```bash
git add src/ocean/OceanSurface.ts src/ocean/OceanSurface.test.ts src/ocean/waterShading.ts src/breaker/BreakingRibbon.ts src/breaker/BreakingRibbon.limits.test.ts src/dev/DevPanel.ts src/dev/devSettings.test.ts src/whitewater/foamField.selftest.ts
git commit -m "feat(foam): the sheet, the view from below and the ribbon read the foam map; the pattern rides the water

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: App wiring, the Foam folder and persistence

**Files:**
- Modify: `src/app/App.ts`
- Modify: `src/dev/devSettings.ts` and `src/dev/devSettings.test.ts`
- Modify: `src/dev/DevPanel.ts` and `src/dev/DevPanel.test.ts`

**Interfaces:**
- Consumes: `FoamField`, `FoamParams`, `DEFAULT_FOAM_PARAMS`, `FOAM_PARAM_RANGES`, `normalizeFoamParams` (Tasks 1–2); `OceanSurfaceOptions.foamMap`, `RibbonShading.foamMap` (Task 3).
- Produces:
  - `DevLookParams.foam: FoamParams`, with `'foam'` in `LOOK_KEYS`;
  - `DevPanelModel.foam`, `DevPanelHandlers.onFoam()`;
  - `FOAM_BINDINGS` (DevPanel);
  - `App.foamParams`;
  - `App.measureFoamReplay(): Promise<{ ms: number; steps: number }>` (dev, for Task 5).

- [ ] **Step 1: Write the failing tests**

In `src/dev/DevPanel.test.ts`, extend the import to include `FOAM_BINDINGS`, and add:

```ts
import { DEFAULT_FOAM_PARAMS, FOAM_PARAM_RANGES, type FoamParams } from '../whitewater/foamStep';

describe('Foam folder sliders', () => {
  it('has a slider for every FoamParams field, each inside what normalizeFoamParams keeps', () => {
    expect(Object.keys(FOAM_BINDINGS).sort()).toEqual((Object.keys(DEFAULT_FOAM_PARAMS) as (keyof FoamParams)[]).sort());
    for (const k of Object.keys(FOAM_BINDINGS) as (keyof FoamParams)[]) {
      expect(FOAM_BINDINGS[k].min).toBe(FOAM_PARAM_RANGES[k].min);
      expect(FOAM_BINDINGS[k].max).toBe(FOAM_PARAM_RANGES[k].max);
    }
  });
});
```

In `src/dev/devSettings.test.ts`:
- add `import { DEFAULT_FOAM_PARAMS } from '../whitewater/foamStep';`;
- add `foam: DEFAULT_FOAM_PARAMS,` to `defaults()` after `breaking`;
- add `s.foam.clearTimeS = 14; s.foam.driftMps = 0.9;` to `tweaked()`.

The existing round-trip test then proves `foam` is stored and read back.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/dev`
Expected: FAIL. `FOAM_BINDINGS` isn't exported, and the round trip loses `foam` because it isn't in `LOOK_KEYS`.

- [ ] **Step 3: Implement the settings and the panel**

In `src/dev/devSettings.ts`:
- import `type FoamParams` from `'../whitewater/foamStep'`;
- add `foam: FoamParams;` to `DevLookParams` after `breaking`;
- append `'foam'` to `LOOK_KEYS`.

In `src/dev/DevPanel.ts`:
- import `type FoamParams` and `FOAM_PARAM_RANGES` from `'../whitewater/foamStep'`;
- add `foam: FoamParams;` to `DevPanelModel` and `onFoam(): void;` to `DevPanelHandlers`;
- add after `OVERLAY_BINDINGS`:

```ts
/** Foam folder sliders (spec 2026-09-27-foam-field-design.md §3.1), ranges exactly normalizeFoamParams's (DevPanel.test.ts). */
export const FOAM_BINDINGS = {
  clearTimeS: { label: 'clear time (s)', ...FOAM_PARAM_RANGES.clearTimeS, step: 0.5 },
  driftMps: { label: 'foam drift (m/s)', ...FOAM_PARAM_RANGES.driftMps, step: 0.05 },
} as const;
```

After the Break folder's loop, add:

```ts
    const foam = this.pane.addFolder({ title: 'Foam' });
    for (const [key, opts] of Object.entries(FOAM_BINDINGS) as [keyof FoamParams, (typeof FOAM_BINDINGS)[keyof typeof FOAM_BINDINGS]][]) {
      foam.addBinding(m.foam, key, opts).on('change', h.onFoam);
    }
```

`onAnySettingChanged` needs nothing extra: the pane-wide change listener (`DevPanel.ts` near line 267) already calls it for every binding.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/dev`
Expected: PASS.

- [ ] **Step 5: Wire App**

In `src/app/App.ts`:

1. Imports:

```ts
import { FoamField } from '../whitewater/FoamField';
import { DEFAULT_FOAM_PARAMS, type FoamParams, normalizeFoamParams } from '../whitewater/foamStep';
```

2. Fields. Add `readonly foamParams: FoamParams = { ...DEFAULT_FOAM_PARAMS };` next to `breakParams`, **before** `lookDefaults`. Add, after `readonly probe = ...` and before `ribbon`:

```ts
  /** Breaking foam that lingers and drifts (spec 2026-09-27-foam-field-design.md), stepped at 20 Hz of sim time. */
  readonly foamField = new FoamField({
    foamNode: (xz) => this.setWaves.breakingFoamNode(xz),
    dirNode: (xz) => this.setWaves.sample(xz, true).dir,
  });
  private foamTimer: number | undefined;
```

Change the ribbon's shading to `{ model: this.surfaceModel, sky: this.sky, optics: this.waterOptics, foamMap: this.foamField }`. Change the `OceanSurface` construction to pass `{ footprint: { texture: this.ribbon.footprint, ...FOOTPRINT_GRID }, foamMap: this.foamField }`.

3. Replay triggers:
- in `applyMoment` after `this.ocean.resetFoam();`, and in `callSetNow` after `this.ocean.resetFoam();`: `this.foamField.invalidate();`;
- in `rebuildSpectrumIfNeeded` after `this.ocean.setConditions(...)`: `this.foamField.invalidate();`;
- in `fieldClient.onField`, after `this.setWaves.setField(f);`: `this.foamField.invalidate();`.

Add a debounced trigger method next to `scheduleSpectrumRebuild`:

```ts
  /** Slider edits change the foam the map would hold: replay once the drag stops (Review Focus 3), not on every event. */
  private scheduleFoamReplay(): void {
    clearTimeout(this.foamTimer);
    this.foamTimer = window.setTimeout(() => this.foamField.invalidate(), SPECTRUM_REBUILD_DEBOUNCE_MS);
  }
```

- in the panel handlers, add `onFoam: () => { normalizeFoamParams(this.foamParams); this.foamField.setParams(this.foamParams); this.panel.refresh(); this.scheduleFoamReplay(); },`;
- append `this.scheduleFoamReplay();` to the bodies of `onBreak` and `onSets` (ruling R3);
- add `foam: this.foamParams,` to the panel model object.

4. Look plumbing: add `foam: this.foamParams,` to `lookParams()`; add `assignParams(this.foamParams, look.foam);` to `assignLook`; add `normalizeFoamParams(this.foamParams); this.foamField.setParams(this.foamParams);` to `applyAllParams` after the break params.

5. The per-frame step. In `frame`, right after `this.setWaves.setEvents(events);`:

```ts
    this.stepFoam(events);
```

Add the method next to `updateRibbon`:

```ts
  /**
   * Runs the foam field's ticks for this frame (none while paused; a replay after a jump). Each tick points the ocean's
   * time uniform and the waves buffer at its own time; both are restored for the frame's render and probe.
   */
  private stepFoam(events: readonly WaveEvent[]): void {
    const steps = this.foamField.advance(this.renderer, this.clock.simTime, (t) => {
      this.ocean.time.value = t;
      this.setWaves.setEvents(wavesNear(t, this.conditions, this.setParams));
    });
    if (steps === 0) return;
    this.ocean.time.value = this.clock.simTime;
    this.setWaves.setEvents(events);
  }

  /** Dev (Task 5, spec §3.4): times a forced replay to the GPU's completion. ms / steps is one step's cost. */
  async measureFoamReplay(): Promise<{ ms: number; steps: number }> {
    const device = (this.renderer.backend as unknown as { device: GPUDevice }).device;
    await device.queue.onSubmittedWorkDone();
    this.foamField.invalidate();
    const start = performance.now();
    const steps = this.foamField.advance(this.renderer, this.clock.simTime, (t) => {
      this.ocean.time.value = t;
      this.setWaves.setEvents(wavesNear(t, this.conditions, this.setParams));
    });
    await device.queue.onSubmittedWorkDone();
    const ms = performance.now() - start;
    this.ocean.time.value = this.clock.simTime;
    this.setWaves.setEvents(wavesNear(this.clock.simTime, this.conditions, this.setParams));
    return { ms, steps };
  }
```

- [ ] **Step 6: Run everything**

Run: `npx vitest run` (expected: all pass) and `npm run typecheck` (expected: no errors).
Then, in the browser pane (fronted tab):
- `/?selftest&fresh`: expected `SUMMARY 37/37`;
- plain `/`: expected no console errors, and the Foam folder visible with its two sliders.

- [ ] **Step 7: Commit**

```bash
git add src/app/App.ts src/dev/devSettings.ts src/dev/devSettings.test.ts src/dev/DevPanel.ts src/dev/DevPanel.test.ts
git commit -m "feat(foam): App steps the foam field each frame, replays on jumps; Foam folder, persisted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Measure, capture, document

**Files:**
- Create: `docs/superpowers/gallery/phase-3/` (PNG captures) and `docs/superpowers/gallery/phase-3/README.md`
- Modify: `docs/superpowers/phase-0-followups.md` (the two foam entries)
- Modify: `docs/superpowers/specs/2026-09-27-foam-field-design.md` (Status line, measured cost)

- [ ] **Step 1: Measure the cost**

Do this in a fronted browser-pane tab on `/?fresh`, after the field has arrived (the break is visible).
1. Run `await window.liquidDreams.measureFoamReplay()` five times. Record the median `ms` and `steps`.
2. One step ≈ `ms / steps`.
3. The per-frame cost ≈ 2 × that (two ticks on some frames at 60 fps). The copy pass is included.

Expected: replay ≤ 200 ms and per-frame ≤ 0.5 ms. **If either is over, stop here.** Write the numbers into the ledger and report them to Andrew with the spec's three levers (§3.4), then wait for his choice. Don't pick a lever yourself.

- [ ] **Step 2: Check slider drags and the startup by hand**

- Drag `clear time (s)` from 10 to 20 and back while paused. Expected: the frame rate doesn't stall during the drag. The map changes once, about 150 ms after you release.
- Reload `/?fresh`. Expected: foam appears with the first breaking wave. There are no NaN or black patches before or after the field arrives.

- [ ] **Step 3: Find the close pair**

Run once as a throwaway (don't commit it): `npx vitest run` on a scratch test that prints the first default-conditions set containing a long-tail wave:

```ts
import { it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
it('find a step', () => {
  for (let k = 0; k < 400; k++) {
    const ws = wavesOfSet(k, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
    const i = ws.findIndex((w) => w.longTail);
    if (i >= 0) { console.log(`set ${k}: wave ${i} long tail at ${ws[i].arrivalS.toFixed(2)} s, next at ${ws[i + 1].arrivalS.toFixed(2)} s, heights ${ws.map((w) => w.heightM.toFixed(2)).join(',')}`); return; }
  }
});
```

Save it as `src/whitewater/zz_find.test.ts`. Run `npx vitest run src/whitewater/zz_find.test.ts --silent=false`, note the set and times, then delete the file.

- [ ] **Step 4: Capture the gallery**

Use the moment API: `ld.applyMoment({...ld.currentMoment(), simTime, paused: true, camera})` then `ld.captureFrame()`, POSTing the PNG to the local shot server. Use a fronted tab and reload between frames. The camera is the lineup at the channel looking at the peak (`[-25, 0.8, 45]`, yaw 270, pitch −2, the default moment's camera), or `behind-the-wave`'s view for the bore.
- `01-foam-lingering.png`: REF_BIGGEST (the default set 1's biggest wave) at arrival + 8 s. The bore has passed and its foam lingers over the shelf.
- `02-foam-clearing-0s.png`, `-3s`, `-6s`, `-10s`: the same view at arrival + 4, 7, 10 and 14 s.
- `03-close-pair.png`: the Step 3 set's following wave at its arrival + 1.5 s, breaking into the long-tail wave's leftovers.
- `04-foam-map-overlay.png`: the `foam map` overlay on, at arrival + 8 s, from `behind-the-wave`.
- `05-pattern-on-bore.png`: a close view of an active bore, for Andrew's judgement of the water-anchored pattern (spec §3.2).

Write `docs/superpowers/gallery/phase-3/README.md` with one line per image (what it shows, the moment, the measured costs).

- [ ] **Step 5: Update the docs**

In `docs/superpowers/phase-0-followups.md`:
- replace "**Whitewater is a placeholder.**" with "**Done 2026-09-27 (Phase 3a):** foam persists and clears over `clearTime` in a foam map (`src/whitewater/`); lip impact, spit and spray are Phase 3b.";
- mark the "Phase 3 foam must persist and drift" entry as done, citing Andrew's revision ("gone quickly; leftovers within a set only").

In the spec, set the Status line to "Implemented on `phase-3a-foam-field` (2026-09-27); awaiting Andrew's review." and add the measured replay ms and per-step ms under §3.4.

- [ ] **Step 6: Final suite run and commit**

Run: `npx vitest run` (expected: all pass), `npm run typecheck` (expected: no errors), and `/?selftest&fresh` (expected: `SUMMARY 37/37`).

```bash
git add docs/superpowers/gallery/phase-3 docs/superpowers/phase-0-followups.md docs/superpowers/specs/2026-09-27-foam-field-design.md
git commit -m "docs(foam): Phase 3a gallery, measured cost, follow-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
