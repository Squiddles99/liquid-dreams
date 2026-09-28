# Phase 4b: The Waterline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surf along the whole coast: bores rolling across the shore platform once per swell period, in step with the Womb's sets; swash running up the sand; and the wet line it leaves.

**Architecture:**
- A deterministic coastal surf model lives in `src/surf/surfModel.ts` (the CPU reference).
- Its TSL mirror, `src/surf/CoastalSurf.ts`, reads two uniform tables the CPU fills: τ along the coast, and each wave's breaking height.
- The ocean surface takes the swash lift in its vertex stage and the surf foam and swash lace in its fragment stage.
- The seabed's shading bed follows the beach landward of the waterline.
- The land's sand is wet up to the recent runup.

**Tech Stack:** TypeScript (tsgo 7), three.js 0.186.1 WebGPU + TSL, vitest 5, the in-browser GPU self-tests.

**Spec:** `docs/superpowers/specs/2026-09-28-the-waterline-design.md` (ruled by Claude under Andrew's delegation, rulings W0–W8)

## Global Constraints

- **τ table:** z ∈ [−15000, 15000] every 25 m (1201 entries); τ_coast(z) = sampleField(field, 190 − W(z), z).tau with W = `shoreReefWidth`.
- **Height table:** 256 entries, indices n_base…n_base + 255, clamped at the ends.
  - between sets: 0.45 · Hs · U(0.8, 1.2) by a hash of n;
  - a set wave (its arrival rounds to n·T): 0.55 × heightM;
  - all × `surf amount`.
- **Bores:**
  - t_break = n·T + τ_coast(z); speed 3.5 m/s; front d_f = W − 3.5·age, alive for d_f ∈ [0, W];
  - strength (H/1.5)·(1 − 0.6·(1 − d_f/W));
  - foam = strength·(exp(−((d − d_f)/2.5)²) + [d > d_f]·0.6·exp(−(d − d_f)/12) + burst), with burst = (1 − age/1.5)·exp(−((d − W)/6)²) for age < 1.5 s;
  - lace = 0.25 × the mean H/1.5 of the last two waves, over the zone;
  - only d ∈ [−5, W + 30]; the three most recent breaks.
- **Distance:** blend to the time-average, 0.3·mean H/1.5 over the zone, once fwidth(d) passes 1.5–4 m.
- **Swash:**
  - arrival t_break + W/3.5; runup R = 0.25·H + 0.05 m (0 when H ≤ 0.01);
  - shape: rise over the first 25% of T_s = 0.6·T, drain over the rest;
  - level = max of the two latest arrivals;
  - lift = level·(1 − smoothstep(0, 40, d)).
- **Wet level:** max over the last six arrivals of R·exp(−(t − t_arrive)/90 s). The sand is wet below tide + level, with a 0.12 m soft edge.
- **The shading bed landward of the waterline** (d < 0): max(bed, beachHeight(−d)) with the default beach profile; the material there is sand. The wave model's arrays are unchanged.
- **Limits:** ≤ 8 storage buffers, ≤ 16 sampled textures, ≤ 12 uniform buffers per stage. **No new sampled textures.**
- **Cost:**
  - ocean fragment ≤ +0.3 ms, vertex ≤ +0.1 ms, land ≤ +0.1 ms;
  - tables ≤ 0.2 ms of CPU per frame; τ table ≤ 5 ms per field change.
- **Repo rules:**
  - `reference/` is never committed;
  - stage files by path;
  - never commit `.superpowers/`;
  - every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - branch `phase-4b-the-waterline`; push; **do not merge**.

## Review Focus

1. **Surf off, or `surf amount` 0:** no foam, no lift, no runup (the sand dry above the tide), and nothing NaN. Pinned in Task 1 (the model at amount 0 and disabled) and Task 3 (the self-test with surf off).
2. **A flat swell (size 0, no sets) or a reef field not yet computed at load:** the surf is quiet and nothing throws. Pinned in Task 1 (Hs 0) and Task 3 (`update` with a null field).
3. **Large sim times and time jumps (a moment link at t ≈ 4000 s, paused, scrubbing):** the tables follow the time without drifting, and no index falls outside the table near the current time. Pinned in Task 1 (the table range at t = 4163 s covers every break and arrival along the coast).
4. **Short periods (T = 8 s) and long ones (20 s):** the height table still covers the coast's τ span. Pinned in Task 1 (coverage at T = 8 s).
5. **Tide extremes (±1.5 m):** the wet line and the swash ride the tide, and the beach bed stays continuous with the seabed at the waterline. Pinned in Task 2 (bed continuity at d = 0) and Task 4 (wetness relative to the tide).

---

## File structure

| File | Responsibility |
|---|---|
| `src/swell/sets.ts` | + `wavesBetween(t0, t1, c, p)`: every wave in a window, uncapped. |
| `src/surf/surfModel.ts` (+test) | CPU model: constants, params, the τ table, heights, bores and foam, swash, the wet level. |
| `src/surf/CoastalSurf.ts` | The uniform tables and the TSL nodes; `update()` from the App. |
| `src/surf/surf.selftest.ts` | GPU nodes vs the CPU model. |
| `src/seabed/Seabed.ts`, `bathymetry.ts` | The beach bed and sand landward of the waterline; public `waterlineShiftNode`; exported `shoreReefWidthNode`. |
| `src/ocean/OceanSurface.ts` | The swash lift, surf foam, swash lace. |
| `src/land/landShading.ts`, `Land.ts` | The wet line. |
| `src/app/App.ts`, `src/dev/DevPanel.ts`, `devSettings.ts`, `referenceMoments.ts` | Wiring, the Surf folder, persistence, the moment. |

---

### Task 1: The coastal surf model (CPU)

**Files:**
- Modify: `src/swell/sets.ts` (add `wavesBetween`), `src/swell/sets.test.ts`
- Create: `src/surf/surfModel.ts`, `src/surf/surfModel.test.ts`

**Interfaces:**
- Produces:
  - `wavesBetween(t0: number, t1: number, c: Conditions, p: SetParams): WaveEvent[]`;
  - from `surfModel.ts`:
    - every constant listed in its code below;
    - `SurfParams`, `DEFAULT_SURF_PARAMS`, `SURF_PARAM_RANGES`, `normalizeSurfParams`;
    - `buildTauTable(tauAt)`, `tableAt(tau, z)`;
    - `hash01(n)`, `lullHeight(n, hs)`, `heightRange(t, T, tauMin, tauMax): { lo; hi }`, `buildHeights(range, T, hs, events, amount): SurfTable`, `heightOf(table, n)`;
    - `SurfState { tau; table; periodS; enabled }`;
    - `boreStrength`, `surfFoam(d, z, t, s)`, `surfFoamFar(d, z, s)`;
    - `swashShape(u)`, `runupOf(H)`, `swashLevel(z, t, s)`, `wetLevel(z, t, s)`, `swashLift(d)`.

- [ ] **Step 1: Write the failing tests.**

Append to `src/swell/sets.test.ts` (import `wavesBetween`; the file already imports `wavesNear`, the defaults and `cloneConditions`; add any of those that are missing):

```ts
describe('wavesBetween', () => {
  it('lists every wave arriving in the window, sorted and uncapped, including those wavesNear returns', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    const t0 = 1000, t1 = 3000;
    const all = wavesBetween(t0, t1, c, DEFAULT_SET_PARAMS);
    for (let i = 1; i < all.length; i++) expect(all[i].arrivalS).toBeGreaterThanOrEqual(all[i - 1].arrivalS);
    for (const w of all) { expect(w.arrivalS).toBeGreaterThanOrEqual(t0); expect(w.arrivalS).toBeLessThanOrEqual(t1); }
    for (const w of wavesNear(2000, c, DEFAULT_SET_PARAMS)) {
      if (w.arrivalS >= t0 && w.arrivalS <= t1) expect(all.some((a) => a.arrivalS === w.arrivalS)).toBe(true);
    }
    expect(all.length).toBeGreaterThan(8);
  });
  it('is empty for a flat swell', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = 0;
    expect(wavesBetween(0, 5000, c, DEFAULT_SET_PARAMS)).toEqual([]);
  });
});
```

`src/surf/surfModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shoreReefWidth } from '../seabed/shoreReef';
import {
  BORE_SPEED_MS, SURF_NZ, SURF_TABLE, SURF_Z0, SURF_DZ, SWASH_FRACTION, type SurfState, buildHeights, buildTauTable, heightOf, heightRange,
  lullHeight, runupOf, surfFoam, surfFoamFar, swashLevel, swashLift, swashShape, tableAt, wetLevel,
} from './surfModel';

const T = 15;
/** A coast whose τ grows 0.02 s per m of z (an oblique swell), with a set wave at n = 10. */
function state(amount = 1, hs = 1.6, enabled = true): SurfState {
  const tau = buildTauTable((_x, z) => 0.02 * z);
  const tauMin = tau[0], tauMax = tau[SURF_NZ - 1];
  const table = buildHeights(heightRange(150, T, tauMin, tauMax), T, hs, [{ arrivalS: 150.4, heightM: 2.6 }], amount);
  return { tau, table, periodS: T, enabled };
}

describe('the τ table', () => {
  it('samples the field at the platform edge every 25 m, and interpolates between', () => {
    const seen: [number, number][] = [];
    const tau = buildTauTable((x, z) => { seen.push([x, z]); return x + z; });
    expect(tau.length).toBe(SURF_NZ);
    expect(seen[0]).toEqual([190 - shoreReefWidth(SURF_Z0), SURF_Z0]);
    expect(tableAt(tau, SURF_Z0 + SURF_DZ / 2)).toBeCloseTo((tau[0] + tau[1]) / 2, 3);
  });
});

describe('the heights', () => {
  it('a set wave breaks at 0.55 × its height at the index its arrival rounds to; lulls vary ±20%', () => {
    const s = state();
    expect(heightOf(s.table, 10)).toBeCloseTo(0.55 * 2.6, 6);
    for (let n = s.table.base; n < s.table.base + SURF_TABLE; n++) {
      if (n === 10) continue;
      const h = heightOf(s.table, n);
      expect(h).toBeGreaterThanOrEqual(0.45 * 1.6 * 0.8 - 1e-6);
      expect(h).toBeLessThanOrEqual(0.45 * 1.6 * 1.2 + 1e-6);
    }
    expect(lullHeight(7, 1.6)).toBe(lullHeight(7, 1.6));
  });
  it('surf amount scales every height; a flat swell or amount 0 gives none', () => {
    expect(heightOf(state(2).table, 10)).toBeCloseTo(2 * 0.55 * 2.6, 6);
    const flat = state(1, 0);
    expect(heightOf(flat.table, 3)).toBe(0);
    const off = state(0);
    for (let n = off.table.base; n < off.table.base + SURF_TABLE; n += 17) expect(heightOf(off.table, n)).toBe(0);
  });
  it('the range covers every break and arrival along the coast, even at t = 4163 s and T = 8 s', () => {
    for (const [t, period] of [[4163, 15], [4163, 8], [150, 20]]) {
      const tauMin = 0.02 * -15000, tauMax = 0.02 * 15000;
      const r = heightRange(t, period, tauMin, tauMax);
      expect(r.hi - r.lo + 1).toBeLessThanOrEqual(SURF_TABLE);
      // the latest break anywhere, and the sixth-latest arrival anywhere (the wet line's history)
      expect(r.hi).toBeGreaterThanOrEqual(Math.floor((t - tauMin) / period));
      expect(r.lo).toBeLessThanOrEqual(Math.floor((t - tauMax - 100 / BORE_SPEED_MS) / period) - 5);
    }
  });
});

describe('the bores', () => {
  const s = state();
  const z = 0, W = shoreReefWidth(z);
  const tBreak = 10 * T + tableAt(s.tau, z); // the set wave breaks here
  it('no foam outside the surf zone', () => {
    expect(surfFoam(W + 31, z, tBreak + 3, s)).toBe(0);
    expect(surfFoam(-6, z, tBreak + 3, s)).toBe(0);
  });
  it('a bore bursts at the break line when it breaks, then its front runs shoreward at 3.5 m/s', () => {
    expect(surfFoam(W, z, tBreak + 0.2, s)).toBeGreaterThan(surfFoam(W, z, tBreak - 0.2, s));
    const age = 8, df = W - BORE_SPEED_MS * age;
    expect(surfFoam(df, z, tBreak + age, s)).toBeGreaterThan(surfFoam(df - 6, z, tBreak + age, s));
    expect(surfFoam(df, z, tBreak + age, s)).toBeGreaterThan(0.5);
  });
  it('surf off gives no foam; the far band is steady and inside the zone', () => {
    expect(surfFoam(W / 2, z, tBreak + 5, state(1, 1.6, false))).toBe(0);
    expect(surfFoamFar(W / 2, z, s)).toBeGreaterThan(0);
    expect(surfFoamFar(W + 20, z, s)).toBe(0);
  });
});

describe('the swash and the wet line', () => {
  const s = state();
  const z = 0, W = shoreReefWidth(z);
  const tArrive = 10 * T + tableAt(s.tau, z) + W / BORE_SPEED_MS;
  const Ts = SWASH_FRACTION * T;
  it('the swash shape rises then drains, and is 0 outside its time', () => {
    expect(swashShape(-0.1)).toBe(0);
    expect(swashShape(0.25)).toBe(1);
    expect(swashShape(1)).toBe(0);
  });
  it('the set bore runs up to its runup, and is gone by the end of the swash', () => {
    const R = runupOf(0.55 * 2.6);
    expect(swashLevel(z, tArrive + 0.25 * Ts, s)).toBeCloseTo(R, 3);
    expect(swashLevel(z, tArrive - 0.01, s)).toBeLessThan(R);
    expect(runupOf(0)).toBe(0);
  });
  it('the wet line holds the latest runup right after, decays after, never negative; the lift reaches 40 m out', () => {
    const R = runupOf(0.55 * 2.6);
    expect(wetLevel(z, tArrive + 0.01, s)).toBeGreaterThanOrEqual(R * 0.99);
    expect(wetLevel(z, tArrive + 60, s)).toBeLessThan(R);
    expect(wetLevel(z, tArrive + 60, s)).toBeGreaterThan(0);
    expect(swashLift(-3)).toBe(1);
    expect(swashLift(40)).toBe(0);
    expect(swashLevel(z, tArrive + 1, state(1, 1.6, false))).toBe(0);
    expect(wetLevel(z, tArrive + 1, state(0))).toBe(0);
  });
});
```

- [ ] **Step 2: Run them:** `npx vitest run src/swell/sets.test.ts src/surf/surfModel.test.ts`. Expected: FAIL (`wavesBetween` is not exported; `./surfModel` is missing).

- [ ] **Step 3: Implement.**

In `src/swell/sets.ts`, after `wavesNear`:

```ts
/**
 * Every wave whose crest reaches the peak within [t0, t1], sorted, uncapped (the coastal surf's height table spans
 * many sets; spec 2026-09-28-the-waterline-design.md §3.1). Empty for a flat swell.
 */
export function wavesBetween(t0: number, t1: number, c: Conditions, p: SetParams): WaveEvent[] {
  if (surferFeetToHs(c.swell.sizeFt) <= 0) return [];
  const setSpan = p.maxWaves * c.swell.periodS * (1 + p.spacingJitter);
  const k0 = Math.floor((t0 - setSpan - p.intervalJitterS - p.meanIntervalS) / p.meanIntervalS);
  const k1 = Math.ceil((t1 + p.intervalJitterS) / p.meanIntervalS);
  const out: WaveEvent[] = [];
  for (let k = k0; k <= k1; k++) {
    for (const w of [...wavesOfSet(k, c, p), ...straysAfterSet(k, c, p)]) if (w.arrivalS >= t0 && w.arrivalS <= t1) out.push(w);
  }
  return out.sort((a, b) => a.arrivalS - b.arrivalS);
}
```

`src/surf/surfModel.ts`:

```ts
import { smoothstep } from '../math/smoothstep';
import { SHORE_X } from '../seabed/coastProfile';
import { shoreReefWidth } from '../seabed/shoreReef';

/**
 * The coastal surf (spec 2026-09-28-the-waterline-design.md): one breaker per swell period at the shore platform's
 * edge, all along the coast, timed from the reef field's arrival time there, bigger when the Womb's sets come through;
 * each breaks into a bore that runs to the sand and up the beach. The CPU reference of CoastalSurf's TSL nodes.
 */
export const SURF_Z0 = -15000;
export const SURF_DZ = 25;
export const SURF_NZ = 1201;
export const SURF_TABLE = 256;
export const BORE_SPEED_MS = 3.5;
export const BORE_DECAY = 0.6;
export const H_REF_M = 1.5;
export const LULL_FACTOR = 0.45;
export const LULL_SPREAD = 0.2;
export const SET_FACTOR = 0.55;
export const RUNUP_PER_H = 0.25;
export const RUNUP_BASE_M = 0.05;
export const SWASH_FRACTION = 0.6;
export const SWASH_RISE = 0.25;
export const WET_DRY_S = 90;
export const WET_ARRIVALS = 6;
export const SURF_BEHIND_M = 5;
export const SURF_AHEAD_M = 30;
export const BURST_S = 1.5;
export const LIFT_REACH_M = 40;
export const FRONT_M = 2.5;
export const TRAIL_M = 12;
export const TRAIL_WEIGHT = 0.6;
export const LACE_WEIGHT = 0.25;
/** The time-average of a bore's front and trail over the zone, per unit strength (the band at a distance). */
export const DUTY = 0.3;
/** The widest platform plus a margin (m): how long a bore can take to reach the sand, for the tables' history. */
export const MAX_PLATFORM_M = 100;

export interface SurfParams {
  /** Scales every breaker's height. */
  amount: number;
  /** The surf on/off (for comparison captures). */
  enabled: boolean;
}

export const DEFAULT_SURF_PARAMS: Readonly<SurfParams> = { amount: 1, enabled: true };
export const SURF_PARAM_RANGES = { amount: { min: 0, max: 2 } } as const;

export function normalizeSurfParams(p: SurfParams): void {
  const r = SURF_PARAM_RANGES.amount;
  p.amount = Number.isFinite(p.amount) ? Math.min(r.max, Math.max(r.min, p.amount)) : DEFAULT_SURF_PARAMS.amount;
  p.enabled = p.enabled !== false;
}

/** τ_coast every SURF_DZ from SURF_Z0: the arrival time at the platform's edge, in field coordinates (x = 190 − W). */
export function buildTauTable(tauAt: (x: number, z: number) => number): Float32Array {
  const out = new Float32Array(SURF_NZ);
  for (let k = 0; k < SURF_NZ; k++) {
    const z = SURF_Z0 + k * SURF_DZ;
    out[k] = tauAt(SHORE_X - shoreReefWidth(z), z);
  }
  return out;
}

export function tableAt(tau: Float32Array, z: number): number {
  const f = Math.min(SURF_NZ - 1.001, Math.max(0, (z - SURF_Z0) / SURF_DZ));
  const i = Math.floor(f), u = f - i;
  return tau[i] * (1 - u) + tau[i + 1] * u;
}

/** Integer hash → [0, 1). */
export function hash01(n: number): number {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function lullHeight(n: number, hs: number): number {
  return LULL_FACTOR * hs * (1 - LULL_SPREAD + 2 * LULL_SPREAD * hash01(n));
}

/**
 * The wave indices the height table must cover at time t: from the sixth-latest arrival anywhere on the coast (the wet
 * line's history) to the latest break anywhere; at most SURF_TABLE, keeping the newest.
 */
export function heightRange(t: number, periodS: number, tauMin: number, tauMax: number): { lo: number; hi: number } {
  const hi = Math.floor((t - tauMin) / periodS) + 1;
  const lo = Math.floor((t - tauMax - MAX_PLATFORM_M / BORE_SPEED_MS) / periodS) - WET_ARRIVALS - 1;
  return { lo: Math.max(lo, hi - SURF_TABLE + 1), hi };
}

export interface SurfTable {
  base: number;
  heights: Float32Array;
  /** The mean height over the covered range (the far band's strength). */
  meanHeight: number;
}

export function buildHeights(r: { lo: number; hi: number }, periodS: number, hs: number, events: readonly { arrivalS: number; heightM: number }[], amount: number): SurfTable {
  const heights = new Float32Array(SURF_TABLE);
  for (let i = 0; i < SURF_TABLE; i++) heights[i] = lullHeight(r.lo + i, hs);
  for (const e of events) {
    const i = Math.round(e.arrivalS / periodS) - r.lo;
    if (i >= 0 && i < SURF_TABLE) heights[i] = Math.max(heights[i], SET_FACTOR * e.heightM);
  }
  let sum = 0;
  const count = Math.min(SURF_TABLE, r.hi - r.lo + 1);
  for (let i = 0; i < SURF_TABLE; i++) {
    heights[i] *= amount;
    if (i < count) sum += heights[i];
  }
  return { base: r.lo, heights, meanHeight: count > 0 ? sum / count : 0 };
}

export function heightOf(t: SurfTable, n: number): number {
  return t.heights[Math.min(SURF_TABLE - 1, Math.max(0, n - t.base))];
}

export interface SurfState {
  tau: Float32Array;
  table: SurfTable;
  periodS: number;
  enabled: boolean;
}

export function boreStrength(H: number, df: number, W: number): number {
  return (H / H_REF_M) * (1 - BORE_DECAY * (1 - df / W));
}

const zoneOf = (d: number, W: number): number => smoothstep(-SURF_BEHIND_M, 0, d) * (1 - smoothstep(W, W + 10, d));

/** The surf's foam weight d m seaward of the waterline at z, time t (CoastalSurf.foamNode's near branch). */
export function surfFoam(d: number, z: number, t: number, s: SurfState): number {
  if (!s.enabled) return 0;
  const W = shoreReefWidth(z);
  if (d < -SURF_BEHIND_M || d > W + SURF_AHEAD_M) return 0;
  const tau = tableAt(s.tau, z), T = s.periodS, nL = Math.floor((t - tau) / T);
  let foam = 0, recent = 0;
  for (let k = 0; k < 3; k++) {
    const n = nL - k, H = heightOf(s.table, n), age = t - (n * T + tau), df = W - BORE_SPEED_MS * age;
    if (k < 2) recent += (0.5 * H) / H_REF_M;
    if (df < 0) continue;
    const str = boreStrength(H, df, W);
    const front = Math.exp(-(((d - df) / FRONT_M) ** 2));
    const trail = d > df ? TRAIL_WEIGHT * Math.exp(-(d - df) / TRAIL_M) : 0;
    const burst = age < BURST_S ? (1 - age / BURST_S) * Math.exp(-(((d - W) / 6) ** 2)) : 0;
    foam = Math.max(foam, str * (front + trail + burst));
  }
  return Math.min(1, Math.max(foam, LACE_WEIGHT * recent * zoneOf(d, W)));
}

/** The steady band a distant pixel shows (the time-average), CoastalSurf.foamNode's far branch. */
export function surfFoamFar(d: number, z: number, s: SurfState): number {
  if (!s.enabled) return 0;
  return Math.min(1, ((DUTY * s.table.meanHeight) / H_REF_M) * zoneOf(d, shoreReefWidth(z)));
}

export function swashShape(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return u < SWASH_RISE ? smoothstep(0, SWASH_RISE, u) : 1 - smoothstep(SWASH_RISE, 1, u);
}

export function runupOf(H: number): number {
  return H > 0.01 ? RUNUP_PER_H * H + RUNUP_BASE_M : 0;
}

/** The time a wave's bore reaches the sand at z (its break time plus the crossing). */
const arrivalOffset = (s: SurfState, z: number): number => tableAt(s.tau, z) + shoreReefWidth(z) / BORE_SPEED_MS;

/** The swash's height above the tide at the shoreline at z: the max of the two latest arrivals. */
export function swashLevel(z: number, t: number, s: SurfState): number {
  if (!s.enabled) return 0;
  const off = arrivalOffset(s, z), T = s.periodS, Ts = SWASH_FRACTION * T, nL = Math.floor((t - off) / T);
  let r = 0;
  for (let k = 0; k < 2; k++) {
    const n = nL - k;
    r = Math.max(r, runupOf(heightOf(s.table, n)) * swashShape((t - (n * T + off)) / Ts));
  }
  return r;
}

/** How high up the beach the sand is still wet (m above the tide): the last six runups, drying over WET_DRY_S. */
export function wetLevel(z: number, t: number, s: SurfState): number {
  if (!s.enabled) return 0;
  const off = arrivalOffset(s, z), T = s.periodS, nL = Math.floor((t - off) / T);
  let w = 0;
  for (let k = 0; k < WET_ARRIVALS; k++) {
    const n = nL - k, age = t - (n * T + off);
    if (age >= 0) w = Math.max(w, runupOf(heightOf(s.table, n)) * Math.exp(-age / WET_DRY_S));
  }
  return w;
}

/** The share of the swash level the water surface takes d m seaward of the waterline (all of it on the beach). */
export function swashLift(d: number): number {
  return 1 - smoothstep(0, LIFT_REACH_M, d);
}
```

- [ ] **Step 4: Run them:** `npx vitest run src/swell/sets.test.ts src/surf/surfModel.test.ts`.
  - Expected: PASS.
  - If a numeric bound in the test disagrees with the spec's formulas, rule against the spec: fix the test only if the spec's formula gives the test's case a different number.
  - `npx tsc --noEmit`: clean.

- [ ] **Step 5: Commit** `feat(surf): the coastal surf model (CPU): tables, bores, swash, the wet line`.

---

### Task 2: The beach under the swash (seabed)

**Files:**
- Modify: `src/seabed/Seabed.ts`, `src/seabed/bathymetry.ts`, `src/seabed/bathymetry.test.ts`, `src/seabed/shoreReef.test.ts`

**Interfaces:**
- Consumes: `beachHeight` (`land/landHeight.ts`).
- Produces:
  - `Seabed.waterlineShiftNode(z)` (public; the old private `shiftNode` delegates to it or is renamed);
  - `shoreReefWidthNode(z: N): N` exported from `Seabed.ts` (the TSL mirror of `shoreReefWidth`, used by `materialNode` and `CoastalSurf`);
  - `beachBedNode(dl: N): N`, the TSL mirror of `beachHeight(dl)` for dl ≥ 0 with the default profile;
  - `bedHeightAt` and `bedMaterialAt` landward of the waterline: the beach and sand.

- [ ] **Step 1: Write the failing tests.** Append to `src/seabed/bathymetry.test.ts`:

```ts
describe('the beach under the swash (Phase 4b spec §3.3, Ruling W7)', () => {
  it('landward of the waterline the shading bed follows the beach profile; seaward it is unchanged', () => {
    expect(bedHeightAt(bathy, 190 + 6, 3000)).toBeCloseTo(beachHeight(6), 6);
    expect(bedHeightAt(bathy, 190 + 30, 3000, () => 0)).toBeCloseTo(beachHeight(30), 6);
    expect(bedHeightAt(bathy, 150, 3000)).toBeCloseTo(-depthBg(150), 6);
    // shifted: the waterline at 190 + 120
    expect(bedHeightAt(bathy, 310 + 5, 3000, () => 120)).toBeCloseTo(beachHeight(5), 6);
  });
  it('is continuous with the seabed at the waterline, at any shift', () => {
    for (const shift of [-300, 0, 150]) {
      const xs = 190 + shift;
      expect(Math.abs(bedHeightAt(bathy, xs + 0.001, 3000, () => shift) - bedHeightAt(bathy, xs - 0.001, 3000, () => shift))).toBeLessThan(0.01);
    }
  });
});
```

(Add `import { beachHeight } from '../land/landHeight';`.)

Append to `src/seabed/shoreReef.test.ts`, inside its describe:

```ts
  it('landward of the waterline the bed is sand (the swash runs up the beach)', () => {
    const b = buildBathymetry();
    expect(bedMaterialAt(b, 195, 3000)).toEqual([1, 0]);
    expect(bedMaterialAt(b, 185, 3000)[0]).toBeLessThan(0.2); // just seaward: the weedy platform
  });
```

- [ ] **Step 2: Run them:** `npx vitest run src/seabed`. Expected: FAIL. Landward today the bed is −0.5 and the material is the platform's.

- [ ] **Step 3: Implement.**
  - **`bathymetry.ts`:**
    - Import `beachHeight` from `../land/landHeight`.
    - In `bedHeightAt`, compute the result as today into `bed`, then:

```ts
  const dSea = SHORE_X + (shiftAt ? shiftAt(z) : 0) - x;
  return dSea < 0 ? Math.max(bed, beachHeight(-dSea)) : bed;
```

    - In `bedMaterialAt`, return `[1, 0]` first when `dSea < 0` (computed the same way). Keep the `shore = false` path unchanged.
  - **`Seabed.ts`:**
    - make the shift node public as `waterlineShiftNode(z)`;
    - move the width expression from `materialNode` into an exported `shoreReefWidthNode(z: N): N`;
    - add `beachBedNode`:

```ts
/** TSL mirror of landHeight.beachHeight(dl) for dl ≥ 0 (the default profile): the beach the swash runs up. */
export function beachBedNode(dl: N): N {
  const p = DEFAULT_BEACH;
  const wetEnd = p.wetWidthM, dryEnd = wetEnd + p.dryWidthM, toeEnd = dryEnd + p.toeWidthM, low = -SHORE_FLAT_DEPTH_M;
  const wet = float(low).add(dl.div(wetEnd).mul(p.wetTopM - low));
  const dry = float(p.wetTopM).add(pow(clamp(dl.sub(wetEnd).div(p.dryWidthM), 0.0, 1.0), 1.4).mul(p.beachTopM - p.wetTopM));
  const toe = float(p.beachTopM).add(smoothstep(dryEnd, toeEnd, dl).mul(p.toeTopM - p.beachTopM));
  const face = float(p.toeTopM).add(dl.sub(toeEnd).mul(0.25));
  return select(dl.lessThan(wetEnd), wet, select(dl.lessThan(dryEnd), dry, select(dl.lessThan(toeEnd), toe, face)));
}
```

    - `bedHeightNode`:

```ts
  bedHeightNode(xz: N): N {
    const bed = select(this.insideNode(xz).greaterThan(0.5), this.sample(xz).x, depthBgNode(xz.x.sub(this.waterlineShiftNode(xz.y))).negate());
    const dSea = float(SHORE_X).add(this.waterlineShiftNode(xz.y)).sub(xz.x);
    // Landward of the waterline, the beach (Phase 4b §3.3): the swash is a thin film over sand, not half a metre of water.
    return select(dSea.lessThan(0.0), max(bed, beachBedNode(dSea.negate())), bed);
  }
```

    - `materialNode`: `select(dSea.lessThan(0.0), vec2(1.0, 0.0), <the mixed value>)`.
    - Imports: `pow`, `DEFAULT_BEACH` from `../land/landHeight`.

- [ ] **Step 4: Run** `npx vitest run src/seabed src/land src/breaker/BreakingRibbon.limits.test.ts` and `npx tsc --noEmit`. Expected: PASS. Then run the GPU self-tests (`/?selftest`). The existing seabed tests at landward points, (400, 0), (300, 700) and (185, 12000), compare GPU with CPU, which both changed the same way. Expected: 47/47.

- [ ] **Step 5: Commit** `feat(seabed): the beach under the swash; sand landward of the waterline`.

---

### Task 3: `CoastalSurf`, the GPU nodes

**Files:**
- Create: `src/surf/CoastalSurf.ts`, `src/surf/surf.selftest.ts`
- Modify: `src/dev/selfTests.ts`, `src/breaker/BreakingRibbon.limits.test.ts`

**Interfaces:**
- Consumes: Task 1's model; `Seabed.waterlineShiftNode`, `shoreReefWidthNode` (Task 2); `sampleField`, `ReefField`; `surferFeetToHs`; `WaveEvent`.
- Produces: `class CoastalSurf` with:
  - `state: SurfState`;
  - `update(simTime, conditions, eventsBetween: (t0, t1) => WaveEvent[], field: ReefField | null, params: SurfParams)`;
  - `invalidate()`;
  - `foamNode(xz, seabed)` (fragment only: uses fwidth);
  - `foamNearNode(xz, seabed)` (compute-safe, for the self-test);
  - `swashLevelNode(z)`, `liftNode(xz, seabed)`, `wetLevelNode(z)`.

- [ ] **Step 1: Write the self-test and the limits test first.**

`src/surf/surf.selftest.ts`:

```ts
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, vec4 } from 'three/tsl';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { buildBathymetry } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { shoreReefWidth } from '../seabed/shoreReef';
import { CoastalSurf } from './CoastalSurf';
import { DEFAULT_SURF_PARAMS, surfFoam, swashLevel, tableAt, wetLevel } from './surfModel';

registerSelfTest({
  name: 'surf: the GPU foam, swash and wet level match the CPU model (±0.02)',
  async run(renderer) {
    const seabed = new Seabed(buildBathymetry());
    const surf = new CoastalSurf();
    const c = cloneConditions(DEFAULT_CONDITIONS);
    const t = 1234.5;
    // No field: τ = 0 along the coast (a straight breaker), with a set wave that breaks just before t.
    surf.update(t, c, () => [{ arrivalS: 1230, heightM: 2.6 } as never], null, { ...DEFAULT_SURF_PARAMS });
    const s = surf.state;
    const cases: [number, number, number][] = [];
    for (const z of [0, 800, -2500]) {
      const W = shoreReefWidth(z), tb = Math.floor((t - tableAt(s.tau, z)) / s.periodS) * s.periodS + tableAt(s.tau, z);
      for (const d of [W, W - 5, W / 2, 3, -2]) for (const dt of [0.3, 4, 11]) cases.push([d, z, tb + dt]);
    }
    const n = cases.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([d, z, tt]) => [190 - d, z, tt, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    renderer.compute(Fn(() => {
      const q = input.element(instanceIndex);
      surf.time.assign(q.z);
      output.element(instanceIndex).assign(vec4(surf.foamNearNode(q.xy, seabed), surf.swashLevelNode(q.y), surf.wetLevelNode(q.y), 0.0));
    })().compute(n) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const rows = cases.map(([d, z, tt], i) => {
      const f = surfFoam(d, z, tt, s), sw = swashLevel(z, tt, s), w = wetLevel(z, tt, s);
      worst = Math.max(worst, Math.abs(out[i * 4] - f), Math.abs(out[i * 4 + 1] - sw), Math.abs(out[i * 4 + 2] - w));
      return `(d ${d.toFixed(0)}, z ${z}, t ${tt.toFixed(1)}) foam ${out[i * 4].toFixed(2)}/${f.toFixed(2)} swash ${out[i * 4 + 1].toFixed(2)}/${sw.toFixed(2)} wet ${out[i * 4 + 2].toFixed(2)}/${w.toFixed(2)}`;
    });
    return { pass: worst <= 0.02, detail: `worst ${worst.toFixed(4)}; ${rows.join('; ')}` };
  },
});
```

The `surf.time.assign(q.z)` inside a compute pass needs `time` to be a writable node. If a uniform can't be assigned per invocation, give `CoastalSurf` node methods an optional explicit time argument (`foamNearNode(xz, seabed, t = this.time)`, and the same for the others) and pass `q.z`. Ledger the choice.

Add `import '../surf/surf.selftest';` to `src/dev/selfTests.ts`.

In the limits test, inside the sheet materials describe:

```ts
    it('the surf adds no sampled textures to the sheet and keeps it within the limits', () => {
      const surf = new CoastalSurf();
      const w0 = renderWgsl(new THREE.Mesh(withFoam.mesh.geometry, withFoam.aboveMaterial));
      const s = new OceanSurface(model, sky, optics, { foamMap: foam, surf });
      const w1 = renderWgsl(new THREE.Mesh(s.mesh.geometry, s.aboveMaterial));
      expect(sampledTextures(w1.fragment)).toBe(sampledTextures(w0.fragment));
      expect(sampledTextures(w1.vertex)).toBe(sampledTextures(w0.vertex));
      for (const stage of [w1.vertex, w1.fragment]) {
        expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
        expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
      }
    });
```

This limits test depends on Task 4's `surf` option on `OceanSurface`. Add it in Task 4's Step 1 instead if the ordering gets in the way, and ledger that.

- [ ] **Step 2: Run** `npx tsc --noEmit`. Expected: FAIL (`./CoastalSurf` is missing).

- [ ] **Step 3: Implement** `src/surf/CoastalSurf.ts`:

```ts
import { clamp, exp, float, floor, fract, fwidth, int, max, min, mix, select, smoothstep, uniform, uniformArray } from 'three/tsl';
import { type ReefField, sampleField } from '../breaker/reefField';
import type { Conditions } from '../conditions/types';
import { surferFeetToHs } from '../conditions/units';
import { SHORE_X } from '../seabed/coastProfile';
import { type Seabed, shoreReefWidthNode } from '../seabed/Seabed';
import type { WaveEvent } from '../swell/sets';
import {
  BORE_DECAY, BORE_SPEED_MS, BURST_S, DUTY, FRONT_M, H_REF_M, LACE_WEIGHT, LIFT_REACH_M, RUNUP_BASE_M, RUNUP_PER_H, SURF_AHEAD_M, SURF_BEHIND_M,
  SURF_DZ, SURF_NZ, SURF_TABLE, SURF_Z0, SWASH_FRACTION, SWASH_RISE, type SurfParams, type SurfState, TRAIL_M, TRAIL_WEIGHT, WET_ARRIVALS, WET_DRY_S,
  buildHeights, buildTauTable, heightRange,
} from './surfModel';

type N = any;

/**
 * The coastal surf on the GPU (spec 2026-09-28-the-waterline-design.md; CPU reference surfModel.ts): two uniform tables,
 * τ along the coast and each wave's breaking height, and the nodes the ocean surface and the land read. No textures.
 */
export class CoastalSurf {
  readonly state: SurfState = { tau: new Float32Array(SURF_NZ), table: { base: 0, heights: new Float32Array(SURF_TABLE), meanHeight: 0 }, periodS: 15, enabled: true };
  readonly time = uniform(0);
  private readonly tauU: N = uniformArray(new Array<number>(SURF_NZ).fill(0), 'float');
  private readonly hU: N = uniformArray(new Array<number>(SURF_TABLE).fill(0), 'float');
  private readonly base = uniform(0);
  private readonly period = uniform(15);
  private readonly meanH = uniform(0);
  private readonly on = uniform(1);
  private field: ReefField | null | undefined = undefined;
  private tauMin = 0;
  private tauMax = 0;
  private builtRange = '';
  private dirty = true;

  /** Conditions, sets or surf params changed: the next update rebuilds the height table. */
  invalidate(): void {
    this.dirty = true;
  }

  update(simTime: number, c: Conditions, eventsBetween: (t0: number, t1: number) => WaveEvent[], field: ReefField | null, p: SurfParams): void {
    if (field !== this.field) {
      this.field = field;
      const tau = field ? buildTauTable((x, z) => sampleField(field, x, z).tau) : new Float32Array(SURF_NZ);
      this.state.tau = tau;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < SURF_NZ; i++) {
        (this.tauU.array as number[])[i] = tau[i];
        lo = Math.min(lo, tau[i]); hi = Math.max(hi, tau[i]);
      }
      this.tauMin = lo; this.tauMax = hi;
      this.dirty = true;
    }
    const T = c.swell.periodS;
    const r = heightRange(simTime, T, this.tauMin, this.tauMax);
    const key = `${r.lo}:${r.hi}:${T}`;
    if (this.dirty || key !== this.builtRange) {
      const events = eventsBetween((r.lo - 1) * T, (r.hi + 1) * T);
      const table = buildHeights(r, T, surferFeetToHs(c.swell.sizeFt), events, p.amount);
      this.state.table = table;
      for (let i = 0; i < SURF_TABLE; i++) (this.hU.array as number[])[i] = table.heights[i];
      this.base.value = table.base;
      this.meanH.value = table.meanHeight;
      this.builtRange = key;
      this.dirty = false;
    }
    this.state.periodS = T;
    this.state.enabled = p.enabled;
    this.period.value = T;
    this.on.value = p.enabled ? 1 : 0;
    this.time.value = simTime;
  }

  private tauNode(z: N): N {
    const f = clamp(z.sub(SURF_Z0).div(SURF_DZ), 0.0, SURF_NZ - 1.001);
    const i = int(floor(f));
    return mix(this.tauU.element(i), this.tauU.element(i.add(1)), fract(f));
  }

  private heightNode(n: N): N {
    return this.hU.element(int(clamp(n.sub(this.base), 0.0, SURF_TABLE - 1)));
  }

  private runupNode(H: N): N {
    return select(H.greaterThan(0.01), H.mul(RUNUP_PER_H).add(RUNUP_BASE_M), float(0.0));
  }

  private zoneNode(d: N, W: N): N {
    return smoothstep(-SURF_BEHIND_M, 0.0, d).mul(float(1.0).sub(smoothstep(W, W.add(10.0), d)));
  }

  dSeaNode(xz: N, seabed: Seabed): N {
    return float(SHORE_X).add(seabed.waterlineShiftNode(xz.y)).sub(xz.x);
  }

  /** surfModel.surfFoam: the three latest bores and the lace (compute-safe). */
  foamNearNode(xz: N, seabed: Seabed): N {
    const d = this.dSeaNode(xz, seabed), W = shoreReefWidthNode(xz.y), tau = this.tauNode(xz.y), T = this.period, t = this.time;
    const nL = floor(t.sub(tau).div(T));
    let foam: N = float(0.0), recent: N = float(0.0);
    for (let k = 0; k < 3; k++) {
      const n = nL.sub(k), H = this.heightNode(n), age = t.sub(n.mul(T).add(tau)), df = W.sub(age.mul(BORE_SPEED_MS));
      if (k < 2) recent = recent.add(H.mul(0.5 / H_REF_M));
      const str = H.div(H_REF_M).mul(float(1.0).sub(float(1.0).sub(df.div(W)).mul(BORE_DECAY)));
      const front = exp(d.sub(df).div(FRONT_M).pow(2.0).negate());
      const trail = select(d.greaterThan(df), exp(d.sub(df).div(TRAIL_M).negate()).mul(TRAIL_WEIGHT), float(0.0));
      const burst = select(age.lessThan(BURST_S), float(1.0).sub(age.div(BURST_S)).mul(exp(d.sub(W).div(6.0).pow(2.0).negate())), float(0.0));
      foam = max(foam, select(df.greaterThanEqual(0.0), str.mul(front.add(trail).add(burst)), float(0.0)));
    }
    const inZone = d.greaterThanEqual(-SURF_BEHIND_M).and(d.lessThanEqual(W.add(SURF_AHEAD_M)));
    const v = min(float(1.0), max(foam, recent.mul(LACE_WEIGHT).mul(this.zoneNode(d, W))));
    return select(inZone, v, float(0.0)).mul(this.on);
  }

  /** The render's foam: near, the bores; once a pixel spans metres of d, the steady time-average (fragment only). */
  foamNode(xz: N, seabed: Seabed): N {
    const d = this.dSeaNode(xz, seabed), W = shoreReefWidthNode(xz.y);
    const far = min(float(1.0), this.meanH.mul(DUTY / H_REF_M).mul(this.zoneNode(d, W))).mul(this.on);
    return mix(this.foamNearNode(xz, seabed), far, smoothstep(1.5, 4.0, fwidth(d)));
  }

  private arrivalOffsetNode(z: N): N {
    return this.tauNode(z).add(shoreReefWidthNode(z).div(BORE_SPEED_MS));
  }

  private swashShapeNode(u: N): N {
    const rise = smoothstep(0.0, SWASH_RISE, u), fall = float(1.0).sub(smoothstep(SWASH_RISE, 1.0, u));
    return select(u.lessThanEqual(0.0).or(u.greaterThanEqual(1.0)), float(0.0), select(u.lessThan(SWASH_RISE), rise, fall));
  }

  swashLevelNode(z: N): N {
    const off = this.arrivalOffsetNode(z), T = this.period, t = this.time, Ts = T.mul(SWASH_FRACTION);
    const nL = floor(t.sub(off).div(T));
    let r: N = float(0.0);
    for (let k = 0; k < 2; k++) {
      const n = nL.sub(k);
      r = max(r, this.runupNode(this.heightNode(n)).mul(this.swashShapeNode(t.sub(n.mul(T).add(off)).div(Ts))));
    }
    return r.mul(this.on);
  }

  /** The water surface's lift near the shore (vertex stage): the swash level, all of it on the beach, fading 40 m out. */
  liftNode(xz: N, seabed: Seabed): N {
    return this.swashLevelNode(xz.y).mul(float(1.0).sub(smoothstep(0.0, LIFT_REACH_M, this.dSeaNode(xz, seabed))));
  }

  wetLevelNode(z: N): N {
    const off = this.arrivalOffsetNode(z), T = this.period, t = this.time;
    const nL = floor(t.sub(off).div(T));
    let w: N = float(0.0);
    for (let k = 0; k < WET_ARRIVALS; k++) {
      const n = nL.sub(k), age = t.sub(n.mul(T).add(off));
      w = max(w, select(age.greaterThanEqual(0.0), this.runupNode(this.heightNode(n)).mul(exp(age.div(WET_DRY_S).negate())), float(0.0)));
    }
    return w.mul(this.on);
  }
}
```

Notes for the implementer:
- `.pow(2.0)` on a node may not exist. If not, use `pow(x, 2.0)` or `x.mul(x)`.
- The self-test's `as never` event is only a WaveEvent stand-in. If `WaveEvent` has required fields that `buildHeights` doesn't read, build a full one with `wavesOfSet` instead.

- [ ] **Step 4: Run** `npx tsc --noEmit` and the Task 1 tests. The self-test runs in the browser after Task 4 wires the surf in; it only needs the class, so it can run now: `/?selftest`. Expected: 48/48.

- [ ] **Step 5: Commit** `feat(surf): CoastalSurf, the GPU nodes and their self-test`.

---

### Task 4: The surf on screen (ocean, land, App, Surf folder)

**Files:**
- Modify: `src/ocean/OceanSurface.ts`, `src/land/landShading.ts`, `src/land/Land.ts`, `src/app/App.ts`, `src/dev/DevPanel.ts`, `src/dev/DevPanel.test.ts`, `src/dev/devSettings.ts`, `src/dev/devSettings.test.ts`, `src/dev/referenceMoments.ts`, `src/dev/referenceMoments.test.ts`, `src/breaker/BreakingRibbon.limits.test.ts`

**Interfaces:**
- Consumes: `CoastalSurf` (Task 3), the Seabed changes (Task 2).
- Produces:
  - `OceanSurfaceOptions.surf?: CoastalSurf`;
  - `createLandMaterial(sky, u, opts: { sunVisibility?; wetHeight?: (xz: N) => N })`;
  - `Land.setWetHeight(fn)`;
  - `SURF_BINDINGS`, the `onSurf` handler, `land`-style persistence of `surf`;
  - the reference moment `surf-from-the-lineup`.

- [ ] **Step 1: The tests first.**
  - **`DevPanel.test.ts`:** a `SURF_BINDINGS` test. `amount` ranges must equal `SURF_PARAM_RANGES`, and the numeric keys of `DEFAULT_SURF_PARAMS` must equal the binding keys.
  - **`devSettings.test.ts`:**
    - add `surf: DEFAULT_SURF_PARAMS` to `defaults()`;
    - add `s.surf.amount = 1.6; s.surf.enabled = false;` to `tweaked()`;
    - add a test that settings stored without `surf` load its defaults.
  - **`referenceMoments.test.ts`:** add `'surf-from-the-lineup'` to the expected list.
  - **The limits test:** Task 3's surf limits test.
  - Run them. Expected: FAIL.

- [ ] **Step 2: Implement.**
  - **`OceanSurface.ts`:** `options.surf?: CoastalSurf` (type-only import).
    - Vertex: `material.positionNode`'s y gains `.add(options.surf ? options.surf.liftNode(baseXZ, model.seabed) : 0)`.
    - Fragment:

```ts
    const surfFoam = options.surf ? options.surf.foamNode(vBaseXZ, model.seabed) : float(0.0);
    // The swash's edge (Phase 4b §3.3): lifted water under 0.1 m deep over the beach near the shore shows a foam lace.
    const swashLace = options.surf
      ? float(1.0).sub(smoothstep(0.02, 0.1, positionWorld.y.sub(model.seabed.bedHeightNode(vBaseXZ))))
        .mul(float(1.0).sub(smoothstep(0.0, 10.0, options.surf.dSeaNode(vBaseXZ, model.seabed))))
        .mul(smoothstep(0.01, 0.05, options.surf.swashLevelNode(vBaseXZ.y))).mul(0.8)
      : float(0.0);
```

    - Then `const foamWeight = max(sheetFoamWeight(setFoam, foamOverlay), max(surfFoam, swashLace));`, where the old `foamWeight` line was. The `foamMap` overlay value adds `surfFoam.mul(0.5)`.
  - **`landShading.ts`:** change the signature to `createLandMaterial(sky, u, opts: { sunVisibility?: (xz: N) => N; wetHeight?: (xz: N) => N } = {})`. Replace `wetShare`'s use in the sand colour:

```ts
  // The wet line (Phase 4b §3.4): sand below the recent runup is wet; without the surf, the cover's intertidal share.
  const wetness = opts.wetHeight
    ? float(1.0).sub(smoothstep(opts.wetHeight(p.xz).sub(0.02), opts.wetHeight(p.xz).add(0.12), p.y))
    : wetShare;
  const albedo = wet.mul(wetness.mul(rest)).add(dry.mul(float(1.0).sub(wetness).mul(rest))).add(rock.mul(rF)).add(heath.mul(hF));
```

    The sheen uses `wetness.mul(rest)` too. Update both call sites (`Land`'s constructor and `setSunVisibility`).
  - **`Land.ts`:** keep `sunVisibility` and `wetHeight` fields; `setSunVisibility(fn)` and `setWetHeight(fn)` both rebuild the material with `{ sunVisibility, wetHeight }`.
  - **`App.ts`:**
    - `readonly surfParams: SurfParams = { ...DEFAULT_SURF_PARAMS };`
    - `readonly surf = new CoastalSurf();`, declared before `oceanSurface` is built;
    - pass `surf: this.surf` in `OceanSurface`'s options;
    - in the constructor: `this.land.setWetHeight((xz) => this.seabed.tide.add(this.surf.wetLevelNode(xz.y)));`
    - in `frame()`, after `events` is computed:

```ts
    this.surf.update(this.clock.simTime, this.conditions, (t0, t1) => wavesBetween(t0, t1, this.conditions, this.setParams), this.field, this.surfParams);
```

    - `this.surf.invalidate()` in `onConditionsEdited`, `onSets`, `applyMoment`, `applyAllParams` and the new `onSurf`: `onSurf: () => { normalizeSurfParams(this.surfParams); this.panel.refresh(); this.surf.invalidate(); }`;
    - the panel model gets `surf: this.surfParams`; `lookParams` and `assignLook` get `surf`.
  - **`DevPanel.ts`:** the model's `surf: SurfParams`; the handler's `onSurf(): void`; and:

```ts
/** Surf folder (Phase 4b spec §3.5), range exactly normalizeSurfParams's. */
export const SURF_BINDINGS = {
  amount: { label: 'surf amount', ...SURF_PARAM_RANGES.amount, step: 0.05 },
} as const;
```

    A 'Surf' folder after 'Land' with the `amount` binding plus `surf.addBinding(m.surf, 'enabled', { label: 'surf' })`, both firing `h.onSurf`.
  - **`devSettings.ts`:** `surf: SurfParams` in `DevLookParams`, and `'surf'` in `LOOK_KEYS`.
  - **`referenceMoments.ts`:** append

```ts
  setMoment('surf-from-the-lineup', "08:15 facing the beach as the reference set's bores reach the shore: white water across the platform, the swash on the sand.",
    conditions({}), lineup(90, 2), REF_BIGGEST.arrivalS + 12),
```

  (Tune the `+ 12` in the browser so a set bore is mid-platform at the Womb's beach; ledger the value.)

- [ ] **Step 3: Run** the full suite and `npx tsc --noEmit`. Expected: green.

- [ ] **Step 4: In the browser (pane visible):**
  - `/?selftest`: 48/48.
  - `surf-from-the-lineup`: white water across the platform, bores rolling in, swash on the sand. Play at 1× for a minute and watch the swash move and the wet line follow.
  - Facing north: a steady band.
  - `surf` off: calm, dry sand.
  - No console errors. Screenshots for the ledger.

- [ ] **Step 5: Commit** `feat(surf): the coastal surf on the water and the sand; the Surf folder`.

---

### Task 5: Measure, gallery, docs

- [ ] **Step 1: Measure** (pane visible), fencing `picture.render` over 60 frames with surf on vs off (`surfParams.enabled`) at `surf-from-the-lineup`, and at the lineup facing north. Time `surf.update` (CPU) and the τ table build. Ledger the numbers against the Global Constraints; if missed, ledger them for Andrew.
- [ ] **Step 2: Gallery** (`docs/superpowers/gallery/phase-4/waterline/`, via the shot server with `OUT` pointed there):
  - `01-surf-from-the-lineup.png`;
  - `02-swash-close.png`: a free camera at (170, 2.5, 30), yaw 90, pitch −8, mid-swash;
  - `03-wet-line.png`: the same camera, 20 s later (the water back, the sand still wet);
  - `04-north-surf-band.png`;
  - `05-south-surf-band.png`;
  - `06-surf-off.png`;
  - `07-drone-over-the-surf.png`: the 4a drone view (150, 140, 30), yaw 90, pitch −62, as bores cross;
  - `00-sheet.png`.
- [ ] **Step 3: Docs.** A `README.md` in the gallery folder (the shots, the costs); the spec's Status and as-built notes.
- [ ] **Step 4:** Full suite, typecheck, `/?selftest`. Commit `docs(surf): gallery, measured cost, as-built notes` and push. **Do not merge.**
