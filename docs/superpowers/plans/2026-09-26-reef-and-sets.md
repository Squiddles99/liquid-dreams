# Phase 1 "Reef & Sets" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At the end of this phase you sit in deep water just south-west of the Womb's peak and look down at the limestone reef and turquoise sand pockets below you. Every 10–20 minutes a set of 4–8 waves arrives from the south-west, slows, bends around the wedge and stands up on the ledge (without breaking yet), then fades over the shallow shelf.

**Architecture:** Three new modules extend the Phase 0 app.
- `seabed/` builds the Womb's bathymetry once from named features. It serves CPU depth queries and a half-float GPU texture.
- `swell/` is a pure, seeded set timeline.
- `breaker/` computes a reef wave field in a Web Worker: arrival time from an eikonal solve, amplification from energy-flux transport, and the shallowest depth met so far. It also holds the set-wave model, written once in TypeScript (tested) and mirrored in TSL.

The water surface becomes the Phase 0 FFT ocean (long swell faded over shallow water) plus the set waves, riding on the tide. The water shader ray-marches the seabed through the refracted view ray and blends it with the deep-water colour by the light's path length.

**Tech Stack:** TypeScript 7.0.2, Vite 8.3.1 (module Web Workers), Vitest 5.0.2, three 0.186.1 (`three/webgpu`, `three/tsl`), Tweakpane 4.0.5, stats-gl 4.2.3.

**Spec:** `docs/superpowers/specs/2026-09-26-reef-and-sets-design.md` (approved by Andrew 2026-09-26). The vision and architecture spec `docs/superpowers/specs/2026-09-25-liquid-dreams-first-light-design.md` still governs world conventions.

## Global Constraints

- Versions stay exactly as pinned in `package.json`. Add no new dependencies.
- WebGPU only.
- Units: metres, seconds, and degrees at interfaces (Conditions, links, poses, set events); radians internally.
- World axes: **+X = east, +Y = up, +Z = south** (north is −Z). The origin is **the Womb's peak at −33.895216, 114.983359** (corrected in Task 1). y = 0 is mean sea level; the mean water surface sits at y = `Conditions.tideM`.
- Directions in `Conditions` and in set events are the direction the swell **comes from**, in degrees true. Travel direction = `travelDirectionXZ(fromDeg)` from `src/conditions/directions.ts`.
- Surfer feet stay the canonical swell unit; `surferFeetToHs` (Hs = 0.4 m × ft) is unchanged in Phase 1.
- Defaults are unchanged: date `2026-07-15`, time 8.25 h, swell 4 ft / 15 s / from 225°, wind 3 m/s from 80°, tide 0, seed 2002.
- **The reef is the place, not a random process.** Its noise uses the fixed constant `REEF_SEED = 1905`, never `Conditions.seed`. Sets and the ocean use `Conditions.seed`.
- Determinism: the same conditions, tuning parameters and sim time give the same sea, sets and field.
- GPU texture rules:
  - Hardware-filtered textures are `HalfFloatType`.
  - Float32 data (the wave field) is read with `textureLoad` plus manual bilinear interpolation, because `float32-filterable` is not guaranteed.
- TSL files use a local `type N = any;` alias. If `@types/three` rejects a valid call, cast only that expression and add a `// three typings gap` comment.
- **One GPU copy at a time.** Before any in-browser check (`?selftest`, screenshots), the controller asks Andrew to close his localhost tab and closes the browser pane afterwards. Implementers do not open browsers; they report GPU checks as pending for the controller.
- Performance: 60 fps (the Phase 0 cap). GPU ≤ 3 ms per frame on the RTX 4060 Laptop GPU.
- `reference/` is git-ignored and must never be committed.
- Commit after every task. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Swell from the land or along the coast.** Sanitize allows 0–360°, e.g. from 90° (east) or 0° (north). The field solver must stay finite with no NaN or Infinity, and the set waves must fade gracefully. Pinned by `unusual swell directions stay finite` in Task 6.
2. **Extreme but valid swell at low tide** (12 ft, 25 s, tide −1.5 m). Set-wave heights stay under the depth cap, the surface never folds, and nothing goes NaN. Pinned by `extreme waves in shallow water never fold` in Task 7.
3. **Dry reef at low tide.** Where depth ≤ 0, dispersion and the field must not produce NaN, and waves must vanish there. Pinned by `dry cells stay finite` in Task 5 and `extreme tide stays finite` in Task 6.
4. **Huge sim times from moment links** (1e7 s). The set timeline must answer in O(1) without looping from zero. Pinned by `answers instantly at huge times` in Task 4.
5. **Dragging tide, period or direction sliders.** A slow worker result for old settings must never overwrite a newer one. Pinned by `LatestOnly ignores stale replies` in Task 7.

## Plan-level rulings (refinements of the approved spec; the spec is updated in the same commit as this plan)

- **R1, outside the map:** depth outside the reef map is a continuous 1D coast profile. It deepens to 30 m at the map's west edge and is a 0.5 m flat landward of the waterline. This replaces "blend to uniform 30 m within 50 m of the edges". It lets the far-field waves use an exact 1D Snell solution that matches the field at every edge, so no blending band is needed.
- **R2, set timing:** the set start jitter is ±150 s, so consecutive sets are 10–20 min apart as agreed. The spec's "±5 min" would give 5–25 min.
- **R3, active waves:** up to **12** waves are active at once. A whole 8-wave set fits inside the ~360 s travel window, plus strays.
- **R4, no field cross-fade:** a new field replaces the old immediately. The field only changes on dev edits, and tide is static within a moment in Phase 1.
- **R5, tide slider range:** the tide slider spans sanitize's ±1.5 m, because every panel range must contain the sanitize range (Phase 0 final-review rule).
- **R6, arrival times:** arrival times are normalised so τ(peak) = 0. A set event's `arrivalS` is the moment its crest reaches the peak, at any tide.
- **R7, the "reduces to Phase 0" check:** this check (spec §9.3) is a unit test on the pure `waterColumn` mirror, plus a GPU self-test that the shader's seabed march matches the CPU march. The blend formula itself is one line, identical in both.

---

## File Structure

```
src/
  conditions/
    defaults.ts            MODIFY: WOMB_LOCATION corrected
    sanitize.ts            MODIFY: tideM range in CONDITION_RANGES
  seabed/
    noise.ts (+test)       seeded value noise + fBm (pure)
    coastProfile.ts (+test) 1D offshore depth profile depthBg(x) used inside and outside the map
    wombReef.ts            REEF_GRID, REEF_SEED, ReefParams defaults, ledge polylines, traced sand pockets
    bathymetry.ts (+test)  buildBathymetry(): bed heights + material weights; bilinear CPU queries; 1 m downsample
    Seabed.ts              GPU texture (RGBA half: bed, sand, weed), tide uniform, TSL depth/material nodes
    seabed.selftest.ts     GPU texture matches CPU
    seabedShading.ts       TSL: refract, ray-march, bed lighting, water-column blend
    waterColumn.ts (+test) pure mirror: attenuation, blend, CPU seabed march
    seabedShading.selftest.ts  GPU march matches CPU march
  swell/
    sets.ts (+test)        SetParams, WaveEvent, slot timeline, wavesNear, nextSetArrivalS, callSetTime
  breaker/
    dispersion.ts (+test)  waveNumber, phaseSpeed, groupSpeed
    eikonal.ts (+test)     fast-sweeping |∇τ| = s(x)
    coastFarField.ts (+test) exact 1D Snell solution over depthBg(x): τ1, K1 table
    reefField.ts (+test)   computeReefField(): τ (normalised), K, hmin, k, direction; upwind transport
    LatestOnly.ts (+test)  request-id guard for worker replies
    fieldWorker.ts         Web Worker entry (thin)
    ReefFieldClient.ts     posts requests, resolves latest reply
    setWaveModel.ts (+test) pure set-wave math (profile, cap, taper, displacement, slopes)
    SetWaves.ts            GPU: field textures, far-field table, wave uniforms, TSL setWaveAt()
    breaker.selftest.ts    field textures and set-wave height match CPU
  ocean/
    spectrum.ts            MODIFY: backgroundSwellFactor
    OceanSurface.ts        MODIFY: tide, set waves, long-swell depth fade, seabed shading inputs
    HeightProbe.ts         MODIFY: same water height function as the surface
    waterShading.ts        MODIFY: finite-depth water column, debug overlays
  dev/
    DevPanel.ts            MODIFY: tide binding, Sets and Reef folders, set readout, call-set button
    hotkeys.ts             MODIFY: N = call a set now
    referenceMoments.ts    MODIFY: new lineup spot, set-driven moments
    selfTests.ts           MODIFY: import new self-tests
  app/App.ts               MODIFY: seabed, field client, set waves, per-frame wave upload
```

---

### Task 1: Groundwork (corrected origin, tide binding, new lineup spot)

**Files:**
- Modify: `src/conditions/defaults.ts:3`
- Modify: `src/conditions/sanitize.ts` (CONDITION_RANGES, sanitizeConditions)
- Modify: `src/dev/DevPanel.ts` (CONDITION_BINDINGS, Moment folder)
- Modify: `src/dev/DevPanel.test.ts` (values record)
- Modify: `src/dev/referenceMoments.ts:11-12`
- Test: `src/conditions/sanitize.test.ts`

**Interfaces:**
- Produces: `WOMB_LOCATION = { latDeg: -33.895216, lonDeg: 114.983359 }`; `CONDITION_RANGES.tideM = { min: -1.5, max: 1.5 }`; `CONDITION_BINDINGS.tideM`; `DEFAULT_LINEUP_POSITION = [-25, 0.8, 45]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/conditions/sanitize.test.ts`:

```ts
describe('tide', () => {
  it('is clamped to the published tide range', () => {
    expect(CONDITION_RANGES.tideM).toEqual({ min: -1.5, max: 1.5 });
    expect(sanitizeConditions({ ...DEFAULT_CONDITIONS, tideM: 9 }).tideM).toBe(1.5);
    expect(sanitizeConditions({ ...DEFAULT_CONDITIONS, tideM: -9 }).tideM).toBe(-1.5);
    expect(sanitizeConditions({ ...DEFAULT_CONDITIONS, tideM: 0.37 }).tideM).toBe(0.37);
  });
});
```

(Add `CONDITION_RANGES` to the file's import from `./sanitize` if it is not already imported, and `DEFAULT_CONDITIONS` from `./defaults`.)

In `src/dev/DevPanel.test.ts`, replace the `values` record and the sanitize call in the last test with:

```ts
      const c = sanitizeConditions({ ...DEFAULT_CONDITIONS, timeOfDay: v, tideM: v, swell: { sizeFt: v, periodS: v, directionDeg: v }, wind: { speedMs: v, directionDeg: v } });
      const values: Record<keyof typeof CONDITION_RANGES, number> = {
        timeOfDay: c.timeOfDay, swellSizeFt: c.swell.sizeFt, swellPeriodS: c.swell.periodS,
        swellDirectionDeg: c.swell.directionDeg, windSpeedMs: c.wind.speedMs, windDirectionDeg: c.wind.directionDeg,
        tideM: c.tideM,
      };
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/conditions/sanitize.test.ts src/dev/DevPanel.test.ts`
Expected: FAIL. `CONDITION_RANGES.tideM` is undefined, and the TypeScript record has an extra key.

- [ ] **Step 3: Implement**

`src/conditions/defaults.ts` line 3:

```ts
/** The Womb's peak (corrected by Andrew on 2026-09-26 from satellite references; ~190 m off the beach). */
export const WOMB_LOCATION = { latDeg: -33.895216, lonDeg: 114.983359 } as const;
```

`src/conditions/sanitize.ts`: add to `CONDITION_RANGES` (after `windDirectionDeg`):

```ts
  tideM: { min: -1.5, max: 1.5 },
```

and in `sanitizeConditions` replace the tide line with:

```ts
    tideM: clampTo(num(o.tideM, d.tideM), R.tideM),
```

`src/dev/DevPanel.ts`: add to `CONDITION_BINDINGS`:

```ts
  tideM: { label: 'tide (m)', ...CONDITION_RANGES.tideM, format: fixed(2) },
```

and in the constructor, after the `timeOfDay` binding in the Moment folder:

```ts
    moment.addBinding(m.conditions, 'tideM', CONDITION_BINDINGS.tideM).on('change', h.onConditions);
```

`src/dev/referenceMoments.ts` lines 11–12:

```ts
/** In the deep water just south-west of the peak, where Andrew waits for sets (outside the right's closeout). */
export const DEFAULT_LINEUP_POSITION: [number, number, number] = [-25, 0.8, 45];
```

- [ ] **Step 4: Run all tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: every test passes (sun-position tests have tolerances far larger than the 225 m shift); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: correct the Womb's origin, add the tide control, move the lineup south-west of the peak

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reef bathymetry (noise, coast profile, the wedge)

**Files:**
- Create: `src/seabed/noise.ts`, `src/seabed/noise.test.ts`
- Create: `src/seabed/coastProfile.ts`, `src/seabed/coastProfile.test.ts`
- Create: `src/seabed/wombReef.ts`
- Create: `src/seabed/bathymetry.ts`, `src/seabed/bathymetry.test.ts`

**Interfaces:**
- Produces:
  - `valueNoise2(x: number, z: number, seed: number): number` in [−1, 1]; `fbm2(x, z, seed, octaves = 4): number` in about [−1, 1].
  - `depthBg(x: number): number`, the still-water depth (m, ≥ 0) of the reef-free 1D coast profile. Also `SHORE_X = 190`, `FAR_DEPTH_M = 30`, `SHORE_FLAT_DEPTH_M = 0.5`.
  - `interface GridSpec { x0: number; z0: number; cellM: number; nx: number; nz: number }`; `REEF_GRID: GridSpec` (x0 −400, z0 −450, cell 0.5, 1300 × 1500); `REEF_SEED = 1905`.
  - `interface ReefParams { deepDepthM; ledgeDepthM; ledgeWidthM; shelfDepthM; headReliefM; minDepthM; pocketDepthM }` and `DEFAULT_REEF_PARAMS`.
  - `interface Bathymetry { grid: GridSpec; bed: Float32Array /* seabed height y (m, negative below MSL) */; sand: Float32Array; weed: Float32Array }`.
  - `buildBathymetry(p?: ReefParams, grid?: GridSpec): Bathymetry`.
  - `bedHeightAt(b: Bathymetry, x: number, z: number): number`, bilinear inside the map and `-depthBg(x)` outside.
  - `downsample(b: Bathymetry, factor: number): Bathymetry`.

The reef is authored as geometry in metres around the peak, traced from `reference/place/womb-correct-*.webp`:
- **North ledge:** the tip (0,0) running north-north-west.
- **South ledge:** the tip running south-east about 40 m.
- **Shelf:** the polygon they bound with the inner platform edge at x = 110.
- **Sand pockets:** traced as ellipses.

Along both ledges the still-water depth is exactly `ledgeDepthM` (6 m): Andrew's take-off depth. Outside, it falls to the coast profile over `ledgeWidthM`; inside, it settles to the shelf over 20 m.

- [ ] **Step 1: Write the failing tests**

`src/seabed/noise.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fbm2, valueNoise2 } from './noise';

describe('seeded noise', () => {
  it('is deterministic and seed-dependent', () => {
    expect(valueNoise2(12.3, -4.5, 7)).toBe(valueNoise2(12.3, -4.5, 7));
    expect(valueNoise2(12.3, -4.5, 7)).not.toBe(valueNoise2(12.3, -4.5, 8));
  });
  it('stays in range and is continuous', () => {
    let prev = valueNoise2(0, 0, 1);
    for (let i = 1; i <= 2000; i++) {
      const v = valueNoise2(i * 0.01, 3.3, 1);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });
  it('fbm stays roughly within [-1, 1]', () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm2(i * 1.7, i * -0.9, 3);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    }
  });
});
```

`src/seabed/coastProfile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FAR_DEPTH_M, SHORE_FLAT_DEPTH_M, SHORE_X, depthBg } from './coastProfile';

describe('1D coast profile', () => {
  it('is 13 m around the reef, 30 m at the west edge and beyond, and a shallow flat landward', () => {
    expect(depthBg(0)).toBeCloseTo(13, 5);
    expect(depthBg(-400)).toBeCloseTo(FAR_DEPTH_M, 5);
    expect(depthBg(-5000)).toBe(FAR_DEPTH_M);
    expect(depthBg(SHORE_X + 10)).toBe(SHORE_FLAT_DEPTH_M);
  });
  it('never gets deeper moving shoreward (east)', () => {
    let prev = depthBg(-1000);
    for (let x = -1000; x <= 400; x += 0.5) {
      const d = depthBg(x);
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
    }
  });
});
```

`src/seabed/bathymetry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { depthBg } from './coastProfile';
import { bedHeightAt, buildBathymetry, downsample } from './bathymetry';
import { DEFAULT_REEF_PARAMS, NORTH_LEDGE, REEF_GRID, SOUTH_LEDGE } from './wombReef';

const bathy = buildBathymetry();
const depth = (x: number, z: number) => -bedHeightAt(bathy, x, z);

describe('the Womb reef', () => {
  it('builds the full grid, deterministically', () => {
    expect(bathy.bed.length).toBe(REEF_GRID.nx * REEF_GRID.nz);
    const again = buildBathymetry();
    expect(again.bed[123456]).toBe(bathy.bed[123456]);
    expect(again.sand[654321]).toBe(bathy.sand[654321]);
  });
  it('is 6 m deep at the take-off corner (Andrew)', () => {
    expect(depth(0, 0)).toBeCloseTo(DEFAULT_REEF_PARAMS.ledgeDepthM, 1);
  });
  it('holds ledge depth along both ledges', () => {
    for (const [x, z] of [...NORTH_LEDGE.slice(0, 3), ...SOUTH_LEDGE.slice(0, 2)]) {
      expect(depth(x, z)).toBeGreaterThan(DEFAULT_REEF_PARAMS.ledgeDepthM - 1.5);
      expect(depth(x, z)).toBeLessThan(DEFAULT_REEF_PARAMS.ledgeDepthM + 1.5);
    }
  });
  it('drops to deep water just seaward of the ledges and to the south-west', () => {
    expect(depth(-30, 0)).toBeGreaterThan(11);
    expect(depth(-20, 40)).toBeGreaterThan(11);
  });
  it('is shallower on the shelf than at the ledge, never shallower than the minimum', () => {
    let sum = 0, n = 0;
    for (let x = 0; x <= 80; x += 5) for (let z = -200; z <= -40; z += 5) {
      const d = depth(x, z);
      expect(d).toBeGreaterThanOrEqual(DEFAULT_REEF_PARAMS.minDepthM - 1e-6);
      sum += d; n++;
    }
    expect(sum / n).toBeLessThan(DEFAULT_REEF_PARAMS.ledgeDepthM);
  });
  it('has sand pockets and reef on the shelf, sand in the deep', () => {
    let sandy = 0, rocky = 0;
    for (let x = 0; x <= 80; x += 2) for (let z = -200; z <= -20; z += 2) {
      const i = Math.round((z - REEF_GRID.z0) / REEF_GRID.cellM) * REEF_GRID.nx + Math.round((x - REEF_GRID.x0) / REEF_GRID.cellM);
      if (bathy.sand[i] > 0.5) sandy++; else rocky++;
    }
    expect(sandy).toBeGreaterThan(20);
    expect(rocky).toBeGreaterThan(sandy);
    const deepI = Math.round((100 - REEF_GRID.z0) / REEF_GRID.cellM) * REEF_GRID.nx + Math.round((-300 - REEF_GRID.x0) / REEF_GRID.cellM);
    expect(bathy.sand[deepI]).toBeGreaterThan(0.9);
  });
  it('matches the coast profile at and beyond the map edges (continuity for the far field)', () => {
    for (const z of [-449, 299]) for (const x of [-399, -200, 0, 150]) {
      expect(depth(x, z)).toBeCloseTo(depthBg(x), 1);
    }
    expect(depth(-1000, 0)).toBe(depthBg(-1000));
  });
  it('downsamples by averaging', () => {
    const d = downsample(bathy, 2);
    expect(d.grid.nx).toBe(REEF_GRID.nx / 2);
    expect(d.grid.cellM).toBe(1);
    const i = 300 * d.grid.nx + 400;
    const src = (r: number, c: number) => bathy.bed[r * REEF_GRID.nx + c];
    expect(d.bed[i]).toBeCloseTo((src(600, 800) + src(600, 801) + src(601, 800) + src(601, 801)) / 4, 5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/seabed`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/seabed/noise.ts`:

```ts
/** Integer hash → [0, 1). Deterministic across platforms (32-bit integer maths only). */
function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise in [−1, 1] with unit feature size. */
export function valueNoise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = fade(x - ix), fz = fade(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx, bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fz) * 2 - 1;
}

/** Fractal sum of value noise, normalised so the result stays within [−1, 1]. */
export function fbm2(x: number, z: number, seed: number, octaves = 4): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * f, z * f, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}
```

`src/seabed/coastProfile.ts`:

```ts
/** Beach waterline, metres east of the peak (Andrew measured 189–192 m). */
export const SHORE_X = 190;
/** Depth where the map meets the open sea to the west, and everywhere further out. */
export const FAR_DEPTH_M = 30;
/** Landward of the waterline there is no land yet (Phase 4): a shallow flat stands in for it. */
export const SHORE_FLAT_DEPTH_M = 0.5;
/** Deep water around the reef, before the shelf (Claude's estimate; tunable through the reef params). */
export const REEF_SURROUND_DEPTH_M = 13;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Still-water depth (m) of the reef-free coast as a function of x only (the coast runs north–south).
 * Offshore distance s = SHORE_X − x. Monotonic: never deepens shoreward. Used inside the map as the
 * background the reef sits on, and outside it everywhere, so the far field matches the map at its edges.
 */
export function depthBg(x: number): number {
  const s = SHORE_X - x;
  if (s <= 0) return SHORE_FLAT_DEPTH_M;
  if (s < 30) return SHORE_FLAT_DEPTH_M + (1.5 - SHORE_FLAT_DEPTH_M) * smooth(0, 30, s);
  if (s < 140) return 1.5 + (REEF_SURROUND_DEPTH_M - 1.5) * smooth(30, 140, s);
  if (s < 260) return REEF_SURROUND_DEPTH_M;
  if (s < 590) return REEF_SURROUND_DEPTH_M + (FAR_DEPTH_M - REEF_SURROUND_DEPTH_M) * smooth(260, 590, s);
  return FAR_DEPTH_M;
}
```

`src/seabed/wombReef.ts`:

```ts
export interface GridSpec {
  /** World x (m) of column 0's cell centre. */
  x0: number;
  /** World z (m) of row 0's cell centre. */
  z0: number;
  cellM: number;
  nx: number;
  nz: number;
}

/** The reef map: x ∈ [−400, +250), z ∈ [−450, +300) around the peak, 0.5 m cells. */
export const REEF_GRID: GridSpec = { x0: -400, z0: -450, cellM: 0.5, nx: 1300, nz: 1500 };

/** The reef is the place, not a random process: a fixed seed, never Conditions.seed. */
export const REEF_SEED = 1905;

export interface ReefParams {
  /** Depth just outside the ledges (the coast profile is 13 m there; this can deepen it locally). */
  deepDepthM: number;
  /** Still-water depth along both ledges and at the take-off corner (Andrew: about 6 m / 20 ft). */
  ledgeDepthM: number;
  /** Horizontal distance over which the seabed rises from deep water to the ledge. */
  ledgeWidthM: number;
  /** Base depth of the shelf interior. */
  shelfDepthM: number;
  /** How far reef heads rise above the shelf base. */
  headReliefM: number;
  /** Nothing on the shelf is shallower than this at mid tide. */
  minDepthM: number;
  /** Floor depth of the sand pockets. */
  pocketDepthM: number;
}

export const DEFAULT_REEF_PARAMS: ReefParams = {
  deepDepthM: 13,
  ledgeDepthM: 6,
  ledgeWidthM: 15,
  shelfDepthM: 4,
  headReliefM: 2.5,
  minDepthM: 1.5,
  pocketDepthM: 5.5,
};

type Pt = readonly [number, number];

/** Seaward edge running north-north-west from the tip (the left peels along it). World x, z (m). */
export const NORTH_LEDGE: readonly Pt[] = [[0, 0], [-30, -60], [-70, -130], [-100, -200], [-110, -260], [-118, -450]];
/** Short edge running south-east from the tip (the right closes out along it). */
export const SOUTH_LEDGE: readonly Pt[] = [[0, 0], [25, 28], [60, 38], [110, 45]];
/** Shelf polygon (clockwise in plan view): tip → south ledge → inner-platform edge → north map edge → north ledge. */
export const SHELF_POLYGON: readonly Pt[] = [
  [0, 0], [25, 28], [60, 38], [110, 45], [110, -450], [-118, -450], [-110, -260], [-100, -200], [-70, -130], [-30, -60],
];
/** Major turquoise sand pockets traced from the corrected satellite images: [cx, cz, rx, rz]. */
export const SAND_POCKETS: readonly (readonly [number, number, number, number])[] = [
  [20, -40, 18, 10], [-40, -150, 22, 12], [50, -110, 26, 14], [70, -200, 24, 12], [-60, -230, 17, 10], [62, 17, 17, 8],
];
```

`src/seabed/bathymetry.ts`:

```ts
import { REEF_SURROUND_DEPTH_M, depthBg } from './coastProfile';
import { fbm2 } from './noise';
import { DEFAULT_REEF_PARAMS, type GridSpec, NORTH_LEDGE, REEF_GRID, REEF_SEED, type ReefParams, SAND_POCKETS, SHELF_POLYGON, SOUTH_LEDGE } from './wombReef';

export interface Bathymetry {
  grid: GridSpec;
  /** Seabed height y (m); negative below mean sea level. Row-major: index = row·nx + col, row ↔ z. */
  bed: Float32Array;
  /** Sand weight [0, 1]. */
  sand: Float32Array;
  /** Weed/kelp weight [0, 1] (reef = 1 − sand − weed). */
  weed: Float32Array;
}

type Pt = readonly [number, number];

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function segmentDistance(px: number, pz: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.min(1, Math.max(0, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

function insidePolygon(px: number, pz: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance to the ledge lines (positive inside the shelf, negative outside). Only the ledges count as edges. */
function ledgeSignedDistance(x: number, z: number): number {
  let d = Infinity;
  for (const line of [NORTH_LEDGE, SOUTH_LEDGE]) {
    for (let i = 0; i + 1 < line.length; i++) d = Math.min(d, segmentDistance(x, z, line[i], line[i + 1]));
  }
  return insidePolygon(x, z, SHELF_POLYGON) ? d : -d;
}

function pocketWeight(x: number, z: number): number {
  let w = 0;
  for (const [cx, cz, rx, rz] of SAND_POCKETS) {
    const r = Math.hypot((x - cx) / rx, (z - cz) / rz);
    w = Math.max(w, 1 - smooth(0.7, 1.1, r));
  }
  return w;
}

const SDF_CELL_M = 2;

/**
 * Build the Womb's seabed. The signed distance to the ledges is computed on a coarse 2 m lattice and
 * interpolated (it is smooth), which keeps the full 0.5 m build well under a second.
 */
export function buildBathymetry(p: ReefParams = DEFAULT_REEF_PARAMS, grid: GridSpec = REEF_GRID): Bathymetry {
  const n = grid.nx * grid.nz;
  const bed = new Float32Array(n), sand = new Float32Array(n), weed = new Float32Array(n);

  const x1 = grid.x0 + (grid.nx - 1) * grid.cellM, z1 = grid.z0 + (grid.nz - 1) * grid.cellM;
  const sx = Math.ceil((x1 - grid.x0) / SDF_CELL_M) + 2, sz = Math.ceil((z1 - grid.z0) / SDF_CELL_M) + 2;
  const sdf = new Float32Array(sx * sz), pockets = new Float32Array(sx * sz);
  for (let r = 0; r < sz; r++) for (let c = 0; c < sx; c++) {
    const x = grid.x0 + c * SDF_CELL_M, z = grid.z0 + r * SDF_CELL_M;
    sdf[r * sx + c] = ledgeSignedDistance(x, z);
    pockets[r * sx + c] = pocketWeight(x, z);
  }
  const lattice = (field: Float32Array, x: number, z: number): number => {
    const fx = (x - grid.x0) / SDF_CELL_M, fz = (z - grid.z0) / SDF_CELL_M;
    const c = Math.min(sx - 2, Math.floor(fx)), r = Math.min(sz - 2, Math.floor(fz));
    const tx = fx - c, tz = fz - r;
    const a = field[r * sx + c], b = field[r * sx + c + 1], d = field[(r + 1) * sx + c], e = field[(r + 1) * sx + c + 1];
    return (a + (b - a) * tx) * (1 - tz) + (d + (e - d) * tx) * tz;
  };

  for (let row = 0; row < grid.nz; row++) {
    const z = grid.z0 + row * grid.cellM;
    // The reef fades back to the plain coast before the map's north edge, so the map joins the far field seamlessly.
    const edgeFade = smooth(-450, -380, z);
    for (let col = 0; col < grid.nx; col++) {
      const x = grid.x0 + col * grid.cellM;
      const i = row * grid.nx + col;
      // Around the reef the surrounding deep water can be tuned; it eases back to the coast profile by 280 m out.
      const nearReef = 1 - smooth(150, 280, Math.hypot(x, z));
      const background = Math.max(0, depthBg(x) + (p.deepDepthM - REEF_SURROUND_DEPTH_M) * nearReef);
      const sd = lattice(sdf, x, z);
      let d: number, s: number, w = 0;
      if (sd < 0) {
        // Outside the shelf: rise from the surrounding deep water to the ledge depth over ledgeWidthM.
        const dLedge = p.ledgeDepthM + (background - p.ledgeDepthM) * smooth(0, p.ledgeWidthM, -sd);
        d = background + (dLedge - background) * edgeFade;
        s = 1 + (smooth(0, 4, -sd) - 1) * edgeFade;
      } else {
        // Inside: reef heads and sand pockets on the shelf, also fading out at its inshore (x ≈ 110 m) boundary.
        const reefness = edgeFade * smooth(125, 100, x);
        const warpX = x + 6 * fbm2(x / 23, z / 23, REEF_SEED + 7);
        const warpZ = z + 6 * fbm2(x / 23 + 9.1, z / 23 - 3.7, REEF_SEED + 8);
        const relief = fbm2(warpX / 11, warpZ / 11, REEF_SEED);
        const heads = smooth(0.05, 0.55, relief);
        let interior = Math.max(p.minDepthM, p.shelfDepthM - p.headReliefM * heads);
        const pocket = Math.max(lattice(pockets, x, z), smooth(-0.25, -0.55, relief));
        interior = interior + (p.pocketDepthM - interior) * pocket;
        const dShelf = p.ledgeDepthM + (interior - p.ledgeDepthM) * smooth(0, 20, sd);
        const sShelf = pocket * smooth(0, 3, sd) + (1 - smooth(0, 3, sd)) * 0.3;
        const wShelf = (1 - pocket) * smooth(0.2, 0.6, fbm2(x / 5, z / 5, REEF_SEED + 3)) * smooth(0, 6, sd);
        d = background + (dShelf - background) * reefness;
        s = 1 + (sShelf - 1) * reefness;
        w = wShelf * reefness;
      }
      bed[i] = -d;
      sand[i] = s;
      weed[i] = Math.min(w, 1 - s);
    }
  }
  return { grid, bed, sand, weed };
}

/** Bilinear seabed height inside the map; the reef-free coast profile outside it. */
export function bedHeightAt(b: Bathymetry, x: number, z: number): number {
  const g = b.grid;
  const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
  if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) return -depthBg(x);
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r;
  const i = r * g.nx + c;
  const top = b.bed[i] + (b.bed[i + 1] - b.bed[i]) * tx;
  const bottom = b.bed[i + g.nx] + (b.bed[i + g.nx + 1] - b.bed[i + g.nx]) * tx;
  return top + (bottom - top) * tz;
}

/** Average factor × factor blocks (for the 1 m wave-field grid). nx and nz must divide by factor. */
export function downsample(b: Bathymetry, factor: number): Bathymetry {
  const g = b.grid;
  const nx = g.nx / factor, nz = g.nz / factor;
  const grid: GridSpec = { x0: g.x0 + ((factor - 1) * g.cellM) / 2, z0: g.z0 + ((factor - 1) * g.cellM) / 2, cellM: g.cellM * factor, nx, nz };
  const out = { grid, bed: new Float32Array(nx * nz), sand: new Float32Array(nx * nz), weed: new Float32Array(nx * nz) };
  const inv = 1 / (factor * factor);
  for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) {
    let bed = 0, sand = 0, weed = 0;
    for (let dr = 0; dr < factor; dr++) for (let dc = 0; dc < factor; dc++) {
      const i = (r * factor + dr) * g.nx + c * factor + dc;
      bed += b.bed[i]; sand += b.sand[i]; weed += b.weed[i];
    }
    const o = r * nx + c;
    out.bed[o] = bed * inv; out.sand[o] = sand * inv; out.weed[o] = weed * inv;
  }
  return out;
}
```

Design notes for the reviewer:
- `background` is the coast profile, optionally deepened near the reef by `deepDepthM`. That changes nothing at the default of 13 m, and fades out by 280 m from the peak.
- `edgeFade` and the inshore fade return the seabed to exactly `-depthBg(x)` near the map edges. The continuity test pins this, and the far-field waves (Task 6) rely on it.
- At the tip and along both ledges, `sd = 0` gives exactly `ledgeDepthM` on both sides of the branch.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/seabed`
Expected: PASS. Record the time `buildBathymetry()` takes (e.g. with `performance.now()` in a scratch run) in the task report. The spec's startup target is ≤ 300 ms; if it's over, say so, and Task 13 decides whether to move the build into the worker.

- [ ] **Step 5: Commit**

```bash
git add src/seabed
git commit -m "feat: build the Womb's bathymetry from named reef features

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Seabed on the GPU (texture, tide, depth nodes)

**Files:**
- Create: `src/seabed/Seabed.ts`
- Create: `src/seabed/seabed.selftest.ts`
- Modify: `src/dev/selfTests.ts`

**Interfaces:**
- Consumes (Task 2): `Bathymetry`, `bedHeightAt`, `depthBg`, the coast profile constants, `GridSpec`.
- Produces: `class Seabed`:
  - `readonly tide: UniformNode<float>`;
  - `bathymetry: Bathymetry`;
  - `setBathymetry(b)`, `setTide(m)`;
  - `depthAt(x, z): number` (CPU still-water depth incl. tide);
  - `bedHeightNode(xz: N): N` (seabed y);
  - `waterDepthNode(xz: N): N` (tide − bed, ≥ 0);
  - `materialNode(xz: N): N` (vec2(sand, weed));
  - `insideNode(xz: N): N` (1 inside the map, else 0).
- Also produces `depthBgNode(x: N): N`, the exact TSL mirror of `depthBg`.

Texture layout: one `DataTexture` with RGBA half floats, laid out R = bed height (m), G = sand, B = weed, A = 1. Linear filtering, clamp to edge, no mipmaps. UV = ((x − x0)/cell + 0.5)/nx, ((z − z0)/cell + 0.5)/nz. Outside the map the nodes return the coast profile, so they are continuous at the edges (Task 2's continuity test).

- [ ] **Step 1: Write the GPU self-test (the failing check)**

`src/seabed/seabed.selftest.ts`:

```ts
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { bedHeightAt, buildBathymetry } from './bathymetry';
import { Seabed } from './Seabed';

const POINTS: [number, number][] = [
  [0, 0], [-30, -60], [50, -110], [20, -40], [-300, 100], [-1000, 0], [400, 0], [0, -449], [120, 10], [-399.9, 299.9],
];

registerSelfTest({
  name: 'seabed: GPU bed heights match the CPU bathymetry (±3 cm)',
  async run(renderer) {
    const bathy = buildBathymetry();
    const seabed = new Seabed(bathy);
    const n = POINTS.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(POINTS.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const xz = input.element(instanceIndex).xy;
      output.element(instanceIndex).assign(vec4(seabed.bedHeightNode(xz), seabed.insideNode(xz), 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const rows = POINTS.map(([x, z], i) => {
      const gpu = out[i * 4], cpu = bedHeightAt(bathy, x, z);
      worst = Math.max(worst, Math.abs(gpu - cpu));
      return `(${x},${z}) gpu ${gpu.toFixed(3)} cpu ${cpu.toFixed(3)}`;
    });
    return { pass: worst < 0.03, detail: `worst ${worst.toFixed(4)} m; ${rows.join('; ')}` };
  },
});
```

Add to `src/dev/selfTests.ts` after the probe import:

```ts
import '../seabed/seabed.selftest';
```

- [ ] **Step 2: Confirm it fails to build**

Run: `npm run typecheck`
Expected: FAIL. `./Seabed` does not exist.

- [ ] **Step 3: Implement `src/seabed/Seabed.ts`**

```ts
import * as THREE from 'three/webgpu';
import { float, max, select, smoothstep, texture, uniform, vec2 } from 'three/tsl';
import { type Bathymetry, bedHeightAt } from './bathymetry';
import { FAR_DEPTH_M, REEF_SURROUND_DEPTH_M, SHORE_FLAT_DEPTH_M, SHORE_X } from './coastProfile';

type N = any;

/** TSL mirror of depthBg(): the same piecewise smoothstep profile, as one select chain. */
export function depthBgNode(x: N): N {
  const s = float(SHORE_X).sub(x);
  const nearShore = float(SHORE_FLAT_DEPTH_M).add(float(1.5 - SHORE_FLAT_DEPTH_M).mul(smoothstep(0, 30, s)));
  const slope = float(1.5).add(float(REEF_SURROUND_DEPTH_M - 1.5).mul(smoothstep(30, 140, s)));
  const offshore = float(REEF_SURROUND_DEPTH_M).add(float(FAR_DEPTH_M - REEF_SURROUND_DEPTH_M).mul(smoothstep(260, 590, s)));
  return select(s.lessThan(30), nearShore, select(s.lessThan(140), slope, offshore));
}

function packTexture(b: Bathymetry, target?: THREE.DataTexture): THREE.DataTexture {
  const { nx, nz } = b.grid;
  const data = target ? (target.image.data as Uint16Array) : new Uint16Array(nx * nz * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < nx * nz; i++) {
    data[i * 4] = toHalf(b.bed[i]);
    data[i * 4 + 1] = toHalf(b.sand[i]);
    data[i * 4 + 2] = toHalf(b.weed[i]);
    data[i * 4 + 3] = toHalf(1);
  }
  const tex = target ?? new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** The Womb's seabed on the GPU and CPU, with the tide. One source of truth for water depth. */
export class Seabed {
  readonly tide = uniform(0);
  bathymetry: Bathymetry;
  private readonly tex: THREE.DataTexture;
  private readonly origin = uniform(new THREE.Vector2());
  private readonly cell = uniform(1);
  private readonly size = uniform(new THREE.Vector2(1, 1));

  constructor(b: Bathymetry) {
    this.bathymetry = b;
    this.tex = packTexture(b);
    this.syncGrid();
  }

  /** Replace the reef (dev edits). Grid dimensions must stay the same. */
  setBathymetry(b: Bathymetry): void {
    if (b.grid.nx !== this.bathymetry.grid.nx || b.grid.nz !== this.bathymetry.grid.nz) throw new Error('Seabed grid size cannot change');
    this.bathymetry = b;
    packTexture(b, this.tex);
    this.syncGrid();
  }

  setTide(m: number): void {
    this.tide.value = m;
  }

  /** Still-water depth (m) at world x, z, including the tide; ≥ 0. */
  depthAt(x: number, z: number): number {
    return Math.max(0, this.tide.value - bedHeightAt(this.bathymetry, x, z));
  }

  private syncGrid(): void {
    const g = this.bathymetry.grid;
    this.origin.value.set(g.x0, g.z0);
    this.cell.value = g.cellM;
    this.size.value.set(g.nx, g.nz);
  }

  private gridCoords(xz: N): N {
    return xz.sub(this.origin).div(this.cell);
  }

  insideNode(xz: N): N {
    const g = this.gridCoords(xz);
    const lo = g.greaterThanEqual(vec2(0.0));
    const hi = g.lessThanEqual(this.size.sub(1.0));
    return select(lo.x.and(lo.y).and(hi.x).and(hi.y), float(1.0), float(0.0));
  }

  private sample(xz: N): N {
    const uv = this.gridCoords(xz).add(0.5).div(this.size);
    return texture(this.tex, uv).level(float(0)); // three typings gap: level() wants a node
  }

  /** Seabed height y (m) at world xz; the coast profile outside the map. */
  bedHeightNode(xz: N): N {
    return select(this.insideNode(xz).greaterThan(0.5), this.sample(xz).x, depthBgNode(xz.x).negate());
  }

  /** Still-water depth (m) including the tide, never negative. */
  waterDepthNode(xz: N): N {
    return max(this.tide.sub(this.bedHeightNode(xz)), 0.0);
  }

  /** vec2(sand, weed) weights; open sand outside the map. */
  materialNode(xz: N): N {
    return select(this.insideNode(xz).greaterThan(0.5), this.sample(xz).yz, vec2(1.0, 0.0));
  }
}
```

- [ ] **Step 4: Typecheck, unit tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean, all tests pass, build succeeds.

- [ ] **Step 5: GPU check (controller)**

Implementers do not open a browser. Report in the task report: "GPU self-test pending: expect `seabed: GPU bed heights match the CPU bathymetry` to PASS, and `?selftest` to show 14/14". The controller runs it after asking Andrew to close his tab.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: put the Womb's seabed on the GPU with tide-aware depth nodes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Swell sets (seeded timeline) and a quieter background swell

**Files:**
- Create: `src/swell/sets.ts`, `src/swell/sets.test.ts`
- Modify: `src/ocean/spectrum.ts` (`OceanSpectrumParams.backgroundSwellFactor`, `swellComponent`)
- Modify: `src/ocean/spectrum.test.ts`

**Interfaces:**
- Consumes: `Conditions`; `createRng`, `deriveSeed` from `src/conditions/rng.ts`; `surferFeetToHs` from `src/conditions/units.ts`.
- Produces:
  - `interface SetParams` and `DEFAULT_SET_PARAMS`.
  - `interface WaveEvent { id; slot; indexInSet; waveCount; arrivalS; heightM; periodS; fromDeg; crestLengthM; crestOffsetM }`.
  - Constants: `WAVE_WINDOW_BEFORE_S = 300`, `WAVE_WINDOW_AFTER_S = 60`, `MAX_ACTIVE_WAVES = 12`, `CALL_SET_LEAD_S = 45`.
  - `setStartS(slot, c, p): number`.
  - `wavesOfSet(slot, c, p): WaveEvent[]`.
  - `straysAfterSet(slot, c, p): WaveEvent[]`.
  - `wavesNear(t, c, p): WaveEvent[]`, sorted by `arrivalS`, at most `MAX_ACTIVE_WAVES`.
  - `nextSetArrivalS(t, c, p): number`.
  - `callSetTime(t, c, p): number`.
  - `OceanSpectrumParams.backgroundSwellFactor` (default 0.5).

A set event's `heightM` is the deep-water wave height at the 30 m reference depth. `arrivalS` is when its crest reaches the peak (ruling R6).

- [ ] **Step 1: Write the failing tests**

`src/swell/sets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import {
  CALL_SET_LEAD_S, DEFAULT_SET_PARAMS, MAX_ACTIVE_WAVES, WAVE_WINDOW_AFTER_S, WAVE_WINDOW_BEFORE_S,
  callSetTime, nextSetArrivalS, setStartS, straysAfterSet, wavesNear, wavesOfSet,
} from './sets';

const c = DEFAULT_CONDITIONS, p = DEFAULT_SET_PARAMS;

describe('set timeline', () => {
  it('is deterministic and depends on the seed', () => {
    expect(wavesOfSet(3, c, p)).toEqual(wavesOfSet(3, c, p));
    const other = cloneConditions(c);
    other.seed = 7;
    expect(wavesOfSet(3, other, p)[0].arrivalS).not.toBe(wavesOfSet(3, c, p)[0].arrivalS);
  });
  it('spaces sets 10–20 minutes apart (Andrew)', () => {
    for (let k = 0; k < 300; k++) {
      const gap = setStartS(k + 1, c, p) - setStartS(k, c, p);
      expect(gap).toBeGreaterThanOrEqual(600 - 1e-9);
      expect(gap).toBeLessThanOrEqual(1200 + 1e-9);
    }
  });
  it('has 4–8 waves spaced about one period apart', () => {
    for (let k = 0; k < 200; k++) {
      const set = wavesOfSet(k, c, p);
      expect(set.length).toBeGreaterThanOrEqual(4);
      expect(set.length).toBeLessThanOrEqual(8);
      for (let i = 1; i < set.length; i++) {
        const dt = set[i].arrivalS - set[i - 1].arrivalS;
        expect(dt).toBeGreaterThanOrEqual(c.swell.periodS * (1 - p.spacingJitter) - 1e-9);
        expect(dt).toBeLessThanOrEqual(c.swell.periodS * (1 + p.spacingJitter) + 1e-9);
      }
    }
  });
  it('puts the biggest wave mid-set most of the time (Andrew)', () => {
    let mid = 0;
    const sets = 400;
    for (let k = 0; k < sets; k++) {
      const set = wavesOfSet(k, c, p);
      let best = 0;
      set.forEach((w, i) => { if (w.heightM > set[best].heightM) best = i; });
      const pos = (best + 0.5) / set.length;
      if (pos > 0.25 && pos < 0.75) mid++;
    }
    expect(mid / sets).toBeGreaterThan(0.6);
  });
  it('keeps set heights within the swell-derived bounds', () => {
    const hs = surferFeetToHs(c.swell.sizeFt);
    for (let k = 0; k < 200; k++) for (const w of wavesOfSet(k, c, p)) {
      expect(w.heightM).toBeGreaterThan(0);
      expect(w.heightM).toBeLessThanOrEqual(hs * p.heightFactorMax * (1 + 2 * p.waveHeightJitter) + 1e-9);
    }
  });
  it('has no waves for a flat swell', () => {
    const flat = cloneConditions(c);
    flat.swell.sizeFt = 0;
    expect(wavesOfSet(2, flat, p)).toEqual([]);
    expect(wavesNear(1000, flat, p)).toEqual([]);
  });
  it('places strays in the lull, smaller than the set', () => {
    for (let k = 0; k < 100; k++) {
      const set = wavesOfSet(k, c, p);
      const next = setStartS(k + 1, c, p);
      const meanSet = set.reduce((a, w) => a + w.heightM, 0) / set.length;
      for (const s of straysAfterSet(k, c, p)) {
        expect(s.indexInSet).toBe(-1);
        expect(s.arrivalS).toBeGreaterThan(set[set.length - 1].arrivalS);
        expect(s.arrivalS).toBeLessThan(next);
        expect(s.heightM).toBeLessThan(meanSet);
      }
    }
  });
  it('returns the waves in flight around a time, sorted and capped', () => {
    const t = wavesOfSet(4, c, p)[2].arrivalS;
    const near = wavesNear(t, c, p);
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThanOrEqual(MAX_ACTIVE_WAVES);
    for (const w of near) {
      expect(w.arrivalS).toBeGreaterThanOrEqual(t - WAVE_WINDOW_AFTER_S);
      expect(w.arrivalS).toBeLessThanOrEqual(t + WAVE_WINDOW_BEFORE_S);
    }
    for (let i = 1; i < near.length; i++) expect(near[i].arrivalS).toBeGreaterThanOrEqual(near[i - 1].arrivalS);
    expect(near.some((w) => w.id === wavesOfSet(4, c, p)[2].id)).toBe(true);
  });
  it('answers instantly at huge times (moment links)', () => {
    const start = performance.now();
    const near = wavesNear(1e7, c, p);
    const next = nextSetArrivalS(1e7, c, p);
    expect(performance.now() - start).toBeLessThan(50);
    expect(Number.isFinite(next)).toBe(true);
    near.forEach((w) => expect(Number.isFinite(w.arrivalS)).toBe(true));
  });
  it('finds the next set and the call-a-set jump time', () => {
    const t = 100;
    const next = nextSetArrivalS(t, c, p);
    expect(next).toBeGreaterThan(t);
    expect(callSetTime(t, c, p)).toBeCloseTo(next - CALL_SET_LEAD_S, 9);
    expect(nextSetArrivalS(next + 1, c, p)).toBeGreaterThan(next + 500);
  });
});
```

Append to `src/ocean/spectrum.test.ts`:

```ts
describe('background swell under sets', () => {
  it('turns the FFT swell down by backgroundSwellFactor, leaving the wind sea alone', () => {
    const p = { ...DEFAULT_SPECTRUM_PARAMS, backgroundSwellFactor: 0.5 };
    expect(swellComponent(4, 15, 225, p).hs).toBeCloseTo(surferFeetToHs(4) * 0.5, 9);
    expect(windSeaComponent(6, 225, p).hs).toBeCloseTo(windSeaComponent(6, 225, { ...p, backgroundSwellFactor: 1 }).hs, 12);
    expect(DEFAULT_SPECTRUM_PARAMS.backgroundSwellFactor).toBe(0.5);
  });
});
```

(Import `surferFeetToHs` from `../conditions/units` at the top of that file if it is not already imported.) Any existing spectrum test or self-test that assumes the full swell Hs must pass `{ ...DEFAULT_SPECTRUM_PARAMS, backgroundSwellFactor: 1 }` explicitly. Search with `grep -rn "swellComponent\|surferFeetToHs" src` and update each such expectation, not the factor.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/swell src/ocean/spectrum.test.ts`
Expected: FAIL (module missing; `backgroundSwellFactor` unknown).

- [ ] **Step 3: Implement**

In `src/ocean/spectrum.ts`, add to `OceanSpectrumParams`:

```ts
  /** Fraction of the dial's swell Hs left in the FFT background once sets carry the big waves (Phase 1). */
  backgroundSwellFactor: number;
```

and to `DEFAULT_SPECTRUM_PARAMS`:

```ts
  backgroundSwellFactor: 0.5,
```

and in `swellComponent` replace the `hs` line with:

```ts
  const hs = surferFeetToHs(sizeFt) * p.backgroundSwellFactor;
```

`src/swell/sets.ts`:

```ts
import { createRng, deriveSeed } from '../conditions/rng';
import type { Conditions } from '../conditions/types';
import { surferFeetToHs } from '../conditions/units';

export interface SetParams {
  /** Mean time between set starts; one set per slot of this length. */
  meanIntervalS: number;
  /** A set starts this far either side of its slot's centre (±150 s gives 10–20 min between sets). */
  intervalJitterS: number;
  minWaves: number;
  maxWaves: number;
  /** Set waves are the biggest of the swell: deep-water height = Hs × a per-set factor in [min, max]. */
  heightFactorMin: number;
  heightFactorMax: number;
  /** Per-wave height variation (standard deviation, fraction); clipped at ±2σ. */
  waveHeightJitter: number;
  /** Wave spacing = period × (1 ± this). */
  spacingJitter: number;
  directionJitterDeg: number;
  periodJitter: number;
  /** Mean number of lone stray waves between sets. */
  straysPerLull: number;
  /** Stray height as a fraction of the smallest set factor. */
  strayHeightMin: number;
  strayHeightMax: number;
  crestLengthMinM: number;
  crestLengthMaxM: number;
}

export const DEFAULT_SET_PARAMS: SetParams = {
  meanIntervalS: 900,
  intervalJitterS: 150,
  minWaves: 4,
  maxWaves: 8,
  heightFactorMin: 1.3,
  heightFactorMax: 1.8,
  waveHeightJitter: 0.15,
  spacingJitter: 0.1,
  directionJitterDeg: 4,
  periodJitter: 0.05,
  straysPerLull: 1.5,
  strayHeightMin: 0.5,
  strayHeightMax: 0.7,
  crestLengthMinM: 300,
  crestLengthMaxM: 600,
};

export interface WaveEvent {
  /** Stable per (slot, index): slot·64 + index; strays use 32 + n. */
  id: number;
  slot: number;
  /** −1 for strays. */
  indexInSet: number;
  /** Waves in this set; 0 for strays. */
  waveCount: number;
  /** Sim time (s) when this wave's crest reaches the peak. */
  arrivalS: number;
  /** Wave height (m) at the 30 m reference depth, before the reef shapes it. */
  heightM: number;
  periodS: number;
  /** Direction the wave comes FROM, degrees true. */
  fromDeg: number;
  crestLengthM: number;
  /** Sideways offset (m) of the crest's centre from the ray through the peak (matters in deep water only). */
  crestOffsetM: number;
}

/** A wave is in flight from this long before it reaches the peak (on the horizon)… */
export const WAVE_WINDOW_BEFORE_S = 300;
/** …until this long after (faded over the shelf). */
export const WAVE_WINDOW_AFTER_S = 60;
export const MAX_ACTIVE_WAVES = 12;
/** "Call a set now" lands this long before the set's first wave reaches the peak. */
export const CALL_SET_LEAD_S = 45;

const SET_SALT = 7000;
const STRAY_SALT = 9000;
const uniformIn = (u: number, lo: number, hi: number): number => lo + u * (hi - lo);
const signed = (u: number): number => u * 2 - 1;

function slotRng(slot: number, c: Conditions, salt: number) {
  return createRng(deriveSeed(c.seed, salt + slot));
}

/** Start time of slot k's set (its first wave reaches the peak then). O(1) in k. */
export function setStartS(slot: number, c: Conditions, p: SetParams): number {
  const rng = slotRng(slot, c, SET_SALT);
  return slot * p.meanIntervalS + p.meanIntervalS / 2 + signed(rng.next()) * p.intervalJitterS;
}

export function wavesOfSet(slot: number, c: Conditions, p: SetParams): WaveEvent[] {
  const hs = surferFeetToHs(c.swell.sizeFt);
  if (hs <= 0) return [];
  const rng = slotRng(slot, c, SET_SALT);
  rng.next(); // the start offset, drawn by setStartS
  let t = setStartS(slot, c, p);
  const count = p.minWaves + Math.min(p.maxWaves - p.minWaves, Math.floor(rng.next() * (p.maxWaves - p.minWaves + 1)));
  const factor = uniformIn(rng.next(), p.heightFactorMin, p.heightFactorMax);
  const waves: WaveEvent[] = [];
  for (let i = 0; i < count; i++) {
    // Mid-set peaked envelope: the biggest waves arrive in the middle of the set (Andrew).
    const envelope = 0.72 + 0.28 * Math.sin((Math.PI * (i + 0.5)) / count);
    const jitter = Math.max(-2 * p.waveHeightJitter, Math.min(2 * p.waveHeightJitter, rng.gaussian() * p.waveHeightJitter));
    waves.push({
      id: slot * 64 + i,
      slot,
      indexInSet: i,
      waveCount: count,
      arrivalS: t,
      heightM: hs * factor * envelope * (1 + jitter),
      periodS: c.swell.periodS * (1 + signed(rng.next()) * p.periodJitter),
      fromDeg: c.swell.directionDeg + signed(rng.next()) * p.directionJitterDeg,
      crestLengthM: uniformIn(rng.next(), p.crestLengthMinM, p.crestLengthMaxM),
      crestOffsetM: signed(rng.next()) * 60,
    });
    t += c.swell.periodS * (1 + signed(rng.next()) * p.spacingJitter);
  }
  return waves;
}

/** Lone waves in the lull after slot k's set, at least 90 s clear of either set. */
export function straysAfterSet(slot: number, c: Conditions, p: SetParams): WaveEvent[] {
  const set = wavesOfSet(slot, c, p);
  if (set.length === 0) return [];
  const rng = slotRng(slot, c, STRAY_SALT);
  const from = set[set.length - 1].arrivalS + 90;
  const to = setStartS(slot + 1, c, p) - 90;
  if (to <= from) return [];
  const count = Math.floor(p.straysPerLull + rng.next());
  const hs = surferFeetToHs(c.swell.sizeFt);
  const strays: WaveEvent[] = [];
  for (let n = 0; n < count; n++) {
    strays.push({
      id: slot * 64 + 32 + n,
      slot,
      indexInSet: -1,
      waveCount: 0,
      arrivalS: uniformIn(rng.next(), from, to),
      heightM: hs * p.heightFactorMin * uniformIn(rng.next(), p.strayHeightMin, p.strayHeightMax),
      periodS: c.swell.periodS * (1 + signed(rng.next()) * p.periodJitter),
      fromDeg: c.swell.directionDeg + signed(rng.next()) * p.directionJitterDeg,
      crestLengthM: uniformIn(rng.next(), p.crestLengthMinM, p.crestLengthMaxM),
      crestOffsetM: signed(rng.next()) * 60,
    });
  }
  return strays.sort((a, b) => a.arrivalS - b.arrivalS);
}

/** Every wave whose crest reaches the peak within [t − AFTER, t + BEFORE], sorted, capped (nearest first). */
export function wavesNear(t: number, c: Conditions, p: SetParams): WaveEvent[] {
  if (surferFeetToHs(c.swell.sizeFt) <= 0) return [];
  const setSpan = p.maxWaves * c.swell.periodS * (1 + p.spacingJitter);
  const k0 = Math.floor((t - WAVE_WINDOW_AFTER_S - setSpan - p.intervalJitterS - p.meanIntervalS) / p.meanIntervalS);
  const k1 = Math.ceil((t + WAVE_WINDOW_BEFORE_S + p.intervalJitterS) / p.meanIntervalS);
  const out: WaveEvent[] = [];
  for (let k = k0; k <= k1; k++) {
    for (const w of [...wavesOfSet(k, c, p), ...straysAfterSet(k, c, p)]) {
      if (w.arrivalS >= t - WAVE_WINDOW_AFTER_S && w.arrivalS <= t + WAVE_WINDOW_BEFORE_S) out.push(w);
    }
  }
  out.sort((a, b) => a.arrivalS - b.arrivalS);
  if (out.length <= MAX_ACTIVE_WAVES) return out;
  return [...out].sort((a, b) => Math.abs(a.arrivalS - t) - Math.abs(b.arrivalS - t)).slice(0, MAX_ACTIVE_WAVES).sort((a, b) => a.arrivalS - b.arrivalS);
}

/** When the first wave of the next set (starting after t) reaches the peak. */
export function nextSetArrivalS(t: number, c: Conditions, p: SetParams): number {
  let k = Math.floor(t / p.meanIntervalS) - 1;
  while (setStartS(k, c, p) <= t) k++;
  return setStartS(k, c, p);
}

/** The sim time "call a set now" jumps to. */
export function callSetTime(t: number, c: Conditions, p: SetParams): number {
  return nextSetArrivalS(t, c, p) - CALL_SET_LEAD_S;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS, including every pre-existing spectrum test.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: seeded swell sets (10-20 min apart, 4-8 waves, biggest mid-set) and a quieter FFT swell

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wave physics solvers (dispersion and arrival time)

**Files:**
- Create: `src/breaker/dispersion.ts`, `src/breaker/dispersion.test.ts`
- Create: `src/breaker/eikonal.ts`, `src/breaker/eikonal.test.ts`

**Interfaces:**
- Consumes: `GRAVITY` from `src/ocean/spectrum.ts`.
- Produces:
  - `MIN_DEPTH_M = 0.05`.
  - `waveNumber(omega: number, depthM: number): number`, which solves ω² = g·k·tanh(k·h), with h clamped to ≥ 0.05 m.
  - `groupSpeed(omega: number, k: number, depthM: number): number`.
  - `solveEikonal(tau: Float64Array, fixed: Uint8Array, slowness: Float32Array, nx: number, nz: number, cellM: number, maxCycles?: number, tol?: number): number` (in place; returns the cycles used).

Grid convention everywhere in `breaker/`: index = row·nx + col, col ↔ x (increasing east), row ↔ z (increasing south).

- [ ] **Step 1: Write the failing tests**

`src/breaker/dispersion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GRAVITY } from '../ocean/spectrum';
import { MIN_DEPTH_M, groupSpeed, waveNumber } from './dispersion';

const omegaOf = (T: number) => (2 * Math.PI) / T;

describe('linear dispersion', () => {
  it('solves ω² = g k tanh(k h) to machine precision across periods and depths', () => {
    for (const T of [4, 8, 12, 15, 20, 25]) for (const h of [0.05, 0.5, 1.2, 3, 6, 13, 30, 200, 1000]) {
      const w = omegaOf(T), k = waveNumber(w, h);
      expect(Math.abs(GRAVITY * k * Math.tanh(k * h) - w * w) / (w * w)).toBeLessThan(1e-9);
    }
  });
  it('matches textbook wavelengths', () => {
    expect((2 * Math.PI) / waveNumber(omegaOf(10), 10)).toBeCloseTo(92.3, 0);
    expect((2 * Math.PI) / waveNumber(omegaOf(15), 1000)).toBeCloseTo((GRAVITY * 225) / (2 * Math.PI), 0);
  });
  it('tends to sqrt(g h) in very shallow water', () => {
    const w = omegaOf(20), h = 1;
    expect(w / waveNumber(w, h)).toBeCloseTo(Math.sqrt(GRAVITY * h), 1);
  });
  it('group speed is c/2 in deep water and ≈ c in shallow water', () => {
    const w = omegaOf(10);
    const kd = waveNumber(w, 1000);
    expect(groupSpeed(w, kd, 1000) / (w / kd)).toBeCloseTo(0.5, 3);
    const ks = waveNumber(w, 0.5);
    expect(groupSpeed(w, ks, 0.5) / (w / ks)).toBeGreaterThan(0.97);
  });
  it('dry cells stay finite (depth ≤ 0 is clamped)', () => {
    for (const h of [0, -1, -100]) {
      const k = waveNumber(omegaOf(15), h);
      expect(Number.isFinite(k)).toBe(true);
      expect(k).toBeCloseTo(waveNumber(omegaOf(15), MIN_DEPTH_M), 12);
      expect(Number.isFinite(groupSpeed(omegaOf(15), k, h))).toBe(true);
    }
  });
});
```

`src/breaker/eikonal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { solveEikonal } from './eikonal';

function grid(nx: number, nz: number) {
  return { tau: new Float64Array(nx * nz).fill(Infinity), fixed: new Uint8Array(nx * nz), slow: new Float32Array(nx * nz) };
}

describe('fast-sweeping eikonal solver', () => {
  it('reproduces a plane wave along x exactly', () => {
    const nx = 60, nz = 40, h = 1, s = 0.1;
    const g = grid(nx, nz);
    g.slow.fill(s);
    for (let r = 0; r < nz; r++) { g.tau[r * nx] = 0; g.fixed[r * nx] = 1; }
    solveEikonal(g.tau, g.fixed, g.slow, nx, nz, h);
    for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) expect(g.tau[r * nx + c]).toBeCloseTo(c * h * s, 9);
  });
  it('reproduces an oblique plane wave (entering from the west and south edges)', () => {
    const nx = 80, nz = 70, h = 1, s = 0.08;
    const dx = Math.cos(Math.PI / 6), dz = -Math.sin(Math.PI / 6); // travelling east and north
    const exact = (c: number, r: number) => s * (dx * c * h + dz * (r - (nz - 1)) * h);
    const g = grid(nx, nz);
    g.slow.fill(s);
    for (let r = 0; r < nz; r++) { g.tau[r * nx] = exact(0, r); g.fixed[r * nx] = 1; }
    for (let c = 0; c < nx; c++) { g.tau[(nz - 1) * nx + c] = exact(c, nz - 1); g.fixed[(nz - 1) * nx + c] = 1; }
    solveEikonal(g.tau, g.fixed, g.slow, nx, nz, h);
    for (let r = 0; r < nz; r += 7) for (let c = 0; c < nx; c += 7) expect(g.tau[r * nx + c]).toBeCloseTo(exact(c, r), 6);
  });
  it("obeys Snell's law across straight depth contours", () => {
    const nx = 200, nz = 120, h = 1;
    const speed = (c: number) => 12 - 8 * (c / (nx - 1)); // slowing shoreward (east)
    const theta0 = (35 * Math.PI) / 180;
    const p = Math.sin(theta0) / speed(0); // slowness component along z (the invariant)
    // Exact 1D solution: τ = p·z + ∫ sqrt(s(x)² − p²) dx, integrated finely.
    const tauX = new Float64Array(nx);
    for (let c = 1; c < nx; c++) {
      let acc = 0;
      for (let q = 0; q < 20; q++) {
        const x = c - 1 + (q + 0.5) / 20;
        const sl = 1 / speed(x);
        acc += Math.sqrt(sl * sl - p * p) / 20;
      }
      tauX[c] = tauX[c - 1] + acc * h;
    }
    const exact = (c: number, r: number) => tauX[c] + p * r * h;
    const g = grid(nx, nz);
    for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) g.slow[r * nx + c] = 1 / speed(c);
    for (let r = 0; r < nz; r++) { g.tau[r * nx] = exact(0, r); g.fixed[r * nx] = 1; }
    for (let c = 0; c < nx; c++) { g.tau[c] = exact(c, 0); g.fixed[c] = 1; }
    solveEikonal(g.tau, g.fixed, g.slow, nx, nz, h);
    for (const c of [50, 100, 150]) {
      const r = 60;
      const dTauDz = (g.tau[(r + 1) * nx + c] - g.tau[(r - 1) * nx + c]) / (2 * h);
      expect(Math.abs(dTauDz / p - 1)).toBeLessThan(0.02);
      expect(Math.abs(g.tau[r * nx + c] - exact(c, r)) / exact(c, r)).toBeLessThan(0.01);
    }
  });
  it('stays finite with huge slowness (dry reef) and unreachable cells', () => {
    const nx = 30, nz = 30;
    const g = grid(nx, nz);
    g.slow.fill(0.1);
    for (let r = 10; r < 20; r++) for (let c = 10; c < 20; c++) g.slow[r * nx + c] = 1e6;
    for (let r = 0; r < nz; r++) { g.tau[r * nx] = 0; g.fixed[r * nx] = 1; }
    solveEikonal(g.tau, g.fixed, g.slow, nx, nz, 1);
    g.tau.forEach((v) => { expect(Number.isNaN(v)).toBe(false); expect(Number.isFinite(v)).toBe(true); });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/breaker`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/breaker/dispersion.ts`:

```ts
import { GRAVITY } from '../ocean/spectrum';

/** Shallowest depth the wave physics uses; dry or negative depths are clamped to it. */
export const MIN_DEPTH_M = 0.05;

/** Wavenumber k (rad/m) solving ω² = g·k·tanh(k·h): Fenton–McKee start, then Newton. */
export function waveNumber(omega: number, depthM: number): number {
  const h = Math.max(depthM, MIN_DEPTH_M);
  const k0 = (omega * omega) / GRAVITY;
  let k = k0 / Math.pow(Math.tanh(Math.pow(k0 * h, 0.75)), 2 / 3);
  for (let i = 0; i < 6; i++) {
    const th = Math.tanh(k * h);
    const f = GRAVITY * k * th - omega * omega;
    const df = GRAVITY * th + GRAVITY * k * h * (1 - th * th);
    k -= f / df;
  }
  return k;
}

/** Group speed (m/s): cg = c·½·(1 + 2kh / sinh 2kh). */
export function groupSpeed(omega: number, k: number, depthM: number): number {
  const kh2 = 2 * k * Math.max(depthM, MIN_DEPTH_M);
  const n = kh2 > 40 ? 0.5 : 0.5 * (1 + kh2 / Math.sinh(kh2));
  return (omega / k) * n;
}
```

`src/breaker/eikonal.ts`:

```ts
/**
 * Fast sweeping (Zhao 2005) for |∇τ| = s(x) on a regular grid (index = row·nx + col). Cells with `fixed` set keep
 * their τ (sources); every other cell must start at Infinity. Four alternating sweep orders per cycle; stops when a
 * cycle changes no cell by more than `tol` seconds. Godunov upwind update, exact for plane waves.
 */
export function solveEikonal(
  tau: Float64Array, fixed: Uint8Array, slowness: Float32Array, nx: number, nz: number, cellM: number, maxCycles = 8, tol = 1e-7,
): number {
  let maxChange = 0;
  const update = (i: number, col: number, row: number): void => {
    if (fixed[i]) return;
    const a = Math.min(col > 0 ? tau[i - 1] : Infinity, col < nx - 1 ? tau[i + 1] : Infinity);
    const b = Math.min(row > 0 ? tau[i - nx] : Infinity, row < nz - 1 ? tau[i + nx] : Infinity);
    if (a === Infinity && b === Infinity) return;
    const f = slowness[i] * cellM;
    const t = Math.abs(a - b) >= f ? Math.min(a, b) + f : 0.5 * (a + b + Math.sqrt(2 * f * f - (a - b) * (a - b)));
    if (t < tau[i]) {
      const change = tau[i] === Infinity ? Infinity : tau[i] - t;
      if (change > maxChange) maxChange = change;
      tau[i] = t;
    }
  };
  let cycle = 0;
  for (; cycle < maxCycles; cycle++) {
    maxChange = 0;
    for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) update(row * nx + col, col, row);
    for (let row = 0; row < nz; row++) for (let col = nx - 1; col >= 0; col--) update(row * nx + col, col, row);
    for (let row = nz - 1; row >= 0; row--) for (let col = nx - 1; col >= 0; col--) update(row * nx + col, col, row);
    for (let row = nz - 1; row >= 0; row--) for (let col = 0; col < nx; col++) update(row * nx + col, col, row);
    if (maxChange < tol) return cycle + 1;
  }
  return cycle;
}
```

Unreachable cells: with any source present, fast sweeping reaches every cell. A cell surrounded only by huge slowness still gets a large but finite τ. The test pins "no Infinity" for this layout; callers always provide at least one source edge.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/breaker && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/breaker
git commit -m "feat: linear dispersion and a fast-sweeping eikonal solver for waves over the reef

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: The reef wave field (far-field coast solution, arrival time, amplification, depth history)

**Files:**
- Create: `src/breaker/fieldSample.ts`
- Create: `src/breaker/coastFarField.ts`, `src/breaker/coastFarField.test.ts`
- Create: `src/breaker/reefField.ts`, `src/breaker/reefField.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `Bathymetry`, `GridSpec`, `buildBathymetry`, `downsample`, `depthBg`, `NORTH_LEDGE`, `SOUTH_LEDGE`.
  - Task 5: `waveNumber`, `groupSpeed`, `MIN_DEPTH_M`, `solveEikonal`.
  - `travelDirectionXZ`.
- Produces:
  - `interface FieldSample { tau: number; amp: number; hmin: number; k: number; dirX: number; dirZ: number; depth: number }`.
  - `interface FarField` (fields listed in the code below), `computeFarField(periodS, fromDeg, tideM): FarField`, `farSample(f: FarField, x, z): FieldSample`, and the constants `FAR_X0 = -400`, `FAR_X1 = 250`, `FAR_DX = 0.5`, `AMP_CAP = 4`.
  - `interface ReefFieldRequest { bed: Bathymetry; periodS: number; fromDeg: number; tideM: number }`.
  - `interface ReefField { grid; tau; amp; hmin; k; dirX; dirZ; depth; far; omega; periodS; fromDeg; tideM }`, all `Float32Array` per cell except `far`.
  - `computeReefField(req): ReefField`.
  - `sampleField(f: ReefField, x, z): FieldSample`, bilinear inside the grid and `farSample` outside.

How the physics fits together:
- **Arrival time.** τ solves |∇τ| = k(x)/ω (the local slowness) from the reef-free coast's exact 1D Snell solution, imposed on every map-boundary cell the wave enters through. Outside the map, τ is that same 1D solution, so crest lines are continuous at every edge (ruling R1).
- **Amplification.** From energy-flux conservation ∇·(A²·cg·n̂) = 0, marched upwind in τ order.
- **`hmin`.** The shallowest still-water depth met along the way. Task 7's depth cap uses it, so a wave that has crossed shallow reef never regrows over a deeper sand pocket behind it.
- **Normalisation.** τ is shifted so τ(peak) = 0 (ruling R6).

- [ ] **Step 1: Write the failing tests**

`src/breaker/coastFarField.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { depthBg } from '../seabed/coastProfile';
import { groupSpeed, waveNumber } from './dispersion';
import { AMP_CAP, FAR_X0, computeFarField, farSample } from './coastFarField';

const w15 = (2 * Math.PI) / 15;

describe('far field over the reef-free coast', () => {
  it('shoals a wave arriving square to the coast exactly as linear theory says', () => {
    const f = computeFarField(15, 270, 0);
    expect(f.p).toBeCloseTo(0, 12);
    for (const x of [-400, -200, 0, 100, 160]) {
      const h = depthBg(x), k = waveNumber(w15, h), kRef = waveNumber(w15, depthBg(FAR_X0));
      const s = farSample(f, x, 0);
      expect(s.amp).toBeCloseTo(Math.sqrt(groupSpeed(w15, kRef, depthBg(FAR_X0)) / groupSpeed(w15, k, h)), 5);
      expect(s.k).toBeCloseTo(k, 6);
      expect(s.dirX).toBeCloseTo(1, 9);
    }
  });
  it("keeps Snell's invariant along the coast for an oblique SW swell", () => {
    const f = computeFarField(15, 225, 0);
    for (const x of [-400, -150, 0, 120]) {
      const s = farSample(f, x, 50);
      expect((s.dirZ * s.k) / w15).toBeCloseTo(f.p, 6);
      expect(s.dirX).toBeGreaterThan(0);
    }
  });
  it('is 1 at the reference depth, capped everywhere, and records the depth as hmin for shoreward waves', () => {
    const f = computeFarField(15, 225, 0);
    expect(farSample(f, -400, 0).amp).toBeCloseTo(1, 9);
    for (let x = -1000; x <= 400; x += 7) {
      const s = farSample(f, x, 0);
      expect(s.amp).toBeLessThanOrEqual(AMP_CAP);
      expect(s.hmin).toBeCloseTo(s.depth, 6);
    }
  });
  it('extends linearly west of the map', () => {
    const f = computeFarField(15, 225, 0);
    const edge = farSample(f, -400, 30), far = farSample(f, -1000, 30);
    expect(far.tau).toBeCloseTo(edge.tau - 600 * f.dTauDx[0], 6);
    expect(far.amp).toBeCloseTo(1, 9);
  });
  it('stays finite for swell from the land or along the coast', () => {
    for (const from of [0, 45, 90, 135, 180]) {
      const f = computeFarField(15, from, 0);
      for (let x = -600; x <= 400; x += 13) {
        const s = farSample(f, x, -20);
        for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
```

`src/breaker/reefField.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type Bathymetry, buildBathymetry, downsample } from '../seabed/bathymetry';
import { depthBg } from '../seabed/coastProfile';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { AMP_CAP, farSample } from './coastFarField';
import { computeReefField, sampleField } from './reefField';

const reef05 = buildBathymetry();
const reef1 = downsample(reef05, 2);
const reef2 = downsample(reef05, 4);
// Solve the full 1 m field once (~1 s) and share it between the tests that inspect it.
const f225 = computeReefField({ bed: reef1, periodS: 15, fromDeg: 225, tideM: 0 });

function coastOnly(): Bathymetry {
  const grid = { x0: -400, z0: -100, cellM: 2, nx: 326, nz: 101 };
  const bed = new Float32Array(grid.nx * grid.nz);
  for (let r = 0; r < grid.nz; r++) for (let c = 0; c < grid.nx; c++) bed[r * grid.nx + c] = -depthBg(grid.x0 + c * grid.cellM);
  return { grid, bed, sand: new Float32Array(bed.length).fill(1), weed: new Float32Array(bed.length) };
}

const allFinite = (a: Float32Array) => a.every(Number.isFinite);
const along = (line: readonly (readonly [number, number])[], metres: number, step: number): [number, number][] => {
  const [a, b] = [line[0], line[1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out: [number, number][] = [];
  for (let s = 0; s <= metres + 1e-9; s += step) out.push([a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len]);
  return out;
};

describe('reef wave field', () => {
  it('equals the exact 1D coast solution on a reef-free coast (the far field joins seamlessly)', () => {
    const f = computeReefField({ bed: coastOnly(), periodS: 15, fromDeg: 225, tideM: 0 });
    for (const [x, z] of [[-300, 0], [-100, 40], [0, -20], [120, 60]] as const) {
      const inside = sampleField(f, x, z), analytic = farSample(f.far, x, z);
      expect(Math.abs(inside.tau - analytic.tau)).toBeLessThan(0.02 * Math.max(1, Math.abs(analytic.tau)) + 0.05);
      expect(inside.amp / analytic.amp).toBeCloseTo(1, 1);
    }
  });
  it('arrives at the peak at τ = 0', () => {
    const f = f225;
    expect(Math.abs(sampleField(f, 0, 0).tau)).toBeLessThan(0.05);
  });
  it('peels along the north ledge and stands up at once along the south ledge (the A-frame)', () => {
    const f = f225;
    const north = along(NORTH_LEDGE, 40, 5).map(([x, z]) => sampleField(f, x, z).tau);
    const south = along(SOUTH_LEDGE, 40, 5).map(([x, z]) => sampleField(f, x, z).tau);
    for (let i = 1; i < north.length; i++) expect(north[i]).toBeGreaterThan(north[i - 1]);
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(spread(south)).toBeLessThan(spread(north));
    const peelSpeed = 40 / (north[north.length - 1] - north[0]);
    console.log(`[reef] north-ledge peel speed ${peelSpeed.toFixed(1)} m/s; south-ledge arrival spread ${spread(south).toFixed(2)} s over 40 m`);
    expect(peelSpeed).toBeGreaterThan(3);
  });
  it('is finite, capped, and never records a shallower hmin than the water it has crossed allows', () => {
    const f = f225;
    for (const a of [f.tau, f.amp, f.hmin, f.k, f.dirX, f.dirZ, f.depth]) expect(allFinite(a)).toBe(true);
    for (let i = 0; i < f.amp.length; i += 97) {
      expect(f.amp[i]).toBeLessThanOrEqual(AMP_CAP);
      expect(f.hmin[i]).toBeLessThanOrEqual(f.depth[i] + 1e-4);
      expect(Math.hypot(f.dirX[i], f.dirZ[i])).toBeCloseTo(1, 4);
    }
  });
  it('unusual swell directions stay finite', () => {
    for (const fromDeg of [0, 45, 90, 135, 180, 315]) {
      const f = computeReefField({ bed: reef2, periodS: 15, fromDeg, tideM: 0 });
      for (const a of [f.tau, f.amp, f.hmin, f.k, f.dirX, f.dirZ]) expect(allFinite(a)).toBe(true);
    }
  });
  it('extreme tide stays finite (reef heads dry at −1.5 m)', () => {
    for (const tideM of [-1.5, 1.5]) for (const periodS of [4, 25]) {
      const f = computeReefField({ bed: reef2, periodS, fromDeg: 225, tideM });
      for (const a of [f.tau, f.amp, f.hmin, f.k]) expect(allFinite(a)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/breaker`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/breaker/fieldSample.ts`:

```ts
/** What the set-wave model needs to know about the water at one point, for the field's mean swell. */
export interface FieldSample {
  /** Arrival time (s) relative to the peak: a crest that reaches the peak at t0 is here at t0 + tau. */
  tau: number;
  /** Height amplification relative to the 30 m reference water (shoaling × refraction). */
  amp: number;
  /** Shallowest still-water depth (m) met on the way here (for the breaking-depth cap). */
  hmin: number;
  /** Local wavenumber (rad/m) for the mean period. */
  k: number;
  /** Unit travel direction. */
  dirX: number;
  dirZ: number;
  /** Still-water depth (m) here, including the tide. */
  depth: number;
}
```

`src/breaker/coastFarField.ts`:

```ts
import { travelDirectionXZ } from '../conditions/directions';
import { depthBg } from '../seabed/coastProfile';
import { MIN_DEPTH_M, groupSpeed, waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';

/** The map's west edge: the reference water (30 m) the set heights are defined in. */
export const FAR_X0 = -400;
export const FAR_X1 = 250;
export const FAR_DX = 0.5;
/** Refraction can focus energy; beyond ×4 the linear theory is meaningless anyway (and the depth cap rules). */
export const AMP_CAP = 4;
const MIN_COS = 0.05;

export interface FarField {
  omega: number;
  periodS: number;
  fromDeg: number;
  tideM: number;
  /** Travel direction in the reference water. */
  dirX: number;
  dirZ: number;
  /** Snell's invariant: the slowness component along the coast (s/m), the same at every x. */
  p: number;
  x0: number;
  dx: number;
  count: number;
  /** τ(x, z = 0) per sample, before the peak normalisation (s). */
  tau: Float64Array;
  /** ∂τ/∂x per sample (s/m). */
  dTauDx: Float32Array;
  amp: Float32Array;
  hmin: Float32Array;
  k: Float32Array;
  depth: Float32Array;
  /** Subtracted from every τ so that τ(peak) = 0; set by computeReefField. */
  tauOffset: number;
}

const depthWithTide = (x: number, tideM: number): number => Math.max(depthBg(x) + tideM, MIN_DEPTH_M);

/**
 * Exact 1D refraction and shoaling over the reef-free coast (depth varies with x only):
 * ∂τ/∂z = p (constant), ∂τ/∂x = ±√(s(x)² − p²), and A²·cg·cosθ is conserved.
 */
export function computeFarField(periodS: number, fromDeg: number, tideM: number): FarField {
  const omega = (2 * Math.PI) / periodS;
  const d = travelDirectionXZ(fromDeg);
  const hRef = depthWithTide(FAR_X0, tideM);
  const kRef = waveNumber(omega, hRef);
  const sRef = kRef / omega;
  const p = d.z * sRef;
  const sign = d.x >= 0 ? 1 : -1;
  const count = Math.round((FAR_X1 - FAR_X0) / FAR_DX) + 1;
  const tau = new Float64Array(count), dTauDx = new Float32Array(count), amp = new Float32Array(count);
  const hmin = new Float32Array(count), k = new Float32Array(count), depth = new Float32Array(count);
  const fluxRef = groupSpeed(omega, kRef, hRef) * Math.max(Math.abs(d.x), MIN_COS);
  const shallowEnd = depthWithTide(FAR_X1, tideM);
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const x = FAR_X0 + i * FAR_DX;
    const h = depthWithTide(x, tideM);
    const ki = waveNumber(omega, h);
    const s = ki / omega;
    const gx = sign * Math.sqrt(Math.max(s * s - p * p, 0));
    if (i > 0) acc += 0.5 * (gx + dTauDx[i - 1]) * FAR_DX;
    tau[i] = acc;
    dTauDx[i] = gx;
    k[i] = ki;
    depth[i] = h;
    const cosTheta = Math.max(Math.abs(gx) / s, MIN_COS);
    amp[i] = Math.min(AMP_CAP, Math.sqrt(fluxRef / (groupSpeed(omega, ki, h) * cosTheta)));
    hmin[i] = sign > 0 ? h : Math.min(h, shallowEnd);
  }
  return { omega, periodS, fromDeg, tideM, dirX: d.x, dirZ: d.z, p, x0: FAR_X0, dx: FAR_DX, count, tau, dTauDx, amp, hmin, k, depth, tauOffset: 0 };
}

/** The far field at any world point: interpolated across the coast, linear extrapolation beyond the table. */
export function farSample(f: FarField, x: number, z: number): FieldSample {
  const g = Math.min(f.count - 1, Math.max(0, (x - f.x0) / f.dx));
  const i = Math.min(f.count - 2, Math.floor(g));
  const t = g - i;
  const lerp = (a: ArrayLike<number>): number => a[i] + (a[i + 1] - a[i]) * t;
  const xc = f.x0 + g * f.dx;
  const dTauDx = lerp(f.dTauDx);
  const tau = lerp(f.tau) + (x - xc) * dTauDx + f.p * z - f.tauOffset;
  const len = Math.hypot(dTauDx, f.p);
  const dirX = len > 0 ? dTauDx / len : f.dirX;
  const dirZ = len > 0 ? f.p / len : f.dirZ;
  return { tau, amp: lerp(f.amp), hmin: lerp(f.hmin), k: lerp(f.k), dirX, dirZ, depth: lerp(f.depth) };
}
```

`src/breaker/reefField.ts`:

```ts
import type { Bathymetry } from '../seabed/bathymetry';
import type { GridSpec } from '../seabed/wombReef';
import { AMP_CAP, type FarField, computeFarField, farSample } from './coastFarField';
import { MIN_DEPTH_M, groupSpeed, waveNumber } from './dispersion';
import { solveEikonal } from './eikonal';
import type { FieldSample } from './fieldSample';

export interface ReefFieldRequest {
  /** The seabed on the field grid (1 m in the app: downsample(bathymetry, 2)). */
  bed: Bathymetry;
  periodS: number;
  fromDeg: number;
  tideM: number;
}

export interface ReefField {
  grid: GridSpec;
  /** Arrival time relative to the peak (s). */
  tau: Float32Array;
  amp: Float32Array;
  hmin: Float32Array;
  k: Float32Array;
  dirX: Float32Array;
  dirZ: Float32Array;
  depth: Float32Array;
  far: FarField;
  omega: number;
  periodS: number;
  fromDeg: number;
  tideM: number;
}

function bilinear(a: ArrayLike<number>, g: GridSpec, x: number, z: number): number {
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM)), fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM));
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * g.nx + c;
  const top = a[i] + (a[i + 1] - a[i]) * tx, bottom = a[i + g.nx] + (a[i + g.nx + 1] - a[i + g.nx]) * tx;
  return top + (bottom - top) * tz;
}

export function computeReefField(req: ReefFieldRequest): ReefField {
  const { grid } = req.bed;
  const { nx, nz, cellM, x0, z0 } = grid;
  const n = nx * nz;
  const omega = (2 * Math.PI) / req.periodS;
  const depth = new Float32Array(n), k = new Float32Array(n), slow = new Float32Array(n), cg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    depth[i] = Math.max(req.tideM - req.bed.bed[i], MIN_DEPTH_M);
    k[i] = waveNumber(omega, depth[i]);
    slow[i] = k[i] / omega;
    cg[i] = groupSpeed(omega, k[i], depth[i]);
  }
  const far = computeFarField(req.periodS, req.fromDeg, req.tideM);
  const farAt = (col: number, row: number): FieldSample => farSample(far, x0 + col * cellM, z0 + row * cellM);

  // Sources: every boundary cell the wave enters through takes the exact coast solution.
  const tau = new Float64Array(n).fill(Infinity);
  const fixed = new Uint8Array(n);
  const edges: [number, number, number, number][] = []; // col, row, outward nx, outward nz
  for (let col = 0; col < nx; col++) { edges.push([col, 0, 0, -1]); edges.push([col, nz - 1, 0, 1]); }
  for (let row = 0; row < nz; row++) { edges.push([0, row, -1, 0]); edges.push([nx - 1, row, 1, 0]); }
  for (const [col, row, ox, oz] of edges) {
    const f = farAt(col, row);
    if (f.dirX * ox + f.dirZ * oz < 0) {
      tau[row * nx + col] = f.tau;
      fixed[row * nx + col] = 1;
    }
  }
  solveEikonal(tau, fixed, slow, nx, nz, cellM);

  // Travel direction from ∇τ (central differences, one-sided at the edges).
  const dirX = new Float32Array(n), dirZ = new Float32Array(n);
  for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) {
    const i = row * nx + col;
    const gx = (tau[row * nx + Math.min(nx - 1, col + 1)] - tau[row * nx + Math.max(0, col - 1)]) / (cellM * (col > 0 && col < nx - 1 ? 2 : 1));
    const gz = (tau[Math.min(nz - 1, row + 1) * nx + col] - tau[Math.max(0, row - 1) * nx + col]) / (cellM * (row > 0 && row < nz - 1 ? 2 : 1));
    const len = Math.hypot(gx, gz);
    if (len > 1e-9 && Number.isFinite(len)) { dirX[i] = gx / len; dirZ[i] = gz / len; }
    else { const f = farAt(col, row); dirX[i] = f.dirX; dirZ[i] = f.dirZ; }
  }

  // Energy flux F = A²·cg conserved along rays: first-order upwind march in arrival order. Also carries hmin.
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => tau[a] - tau[b]);
  const flux = new Float64Array(n), hmin = new Float32Array(n), done = new Uint8Array(n);
  for (let o = 0; o < n; o++) {
    const i = order[o];
    const col = i % nx, row = (i - col) / nx;
    let wx = 0, wz = 0, fx = 0, fz = 0, hx = 0, hz = 0;
    if (!fixed[i]) {
      const ux = dirX[i] > 0 ? col - 1 : col + 1;
      const uz = dirZ[i] > 0 ? row - 1 : row + 1;
      if (ux >= 0 && ux < nx && done[row * nx + ux]) { const j = row * nx + ux; wx = Math.abs(dirX[j]); fx = flux[j]; hx = hmin[j]; }
      if (uz >= 0 && uz < nz && done[uz * nx + col]) { const j = uz * nx + col; wz = Math.abs(dirZ[j]); fz = flux[j]; hz = hmin[j]; }
    }
    const denom = Math.abs(dirX[i]) + Math.abs(dirZ[i]);
    if (fixed[i] || wx + wz < 1e-9 || denom < 1e-9) {
      const f = farAt(col, row);
      flux[i] = f.amp * f.amp * cg[i];
      hmin[i] = Math.min(depth[i], f.hmin);
    } else {
      flux[i] = (wx * fx + wz * fz) / denom;
      hmin[i] = Math.min(depth[i], (wx * hx + wz * hz) / (wx + wz));
    }
    done[i] = 1;
  }
  const rawAmp = new Float32Array(n);
  for (let i = 0; i < n; i++) rawAmp[i] = Math.min(AMP_CAP, Math.sqrt(flux[i] / cg[i]));
  // Light smoothing where rays converge at the wedge tip (stands in for diffraction).
  const amp = new Float32Array(n);
  for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) {
    const i = row * nx + col;
    if (row === 0 || col === 0 || row === nz - 1 || col === nx - 1) { amp[i] = rawAmp[i]; continue; }
    amp[i] = 0.5 * rawAmp[i] + 0.125 * (rawAmp[i - 1] + rawAmp[i + 1] + rawAmp[i - nx] + rawAmp[i + nx]);
  }

  // Normalise so the crest reaches the peak at τ = 0.
  const tauPeak = bilinear(tau, grid, 0, 0);
  const tau32 = new Float32Array(n);
  for (let i = 0; i < n; i++) tau32[i] = tau[i] - tauPeak;
  far.tauOffset = tauPeak;
  return { grid, tau: tau32, amp, hmin, k, dirX, dirZ, depth, far, omega, periodS: req.periodS, fromDeg: req.fromDeg, tideM: req.tideM };
}

/** Bilinear inside the field grid; the exact coast solution outside it. */
export function sampleField(f: ReefField, x: number, z: number): FieldSample {
  const g = f.grid;
  const inside = x >= g.x0 && z >= g.z0 && x <= g.x0 + (g.nx - 1) * g.cellM && z <= g.z0 + (g.nz - 1) * g.cellM;
  if (!inside) return farSample(f.far, x, z);
  const dirX = bilinear(f.dirX, g, x, z), dirZ = bilinear(f.dirZ, g, x, z);
  const len = Math.hypot(dirX, dirZ) || 1;
  return {
    tau: bilinear(f.tau, g, x, z), amp: bilinear(f.amp, g, x, z), hmin: bilinear(f.hmin, g, x, z),
    k: bilinear(f.k, g, x, z), dirX: dirX / len, dirZ: dirZ / len, depth: bilinear(f.depth, g, x, z),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/breaker && npm run typecheck`
Expected: PASS. Put the logged north-ledge peel speed and south-ledge spread in the task report; they are tuning inputs for Task 13.

- [ ] **Step 5: Commit**

```bash
git add src/breaker
git commit -m "feat: compute the reef wave field (arrival time, amplification, depth history) with a seamless far field

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The set-wave model (pure) and the field worker

**Files:**
- Create: `src/breaker/setWaveModel.ts`, `src/breaker/setWaveModel.test.ts`
- Create: `src/breaker/LatestOnly.ts`, `src/breaker/LatestOnly.test.ts`
- Create: `src/breaker/fieldWorker.ts`, `src/breaker/ReefFieldClient.ts`

**Interfaces:**
- Consumes: `FieldSample` (Task 6); `WaveEvent` (Task 4); `travelDirectionXZ`; `waveNumber`, `MIN_DEPTH_M` (Task 5); `computeReefField`, `ReefField`, `ReefFieldRequest` (Task 6).
- Produces:
  - `interface ActiveWave { arrivalS; heightM; omega; travelX; travelZ; crestLengthM; crestOffsetM }`.
  - `interface WaveContext { omega; travelX; travelZ }` (the field's mean swell).
  - `interface SetWaveResult { eta; dx; dz; slopeX; slopeZ }`.
  - `toActiveWave(e: WaveEvent): ActiveWave`.
  - `localHeight(w, f): number`.
  - `waveAt(x, z, t, f, w, ctx): SetWaveResult`.
  - `sumWaves(x, z, t, f, waves, ctx): SetWaveResult`.
  - The constants `BREAKING_RATIO = 0.78`, `ENVELOPE_WIDTH = 0.8`, `STOKES_CAP = 0.35`, `FOLD_LIMIT = 0.6`, `PITCH_MAX = 0.3`, `PITCH_KA_CAP = 0.12`, `TAPER_NEAR_M = 250`, `TAPER_FAR_M = 500`.
  - `class LatestOnly { next(): number; accept(id: number): boolean }`.
  - `class ReefFieldClient { onField: ((f: ReefField) => void) | null; request(req: ReefFieldRequest): void; dispose(): void }`.

**The model (Task 8 mirrors it line for line in TSL).** For wave *j* at a point:
- **Where it is:** ξ = t − arrival − τ − δτ. Here δτ = (d_j − d_mean)·x / c_local tilts the crest by the wave's own few degrees.
- **How high:** H = min(height·amp, 0.78·hmin), A = H/2.
- **Envelope:** a single crest with flanking troughs, env = exp(−(ξ / 0.8T)²).
- **Shape:** Stokes second order in finite depth, capped: η = A·env·lateral·(cos θ + B·cos 2θ), with θ = ω·ξ and B = min(0.35, k·A·(3 − σ²)/(4σ³)), σ = tanh(k·h).
- **Crest length:** a lateral taper applies only beyond 250–500 m from the peak.
- **Horizontal displacement:** along the local travel direction, dh = min(A_env, 0.6/k)·sin θ + pitch·η. The pitch leans the crest forward as H approaches the depth cap.
- **Slopes:** the chain rule through ξ (∇ξ = −(k/ω)·dir), divided by the along-ray Jacobian. The caps keep that Jacobian above 0.1, so the surface never folds.

- [ ] **Step 1: Write the failing tests**

`src/breaker/setWaveModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';
import { type ActiveWave, BREAKING_RATIO, type WaveContext, localHeight, sumWaves, toActiveWave, waveAt } from './setWaveModel';

const omega = (T: number) => (2 * Math.PI) / T;

function field1D(depth: number, T: number, amp = 1, hmin = depth): (x: number) => FieldSample {
  const k = waveNumber(omega(T), depth), c = omega(T) / k;
  return (x) => ({ tau: x / c, amp, hmin, k, dirX: 1, dirZ: 0, depth });
}
const ctxFor = (T: number): WaveContext => ({ omega: omega(T), travelX: 1, travelZ: 0 });
const wave = (T: number, heightM: number, arrivalS = 100): ActiveWave => ({
  arrivalS, heightM, omega: omega(T), travelX: 1, travelZ: 0, crestLengthM: 400, crestOffsetM: 0,
});

describe('set-wave model', () => {
  it('puts the crest at the peak at the arrival time', () => {
    const f = field1D(30, 15)(0);
    const crest = waveAt(0, 0, 100, f, wave(15, 2), ctxFor(15)).eta;
    expect(crest).toBeGreaterThan(waveAt(0, 0, 98, f, wave(15, 2), ctxFor(15)).eta);
    expect(crest).toBeGreaterThan(waveAt(0, 0, 102, f, wave(15, 2), ctxFor(15)).eta);
    expect(crest).toBeGreaterThan(0.99);
  });
  it('caps the height at 0.78 × the shallowest depth crossed', () => {
    const f: FieldSample = { tau: 0, amp: 3, hmin: 2, k: 0.2, dirX: 1, dirZ: 0, depth: 5 };
    expect(localHeight(wave(15, 5), f)).toBeCloseTo(BREAKING_RATIO * 2, 12);
    expect(localHeight(wave(15, 0.2), f)).toBeCloseTo(0.6, 12);
  });
  it('extreme waves in shallow water never fold and stay finite (12 ft, 25 s, 1.2 m of water; and a steep 4 s sea)', () => {
    const cases: [number, number, number, number][] = [[25, 1.2, 4, 8.6], [4, 30, 1, 3.4], [8, 2.5, 3, 6]]; // period, depth, amp, height
    for (const [T, depth, amp, height] of cases) {
      const f = field1D(depth, T, amp);
      const lambda = (2 * Math.PI) / f(0).k;
      for (const t of [100, 100.37 * (T / 4), 103.7, 110]) {
        let prevX = -Infinity;
        for (let x = -2 * lambda; x <= 2 * lambda; x += lambda / 2000) {
          const r = waveAt(x, 0, t, f(x), wave(T, height), ctxFor(T));
          for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
          const X = x + r.dx;
          expect(X).toBeGreaterThan(prevX);
          prevX = X;
        }
      }
    }
  });
  it('is a single crest: three periods away it has all but vanished', () => {
    const f = field1D(30, 15)(0);
    const crest = waveAt(0, 0, 100, f, wave(15, 2), ctxFor(15)).eta;
    expect(Math.abs(waveAt(0, 0, 145, f, wave(15, 2), ctxFor(15)).eta)).toBeLessThan(0.05 * crest);
  });
  it('tapers the crest ends far out, not near the reef', () => {
    const T = 15, k = waveNumber(omega(T), 30);
    const at = (x: number, z: number) => ({ tau: x * (k / omega(T)), amp: 1, hmin: 30, k, dirX: 1, dirZ: 0, depth: 30 });
    const w = wave(T, 2, 0);
    const onAxisFar = waveAt(-800, 0, -800 * (k / omega(T)), at(-800, 0), w, ctxFor(T)).eta;
    const offAxisFar = waveAt(-800, 400, -800 * (k / omega(T)), at(-800, 400), w, ctxFor(T)).eta;
    const offAxisNear = waveAt(-100, 150, -100 * (k / omega(T)), at(-100, 150), w, ctxFor(T)).eta;
    expect(Math.abs(offAxisFar)).toBeLessThan(0.05 * onAxisFar);
    expect(offAxisNear).toBeGreaterThan(0.9 * onAxisFar);
  });
  it('slopes match the numerical derivative for small waves', () => {
    const T = 15, f = field1D(30, T);
    const w = wave(T, 0.1);
    for (const x of [-40, -10, 5, 30]) {
      const e = 0.01;
      const numeric = (waveAt(x + e, 0, 100, f(x + e), w, ctxFor(T)).eta - waveAt(x - e, 0, 100, f(x - e), w, ctxFor(T)).eta) / (2 * e);
      const analytic = waveAt(x, 0, 100, f(x), w, ctxFor(T)).slopeX;
      expect(Math.abs(analytic - numeric)).toBeLessThan(0.05 * Math.abs(numeric) + 1e-5);
    }
  });
  it('sums waves and treats zero height as nothing', () => {
    const f = field1D(30, 15)(0);
    const a = waveAt(0, 0, 100, f, wave(15, 1, 100), ctxFor(15));
    const b = waveAt(0, 0, 100, f, wave(15, 1, 115), ctxFor(15));
    expect(sumWaves(0, 0, 100, f, [wave(15, 1, 100), wave(15, 1, 115)], ctxFor(15)).eta).toBeCloseTo(a.eta + b.eta, 12);
    expect(waveAt(0, 0, 100, f, wave(15, 0), ctxFor(15))).toEqual({ eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0 });
  });
  it('converts set events into active waves', () => {
    const w = toActiveWave({ id: 1, slot: 0, indexInSet: 0, waveCount: 5, arrivalS: 42, heightM: 2.5, periodS: 14, fromDeg: 225, crestLengthM: 350, crestOffsetM: 10 });
    expect(w.omega).toBeCloseTo((2 * Math.PI) / 14, 12);
    expect(w.travelX).toBeCloseTo(Math.SQRT1_2, 9);
    expect(w.travelZ).toBeCloseTo(-Math.SQRT1_2, 9);
  });
});
```

`src/breaker/LatestOnly.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LatestOnly } from './LatestOnly';

describe('LatestOnly', () => {
  it('LatestOnly ignores stale replies', () => {
    const l = new LatestOnly();
    const a = l.next(), b = l.next(), c = l.next();
    expect(l.accept(a)).toBe(false);
    expect(l.accept(b)).toBe(false);
    expect(l.accept(c)).toBe(true);
    expect(l.accept(c)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/breaker/setWaveModel.test.ts src/breaker/LatestOnly.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/breaker/setWaveModel.ts`:

```ts
import { travelDirectionXZ } from '../conditions/directions';
import type { WaveEvent } from '../swell/sets';
import { MIN_DEPTH_M } from './dispersion';
import type { FieldSample } from './fieldSample';

/** A wave breaks when its height reaches about 0.78 × depth; Phase 1 caps it there (the "fade"). */
export const BREAKING_RATIO = 0.78;
/** Envelope width in periods: one crest with flanking troughs, not an endless train. */
export const ENVELOPE_WIDTH = 0.8;
/** Largest second-harmonic ratio (Stokes breaks down in very shallow water). */
export const STOKES_CAP = 0.35;
/** k × horizontal amplitude never exceeds this (keeps the along-ray Jacobian positive). */
export const FOLD_LIMIT = 0.6;
/** Forward lean as a wave nears the depth cap… */
export const PITCH_MAX = 0.3;
/** …bounded so that pitch × k × A ≤ this. */
export const PITCH_KA_CAP = 0.12;
/** Crest ends taper between these distances from the peak (the crest spans the whole reef near it). */
export const TAPER_NEAR_M = 250;
export const TAPER_FAR_M = 500;

export interface ActiveWave {
  arrivalS: number;
  heightM: number;
  omega: number;
  travelX: number;
  travelZ: number;
  crestLengthM: number;
  crestOffsetM: number;
}

/** The field's mean swell (the field was computed for this frequency and direction). */
export interface WaveContext {
  omega: number;
  travelX: number;
  travelZ: number;
}

export interface SetWaveResult {
  eta: number;
  dx: number;
  dz: number;
  slopeX: number;
  slopeZ: number;
}

const ZERO: SetWaveResult = { eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0 };

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function toActiveWave(e: WaveEvent): ActiveWave {
  const d = travelDirectionXZ(e.fromDeg);
  return {
    arrivalS: e.arrivalS, heightM: e.heightM, omega: (2 * Math.PI) / e.periodS,
    travelX: d.x, travelZ: d.z, crestLengthM: e.crestLengthM, crestOffsetM: e.crestOffsetM,
  };
}

export function localHeight(w: ActiveWave, f: FieldSample): number {
  return Math.min(w.heightM * f.amp, BREAKING_RATIO * f.hmin);
}

export function waveAt(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext): SetWaveResult {
  const H = localHeight(w, f);
  if (!(H > 0)) return { ...ZERO };
  const A = H / 2;
  const cLocal = ctx.omega / f.k;
  const dTau = ((w.travelX - ctx.travelX) * x + (w.travelZ - ctx.travelZ) * z) / cLocal;
  const xi = t - w.arrivalS - f.tau - dTau;
  const width = (ENVELOPE_WIDTH * 2 * Math.PI) / w.omega;
  const env = Math.exp(-((xi / width) ** 2));
  const dEnv = ((-2 * xi) / (width * width)) * env;
  const sigma = Math.max(Math.tanh(f.k * f.depth), 0.05);
  const B = Math.min(STOKES_CAP, (f.k * A * (3 - sigma * sigma)) / (4 * sigma * sigma * sigma));
  const wFar = smoothstep(TAPER_NEAR_M, TAPER_FAR_M, Math.hypot(x, z));
  const q = (2 * (-x * w.travelZ + z * w.travelX - w.crestOffsetM)) / w.crestLengthM;
  const lateral = 1 + (Math.exp(-(q * q * q * q)) - 1) * wFar;
  const theta = w.omega * xi;
  const aE = A * env * lateral;
  const shape = Math.cos(theta) + B * Math.cos(2 * theta);
  const eta = aE * shape;
  const hAmp = Math.min(aE, FOLD_LIMIT / f.k);
  const nearBreaking = smoothstep(0.3, BREAKING_RATIO, H / Math.max(f.hmin, MIN_DEPTH_M));
  const pitch = Math.min(PITCH_MAX * nearBreaking, PITCH_KA_CAP / Math.max(f.k * aE, 1e-4));
  const dh = hAmp * Math.sin(theta) + pitch * eta;
  const dEtaDXi = A * lateral * (dEnv * shape - env * w.omega * (Math.sin(theta) + 2 * B * Math.sin(2 * theta)));
  const dXiDs = -f.k / ctx.omega;
  const jacobian = Math.max(0.2, 1 + (hAmp * w.omega * Math.cos(theta) + pitch * dEtaDXi) * dXiDs);
  const slopeAlong = (dEtaDXi * dXiDs) / jacobian;
  return { eta, dx: f.dirX * dh, dz: f.dirZ * dh, slopeX: f.dirX * slopeAlong, slopeZ: f.dirZ * slopeAlong };
}

export function sumWaves(x: number, z: number, t: number, f: FieldSample, waves: readonly ActiveWave[], ctx: WaveContext): SetWaveResult {
  const out = { ...ZERO };
  for (const w of waves) {
    const r = waveAt(x, z, t, f, w, ctx);
    out.eta += r.eta; out.dx += r.dx; out.dz += r.dz; out.slopeX += r.slopeX; out.slopeZ += r.slopeZ;
  }
  return out;
}
```

`src/breaker/LatestOnly.ts`:

```ts
/** Tags requests; only the reply to the most recent request is accepted (stale worker results are dropped). */
export class LatestOnly {
  private latest = 0;

  next(): number {
    this.latest += 1;
    return this.latest;
  }

  accept(id: number): boolean {
    return id === this.latest;
  }
}
```

`src/breaker/fieldWorker.ts`:

```ts
import { computeReefField, type ReefFieldRequest } from './reefField';

type Message = ReefFieldRequest & { id: number };

// This file runs in a dedicated worker, but the project's DOM lib types `self` as Window: cast once here.
const worker = self as unknown as Worker;

worker.onmessage = (e: MessageEvent<Message>) => {
  const { id, ...req } = e.data;
  const field = computeReefField(req);
  const transfer = [field.tau, field.amp, field.hmin, field.k, field.dirX, field.dirZ, field.depth,
    field.far.tau, field.far.dTauDx, field.far.amp, field.far.hmin, field.far.k, field.far.depth].map((a) => a.buffer as ArrayBuffer);
  worker.postMessage({ id, field }, transfer);
};
```

`src/breaker/ReefFieldClient.ts`:

```ts
import { LatestOnly } from './LatestOnly';
import type { ReefField, ReefFieldRequest } from './reefField';

/** Solves the reef wave field off the main thread; only the newest request's answer is delivered. */
export class ReefFieldClient {
  onField: ((f: ReefField) => void) | null = null;
  private readonly worker = new Worker(new URL('./fieldWorker.ts', import.meta.url), { type: 'module' });
  private readonly latest = new LatestOnly();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<{ id: number; field: ReefField }>) => {
      if (this.latest.accept(e.data.id)) this.onField?.(e.data.field);
    };
    this.worker.onerror = (e) => console.warn('Reef field worker failed; keeping the previous field', e.message);
  }

  request(req: ReefFieldRequest): void {
    this.worker.postMessage({ id: this.latest.next(), ...req });
  }

  dispose(): void {
    this.worker.terminate();
  }
}
```

- [ ] **Step 4: Run all tests, typecheck and build (the worker must bundle)**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS. The build output lists a separate `fieldWorker-*.js` chunk.

- [ ] **Step 5: Commit**

```bash
git add src/breaker
git commit -m "feat: set-wave model (capped, never folding) and an off-thread reef field worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Set waves on the GPU (field textures, wave buffer, TSL mirror of the model)

**Files:**
- Create: `src/breaker/SetWaves.ts`
- Create: `src/breaker/breaker.selftest.ts`
- Modify: `src/dev/selfTests.ts`

**Interfaces:**
- Consumes:
  - Task 6: `ReefField`, `computeReefField`, `sampleField`, `FAR_X0`, `FAR_DX`.
  - Task 7: the model constants, `toActiveWave`, `sumWaves`, `WaveContext`.
  - Task 4: `WaveEvent`, `MAX_ACTIVE_WAVES`, `wavesOfSet`, `wavesNear`, `DEFAULT_SET_PARAMS`.
  - `REEF_GRID` (the field grid is its 2× downsample: 650 × 750 at 1 m, origin (−399.75, −449.75)).
- Produces: `class SetWaves`:
  - `constructor(time: UniformNode<float>)` (the ocean's sim-time uniform);
  - `setField(f: ReefField)` and `hasField: boolean`;
  - `setEvents(events: readonly WaveEvent[])`;
  - `sample(xz: N): { tau; amp; hmin; k; dir; depth }` (nodes);
  - `displacementNode(xz: N): N` (vec3(dx, η, dz));
  - `slopeNode(xz: N): N` (vec2(∂η/∂x, ∂η/∂z));
  - `tauNode(xz: N): N` (for debug overlays).

Field data lives in two RGBA `FloatType` DataTextures (650 × 750):
- **A:** τ, amp, hmin, k;
- **B:** dirX, dirZ, depth, 0.

The far-field table is two more (count × 1):
- **A:** τ1 − offset, amp, hmin, k;
- **B:** ∂τ/∂x, depth, 0, 0.

All are read with `textureLoad` and manual bilinear interpolation (Global Constraints). Waves live in a read-only storage buffer, two vec4 per wave:
- (arrivalS, heightM, ω, crestLengthM);
- (travelX, travelZ, crestOffsetM, 0).

Unused slots have height 0, ω = 1 and crest length 1, so they contribute exactly zero with no divide-by-zero.

- [ ] **Step 1: Write the GPU self-tests (the failing check)**

`src/breaker/breaker.selftest.ts`:

```ts
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, uniform, vec4 } from 'three/tsl';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { computeReefField, sampleField } from './reefField';
import { SetWaves } from './SetWaves';
import { sumWaves, toActiveWave } from './setWaveModel';

const POINTS: [number, number][] = [
  [0, 0], [-20, 30], [-30, -60], [25, 28], [50, -110], [-300, 100], [150, -300], [-800, 50], [0, 600], [300, 0],
];

function readPass(n: number, body: (xz: any) => [any, any]) {
  const inAttr = new THREE.StorageBufferAttribute(new Float32Array(POINTS.flatMap(([x, z]) => [x, z, 0, 0])), 4);
  const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 8), 4);
  const input = storage(inAttr, 'vec4', n).toReadOnly();
  const output = storage(outAttr, 'vec4', n * 2);
  const pass = Fn(() => {
    const [a, b] = body(input.element(instanceIndex).xy);
    output.element(instanceIndex.mul(2)).assign(a);
    output.element(instanceIndex.mul(2).add(1)).assign(b);
  })().compute(n) as THREE.ComputeNode;
  return { pass, outAttr };
}

let shared: { field: ReturnType<typeof computeReefField> } | null = null;
const getField = () => (shared ??= { field: computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 }) }).field;

registerSelfTest({
  name: 'breaker: GPU field sampling matches the CPU field (inside and far field)',
  async run(renderer) {
    const field = getField();
    const sets = new SetWaves(uniform(0));
    sets.setField(field);
    const { pass, outAttr } = readPass(POINTS.length, (xz) => {
      const s = sets.sample(xz);
      return [vec4(s.tau, s.amp, s.hmin, s.k), vec4(s.dir.x, s.dir.y, s.depth, 0.0)];
    });
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const notes: string[] = [];
    POINTS.forEach(([x, z], i) => {
      const c = sampleField(field, x, z);
      const g = out.slice(i * 8, i * 8 + 8);
      const errs = [g[0] - c.tau, g[1] - c.amp, g[2] - c.hmin, (g[3] - c.k) * 100, g[4] - c.dirX, g[5] - c.dirZ, g[6] - c.depth].map(Math.abs);
      const e = Math.max(...errs);
      worst = Math.max(worst, e);
      notes.push(`(${x},${z}) τ ${g[0].toFixed(2)}/${c.tau.toFixed(2)} amp ${g[1].toFixed(2)}/${c.amp.toFixed(2)}`);
    });
    return { pass: worst < 0.02, detail: `worst ${worst.toFixed(4)}; ${notes.join('; ')}` };
  },
});

registerSelfTest({
  name: 'breaker: GPU set-wave height, displacement and slope match the CPU model',
  async run(renderer) {
    const field = getField();
    const t = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)[2].arrivalS;
    const events = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
    const sets = new SetWaves(uniform(t));
    sets.setField(field);
    sets.setEvents(events);
    const { pass, outAttr } = readPass(POINTS.length, (xz) => {
      const d = sets.displacementNode(xz), s = sets.slopeNode(xz);
      return [vec4(d, 0.0), vec4(s, 0.0, 0.0)];
    });
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const waves = events.map(toActiveWave);
    let worst = 0;
    const notes: string[] = [];
    POINTS.forEach(([x, z], i) => {
      const c = sumWaves(x, z, t, sampleField(field, x, z), waves, ctx);
      const g = out.slice(i * 8, i * 8 + 8);
      const e = Math.max(Math.abs(g[0] - c.dx), Math.abs(g[1] - c.eta), Math.abs(g[2] - c.dz), Math.abs(g[4] - c.slopeX) * 4, Math.abs(g[5] - c.slopeZ) * 4);
      worst = Math.max(worst, e);
      notes.push(`(${x},${z}) η ${g[1].toFixed(3)}/${c.eta.toFixed(3)}`);
    });
    return { pass: worst < 0.02, detail: `${events.length} waves; worst ${worst.toFixed(4)}; ${notes.join('; ')}` };
  },
});
```

Add to `src/dev/selfTests.ts`:

```ts
import '../breaker/breaker.selftest';
```

- [ ] **Step 2: Confirm it fails to build**

Run: `npm run typecheck`
Expected: FAIL (`./SetWaves` missing).

- [ ] **Step 3: Implement `src/breaker/SetWaves.ts`**

```ts
import * as THREE from 'three/webgpu';
import {
  Fn, Loop, clamp, cos, exp, float, floor, int, ivec2, length, max, min, mix, select, sin, smoothstep, storage, tanh,
  textureLoad, uniform, vec2, vec3,
} from 'three/tsl';
import { REEF_GRID } from '../seabed/wombReef';
import { MAX_ACTIVE_WAVES, type WaveEvent } from '../swell/sets';
import { FAR_DX, FAR_X0, FAR_X1 } from './coastFarField';
import { MIN_DEPTH_M } from './dispersion';
import type { ReefField } from './reefField';
import {
  BREAKING_RATIO, ENVELOPE_WIDTH, FOLD_LIMIT, PITCH_KA_CAP, PITCH_MAX, STOKES_CAP, TAPER_FAR_M, TAPER_NEAR_M, toActiveWave,
} from './setWaveModel';

type N = any;

const FIELD_NX = REEF_GRID.nx / 2;
const FIELD_NZ = REEF_GRID.nz / 2;
const FAR_COUNT = Math.round((FAR_X1 - FAR_X0) / FAR_DX) + 1;

function floatTexture(width: number, height: number): THREE.DataTexture {
  const data = new Float32Array(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 1;
  const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Manual bilinear over a float texture (float32 textures need not be filterable). g is in texel units. */
function bilinearLoad(tex: THREE.Texture, g: N, maxIndex: N): N {
  const gc = clamp(g, vec2(0.0), maxIndex.sub(0.001));
  const base = floor(gc);
  const t = gc.sub(base);
  const i0 = ivec2(base);
  const load = (dx: number, dz: number): N => textureLoad(tex, i0.add(ivec2(dx, dz)), int(0));
  return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
}

/** Linear interpolation along row 0 of a width × 1 float texture. g is in texel units. */
function linearLoad1D(tex: THREE.Texture, g: N, maxIndex: N): N {
  const gc = clamp(g, 0.0, maxIndex.sub(0.001));
  const base = floor(gc);
  const i0 = int(base);
  return mix(textureLoad(tex, ivec2(i0, int(0)), int(0)), textureLoad(tex, ivec2(i0.add(1), int(0)), int(0)), gc.sub(base));
}

const safeNormalize = (v: N): N => v.div(max(length(v), 1e-6));

/** The set waves on the GPU: the reef field, the far field and the active waves; a TSL mirror of setWaveModel. */
export class SetWaves {
  hasField = false;
  private readonly fieldA = floatTexture(FIELD_NX, FIELD_NZ);
  private readonly fieldB = floatTexture(FIELD_NX, FIELD_NZ);
  private readonly farA = floatTexture(FAR_COUNT, 1);
  private readonly farB = floatTexture(FAR_COUNT, 1);
  private readonly origin = uniform(new THREE.Vector2(REEF_GRID.x0 + REEF_GRID.cellM / 2, REEF_GRID.z0 + REEF_GRID.cellM / 2));
  private readonly cell = uniform(REEF_GRID.cellM * 2);
  private readonly fieldMax = uniform(new THREE.Vector2(FIELD_NX - 1, FIELD_NZ - 1));
  private readonly farMax = uniform(new THREE.Vector2(FAR_COUNT - 1, 0));
  private readonly farP = uniform(0);
  private readonly meanOmega = uniform(1);
  private readonly meanTravel = uniform(new THREE.Vector2(1, 0));
  private readonly wavesAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_ACTIVE_WAVES * 8), 4);
  private readonly waves = storage(this.wavesAttr, 'vec4', MAX_ACTIVE_WAVES * 2).toReadOnly();

  constructor(private readonly time: N) {
    this.setEvents([]);
  }

  setField(f: ReefField): void {
    if (f.grid.nx !== FIELD_NX || f.grid.nz !== FIELD_NZ || f.far.count !== FAR_COUNT) throw new Error('Reef field grid does not match SetWaves');
    const a = this.fieldA.image.data as Float32Array, b = this.fieldB.image.data as Float32Array;
    for (let i = 0; i < f.tau.length; i++) {
      a[i * 4] = f.tau[i]; a[i * 4 + 1] = f.amp[i]; a[i * 4 + 2] = f.hmin[i]; a[i * 4 + 3] = f.k[i];
      b[i * 4] = f.dirX[i]; b[i * 4 + 1] = f.dirZ[i]; b[i * 4 + 2] = f.depth[i]; b[i * 4 + 3] = 0;
    }
    const fa = this.farA.image.data as Float32Array, fb = this.farB.image.data as Float32Array;
    for (let i = 0; i < f.far.count; i++) {
      fa[i * 4] = f.far.tau[i] - f.far.tauOffset; fa[i * 4 + 1] = f.far.amp[i]; fa[i * 4 + 2] = f.far.hmin[i]; fa[i * 4 + 3] = f.far.k[i];
      fb[i * 4] = f.far.dTauDx[i]; fb[i * 4 + 1] = f.far.depth[i]; fb[i * 4 + 2] = 0; fb[i * 4 + 3] = 0;
    }
    for (const t of [this.fieldA, this.fieldB, this.farA, this.farB]) t.needsUpdate = true;
    this.origin.value.set(f.grid.x0, f.grid.z0);
    this.cell.value = f.grid.cellM;
    this.farP.value = f.far.p;
    this.meanOmega.value = f.omega;
    this.meanTravel.value.set(f.far.dirX, f.far.dirZ);
    this.hasField = true;
  }

  setEvents(events: readonly WaveEvent[]): void {
    const d = this.wavesAttr.array as Float32Array;
    for (let i = 0; i < MAX_ACTIVE_WAVES; i++) {
      const e = events[i];
      const w = e ? toActiveWave(e) : null;
      d.set(w ? [w.arrivalS, w.heightM, w.omega, w.crestLengthM] : [0, 0, 1, 1], i * 8);
      d.set(w ? [w.travelX, w.travelZ, w.crestOffsetM, 0] : [1, 0, 0, 0], i * 8 + 4);
    }
    this.wavesAttr.needsUpdate = true;
  }

  /** The field at world xz: bilinear inside the reef grid, the exact coast solution outside (TSL mirror of sampleField). */
  sample(xz: N): { tau: N; amp: N; hmin: N; k: N; dir: N; depth: N } {
    const g = xz.sub(this.origin).div(this.cell);
    const inside = g.x.greaterThanEqual(0.0).and(g.y.greaterThanEqual(0.0)).and(g.x.lessThanEqual(this.fieldMax.x)).and(g.y.lessThanEqual(this.fieldMax.y));
    const a = bilinearLoad(this.fieldA, g, this.fieldMax);
    const b = bilinearLoad(this.fieldB, g, this.fieldMax);
    const fg = clamp(xz.x.sub(FAR_X0).div(FAR_DX), 0.0, this.farMax.x.sub(0.001));
    const fa = linearLoad1D(this.farA, fg, this.farMax.x);
    const fb = linearLoad1D(this.farB, fg, this.farMax.x);
    const xc = fg.mul(FAR_DX).add(FAR_X0);
    const farTau = fa.x.add(xz.x.sub(xc).mul(fb.x)).add(this.farP.mul(xz.y));
    return {
      tau: select(inside, a.x, farTau),
      amp: select(inside, a.y, fa.y),
      hmin: select(inside, a.z, fa.z),
      k: max(select(inside, a.w, fa.w), 1e-4),
      dir: select(inside, safeNormalize(b.xy), safeNormalize(vec2(fb.x, this.farP))),
      depth: select(inside, b.z, fb.y),
    };
  }

  /** Σ over the active waves of the setWaveModel formulas. Must be called inside an Fn. */
  private sum(xz: N): { eta: N; dh: N; slope: N } {
    const f = this.sample(xz);
    const eta = float(0.0).toVar(), dh = vec2(0.0).toVar(), slope = vec2(0.0).toVar();
    const wFar = smoothstep(TAPER_NEAR_M, TAPER_FAR_M, length(xz));
    const sigma = max(tanh(f.k.mul(f.depth)), 0.05);
    const stokesPerA = f.k.mul(float(3.0).sub(sigma.mul(sigma))).div(sigma.mul(sigma).mul(sigma).mul(4.0));
    const cLocal = this.meanOmega.div(f.k);
    const dXiDs = f.k.negate().div(this.meanOmega);
    Loop(MAX_ACTIVE_WAVES, ({ i }: N) => {
      const a = this.waves.element(i.mul(2));
      const b = this.waves.element(i.mul(2).add(1));
      const H = min(a.y.mul(f.amp), f.hmin.mul(BREAKING_RATIO));
      const A = H.mul(0.5);
      const dTau = b.x.sub(this.meanTravel.x).mul(xz.x).add(b.y.sub(this.meanTravel.y).mul(xz.y)).div(cLocal);
      const xi = this.time.sub(a.x).sub(f.tau).sub(dTau);
      const width = float(ENVELOPE_WIDTH * 2 * Math.PI).div(a.z);
      const r = xi.div(width);
      const env = exp(r.mul(r).negate());
      const dEnv = xi.mul(-2.0).div(width.mul(width)).mul(env);
      const B = min(float(STOKES_CAP), stokesPerA.mul(A));
      const q = xz.x.negate().mul(b.y).add(xz.y.mul(b.x)).sub(b.z).mul(2.0).div(a.w);
      const q2 = q.mul(q);
      const lateral = mix(float(1.0), exp(q2.mul(q2).negate()), wFar);
      const theta = a.z.mul(xi);
      const aE = A.mul(env).mul(lateral);
      const shape = cos(theta).add(B.mul(cos(theta.mul(2.0))));
      const e = aE.mul(shape);
      const hAmp = min(aE, float(FOLD_LIMIT).div(f.k));
      const nearBreaking = smoothstep(0.3, BREAKING_RATIO, H.div(max(f.hmin, MIN_DEPTH_M)));
      const pitch = min(nearBreaking.mul(PITCH_MAX), float(PITCH_KA_CAP).div(max(f.k.mul(aE), 1e-4)));
      const d = hAmp.mul(sin(theta)).add(pitch.mul(e));
      const dEtaDXi = A.mul(lateral).mul(dEnv.mul(shape).sub(env.mul(a.z).mul(sin(theta).add(B.mul(2.0).mul(sin(theta.mul(2.0)))))));
      const jacobian = max(float(1.0).add(hAmp.mul(a.z).mul(cos(theta)).add(pitch.mul(dEtaDXi)).mul(dXiDs)), 0.2);
      const along = dEtaDXi.mul(dXiDs).div(jacobian);
      eta.addAssign(e);
      dh.addAssign(f.dir.mul(d));
      slope.addAssign(f.dir.mul(along));
    });
    return { eta, dh, slope };
  }

  /** vec3(dx, η, dz): the set waves' displacement at undisplaced world xz. */
  displacementNode(xz: N): N {
    return Fn(() => {
      const s = this.sum(xz);
      return vec3(s.dh.x, s.eta, s.dh.y);
    })();
  }

  /** vec2(∂η/∂x, ∂η/∂z) of the set waves (Eulerian, Jacobian-corrected). */
  slopeNode(xz: N): N {
    return Fn(() => this.sum(xz).slope)();
  }

  tauNode(xz: N): N {
    return this.sample(xz).tau;
  }
}
```

Before the first field arrives, amp is 0 everywhere, so there are no set waves. `k` is floored at 1e-4 so no division is ever by zero.

- [ ] **Step 4: Typecheck, test, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean.

- [ ] **Step 5: GPU check (controller)**

Report as pending: "expect both `breaker:` self-tests to PASS; `?selftest` shows 16/16".

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: set waves on the GPU, mirroring the tested model over the reef field

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: One water surface: tide, set waves and shallow-water swell fade in the render and the height probe

**Files:**
- Create: `src/ocean/waterSurface.ts`
- Modify: `src/ocean/OceanSurface.ts` (constructor signature, vertex and fragment)
- Modify: `src/ocean/HeightProbe.ts` (constructor signature, displacement)
- Modify: `src/ocean/probe.selftest.ts` (construct through the model)
- Modify: `src/app/App.ts` (seabed, set waves, field client, per-frame events, tide)

**Interfaces:**
- Consumes: `Seabed` (Task 3), `SetWaves` (Task 8), `ReefFieldClient` (Task 7), `wavesNear`, `SetParams`, `DEFAULT_SET_PARAMS` (Task 4), `buildBathymetry`, `downsample`, `ReefParams`, `DEFAULT_REEF_PARAMS` (Task 2), `OceanSimulation`, `CASCADE_FADES`, `fadeWeightNode`.
- Produces:
  - `interface ShallowSwellParams { fadeFromM: number; fadeToM: number }` and `DEFAULT_SHALLOW_SWELL = { fadeFromM: 6, fadeToM: 14 }`.
  - `class WaterSurfaceModel`:
    - `constructor(sim, seabed, sets)`;
    - `setParams(p: ShallowSwellParams)`;
    - `swellWeight(xz: N): N`;
    - `displacement(xz: N, lod?: (cascade: number) => N): N` (vec3, relative to the tide level);
    - `fftSlopes(xz: N, distance: N, slopeVariance: readonly N[]): { sx, sz, jxx, jzz, foam, lostSlopeVariance }`;
    - `readonly sim; readonly seabed; readonly sets`.
  - `new OceanSurface(model, sky, optics)` and `new HeightProbe(model)`.

This task makes "one source of truth" literal. The render's vertex positions and the probe's heights both come from `WaterSurfaceModel.displacement`, and the tide is added once, at the same place, in both.

- [ ] **Step 1: Write the probe self-test update (the failing check)**

`src/ocean/probe.selftest.ts`: every `new HeightProbe(sim)` becomes `new HeightProbe(model)`, with the model built from the same `sim`:

```ts
import { WaterSurfaceModel } from './waterSurface';
import { Seabed } from '../seabed/Seabed';
import { buildBathymetry } from '../seabed/bathymetry';
import { SetWaves } from '../breaker/SetWaves';
// …inside each test, after creating and updating `sim`:
const model = new WaterSurfaceModel(sim, new Seabed(buildBathymetry()), new SetWaves(sim.time));
const probe = new HeightProbe(model);
```

The flat-calm test places its probes where the seabed is deep (keep its existing points, or use x ≤ −200 if any point lands on the reef), so the long-swell fade does not change its expectation. Add one new test to the same file:

```ts
registerSelfTest({
  name: 'probe: the water sits on the tide (flat sea, tide +0.8 m reads 0.8 m)',
  async run(renderer) {
    const flat = cloneConditions(DEFAULT_CONDITIONS);
    flat.swell.sizeFt = 0;
    flat.wind.speedMs = 0;
    const sim = new OceanSimulation();
    sim.setConditions(flat);
    sim.update(renderer, 10, 1 / 60);
    const seabed = new Seabed(buildBathymetry());
    seabed.setTide(0.8);
    const probe = new HeightProbe(new WaterSurfaceModel(sim, seabed, new SetWaves(sim.time)));
    probe.setProbe(0, -300, 0);
    probe.setProbe(1, 40, -120);
    const out = await probe.readNow(renderer);
    const ok = Math.abs(out[0] - 0.8) < 1e-3 && Math.abs(out[4] - 0.8) < 1e-3;
    return { pass: ok, detail: `deep ${out[0].toFixed(4)}, over the shelf ${out[4].toFixed(4)}` };
  },
});
```

(Import `cloneConditions`, `DEFAULT_CONDITIONS` and `OceanSimulation` if the file does not already.)

- [ ] **Step 2: Confirm it fails to build**

Run: `npm run typecheck`
Expected: FAIL (`./waterSurface` missing; constructor signatures).

- [ ] **Step 3: Implement**

`src/ocean/waterSurface.ts`:

```ts
import { float, max, smoothstep, texture, uniform, vec3 } from 'three/tsl';
import type { SetWaves } from '../breaker/SetWaves';
import type { Seabed } from '../seabed/Seabed';
import { CASCADE_FADES, fadeWeightNode } from './cascadeFades';
import type { OceanSimulation } from './OceanSimulation';

type N = any;

export interface ShallowSwellParams {
  /** The FFT's long-swell cascade is gone in water shallower than this… */
  fadeFromM: number;
  /** …and at full strength deeper than this. */
  fadeToM: number;
}

export const DEFAULT_SHALLOW_SWELL: ShallowSwellParams = { fadeFromM: 6, fadeToM: 14 };

/** The index of the FFT cascade that carries the long swell (3000 m patch). */
const LONG_SWELL_CASCADE = 0;

/**
 * The water surface, defined once: FFT background (long swell faded over shallow water) + reef-shaped set waves,
 * on the tide. The rendered mesh and the height probe both use it.
 */
export class WaterSurfaceModel {
  private readonly fadeFrom = uniform(DEFAULT_SHALLOW_SWELL.fadeFromM);
  private readonly fadeTo = uniform(DEFAULT_SHALLOW_SWELL.fadeToM);

  constructor(readonly sim: OceanSimulation, readonly seabed: Seabed, readonly sets: SetWaves) {}

  setParams(p: ShallowSwellParams): void {
    this.fadeFrom.value = Math.min(p.fadeFromM, p.fadeToM - 0.1);
    this.fadeTo.value = p.fadeToM;
  }

  /** Weight of the FFT long swell: over the reef the set waves carry the swell instead. */
  swellWeight(xz: N): N {
    return smoothstep(this.fadeFrom, this.fadeTo, this.seabed.waterDepthNode(xz));
  }

  private cascadeWeight(xz: N, c: number): N {
    return c === LONG_SWELL_CASCADE ? this.swellWeight(xz) : float(1.0);
  }

  /** vec3 displacement at undisplaced world xz, relative to the tide level. `lod` adds the render's distance fades. */
  displacement(xz: N, lod: (cascade: number) => N = () => float(1.0)): N {
    let d: N = vec3(0.0);
    this.sim.sizes.forEach((size, c) => {
      const s = texture(this.sim.displacement[c], xz.div(size)).level(float(0)).xyz; // three typings gap: level() wants a node
      d = d.add(s.mul(this.cascadeWeight(xz, c)).mul(lod(c)));
    });
    return d.add(this.sets.displacementNode(xz));
  }

  /** FFT slopes/Jacobian terms and foam at xz, with the render's normal fades by distance; set waves added separately. */
  fftSlopes(xz: N, distance: N, slopeVariance: readonly N[]): { sx: N; sz: N; jxx: N; jzz: N; foam: N; lostSlopeVariance: N } {
    let sx: N = float(0.0), sz: N = float(0.0), jxx: N = float(0.0), jzz: N = float(0.0);
    let foam: N = float(0.0), lostSlopeVariance: N = float(0.0);
    this.sim.sizes.forEach((size, c) => {
      const w = fadeWeightNode(distance, CASCADE_FADES[c].normals).mul(this.cascadeWeight(xz, c));
      const d = texture(this.sim.derivatives[c], xz.div(size));
      sx = sx.add(d.x.mul(w));
      sz = sz.add(d.y.mul(w));
      jxx = jxx.add(d.z.mul(w));
      jzz = jzz.add(d.w.mul(w));
      foam = max(foam, texture(this.sim.displacement[c], xz.div(size)).w.mul(w));
      lostSlopeVariance = lostSlopeVariance.add(float(1.0).sub(w).mul(slopeVariance[c]));
    });
    return { sx, sz, jxx, jzz, foam, lostSlopeVariance };
  }
}
```

`src/ocean/OceanSurface.ts`: replace the constructor's signature and the two sampling blocks:

```ts
  constructor(readonly model: WaterSurfaceModel, sky: Sky, optics: WaterOpticsUniforms) {
    const sim = model.sim;
    this.slopeVariance = sim.sizes.map(() => uniform(0));
    // …grid and material creation unchanged…

    // Vertex: world-anchored sampling, distance-faded cascades, the tide, Earth curvature.
    const baseXZ = positionLocal.xz.add(this.cameraXZ);
    const radial = length(positionLocal.xz);
    const displacement = model.displacement(baseXZ, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry));
    const curvatureDrop = radial.mul(radial).div(2 * EARTH_RADIUS_M);
    material.positionNode = vec3(baseXZ.x.add(displacement.x), model.seabed.tide.add(displacement.y).sub(curvatureDrop), baseXZ.y.add(displacement.z));
    const vBaseXZ = varying(baseXZ);
    const vHeight = varying(displacement.y);

    // Fragment: FFT normals and foam (long swell faded over shallow water) plus the set waves' slopes.
    const toCamera = cameraPosition.sub(positionWorld);
    const distance = length(toCamera);
    const viewDir = toCamera.div(max(distance, 1e-4));
    const fft = model.fftSlopes(vBaseXZ, distance, this.slopeVariance);
    const setSlope = model.sets.slopeNode(vBaseXZ);
    // The Jxz cross term is knowingly dropped: the derivatives texture has no channel for it.
    const normal = normalize(vec3(
      fft.sx.negate().div(max(float(1.0).add(fft.jxx), 0.1)).sub(setSlope.x),
      1.0,
      fft.sz.negate().div(max(float(1.0).add(fft.jzz), 0.1)).sub(setSlope.y),
    ));

    material.colorNode = shadeWater(
      { normal, viewDir, distance, foam: fft.foam, crestHeight: vHeight, unresolvedSlopeVariance: fft.lostSlopeVariance, hsTotal: this.hsTotal },
      sky,
      optics,
    );
    // …mesh creation unchanged…
  }
```

Remove the now-unused `texture` import and add `import type { WaterSurfaceModel } from './waterSurface';`. `update(cameraPos, sim)` is unchanged.

`src/ocean/HeightProbe.ts`: change the constructor to take the model, and the displacement helper to use it:

```ts
  constructor(model: WaterSurfaceModel) {
    const input = storage(this.inputAttr, 'vec4', MAX_PROBES).toReadOnly();
    const output = storage(this.outputAttr, 'vec4', MAX_PROBES);
    // The same surface the mesh renders (WaterSurfaceModel), without the render's distance fades: every probe is
    // near the camera, where those fades are 1.
    const displacementAt = (xz: N): N => model.displacement(xz);
    this.pass = Fn(() => {
      const target = input.element(instanceIndex).xy;
      const origin = target.toVar();
      // The displacement is Lagrangian (texel x0 lands at x0 + D(x0)): solve x0 = p - D_xz(x0) by fixed-point iteration.
      // three typings gap: LoopNode reads `name` at runtime, but @types/three omits it.
      Loop({ start: 0, end: FIXED_POINT_ITERATIONS, name: 'it' } as N, () => {
        origin.assign(target.sub(displacementAt(origin).xz));
      });
      output.element(instanceIndex).assign(vec4(model.seabed.tide.add(displacementAt(origin).y), 0.0, 0.0, 1.0));
    })().compute(MAX_PROBES) as THREE.ComputeNode;
  }
```

Update the imports: drop `texture`, `float`, `vec3` if unused; add `import type { WaterSurfaceModel } from './waterSurface';`.

`src/app/App.ts`:
- **Imports:** `buildBathymetry`, `downsample` (`../seabed/bathymetry`); `Seabed`; `DEFAULT_REEF_PARAMS`, `type ReefParams` (`../seabed/wombReef`); `SetWaves`; `ReefFieldClient`; `DEFAULT_SET_PARAMS`, `type SetParams`, `wavesNear` (`../swell/sets`); `DEFAULT_SHALLOW_SWELL`, `type ShallowSwellParams`, `WaterSurfaceModel` (`../ocean/waterSurface`).
- **Fields.** Replace `readonly probe = new HeightProbe(this.ocean);` with, in this order after `readonly ocean = …`:

```ts
  readonly reefParams: ReefParams = { ...DEFAULT_REEF_PARAMS };
  readonly setParams: SetParams = { ...DEFAULT_SET_PARAMS };
  readonly shallowParams: ShallowSwellParams = { ...DEFAULT_SHALLOW_SWELL };
  readonly seabed = new Seabed(buildBathymetry(this.reefParams));
  readonly setWaves = new SetWaves(this.ocean.time);
  readonly surfaceModel = new WaterSurfaceModel(this.ocean, this.seabed, this.setWaves);
  readonly probe = new HeightProbe(this.surfaceModel);
  private readonly fieldClient = new ReefFieldClient();
  private fieldKey = '';
```

- **Constructor:** `this.oceanSurface = new OceanSurface(this.surfaceModel, this.sky, this.waterOptics);`, and before `this.applyMoment(initial)`:

```ts
    this.fieldClient.onField = (f) => this.setWaves.setField(f);
```

- **Methods.** Add:

```ts
  /** Re-solve the reef wave field (off-thread) when the swell period or direction, the tide or the reef changes. */
  private requestFieldIfNeeded(force: boolean): void {
    const c = this.conditions;
    const key = JSON.stringify([c.swell.periodS, c.swell.directionDeg, c.tideM, this.reefParams]);
    if (!force && key === this.fieldKey) return;
    this.fieldKey = key;
    this.fieldClient.request({ bed: downsample(this.seabed.bathymetry, 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM });
  }
```

- In `applyMoment`, after `assignConditions(...)`: `this.seabed.setTide(this.conditions.tideM);`. After `this.rebuildSpectrumIfNeeded(true);`: `this.requestFieldIfNeeded(true);`.
- In `onConditionsEdited`, after the sanitize block: `this.seabed.setTide(this.conditions.tideM);`.
- In `rebuildSpectrumIfNeeded`, at the end: `this.requestFieldIfNeeded(false);`. It shares the spectrum's 150 ms debounce, so dragging a slider solves once when you stop.
- In `frame`, right after `this.ocean.update(...)`:

```ts
    this.setWaves.setEvents(wavesNear(this.clock.simTime, this.conditions, this.setParams));
```

- [ ] **Step 4: Typecheck, test, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean.

- [ ] **Step 5: GPU and visual check (controller)**

Report as pending:
- `?selftest` should show 17/17, including the tide probe test.
- `#ref=morning-offshore` renders without console errors and looks like Phase 0 in deep water, apart from the halved background swell.

Set waves themselves are judged visually from Task 11 on, once "call a set now" exists.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: one water surface: tide, reef-shaped set waves and a shallow-water swell fade in render and probe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Seeing the reef (refracted ray-march, finite-depth water column)

**Files:**
- Create: `src/seabed/waterColumn.ts`, `src/seabed/waterColumn.test.ts`
- Create: `src/seabed/seabedShading.ts`
- Create: `src/seabed/seabedShading.selftest.ts`
- Modify: `src/ocean/waterShading.ts` (extinction uniform; optional seabed terms)
- Modify: `src/ocean/OceanSurface.ts` (compute and pass the seabed terms)
- Modify: `src/dev/selfTests.ts`

**Interfaces:**
- Consumes: `Seabed` (Task 3); `bedHeightAt`, `buildBathymetry` (Task 2); `Sky`; `WaterOpticsUniforms`, `schlickWater` (Phase 0 `waterShading.ts`); `WaterSurfaceModel` (Task 9).
- Produces:
  - In `waterColumn.ts`:
    - `WATER_IOR = 1.333`, `MARCH_STEPS = 20`, `MARCH_REFINE = 4`, `MAX_MARCH_DEPTH_M = 25`, `MAX_MARCH_DIST_M = 80`;
    - `extinction(a: Rgb, bb: Rgb): Rgb`;
    - `transmittance(c: Rgb, pathM: number): Rgb`;
    - `waterColumnRadiance(bed: Rgb, body: Rgb, T: Rgb): Rgb`;
    - `marchSeabed(p: [x, y, z], d: [x, y, z], bedAt: (x, z) => number): { hit: boolean; distance: number }`.
  - In `seabedShading.ts`: `marchSeabedNode(p: N, d: N, seabed: Seabed): N` (vec2(distance, hit)) and `seabedTerms(i, seabed, sky, optics): { radiance: N; transmittance: N }`.
  - In `waterShading.ts`: `WaterSurfaceInputs.seabed?: { radiance: N; transmittance: N }` and `WaterOpticsUniforms.extinction`.

The Phase 0 deep-water upwelling becomes the "body" term: water colour below the surface = L_seabed·T + L_body·(1 − T), where T = exp(−(a + b_b)·path) along the refracted view ray. With no seabed in reach, T = 0 and the result is exactly Phase 0.

- [ ] **Step 1: Write the failing tests**

`src/seabed/waterColumn.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Rgb } from '../sky/atmosphereParams';
import { extinction, marchSeabed, transmittance, waterColumnRadiance } from './waterColumn';

const c: Rgb = extinction([0.45, 0.07, 0.02], [0.0004, 0.001, 0.0024]);
const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

describe('water column', () => {
  it('reduces exactly to the Phase 0 deep-water colour when no seabed is in reach', () => {
    const body: Rgb = [0.01, 0.03, 0.08];
    expect(waterColumnRadiance([0.5, 0.4, 0.3], body, transmittance(c, Infinity))).toEqual(body);
  });
  it('shows the seabed unattenuated at zero path, and absorbs red first', () => {
    expect(waterColumnRadiance([0.5, 0.4, 0.3], [0, 0, 0], transmittance(c, 0))).toEqual([0.5, 0.4, 0.3]);
    const t = transmittance(c, 6);
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
  });
});

describe('seabed ray-march (CPU mirror of the shader)', () => {
  const flat = (y: number) => () => y;
  it('hits a flat bed straight down and at 45°', () => {
    expect(marchSeabed([0, 0, 0], [0, -1, 0], flat(-5)).distance).toBeCloseTo(5, 1);
    expect(marchSeabed([0, 0, 0], norm([1, -1, 0]), flat(-5)).distance).toBeCloseTo(5 * Math.SQRT2, 1);
  });
  it('finds a shelf beyond a step', () => {
    const step = (x: number) => (x < 3 ? -10 : -2);
    const d = norm([0.8, -0.2, 0]);
    const r = marchSeabed([0, 0, 0], d, step);
    expect(r.hit).toBe(true);
    expect(r.distance).toBeCloseTo(2 / -d[1], 0); // where the ray reaches y = −2 over the shelf
    expect(d[0] * r.distance).toBeCloseTo(8, 0);
  });
  it('gives up in deep water, looking up, and hits immediately where the reef is dry', () => {
    expect(marchSeabed([0, 0, 0], [0, -1, 0], flat(-30)).hit).toBe(false);
    expect(marchSeabed([0, 0, 0], norm([1, 0.2, 0]), flat(-5)).hit).toBe(false);
    expect(marchSeabed([0, -1, 0], [0, -1, 0], flat(0.5))).toEqual({ hit: true, distance: 0 });
  });
});
```

`src/seabed/seabedShading.selftest.ts`:

```ts
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { bedHeightAt, buildBathymetry } from './bathymetry';
import { Seabed } from './Seabed';
import { marchSeabedNode } from './seabedShading';
import { marchSeabed } from './waterColumn';

const RAYS: [[number, number, number], [number, number, number]][] = [
  [[-25, 0, 45], [0.3, -0.5, -0.81]], [[0, 0, 0], [0, -1, 0]], [[40, 0, -120], [0.2, -0.9, 0.39]],
  [[-300, 0, 100], [0, -1, 0]], [[20, 0, -40], [-0.6, -0.3, -0.74]], [[-10, 0, 20], [0.1, 0.5, 0.86]],
];

registerSelfTest({
  name: 'seabed shading: GPU ray-march hits match the CPU march (±0.15 m)',
  async run(renderer) {
    const bathy = buildBathymetry();
    const seabed = new Seabed(bathy);
    const n = RAYS.length;
    const norm = (d: number[]) => { const l = Math.hypot(d[0], d[1], d[2]); return [d[0] / l, d[1] / l, d[2] / l]; };
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(RAYS.flatMap(([p, d]) => [...p, 0, ...norm(d), 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n * 2).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const p = input.element(instanceIndex.mul(2)).xyz;
      const d = input.element(instanceIndex.mul(2).add(1)).xyz;
      output.element(instanceIndex).assign(vec4(marchSeabedNode(p, d, seabed), 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let ok = true;
    const notes = RAYS.map(([p, d], i) => {
      const cpu = marchSeabed(p, norm(d) as [number, number, number], (x, z) => bedHeightAt(bathy, x, z));
      const gpuHit = out[i * 4 + 1] > 0.5;
      if (gpuHit !== cpu.hit || (cpu.hit && Math.abs(out[i * 4] - cpu.distance) > 0.15)) ok = false;
      return `ray ${i}: gpu ${gpuHit ? out[i * 4].toFixed(2) : 'miss'} cpu ${cpu.hit ? cpu.distance.toFixed(2) : 'miss'}`;
    });
    return { pass: ok, detail: notes.join('; ') };
  },
});
```

Add to `src/dev/selfTests.ts`:

```ts
import '../seabed/seabedShading.selftest';
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/seabed/waterColumn.test.ts && npm run typecheck`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/seabed/waterColumn.ts`:

```ts
import type { Rgb } from '../sky/atmosphereParams';

export const WATER_IOR = 1.333;
export const MARCH_STEPS = 20;
export const MARCH_REFINE = 4;
/** Deeper than this below the surface point, the seabed is invisible (T < 1%): don't march. */
export const MAX_MARCH_DEPTH_M = 25;
export const MAX_MARCH_DIST_M = 80;

export const extinction = (a: Rgb, bb: Rgb): Rgb => [a[0] + bb[0], a[1] + bb[1], a[2] + bb[2]];

export const transmittance = (c: Rgb, pathM: number): Rgb =>
  [Math.exp(-c[0] * pathM), Math.exp(-c[1] * pathM), Math.exp(-c[2] * pathM)];

/** Light leaving the water column: the seabed seen through it, blended with the scattering body of the water. */
export const waterColumnRadiance = (bed: Rgb, body: Rgb, T: Rgb): Rgb =>
  [bed[0] * T[0] + body[0] * (1 - T[0]), bed[1] * T[1] + body[1] * (1 - T[1]), bed[2] * T[2] + body[2] * (1 - T[2])];

/**
 * March a refracted ray from the surface point p (world, y up) along unit d until it passes below the seabed.
 * Steps grow as (i/N)^1.6 to spend samples near the surface, then bisect. The shader mirrors this exactly.
 */
export function marchSeabed(
  p: readonly [number, number, number], d: readonly [number, number, number], bedAt: (x: number, z: number) => number,
): { hit: boolean; distance: number } {
  const depthHere = p[1] - bedAt(p[0], p[2]);
  const down = -d[1];
  if (!(down > 0.02) || depthHere >= MAX_MARCH_DEPTH_M) return { hit: false, distance: 0 };
  if (depthHere <= 0) return { hit: true, distance: 0 };
  const maxDist = Math.min(MAX_MARCH_DIST_M, (depthHere * 1.5) / Math.max(down, 0.05));
  const below = (s: number) => p[1] + d[1] * s <= bedAt(p[0] + d[0] * s, p[2] + d[2] * s);
  let prev = 0;
  for (let i = 1; i <= MARCH_STEPS; i++) {
    const s = maxDist * (i / MARCH_STEPS) ** 1.6;
    if (below(s)) {
      let lo = prev, hi = s;
      for (let r = 0; r < MARCH_REFINE; r++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid; else lo = mid;
      }
      return { hit: true, distance: (lo + hi) / 2 };
    }
    prev = s;
  }
  return { hit: false, distance: 0 };
}
```

The 45° flat case needs a bisection tolerance under 0.05 m. With 20 steps over maxDist ≈ 10.6 m, the last interval before the hit is ≤ 1.1 m, and 4 halvings leave ≤ 0.07 m, so the midpoint is within 0.035 m. If the test fails on precision, raise `MARCH_REFINE` to 5 in both mirrors. Never loosen the test.

`src/seabed/seabedShading.ts`:

```ts
import { Fn, If, Loop, PI, dot, exp, float, max, min, mix, mx_noise_float, normalize, pow, refract, step, vec2, vec3 } from 'three/tsl';
import { type WaterOpticsUniforms, schlickWater } from '../ocean/waterShading';
import type { Sky } from '../sky/Sky';
import type { Seabed } from './Seabed';
import { MARCH_REFINE, MARCH_STEPS, MAX_MARCH_DEPTH_M, MAX_MARCH_DIST_M, WATER_IOR } from './waterColumn';

type N = any;

const REEF_ALBEDO = vec3(0.2, 0.18, 0.14);
const SAND_ALBEDO = vec3(0.62, 0.56, 0.44);
const WEED_ALBEDO = vec3(0.06, 0.08, 0.035);

/** vec2(distance along d, hit 0/1): TSL mirror of marchSeabed(). */
export function marchSeabedNode(p: N, d: N, seabed: Seabed): N {
  return Fn(() => {
    const result = vec2(0.0, 0.0).toVar();
    const depthHere = p.y.sub(seabed.bedHeightNode(p.xz));
    const down = d.y.negate();
    If(down.greaterThan(0.02).and(depthHere.lessThan(MAX_MARCH_DEPTH_M)), () => {
      If(depthHere.lessThanEqual(0.0), () => {
        result.assign(vec2(0.0, 1.0));
      }).Else(() => {
        const maxDist = min(float(MAX_MARCH_DIST_M), depthHere.mul(1.5).div(max(down, 0.05)));
        const prev = float(0.0).toVar(), lo = float(0.0).toVar(), hi = float(0.0).toVar(), found = float(0.0).toVar();
        Loop(MARCH_STEPS, ({ i }: N) => {
          If(found.lessThan(0.5), () => {
            const s = maxDist.mul(pow(float(i).add(1.0).div(MARCH_STEPS), 1.6));
            const q = p.add(d.mul(s));
            If(q.y.lessThanEqual(seabed.bedHeightNode(q.xz)), () => {
              found.assign(1.0);
              lo.assign(prev);
              hi.assign(s);
            });
            prev.assign(s);
          });
        });
        If(found.greaterThan(0.5), () => {
          Loop(MARCH_REFINE, () => {
            const mid = lo.add(hi).mul(0.5);
            const q = p.add(d.mul(mid));
            If(q.y.lessThanEqual(seabed.bedHeightNode(q.xz)), () => { hi.assign(mid); }).Else(() => { lo.assign(mid); });
          });
          result.assign(vec2(lo.add(hi).mul(0.5), 1.0));
        });
      });
    });
    return result;
  })();
}

export interface SeabedShadingInputs {
  /** Displaced surface point in world space (includes the tide). */
  surfacePos: N;
  normal: N;
  /** Unit vector from the surface point toward the camera. */
  viewDir: N;
}

/** The seabed seen through the water: its radiance at the hit and the view-path transmittance (0 on a miss). */
export function seabedTerms(i: SeabedShadingInputs, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): { radiance: N; transmittance: N } {
  const t = normalize(refract(i.viewDir.negate(), i.normal, float(1 / WATER_IOR)));
  const march = marchSeabedNode(i.surfacePos, t, seabed);
  const hitPos = i.surfacePos.add(t.mul(march.x));
  const T = exp(u.extinction.mul(march.x).negate()).mul(march.y);

  const e = 0.5;
  const hx = seabed.bedHeightNode(hitPos.xz.add(vec2(e, 0.0))).sub(seabed.bedHeightNode(hitPos.xz.sub(vec2(e, 0.0))));
  const hz = seabed.bedHeightNode(hitPos.xz.add(vec2(0.0, e))).sub(seabed.bedHeightNode(hitPos.xz.sub(vec2(0.0, e))));
  const nBed = normalize(vec3(hx.negate().div(2 * e), 1.0, hz.negate().div(2 * e)));
  const mat = seabed.materialNode(hitPos.xz);
  const detail = mx_noise_float(vec3(hitPos.x.mul(1.7), hitPos.z.mul(1.7), 0.0)).mul(0.5).add(0.5);
  const albedo = mix(mix(REEF_ALBEDO, WEED_ALBEDO, mat.y), SAND_ALBEDO, mat.x).mul(detail.mul(0.4).add(0.8));

  const l = sky.sunDirection;
  const lw = normalize(refract(l.negate(), vec3(0.0, 1.0, 0.0), float(1 / WATER_IOR)));
  const cosW = max(lw.y.negate(), 0.2);
  const depthHit = max(seabed.tide.sub(hitPos.y), 0.0);
  const sunIn = sky.sunIlluminance.mul(float(1.0).sub(schlickWater(max(l.y, 0.0)))).mul(step(0.0, l.y));
  const eSun = sunIn.mul(exp(u.extinction.mul(depthHit.div(cosW)).negate())).mul(max(dot(nBed, lw.negate()), 0.0));
  const eSky = sky.skyIrradiance.mul(exp(u.extinction.mul(depthHit.mul(1.2)).negate()));
  return { radiance: albedo.mul(eSun.add(eSky)).div(PI), transmittance: T };
}
```

`src/ocean/waterShading.ts`:
- Add to `WaterSurfaceInputs`:

```ts
  /** The seabed seen through the water (Phase 1); absent means infinitely deep water (Phase 0). */
  seabed?: { radiance: N; transmittance: N };
```

- Add `extinction: uniform(new THREE.Vector3(...extinction(p.absorptionPerM, p.backscatterPerM))),` to `createWaterOpticsUniforms`, and `u.extinction.value.set(...extinction(p.absorptionPerM, p.backscatterPerM));` to `updateWaterOpticsUniforms` (import `extinction` from `../seabed/waterColumn`).
- Replace the `water` line with:

```ts
  // Below the surface: the seabed where it's in reach, blended with the water body by the view-path transmittance.
  const column = i.seabed ? i.seabed.radiance.mul(i.seabed.transmittance).add(upwelling.mul(vec3(1.0).sub(i.seabed.transmittance))) : upwelling;
  const water = column.add(transmitted).mul(float(1.0).sub(fresnel)).add(reflection.mul(fresnel)).add(specular);
```

`src/ocean/OceanSurface.ts`, fragment: after `normal` is built, add:

```ts
    const seabed = seabedTerms({ surfacePos: positionWorld, normal, viewDir }, model.seabed, sky, optics);
```

and pass `seabed` in the `shadeWater` inputs object (import `seabedTerms` from `../seabed/seabedShading`).

- [ ] **Step 4: Run the tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: GPU and visual check (controller)**

Report as pending:
- `?selftest` shows 18/18.
- `#ref=morning-offshore`: near the lineup the water now shows depth; over the shelf you see dark reef and turquoise sand pockets; deep water to the south-west looks as before.
- Frame GPU time on Andrew's RTX (Task 13) ≤ 3 ms.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: see the reef through the water (refracted ray-march, finite-depth water column)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Dev tools (sets, reef and swell-fade controls, set readout, call a set, debug overlays)

**Files:**
- Create: `src/swell/setStatus.ts`, `src/swell/setStatus.test.ts`
- Modify: `src/dev/hotkeys.ts`, `src/dev/hotkeys.test.ts`
- Modify: `src/dev/DevPanel.ts`
- Modify: `src/ocean/OceanSurface.ts`, `src/ocean/waterShading.ts` (overlay lines)
- Modify: `src/app/App.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `formatCountdown(seconds: number): string` ("m:ss"; ≤ 0 → "now").
  - `waveStatus(t: number, events: readonly WaveEvent[]): string` ("wave 3 of 6" | "stray wave" | "lull").
  - `HOTKEYS.callSet = 'KeyN'` and `HotkeyHandlers.callSet()`.
  - `interface DebugOverlays { depthContours: boolean; crestLines: boolean }`.
  - `OceanSurface.setOverlays(o: DebugOverlays)`.
  - DevPanel model fields `sets`, `reef`, `shallow`, `overlays`, `setStatus`; handlers `onSets`, `onReef`, `onShallow`, `onOverlays`, `onCallSet`.

- [ ] **Step 1: Write the failing tests**

`src/swell/setStatus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WaveEvent } from './sets';
import { formatCountdown, waveStatus } from './setStatus';

const ev = (arrivalS: number, indexInSet: number, waveCount: number): WaveEvent => ({
  id: 0, slot: 0, indexInSet, waveCount, arrivalS, heightM: 2, periodS: 15, fromDeg: 225, crestLengthM: 400, crestOffsetM: 0,
});

describe('set readout', () => {
  it('formats a countdown as m:ss', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(-3)).toBe('now');
    expect(formatCountdown(59.2)).toBe('1:00');
    expect(formatCountdown(61)).toBe('1:01');
    expect(formatCountdown(754)).toBe('12:34');
  });
  it('names the wave nearest the peak, or the lull', () => {
    const events = [ev(100, 0, 6), ev(115, 1, 6), ev(300, -1, 0)];
    expect(waveStatus(101, events)).toBe('wave 1 of 6');
    expect(waveStatus(113, events)).toBe('wave 2 of 6');
    expect(waveStatus(302, events)).toBe('stray wave');
    expect(waveStatus(200, events)).toBe('lull');
  });
});
```

In `src/dev/hotkeys.test.ts`, add `callSet: vi.fn()` to the handler object `h` in the existing test (it must satisfy the extended `HotkeyHandlers`) and add `expect(h.callSet).not.toHaveBeenCalled();` there. Then add:

```ts
  it('N calls a set', () => {
    const pressed = new Set(['KeyN']);
    const input = { consumePressed: (code: string) => pressed.delete(code) };
    const h = { copyLink: vi.fn(), togglePause: vi.fn(), screenshot: vi.fn(), toggleDevUi: vi.fn(), callSet: vi.fn() };
    handleHotkeys(input, h);
    expect(h.callSet).toHaveBeenCalledTimes(1);
    expect(h.togglePause).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/swell/setStatus.test.ts src/dev/hotkeys.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/swell/setStatus.ts`:

```ts
import type { WaveEvent } from './sets';

export function formatCountdown(seconds: number): string {
  if (!(seconds > 0)) return 'now';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Which wave is at the peak now (within half a period), for the dev readout. */
export function waveStatus(t: number, events: readonly WaveEvent[]): string {
  const at = events.find((e) => Math.abs(e.arrivalS - t) <= e.periodS / 2);
  if (!at) return 'lull';
  return at.indexInSet >= 0 ? `wave ${at.indexInSet + 1} of ${at.waveCount}` : 'stray wave';
}
```

`src/dev/hotkeys.ts`: add `callSet: 'KeyN'` to `HOTKEYS` and `callSet(): void;` to `HotkeyHandlers`.

`src/ocean/waterShading.ts`:
- Add to `WaterSurfaceInputs`: `overlay?: { depth: N; tau: N; depthOn: N; crestOn: N }`.
- Import `abs`, `fract`, `fwidth`, `smoothstep`.
- Before the final `return`, add:

```ts
  // Debug overlays: 1 m depth contours (white) and crest lines every 2 s of arrival time (gold).
  const line = (v: N, spacing: number): N => {
    const f = fract(v.div(spacing));
    const dist = min(f, float(1.0).sub(f));
    return float(1.0).sub(smoothstep(0.0, fwidth(v.div(spacing)).mul(1.5), dist));
  };
  const withOverlay = i.overlay
    ? mix(mix(colour, foamLight, line(i.overlay.depth, 1.0).mul(i.overlay.depthOn)), foamLight.mul(vec3(1.0, 0.8, 0.25)), line(i.overlay.tau, 2.0).mul(i.overlay.crestOn))
    : colour;
  return sky.applyAerialPerspective(withOverlay, i.distance, v.negate());
```

(Replace the existing `return sky.applyAerialPerspective(colour, …)` line.)

`src/ocean/OceanSurface.ts`:
- Add `private readonly overlayDepth = uniform(0);` and `private readonly overlayCrest = uniform(0);`.
- Pass `overlay: { depth: model.seabed.waterDepthNode(vBaseXZ), tau: model.sets.tauNode(vBaseXZ), depthOn: this.overlayDepth, crestOn: this.overlayCrest }` into `shadeWater`.
- Add:

```ts
export interface DebugOverlays {
  depthContours: boolean;
  crestLines: boolean;
}

// in the class:
  setOverlays(o: DebugOverlays): void {
    this.overlayDepth.value = o.depthContours ? 1 : 0;
    this.overlayCrest.value = o.crestLines ? 1 : 0;
  }
```

(Declare the two overlay uniforms as fields initialised before the constructor body runs, i.e. as class field initialisers, so the constructor can reference them.)

`src/dev/DevPanel.ts`:
- Model: add `sets: SetParams; reef: ReefParams; shallow: ShallowSwellParams; overlays: DebugOverlays; setStatus: { nextSet: string; wave: string };`.
- Handlers: add `onSets(): void; onReef(): void; onShallow(): void; onOverlays(): void; onCallSet(): void;`.
- In the constructor, after the Wind folder:

```ts
    const sets = this.pane.addFolder({ title: 'Sets' });
    sets.addBinding(m.setStatus, 'nextSet', { label: 'next set', readonly: true, interval: 250 });
    sets.addBinding(m.setStatus, 'wave', { label: 'at the peak', readonly: true, interval: 250 });
    sets.addButton({ title: 'Call a set now (N)' }).on('click', h.onCallSet);
    sets.addBinding(m.sets, 'meanIntervalS', { label: 'mean interval (s)', min: 120, max: 3600, step: 10 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'intervalJitterS', { label: 'interval jitter (s)', min: 0, max: 600, step: 10 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'minWaves', { label: 'min waves', min: 1, max: 12, step: 1 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'maxWaves', { label: 'max waves', min: 1, max: 12, step: 1 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'heightFactorMin', { label: 'height × Hs (min)', min: 0.5, max: 3, step: 0.05 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'heightFactorMax', { label: 'height × Hs (max)', min: 0.5, max: 3, step: 0.05 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'waveHeightJitter', { label: 'wave height jitter', min: 0, max: 0.5, step: 0.01 }).on('change', h.onSets);
    sets.addBinding(m.sets, 'straysPerLull', { label: 'strays per lull', min: 0, max: 5, step: 0.1 }).on('change', h.onSets);
    sets.addBinding(m.spectrum, 'backgroundSwellFactor', { label: 'background swell', min: 0, max: 1, step: 0.01 }).on('change', h.onSpectrum);

    const reef = this.pane.addFolder({ title: 'Reef', expanded: false });
    reef.addBinding(m.reef, 'ledgeDepthM', { label: 'ledge depth (m)', min: 2, max: 12, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'deepDepthM', { label: 'deep water (m)', min: 8, max: 25, step: 0.5 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'ledgeWidthM', { label: 'ledge width (m)', min: 3, max: 40, step: 1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'shelfDepthM', { label: 'shelf depth (m)', min: 1, max: 8, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'headReliefM', { label: 'reef head relief (m)', min: 0, max: 4, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'minDepthM', { label: 'shallowest (m)', min: 0.3, max: 4, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'pocketDepthM', { label: 'sand pockets (m)', min: 2, max: 10, step: 0.1 }).on('change', h.onReef);
    reef.addBinding(m.shallow, 'fadeFromM', { label: 'swell fade from (m)', min: 0, max: 20, step: 0.5 }).on('change', h.onShallow);
    reef.addBinding(m.shallow, 'fadeToM', { label: 'swell fade to (m)', min: 1, max: 30, step: 0.5 }).on('change', h.onShallow);
    reef.addBinding(m.overlays, 'depthContours', { label: 'depth contours' }).on('change', h.onOverlays);
    reef.addBinding(m.overlays, 'crestLines', { label: 'crest lines' }).on('change', h.onOverlays);
```

`src/app/App.ts`:
- **Fields:**

```ts
  readonly overlays: DebugOverlays = { depthContours: false, crestLines: false };
  readonly setStatus = { nextSet: '', wave: '' };
  private reefTimer: number | undefined;
  private statusAge = 0;
```

- **DevPanel model:** add `sets: this.setParams, reef: this.reefParams, shallow: this.shallowParams, overlays: this.overlays, setStatus: this.setStatus`.
- **DevPanel handlers:**

```ts
        onSets: () => {
          if (this.setParams.minWaves > this.setParams.maxWaves) this.setParams.maxWaves = this.setParams.minWaves;
          if (this.setParams.heightFactorMin > this.setParams.heightFactorMax) this.setParams.heightFactorMax = this.setParams.heightFactorMin;
          this.panel.refresh();
        },
        onReef: () => this.scheduleReefRebuild(),
        onShallow: () => this.surfaceModel.setParams(this.shallowParams),
        onOverlays: () => this.oceanSurface.setOverlays(this.overlays),
        onCallSet: () => this.callSetNow(),
```

- **Methods:**

```ts
  private scheduleReefRebuild(): void {
    clearTimeout(this.reefTimer);
    this.reefTimer = window.setTimeout(() => {
      this.seabed.setBathymetry(buildBathymetry(this.reefParams));
      this.requestFieldIfNeeded(true);
    }, 300);
  }

  /** Jump sim time to just before the next set reaches the peak (reproducible: a moment link records the time). */
  private callSetNow(): void {
    this.clock.setTime(callSetTime(this.clock.simTime, this.conditions, this.setParams));
    this.ocean.resetFoam();
    this.perf.flash('Set incoming');
  }
```

- **Hotkeys in `frame`:** add `callSet: () => this.callSetNow(),` to the `handleHotkeys` handlers.
- **Readout in `frame`:** after the `setEvents` line, replacing it:

```ts
    const events = wavesNear(this.clock.simTime, this.conditions, this.setParams);
    this.setWaves.setEvents(events);
    this.statusAge += realDt;
    if (this.statusAge > 0.25) {
      this.statusAge = 0;
      this.setStatus.nextSet = formatCountdown(nextSetArrivalS(this.clock.simTime, this.conditions, this.setParams) - this.clock.simTime);
      this.setStatus.wave = waveStatus(this.clock.simTime, events);
    }
```

- **Imports:** `callSetTime`, `nextSetArrivalS` (sets), `formatCountdown`, `waveStatus` (setStatus), `type DebugOverlays` (OceanSurface).

- [ ] **Step 4: Run the tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Visual check (controller, one GPU copy at a time)**

At `#ref=morning-offshore`, press `N`. Within about 45 s a set should arrive:
- lines darken on the south-west horizon;
- waves slow and stand up on the ledge, then fade over the shelf;
- the lineup camera rises and falls with them;
- the readout counts down and names each wave.

Toggle crest lines: the gold lines bend around the wedge. Along the south ledge they run nearly parallel to the edge (closeout); along the north ledge they meet it at an angle (peel). Record the screenshots.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: dev tools for sets and reef: call a set (N), set readout, depth and crest-line overlays

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Reference moments for sets and the reef; README

**Files:**
- Modify: `src/dev/referenceMoments.ts`, `src/dev/referenceMoments.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `wavesOfSet`, `DEFAULT_SET_PARAMS` (Task 4); `DEFAULT_CONDITIONS`.
- Produces: new reference moments `set-arriving`, `set-on-the-reef`, `low-tide-set`, `high-tide-set`, `looking-down`, `reef-overhead` (appended after `overview`).

Moment times come from the set timeline with the default conditions and set parameters, so each moment is guaranteed to contain its wave. If Andrew later retunes the set defaults, these moments follow automatically.

- [ ] **Step 1: Write the failing test**

Append to `src/dev/referenceMoments.test.ts` (and update the existing names list test to include the six new names in this order after `overview`):

```ts
describe('set and reef moments', () => {
  it('lands on a real set: arriving before the biggest wave reaches the ledge', () => {
    const arriving = findReferenceMoment('set-arriving')!, onReef = findReferenceMoment('set-on-the-reef')!;
    expect(arriving.simTime).toBeGreaterThan(0);
    expect(onReef.simTime).toBeGreaterThan(arriving.simTime);
    expect(onReef.paused).toBe(true);
  });
  it('compares the same wave at low and high tide', () => {
    const low = findReferenceMoment('low-tide-set')!, high = findReferenceMoment('high-tide-set')!;
    expect(low.conditions.tideM).toBe(-0.5);
    expect(high.conditions.tideM).toBe(0.5);
    expect(low.simTime).toBe(high.simTime);
    expect(low.simTime).toBe(findReferenceMoment('set-on-the-reef')!.simTime);
  });
  it('puts the overhead view in free flight above the reef', () => {
    const m = findReferenceMoment('reef-overhead')!;
    expect(m.camera.mode).toBe('free');
    expect(m.camera.position[1]).toBeGreaterThan(40);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/dev/referenceMoments.test.ts`
Expected: FAIL (unknown moments).

- [ ] **Step 3: Implement**

In `src/dev/referenceMoments.ts`, add the imports `import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';` and, above `REFERENCE_MOMENTS`:

```ts
/** The reference set: slot 1's set with the default conditions (the first full set of a session). */
const REF_SET = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
const REF_BIGGEST = REF_SET.reduce((a, b) => (b.heightM > a.heightM ? b : a));
const setMoment = (name: string, description: string, c: Conditions, camera: CameraPose, simTime: number): ReferenceMoment => ({
  name, description, moment: { conditions: c, camera, simTime, paused: true },
});
```

and append to the `REFERENCE_MOMENTS` array:

```ts
  setMoment('set-arriving', '08:15 facing south-west as a set appears: lines darkening on the horizon, 60 s out.',
    conditions({}), lineup(225, 1), REF_SET[0].arrivalS - 60),
  setMoment('set-on-the-reef', "08:15 looking north-north-east across the peak as the set's biggest wave stands up on the ledge.",
    conditions({}), lineup(15, 2), REF_BIGGEST.arrivalS - 1),
  setMoment('low-tide-set', 'The same wave at −0.5 m tide: shallower water, standing up harder and earlier.',
    conditions({ tideM: -0.5 }), lineup(15, 2), REF_BIGGEST.arrivalS - 1),
  setMoment('high-tide-set', 'The same wave at +0.5 m tide: deeper water, softer.',
    conditions({ tideM: 0.5 }), lineup(15, 2), REF_BIGGEST.arrivalS - 1),
  ref('looking-down', '10:30 looking down from the lineup: limestone, weed and turquoise sand pockets through clear water.',
    conditions({ timeOfDay: 10.5 }), lineup(30, -60)),
  ref('reef-overhead', 'Free camera 60 m above the reef at noon: the wedge, the shelf and the sand pockets from above.',
    conditions({ timeOfDay: 12.5 }), { mode: 'free', position: [0, 60, 40], yawDeg: 0, pitchDeg: -70 }),
```

`README.md`:
- Add the six new rows to the "Reference moments" table.
- Add `N` to the hotkey line ("`N` calls a set").
- Add one line under the table: "Sets arrive every 10–20 minutes. Use `N` or the Sets folder's button to call one, and the Reef folder for depths and the crest-line overlay."

- [ ] **Step 4: Run all tests**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src README.md
git commit -m "feat: reference moments for sets, tide and the reef; README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Phase 1 acceptance: checks, performance, gallery, Andrew's review

**Files:**
- Modify (only as measurements or Andrew's notes require): `src/seabed/wombReef.ts` (ledge polylines, depths), `src/swell/sets.ts` (`DEFAULT_SET_PARAMS`), `src/ocean/waterSurface.ts` (`DEFAULT_SHALLOW_SWELL`), `src/breaker/setWaveModel.ts` (shape constants), `src/seabed/seabedShading.ts` (albedos), `src/ocean/waterOptics.ts`
- Modify: `docs/superpowers/specs/2026-09-26-reef-and-sets-design.md` (status line), `docs/superpowers/phase-0-followups.md` (Phase 1 follow-ups section)

This task has no new code design. It measures the result, shows it to Andrew and tunes it together.

- [ ] **Step 1: Full automated check**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, and the build emits a `fieldWorker-*.js` chunk.

Controller, one GPU copy at a time: open `?selftest`. Expected `[selftest] SUMMARY 18/18 passed`.

- [ ] **Step 2: Performance (Andrew's RTX)**

Andrew opens `#ref=set-on-the-reef`, `#ref=looking-down` and `#ref=reef-overhead` in Chrome on the RTX. He sets "max fps" to 0 for the measurement, then back to 60, and reads the stats-gl GPU ms. Budget: ≤ 3 ms. If it's over budget, apply these levers in order, re-measuring after each:
1. `MARCH_STEPS` 20 → 14.
2. Skip the seabed march beyond 150 m from the camera (add `distance.lessThan(150)` to the march's `If` condition).
3. `MAX_ACTIVE_WAVES` 12 → 8.

Commit each lever applied with the measured numbers.

- [ ] **Step 3: Reference gallery (controller)**

Capture all reference moments, old and new, with the dev UI hidden. Check each against its description. List anything wrong: NaN or black pixels, a seam at the field's edge, crest-line kinks, waves regrowing behind the shelf, the reef visible where the water is too deep, or implausible colour.

Also record from Task 6's log:
- the north-ledge peel speed for the default swell (a fast, ledgy left peels at roughly 8–15 m/s);
- the same for a swell from 205° (S–SW), using the Swell folder.

- [ ] **Step 4: Andrew's review. STOP and hand over.**

Present the gallery, the performance numbers and the peel speeds. Ask Andrew to sit in the lineup in Chrome, call a few sets (`N`), try low and high tide, and give notes. Things to ask about specifically:
- the reef's shape and depths;
- whether the left peels at the right angle (the north ledge's orientation in `wombReef.ts` is the main lever);
- whether the right looks like it would close out;
- set rhythm and size;
- water clarity over the reef.

For each note, change the matching default and show before and after screenshots of the affected moment. Commit each round as `tune: <what> after Andrew's review` with the standard trailer.

Phase 1 is done when Andrew says the reef and sets look right, the budget is met and all checks pass.

- [ ] **Step 5: Close out**

- Spec status becomes `**Status:** Phase 1 complete (<date>)`.
- Append a "Phase 1 follow-ups" section to `docs/superpowers/phase-0-followups.md` for anything deferred.

```bash
git add docs README.md
git commit -m "docs: mark Phase 1 Reef & Sets complete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
