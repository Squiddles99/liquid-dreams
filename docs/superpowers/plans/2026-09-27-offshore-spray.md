# Phase 3b: Offshore Spray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Throwing lips blow a veil of mist back on the offshore wind. It glows gold backlit by the morning sun and thins out within a couple of seconds. It is deterministic per moment.

**Architecture:**
- **CPU (`sprayEmitters.ts`):** on each 20 Hz sim tick, derive the emitters (lip tips of mid-throw stations, from a camera-independent crest trace at 1.5 m spacing) and their births, with deterministic hashes.
- **GPU (`SprayParticles.ts`):** a fixed pool of 32,000 particles, laid out as 320 slots per tick × 100 ticks of history. A tick's births always go to the same slots, so replay and live play agree exactly. A birth pass and a step pass (wind drag, settle, age) run per tick, as one submission. An instanced `SpriteNodeMaterial` draws velocity-stretched soft puffs, lit by single scattering (Henyey–Greenstein, g = 0.75) from the same `Sky` as the water.
- **The CPU pool reference (`sprayStep.ts`)** mirrors the GPU for tests.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU + TSL, vitest, the in-browser GPU self-tests (`?selftest`).

**Spec:** `docs/superpowers/specs/2026-09-27-offshore-spray-design.md`

## Global Constraints

**Emitters:**
- Emitters exist only at stations mid-throw:
  - `tb` is finite;
  - 0 < `prog` < 1;
  - `weight·rho` > 0.1.
- They sit at the lip tip `outer(f, 1) = (K.u + reach, K.y − ½·g·(reach/vj)²)` in the station plane, plus the tide.
- The wind factor is `smoothstep(1, 6, windSpeed · max(0, −dot(windTo, n)))` (m/s), where `windTo` points the way the wind blows (from-direction + 180°).
- World axes: +X east, +Z south. Bearing b maps to (sin b, −cos b).

**Particles:**
- **Birth:**
  - scatter ±0.4 m along the crest and 0–0.3 m up;
  - velocity 0.5 × the lip velocity, plus an upward kick of 2–4 m/s, plus ±1 m/s random per axis;
  - life `sprayLife` × U(0.6, 1.2);
  - strength clamped to ≤ 1.
- **Step, Δ = 0.05 s:**
  - `v += (windVel − v)·min(1, Δ/0.45)`, with `windVel` horizontal;
  - `v.y −= 1.2·Δ`;
  - `p += v·Δ`;
  - `age += Δ`;
  - dead when `age ≥ life`.
- **Drawing:**
  - position `p + v·(t − tₖ)`;
  - size 0.3 → 2 m linear in the age fraction;
  - fade in over 0.1 s and out over the last 40% of life;
  - stretched up to 3:1 along the screen-space velocity;
  - radiance `sunIlluminance·HG(cosθ, 0.75) + skyIrradiance/4π`, then aerial perspective;
  - opacity `SPRAY_OPACITY` (0.08) × shape × fades × strength;
  - normal alpha blending, depth test on, depth write off, unsorted;
  - hidden underwater.

**Schedule:**
- Ticks at tₖ = k·0.05 s in sim time (the foam map's `FoamSchedule`).
- A replay covers `ceil((1.2·sprayLife + 0.5)·20)` ticks, on every foam-map replay trigger plus spray slider edits (debounced 150 ms).

**Sliders (a Spray folder, persisted with the look):**
- `spray amount`: 0–3, default 1;
- `spray life (s)`: 0.8–4, default 2.

**Overlay:** `spray tint` (age: green → red).

**Cost targets:**
- per tick: ≤ 1.5 ms of CPU and ≤ 0.3 ms of GPU;
- drawing: ≤ 1 ms of GPU at 1236 × 1351 with a full veil;
- a replay: ≤ 150 ms;
- if any is missed, stop and give Andrew the numbers.

**WebGPU:** ≤ 8 storage buffers per stage; don't raise `requiredLimits`.

**Repo rules:**
- `reference/` is never committed;
- stage files by path;
- never commit `.superpowers/`;
- every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
- no merge to main without Andrew.

## Plan-time rulings (read before Task 1)

- **S1, a camera-independent trace.** `traceStations` spaces stations by distance from the camera. The spray's emitters must not depend on where the camera is (determinism: the same moment gives the same veil from any view). `TraceInput` gains an optional `spacingM` (a fixed spacing), and the spray traces with 1.5 m. The emitters are then simply the mid-throw stations, which implements the spec's "about every 1.5 m of crest arc".
- **S2, fixed slots per tick.** The spec's running pool head would make a replay's slot layout differ from live play's (a permuted pool, and unsorted blending then differs slightly). Instead, tick k's births take slots `(k mod 100)·320 + i`. The pool is 320 × 100 = 32,000 (the spec said 32,768). 100 ticks is 5 s, longer than the longest life (4 s × 1.2 = 4.8 s), so a slot is always dead before it is reused. Births beyond 320 in a tick are dropped in a fixed order. At the default amount a 150 m breaking section makes about 150 births per tick; at `spray amount` 3 a section that long saturates at 320. That is documented, not a bug.
- **S3, set constants.** The spec left these to the plan:
  - `SPRAY_RATE` = 20 particles per metre of lip per second at strength 1;
  - `SPRAY_OPACITY` = 0.08;
  - the birth cap is 320 per tick (S2).
- **S4, randomness from the CPU.** The births' random values (scatter, kick, life) are computed on the CPU with a PCG hash of (tick, wave id, arc index, draw) and uploaded with each birth. The GPU needs no hash, and the CPU reference and the GPU start from identical births.

## Review Focus

1. **Slider extremes** (`spray amount` 3 on a long closeout): births saturate at 320 per tick deterministically, with no overflow into another tick's slots. Task 1: `births never exceed the per-tick cap`.
2. **Wind bearings and the offshore sign:** the 57° default offshore is full spray, 237° (onshore) and 0 m/s give none, and 147° (cross-shore) gives almost none. Task 1: `the wind factor follows the offshore component`.
3. **No field, no waves, breaking off, or amount 0:** no emitters and no throw. Task 1: `no emitters without a field, waves, breaking or amount`.
4. **Negative ticks** (the startup replay from t = 0): slot bases are valid for k < 0. Task 2: `slot bases wrap for negative ticks`.
5. **The camera inside the veil, and underwater:** the veil is hidden underwater (Task 4, step 4), and drawing cost is measured with the camera close to a breaking lip (Task 5, step 1).

---

### Task 1: The CPU emitters and births (`sprayEmitters.ts`), with a camera-independent trace

**Files:**
- Modify: `src/breaker/crestTrace.ts` (`TraceInput.spacingM`)
- Test: `src/breaker/crestTrace.test.ts` (add one test)
- Create: `src/whitewater/sprayEmitters.ts`
- Test: `src/whitewater/sprayEmitters.test.ts`

**Interfaces:**
- Consumes:
  - `traceStations`, `Station`, `TraceInput` (crestTrace);
  - `profileFrame`, `GRAVITY_MS2` (lipProfile);
  - `sampleField`, `ReefField` (reefField);
  - `sumWaves`, `toActiveWave`, `WaveContext`, `BreakOptions` (setWaveModel);
  - `BreakParams` (breaking);
  - `WaveEvent` (swell/sets);
  - `smoothstep` (math);
  - `FOAM_TICK_S` (whitewater/foamStep).
- Produces:
  - constants `SPRAY_SPACING_M` = 1.5, `SPRAY_RATE` = 20, `SPRAY_BIRTH_CAP` = 320, `SPRAY_HISTORY_TICKS` = 100, `SPRAY_POOL` = 32000, `MIN_EMIT_WEIGHT` = 0.1, `SPRAY_OPACITY` = 0.08;
  - `SprayParams { amount; lifeS }`, `DEFAULT_SPRAY_PARAMS`, `SPRAY_PARAM_RANGES`, `normalizeSprayParams(p)`;
  - `Wind { speedMs; fromDeg }`, `windToVector(fromDeg): [number, number]`, `offshoreFactor(wind, nx, nz): number`;
  - `SprayEmitter { x; y; z; vx; vz; nx; nz; strength; waveId; arc }`;
  - `EmitterInput { field; ctx; events; t; params; minHeightM; wind; tideM; amount }`, `sprayEmitters(i: EmitterInput): SprayEmitter[]`;
  - `SprayBirth { x; y; z; vx; vy; vz; life; strength }`, `sprayBirths(emitters, tick, p: SprayParams): SprayBirth[]`;
  - `rand01(a, b, c, d): number`;
  - `sprayReplayTicks(lifeS): number`.

- [ ] **Step 1: Write the failing tests**

Add to `src/breaker/crestTrace.test.ts`, inside its top-level `describe`, using that file's existing field, waves and context fixtures. Read the file first and use its fixture names; the names below are the usual ones there: `field`, `ctx`, a `waves` array and `DEFAULT_BREAK_PARAMS`.

```ts
  it('a fixed spacingM traces the same stations wherever the camera is (spray emitters, plan ruling S1)', () => {
    const base = { params: DEFAULT_BREAK_PARAMS, minHeightM: 0, spacingM: 1.5 };
    const t = REF_T;
    const a = traceStations(field, WAVES, t, ctx, { ...base, cameraX: 0, cameraZ: 0 });
    const b = traceStations(field, WAVES, t, ctx, { ...base, cameraX: 500, cameraZ: -300 });
    expect(b).toEqual(a);
    const live = a.filter((s) => !s.gap) as { arc: number; wave: number }[];
    for (let i = 1; i < live.length; i++) {
      if (live[i].wave !== live[i - 1].wave) continue;
      const d = Math.abs(live[i].arc - live[i - 1].arc);
      if (d < 3) expect(d).toBeCloseTo(1.5, 1);
    }
  });
```

(If `crestTrace.test.ts` names its fixtures differently, bind `WAVES` and `REF_T` to its existing wave array and a time at which a wave is breaking, and ledger the names used. The assertion is unchanged.)

```ts
// src/whitewater/sprayEmitters.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { fieldBreakingHeight } from '../breaker/setWaveModel';
import { minRibbonHeight } from '../breaker/crestTrace';
import { computeReefField } from '../breaker/reefField';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import {
  DEFAULT_SPRAY_PARAMS, type EmitterInput, SPRAY_BIRTH_CAP, SPRAY_RATE, SPRAY_SPACING_M, normalizeSprayParams, offshoreFactor, rand01, sprayBirths,
  sprayEmitters, sprayReplayTicks, windToVector,
} from './sprayEmitters';

const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const OFFSHORE = { speedMs: 22 / 3.6, fromDeg: 57 };
const input = (t: number, over: Partial<EmitterInput> = {}): EmitterInput => ({
  field, ctx, events: wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS), t, params: DEFAULT_BREAK_PARAMS,
  minHeightM: minRibbonHeight(fieldBreakingHeight(field, DEFAULT_BREAK_PARAMS), DEFAULT_BREAK_PARAMS), wind: OFFSHORE, tideM: 0, amount: 1, ...over,
});
/** A time in the barrel: the biggest wave of set 1, 0.6 s after it reaches the peak (its lip is throwing). */
const T_THROW = BIGGEST.arrivalS + 0.6;

describe('the offshore wind factor', () => {
  it('bearings: wind from the north blows toward +z (south); from the east, toward −x (west)', () => {
    const [nx, nz] = windToVector(0);
    expect(nx).toBeCloseTo(0, 9);
    expect(nz).toBeCloseTo(1, 9);
    const [ex, ez] = windToVector(90);
    expect(ex).toBeCloseTo(-1, 9);
    expect(ez).toBeCloseTo(0, 9);
  });
  it('the wind factor follows the offshore component (none when calm, onshore or cross-shore; full from 6 m/s offshore)', () => {
    const travel = windToVector(225 - 180); // waves from 225° travel toward 45°
    const n = [-travel[0], -travel[1]] as const; // toward 45°: the negation of the vector the wind from 45° blows along
    const [tx, tz] = windToVector(225);
    expect(Math.hypot(tx - (-n[0]), tz - (-n[1]))).toBeGreaterThan(-1); // (sanity: vectors are unit)
    const nx = Math.SQRT1_2, nz = -Math.SQRT1_2; // travelling north-east
    expect(offshoreFactor({ speedMs: 10, fromDeg: 45 }, nx, nz)).toBeCloseTo(1, 9); // from the NE, against the waves
    expect(offshoreFactor({ speedMs: 0.5, fromDeg: 45 }, nx, nz)).toBe(0); // calm
    expect(offshoreFactor({ speedMs: 10, fromDeg: 225 }, nx, nz)).toBe(0); // onshore
    expect(offshoreFactor({ speedMs: 10, fromDeg: 135 }, nx, nz)).toBeLessThan(1e-6); // cross-shore
    expect(offshoreFactor({ speedMs: 22 / 3.6, fromDeg: 57 }, nx, nz)).toBeGreaterThan(0.9); // the reference offshore
    expect(offshoreFactor({ speedMs: 3.5, fromDeg: 45 }, nx, nz)).toBeCloseTo(0.5, 9); // halfway up the ramp
  });
});

describe('the emitters', () => {
  it('while a wave throws, emitters sit on its lip: mid-throw stations only, 1.5 m apart, above the water', () => {
    const e = sprayEmitters(input(T_THROW));
    expect(e.length).toBeGreaterThan(3);
    for (const x of e) {
      expect(x.strength).toBeGreaterThan(0);
      expect(x.strength).toBeLessThanOrEqual(1);
      expect(x.y).toBeGreaterThan(0.3);
    }
    const byWave = new Map<number, number[]>();
    for (const x of e) byWave.set(x.waveId, [...(byWave.get(x.waveId) ?? []), x.arc]);
    for (const arcs of byWave.values()) {
      arcs.sort((a, b) => a - b);
      for (let i = 1; i < arcs.length; i++) expect(arcs[i] - arcs[i - 1]).toBeGreaterThanOrEqual(1);
    }
  });
  it('none before the break, none long after it', () => {
    expect(sprayEmitters(input(BIGGEST.arrivalS - 20))).toEqual([]);
    expect(sprayEmitters(input(BIGGEST.arrivalS + 6)).filter((x) => x.waveId === BIGGEST.id)).toEqual([]);
  });
  it('no emitters without a field, waves, breaking or amount', () => {
    expect(sprayEmitters(input(T_THROW, { field: null }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { ctx: null }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { events: [] }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { amount: 0 }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { params: { ...DEFAULT_BREAK_PARAMS, enabled: false } }))).toEqual([]);
  });
  it('no emitters on a glassy day or in an onshore wind', () => {
    expect(sprayEmitters(input(T_THROW, { wind: { speedMs: 0, fromDeg: 57 } }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { wind: { speedMs: 8, fromDeg: 237 } }))).toEqual([]);
  });
  it('emitters do not depend on the camera or on the call (deterministic)', () => {
    expect(sprayEmitters(input(T_THROW))).toEqual(sprayEmitters(input(T_THROW)));
  });
});

describe('the births', () => {
  const e = () => sprayEmitters(input(T_THROW));
  it('about SPRAY_RATE × spacing × Δ × strength per emitter per tick, deterministic per tick', () => {
    const k = Math.round(T_THROW * 20);
    const a = sprayBirths(e(), k, DEFAULT_SPRAY_PARAMS), b = sprayBirths(e(), k, DEFAULT_SPRAY_PARAMS);
    expect(a).toEqual(b);
    const expected = e().reduce((s, x) => s + Math.min(1, x.strength) * SPRAY_RATE * SPRAY_SPACING_M * 0.05, 0);
    let total = 0;
    for (let kk = k; kk < k + 40; kk++) total += sprayBirths(e(), kk, DEFAULT_SPRAY_PARAMS).length;
    expect(total / 40).toBeGreaterThan(expected * 0.7);
    expect(total / 40).toBeLessThan(expected * 1.3 + 1);
  });
  it('births start at their emitter, rise, and live sprayLife × 0.6–1.2', () => {
    const k = Math.round(T_THROW * 20);
    const em = e();
    for (const b of sprayBirths(em, k, DEFAULT_SPRAY_PARAMS)) {
      expect(em.some((x) => Math.hypot(b.x - x.x, b.z - x.z) <= 0.41 && b.y >= x.y - 1e-9 && b.y <= x.y + 0.3 + 1e-9)).toBe(true);
      expect(b.vy).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(b.vy).toBeLessThanOrEqual(5 + 1e-9);
      expect(b.life).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(b.life).toBeLessThanOrEqual(2.4 + 1e-9);
      expect(b.strength).toBeLessThanOrEqual(1);
    }
  });
  it('births never exceed the per-tick cap (amount 3 on a long section)', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ x: i, y: 1, z: 0, vx: 5, vz: 0, nx: 1, nz: 0, strength: 3, waveId: 1, arc: i }));
    const b = sprayBirths(many, 7, DEFAULT_SPRAY_PARAMS);
    expect(b.length).toBe(SPRAY_BIRTH_CAP);
    expect(sprayBirths(many, 7, DEFAULT_SPRAY_PARAMS)).toEqual(b);
  });
  it('rand01 is in [0, 1) and differs per argument', () => {
    const v = [rand01(1, 2, 3, 4), rand01(1, 2, 3, 5), rand01(-7, 2, 3, 4), rand01(1, 9, 3, 4)];
    for (const x of v) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
    expect(new Set(v).size).toBe(4);
  });
  it('params clamp into the slider ranges, and a replay covers the longest life plus 0.5 s', () => {
    const p = { amount: 9, lifeS: 0.1 };
    normalizeSprayParams(p);
    expect(p).toEqual({ amount: 3, lifeS: 0.8 });
    expect(sprayReplayTicks(2)).toBe(58);
    expect(sprayReplayTicks(4)).toBe(106);
  });
});
```

The wind-factor test has three sanity lines (`travel`, `n`, the `expect(... > -1)`) that add nothing. Delete them when writing the file; the assertions from `const nx = Math.SQRT1_2` onward are the test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/whitewater/sprayEmitters.test.ts src/breaker/crestTrace.test.ts`
Expected: FAIL. `./sprayEmitters` doesn't resolve. The crestTrace test fails because the traces differ by camera (spacingM is ignored).

- [ ] **Step 3: Add `spacingM` to the crest trace**

In `src/breaker/crestTrace.ts` `TraceInput`, add:

```ts
  /** A fixed station spacing (m), in place of the camera-distance rule: the same stations wherever the camera is (the spray's emitters, offshore-spray plan S1). */
  spacingM?: number;
```

In `traceWave`, replace the `ds` line with:

```ts
      const ds = factor * (input.spacingM ?? Math.min(MAX_SPACING_M, Math.max(MIN_SPACING_M, SPACING_PER_M * Math.hypot(x - input.cameraX, z - input.cameraZ))));
```

- [ ] **Step 4: Write `sprayEmitters.ts`**

```ts
// src/whitewater/sprayEmitters.ts
import type { BreakParams } from '../breaker/breaking';
import { traceStations } from '../breaker/crestTrace';
import { GRAVITY_MS2, type Vec2, profileFrame } from '../breaker/lipProfile';
import { type ReefField, sampleField } from '../breaker/reefField';
import { type BreakOptions, type WaveContext, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { smoothstep } from '../math/smoothstep';
import type { WaveEvent } from '../swell/sets';
import { FOAM_TICK_S } from './foamStep';

/**
 * Offshore spray's emitters and births (spec 2026-09-27-offshore-spray-design.md §3.1), on the CPU: each 20 Hz tick, the
 * lip tips of the stations mid-throw (a camera-independent crest trace, plan S1) and the particles they launch, with
 * every random value from a hash of the tick (plan S4), so a replay reproduces live play exactly.
 */

/** Emitters are the trace's stations at this fixed spacing (m of crest arc). */
export const SPRAY_SPACING_M = 1.5;
/** Particles per metre of throwing lip per second, at strength 1 (plan S3). */
export const SPRAY_RATE = 20;
/** Births per tick, and the pool slots each tick owns (plan S2)… */
export const SPRAY_BIRTH_CAP = 320;
/** …for this many ticks of history (5 s, longer than the longest life, 4 s × 1.2), so the pool is… */
export const SPRAY_HISTORY_TICKS = 100;
/** …32,000 particles. */
export const SPRAY_POOL = SPRAY_BIRTH_CAP * SPRAY_HISTORY_TICKS;
/** A station emits only where its constructed lip is actually drawn: weight · ρ above this. */
export const MIN_EMIT_WEIGHT = 0.1;
/** A puff's opacity at strength 1, before its shape and fades (plan S3). */
export const SPRAY_OPACITY = 0.08;
/** The offshore wind speed (m/s) below which there is no spray, and from which it is full. */
export const WIND_CALM_MS = 1;
export const WIND_FULL_MS = 6;

export interface SprayParams {
  /** Scales how much spray comes off (× the emission rate). */
  amount: number;
  /** A puff's mean life (s); each lives this × U(0.6, 1.2). */
  lifeS: number;
}

export const DEFAULT_SPRAY_PARAMS: Readonly<SprayParams> = { amount: 1, lifeS: 2 };
export const SPRAY_PARAM_RANGES = { amount: { min: 0, max: 3 }, lifeS: { min: 0.8, max: 4 } } as const;

export function normalizeSprayParams(p: SprayParams): void {
  for (const k of Object.keys(SPRAY_PARAM_RANGES) as (keyof SprayParams)[]) {
    const r = SPRAY_PARAM_RANGES[k];
    p[k] = Number.isFinite(p[k]) ? Math.min(r.max, Math.max(r.min, p[k])) : DEFAULT_SPRAY_PARAMS[k];
  }
}

/** Ticks a replay covers: the longest life (1.2 × lifeS) plus 0.5 s. */
export function sprayReplayTicks(lifeS: number): number {
  return Math.ceil((1.2 * lifeS + 0.5) / FOAM_TICK_S - 1e-9);
}

export interface Wind {
  speedMs: number;
  /** Where the wind comes from, degrees true (meteorological). */
  fromDeg: number;
}

/** The unit xz vector the wind blows toward (+X east, +Z south; bearing b is (sin b, −cos b)). */
export function windToVector(fromDeg: number): [number, number] {
  const b = ((fromDeg + 180) * Math.PI) / 180;
  return [Math.sin(b), -Math.cos(b)];
}

/** How strongly a lip travelling along (nx, nz) throws spray in this wind: its offshore component, 0 → 1 over 1–6 m/s. */
export function offshoreFactor(wind: Wind, nx: number, nz: number): number {
  const [wx, wz] = windToVector(wind.fromDeg);
  return smoothstep(WIND_CALM_MS, WIND_FULL_MS, wind.speedMs * Math.max(0, -(wx * nx + wz * nz)));
}

export interface SprayEmitter {
  /** The lip tip (world m; y includes the tide). */
  x: number;
  y: number;
  z: number;
  /** The lip's throw velocity (m/s, horizontal, along the crest normal). */
  vx: number;
  vz: number;
  /** The crest normal (the wave's travel). */
  nx: number;
  nz: number;
  /** weight · ρ · wind factor · amount (may exceed 1 above amount 1). */
  strength: number;
  /** The wave's event id and the station's arc index (arc / spacing): the hash keys of its births. */
  waveId: number;
  arc: number;
}

export interface EmitterInput {
  field: ReefField | null;
  ctx: WaveContext | null;
  events: readonly WaveEvent[];
  t: number;
  params: BreakParams;
  /** Waves no taller than this never reach the ribbon's onset (App's ribbonMinHeightM). */
  minHeightM: number;
  wind: Wind;
  tideM: number;
  amount: number;
}

/** The emitters at sim time t: the lip tip of every station mid-throw (spec §3.1). */
export function sprayEmitters(i: EmitterInput): SprayEmitter[] {
  const { field, ctx, params } = i;
  if (!field || !ctx || !params.enabled || !(i.amount > 0) || i.events.length === 0) return [];
  const waves = i.events.map(toActiveWave);
  const stations = traceStations(field, waves, i.t, ctx, { cameraX: 0, cameraZ: 0, params, minHeightM: i.minHeightM, spacingM: SPRAY_SPACING_M });
  const opts: BreakOptions = { sample: (x, z) => sampleField(field, x, z), params };
  const out: SprayEmitter[] = [];
  for (const s of stations) {
    if (s.gap || s.tb === null || !Number.isFinite(s.tb)) continue;
    const wind = offshoreFactor(i.wind, s.nx, s.nz);
    if (!(wind > 0)) continue;
    const base = (u: number): Vec2 => {
      const x = s.x + s.nx * u, z = s.z + s.nz * u;
      const r = sumWaves(x, z, i.t, sampleField(field, x, z), waves, ctx, opts);
      return [u + r.dx * s.nx + r.dz * s.nz, r.eta];
    };
    const f = profileFrame(base, { H: s.H, c: s.c, r: s.r, tb: s.tb }, params);
    if (!(f.prog > 0 && f.prog < 1) || !(f.weight * f.rho > MIN_EMIT_WEIGHT)) continue;
    const tp = f.reach / f.vj;
    const u = f.K[0] + f.reach, y = f.K[1] - 0.5 * GRAVITY_MS2 * tp * tp;
    out.push({
      x: s.x + s.nx * u, y: y + i.tideM, z: s.z + s.nz * u, vx: s.nx * f.vj, vz: s.nz * f.vj, nx: s.nx, nz: s.nz,
      strength: f.weight * f.rho * wind * i.amount, waveId: i.events[s.wave].id, arc: Math.round(s.arc / SPRAY_SPACING_M),
    });
  }
  return out;
}

/** PCG hash (O'Neill), uint32 → uint32. */
function pcg(v: number): number {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

/** A uniform number in [0, 1) from four integers (the births' random draws, plan S4). */
export function rand01(a: number, b: number, c: number, d: number): number {
  return pcg((pcg((pcg((pcg(a | 0) ^ (b | 0)) >>> 0) ^ (c | 0)) >>> 0) ^ (d | 0)) >>> 0) / 4294967296;
}

export interface SprayBirth {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  /** min(1, the emitter's strength): scales the puff's opacity. */
  strength: number;
}

/**
 * Tick k's births (spec §3.1–3.2): floor(strength × rate × spacing × Δ + a hashed fraction) per emitter, in emitter order,
 * at most SPRAY_BIRTH_CAP (plan S2; the rest are dropped). Each is scattered ±0.4 m along the crest and 0–0.3 m up,
 * launched with half the lip's throw, a 2–4 m/s upward kick and ±1 m/s per axis, for lifeS × U(0.6, 1.2).
 */
export function sprayBirths(emitters: readonly SprayEmitter[], tick: number, p: SprayParams): SprayBirth[] {
  const out: SprayBirth[] = [];
  for (const e of emitters) {
    const n = Math.floor(e.strength * SPRAY_RATE * SPRAY_SPACING_M * FOAM_TICK_S + rand01(tick, e.waveId, e.arc, 0x9e3779b9));
    for (let j = 0; j < n; j++) {
      if (out.length >= SPRAY_BIRTH_CAP) return out;
      const r = (q: number): number => rand01(tick, e.waveId, e.arc, j * 8 + q + 1);
      const along = (r(0) * 2 - 1) * 0.4;
      out.push({
        x: e.x - e.nz * along, y: e.y + r(1) * 0.3, z: e.z + e.nx * along,
        vx: 0.5 * e.vx + (r(2) * 2 - 1), vy: 2 + 2 * r(3) + (r(4) * 2 - 1), vz: 0.5 * e.vz + (r(5) * 2 - 1),
        life: p.lifeS * (0.6 + 0.6 * r(6)), strength: Math.min(1, e.strength),
      });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/whitewater/sprayEmitters.test.ts src/breaker/crestTrace.test.ts`
Expected: PASS.
- If `while a wave throws…` finds ≤ 3 emitters at `T_THROW`, the lip isn't mid-throw at that instant. Scan `BIGGEST.arrivalS + 0.2 … + 1.4` in 0.1 s steps in a scratch test, pick the time with the most emitters, set `T_THROW` to it and ledger the value.
- If `none … long after it` finds emitters from `BIGGEST` at +6 s, the section is still throwing further down the line. Raise the offset until none remain, and ledger it.

- [ ] **Step 6: Full suite, typecheck, commit**

Run: `npx vitest run` (expected: all pass) and `npm run typecheck` (expected: no errors).

```bash
git add src/breaker/crestTrace.ts src/breaker/crestTrace.test.ts src/whitewater/sprayEmitters.ts src/whitewater/sprayEmitters.test.ts
git commit -m "feat(spray): emitters at mid-throw lip tips (camera-independent trace) and deterministic births

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The CPU particle reference (`sprayStep.ts`) and the tick plan for a replay length

**Files:**
- Create: `src/whitewater/sprayStep.ts`
- Test: `src/whitewater/sprayStep.test.ts`
- Modify: `src/whitewater/foamStep.ts` (`FoamSchedule.planTicks`)

**Interfaces:**
- Consumes (Task 1): `SPRAY_POOL`, `SPRAY_BIRTH_CAP`, `SPRAY_HISTORY_TICKS`, `SprayBirth`; `FOAM_TICK_S`, `FoamSchedule`.
- Produces:
  - `SPRAY_DRAG_TAU_S` = 0.45, `SPRAY_SETTLE_MS2` = 1.2;
  - `slotBase(tick): number`;
  - `class SprayPool { posAge; velLife; meta: Float32Array; constructor(size = SPRAY_POOL) }`;
  - `birthInto(pool, tick, births)`, `stepPool(pool, windX, windZ)`, `liveSlots(pool): number[]`;
  - `FoamSchedule.planTicks(simTime, replayTicks): FoamPlan`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/whitewater/sprayStep.test.ts
import { describe, expect, it } from 'vitest';
import { FOAM_TICK_S, FoamSchedule } from './foamStep';
import { SPRAY_BIRTH_CAP, SPRAY_HISTORY_TICKS, SPRAY_POOL, type SprayBirth } from './sprayEmitters';
import { SPRAY_DRAG_TAU_S, SPRAY_SETTLE_MS2, SprayPool, birthInto, liveSlots, slotBase, stepPool } from './sprayStep';

const puff = (over: Partial<SprayBirth> = {}): SprayBirth => ({ x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, life: 2, strength: 1, ...over });

describe('the spray pool (CPU reference)', () => {
  it("each tick owns SPRAY_BIRTH_CAP slots, cycling every SPRAY_HISTORY_TICKS ticks", () => {
    expect(SPRAY_POOL).toBe(SPRAY_BIRTH_CAP * SPRAY_HISTORY_TICKS);
    expect(slotBase(0)).toBe(0);
    expect(slotBase(1)).toBe(SPRAY_BIRTH_CAP);
    expect(slotBase(SPRAY_HISTORY_TICKS + 3)).toBe(3 * SPRAY_BIRTH_CAP);
  });
  it('slot bases wrap for negative ticks', () => {
    expect(slotBase(-1)).toBe((SPRAY_HISTORY_TICKS - 1) * SPRAY_BIRTH_CAP);
    expect(slotBase(-SPRAY_HISTORY_TICKS)).toBe(0);
  });
  it('a born puff is live, steps with the wind drag and the settling, and dies at its life', () => {
    const pool = new SprayPool(SPRAY_BIRTH_CAP * 2);
    birthInto(pool, 0, [puff({ vx: 0, vy: 3, life: 0.2 })]);
    expect(liveSlots(pool)).toEqual([0]);
    stepPool(pool, 5, 0);
    const k = Math.min(1, FOAM_TICK_S / SPRAY_DRAG_TAU_S);
    const vx = 5 * k, vy = 3 * (1 - k) - SPRAY_SETTLE_MS2 * FOAM_TICK_S;
    expect(pool.velLife[0]).toBeCloseTo(vx, 5);
    expect(pool.velLife[1]).toBeCloseTo(vy, 5);
    expect(pool.posAge[0]).toBeCloseTo(vx * FOAM_TICK_S, 5);
    expect(pool.posAge[1]).toBeCloseTo(1 + vy * FOAM_TICK_S, 5);
    expect(pool.posAge[3]).toBeCloseTo(FOAM_TICK_S, 6);
    for (let i = 0; i < 3; i++) stepPool(pool, 5, 0);
    expect(liveSlots(pool)).toEqual([]);
    const frozen = pool.posAge.slice(0, 4);
    stepPool(pool, 5, 0);
    expect(pool.posAge.slice(0, 4)).toEqual(frozen);
  });
  it('left long enough, a puff drifts at the wind speed', () => {
    const pool = new SprayPool(SPRAY_BIRTH_CAP);
    birthInto(pool, 0, [puff({ vx: -8, life: 10 })]);
    for (let i = 0; i < 60; i++) stepPool(pool, 4, -2);
    expect(pool.velLife[0]).toBeCloseTo(4, 3);
    expect(pool.velLife[2]).toBeCloseTo(-2, 3);
  });
  it("a tick's births land in its own slots, whatever came before", () => {
    const pool = new SprayPool();
    birthInto(pool, 5, [puff({ x: 1 }), puff({ x: 2 })]);
    const base = slotBase(5) * 4;
    expect(pool.posAge[base]).toBe(1);
    expect(pool.posAge[base + 4]).toBe(2);
    expect(pool.meta[base]).toBe(1);
  });
  it('a replay equals live stepping exactly (fixed slots per tick)', () => {
    const births = (k: number): SprayBirth[] => Array.from({ length: (k * 7) % 5 }, (_, i) => puff({ x: k + i, vy: 1 + i, life: 1 + ((k + i) % 3) * 0.5 }));
    const run = (from: number, to: number): SprayPool => {
      const pool = new SprayPool();
      for (let k = from; k <= to; k++) { birthInto(pool, k, births(k)); stepPool(pool, 3, -1); }
      return pool;
    };
    const live = run(0, 200), replay = run(200 - 58 + 1, 200);
    const a = liveSlots(live), b = liveSlots(replay);
    expect(b).toEqual(a);
    for (const s of a) for (let c = 0; c < 4; c++) {
      expect(replay.posAge[s * 4 + c]).toBe(live.posAge[s * 4 + c]);
      expect(replay.velLife[s * 4 + c]).toBe(live.velLife[s * 4 + c]);
    }
  });
  it('planTicks replays exactly the requested count', () => {
    const s = new FoamSchedule();
    const p = s.planTicks(10, 58);
    expect(p.clear).toBe(true);
    expect(p.ticks.length).toBe(58);
    expect(p.ticks[57]).toBe(200);
    expect(s.planTicks(10.05, 58)).toEqual({ clear: false, ticks: [201] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/whitewater/sprayStep.test.ts`
Expected: FAIL, with "Cannot find module './sprayStep'".

- [ ] **Step 3: Add `planTicks` to `FoamSchedule`**

In `src/whitewater/foamStep.ts`, replace the body of `FoamSchedule.plan` and add `planTicks`:

```ts
  plan(simTime: number, clearTimeS: number): FoamPlan {
    return this.planTicks(simTime, replayTickCount(clearTimeS));
  }

  /** As plan(), with the replay's length given in ticks (the spray's window is its longest life, not a clear time). */
  planTicks(simTime: number, replayTicks: number): FoamPlan {
    const k = tickIndex(simTime);
    const last = this.last;
    this.last = k;
    if (last === null || k < last || k - last > FOAM_JUMP_S * FOAM_TICKS_PER_S) {
      return { clear: true, ticks: ticksFrom(k - replayTicks + 1, k) };
    }
    return { clear: false, ticks: ticksFrom(last + 1, k) };
  }
```

- [ ] **Step 4: Write `sprayStep.ts`**

```ts
// src/whitewater/sprayStep.ts
import { FOAM_TICK_S } from './foamStep';
import { SPRAY_BIRTH_CAP, SPRAY_HISTORY_TICKS, SPRAY_POOL, type SprayBirth } from './sprayEmitters';

/**
 * The spray particles' CPU reference (spec 2026-09-27-offshore-spray-design.md §3.2): the pool, births into each tick's
 * own slots (plan S2) and the per-tick step. SprayParticles.ts mirrors it on the GPU.
 */

/** The wind takes a puff over with this time constant (s)… */
export const SPRAY_DRAG_TAU_S = 0.45;
/** …and it settles at this rate (m/s², mist barely falls). */
export const SPRAY_SETTLE_MS2 = 1.2;

/** The first slot tick k's births take: (k mod SPRAY_HISTORY_TICKS) × SPRAY_BIRTH_CAP (negative ticks wrap). */
export function slotBase(tick: number): number {
  const h = SPRAY_HISTORY_TICKS;
  return (((tick % h) + h) % h) * SPRAY_BIRTH_CAP;
}

/** Per slot: posAge = (x, y, z, age), velLife = (vx, vy, vz, life), meta = (strength, 0, 0, 0). Zeroed slots are dead. */
export class SprayPool {
  readonly posAge: Float32Array;
  readonly velLife: Float32Array;
  readonly meta: Float32Array;
  constructor(readonly size = SPRAY_POOL) {
    this.posAge = new Float32Array(size * 4);
    this.velLife = new Float32Array(size * 4);
    this.meta = new Float32Array(size * 4);
  }
}

export function birthInto(pool: SprayPool, tick: number, births: readonly SprayBirth[]): void {
  const base = slotBase(tick);
  births.forEach((b, i) => {
    const j = (base + i) * 4;
    if (j + 3 >= pool.posAge.length) return;
    pool.posAge.set([b.x, b.y, b.z, 0], j);
    pool.velLife.set([b.vx, b.vy, b.vz, b.life], j);
    pool.meta.set([b.strength, 0, 0, 0], j);
  });
}

/** One tick (Δ = FOAM_TICK_S) for every live slot: drag toward the wind, settle, move, age. */
export function stepPool(pool: SprayPool, windX: number, windZ: number): void {
  const k = Math.fround(Math.min(1, FOAM_TICK_S / SPRAY_DRAG_TAU_S));
  const f = Math.fround;
  for (let j = 0; j < pool.size * 4; j += 4) {
    const age = pool.posAge[j + 3], life = pool.velLife[j + 3];
    if (!(age < life)) continue;
    const vx = f(pool.velLife[j] + f((windX - pool.velLife[j]) * k));
    const vy = f(f(pool.velLife[j + 1] + f((0 - pool.velLife[j + 1]) * k)) - f(SPRAY_SETTLE_MS2 * FOAM_TICK_S));
    const vz = f(pool.velLife[j + 2] + f((windZ - pool.velLife[j + 2]) * k));
    pool.velLife[j] = vx; pool.velLife[j + 1] = vy; pool.velLife[j + 2] = vz;
    pool.posAge[j] = f(pool.posAge[j] + f(vx * FOAM_TICK_S));
    pool.posAge[j + 1] = f(pool.posAge[j + 1] + f(vy * FOAM_TICK_S));
    pool.posAge[j + 2] = f(pool.posAge[j + 2] + f(vz * FOAM_TICK_S));
    pool.posAge[j + 3] = f(age + FOAM_TICK_S);
  }
}

/** The live slots (age < life), ascending. */
export function liveSlots(pool: SprayPool): number[] {
  const out: number[] = [];
  for (let s = 0; s < pool.size; s++) if (pool.posAge[s * 4 + 3] < pool.velLife[s * 4 + 3]) out.push(s);
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/whitewater/sprayStep.test.ts src/whitewater/foamStep.test.ts`
Expected: PASS (and the foam tests unchanged).

- [ ] **Step 6: Commit**

Run: `npx vitest run` (expected: all pass) and `npm run typecheck` (expected: no errors).

```bash
git add src/whitewater/sprayStep.ts src/whitewater/sprayStep.test.ts src/whitewater/foamStep.ts
git commit -m "feat(spray): the CPU particle reference (fixed slots per tick, wind drag, settling)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The GPU particles and their look (`SprayParticles.ts`), with self-tests and limits

**Files:**
- Create: `src/whitewater/SprayParticles.ts`
- Create: `src/whitewater/spray.selftest.ts`
- Test: `src/whitewater/SprayParticles.test.ts`
- Modify: `src/dev/selfTests.ts`, `src/breaker/BreakingRibbon.limits.test.ts`

**Interfaces:**
- Consumes (Tasks 1–2):
  - `SPRAY_POOL`, `SPRAY_BIRTH_CAP`, `SPRAY_OPACITY`, `SprayParams`, `DEFAULT_SPRAY_PARAMS`, `normalizeSprayParams`, `sprayReplayTicks`, `SprayBirth`;
  - `slotBase`, `SPRAY_DRAG_TAU_S`, `SPRAY_SETTLE_MS2`;
  - `FoamSchedule`, `FOAM_TICK_S`, `tickIndex`, `tickTime`;
  - `Sky` (`sunDirection`, `sunIlluminance`, `skyIrradiance`, `applyAerialPerspective`).
- Produces: `class SprayParticles` with
  - `readonly mesh: THREE.Sprite`;
  - `readonly posAgeAttr`, `velLifeAttr`, `metaAttr: THREE.StorageBufferAttribute`;
  - `setParams(p: SprayParams)`, `setWind(windX, windZ)`, `invalidate()`;
  - `advance(renderer, simTime, birthsAt: (tick: number) => SprayBirth[]): number`;
  - `setOverlays(o: { sprayTint: boolean })`, `setDisplayExposure(ev: number)`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/whitewater/SprayParticles.test.ts
import type * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { SprayParticles } from './SprayParticles';
import { sprayReplayTicks } from './sprayEmitters';

describe('the spray particles on the GPU', () => {
  it('replays the longest life on its first advance, one submission per tick, asking for each tick in order', () => {
    const spray = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    const calls: unknown[] = [];
    const renderer = { compute: (n: unknown) => { calls.push(n); } } as unknown as THREE.WebGPURenderer;
    const asked: number[] = [];
    const steps = spray.advance(renderer, 10, (k) => { asked.push(k); return k % 2 ? [] : [{ x: 0, y: 1, z: 0, vx: 0, vy: 2, vz: 0, life: 2, strength: 1 }]; });
    expect(steps).toBe(sprayReplayTicks(2));
    expect(asked).toEqual(Array.from({ length: steps }, (_, i) => 200 - steps + 1 + i));
    expect(calls.length).toBe(1 + steps);
    expect(calls.slice(1).every((c) => Array.isArray(c))).toBe(true);
    expect(spray.mesh.count).toBeGreaterThan(30000);
  });
});
```

In `src/breaker/BreakingRibbon.limits.test.ts`, add `import { SprayParticles } from '../whitewater/SprayParticles';` and inside the `describe`:

```ts
  it('the spray passes and material stay within the limits', () => {
    const spray = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    for (const p of ['birthPass', 'stepPass', 'clearPass'] as const) {
      expect(storageBindings(computeWgsl((spray as unknown as Record<string, THREE.ComputeNode>)[p])), p).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
    }
    const w = renderWgsl(spray.mesh as unknown as THREE.Mesh);
    expect(storageBindings(w.vertex)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
    expect(storageBindings(w.fragment)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
    expect(sampledTextures(w.fragment)).toBeLessThanOrEqual(16);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/whitewater/SprayParticles.test.ts src/breaker/BreakingRibbon.limits.test.ts`
Expected: FAIL, with "Cannot find module './SprayParticles'".

- [ ] **Step 3: Write `SprayParticles.ts`**

```ts
// src/whitewater/SprayParticles.ts
import * as THREE from 'three/webgpu';
import {
  Fn, If, atan, cameraPosition, cameraViewMatrix, clamp, dot, float, instanceIndex, length, max, min, mix, mx_noise_float, pow, select,
  smoothstep, storage, uint, uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { FOAM_TICK_S, FoamSchedule, tickIndex, tickTime } from './foamStep';
import {
  DEFAULT_SPRAY_PARAMS, SPRAY_BIRTH_CAP, SPRAY_OPACITY, SPRAY_POOL, type SprayBirth, type SprayParams, normalizeSprayParams, sprayReplayTicks,
} from './sprayEmitters';
import { SPRAY_DRAG_TAU_S, SPRAY_SETTLE_MS2, slotBase } from './sprayStep';

type N = any;

/** The mist's forward-scattering anisotropy (Henyey–Greenstein g): backlit spray glows. */
const PHASE_G = 0.75;
/** A puff's size (m) at birth and at death. */
const SIZE_BIRTH_M = 0.3;
const SIZE_DEATH_M = 2;
/** Screen-space stretch along the velocity: 1 + this × |v_view| (m/s), at most MAX_STRETCH. */
const STRETCH_PER_MS = 0.4;
const MAX_STRETCH = 3;

/**
 * Offshore spray on the GPU (spec 2026-09-27-offshore-spray-design.md §3.2–3.3; CPU reference sprayStep.ts): a pool of
 * SPRAY_POOL puffs, born into their tick's own slots (plan S2) and stepped at 20 Hz of sim time (birth + step in one
 * submission per tick), drawn as velocity-stretched soft sprites lit by single scattering from the sky's sun and sky.
 */
export class SprayParticles {
  readonly mesh: THREE.Sprite;
  readonly posAgeAttr = new THREE.StorageBufferAttribute(new Float32Array(SPRAY_POOL * 4), 4);
  readonly velLifeAttr = new THREE.StorageBufferAttribute(new Float32Array(SPRAY_POOL * 4), 4);
  readonly metaAttr = new THREE.StorageBufferAttribute(new Float32Array(SPRAY_POOL * 4), 4);
  private readonly birthAttr = new THREE.StorageBufferAttribute(new Float32Array(SPRAY_BIRTH_CAP * 8), 4);
  private readonly birthCount = uniform(0);
  private readonly birthBase = uniform(0);
  private readonly wind = uniform(new THREE.Vector2());
  private readonly sinceTick = uniform(0);
  private readonly tint = uniform(0);
  private readonly inverseExposure = uniform(1);
  private readonly schedule = new FoamSchedule();
  private readonly params: SprayParams = { ...DEFAULT_SPRAY_PARAMS };
  private readonly birthPass: THREE.ComputeNode;
  private readonly stepPass: THREE.ComputeNode;
  private readonly clearPass: THREE.ComputeNode;

  constructor(sky: Sky) {
    const posAge = storage(this.posAgeAttr, 'vec4', SPRAY_POOL);
    const velLife = storage(this.velLifeAttr, 'vec4', SPRAY_POOL);
    const meta = storage(this.metaAttr, 'vec4', SPRAY_POOL);
    const births = storage(this.birthAttr, 'vec4', SPRAY_BIRTH_CAP * 2).toReadOnly();
    this.birthPass = Fn(() => {
      const i = instanceIndex;
      If(float(i).lessThan(this.birthCount), () => {
        const slot = uint(this.birthBase).add(i);
        const a = births.element(i.mul(2)), b = births.element(i.mul(2).add(1));
        posAge.element(slot).assign(vec4(a.xyz, 0.0));
        velLife.element(slot).assign(vec4(b.xyz, a.w));
        meta.element(slot).assign(vec4(b.w, 0.0, 0.0, 0.0));
      });
    })().compute(SPRAY_BIRTH_CAP) as THREE.ComputeNode;
    // sprayStep.stepPool, in f32.
    const k = Math.min(1, FOAM_TICK_S / SPRAY_DRAG_TAU_S);
    this.stepPass = Fn(() => {
      const i = instanceIndex;
      const pa = posAge.element(i).toVar(), vl = velLife.element(i).toVar();
      If(pa.w.lessThan(vl.w), () => {
        const v = vl.xyz.add(vec3(this.wind.x, 0.0, this.wind.y).sub(vl.xyz).mul(k)).sub(vec3(0.0, SPRAY_SETTLE_MS2 * FOAM_TICK_S, 0.0)).toVar();
        posAge.element(i).assign(vec4(pa.xyz.add(v.mul(FOAM_TICK_S)), pa.w.add(FOAM_TICK_S)));
        velLife.element(i).assign(vec4(v, vl.w));
      });
    })().compute(SPRAY_POOL) as THREE.ComputeNode;
    this.clearPass = Fn(() => {
      const i = instanceIndex;
      posAge.element(i).assign(vec4(0.0));
      velLife.element(i).assign(vec4(0.0));
      meta.element(i).assign(vec4(0.0));
    })().compute(SPRAY_POOL) as THREE.ComputeNode;
    this.mesh = new THREE.Sprite(this.buildMaterial(sky));
    this.mesh.count = SPRAY_POOL;
    this.mesh.frustumCulled = false;
  }

  /** The sprite (spec §3.3): stretched along the screen velocity, growing, fading; single scattering; aerial perspective. */
  private buildMaterial(sky: Sky): THREE.SpriteNodeMaterial {
    const m = new THREE.SpriteNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.NormalBlending;
    const pa: N = storage(this.posAgeAttr, 'vec4', SPRAY_POOL).toReadOnly().element(instanceIndex);
    const vl: N = storage(this.velLifeAttr, 'vec4', SPRAY_POOL).toReadOnly().element(instanceIndex);
    const mt: N = storage(this.metaAttr, 'vec4', SPRAY_POOL).toReadOnly().element(instanceIndex);
    const alive = pa.w.lessThan(vl.w);
    const ageFrac = clamp(pa.w.div(max(vl.w, 1e-3)), 0.0, 1.0);
    const centre = pa.xyz.add(vl.xyz.mul(this.sinceTick));
    m.positionNode = centre;
    const vView = cameraViewMatrix.mul(vec4(vl.xyz, 0.0)).xy;
    const stretch = clamp(length(vView).mul(STRETCH_PER_MS).add(1.0), 1.0, MAX_STRETCH);
    const size = mix(float(SIZE_BIRTH_M), float(SIZE_DEATH_M), ageFrac).mul(select(alive, float(1.0), float(0.0)));
    m.scaleNode = vec2(size.mul(stretch), size);
    m.rotationNode = atan(vView.y, vView.x);
    const vAgeFrac: N = varying(ageFrac), vAgeS: N = varying(pa.w), vStrength: N = varying(mt.x);
    const vCentre: N = varying(centre), vSeed: N = varying(float(instanceIndex));
    // Shape: a soft round puff broken by one octave of noise seeded per slot.
    const q = uv().sub(0.5);
    const shape = float(1.0).sub(smoothstep(0.3, 1.0, length(q).mul(2.0))).mul(mx_noise_float(vec3(uv().mul(3.0), vSeed.mul(0.137))).mul(0.5).add(0.75));
    const fades = smoothstep(0.0, 0.1, vAgeS).mul(float(1.0).sub(smoothstep(0.6, 1.0, vAgeFrac)));
    m.opacityNode = clamp(shape.mul(fades).mul(vStrength).mul(SPRAY_OPACITY), 0.0, 1.0);
    // Single scattering: the sun through a forward-peaked phase function, the sky isotropically; then the haze.
    const toP = vCentre.sub(cameraPosition);
    const dist = length(toP);
    const viewDir = toP.div(max(dist, 1e-3));
    const cosT = dot(viewDir, sky.sunDirection);
    const g2 = PHASE_G * PHASE_G;
    const hg = float((1 - g2) / (4 * Math.PI)).div(pow(max(float(1 + g2).sub(cosT.mul(2 * PHASE_G)), 1e-4), 1.5));
    const radiance = sky.sunIlluminance.mul(hg).add(sky.skyIrradiance.mul(1 / (4 * Math.PI)));
    const colour = sky.applyAerialPerspective(radiance, dist, viewDir);
    const ageColour = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), vAgeFrac).mul(this.inverseExposure.mul(0.5));
    m.colorNode = mix(colour, ageColour, this.tint.mul(0.8));
    return m;
  }

  setParams(p: SprayParams): void {
    Object.assign(this.params, p);
    normalizeSprayParams(this.params);
  }

  /** The wind (m/s, world xz) the puffs are dragged toward. */
  setWind(windX: number, windZ: number): void {
    this.wind.value.set(windX, windZ);
  }

  /** The next advance() clears the pool and replays the longest life. */
  invalidate(): void {
    this.schedule.invalidate();
  }

  /**
   * Runs this frame's ticks (FoamSchedule.planTicks). For each tick k, `birthsAt(k)` gives its births (App: the emitters
   * at tₖ); birth and step go as one submission. Returns the ticks run. The sprites draw at p + v·(t − tₖ).
   */
  advance(renderer: THREE.WebGPURenderer, simTime: number, birthsAt: (tick: number) => SprayBirth[]): number {
    const plan = this.schedule.planTicks(simTime, sprayReplayTicks(this.params.lifeS));
    if (plan.clear) renderer.compute(this.clearPass);
    const data = this.birthAttr.array as Float32Array;
    for (const k of plan.ticks) {
      const births = birthsAt(k).slice(0, SPRAY_BIRTH_CAP);
      births.forEach((b, i) => {
        data.set([b.x, b.y, b.z, b.life, b.vx, b.vy, b.vz, b.strength], i * 8);
      });
      this.birthAttr.needsUpdate = true;
      this.birthCount.value = births.length;
      this.birthBase.value = slotBase(k);
      renderer.compute(births.length > 0 ? [this.birthPass, this.stepPass] : [this.stepPass]);
    }
    this.sinceTick.value = simTime - tickTime(tickIndex(simTime));
    return plan.ticks.length;
  }

  setOverlays(o: { sprayTint: boolean }): void {
    this.tint.value = o.sprayTint ? 1 : 0;
  }

  /** The picture's exposure, so the tint overlay reads the same at any exposure. */
  setDisplayExposure(ev: number): void {
    this.inverseExposure.value = ev > 0 ? 1 / ev : 1;
  }
}
```

- [ ] **Step 4: Write the GPU self-tests**

```ts
// src/whitewater/spray.selftest.ts
import type * as THREE from 'three/webgpu';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { FoamSchedule } from './foamStep';
import { SprayParticles } from './SprayParticles';
import { SPRAY_POOL, type SprayBirth, sprayReplayTicks } from './sprayEmitters';
import { SprayPool, birthInto, liveSlots, stepPool } from './sprayStep';

/** A synthetic source: a line of puffs every tick, varying with the tick (no reef needed). */
const birthsAt = (k: number): SprayBirth[] =>
  Array.from({ length: 5 + (((k % 7) + 7) % 7) }, (_, i) => ({ x: i * 1.5, y: 1 + 0.1 * i, z: k * 0.01, vx: 2, vy: 2 + (i % 3), vz: -1, life: 1 + (i % 4) * 0.4, strength: 0.8 }));
const WIND: [number, number] = [-5, 3];

async function read(renderer: THREE.WebGPURenderer, spray: SprayParticles): Promise<{ pos: Float32Array; vel: Float32Array }> {
  return {
    pos: new Float32Array(await renderer.getArrayBufferAsync(spray.posAgeAttr)),
    vel: new Float32Array(await renderer.getArrayBufferAsync(spray.velLifeAttr)),
  };
}

registerSelfTest({
  name: 'spray: the GPU birth and step match the CPU reference over a replay',
  async run(renderer) {
    const spray = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    spray.setWind(...WIND);
    const t = 12;
    spray.advance(renderer, t, birthsAt);
    const g = await read(renderer, spray);
    const cpu = new SprayPool();
    const plan = new FoamSchedule().planTicks(t, sprayReplayTicks(2));
    for (const k of plan.ticks) { birthInto(cpu, k, birthsAt(k)); stepPool(cpu, ...WIND); }
    const live = liveSlots(cpu);
    let worst = 0, liveGpu = 0;
    for (let s = 0; s < SPRAY_POOL; s++) if (g.pos[s * 4 + 3] < g.vel[s * 4 + 3]) liveGpu++;
    for (const s of live) for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(g.pos[s * 4 + c] - cpu.posAge[s * 4 + c]), Math.abs(g.vel[s * 4 + c] - cpu.velLife[s * 4 + c]));
    return { pass: worst < 1e-3 && liveGpu === live.length && live.length > 50, detail: `${live.length} live (GPU ${liveGpu}); worst |GPU − CPU| ${worst.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'spray: a GPU replay matches GPU live stepping exactly (fixed slots per tick)',
  async run(renderer) {
    const live = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    live.setWind(...WIND);
    for (let f = 0; f <= 240; f++) live.advance(renderer, 6 + f / 60, birthsAt);
    const a = await read(renderer, live);
    const replay = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    replay.setWind(...WIND);
    replay.advance(renderer, 10, birthsAt);
    const b = await read(renderer, replay);
    let worst = 0, n = 0;
    for (let s = 0; s < SPRAY_POOL; s++) {
      const la = a.pos[s * 4 + 3] < a.vel[s * 4 + 3], lb = b.pos[s * 4 + 3] < b.vel[s * 4 + 3];
      if (la !== lb) worst = Infinity;
      if (!la) continue;
      n++;
      for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(a.pos[s * 4 + c] - b.pos[s * 4 + c]), Math.abs(a.vel[s * 4 + c] - b.vel[s * 4 + c]));
    }
    return { pass: worst === 0 && n > 50, detail: `${n} live; worst |live − replay| ${worst}` };
  },
});
```

In `src/dev/selfTests.ts`, add `import '../whitewater/spray.selftest';` after the foam field's import.

- [ ] **Step 5: Run the tests and self-tests**

Run: `npx vitest run src/whitewater/SprayParticles.test.ts src/breaker/BreakingRibbon.limits.test.ts` (expected: PASS) and `npm run typecheck` (expected: no errors).
Then open `/?selftest&fresh` in a visible Browser pane tab.
Expected: the two `spray:` tests PASS, and the summary is 41/41 (39 before plus these two).

- [ ] **Step 6: Commit**

```bash
git add src/whitewater/SprayParticles.ts src/whitewater/SprayParticles.test.ts src/whitewater/spray.selftest.ts src/dev/selfTests.ts src/breaker/BreakingRibbon.limits.test.ts
git commit -m "feat(spray): GPU spray particles (births, wind drag, settling) drawn as backlit mist sprites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: App wiring, the Spray folder, the overlay and persistence

**Files:**
- Modify: `src/app/App.ts`
- Modify: `src/dev/devSettings.ts` and `src/dev/devSettings.test.ts`
- Modify: `src/dev/DevPanel.ts` and `src/dev/DevPanel.test.ts`
- Modify: `src/ocean/OceanSurface.ts` (`DebugOverlays.sprayTint`)

**Interfaces:**
- Consumes: `SprayParticles` (Task 3); `sprayEmitters`, `sprayBirths`, `windToVector`, `SprayParams`, `DEFAULT_SPRAY_PARAMS`, `SPRAY_PARAM_RANGES`, `normalizeSprayParams` (Task 1); `tickTime` (foamStep).
- Produces:
  - `DevLookParams.spray`, with `'spray'` in `LOOK_KEYS`;
  - `DevPanelModel.spray`, `DevPanelHandlers.onSpray()`, `SPRAY_BINDINGS`;
  - `DebugOverlays.sprayTint`;
  - `App.measureSprayReplay(): Promise<{ ms: number; steps: number; cpuMs: number }>`.

- [ ] **Step 1: Write the failing tests**

In `src/dev/DevPanel.test.ts`, add `SPRAY_BINDINGS` to the `./DevPanel` import, add `import { DEFAULT_SPRAY_PARAMS, SPRAY_PARAM_RANGES, type SprayParams } from '../whitewater/sprayEmitters';`, and:

```ts
describe('Spray folder sliders', () => {
  it('has a slider for every SprayParams field, with exactly normalizeSprayParams ranges', () => {
    expect(Object.keys(SPRAY_BINDINGS).sort()).toEqual((Object.keys(DEFAULT_SPRAY_PARAMS) as (keyof SprayParams)[]).sort());
    for (const k of Object.keys(SPRAY_BINDINGS) as (keyof SprayParams)[]) {
      expect(SPRAY_BINDINGS[k].min).toBe(SPRAY_PARAM_RANGES[k].min);
      expect(SPRAY_BINDINGS[k].max).toBe(SPRAY_PARAM_RANGES[k].max);
    }
  });
});
```

In `src/dev/devSettings.test.ts`:
- add `import { DEFAULT_SPRAY_PARAMS } from '../whitewater/sprayEmitters';`;
- add `spray: DEFAULT_SPRAY_PARAMS,` to `defaults()` after `foam`;
- add `s.spray.amount = 1.7; s.spray.lifeS = 3.1; s.overlays.sprayTint = true;` to `tweaked()`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/dev`
Expected: FAIL. `SPRAY_BINDINGS` doesn't exist, the round trip loses `spray`, and the "toggle for every DebugOverlays field" test fails once `sprayTint` is added in Step 3.

- [ ] **Step 3: Implement the settings, the panel and the overlay field**

- **`src/ocean/OceanSurface.ts`:** add `/** The spray puffs coloured by age (green at birth, red at death). */ sprayTint: boolean;` to `DebugOverlays`, and `sprayTint: false` to `DEFAULT_DEBUG_OVERLAYS`.
- **`src/dev/devSettings.ts`:** import `type SprayParams` from `'../whitewater/sprayEmitters'`, add `spray: SprayParams;` to `DevLookParams` after `foam`, and append `'spray'` to `LOOK_KEYS`.
- **`src/dev/DevPanel.ts`:**
  - import `{ SPRAY_PARAM_RANGES, type SprayParams }` from `'../whitewater/sprayEmitters'`;
  - add `spray: SprayParams;` to `DevPanelModel` and `onSpray(): void;` to `DevPanelHandlers`;
  - add `sprayTint: { label: 'spray tint' },` to `OVERLAY_BINDINGS`;
  - after `FOAM_BINDINGS`:

```ts
/** Spray folder sliders (spec 2026-09-27-offshore-spray-design.md §3.2), ranges exactly normalizeSprayParams's (DevPanel.test.ts). */
export const SPRAY_BINDINGS = {
  amount: { label: 'spray amount', ...SPRAY_PARAM_RANGES.amount, step: 0.05 },
  lifeS: { label: 'spray life (s)', ...SPRAY_PARAM_RANGES.lifeS, step: 0.1 },
} as const;
```

  - after the Foam folder:

```ts
    const spray = this.pane.addFolder({ title: 'Spray' });
    for (const [key, opts] of Object.entries(SPRAY_BINDINGS) as [keyof SprayParams, (typeof SPRAY_BINDINGS)[keyof typeof SPRAY_BINDINGS]][]) {
      spray.addBinding(m.spray, key, opts).on('change', h.onSpray);
    }
```

Run `npx vitest run src/dev`. Expected: PASS.

- [ ] **Step 4: Wire App**

In `src/app/App.ts`:

1. Imports:

```ts
import { SprayParticles } from '../whitewater/SprayParticles';
import { DEFAULT_SPRAY_PARAMS, type SprayParams, normalizeSprayParams, sprayBirths, sprayEmitters, windToVector } from '../whitewater/sprayEmitters';
```

Add `tickTime` to the existing `'../whitewater/foamStep'` import.

2. Fields:
- `readonly sprayParams: SprayParams = { ...DEFAULT_SPRAY_PARAMS };` next to `foamParams` (before `lookDefaults`);
- after `foamField`: `/** Offshore spray off the throwing lips (spec 2026-09-27-offshore-spray-design.md). */ readonly spray = new SprayParticles(this.sky);`;
- in the constructor, `this.scene.add(this.spray.mesh);` after the ribbon is added.

3. Replays: add a method that replaces every direct `this.foamField.invalidate()` call:

```ts
  /** A jump (or new conditions or field): the foam map and the spray replay their windows. */
  private invalidateParticles(): void {
    this.foamField.invalidate();
    this.spray.invalidate();
  }
```

Replace each `this.foamField.invalidate();` in `applyMoment`, `callSetNow`, `rebuildSpectrumIfNeeded` and `onField` with `this.invalidateParticles();`. In `scheduleFoamReplay`, change the timeout body to `() => this.invalidateParticles()`.

Add the panel handler `onSpray: () => { normalizeSprayParams(this.sprayParams); this.spray.setParams(this.sprayParams); this.panel.refresh(); this.scheduleFoamReplay(); },`, and add `spray: this.sprayParams,` to the panel model. In `onOverlays`, add `this.spray.setOverlays(this.overlays);`.

4. Look plumbing:
- `spray: this.sprayParams,` in `lookParams()`;
- `assignParams(this.sprayParams, look.spray);` in `assignLook`;
- `normalizeSprayParams(this.sprayParams); this.spray.setParams(this.sprayParams); this.spray.setOverlays(this.overlays);` in `applyAllParams`.

5. The frame:
- after `this.stepFoam(events);`, add `this.stepSpray();`;
- after the existing line `if (this.underwater) this.ribbon.mesh.visible = false;`, add `this.spray.mesh.visible = !this.underwater;`;
- next to `this.ribbon.setDisplayExposure(...)`, add `this.spray.setDisplayExposure(this.picture.exposureValue);`.

Add the methods:

```ts
  /** This frame's spray ticks: each tick's emitters (the lip tips mid-throw at tₖ) give its births (spec §3.1). */
  private stepSpray(): void {
    const w = windToVector(this.conditions.wind.directionDeg), s = this.conditions.wind.speedMs;
    this.spray.setWind(w[0] * s, w[1] * s);
    this.spray.advance(this.renderer, this.clock.simTime, (k) => this.sprayBirthsAt(k));
  }

  private sprayBirthsAt(k: number) {
    const t = tickTime(k);
    const emitters = sprayEmitters({
      field: this.field, ctx: this.waveCtx, events: wavesNear(t, this.conditions, this.setParams), t, params: this.breakParams,
      minHeightM: this.ribbonMinHeightM, wind: { speedMs: this.conditions.wind.speedMs, fromDeg: this.conditions.wind.directionDeg },
      tideM: this.conditions.tideM, amount: this.sprayParams.amount,
    });
    return sprayBirths(emitters, k, this.sprayParams);
  }

  /** Dev (plan Task 5): a forced spray replay, timed to the GPU's completion; cpuMs is the emitter work alone. */
  async measureSprayReplay(): Promise<{ ms: number; steps: number; cpuMs: number }> {
    const device = (this.renderer.backend as unknown as { device: GPUDevice }).device;
    await device.queue.onSubmittedWorkDone();
    let cpuMs = 0;
    this.spray.invalidate();
    const start = performance.now();
    const steps = this.spray.advance(this.renderer, this.clock.simTime, (k) => {
      const c0 = performance.now();
      const b = this.sprayBirthsAt(k);
      cpuMs += performance.now() - c0;
      return b;
    });
    await device.queue.onSubmittedWorkDone();
    return { ms: performance.now() - start, steps, cpuMs };
  }
```

- [ ] **Step 5: Run everything**

Run: `npx vitest run` (expected: all pass) and `npm run typecheck` (expected: no errors).
In a visible Browser pane:
- `/?selftest&fresh`: expected 41/41;
- `/`: expected no console errors, and the Spray folder visible.

Then jump to `behind-the-wave` and read back the pool (the spray self-test's `read` pattern). Expected: live particles > 0 while a lip throws.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.ts src/dev/devSettings.ts src/dev/devSettings.test.ts src/dev/DevPanel.ts src/dev/DevPanel.test.ts src/ocean/OceanSurface.ts
git commit -m "feat(spray): App ticks the spray, replays on jumps, hides it underwater; Spray folder and tint overlay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Measure, capture, document

**Files:**
- Create: `docs/superpowers/gallery/phase-3/spray/` (PNGs) and add a Spray section to `docs/superpowers/gallery/phase-3/README.md`
- Modify: `docs/superpowers/specs/2026-09-27-offshore-spray-design.md` (Status, as-built cost)

- [ ] **Step 1: Measure**

In a **visible** Browser pane with the app rendering, jump to `behind-the-wave` − 4 s, when a lip is throwing.
1. Run `await liquidDreams.measureSprayReplay()` five times; record the median `ms`, `cpuMs` and `steps`. Per tick: `ms/steps` total, `cpuMs/steps` CPU.
2. **Drawing cost:** place the camera 6 m from the throwing lip, looking into the veil (a full-veil frame). Time it by the difference of `onSubmittedWorkDone`-fenced `captureFrame()` calls, with `spray.mesh.visible` true and then false (median of five each).

Expected, against the Global Constraints targets:
- replay ≤ 150 ms;
- per tick: CPU ≤ 1.5 ms and GPU ≤ 0.3 ms;
- drawing ≤ 1 ms.

**If any is over, stop.** Ledger the numbers, report them to Andrew with the spec's levers, and wait.

- [ ] **Step 2: Capture the gallery**

Capture with `captureFrame` (offscreen; it works hidden too). Each capture applies the moment first. Save into `docs/superpowers/gallery/phase-3/spray/`.
- `01-backlit-from-lineup.png`: `behind-the-wave` conditions at −4 s, camera `[-40, 2, -5]`, yaw 80°, pitch 3°, looking east into the morning sun at the throwing lip. This is the gold veil.
- `02-side-on.png`: the same time, camera `[5, 3, -60]`, yaw 180°, pitch 0°, looking along the crest.
- `03-from-behind.png`: the `behind-the-wave` camera at −1 s.
- `04-front-lit.png`: the same wave with the time of day moved to 16:30 (the sun behind the camera looking east). Faint white.
- `05-glassy-none.png` and `06-onshore-none.png`: frame 01 with wind 0 km/h, and with wind 30 km/h from 250°.
- `07-spray-tint.png`: frame 01 with the `spray tint` overlay.

Check each frame for a hard line where a puff crosses the water (spec §3.3 risk). If there is one, ledger it and report it; don't fix it without Andrew.

- [ ] **Step 3: Docs**

- Add a "## Offshore spray" section to `docs/superpowers/gallery/phase-3/README.md`, one line per image plus the measured costs.
- In the spec, set the Status to "Implemented on `phase-3b-offshore-spray` (2026-09-27); awaiting Andrew's review." Add the measured costs to §3.5 as an "As built" line, and the plan rulings S1–S4 to §3.1/§3.2 as "As built" notes.

- [ ] **Step 4: Final checks and commit**

Run: `npx vitest run` (expected: all pass), `npm run typecheck` (expected: no errors), and `/?selftest&fresh` (expected: 41/41).

```bash
git add docs/superpowers/gallery/phase-3 docs/superpowers/specs/2026-09-27-offshore-spray-design.md
git commit -m "docs(spray): gallery, measured cost, as-built notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
