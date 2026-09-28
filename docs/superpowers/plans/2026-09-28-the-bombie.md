# Phase 4c-3: The Bombie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ellensbrook Bombie as atmospheric background: a reef mound 450 m south-west of the Womb that, on big days (6 ft+), bursts into white water and spray on its own waves, never with the Womb's sets.

**Architecture:**
- **CPU (`src/bombie/bombieModel.ts`, pure):**
  - the place and the mound;
  - each wave's size factor;
  - the break rule;
  - `burstAt(t)`.
- **The mound** joins the seabed outside the reef map (CPU `bedHeightAt` and GPU `bedHeightNode`).
- **The white water** is a separate transparent mesh (`src/bombie/BombieMesh.ts`) that rides the ocean exactly as the ocean sheet's own vertices do (the same displacement, fades, tide and curvature), drawn only during a burst.
- **Spray:** a burst feeds the existing impact spray through new emitters.

**Tech Stack:** TypeScript (tsgo 7), three.js 0.186.1 WebGPU + TSL, vitest 5, the in-browser GPU self-tests.

**Spec:** `docs/superpowers/specs/2026-09-28-the-bombie-design.md` (approved by Andrew 2026-09-28)

## Global Constraints

- **Place:**
  - the reef is centred at (−300, +340) (x east, z south; the Womb's peak at the origin);
  - an oval mound 80 m along z by 50 m along x;
  - crest 5 m below mean sea level.
  
  (Plan ruling: the coast profile puts the bed there at about 25 m, not the spec's 15–18 m, so the mound rises from about 25 m.)
- **Waves:**
  - wave n passes at τ_B + n·T, where τ_B = `sampleField(field, −300, 340).tau`;
  - size factor f_n = exp(0.35·g_n), g_n standard normal from its own hash of (n, seed);
  - it breaks iff Hs ≥ Hs(threshold) and Hs·f_n ≥ 1.8·Hs(threshold) and n is not a Womb set-wave index (round(arrivalS / T) of the sets' events);
  - burst height 0.55·Hs·f_n;
  - `burstAt(t)` gives the latest break with age ≤ 40 s.
  
  The spec's "never below the threshold" is a hard gate.
- **White water:**
  - a 180 × 180 m grid, 64 × 64 cells;
  - the burst grows to full width in 3 s: 30 m at the threshold break height, up to 60 m at twice it, × `bombie size`;
  - then a band rolls shoreward at 4 m/s from the reef's inshore edge;
  - gone by 40 s;
  - two-scale noise;
  - lit like foam (sun × the sunlight map, sky, aerial perspective);
  - transparent, no depth write, drawn after the sea;
  - hidden when idle or underwater.
- **Spray:** impact-kind emitters along the burst line for the first 1.5 s; plumes 5–15 m, × `bombie size`; the wind carries them.
- **Params (new `Bombie` folder, persisted with the look):**
  - `bombie` on/off (default on);
  - `bombie size` 0.5–2 (default 1);
  - `bombie threshold (ft)` 4–10 (default 6).
- **Moments:**
  - `bombie-from-the-lineup`: the Womb's lineup, 08:15, facing south-west, 8 ft, 4 s after a break;
  - `bombie-close`: free camera 30 m up, 120 m inshore of the reef, facing it, 10 ft, 3 s after a break.
- **Cost:**
  - GPU ≤ 0.3 ms during a burst, 0 when idle;
  - CPU per-frame query ≤ 0.05 ms;
  - limits: ≤ 8 storage buffers, ≤ 16 sampled textures and ≤ 12 uniform buffers per stage.
- **Repo rules:**
  - `reference/` is never committed;
  - stage files by path;
  - never commit `.superpowers/`;
  - every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - branch `phase-4c3-the-bombie`; push; **do not merge** without Andrew.
- **Windows is case-insensitive:** no two files may differ only by case. `bombieModel.ts` and `BombieMesh.ts` are fine.

## Review Focus

1. **The reef field not loaded yet (no τ_B), or the swell at 0 ft:** no burst, the mesh hidden, nothing throws. Pinned in Task 1 (`burstAt` with no waves → null; hs 0 → never) and Task 5 (the App passes null waves until the field exists).
2. **Pausing, scrubbing the sim time backwards, or applying a moment mid-burst:** the burst shown is exactly the one at the current sim time, with no stale burst and no double spray. Pinned in Task 1 (`burstAt` is a pure function of t) and Task 4 (emitters from `burstAt(t_k)` per tick, the same as the Womb's replayable spray).
3. **A swell direction or period change** (the far field rebuilds, τ_B changes): the Bombie follows the new arrival times, with no burst stuck from the old ones. Pinned in Task 5 (τ_B re-read from the field on every rebuild).
4. **The threshold slider below the current swell, then above it:** bursts start and stop immediately, and a burst in progress fades out rather than vanishing. Pinned in Task 1 (the break rule reads the threshold per call; the latest break is re-evaluated each frame). The spec accepts a vanishing burst when the rule changes; ledger it if seen.
5. **Looking from below the surface near the Bombie, or from the beach at grazing angles:** the white water never shows through the sea surface or z-fights. Pinned in Task 3 (the GPU self-test matches the ocean sheet's height; the mesh hidden underwater).

---

## File structure

| File | Responsibility |
|---|---|
| `src/bombie/bombieModel.ts` (+test) | The place, the mound, `waveFactor`, `breaks`, `burstAt`, `burstWidthM`. |
| `src/bombie/bombieParams.ts` (+test) | `BombieParams`, defaults, ranges, `normalizeBombieParams`. |
| `src/seabed/bathymetry.ts`, `src/seabed/Seabed.ts` (+tests, self-test) | The mound in the seabed (CPU and GPU). |
| `src/bombie/BombieMesh.ts`, `src/bombie/bombie.selftest.ts` | The white-water mesh and material; its height self-test. |
| `src/whitewater/sprayEmitters.ts` (+test) | `bombieImpactEmitters`. |
| `src/app/App.ts`, `src/dev/devSettings.ts`, `src/dev/DevPanel.ts`, `src/dev/referenceMoments.ts` (+tests) | Wiring, persistence, the folder, the moments. |

---

### Task 1: The Bombie model and params (CPU)

**Files:**
- Create: `src/bombie/bombieModel.ts`, `src/bombie/bombieModel.test.ts`, `src/bombie/bombieParams.ts`, `src/bombie/bombieParams.test.ts`

**Interfaces:**
- Produces:
  - **Constants:** `BOMBIE_X = −300`, `BOMBIE_Z = 340`, `MOUND_HALF_X_M = 25`, `MOUND_HALF_Z_M = 40`, `MOUND_CREST_Y = −5`, `MOUND_BASE_Y = −26`, `BURST_LIFE_S = 40`, `BURST_GROW_S = 3`, `ROLL_SPEED_MS = 4`, `ROLL_DIR = [0.94, −0.34]` (a unit vector toward the east-north-east);
  - `moundY(x, z): number`: the mound's surface y, −Infinity outside its oval;
  - `waveFactor(n, seed): number`;
  - `interface BombieWaves { tauS: number; periodS: number; hs: number; thresholdHs: number; seed: number; setIndices: ReadonlySet<number> }`;
  - `breaks(n, w): boolean`;
  - `burstAt(t, w: BombieWaves | null): { n: number; ageS: number; heightM: number } | null`;
  - `burstWidthM(heightM, thresholdHs, size): number`;
  - `BombieParams { enabled: boolean; size: number; thresholdFt: number }`, `DEFAULT_BOMBIE_PARAMS`, `BOMBIE_PARAM_RANGES`, `normalizeBombieParams(p)`.

- [ ] **Step 1: Write the failing tests.**

`src/bombie/bombieModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { surferFeetToHs } from '../conditions/units';
import { BOMBIE_X, BOMBIE_Z, BURST_LIFE_S, MOUND_BASE_Y, MOUND_CREST_Y, MOUND_HALF_X_M, MOUND_HALF_Z_M, type BombieWaves, breaks, burstAt, burstWidthM, moundY, waveFactor } from './bombieModel';

const waves = (ft: number, thresholdFt = 6, setIndices: number[] = []): BombieWaves => ({
  tauS: 7.5, periodS: 15, hs: surferFeetToHs(ft), thresholdHs: surferFeetToHs(thresholdFt), seed: 2002, setIndices: new Set(setIndices),
});
const fraction = (w: BombieWaves) => { let k = 0; for (let n = 0; n < 20000; n++) if (breaks(n, w)) k++; return k / 20000; };

describe('the mound', () => {
  it('crests 5 m below mean sea level at the centre and meets the bed at its oval edge', () => {
    expect(moundY(BOMBIE_X, BOMBIE_Z)).toBeCloseTo(MOUND_CREST_Y, 6);
    expect(moundY(BOMBIE_X + MOUND_HALF_X_M * 0.999, BOMBIE_Z)).toBeCloseTo(MOUND_BASE_Y, 1);
    expect(moundY(BOMBIE_X + MOUND_HALF_X_M + 1, BOMBIE_Z)).toBe(-Infinity);
    expect(moundY(BOMBIE_X, BOMBIE_Z + MOUND_HALF_Z_M + 1)).toBe(-Infinity);
    expect(moundY(BOMBIE_X, BOMBIE_Z + 30)).toBeGreaterThan(moundY(BOMBIE_X + 20, BOMBIE_Z)); // long along z
  });
});

describe('the Bombie’s waves', () => {
  it('each wave has its own factor, near 1 with the odd big one', () => {
    expect(waveFactor(12, 2002)).toBe(waveFactor(12, 2002));
    const f = Array.from({ length: 5000 }, (_, n) => waveFactor(n, 2002)).sort((a, b) => a - b);
    expect(f[2500]).toBeGreaterThan(0.9); expect(f[2500]).toBeLessThan(1.1);
    expect(f[4990]).toBeGreaterThan(2);
  });
  it('never breaks below the threshold; a few percent at 6 ft; about half at 12 ft', () => {
    expect(fraction(waves(5.9))).toBe(0);
    expect(fraction(waves(6))).toBeGreaterThan(0.02);
    expect(fraction(waves(6))).toBeLessThan(0.1);
    expect(fraction(waves(12))).toBeGreaterThan(0.35);
    expect(fraction(waves(12))).toBeLessThan(0.65);
    expect(fraction(waves(0))).toBe(0);
  });
  it('never breaks on a Womb set wave', () => {
    const all = waves(12);
    const setIdx = Array.from({ length: 200 }, (_, n) => n).filter((n) => breaks(n, all));
    const withSets = waves(12, 6, setIdx);
    for (const n of setIdx) expect(breaks(n, withSets)).toBe(false);
  });
  it('the threshold is read per call', () => {
    const lowered = Array.from({ length: 2000 }, (_, n) => n).filter((n) => breaks(n, waves(8, 4))).length;
    const raised = Array.from({ length: 2000 }, (_, n) => n).filter((n) => breaks(n, waves(8, 10))).length;
    expect(lowered).toBeGreaterThan(0);
    expect(raised).toBe(0);
  });
});

describe('burstAt', () => {
  const w = waves(12);
  const n = Array.from({ length: 400 }, (_, k) => k + 100).find((k) => breaks(k, w) && !breaks(k + 1, w) && !breaks(k + 2, w))!;
  const tn = w.tauS + n * w.periodS;
  it('is the latest break for 40 s, with its age and height, then nothing', () => {
    expect(burstAt(tn + 3, w)).toEqual({ n, ageS: 3, heightM: 0.55 * w.hs * waveFactor(n, w.seed) });
    // Past the next two (non-breaking) waves, still this one, until BURST_LIFE_S.
    const later = burstAt(tn + 2.5 * w.periodS, w);
    expect(later?.n).toBe(n);
    const k = Array.from({ length: 10 }, (_, j) => n + 3 + j).find((j) => breaks(j, w));
    if (k === undefined || (k - n) * w.periodS > BURST_LIFE_S) expect(burstAt(tn + BURST_LIFE_S + 0.01, w)).toBeNull();
  });
  it('is a pure function of time (Review Focus 2), and null without waves (Review Focus 1)', () => {
    expect(burstAt(tn + 5, w)).toEqual(burstAt(tn + 5, w));
    expect(burstAt(tn - 0.01, w)?.n ?? -1).not.toBe(n);
    expect(burstAt(tn + 5, null)).toBeNull();
    expect(burstAt(tn + 5, { ...w, hs: 0 })).toBeNull();
  });
  it('bursts are 30 m wide at the threshold break height, up to 60 m, times the size', () => {
    const t = surferFeetToHs(6);
    expect(burstWidthM(0.55 * t * 1.8, t, 1)).toBeCloseTo(30, 6);
    expect(burstWidthM(0.55 * t * 1.8 * 2, t, 1)).toBeCloseTo(60, 6);
    expect(burstWidthM(0.55 * t * 1.8 * 5, t, 1)).toBeCloseTo(60, 6);
    expect(burstWidthM(0.55 * t * 1.8, t, 2)).toBeCloseTo(60, 6);
  });
});
```

`src/bombie/bombieParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOMBIE_PARAM_RANGES, DEFAULT_BOMBIE_PARAMS, normalizeBombieParams } from './bombieParams';

describe('Bombie params', () => {
  it('default on, size 1, threshold 6 ft; clamps and repairs', () => {
    expect(DEFAULT_BOMBIE_PARAMS).toEqual({ enabled: true, size: 1, thresholdFt: 6 });
    const p = { enabled: 'x' as unknown as boolean, size: 9, thresholdFt: Number.NaN };
    normalizeBombieParams(p);
    expect(p).toEqual({ enabled: true, size: BOMBIE_PARAM_RANGES.size.max, thresholdFt: 6 });
  });
});
```

- [ ] **Step 2: Run them.** `npx vitest run src/bombie`. Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement.**

`src/bombie/bombieModel.ts`:

```ts
import { hash3 } from '../beach/procedural';
import { smoothstep } from '../math/smoothstep';

/**
 * Ellensbrook Bombie (spec 2026-09-28-the-bombie-design.md): a reef mound 450 m south-west of the Womb's peak that, on big
 * days, bursts into white water on its own waves. Atmospheric background, never surfable.
 */
export const BOMBIE_X = -300;
export const BOMBIE_Z = 340;
/** The mound's oval: long along z (the crests), 80 × 50 m; crest 5 m below mean sea level, meeting the ~25 m bed. */
export const MOUND_HALF_X_M = 25;
export const MOUND_HALF_Z_M = 40;
export const MOUND_CREST_Y = -5;
export const MOUND_BASE_Y = -26;
export const BURST_LIFE_S = 40;
export const BURST_GROW_S = 3;
export const ROLL_SPEED_MS = 4;
/** Shoreward, east-north-east (unit). */
export const ROLL_DIR = [0.94, -0.34] as const;
const FACTOR_SPREAD = 0.35;
const BREAK_RATIO = 1.8;
const BREAK_HEIGHT = 0.55;

export function moundY(x: number, z: number): number {
  const r = Math.hypot((x - BOMBIE_X) / MOUND_HALF_X_M, (z - BOMBIE_Z) / MOUND_HALF_Z_M);
  if (r >= 1) return -Infinity;
  return MOUND_CREST_Y + (MOUND_BASE_Y - MOUND_CREST_Y) * smoothstep(0, 1, r);
}

/** Wave n's own size factor at the Bombie: exp(0.35 g), g standard normal (Box–Muller on two hashes of n and the seed). */
export function waveFactor(n: number, seed: number): number {
  const u1 = Math.max(1e-9, hash3(n, seed, 0xb0b1)), u2 = hash3(n, seed, 0xb0b2);
  const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(FACTOR_SPREAD * g);
}

export interface BombieWaves {
  /** The far field's arrival time at the Bombie; wave n passes at tauS + n·periodS. */
  tauS: number;
  periodS: number;
  hs: number;
  thresholdHs: number;
  seed: number;
  /** Womb set-wave indices (round(arrivalS / T)): never the Bombie's. */
  setIndices: ReadonlySet<number>;
}

export function breaks(n: number, w: BombieWaves): boolean {
  if (w.hs <= 0 || w.hs < w.thresholdHs) return false;
  if (w.setIndices.has(n)) return false;
  return w.hs * waveFactor(n, w.seed) >= BREAK_RATIO * w.thresholdHs;
}

/** The latest break within BURST_LIFE_S of t (its wave, age and breaking height), or null. */
export function burstAt(t: number, w: BombieWaves | null): { n: number; ageS: number; heightM: number } | null {
  if (!w || w.hs <= 0 || w.periodS <= 0) return null;
  const last = Math.floor((t - w.tauS) / w.periodS);
  for (let n = last; (t - (w.tauS + n * w.periodS)) <= BURST_LIFE_S; n--) {
    if (breaks(n, w)) return { n, ageS: t - (w.tauS + n * w.periodS), heightM: BREAK_HEIGHT * w.hs * waveFactor(n, w.seed) };
  }
  return null;
}

/** The burst's full width: 30 m at the threshold's breaking height, growing to 60 m at twice it, × size. */
export function burstWidthM(heightM: number, thresholdHs: number, size: number): number {
  const h0 = BREAK_HEIGHT * BREAK_RATIO * thresholdHs;
  return 30 * Math.min(2, Math.max(1, heightM / h0)) * size;
}
```

`src/bombie/bombieParams.ts`:

```ts
/** The Bombie folder (spec §3.5), persisted with the look. */
export interface BombieParams {
  enabled: boolean;
  /** Scales the white water and the spray. */
  size: number;
  /** The swell (surfer ft) at which it starts to break. */
  thresholdFt: number;
}

export const DEFAULT_BOMBIE_PARAMS: Readonly<BombieParams> = { enabled: true, size: 1, thresholdFt: 6 };
export const BOMBIE_PARAM_RANGES = { size: { min: 0.5, max: 2 }, thresholdFt: { min: 4, max: 10 } } as const;

export function normalizeBombieParams(p: BombieParams): void {
  for (const k of ['size', 'thresholdFt'] as const) {
    const r = BOMBIE_PARAM_RANGES[k];
    p[k] = Number.isFinite(p[k]) ? Math.min(r.max, Math.max(r.min, p[k])) : DEFAULT_BOMBIE_PARAMS[k];
  }
  p.enabled = p.enabled !== false;
}
```

- [ ] **Step 4: Run** `npx vitest run src/bombie` and `npx tsc --noEmit`. Expected: PASS. If the 6 ft fraction or the 12 ft fraction misses its band, re-derive rather than retune silently: the expected values are P(g ≥ ln 1.8 / 0.35 ≈ 1.68) ≈ 4.6% and P(g ≥ ln 0.9 / 0.35 ≈ −0.30) ≈ 62%.
- [ ] **Step 5: Commit** `feat(bombie): the Bombie's model and params`.

---

### Task 2: The mound in the seabed

**Files:**
- Modify:
  - `src/seabed/bathymetry.ts` (`bedHeightAt`);
  - `src/seabed/Seabed.ts` (`bedHeightNode`, plus a TSL `moundYNode`);
  - `src/seabed/bathymetry.test.ts`;
  - `src/seabed/seabed.selftest.ts` (the mound's points).

**Interfaces:**
- Consumes: Task 1's mound constants and `moundY`.
- Produces: `moundYNode(xz: N): N` (in `Seabed.ts`; −1e4 outside the oval).

- [ ] **Step 1: The test** (append to `bathymetry.test.ts`, using the file's existing `buildBathymetry()` fixture style):

```ts
import { BOMBIE_X, BOMBIE_Z, MOUND_CREST_Y, MOUND_HALF_X_M } from '../bombie/bombieModel';
describe('the Bombie’s mound (4c-3)', () => {
  const b = buildBathymetry();
  it('rises to 5 m below mean sea level outside the reef map, and leaves the bed alone beyond its oval', () => {
    expect(bedHeightAt(b, BOMBIE_X, BOMBIE_Z)).toBeCloseTo(MOUND_CREST_Y, 3);
    expect(bedHeightAt(b, BOMBIE_X + MOUND_HALF_X_M + 5, BOMBIE_Z)).toBeLessThan(-20);
    expect(bedHeightAt(b, BOMBIE_X + MOUND_HALF_X_M * 0.5, BOMBIE_Z)).toBeGreaterThan(bedHeightAt(b, BOMBIE_X + MOUND_HALF_X_M + 5, BOMBIE_Z));
  });
});
```

Run it. Expected: FAIL (the bed at the centre is about −25).

- [ ] **Step 2: Implement.** In `bedHeightAt`, outside the map:

```ts
  if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) bed = Math.max(-depthBg(x - shift), moundY(x, z));
```

(Import `moundY` from `../bombie/bombieModel`.) In `Seabed.ts`:

```ts
/** TSL mirror of bombieModel.moundY (−1e4 outside the oval). */
export function moundYNode(xz: N): N {
  const r = length(vec2(xz.x.sub(BOMBIE_X).div(MOUND_HALF_X_M), xz.y.sub(BOMBIE_Z).div(MOUND_HALF_Z_M)));
  return select(r.lessThan(1.0), float(MOUND_CREST_Y).add(float(MOUND_BASE_Y - MOUND_CREST_Y).mul(smoothstep(0.0, 1.0, r))), float(-1e4));
}
```

`bedHeightNode`'s outside branch becomes `max(depthBgNode(…).negate(), moundYNode(xz))`. Import `length` and `vec2` if missing. Add `[BOMBIE_X, BOMBIE_Z]`, `[BOMBIE_X + 12, BOMBIE_Z + 20]` and `[BOMBIE_X + 30, BOMBIE_Z]` to `POINTS` in `seabed.selftest.ts` (the ±3 cm GPU = CPU test).

- [ ] **Step 3: Run** `npx vitest run src/seabed` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(bombie): the mound in the seabed`.

---

### Task 3: The white-water mesh (GPU)

**Files:**
- Create: `src/bombie/BombieMesh.ts`, `src/bombie/bombie.selftest.ts`
- Modify: `src/dev/selfTests.ts`, `src/breaker/BreakingRibbon.limits.test.ts`

**Interfaces:**
- Consumes: `WaterSurfaceModel.displacement(xz, lod)`, `CASCADE_FADES` and `fadeWeightNode` (`ocean/cascadeFades.ts`), `EARTH_RADIUS_M` (`ocean/OceanSurface.ts`), `Seabed.tide`, Task 1's constants, and the sunlight map's `visibilityNode`.
- Produces:
  - `class BombieMesh`:
    - `constructor(model: WaterSurfaceModel, sky: Sky, sunVisibility?: (xz: N) => N)`;
    - `mesh: THREE.Mesh`;
    - `surfaceYNode(xz: N): N` (the sheet's height at undisplaced xz, for the self-test);
    - `show(burst: { ageS: number; widthM: number } | null)`.
  - `BOMBIE_GRID = { x0: −350, z0: 250, sizeM: 180, cells: 64 }`: covers the reef and the roll's 150 m toward the east-north-east.

- [ ] **Step 1: The limits test.** Add to the limits test's `describe` (next to 4c-2's plants):

```ts
    it('the Bombie stays within the limits', () => {
      const b = new BombieMesh(model, sky, (xz) => sunlight.visibilityNode(xz));
      const w = renderWgsl(b.mesh);
      console.log(`bombie: vertex sampled ${sampledTextures(w.vertex)} uniform ${uniformBuffers(w.vertex)} storage ${storageBindings(w.vertex)}, fragment sampled ${sampledTextures(w.fragment)} uniform ${uniformBuffers(w.fragment)}`);
      for (const stage of [w.vertex, w.fragment]) {
        expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
        expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
        expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
      }
    });
```

(Import `BombieMesh`. `model` and `sky` are the test's existing fixtures; `sunlight` is the one in the sheet's describe block, so put the test there.) Run it. Expected: FAIL (the module is missing).

- [ ] **Step 2: `BombieMesh.ts`:**

```ts
import * as THREE from 'three/webgpu';
import { PI, cameraPosition, clamp, float, length, max, mx_noise_float, positionLocal, positionWorld, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import { CASCADE_FADES, fadeWeightNode } from '../ocean/cascadeFades';
import { EARTH_RADIUS_M } from '../ocean/OceanSurface';
import type { WaterSurfaceModel } from '../ocean/waterSurface';
import type { Sky } from '../sky/Sky';
import { BOMBIE_X, BOMBIE_Z, BURST_GROW_S, BURST_LIFE_S, MOUND_HALF_X_M, ROLL_DIR, ROLL_SPEED_MS } from './bombieModel';

type N = any;

export const BOMBIE_GRID = { x0: -350, z0: 250, sizeM: 180, cells: 64 } as const;
const FOAM_ALBEDO = 0.8;

/**
 * The Bombie's white water (spec §3.3): a grid that rides the sea exactly as the ocean sheet's own vertices do (the same
 * displacement, distance fades, tide and curvature; lifted 5 cm), drawn transparent over it only during a burst: the burst
 * over the reef, the band rolling shoreward, the fade by 40 s.
 */
export class BombieMesh {
  readonly mesh: THREE.Mesh;
  private readonly age = uniform(0);
  private readonly width = uniform(30);
  private readonly model: WaterSurfaceModel;

  constructor(model: WaterSurfaceModel, sky: Sky, sunVisibility?: (xz: N) => N) {
    this.model = model;
    const n = BOMBIE_GRID.cells, s = BOMBIE_GRID.sizeM;
    const g = new THREE.PlaneGeometry(s, s, n, n);
    g.rotateX(-Math.PI / 2); // y-up, local x ∈ [−s/2, s/2], z ∈ [−s/2, s/2]; normals up, front faces up
    g.translate(BOMBIE_GRID.x0 + s / 2, 0, BOMBIE_GRID.z0 + s / 2);
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.side = THREE.FrontSide;
    const xz: N = positionLocal.xz;
    m.positionNode = vec3(xz.x, 0.0, xz.y).add(this.surfaceOffsetNode(xz));

    // Coverage in the burst's frame: u along the roll (east-north-east), v across (along the crests).
    const p: N = positionWorld.xz;
    const d = p.sub(vec2(BOMBIE_X, BOMBIE_Z));
    const u = d.x.mul(ROLL_DIR[0]).add(d.y.mul(ROLL_DIR[1]));
    const v = d.x.mul(-ROLL_DIR[1]).add(d.y.mul(ROLL_DIR[0]));
    const age = this.age, half = this.width.mul(0.5);
    const grow = smoothstep(0.0, BURST_GROW_S, age);
    // 1. The burst: an oval over the reef, full width in 3 s, then thinning to a patch that fades by 25 s.
    const burstR = length(vec2(u.div(max(half.mul(0.8).mul(grow), 0.5)), v.div(max(half.mul(grow), 0.5))));
    const burst = float(1.0).sub(smoothstep(0.7, 1.0, burstR)).mul(float(1.0).sub(smoothstep(BURST_GROW_S, 25.0, age).mul(0.8)));
    // 2. The roll: a band from the reef's inshore edge moving shoreward at 4 m/s, widening slightly, thinning and breaking up.
    const front = float(MOUND_HALF_X_M).add(max(age.sub(BURST_GROW_S), 0.0).mul(ROLL_SPEED_MS));
    const bandW = float(10.0).add(age.mul(0.3));
    const band = float(1.0).sub(smoothstep(0.0, bandW, u.sub(front).abs())).mul(float(1.0).sub(smoothstep(half.mul(1.1), half.mul(1.4), v.abs())));
    const roll = band.mul(smoothstep(BURST_GROW_S * 0.5, BURST_GROW_S, age)).mul(float(1.0).sub(smoothstep(10.0, BURST_LIFE_S, age)).mul(0.9));
    // 3. Break-up: two noise scales, the coarse one thinning the white water as it ages.
    const coarse = mx_noise_float(vec3(p.x.div(9.0), p.y.div(9.0), 3.7)).mul(0.5).add(0.5);
    const fine = mx_noise_float(vec3(p.x.div(2.2), p.y.div(2.2), 8.1)).mul(0.5).add(0.5);
    const breakup = smoothstep(age.div(BURST_LIFE_S).mul(0.6).add(0.2), age.div(BURST_LIFE_S).mul(0.6).add(0.45), coarse).mul(fine.mul(0.5).add(0.6));
    const cover = clamp(max(burst, roll).mul(breakup), 0.0, 1.0);

    const l = sky.sunDirection;
    const vis = sunVisibility ? sunVisibility(p) : float(1.0);
    const toCam = cameraPosition.sub(positionWorld), dist = length(toCam);
    const lit = sky.sunIlluminance.mul(vis).mul(max(l.y, 0.0)).add(sky.skyIrradiance).mul(FOAM_ALBEDO).div(PI);
    m.colorNode = sky.applyAerialPerspective(lit, dist, toCam.div(max(dist, 1e-3)).negate());
    m.opacityNode = cover.mul(0.95);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2; // after the sea (0) and the ribbon
    this.mesh.visible = false;
  }

  /**
   * The ocean sheet's own vertex offset at undisplaced world xz (OceanSurface: displacement, fades, tide, curvature) + 5 cm,
   * about a camera at camXZ (the render's camera; the self-test passes its own, a compute pass has none).
   */
  private surfaceOffsetNode(xz: N, camXZ: N = cameraPosition.xz): N {
    const radial = length(xz.sub(camXZ));
    const disp: N = this.model.displacement(xz, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry));
    return vec3(disp.x, this.model.seabed.tide.add(disp.y).sub(radial.mul(radial).div(2 * EARTH_RADIUS_M)).add(0.05), disp.z);
  }

  /** The sheet's height at undisplaced xz (the self-test compares it with the ocean's). */
  surfaceYNode(xz: N, camXZ?: N): N {
    return this.surfaceOffsetNode(xz, camXZ).y.sub(0.05);
  }

  show(burst: { ageS: number; widthM: number } | null): void {
    this.mesh.visible = burst !== null;
    if (burst) { this.age.value = burst.ageS; this.width.value = burst.widthM; }
  }
}
```

Two notes:
- **The camera position:** `cameraPosition.xz` in the vertex stage is the camera used by this render. The ocean's `cameraXZ` uniform is set from the same camera each frame, so the fades agree.
- **The ocean's swash lift** is zero here (490 m offshore), so it's omitted.

- [ ] **Step 3: The self-test** (`bombie.selftest.ts`). The mesh's surface height matches the ocean model's displacement + tide, recomputed independently, at six points on the grid:
  - the expected value is `model.seabed.tide.add(model.displacement(xz, lod).y)` minus the curvature drop;
  - the actual value is `BombieMesh.surfaceYNode(xz, cam)`;
  - both use the same stand-in camera position (a compute pass has no camera). The water model is built as `probe.selftest.ts` builds one.

```ts
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, uniform, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { SetWaves } from '../breaker/SetWaves';
import { CASCADE_FADES, fadeWeightNode } from '../ocean/cascadeFades';
import { OceanSimulation } from '../ocean/OceanSimulation';
import { EARTH_RADIUS_M } from '../ocean/OceanSurface';
import { WaterSurfaceModel } from '../ocean/waterSurface';
import { buildBathymetry } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { BombieMesh } from './BombieMesh';
import { BOMBIE_X, BOMBIE_Z } from './bombieModel';

registerSelfTest({
  name: 'bombie: the white water rides the ocean sheet (its height = the sheet’s at the same xz, ±1 mm)',
  async run(renderer) {
    const sim = new OceanSimulation();
    sim.update(renderer, 5, 1 / 60);
    const model = new WaterSurfaceModel(sim, new Seabed(buildBathymetry()), new SetWaves(sim.time));
    const b = new BombieMesh(model, new Sky(DEFAULT_ATMOSPHERE));
    const cam = uniform(new THREE.Vector2(-25, 45));
    const pts: [number, number][] = [[BOMBIE_X, BOMBIE_Z], [BOMBIE_X + 40, BOMBIE_Z - 20], [BOMBIE_X + 120, BOMBIE_Z - 50], [BOMBIE_X - 30, BOMBIE_Z + 60], [-200, 300], [-250, 400]];
    const n = pts.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly(), output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const xz = input.element(instanceIndex).xy;
      const radial = xz.sub(cam).length();
      const sheet = model.seabed.tide.add(model.displacement(xz, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry)).y).sub(radial.mul(radial).div(2 * EARTH_RADIUS_M));
      output.element(instanceIndex).assign(vec4(b.surfaceYNode(xz, cam), sheet, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(out[i * 4] - out[i * 4 + 1]));
    return { pass: worst <= 0.001, detail: `worst ${(worst * 1000).toFixed(2)} mm over ${n} points` };
  },
});
```

Register it: `import '../bombie/bombie.selftest';` in `src/dev/selfTests.ts`.

- [ ] **Step 4: Run** the limits test, the full suite, `npx tsc --noEmit`, and `/?selftest` (52/52). Commit `feat(bombie): the white-water mesh`.

---

### Task 4: The Bombie's spray

**Files:**
- Modify: `src/whitewater/sprayEmitters.ts`, `src/whitewater/sprayEmitters.test.ts`

**Interfaces:**
- Consumes: Task 1 (`burstAt`'s result, `burstWidthM`, `ROLL_DIR`, `BOMBIE_X`, `BOMBIE_Z`).
- Produces: `bombieImpactEmitters(burst: { n; ageS; heightM } | null, widthM: number, tideM: number, size: number): ImpactEmitter[]`.

- [ ] **Step 1: The test:**

```ts
import { BOMBIE_X, BOMBIE_Z } from '../bombie/bombieModel';
import { bombieImpactEmitters, impactBirths } from './sprayEmitters';
describe('the Bombie’s spray (4c-3)', () => {
  it('fires along the burst line for its first 1.5 s, sized by the wave and the size slider, and never after', () => {
    const b = { n: 40, ageS: 0.5, heightM: 3 };
    const e = bombieImpactEmitters(b, 30, 0, 1);
    expect(e.length).toBe(11); // a station every 3 m across 30 m
    for (const s of e) {
      expect(Math.hypot(s.x - BOMBIE_X, s.z - BOMBIE_Z)).toBeLessThanOrEqual(15.01);
      expect(s.H).toBeGreaterThanOrEqual(3);
      expect(s.H).toBeLessThanOrEqual(10);
    }
    expect(impactBirths(e, 1234).length).toBeGreaterThan(0);
    expect(bombieImpactEmitters({ ...b, ageS: 1.6 }, 30, 0, 1)).toEqual([]);
    expect(bombieImpactEmitters(null, 30, 0, 1)).toEqual([]);
    expect(bombieImpactEmitters(b, 30, 0, 2)[0].H).toBeGreaterThan(e[0].H);
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: Implement** (in `sprayEmitters.ts`):

```ts
import { BOMBIE_X, BOMBIE_Z, ROLL_DIR } from '../bombie/bombieModel';
/** The Bombie's burst (4c-3 §3.4): impact spray along the burst line across the reef for its first 1.5 s. */
export const BOMBIE_SPRAY_S = 1.5;
export function bombieImpactEmitters(burst: { n: number; ageS: number; heightM: number } | null, widthM: number, tideM: number, size: number): ImpactEmitter[] {
  if (!burst || burst.ageS < 0 || burst.ageS >= BOMBIE_SPRAY_S) return [];
  const out: ImpactEmitter[] = [];
  const count = Math.floor(widthM / SPRAY_SPACING_M) + 1;
  // Plumes 5–15 m: impactBirths rises 1.5 × H above the landing.
  const H = Math.min(10, Math.max(3, 2 * burst.heightM)) * size;
  for (let i = 0; i < count; i++) {
    const v = -widthM / 2 + i * SPRAY_SPACING_M;
    out.push({
      x: BOMBIE_X - ROLL_DIR[1] * v, y: tideM + 0.5, z: BOMBIE_Z + ROLL_DIR[0] * v,
      vx: ROLL_DIR[0] * 4, vz: ROLL_DIR[1] * 4, nx: ROLL_DIR[0], nz: ROLL_DIR[1],
      H, strength: Math.min(2, size), lip: 1, waveId: 0x40000 + burst.n, arc: i,
    });
  }
  return out;
}
```

The test's `H ≤ 10` holds at size 1. At size 2 the H is doubled (capped at 20): the slider scales the plume. The test only compares larger versus smaller at size 2.

- [ ] **Step 3: Run** `npx vitest run src/whitewater` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(bombie): the Bombie's spray`.

---

### Task 5: The Bombie in the App

**Files:**
- Modify:
  - `src/app/App.ts`;
  - `src/dev/devSettings.ts` (+test);
  - `src/dev/DevPanel.ts` (+test);
  - `src/dev/referenceMoments.ts` (+test).

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `App.bombieParams`;
  - the `bombie` look key;
  - `BOMBIE_BINDINGS`;
  - the two moments;
  - `App.bombieBurst` (the current burst, for dev readout).

- [ ] **Step 1: The tests.**
  - **`devSettings.test.ts`:** add `bombie: DEFAULT_BOMBIE_PARAMS` to its full-settings fixture, and a case "settings stored before Phase 4c-3 (no bombie) load the Bombie defaults", mirroring the file's existing `'settings stored before Phase 4b (no surf) load the surf defaults'` test with `bombie` in place of `surf`.
  - **`DevPanel.test.ts`:** `BOMBIE_BINDINGS.size` and `BOMBIE_BINDINGS.thresholdFt` match `BOMBIE_PARAM_RANGES`.
  - **`referenceMoments.test.ts`:**
    - add `'bombie-from-the-lineup'` and `'bombie-close'` to the full list and to the `viewOrSet` exclusion set;
    - both are `'view'`-kind;
    - `bombie-from-the-lineup` is lineup mode at size 8 ft, `bombie-close` free mode at size 10 ft.
  
  Run them. Expected: FAIL.
- [ ] **Step 2: Implement.**
  - **`devSettings.ts`:** a `bombie: BombieParams` field in `DevLookParams`, `'bombie'` in `LOOK_KEYS`, and the default in the defaults and the migration (as `surf`).
  - **`DevPanel.ts`:**
    - `BOMBIE_BINDINGS = { size: { label: 'bombie size', ...BOMBIE_PARAM_RANGES.size, step: 0.05 }, thresholdFt: { label: 'bombie threshold (ft)', ...BOMBIE_PARAM_RANGES.thresholdFt, step: 0.5 } }`;
    - a `Bombie` folder with `enabled` (label `bombie`) and the two bindings, calling a new handler `onBombie`.
  - **`referenceMoments.ts`:**

```ts
  viewAt('bombie-from-the-lineup', "08:15, 8 ft, from the Womb's lineup facing south-west: a Bombie burst 450 m out, spray blowing back out to sea on the offshore.",
    conditions({ swell: { sizeFt: 8 } }), lineup(223, 1), BOMBIE_LINEUP_SIM_S),
  viewAt('bombie-close', '10 ft, from 30 m up and 120 m inshore of the Bombie: the burst over the reef, the white water rolling toward shore.',
    conditions({ swell: { sizeFt: 10 } }), { mode: 'free', position: [-180, 30, 330], yawDeg: 270, pitchDeg: -10 }, BOMBIE_CLOSE_SIM_S),
```

  with a view-kind helper beside `setMoment`:

```ts
const viewAt = (name: string, description: string, c: Conditions, camera: CameraPose, simTime: number): ReferenceMoment => ({
  name, description, kind: 'view', moment: { conditions: c, camera, simTime, paused: true },
});
/** Sim times just after a Bombie break at these moments' conditions (found in the browser, Task 5 Step 4; ledgered). */
const BOMBIE_LINEUP_SIM_S = REFERENCE_SIM_TIME;
const BOMBIE_CLOSE_SIM_S = REFERENCE_SIM_TIME;
```

  The two constants start at `REFERENCE_SIM_TIME` and get their real values in Step 4:
  1. apply the moment;
  2. step `app.clock.setTime(t)` in 1 s steps from 120 s, reading `app.bombieBurst`;
  3. take the first break;
  4. set the constant to that break + 4 s (lineup) or + 3 s (close).
  
  Ledger the times. The field's τ_B isn't available to unit tests, which is why the times come from the browser.
  - **`App.ts`:**
    - **Fields:**
      - `readonly bombieParams: BombieParams = { ...DEFAULT_BOMBIE_PARAMS }`;
      - `readonly bombie: BombieMesh` (constructed after the ocean surface, with `this.surfaceModel`, `this.sky`, and the sunlight map's visibility);
      - `this.scene.add(this.bombie.mesh)`;
      - `private bombieTauS: number | null = null` and `private bombieTauField: ReefField | null = null`;
      - `bombieBurst: { n: number; ageS: number; heightM: number } | null = null`.
    - **The waves helper:**

```ts
  /** The Bombie's waves now (4c-3 §3.2), or null while the reef field is missing (Review Focus 1). */
  private bombieWaves(t: number): BombieWaves | null {
    if (!this.bombieParams.enabled || !this.field) return null;
    if (this.bombieTauField !== this.field) { this.bombieTauS = sampleField(this.field, BOMBIE_X, BOMBIE_Z).tau; this.bombieTauField = this.field; } // Review Focus 3
    const T = this.conditions.swell.periodS;
    const setIndices = new Set(wavesBetween(t - BURST_LIFE_S - 2 * T, t + T, this.conditions, this.setParams).map((e) => Math.round(e.arrivalS / T)));
    return { tauS: this.bombieTauS!, periodS: T, hs: surferFeetToHs(this.conditions.swell.sizeFt), thresholdHs: surferFeetToHs(this.bombieParams.thresholdFt), seed: this.conditions.seed, setIndices };
  }
```

    - **Each frame** (after the surf update):

```ts
    this.bombieBurst = burstAt(this.clock.simTime, this.bombieWaves(this.clock.simTime));
    const bw = this.bombieBurst ? burstWidthM(this.bombieBurst.heightM, surferFeetToHs(this.bombieParams.thresholdFt), this.bombieParams.size) : 0;
    this.bombie.show(this.bombieBurst && !this.underwater ? { ageS: this.bombieBurst.ageS, widthM: bw } : null);
```

    - **In `emittersAt(k)`,** after `breakEmitters`:

```ts
      const bb = burstAt(t, this.bombieWaves(t));
      e.impact.push(...bombieImpactEmitters(bb, bb ? burstWidthM(bb.heightM, surferFeetToHs(this.bombieParams.thresholdFt), this.bombieParams.size) : 0, this.conditions.tideM, this.bombieParams.size));
```

    - **The params:** `onBombie: () => { normalizeBombieParams(this.bombieParams); this.panel.refresh(); }`. Also add `bombie: this.bombieParams` to the panel's model and to the look object (as `surf`), `assignParams(this.bombieParams, look.bombie)` in `restoreLook`, and `normalizeBombieParams` in `applyAllParams`.
- [ ] **Step 3: Run** the full suite and `npx tsc --noEmit`. Expected: green.
- [ ] **Step 4: In the browser** (pane visible):
  - **`bombie-from-the-lineup`:** a burst in the south-west, with spray; ledger `bombieBurst`.
  - **Scrub the sim time back and forward across a break** (Review Focus 2): the burst follows, with no stale mesh.
  - **Change the swell period** (Review Focus 3): new τ_B, bursts continue.
  - **Threshold 10 at 8 ft:** no bursts. Threshold 4: more bursts.
  - **Underwater:** hidden.
  - **The Womb's sets:** no Bombie burst at the same time.
  - **The console:** no errors.
- [ ] **Step 5: Commit** `feat(bombie): the Bombie in the App: folder, moments, spray`.

---

### Task 6: Measure, gallery, docs

- [ ] **Step 1: Measure** (fenced GPU, median of 60 frames, the mesh shown versus hidden during a burst at `bombie-close` and `bombie-from-the-lineup`; the CPU `bombieWaves` + `burstAt` per frame). Ledger against the Global Constraints.
- [ ] **Step 2: Gallery** (`docs/superpowers/gallery/phase-4/bombie/`, via the shot server with its `OUT` set to that folder):
  - `01-bombie-from-the-lineup.png`;
  - `02-the-roll.png`: the same moment, 15 s later;
  - `03-bombie-close.png`;
  - `04-overhead.png`: free camera 250 m above (−250, 330), looking down, noon, the dark reef;
  - `05-small-day.png`: `bombie-from-the-lineup` at 4 ft, nothing there;
  - `00-sheet.png`.
- [ ] **Step 3: Docs.** The gallery README (shots, measured cost, tuning points), and the spec's Status and §8 as built.
- [ ] **Step 4:** Full suite, typecheck, `/?selftest`. Commit `docs(bombie): gallery, measured cost, as-built notes` and push. **Do not merge.**
