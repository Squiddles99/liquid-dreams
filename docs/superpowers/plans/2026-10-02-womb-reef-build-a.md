# The Womb's reef, build A (depths, rock, seeing it): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-profile the reef seaward of the ledges so 12 ft set waves break at the take-off spot and the left peels from the peak again, make the bed dark weedy rock with sand only in pockets, and make the reef readable from the face at take-off.

**Architecture:**
- **The depth change** lives in one place: `buildBathymetry`'s seaward branch. It calls two new pure functions:
  - `reefProfileDepth`: the face, then the steady slope;
  - `seawardDepth`: the profile capped by the coast inshore, and eased into the coast's own depth past the slope.
- **The material change** is in the same function's sand and weed channels.
- **Most of the GPU follows for free.** Depth and material reach it through the bathymetry texture, and the far field (`depthBg`, `depthBgNode`) does not change.
- **The bed's albedos** move into a shared module (`bedLook.ts`), so a CPU check and the TSL shading read the same numbers.
- **One measuring module** (`reefReport.ts`) turns a reef field into the spec's criteria. The criteria tests, the tuning search and the drawings for Andrew all use it.

**Tech Stack:** TypeScript, three.js TSL/WebGPU, Vitest, Electron runners (scratchpad) for GPU self-tests and stills.

**Spec:** `docs/superpowers/specs/2026-10-02-womb-reef-design.md` (approved by Andrew 2026-10-02).

## Global Constraints

- **Where to work:**
  - The `ld-reef` worktree (`C:\Dev\andrew-dev-personal-projects\ld-reef`), on branch `reef-build`. It has its own `npm install`. Never junction `node_modules`.
  - Pushing the branch is routine. **Never merge to main without Andrew's word.**
- **Hands off:**
  - Don't touch other sessions' worktrees (`ld-surfer`, `ld-shoulder`).
  - In the main checkout's `.claude/launch.json`, keep the peer's `ld-step2` entry.
- **Pictures before tuning ships** (feedback "wave shape by eye"). Andrew sees side-on depth drawings and in-game stills at **Gate 1 (Task 5)** and **Gate 2 (Task 8)**. Both gates are stops: send, then wait for his word.
- **The CPU model is the source of truth.** GPU mirrors stay exact. These self-tests pass in the end:
  - `?selftest=seabed`
  - `?selftest=seabed shading`
  - `?selftest=underwater`
  - `?selftest=breaker`
  - `?selftest=ribbon`
- **The spec's numbers**, as agreed with Andrew:
  - **Tides:** low −1.5 m, mid 0, high +1.5 m.
  - **Where it breaks:** the first section to break, for every set wave from 4 to 12 ft at every tide, does so at the take-off spot or within **30 m** seaward of it, never further out.
  - **The peel:** the left peels from the peak itself at **8–20 m/s**. The right still closes out along the south ledge.
  - **The barrel** (`overturn.psiState`):
    - 12 ft ideal is state 6, `thrown`.
    - 12 ft ordinary mostly closes out.
    - Smaller days: an oval at mid tide, the cylinder when ideal.
  - **Depth:**
    - 6 m at the take-off.
    - A steep face from about 11–12 m to 6 m over the last 30–40 m.
    - Steady to about 20 m by about 200 m out.
    - The open sea's 30 m beyond (`FAR_DEPTH_M`, `depthBg`, untouched).
  - **Material:**
    - Weedy rock is the default, including down the deep slope, out to two to three times the ledge line's distance offshore.
    - Sand only in scattered pockets.
    - The weedy shore platform runs from the waterline to the reef.
    - Outside the map: `OPEN_COAST_MATERIAL`.
  - **Seeing it:** the bed is readable to roughly **12–15 m** looking steeply down from the face. It fades to deep navy past ~20 m.
- **Assumptions this plan makes (Andrew to confirm at plan review):**
  - **"Ideal"** = the default swell (225°, 15 s) at whichever of the three tides gives 12 ft the highest ψ, after a lull (`drainFactor(Infinity, T)`). Offshore wind changes the tube's size, not ψ.
  - **"Ordinary"** = mid tide, a wave inside a set (drain 1).
  - **"Mostly closes out"** = on an ordinary day, the north ledge's first 40 m breaks within **1.5 s**. That is the rule the right's closeout already uses.
  - **"A 12 ft wave"** = `setWaveHeight(12)`, the biggest wave of set 1 at that size.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Commands:**
  - tests `npx vitest run <files>`
  - suite `npx vitest run`
  - types `npm run typecheck`

All of these run from `ld-reef`.

## Review Focus

These are the failure modes the spec implies that its own criteria don't exercise. Each one's test sits in the owning task.

1. **Swell direction off 225°.** At 215° and 235°, 12 ft at mid tide must still first break within 30 m of the peak, not out on the slope. Tested in Task 3, Step 1.
2. **Swell period off 15 s.** At 12 s and 18 s, 12 ft at mid tide must still first break within 30 m of the peak. Tested in Task 3, Step 1.
3. **Degenerate dev-panel reef params.** A face width of 0, or a slope end at or inside the face, must give a finite, monotonic bed, never NaN. Tested in Task 2, Step 1.
4. **A dev look saved before this build** (model 6, with `deepDepthM` and `ledgeWidthM`) must load the new reef defaults and drop the old keys. Tested in Task 2, Step 1.
5. **The view ray over the new face.** A march from the take-off over a bed that drops up to 8 m ahead must still hit it on the GPU exactly as on the CPU. Tested in Task 8, Step 1.

---

## File map

| File | Change |
|---|---|
| `src/breaker/reefReport.ts` | **Create.** The measuring module: set-wave heights, the first break on the peak's ray, the furthest break, the north ledge's break times, peel speed, ψ at the break, the scorecard, its text table, ray depth profiles. |
| `src/breaker/reefReport.test.ts` | **Create.** The measuring module's own invariants (reef-independent). |
| `src/breaker/reefCriteria.test.ts` | **Create.** The spec's §2.1–2.3 as tests (RED until Task 3), plus Review Focus 1–2. |
| `src/breaker/reefTune.test.ts` | **Create.** The tuning search (runs only with `VITE_REEF_TUNE=1`). |
| `src/seabed/reefViewer.test.ts` | **Create.** The baseline dump (Task 1), and the Gate 1 drawing (Task 5). Env-gated. |
| `src/seabed/bathymetry.ts` | **Modify.** Export `ledgeSignedDistance`. Add `reefProfileDepth` and `seawardDepth`; remove `rampShape`. Rewrite the seaward branch and the material channels. |
| `src/seabed/wombReef.ts` | **Modify.** `ReefParams` gets the face and slope fields; `deepDepthM` and `ledgeWidthM` go. New `SAND_POCKETS`, the rock reach constants, `rockReachM`. |
| `src/seabed/bathymetry.test.ts` | **Modify.** The ramp tests are replaced by the profile's; the material test is replaced by the material rules. |
| `src/seabed/bedLook.ts` | **Create.** The bed's albedos (shared CPU/TSL), `bedSeenFromAbove`, `luminance`, `contrastAtDepth`. |
| `src/seabed/bedLook.test.ts` | **Create.** Readability at 12–15 m; darker and bluer with depth. |
| `src/seabed/seabedShading.ts` | **Modify.** The albedos come from `bedLook.ts`. |
| `src/seabed/seabedShading.selftest.ts` | **Modify.** Add a ray over the new face. |
| `src/dev/DevPanel.ts` | **Modify.** Reef folder bindings for the new params. |
| `src/dev/devSettings.ts` | **Modify.** `BREAKING_MODEL` becomes 7; a look older than 7 loads the default reef. |
| `src/dev/devSettings.test.ts` | **Modify.** Use the new keys; add the model-6 reset test. |
| `src/breaker/reefPsi.test.ts` | **Modify (Task 4).** The softened-ramp band test and the calibration block go. "Too big breaks outside" is re-expressed. |
| `src/breaker/breakingField.test.ts`, `src/breaker/crestTrace.test.ts`, `src/breaker/reefField.test.ts`, others found red in Task 4 | **Modify (Task 4).** Only assertions and comments that pin the softened ramp's numbers. Each one is ledgered. |

---

### Task 1: The measuring module, the criteria as RED tests, and the baseline

**Files:**
- Create: `src/breaker/reefReport.ts`, `src/breaker/reefReport.test.ts`, `src/breaker/reefCriteria.test.ts`, `src/seabed/reefViewer.test.ts`
- Modify: `src/seabed/bathymetry.ts` (export `ledgeSignedDistance`; nothing else)

**Interfaces:**
- **Consumes** (existing code):
  - `computeReefField`, `sampleField`, `sampleOnset` (`reefField.ts`)
  - `onsetTime`, `onsetPsi`, `DEFAULT_BREAK_PARAMS`, `BreakParams` (`breaking.ts`)
  - `drainFactor`, `effectivePsi`, `psiState`, `PsiState` (`overturn.ts`)
  - `wavesOfSet`, `DEFAULT_SET_PARAMS` (`swell/sets.ts`)
  - `DEFAULT_CONDITIONS`, `cloneConditions`
  - `NORTH_LEDGE`
  - `bedHeightAt`, `buildBathymetry`, `downsample`
- **Produces** (used by Tasks 3, 4 and 5):
  - `type Tide = 'low' | 'mid' | 'high'`, `TIDES: Record<Tide, number>`
  - `setWaveHeight(sizeFt: number): number`
  - `firstBreak(f: ReefField, H: number, p?): { d: number; x: number; z: number } | null`, `firstBreakSeaward(f, H, p?): number` (−Infinity if it never breaks)
  - `furthestBreak(f, H, p?): { x: number; z: number; v: number } | null`
  - `northLedgeBreakTimes(f, H, metres?: number, stepM?: number, p?): number[]`, `peelSpeed(times: number[], stepM?: number): number`
  - `peakPsi(f, H, lull: boolean, p?): number`
  - `evaluateReef(fields: Record<Tide, ReefField>, p?): ReefCard`, `formatCard(card: ReefCard): string`
  - `rayProfile(bathy: Bathymetry, f: ReefField, px: number, pz: number, seawardM?: number, inshoreM?: number): [number, number][]`
  - Constants:
    - `BREAK_NEAR_PEAK_M = 30`
    - `PEEL_BAND = [8, 20]`
    - `CLOSEOUT_SPREAD_S = 1.5`
    - `PEEL_SPAN_M = 40`
    - `CRITERIA_SIZES_FT = [4, 6, 8, 10, 12]`
    - `PEEL_SIZES_FT = [4, 6, 8]`
  - `ledgeSignedDistance(x: number, z: number): number`, now exported from `bathymetry.ts`

- [ ] **Step 1: Export the ledge distance.** In `src/seabed/bathymetry.ts`, change `function ledgeSignedDistance(` to `export function ledgeSignedDistance(`. Nothing else changes.

- [ ] **Step 2: Write the measuring module's invariant tests** in `src/breaker/reefReport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { computeReefField } from './reefField';
import { firstBreak, firstBreakSeaward, furthestBreak, northLedgeBreakTimes, peakPsi, peelSpeed, rayProfile, setWaveHeight } from './reefReport';

// Reef-independent invariants: they hold on the softened ramp today and on the new reef after Task 3.
const bathy = buildBathymetry();
const mid = computeReefField({ bed: downsample(bathy, 2), periodS: 15, fromDeg: 225, tideM: 0 });

describe('the reef report (plan 2026-10-02 Task 1)', () => {
  it('a bigger swell has a bigger biggest set wave', () => {
    const h = [4, 6, 8, 10, 12].map(setWaveHeight);
    for (let i = 1; i < h.length; i++) expect(h[i]).toBeGreaterThan(h[i - 1]);
  });
  it('a bigger wave first breaks no further inshore on the peak’s ray (0.5 m steps)', () => {
    let prev = -Infinity;
    for (let H = 2; H <= 8; H += 0.5) {
      const d = firstBreakSeaward(mid, H);
      expect(d).toBeGreaterThanOrEqual(prev - 0.5);
      prev = Math.max(prev, d);
    }
  });
  it('a 5 cm wave breaks nowhere: no first break, no furthest break, no ψ', () => {
    expect(firstBreak(mid, 0.05)).toBeNull();
    expect(firstBreakSeaward(mid, 0.05)).toBe(-Infinity);
    expect(furthestBreak(mid, 0.05)).toBeNull();
    expect(peakPsi(mid, 0.05, false)).toBeNaN();
  });
  it('the north ledge is read every 5 m over its first 40 m; peel speed is span ÷ time', () => {
    expect(northLedgeBreakTimes(mid, setWaveHeight(6))).toHaveLength(9);
    expect(peelSpeed([0, 1, 2], 5)).toBe(5);
    expect(peelSpeed([3, 3.5, 4, 4.5, 5], 5)).toBe(10);
  });
  it('a lull drains the reef: ψ after a lull is above ψ inside a set', () => {
    const H = setWaveHeight(8);
    expect(peakPsi(mid, H, true)).toBeGreaterThan(peakPsi(mid, H, false));
  });
  it('the ray profile runs from inshore to seaward, 1 m apart, with the peak at s = 0', () => {
    const r = rayProfile(bathy, mid, 0, 0, 100, 20);
    expect(r).toHaveLength(121);
    expect(r[0][0]).toBe(-20);
    expect(r[20]).toEqual([0, expect.closeTo(6, 1)]);
    expect(r[120][0]).toBe(100);
  });
});
```

- [ ] **Step 3: Run it to verify it fails.**
Run: `npx vitest run src/breaker/reefReport.test.ts`
Expected: FAIL, "Failed to resolve import ./reefReport".

- [ ] **Step 4: Write the measuring module** in `src/breaker/reefReport.ts`:

```ts
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { type Bathymetry, bedHeightAt, ledgeSignedDistance } from '../seabed/bathymetry';
import { NORTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { type BreakParams, DEFAULT_BREAK_PARAMS, onsetPsi, onsetTime } from './breaking';
import { type PsiState, drainFactor, effectivePsi, psiState } from './overturn';
import { type ReefField, sampleField, sampleOnset } from './reefField';

/**
 * The reef's criteria measured from a reef field (spec 2026-10-02-womb-reef-design §2): where a set wave first breaks,
 * how the left peels, and the tube's state where it breaks. The criteria tests, the tuning search and the drawings for
 * Andrew all read the reef through this one module.
 */

export type Tide = 'low' | 'mid' | 'high';
export const TIDES: Readonly<Record<Tide, number>> = { low: -1.5, mid: 0, high: 1.5 };
const TIDE_NAMES = Object.keys(TIDES) as Tide[];
/** Spec §2.1: the first break is at the take-off spot or within this far (m) seaward of it. */
export const BREAK_NEAR_PEAK_M = 30;
/** Spec §2.2: the left's peel speed band (m/s). */
export const PEEL_BAND: readonly [number, number] = [8, 20];
/** A stretch of line that breaks within this many seconds has closed out (the right's rule, breakingField.test). */
export const CLOSEOUT_SPREAD_S = 1.5;
/** The north ledge's first PEEL_SPAN_M from the peak is where the left must peel from (spec §2.2). */
export const PEEL_SPAN_M = 40;
export const CRITERIA_SIZES_FT = [4, 6, 8, 10, 12] as const;
export const PEEL_SIZES_FT = [4, 6, 8] as const;
const STEP_M = 0.5;
const INSHORE_REACH_M = 60;
const SEAWARD_REACH_M = 300;
const LEDGE_READ_INSHORE_M = 40;

type Gd = Pick<BreakParams, 'gamma' | 'delta'>;

/** The biggest wave of the first set at sizeFt (the default swell otherwise): the set wave the criteria read. */
export function setWaveHeight(sizeFt: number): number {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = sizeFt;
  return wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => Math.max(a, b.heightM), 0);
}

function onsetAt(f: ReefField, x: number, z: number, H: number, p: Gd): number | null {
  const r = sampleOnset(f, x, z);
  return r ? onsetTime(r, 0, H, p) : null;
}

/**
 * Where H first breaks on the peak's traced ray: d metres seaward of the peak (0, 0) (negative: inshore of it) and the
 * point. The onset record is a running maximum along the ray, so the seaward-most broken point is the first break.
 * Null when it hasn't broken within INSHORE_REACH_M inshore of the peak.
 */
export function firstBreak(f: ReefField, H: number, p: Gd = DEFAULT_BREAK_PARAMS): { d: number; x: number; z: number } | null {
  let x = 0, z = 0;
  if (onsetAt(f, 0, 0, H, p) !== null) {
    let d = 0;
    while (d < SEAWARD_REACH_M) {
      const s = sampleField(f, x, z), nx = x - s.dirX * STEP_M, nz = z - s.dirZ * STEP_M;
      if (onsetAt(f, nx, nz, H, p) === null) break;
      x = nx; z = nz; d += STEP_M;
    }
    return { d, x, z };
  }
  for (let d = STEP_M; d <= INSHORE_REACH_M + 1e-9; d += STEP_M) {
    const s = sampleField(f, x, z);
    x += s.dirX * STEP_M; z += s.dirZ * STEP_M;
    if (onsetAt(f, x, z, H, p) !== null) return { d: -d, x, z };
  }
  return null;
}

export const firstBreakSeaward = (f: ReefField, H: number, p: Gd = DEFAULT_BREAK_PARAMS): number => firstBreak(f, H, p)?.d ?? -Infinity;

/**
 * The broken node furthest seaward of the ledge lines (v m, unwarped: the reef's warp moves the lines up to 7 m) on the
 * reef's seaward side (x ≤ 40 m, z ∈ [−300, 120], every 2 m); null if H breaks nowhere seaward of them.
 */
export function furthestBreak(f: ReefField, H: number, p: Gd = DEFAULT_BREAK_PARAMS): { x: number; z: number; v: number } | null {
  let worst: { x: number; z: number; v: number } | null = null;
  for (let x = -398; x <= 40; x += 2) for (let z = -300; z <= 120; z += 2) {
    const sd = ledgeSignedDistance(x, z);
    if (sd >= 0 || (worst && -sd <= worst.v)) continue;
    if (onsetAt(f, x, z, H, p) !== null) worst = { x, z, v: -sd };
  }
  return worst;
}

/**
 * When each section along the north ledge's first `metres` from the peak broke (s; the crest reaches the peak at 0):
 * τ less the time since onset, read on the ledge or, where that section hasn't broken yet, at the first broken point up
 * to 40 m inshore along its ray. NaN where it doesn't break within that.
 */
export function northLedgeBreakTimes(f: ReefField, H: number, metres = PEEL_SPAN_M, stepM = 5, p: Gd = DEFAULT_BREAK_PARAMS): number[] {
  const [a, b] = [NORTH_LEDGE[0], NORTH_LEDGE[1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out: number[] = [];
  for (let s = 0; s <= metres + 1e-9; s += stepM) {
    let x = a[0] + ((b[0] - a[0]) * s) / len, z = a[1] + ((b[1] - a[1]) * s) / len, t = NaN;
    for (let d = 0; d <= LEDGE_READ_INSHORE_M + 1e-9; d += STEP_M) {
      const tb = onsetAt(f, x, z, H, p), sf = sampleField(f, x, z);
      if (tb !== null) { t = sf.tau - tb; break; }
      x += sf.dirX * STEP_M; z += sf.dirZ * STEP_M;
    }
    out.push(t);
  }
  return out;
}

/** The peel speed (m/s) over break times stepM apart: the span over the time from the first to the last. */
export const peelSpeed = (times: readonly number[], stepM = 5): number => ((times.length - 1) * stepM) / (times[times.length - 1] - times[0]);

/**
 * The crest's ψ where H first breaks on the peak's ray (spec §2.3): the record's ψ₀ there with the drain (after a lull
 * drainFactor(Infinity, T); a wave inside a set 1), no dial draw. NaN if it doesn't break.
 */
export function peakPsi(f: ReefField, H: number, lull: boolean, p: BreakParams = DEFAULT_BREAK_PARAMS): number {
  const at = firstBreak(f, H, p);
  if (!at) return NaN;
  const r = sampleOnset(f, at.x, at.z);
  if (!r) return NaN;
  return effectivePsi(onsetPsi(r, 0, H, p), { drain: lull ? drainFactor(Infinity, f.periodS) : 1, draw: 0 }, p);
}

export interface ReefCard {
  /** Metres seaward of the peak, by CRITERIA_SIZES_FT. */
  firstBreak: Record<Tide, number[]>;
  furthest12: Record<Tide, { x: number; z: number; v: number } | null>;
  /** Mid tide, by PEEL_SIZES_FT. */
  peel: number[];
  peelMonotonic: boolean[];
  psi: Record<Tide, { set: number; lull: number }[]>;
  ideal12: { tide: Tide; psi: number; state: PsiState; peel: number };
  /** Mid tide, a wave inside a set: the north ledge's first 40 m break spread (s). */
  ordinary12Spread: number;
  passes: Record<'breakNearPeak' | 'nothingOutside' | 'peelFromPeak' | 'thrown12' | 'closeout12' | 'smallDays', boolean>;
}

/** The spec's §2.1–2.3 on fields at the three tides (default swell). */
export function evaluateReef(fields: Readonly<Record<Tide, ReefField>>, p: BreakParams = DEFAULT_BREAK_PARAMS): ReefCard {
  const H = CRITERIA_SIZES_FT.map(setWaveHeight), H12 = setWaveHeight(12), i12 = CRITERIA_SIZES_FT.indexOf(12);
  const firstBreakM = {} as ReefCard['firstBreak'], furthest12 = {} as ReefCard['furthest12'], psi = {} as ReefCard['psi'];
  for (const t of TIDE_NAMES) {
    firstBreakM[t] = H.map((h) => firstBreakSeaward(fields[t], h, p));
    furthest12[t] = furthestBreak(fields[t], H12, p);
    psi[t] = H.map((h) => ({ set: peakPsi(fields[t], h, false, p), lull: peakPsi(fields[t], h, true, p) }));
  }
  const times = PEEL_SIZES_FT.map((ft) => northLedgeBreakTimes(fields.mid, setWaveHeight(ft), PEEL_SPAN_M, 5, p));
  const peel = times.map((ts) => peelSpeed(ts));
  const peelMonotonic = times.map((ts) => ts.every((t, i) => Number.isFinite(t) && (i === 0 || t > ts[i - 1])));
  const idealTide = TIDE_NAMES.reduce((a, b) => (psi[b][i12].lull > psi[a][i12].lull ? b : a));
  const idealPsi = psi[idealTide][i12].lull;
  const ideal12 = { tide: idealTide, psi: idealPsi, state: psiState(idealPsi), peel: peelSpeed(northLedgeBreakTimes(fields[idealTide], H12, PEEL_SPAN_M, 5, p)) };
  const ord = northLedgeBreakTimes(fields.mid, H12, PEEL_SPAN_M, 5, p).filter(Number.isFinite);
  const ordinary12Spread = ord.length >= 7 ? Math.max(...ord) - Math.min(...ord) : NaN;
  const inBand = (v: number) => v >= PEEL_BAND[0] && v <= PEEL_BAND[1];
  const at = (ft: number) => CRITERIA_SIZES_FT.indexOf(ft as (typeof CRITERIA_SIZES_FT)[number]);
  const bestLull = (i: number) => Math.max(...TIDE_NAMES.map((t) => psi[t][i].lull));
  return {
    firstBreak: firstBreakM, furthest12, peel, peelMonotonic, psi, ideal12, ordinary12Spread,
    passes: {
      // Every size breaks no further out than 30 m; 6 ft and up break by 60 m inshore (at the take-off, not on the inner shelf).
      breakNearPeak: TIDE_NAMES.every((t) => firstBreakM[t].every((d, i) => d <= BREAK_NEAR_PEAK_M && (CRITERIA_SIZES_FT[i] < 6 || Number.isFinite(d)))),
      nothingOutside: TIDE_NAMES.every((t) => furthest12[t] === null || furthest12[t]!.v <= BREAK_NEAR_PEAK_M),
      peelFromPeak: peel.every(inBand) && peelMonotonic.every(Boolean),
      thrown12: ideal12.state === 'thrown' && inBand(ideal12.peel),
      closeout12: ordinary12Spread <= CLOSEOUT_SPREAD_S,
      smallDays: [6, 8].every((ft) => ['oval', 'cylinder'].includes(psiState(psi.mid[at(ft)].set)) && psiState(bestLull(at(ft))) === 'cylinder')
        && TIDE_NAMES.every((t) => !['thrown', 'slab'].includes(psiState(psi[t][at(4)].set))),
    },
  };
}

/** The card as a plain-text table (the baseline file, the tuning log, the gate's numbers). */
export function formatCard(c: ReefCard): string {
  const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
  const rows = [`size  | ${TIDE_NAMES.map((t) => `${t}: first break m, ψ set/lull (state)`).join(' | ')}`];
  CRITERIA_SIZES_FT.forEach((ft, i) => rows.push(`${String(ft).padStart(2)} ft | ${TIDE_NAMES.map((t) => `${f(c.firstBreak[t][i])} m, ${f(c.psi[t][i].set, 3)}/${f(c.psi[t][i].lull, 3)} (${psiState(c.psi[t][i].set)}/${psiState(c.psi[t][i].lull)})`).join(' | ')}`));
  rows.push(`furthest 12 ft break seaward of the ledges: ${TIDE_NAMES.map((t) => `${t} ${c.furthest12[t] ? `${f(c.furthest12[t]!.v)} m at (${c.furthest12[t]!.x}, ${c.furthest12[t]!.z})` : 'none'}`).join(', ')}`);
  rows.push(`left peel from the peak, mid tide: ${PEEL_SIZES_FT.map((ft, i) => `${ft} ft ${f(c.peel[i])} m/s${c.peelMonotonic[i] ? '' : ' (not in order)'}`).join(', ')}`);
  rows.push(`12 ft ideal (${c.ideal12.tide} tide, after a lull): ψ ${f(c.ideal12.psi, 3)} ${c.ideal12.state}, peel ${f(c.ideal12.peel)} m/s; ordinary (mid, in a set): first 40 m break within ${f(c.ordinary12Spread, 2)} s`);
  rows.push(`passes: ${Object.entries(c.passes).map(([k, v]) => `${k} ${v ? 'yes' : 'NO'}`).join(', ')}`);
  return rows.join('\n');
}

/** Still-water depth (m) along the traced ray through (px, pz), 1 m apart: [s, depth], s from −inshoreM to +seawardM (seaward positive). */
export function rayProfile(bathy: Bathymetry, f: ReefField, px: number, pz: number, seawardM = 300, inshoreM = 60): [number, number][] {
  const out: [number, number][] = [];
  let x = px, z = pz;
  for (let s = 0; s <= seawardM; s++) {
    out.push([s, -bedHeightAt(bathy, x, z)]);
    const d = sampleField(f, x, z); x -= d.dirX; z -= d.dirZ;
  }
  x = px; z = pz;
  for (let s = 1; s <= inshoreM; s++) {
    const d = sampleField(f, x, z); x += d.dirX; z += d.dirZ;
    out.unshift([-s, -bedHeightAt(bathy, x, z)]);
  }
  return out;
}
```

- [ ] **Step 5: Run it to verify it passes.**
Run: `npx vitest run src/breaker/reefReport.test.ts`
Expected: PASS 6/6.
If "no further inshore" fails on today's reef, read the d values first. A ramp can let a mid-size wave break further out than a bigger one, because the slurp reads along the crest. In that case, weaken the assertion to the largest H only (12 ft ≥ 4 ft) and ledger it as a ruling. Don't change the module.

- [ ] **Step 6: Write the criteria tests (RED on today's reef)** in `src/breaker/reefCriteria.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { type ReefField, computeReefField } from './reefField';
import { BREAK_NEAR_PEAK_M, CLOSEOUT_SPREAD_S, CRITERIA_SIZES_FT, PEEL_BAND, PEEL_SIZES_FT, TIDES, type Tide, evaluateReef, firstBreakSeaward, formatCard, setWaveHeight } from './reefReport';

// Spec 2026-10-02-womb-reef-design §2 (Andrew): where the Womb breaks, how it peels and how it barrels, by conditions.
const bed = downsample(buildBathymetry(), 2);
const field = (tideM: number, fromDeg = 225, periodS = 15): ReefField => computeReefField({ bed, periodS, fromDeg, tideM });
const fields = Object.fromEntries((Object.keys(TIDES) as Tide[]).map((t) => [t, field(TIDES[t])])) as Record<Tide, ReefField>;
const card = evaluateReef(fields);
console.log(formatCard(card));

describe("the Womb's reef: where and how it breaks (spec 2026-10-02 §2)", () => {
  it('every set wave 4–12 ft first breaks at the take-off spot or within 30 m seaward of it, at every tide (§2.1)', () => {
    for (const t of Object.keys(TIDES) as Tide[]) CRITERIA_SIZES_FT.forEach((ft, i) => {
      expect(card.firstBreak[t][i], `${ft} ft, ${t} tide`).toBeLessThanOrEqual(BREAK_NEAR_PEAK_M);
      if (ft >= 6) expect(Number.isFinite(card.firstBreak[t][i]), `${ft} ft, ${t} tide breaks at the take-off`).toBe(true);
    });
  });
  it('nowhere does a 12 ft set wave break more than 30 m seaward of the ledges, at any tide (§2.1)', () => {
    for (const t of Object.keys(TIDES) as Tide[]) {
      const w = card.furthest12[t];
      expect(w ? w.v : 0, `${t} tide: ${w ? `(${w.x}, ${w.z})` : ''}`).toBeLessThanOrEqual(BREAK_NEAR_PEAK_M);
    }
  });
  it('the left peels from the peak itself, in order, at 8–20 m/s (4–8 ft, mid tide) (§2.2)', () => {
    PEEL_SIZES_FT.forEach((ft, i) => {
      expect(card.peelMonotonic[i], `${ft} ft breaks in order from the peak`).toBe(true);
      expect(card.peel[i], `${ft} ft`).toBeGreaterThanOrEqual(PEEL_BAND[0]);
      expect(card.peel[i], `${ft} ft`).toBeLessThanOrEqual(PEEL_BAND[1]);
    });
  });
  it('12 ft on the ideal day is thrown out (state 6) and still peels (§2.3)', () => {
    expect(card.ideal12.state, `${card.ideal12.tide} tide ψ ${card.ideal12.psi.toFixed(3)}`).toBe('thrown');
    expect(card.ideal12.peel).toBeGreaterThanOrEqual(PEEL_BAND[0]);
    expect(card.ideal12.peel).toBeLessThanOrEqual(PEEL_BAND[1]);
  });
  it('12 ft on an ordinary day closes the left out: its first 40 m breaks within 1.5 s (§2.3)', () => {
    expect(card.ordinary12Spread).toBeLessThanOrEqual(CLOSEOUT_SPREAD_S);
  });
  it('smaller days: 6–8 ft an oval or cylinder at mid tide, the cylinder when ideal; 4 ft never thrown (§2.3)', () => {
    expect(card.passes.smallDays).toBe(true);
  });
});

describe('off the default swell (plan Review Focus 1–2)', () => {
  const H = setWaveHeight(12);
  for (const [name, fromDeg, periodS] of [['215°', 215, 15], ['235°', 235, 15], ['12 s', 225, 12], ['18 s', 225, 18]] as const) {
    it(`12 ft at mid tide from ${name} still first breaks within 30 m of the peak`, { timeout: 60_000 }, () => {
      expect(firstBreakSeaward(field(0, fromDeg, periodS), H)).toBeLessThanOrEqual(BREAK_NEAR_PEAK_M);
    });
  }
});
```

- [ ] **Step 7: Run it to verify it fails, for the right reasons.**
Run: `npx vitest run src/breaker/reefCriteria.test.ts > "$SCRATCH/reef/criteria-red.txt" 2>&1; tail -60 "$SCRATCH/reef/criteria-red.txt"`. Here `$SCRATCH` is the session scratchpad; create `reef/` in it.
Expected:
- FAIL: §2.1, both tests. Today's 12 ft first breaks 100–250 m out.
- FAIL: §2.2.
- FAIL: at least one of 215°/235°/12 s/18 s.

The other tests may pass or fail; record which. A failure on an import or a thrown error is not a RED. Fix that first.

This file stays RED until Task 3. It is not in Task 1's `task-done` command.

- [ ] **Step 8: Write the baseline dump** in `src/seabed/reefViewer.test.ts`. Task 5 adds the drawing to this file.

```ts
import { describe, it } from 'vitest';
import { computeReefField } from '../breaker/reefField';
import { TIDES, type Tide, evaluateReef, formatCard, rayProfile } from '../breaker/reefReport';
import { buildBathymetry, downsample } from './bathymetry';
import { NORTH_LEDGE } from './wombReef';

const BASELINE_OUT: string = import.meta.env.VITE_REEF_BASELINE_OUT ?? '';
// node:fs through a computed specifier: the project's typecheck has no Node types, and this only runs under Vitest.
const nodeFs = (): Promise<{ writeFileSync(p: string, d: string): void; readFileSync(p: string, e: 'utf8'): string }> => import(/* @vite-ignore */ ['node', 'fs'].join(':'));

/** The point 40 m up the north ledge from the peak: the second drawn ray starts here. */
export const NORTH_RAY_START: readonly [number, number] = (() => {
  const [a, b] = NORTH_LEDGE, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [a[0] + ((b[0] - a[0]) * 40) / len, a[1] + ((b[1] - a[1]) * 40) / len] as const;
})();

/** The reef as built now: depth along the two rays and its scorecard (the drawing's "before"). */
export function reefSnapshot() {
  const bathy = buildBathymetry(), bed = downsample(bathy, 2);
  const fields = Object.fromEntries((Object.keys(TIDES) as Tide[]).map((t) => [t, computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: TIDES[t] })])) as Record<Tide, ReturnType<typeof computeReefField>>;
  const card = evaluateReef(fields);
  return { peakRay: rayProfile(bathy, fields.mid, 0, 0), northRay: rayProfile(bathy, fields.mid, NORTH_RAY_START[0], NORTH_RAY_START[1]), card, text: formatCard(card) };
}

describe.skipIf(!BASELINE_OUT)('the reef before build A (plan 2026-10-02 Task 1)', () => {
  it('dumps the softened ramp’s rays and scorecard', { timeout: 600_000 }, async () => {
    const fs = await nodeFs();
    fs.writeFileSync(BASELINE_OUT, JSON.stringify(reefSnapshot()));
  });
});
```

- [ ] **Step 9: Dump the baseline.**
Run (bash):

```bash
VITE_REEF_BASELINE_OUT=docs/superpowers/plans/2026-10-02-womb-reef-baseline.json npx vitest run src/seabed/reefViewer.test.ts
```

Expected: PASS 1/1, and the JSON written. Its `text` field shows today's numbers: 12 ft first breaks at 100+ m at mid tide, and `breakNearPeak NO`.

- [ ] **Step 10: The "before" stills.**
1. Add this entry to the main checkout's `.claude/launch.json` beside `ld-step2`. Do not commit it there.

   ```json
   { "name": "ld-reef", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "../ld-reef", "run", "dev", "--", "--port", "5181", "--strictPort"], "port": 5181 }
   ```

2. Start it with `preview_start {name: "ld-reef"}`.
3. Make the three camera moments. Each one is Andrew's 12 ft link (seed 2002, mid tide, simTime 1407.7, weather as in his link) with the camera swapped:
   - **lineup:** `{"mode":"free","position":[84,3,0],"yawDeg":260,"pitchDeg":-3}`
   - **peak12** (Andrew's 12 ft camera): `{"mode":"free","position":[-70.49,6.31,23.70],"yawDeg":208.8,"pitchDeg":-6.2}`
   - **takeoff** (on the face at the peak, looking steeply down): `{"mode":"free","position":[-4,5,3],"yawDeg":208.8,"pitchDeg":-50}`

   Build each one's base64 with node:

   ```bash
   node -e "const m={v:1,conditions:{date:'2026-07-15',timeOfDay:8.25,swell:{sizeFt:12,periodS:15,directionDeg:225},wind:{speedMs:3,directionDeg:80},tideM:0,seed:2002,weather:{lowCover:0.22,convection:0.25,lowBaseM:900,midCover:0,highCover:0.05,rain:0,storm:0,visibilityKm:60,fogTopM:1500,windAloftDeg:270,windAloftMs:8}},camera:JSON.parse(process.argv[1]),simTime:1407.7,paused:true};console.log(Buffer.from(JSON.stringify(m)).toString('base64'))" '{"mode":"free","position":[-4,5,3],"yawDeg":208.8,"pitchDeg":-50}'
   ```

4. Capture each one at times 1403.7, 1405.7 and 1407.7:

   ```bash
   npx electron "$SCRATCH/capture-runner.mjs" --base=http://localhost:5181/ --out="$SCRATCH/reef/before-takeoff" --times=1403.7,1405.7,1407.7 --m=<base64>
   ```

   The scratchpad runner sits beside `selftest-runner.mjs`. Run electron from `ld-reef`.

Expected: nine PNGs in `$SCRATCH/reef/`. Look at each one. If no set wave is near the peak in these frames, step simTime by ±15 s until one is, and use the same times for every later capture. Ledger the times.

- [ ] **Step 11: Commit.**

```bash
git add src/seabed/bathymetry.ts src/breaker/reefReport.ts src/breaker/reefReport.test.ts src/breaker/reefCriteria.test.ts src/seabed/reefViewer.test.ts docs/superpowers/plans/2026-10-02-womb-reef-baseline.json
git commit -m "test(reef): the reef report and the spec's criteria (RED on the softened ramp), with today's baseline"
```

`task-done` command: `npx vitest run src/breaker/reefReport.test.ts src/seabed/bathymetry.test.ts`

---

### Task 2: The new seaward profile, its params, the dev panel and saved looks

**Files:**
- Modify: `src/seabed/wombReef.ts` (`ReefParams`, `DEFAULT_REEF_PARAMS`)
- Modify: `src/seabed/bathymetry.ts`: add `reefProfileDepth`, `seawardDepth` and `REEF_FAR_EASE_M`; remove `rampShape`; rewrite the `sd < 0` depth and the edge fade.
- Modify: `src/seabed/bathymetry.test.ts`, `src/dev/DevPanel.ts:470-472`, `src/dev/devSettings.ts:40,143-144`, `src/dev/devSettings.test.ts:527-536`

**Interfaces:**
- **Consumes:** `ledgeSignedDistance` (Task 1), `depthBg`, `REEF_SURROUND_DEPTH_M`, `SHORE_X`
- **Produces:**
  - `ReefParams { ledgeDepthM, faceBaseDepthM, faceWidthM, slopeDepthM, slopeEndM, shelfDepthM, headReliefM, minDepthM, pocketDepthM }`, all numbers in metres.
  - `reefProfileDepth(v: number, p: ReefParams): number`
  - `seawardDepth(v: number, x: number, p: ReefParams): number`
  - `REEF_FAR_EASE_M = 50`
  - `BREAKING_MODEL = 7`

- [ ] **Step 1: Write the failing tests.** In `src/seabed/bathymetry.test.ts`:
- Change the import to `import { bedHeightAt, buildBathymetry, downsample, reefProfileDepth, reefWarp, seawardDepth } from './bathymetry';` and add `import { SHORE_X } from './coastProfile';`.
- Delete these three tests:
  - "drops to deep water seaward of the ledges' ramp and to the south-west"
  - "the seaward ramp: v², flat at the ledge, steepest at the deep edge (spec §4)"
  - "the ledge line stays at the ledge depth, and nothing outside the shelf near the peak is steeper than 1:8"

  They pin the softened ramp. The spec replaces it (§3).
- Add:

```ts
describe('the reef seaward of the ledges (spec 2026-10-02 §3)', () => {
  const p = DEFAULT_REEF_PARAMS;
  it('the profile: the ledge depth at the ledge, the face base at its width, the slope depth at its end and beyond, never shallowing', () => {
    expect(reefProfileDepth(0, p)).toBeCloseTo(p.ledgeDepthM, 9);
    expect(reefProfileDepth(-5, p)).toBeCloseTo(p.ledgeDepthM, 9);
    expect(reefProfileDepth(p.faceWidthM, p)).toBeCloseTo(p.faceBaseDepthM, 9);
    expect(reefProfileDepth(p.slopeEndM, p)).toBeCloseTo(p.slopeDepthM, 9);
    expect(reefProfileDepth(p.slopeEndM + 100, p)).toBeCloseTo(p.slopeDepthM, 9);
    for (let v = 0; v < 400; v += 0.5) expect(reefProfileDepth(v + 0.5, p)).toBeGreaterThanOrEqual(reefProfileDepth(v, p));
  });
  it('the slope beyond the face is steady: the same gradient all the way to its end', () => {
    const g = (v: number) => reefProfileDepth(v + 1, p) - reefProfileDepth(v, p);
    for (let v = p.faceWidthM + 1; v < p.slopeEndM - 2; v += 7) expect(g(v)).toBeCloseTo(g(p.faceWidthM + 1), 9);
  });
  it('degenerate params (dev panel) stay finite and never shallow seaward (plan Review Focus 3)', () => {
    for (const q of [{ ...p, faceWidthM: 0 }, { ...p, slopeEndM: p.faceWidthM }, { ...p, slopeEndM: 0, faceWidthM: 0 }]) {
      let prev = -Infinity;
      for (let v = 0; v < 300; v += 1) { const d = reefProfileDepth(v, q); expect(Number.isFinite(d)).toBe(true); expect(d).toBeGreaterThanOrEqual(prev - 1e-9); prev = d; }
    }
  });
  it('inshore of the reef the bed stays the coast’s shallows (south of the peak near the beach)', () => {
    for (const [x, z] of [[150, 200], [170, 120], [120, 250]]) expect(depth(x, z)).toBeCloseTo(depthBg(x), 0);
  });
  it('along the peak’s south-west line the bed deepens steadily from the ledge to 300 m out (no step back up > 2 cm)', () => {
    let prev = depth(0, 0);
    for (let s = 1; s <= 300; s++) {
      const d = depth(-s * Math.SQRT1_2, s * Math.SQRT1_2);
      expect(d, `${s} m out`).toBeGreaterThanOrEqual(prev - 0.02);
      prev = Math.max(prev, d);
    }
  });
  it('the face and the slope are where the params put them along the peak’s line (±1.5 m: the line leaves the ledge at an angle)', () => {
    const at = (v: number) => depth(-v * Math.SQRT1_2, v * Math.SQRT1_2);
    expect(at(p.faceWidthM)).toBeGreaterThan(p.faceBaseDepthM - 1.5);
    expect(at(p.slopeEndM)).toBeGreaterThan(p.slopeDepthM - 2);
    expect(at(p.slopeEndM)).toBeLessThan(p.slopeDepthM + 1.5);
  });
  it('meets the coast profile at the west, north and south map edges (the far field)', () => {
    for (const z of [-300, 0, 200]) expect(depth(-399, z)).toBeCloseTo(depthBg(-399), 1);
    expect(seawardDepth(1000, -1000, p)).toBe(depthBg(-1000));
    expect(SHORE_X).toBe(190);
  });
});
```

`depth`, `depthBg` and `DEFAULT_REEF_PARAMS` are already in scope at the top of the file. The existing test "matches the coast profile at and beyond the map edges" stays as it is.

In `src/dev/devSettings.test.ts`, replace the body of "a look saved by model 5 …" (lines 527–536) with this, and add a new test after it:

```ts
  it('a look saved by model 5 (before the barrel from the maths) loads the new breaking defaults and the default reef', () => {
    const raw = JSON.parse(JSON.stringify(tweaked()));
    raw.reef = { ...DEFAULT_REEF_PARAMS, faceWidthM: 15 };
    const got = loadDevSettings(store(raw, 5), defaults())!;
    expect(got.breaking).toEqual(DEFAULT_BREAK_PARAMS);
    expect(got.reef).toEqual(DEFAULT_REEF_PARAMS);
    const kept = loadDevSettings(store({ ...raw, reef: { ...DEFAULT_REEF_PARAMS, faceWidthM: 50 } }, BREAKING_MODEL), defaults())!;
    expect(kept.reef.faceWidthM).toBe(50);
  });
  it('a reef saved by model 6 (the softened ramp: deepDepthM, ledgeWidthM) loads the reef build’s defaults (plan Review Focus 4)', () => {
    const raw = JSON.parse(JSON.stringify(tweaked()));
    raw.reef = { deepDepthM: 13, ledgeDepthM: 6, ledgeWidthM: 145, shelfDepthM: 4, headReliefM: 2.5, minDepthM: 1.5, pocketDepthM: 5.5 };
    const got = loadDevSettings(store(raw, 6), defaults())!;
    expect(got.reef).toEqual(DEFAULT_REEF_PARAMS);
    expect('ledgeWidthM' in got.reef).toBe(false);
  });
```

- [ ] **Step 2: Run them to verify they fail.**
Run: `npx vitest run src/seabed/bathymetry.test.ts src/dev/devSettings.test.ts`
Expected: FAIL. `reefProfileDepth` and `seawardDepth` are not exported. The model-6 test fails: `got.reef` keeps `ledgeWidthM`.

- [ ] **Step 3: The params.** In `src/seabed/wombReef.ts`, replace the `ReefParams` interface's `deepDepthM` and `ledgeWidthM` members and `DEFAULT_REEF_PARAMS` with:

```ts
export interface ReefParams {
  /** Still-water depth along both ledges and at the take-off corner (Andrew: about 6 m / 20 ft). */
  ledgeDepthM: number;
  /** The reef face's base: the depth it rises from to the ledge (spec 2026-10-02 §3: about 11–12 m; tuned in plan Task 3). */
  faceBaseDepthM: number;
  /** The face's width seaward of the ledge line (m; about 30–40 m). */
  faceWidthM: number;
  /** Beyond the face the bed deepens steadily to this depth (m; about 20 m)… */
  slopeDepthM: number;
  /** …this far seaward of the ledge line (m; about 200 m), and eases into the open sea past it (bathymetry.seawardDepth). */
  slopeEndM: number;
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
  ledgeDepthM: 6,
  faceBaseDepthM: 11.5,
  faceWidthM: 35,
  slopeDepthM: 20,
  slopeEndM: 200,
  shelfDepthM: 4,
  headReliefM: 2.5,
  minDepthM: 1.5,
  pocketDepthM: 5.5,
};
```

- [ ] **Step 4: The profile and the seaward depth.** In `src/seabed/bathymetry.ts`:
1. Change the coastProfile import to `import { REEF_SURROUND_DEPTH_M, SHORE_X, depthBg } from './coastProfile';`. It is unchanged in content; `SHORE_X` is now used.
2. Delete `rampShape` and its doc comment.
3. Add, before `buildBathymetry`:

```ts
/**
 * The reef's depth v m seaward of the ledge line (spec 2026-10-02 §3): the face rising from faceBaseDepthM to the ledge over
 * faceWidthM (smoothstep: flat at both ends, so neither the ledge nor the face's foot is a crease), then a steady
 * deepening to slopeDepthM at slopeEndM, held beyond. Widths are floored at a millimetre (the dev panel can zero them).
 */
export function reefProfileDepth(v: number, p: ReefParams): number {
  const x = Math.max(0, v), fw = Math.max(1e-3, p.faceWidthM), se = Math.max(fw + 1e-3, p.slopeEndM);
  const face = (p.faceBaseDepthM - p.ledgeDepthM) * smoothstep(0, fw, x);
  const slope = Math.max(0, p.slopeDepthM - p.faceBaseDepthM) * Math.min(1, Math.max(0, (x - fw) / (se - fw)));
  return p.ledgeDepthM + face + slope;
}

/** Past the reef's slope the bed eases into the coast's own depth, where that is deeper, over this far (m). */
export const REEF_FAR_EASE_M = 50;
/** The coast may deepen toward the reef's slope only offshore: not at all inshore of SHORE_X − 140, fully by SHORE_X − 260. */
const REEF_OFFSHORE_BAND: readonly [number, number] = [SHORE_X - 140, SHORE_X - 260];

/**
 * The seabed's depth v m seaward of the ledges at x (spec §3): the reef's profile, never deeper than the coast deepened
 * toward the slope's depth offshore (so south of the peak, near the beach, the bed stays the coast's shallows), then past
 * the slope easing into the coast's own depth where that is deeper (the open sea's 30 m at the map's west edge). Only
 * ever deepens seaward along a line from the peak.
 */
export function seawardDepth(v: number, x: number, p: ReefParams): number {
  const bg = depthBg(x);
  const cap = bg + Math.max(0, p.slopeDepthM - REEF_SURROUND_DEPTH_M) * smoothstep(REEF_OFFSHORE_BAND[0], REEF_OFFSHORE_BAND[1], x);
  const reef = Math.min(reefProfileDepth(v, p), cap);
  return reef + Math.max(0, bg - reef) * smoothstep(p.slopeEndM, p.slopeEndM + REEF_FAR_EASE_M, v);
}
```

4. In `buildBathymetry`, replace the `edgeFade` line with:

```ts
    // The reef fades back to the plain coast before the map's north and south edges, so the map joins the far field seamlessly.
    const edgeFade = smoothstep(-450, -380, z) * (1 - smoothstep(230, 299, z));
```

5. Replace the two lines that compute `nearReef` and `background` with:

```ts
      const background = depthBg(x);
```

6. In the `sd < 0` branch, replace everything from `const v = -sd / p.ledgeWidthM` through `d = background + (dLedge - background) * edgeFade;` (the comment above it too) with:

```ts
        // Outside the shelf: the reef face, then the steady slope out to the open sea (seawardDepth, spec 2026-10-02 §3).
        d = background + (seawardDepth(-sd, x, p) - background) * edgeFade;
```

- [ ] **Step 5: The dev panel and saved looks.**
In `src/dev/DevPanel.ts`, replace the `deepDepthM` and `ledgeWidthM` bindings (lines 471–472) with:

```ts
    reef.addBinding(m.reef, 'faceBaseDepthM', { label: 'reef face base (m)', min: 7, max: 18, step: 0.5 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'faceWidthM', { label: 'reef face width (m)', min: 5, max: 120, step: 1 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'slopeDepthM', { label: 'outer slope depth (m)', min: 12, max: 30, step: 0.5 }).on('change', h.onReef);
    reef.addBinding(m.reef, 'slopeEndM', { label: 'outer slope reach (m)', min: 60, max: 300, step: 5 }).on('change', h.onReef);
```

In `src/dev/devSettings.ts`:
- Set `export const BREAKING_MODEL = 7;`.
- Replace lines 143–144 with:

```ts
  // Model 6 softened the ledge the barrel's ψ₀ is read from; model 7 replaced that ramp with the reef build's face and slope
  // (plan 2026-10-02): an older look's reef carries keys and depths the reef no longer has.
  if (typeof raw.breakingModel !== 'number' || raw.breakingModel < 7) look.reef = deepClone(defaults.reef);
```

`grep -n "BREAKING_MODEL\|breakingModel" src/dev/devSettings.ts` finds the comment beside `BREAKING_MODEL = 6`. Add one line to it: "7: the reef build's face and slope (plan 2026-10-02)".

- [ ] **Step 6: Run the tests.**
Run: `npx vitest run src/seabed/bathymetry.test.ts src/dev/devSettings.test.ts src/dev/DevPanel.test.ts && npm run typecheck`
Expected:
- PASS, all of them.
- Typecheck clean. Any `deepDepthM`/`ledgeWidthM`/`rampShape` reference it reports outside `reefPsi.test.ts` gets fixed now. `reefPsi.test.ts`'s are Task 4's. If typecheck covers test files and fails only there, ledger it and carry on.

If the "steadily deepening" test fails, print the depths around the first dip. A dip inside 20 m of the ledge is the shelf's warp, which reaches the outside through `xw, zw`. Start the loop at s = 20 and ledger it as a ruling. A dip further out is a `seawardDepth` bug: debug it.

- [ ] **Step 7: Commit.**

```bash
git add src/seabed/wombReef.ts src/seabed/bathymetry.ts src/seabed/bathymetry.test.ts src/dev/DevPanel.ts src/dev/devSettings.ts src/dev/devSettings.test.ts
git commit -m "feat(reef): the face and the steady slope replace the softened ramp; the dev panel and saved looks follow (model 7)"
```

`task-done` command: `npx vitest run src/seabed/bathymetry.test.ts src/dev/devSettings.test.ts src/breaker/reefReport.test.ts`

---

### Task 3: Tune the face and slope against the criteria

**Files:**
- Create: `src/breaker/reefTune.test.ts`
- Modify: `src/seabed/wombReef.ts` (`DEFAULT_REEF_PARAMS`'s four face and slope values only)

**Interfaces:**
- **Consumes:**
  - `evaluateReef`, `formatCard`, `TIDES`, `Tide`, `firstBreakSeaward`, `setWaveHeight` (Task 1)
  - `ReefParams`, `DEFAULT_REEF_PARAMS`, `buildBathymetry(p)` (Task 2)
- **Produces:** the tuned `DEFAULT_REEF_PARAMS`, and the scorecard log `docs/superpowers/plans/2026-10-02-womb-reef-tuning.txt`.

- [ ] **Step 1: Write the search** in `src/breaker/reefTune.test.ts`:

```ts
import { describe, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_REEF_PARAMS, type ReefParams } from '../seabed/wombReef';
import { computeReefField } from './reefField';
import { BREAK_NEAR_PEAK_M, type ReefCard, TIDES, type Tide, evaluateReef, firstBreakSeaward, formatCard, setWaveHeight } from './reefReport';

// The reef build's tuning search (plan 2026-10-02 Task 3): every candidate face and slope scored on the spec's criteria.
describe.skipIf(!import.meta.env.VITE_REEF_TUNE)('tune the reef face and slope', () => {
  it('scores the candidates', { timeout: 3_600_000 }, () => {
    const rows: { p: ReefParams; card: ReefCard; off: number[]; score: number }[] = [];
    for (const faceBaseDepthM of [11, 12, 13, 14]) for (const faceWidthM of [25, 30, 40, 55]) for (const slopeDepthM of [20, 22]) {
      const p: ReefParams = { ...DEFAULT_REEF_PARAMS, faceBaseDepthM, faceWidthM, slopeDepthM, slopeEndM: 200 };
      const bed = downsample(buildBathymetry(p), 2);
      const fields = Object.fromEntries((Object.keys(TIDES) as Tide[]).map((t) => [t, computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: TIDES[t] })])) as Record<Tide, ReturnType<typeof computeReefField>>;
      const card = evaluateReef(fields);
      const off = [[215, 15], [235, 15], [225, 12], [225, 18]].map(([fromDeg, periodS]) => firstBreakSeaward(computeReefField({ bed, periodS, fromDeg, tideM: 0 }), setWaveHeight(12)));
      const score = Object.values(card.passes).filter(Boolean).length + (off.every((d) => d <= BREAK_NEAR_PEAK_M) ? 1 : 0);
      rows.push({ p, card, off, score });
      console.log(`face ${faceBaseDepthM} m over ${faceWidthM} m, slope ${slopeDepthM} m: score ${score}/7; off-default 12 ft first breaks ${off.map((d) => d.toFixed(1)).join(', ')} m\n${formatCard(card)}\n`);
    }
    rows.sort((a, b) => b.score - a.score);
    console.log(`BEST: ${rows.slice(0, 5).map((r) => `${r.p.faceBaseDepthM}/${r.p.faceWidthM}/${r.p.slopeDepthM} (${r.score}/7)`).join('; ')}`);
  });
});
```

- [ ] **Step 2: Run the search.**
Run (bash, about 5–10 min; run it in the background and wait for the notification):

```bash
VITE_REEF_TUNE=1 npx vitest run src/breaker/reefTune.test.ts > docs/superpowers/plans/2026-10-02-womb-reef-tuning.txt 2>&1
```

Expected: 32 candidate blocks and a `BEST:` line. Read the best five blocks in full.

- [ ] **Step 3: Choose, by this rule:**
1. Take the candidates with the highest score.
2. Among them, prefer the spec's ranges: face base 11–12 m, width 30–40 m, slope about 20 m.
3. Then prefer the smallest 12 ft first-break distance at low tide.

Ledger the choice as a ruling, and name any spec range the choice leaves.

- **If the best scores 7/7:** set those four values in `DEFAULT_REEF_PARAMS` and go on.
- **If none scores 7/7, refine once.**
  1. Halve the grid's steps around the best (for example face base ±0.5 m, width ±5 m) and run Step 2 again.
  2. If that still finds no 7/7, **STOP: Gate 1 comes early.** Run Task 5 with the best candidate. Send Andrew the drawing and the failing criteria, named as he would say them (for example "12 ft at low tide still breaks 45 m out" or "12 ft closes out on the ideal day too"), and ask which gives. Don't loosen a criterion on your own.

- [ ] **Step 4: Run the criteria to verify they pass.**
Run: `npx vitest run src/breaker/reefCriteria.test.ts src/seabed/bathymetry.test.ts`
Expected: PASS, all. The logged card shows every `passes` entry `yes`.

- [ ] **Step 5: Commit.**

```bash
git add src/breaker/reefTune.test.ts src/seabed/wombReef.ts docs/superpowers/plans/2026-10-02-womb-reef-tuning.txt
git commit -m "feat(reef): the face and slope tuned so 4–12 ft break at the take-off and the left peels from the peak (criteria green)"
```

`task-done` command: `npx vitest run src/breaker/reefCriteria.test.ts src/breaker/reefReport.test.ts src/seabed/bathymetry.test.ts`

---

### Task 4: The suite on the new reef

**Files:**
- Modify: `src/breaker/reefPsi.test.ts`
- Modify: every other test file the suite shows red. Change only assertions and comments that pin the softened ramp.

**Interfaces:**
- **Consumes:** `firstBreakSeaward`, `setWaveHeight`, `TIDES` (Task 1); `DEFAULT_REEF_PARAMS` (Task 3)
- **Produces:** a green suite.

- [ ] **Step 1: `reefPsi.test.ts` first** (known to pin the ramp):
- Delete the `describe.skipIf(!import.meta.env.VITE_RAMP_CALIBRATE)` block. `reefTune.test.ts` replaces it.
- Replace the test "on the softened ledge: 12 ft mid tide reads state 5, low ≥ mid ≥ high at the same size, too big breaks outside" with:

```ts
  it('on the reef face: low ≥ mid ≥ high at 6 and 8 ft, and a 15 ft set at low tide is too big: it breaks out on the slope', () => {
    const rows: string[] = [];
    for (const ft of [4, 6, 8, 10, 12, 15]) {
      const h = biggest(ft), v = [low, mid, high].map((f) => psiAt(f, 0, 0, h));
      rows.push(`${ft} ft: low ${v[0].toFixed(3)} mid ${v[1].toFixed(3)} high ${v[2].toFixed(3)}`);
    }
    console.log(rows.join('\n'));
    for (const ft of [6, 8]) { const h = biggest(ft); expect(psiAt(low, 0, 0, h)).toBeGreaterThanOrEqual(psiAt(mid, 0, 0, h) - 0.005); expect(psiAt(mid, 0, 0, h)).toBeGreaterThanOrEqual(psiAt(high, 0, 0, h) - 0.005); }
    // The states by conditions are reefCriteria.test's (spec 2026-10-02 §2.3); 15 ft is past the spec's sizes and breaks outside.
    expect(firstBreakSeaward(low, biggest(15))).toBeGreaterThan(BREAK_NEAR_PEAK_M);
  });
```

- Add `import { BREAK_NEAR_PEAK_M, firstBreakSeaward } from './reefReport';`. Drop `DEFAULT_REEF_PARAMS` and `onsetTime` from the imports if they're now unused.

Run: `npx vitest run src/breaker/reefPsi.test.ts`
Expected: PASS. If "low ≥ mid ≥ high at 6 and 8 ft" fails, that's a change in the tide order Andrew agreed on 2026-10-01 (low throws heaviest at low tide's own sizes, 6–8 ft). Don't edit it away. Note it for Gate 1, keep it as `it.fails` with a comment naming the measured values, and ledger it.

If 15 ft at low tide breaks inside 30 m, the reef is not "too big at 15 ft" any more. Log the value and replace that assertion with `expect(firstBreakSeaward(low, biggest(15))).toBeGreaterThan(firstBreakSeaward(low, biggest(12)))`: a bigger set still breaks further out. Ledger it.

- [ ] **Step 2: Run the whole suite.**
Run: `npx vitest run > "$SCRATCH/reef/suite-task4.txt" 2>&1; grep -E "FAIL|✗|×|Tests " "$SCRATCH/reef/suite-task4.txt" | head -60`
Expected: a list of failing tests. Likely candidates:
- `breakingField.test.ts`:
  - the `it.fails` "a 0.95·Hs wave does not break at the ledge" may now pass, which makes `it.fails` fail;
  - "a lone wave in deep water … 140 m seaward" (its depth and ρ comment);
  - "the tide moves the break" (≥ 0.2 s);
  - "0.6–1.5 s from onset to tube closure".
- `crestTrace.test.ts`: peel and closeout.
- `reefField.test.ts`: the 270° caustic counts.
- `referenceMoments.test.ts`, `lipProfile*.test.ts`, `overturnProfile.test.ts`, `peakFace.test.ts`, `tube.test.ts`: anything reading ψ at the 12 ft mid fixture (`peakStation.fixture.ts`).

- [ ] **Step 3: Classify each failure, one at a time.** For each, read the test and its comment, then apply the first rule that fits:
1. **The assertion pins the softened ramp's geometry or a number measured on it.** Its comment cites the ramp, `ledgeWidthM`, 145 m, "softened", or a measured ψ such as 0.065. Update the number or the point to the new reef, from a measurement on the new reef (print it). Rewrite the comment to cite this plan, the old value and the new one. Ledger: `Task 4: Ruling: <test> pinned the ramp (<old>); now <new> on the reef face`.
2. **It's an `it.fails` that now passes**, such as "a 0.95·Hs wave does not break at the ledge". The reef build fixed the known regression, so flip it to `it(` and delete the "Known regression" comment lines.
3. **The assertion encodes behaviour the spec keeps.** That covers:
   - the A-frame (the left peels north, the right closes out along the south ledge);
   - Phase 1 reductions (a tiny wave or breaking off gives exactly the Phase 1 surface);
   - finiteness and caps, GPU/CPU parity;
   - the lip profile's geometric invariants (no self-crossing, edges on the sheet);
   - "a section does not un-break in the barrel zone";
   - the right's closeout.

   That's a **regression**. Use superpowers:systematic-debugging on the reef, not the test. If the cause is the reef's shape (for example the face makes a section un-break), STOP and take it to Gate 1 with a drawing of the section.

For `peakStation.fixture.ts`: it builds its 12 ft mid field from the default reef. If lip-profile tests fail on its new ψ, apply rule 1 only when the test names the old ψ (0.065, "state 5"). If a geometric invariant breaks at the new ψ, that's rule 3.

**The ψ-keyed constants (spec §3, "re-checked against §2.3").** `SHEET_POINTS` anchors the sheet at ψ 0.035, 0.065 and 0.09. `PSI_NORMAL` is 0.065. Both are keyed to ψ, not to the reef, so they keep their meaning: an oval, a cylinder, a thrown lip.
1. Confirm each anchor still sits inside the state it names: `psiState(0.035)` is `oval`, `psiState(0.065)` is `cylinder`, `psiState(0.09)` is `thrown`.
2. Confirm the Task 3 card's ψ values fall within [0.02, 0.15], the range the anchors span.

No change is expected. If the card shows ψ past 0.1 for 12 ft at its best tide (a slab, not thrown), that's a Task 3 criterion failure, not a constant to retune here. Ledger the check's result.

- [ ] **Step 4: Run the suite and the typecheck to verify they pass.**
Run: `npx vitest run > "$SCRATCH/reef/suite-task4.txt" 2>&1; tail -8 "$SCRATCH/reef/suite-task4.txt"; npm run typecheck`
Expected: `Tests  N passed` with no failures (skips as before, plus `reefTune` and `reefViewer` skipped). Typecheck clean.

- [ ] **Step 5: Commit.** List the files the classification touched.

```bash
git add src/breaker/reefPsi.test.ts <each file changed in Step 3>
git commit -m "test(reef): the suite on the reef face: ramp-pinned numbers re-measured, the lull-wave regression fixed (it.fails flipped)"
```

`task-done` command: `npx vitest run`

---

### Task 5: Gate 1: drawings and stills for Andrew (STOP)

**Files:**
- Modify: `src/seabed/reefViewer.test.ts`: add the drawing.

**Interfaces:**
- **Consumes:** `reefSnapshot`, `NORTH_RAY_START` (Task 1, this file); the baseline JSON (Task 1); `firstBreak`, `setWaveHeight`, `TIDES`, `CRITERIA_SIZES_FT`, `peakPsi` (Task 1); `psiStateLabel` (`overturn.ts`)
- **Produces:** `$SCRATCH/reef/gate1.html` and its PNG, the "after" stills, and a message to Andrew.

- [ ] **Step 1: Add the drawing.** Append to `src/seabed/reefViewer.test.ts`:

```ts
import { psiStateLabel } from '../breaker/overturn';
import { CRITERIA_SIZES_FT, firstBreak, peakPsi, setWaveHeight } from '../breaker/reefReport';

const VIEW_OUT: string = import.meta.env.VITE_REEF_VIEW_OUT ?? '';
const VIEW_BASELINE: string = import.meta.env.VITE_REEF_BASELINE ?? '';
const TIDE_COLOUR: Record<Tide, string> = { low: '#c0392b', mid: '#1f6fb2', high: '#2e8b57' };

/** One side view, true scale ×3 across, ×12 down: depth along a ray, old dashed grey, new filled, still water at 0. */
function sideView(title: string, before: [number, number][], after: [number, number][], marks: { s: number; label: string; colour: string }[]): string {
  const S0 = -60, S1 = 300, D1 = 26, PX = 3, PY = 12, W = (S1 - S0) * PX, H = D1 * PY + 40;
  const X = (s: number) => ((s - S0) * PX).toFixed(1), Y = (d: number) => (20 + d * PY).toFixed(1);
  const line = (q: [number, number][]) => 'M' + q.filter(([s]) => s >= S0 && s <= S1).map(([s, d]) => `${X(s)},${Y(d)}`).join('L');
  const ticks = [0, 30, 100, 200, 300].map((s) => `<line x1="${X(s)}" y1="${Y(0)}" x2="${X(s)}" y2="${Y(D1)}" stroke="#ccd" stroke-width="0.7"/><text x="${X(s)}" y="${H - 4}" font-size="11" text-anchor="middle">${s} m</text>`).join('');
  const depthTicks = [6, 12, 20].map((d) => `<text x="2" y="${Y(d)}" font-size="11">${d} m</text>`).join('');
  const m = marks.map((k, i) => `<circle cx="${X(k.s)}" cy="${Y(0)}" r="4" fill="${k.colour}"/><text x="${X(k.s)}" y="${(+Y(0) - 6 - (i % 5) * 11).toFixed(1)}" font-size="10" fill="${k.colour}" text-anchor="middle">${k.label}</text>`).join('');
  return `<figure><figcaption><b>${title}</b> (left: inshore; right: out to sea; the peak's take-off at 0)</figcaption>
  <svg viewBox="0 0 ${W} ${H}" width="${W}" style="max-width:100%;height:auto;background:#eef3f8">${ticks}${depthTicks}
  <path d="${line(after)}L${X(S1)},${Y(D1)}L${X(S0)},${Y(D1)}Z" fill="#5b5446"/>
  <path d="${line(before)}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="6 4"/>
  <line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#2a6fdb" stroke-width="1.5"/>${m}</svg></figure>`;
}

describe.skipIf(!VIEW_OUT || !VIEW_BASELINE)('the reef build, drawn for Andrew (plan 2026-10-02 Task 5)', () => {
  it('draws the two rays old against new, with where each size first breaks and its tube', { timeout: 600_000 }, async () => {
    const fs = await nodeFs();
    const before = JSON.parse(fs.readFileSync(VIEW_BASELINE, 'utf8')) as ReturnType<typeof reefSnapshot>;
    const now = reefSnapshot();
    const bed = downsample(buildBathymetry(), 2);
    const marks: { s: number; label: string; colour: string }[] = [];
    for (const t of Object.keys(TIDES) as Tide[]) {
      const f = computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: TIDES[t] });
      for (const ft of [4, 6, 8, 12]) {
        const H = setWaveHeight(ft), at = firstBreak(f, H);
        if (at) marks.push({ s: at.d, label: `${ft}′ ${t}: ${psiStateLabel(peakPsi(f, H, t === now.card.ideal12.tide && ft === 12))}`, colour: TIDE_COLOUR[t] });
      }
    }
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Womb Reef Profile</title>
<body style="font:14px system-ui;margin:16px;color:#123">
<h2>The Womb's reef, build A: before (dashed) and after</h2>
<p>Dots: where each size's biggest set wave first breaks on the peak's line (red low tide, blue mid, green high), with its tube. 12 ft is read after a lull on its best tide (${now.card.ideal12.tide}).</p>
${sideView('Along the peak’s line, out to the south-west', before.peakRay, now.peakRay, marks)}
${sideView('Along the line 40 m up the north ledge', before.northRay, now.northRay, [])}
<h3>The numbers</h3><pre style="white-space:pre-wrap">BEFORE\n${before.text}\n\nAFTER\n${now.text}</pre></body></html>`;
    fs.writeFileSync(VIEW_OUT, html);
  });
});
```

`fields`, `computeReefField`, `buildBathymetry` and `downsample` are already imported at the top of the file (Task 1, Step 8). Merge these new imports into those import lines rather than adding duplicates.

- [ ] **Step 2: Draw it.**
Run (bash):

```bash
VITE_REEF_BASELINE=docs/superpowers/plans/2026-10-02-womb-reef-baseline.json VITE_REEF_VIEW_OUT="$SCRATCH/reef/gate1.html" npx vitest run src/seabed/reefViewer.test.ts
npx electron "$SCRATCH/html2png.mjs" "$SCRATCH/reef/gate1.html" "$SCRATCH/reef/gate1.png"
```

The `html2png.mjs` argument order is the one in its own header comment; read it first.
Expected: PASS, and both files written. Open the PNG and check it by eye:
- the new profile is a face then a steady slope;
- the old ramp is dashed;
- the dots sit within 30 m of 0.

- [ ] **Step 3: The "after" stills.** Make the same three moments and times as Task 1, Step 10, with `--out="$SCRATCH/reef/after-<name>"`. Restart the `ld-reef` preview first (`preview_stop`, then `preview_start`) so Vite serves the new reef. Look at all nine.

- [ ] **Step 4: Push the branch and send the gate.**

```bash
git add src/seabed/reefViewer.test.ts
git commit -m "test(reef): the gate drawing: the two rays old against new, where each size breaks and its tube"
git push
```

Then send with SendUserFile, status `proactive`:
- `gate1.png`;
- the before/after pairs for `peak12` and `takeoff` (six PNGs).

Write a short message in plain words:
- where 12 ft now breaks at each tide;
- the peel speed from the peak;
- the ideal 12 ft tube and the ordinary closeout;
- any spec range the tuning left (from the Task 3 ruling);
- any `it.fails` kept in Task 4;
- that the bed's colour and rock come next.

Ask him to look and say go or what to change.

**STOP. Wait for Andrew.** If he asks for changes, apply them to the profile, re-run Task 3's criteria, and redo Steps 2–4. Ledger his words as the gate's ruling.

`task-done` command: `npx vitest run src/seabed/reefViewer.test.ts src/breaker/reefCriteria.test.ts`

---

### Task 6: The bed's material: weedy rock everywhere, sand only in pockets

**Files:**
- Modify: `src/seabed/wombReef.ts`: replace `SAND_POCKETS`; add the rock reach constants and `rockReachM`.
- Modify: `src/seabed/bathymetry.ts`: the sand and weed channels in both branches, and the relief-pocket threshold.
- Test: `src/seabed/bathymetry.test.ts`

**Interfaces:**
- **Consumes:** `ledgeSignedDistance` (Task 1), `bedMaterialAt`, `OPEN_COAST_MATERIAL`, `rockReachM` (this task)
- **Produces:**
  - `SAND_POCKETS` (8 pockets)
  - `ROCK_REACH_NORTH_M = 170`, `ROCK_REACH_SOUTH_M = 40`, `ROCK_EDGE_M = 20`, `DEEP_REEF_WEED = 0.75`
  - `rockReachM(z: number): number`

- [ ] **Step 1: Write the failing material tests.** In `src/seabed/bathymetry.test.ts`:
- Delete "has sand pockets and reef on the shelf, sand in the deep". The spec says sand only in pockets and rock down the slope (§4); "sand in the deep" is the opposite.
- Add the imports `ledgeSignedDistance, bedMaterialAt` from `./bathymetry`, `rockReachM` from `./wombReef`, and `OPEN_COAST_MATERIAL` from `./shoreReef`.
- Add:

```ts
describe('the bed’s material (spec 2026-10-02 §4)', () => {
  const g = REEF_GRID;
  const cell = (x: number, z: number) => Math.round((z - g.z0) / g.cellM) * g.nx + Math.round((x - g.x0) / g.cellM);
  /** On the reef: the shelf, or seaward of the ledges within the rock's reach (and inside the map's edge fades). */
  const onReef = (x: number, z: number) => { const sd = ledgeSignedDistance(x, z); return z > -380 && z < 230 && x < 100 && (sd >= 0 || -sd <= rockReachM(z) - 25); };
  it('weedy rock is the default on the reef: under 10% of it is sandy, and it is mostly weed', () => {
    let n = 0, sandy = 0, weed = 0;
    for (let x = -300; x <= 98; x += 2) for (let z = -378; z <= 228; z += 2) {
      if (!onReef(x, z)) continue;
      const i = cell(x, z); n++; if (bathy.sand[i] > 0.5) sandy++; weed += bathy.weed[i];
    }
    expect(sandy / n).toBeLessThan(0.1);
    expect(weed / n).toBeGreaterThan(0.5);
  });
  it('sand lies only in scattered pockets: no sandy patch over 600 m², and at least 6 of them', () => {
    const X0 = -300, X1 = 98, Z0 = -378, Z1 = 228, S = 2, nx = (X1 - X0) / S + 1, nz = (Z1 - Z0) / S + 1;
    const sandy = new Uint8Array(nx * nz);
    for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) sandy[r * nx + c] = bathy.sand[cell(X0 + c * S, Z0 + r * S)] > 0.5 ? 1 : 0;
    const seen = new Uint8Array(nx * nz), areas: number[] = [];
    for (let i = 0; i < sandy.length; i++) {
      if (!sandy[i] || seen[i]) continue;
      let count = 0; const stack = [i]; seen[i] = 1;
      while (stack.length) {
        const j = stack.pop()!, c = j % nx, r = (j - c) / nx; count++;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cc = c + dc, rr = r + dr, k = rr * nx + cc;
          if (cc >= 0 && cc < nx && rr >= 0 && rr < nz && sandy[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
      areas.push(count * S * S);
    }
    expect(Math.max(0, ...areas)).toBeLessThanOrEqual(600);
    expect(areas.filter((a) => a >= 40).length).toBeGreaterThanOrEqual(6);
  });
  it('the rock runs down the deep slope north of the peak; south of the peak, past the face, the open coast', () => {
    for (const [x, z] of [[-59, -113], [-109, -113], [-80, -200]]) {
      const i = cell(x, z);
      expect(bathy.sand[i], `(${x}, ${z})`).toBeLessThan(0.3);
      expect(bathy.weed[i], `(${x}, ${z})`).toBeGreaterThan(0.4);
    }
    const [s, w] = bedMaterialAt(bathy, -60, 180, undefined, false);
    expect(s).toBeCloseTo(OPEN_COAST_MATERIAL[0], 1);
    expect(w).toBeCloseTo(OPEN_COAST_MATERIAL[1], 1);
  });
  it('the map’s bed meets the open coast’s at its edges (no seam)', () => {
    const edge: [number, number][] = [[-399, -300], [-399, 0], [-399, 200], [-200, -449], [0, -449], [-200, 299], [0, 299]];
    for (const [x, z] of edge) {
      const [s, w] = bedMaterialAt(bathy, x, z, undefined, false);
      expect(s, `(${x}, ${z})`).toBeCloseTo(OPEN_COAST_MATERIAL[0], 1);
      expect(w, `(${x}, ${z})`).toBeCloseTo(OPEN_COAST_MATERIAL[1], 1);
    }
  });
  it('the shore platform meets the reef: no sand strip anywhere between the beach and the reef (regression guard)', () => {
    for (let z = -440; z <= 290; z += 10) for (let x = 100; x <= 185; x += 5) expect(bedMaterialAt(bathy, x, z)[0], `(${x}, ${z})`).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
Run: `npx vitest run src/seabed/bathymetry.test.ts`
Expected: FAIL. `rockReachM` is not exported. Once it is stubbed, these fail on the current bed:
- "under 10% sandy" (outside the shelf the bed is sand 1);
- "only in pockets" (one huge patch);
- "down the deep slope";
- "no seam" (sand 1 at the edges).

The platform guard passes already. It's a regression guard, so say so in the ledger.

- [ ] **Step 3: The place data.** In `src/seabed/wombReef.ts`, replace `SAND_POCKETS` with the pockets below and add the rock reach.

The pockets are traced from `reference/place/womb-correct-topdown-peak-189m-offshore.webp` in the main checkout. Its scale is 0.41 m per pixel (the 188.66 m measure spans 460 px), and the peak is at pixel (902, 572). So x = (px − 902)·0.41 and z = (py − 572)·0.41. The paler teal patches inside the dark reef became pockets.

```ts
/** Sand pockets traced from Andrew's top-down satellite view (reference/place/womb-correct-topdown-peak-189m-offshore.webp:
 * 0.41 m/px, the peak at pixel (902, 572)): small scattered patches in the dark reef, [cx, cz, rx, rz] (spec 2026-10-02 §4). */
export const SAND_POCKETS: readonly (readonly [number, number, number, number])[] = [
  [40, -21, 8, 5], [71, 3, 7, 5], [-13, -42, 9, 6], [40, -111, 10, 6], [102, -79, 8, 6], [-50, -132, 10, 7], [-83, -173, 9, 6], [11, -177, 8, 6],
];

/**
 * How far seaward of the ledge line the reef's rock runs (m), the rest being the open coast's bed (spec §4): north of the
 * peak, two to three times the ledge line's own distance offshore (Andrew's satellite views: the dark reef reaches about
 * 340 m off the beach there); south of the peak only the face (the photos' uniform deep blue south and west of it).
 */
export const ROCK_REACH_NORTH_M = 170;
export const ROCK_REACH_SOUTH_M = 40;
/** The rock's seaward edge blends over ±ROCK_EDGE_M. */
export const ROCK_EDGE_M = 20;
/** Weed cover on the reef's deep slope, before its patch noise. */
export const DEEP_REEF_WEED = 0.75;
export function rockReachM(z: number): number {
  return ROCK_REACH_NORTH_M + (ROCK_REACH_SOUTH_M - ROCK_REACH_NORTH_M) * smoothstep(-30, 40, z);
}
```

`wombReef.ts` needs `import { smoothstep } from '../math/smoothstep';` at its top.

- [ ] **Step 4: The channels.** In `src/seabed/bathymetry.ts`:
1. Import `DEEP_REEF_WEED`, `ROCK_EDGE_M` and `rockReachM` from `./wombReef`. `OPEN_COAST_MATERIAL` is already imported from `./shoreReef`.
2. In the `sd < 0` branch, replace the `faceSand`, `s` and `w` lines (and their comments, from `const faceSand` to `w = (1 - faceSand) * LEDGE_FACE_WEED * edgeFade;`) with:

```ts
        // Seaward the reef's rock runs on down the slope (spec 2026-10-02 §4): weedy rock with scattered sand pockets out to
        // rockReachM(z) seaward of the ledge line, then the open coast's bed; the map's edges fade to the open coast too.
        const rock = 1 - smoothstep(rockReachM(zw) - ROCK_EDGE_M, rockReachM(zw) + ROCK_EDGE_M, -sd);
        const pocketOut = lattice(pockets, xw, zw);
        const patchOut = smoothstep(-0.5, 0.05, fbm2(xw / 5, zw / 5, REEF_SEED + 3));
        const sReef = pocketOut, wReef = (1 - pocketOut) * DEEP_REEF_WEED * patchOut;
        const [sOpen, wOpen] = OPEN_COAST_MATERIAL;
        s = sOpen + (sOpen + (sReef - sOpen) * rock - sOpen) * edgeFade;
        w = wOpen + (wOpen + (wReef - wOpen) * rock - wOpen) * edgeFade;
```

3. In the shelf branch:
   - Change the relief pockets to the deeper lows only: `smoothstep(-0.25, -0.55, relief)` becomes `smoothstep(-0.4, -0.7, relief)`.
   - Change the ledge strip's sand: `const sShelf = pocket * smoothstep(0, 3, sd) + (1 - smoothstep(0, 3, sd)) * 0.3;` becomes `const sShelf = pocket * smoothstep(0, 3, sd);`. The ledge is rock, not sand.
   - Replace the last two material lines (`s = 1 + (sShelf - 1) * reefness;` and `w = wShelf * reefness;`) with:

```ts
        s = OPEN_COAST_MATERIAL[0] + (sShelf - OPEN_COAST_MATERIAL[0]) * reefness;
        w = OPEN_COAST_MATERIAL[1] + (wShelf - OPEN_COAST_MATERIAL[1]) * reefness;
```

4. Delete `LEDGE_FACE_WEED` and `LEDGE_FACE_WEED_FADE_M` and their comments: their only user went in step 2.

- [ ] **Step 5: Run the tests to verify they pass.**
Run: `npx vitest run src/seabed/bathymetry.test.ts src/seabed/shoreReef.test.ts`
Expected: PASS, all.

If "under 10% sandy" or "only in pockets" fails, count the sand by source first. Print each component's centre and area. The relief lows may still carve large patches; if so, move their threshold one step (−0.5, −0.8). Ledger it.

If `shoreReef.test`'s "open coast beyond the platform" fails, read it: that test reads outside the map, which this task leaves alone, so a failure there is a bug in this task.

- [ ] **Step 6: The material overlay, for Gate 2.**
1. Add to `src/seabed/reefViewer.test.ts` a third env-gated test (`VITE_REEF_MATERIAL_OUT`). It writes a top-down PNG-free SVG of the map region x ∈ [−370, 450] by z ∈ [−202, 215]: the satellite image's frame, at 0.41 m/px, 2000×1016.
2. Each 2 m cell is drawn as a rect coloured `mix(mix(rock #8d8a7e, weed #3d4a26, weed), sand #d9cfae, sand)`, at 50% opacity, over `<image href="womb-correct-topdown-peak-189m-offshore.webp">`.
3. Render it to PNG with `html2png.mjs`. Copy the webp beside the html first.

This is the picture of "where our rock and sand are" over his photo.

- [ ] **Step 7: Commit.**

```bash
git add src/seabed/wombReef.ts src/seabed/bathymetry.ts src/seabed/bathymetry.test.ts src/seabed/reefViewer.test.ts
git commit -m "feat(reef): weedy rock everywhere, down the deep slope; sand only in pockets traced from the satellite view; no seams at the map's edges"
```

`task-done` command: `npx vitest run src/seabed/bathymetry.test.ts src/seabed/shoreReef.test.ts src/breaker/reefCriteria.test.ts`. The criteria are rerun because the pockets' depths moved on the shelf.

---

### Task 7: Seeing the reef from the face

**Files:**
- Create: `src/seabed/bedLook.ts`, `src/seabed/bedLook.test.ts`
- Modify: `src/seabed/seabedShading.ts:9-11`, so the albedos come from `bedLook.ts`

**Interfaces:**
- **Consumes:**
  - `WaterOpticsParams`, `DEFAULT_WATER_OPTICS`, `waterAlbedo` (`ocean/waterOptics.ts`)
  - `extinction`, `transmittance`, `waterColumnRadiance` (`waterColumn.ts`)
  - `Rgb` (`sky/atmosphereParams`)
- **Produces:**
  - `REEF_ALBEDO`, `SAND_ALBEDO`, `WEED_ALBEDO: Rgb`
  - `luminance(c: Rgb): number`
  - `bedSeenFromAbove(albedo: Rgb, depthM: number, p: WaterOpticsParams): Rgb`
  - `contrastAtDepth(a: Rgb, b: Rgb, depthM: number, p: WaterOpticsParams): number`

- [ ] **Step 1: Write the failing tests** in `src/seabed/bedLook.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { REEF_ALBEDO, SAND_ALBEDO, WEED_ALBEDO, bedSeenFromAbove, contrastAtDepth, luminance } from './bedLook';

const p = DEFAULT_WATER_OPTICS;
describe('seeing the reef from the face (spec 2026-10-02 §2.5)', () => {
  it('at 12 m, looking straight down, bare rock reads against weed (≥ 30% contrast) and sand against both (≥ 100%)', () => {
    expect(contrastAtDepth(REEF_ALBEDO, WEED_ALBEDO, 12, p)).toBeGreaterThanOrEqual(0.3);
    expect(contrastAtDepth(SAND_ALBEDO, REEF_ALBEDO, 12, p)).toBeGreaterThanOrEqual(1);
  });
  it('at 15 m the rock still reads against the weed (≥ 15%)', () => {
    expect(contrastAtDepth(REEF_ALBEDO, WEED_ALBEDO, 15, p)).toBeGreaterThanOrEqual(0.15);
  });
  it('the bed darkens and blues with depth: dimmer, and blue gaining on green, from 4 m to 12 m to 20 m', () => {
    for (const a of [REEF_ALBEDO, WEED_ALBEDO, SAND_ALBEDO]) {
      const [s4, s12, s20] = [4, 12, 20].map((d) => bedSeenFromAbove(a, d, p));
      expect(luminance(s12)).toBeLessThan(luminance(s4));
      expect(luminance(s20)).toBeLessThan(luminance(s12));
      expect(s20[2] / s20[1]).toBeGreaterThan(s4[2] / s4[1]);
    }
  });
  it('the reef stays dark: weed under 0.1 albedo, bare limestone under 0.3 (the turquoise is the foam’s, not the bed’s)', () => {
    expect(luminance(WEED_ALBEDO)).toBeLessThan(0.1);
    expect(luminance(REEF_ALBEDO)).toBeLessThan(0.3);
  });
});
```

- [ ] **Step 2: Write `bedLook.ts` with today's albedos**, so the test fails on the look and not on an import:

```ts
import type { Rgb } from '../sky/atmosphereParams';
import { type WaterOpticsParams, waterAlbedo } from '../ocean/waterOptics';
import { extinction, transmittance, waterColumnRadiance } from './waterColumn';

/** The seabed's albedos: seabedShading's TSL reads these, and so does the CPU check that the reef reads from the face. */
export const REEF_ALBEDO: Rgb = [0.09, 0.09, 0.07];
export const SAND_ALBEDO: Rgb = [0.62, 0.56, 0.44];
export const WEED_ALBEDO: Rgb = [0.06, 0.08, 0.035];

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];
export const luminance = (c: Rgb): number => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];

/**
 * A bed of `albedo` seen straight down through depthM of water under an overhead sun (unit irradiance): its light
 * attenuated down and back up, plus the water body's own scatter over the view path (waterColumnRadiance, as the shader).
 */
export function bedSeenFromAbove(albedo: Rgb, depthM: number, p: WaterOpticsParams): Rgb {
  const T = transmittance(extinction(p.absorptionPerM, p.backscatterPerM), depthM);
  const lit: Rgb = [albedo[0] * T[0], albedo[1] * T[1], albedo[2] * T[2]];
  const w = waterAlbedo(p);
  return waterColumnRadiance(lit, [w[0] * p.bodyScale, w[1] * p.bodyScale, w[2] * p.bodyScale], T);
}

/** Weber contrast of bed a against bed b, both seen through depthM: (L_a − L_b) / L_b. */
export function contrastAtDepth(a: Rgb, b: Rgb, depthM: number, p: WaterOpticsParams): number {
  const la = luminance(bedSeenFromAbove(a, depthM, p)), lb = luminance(bedSeenFromAbove(b, depthM, p));
  return (la - lb) / lb;
}
```

- [ ] **Step 3: Run it to verify it fails.**
Run: `npx vitest run src/seabed/bedLook.test.ts`
Expected: FAIL. At 12 m the rock-against-weed contrast is about 0.14 (bare rock 0.09 is barely paler than weed). The 15 m rock test fails too. The "dark" and "darkens and blues" tests pass.

- [ ] **Step 4: Find out why the bed reads navy in the game before tuning anything.**
1. Look at `$SCRATCH/reef/after-takeoff-*.png` from Task 5. Is the bed visible at all at the take-off? The Task 5 bed is already rock with the face, but its albedos are still today's.
2. Make two scratch experiments in the worktree (don't commit them). Restart the `ld-reef` preview and capture `takeoff` at the Task 1 times after each:
   - **(a)** `REEF_ALBEDO = [0.24, 0.23, 0.19]` (bare limestone) and `WEED_ALBEDO = [0.05, 0.075, 0.03]` in `bedLook.ts`, wired as Step 5 below.
   - **(b)** (a), plus `DEFAULT_WATER_OPTICS.bodyScale` 0.6.
3. Compare the three takes: today, (a) and (b).

- **If (a) reads** (rock and weed patches and sand pockets distinguishable on the face's foot and ahead of it, to the 12 m contour), the cause was the albedo: keep (a).
- **If only (b) reads,** the water body's scatter swamps the bed. Keep (a), and add a test to `waterOptics.test.ts` pinning the chosen `bodyScale`'s reason. The body's albedo at 12 m must not exceed the weed's seen radiance, using `bedSeenFromAbove`'s body term.
- **If neither reads,** the march or the reach fade is losing the bed from the face. Take a GPU probe of `seabedTerms`' `transmittance` at a face point: write a compute pass like `seabedShading.selftest.ts`, at (−4, 3, 3) looking down 50°. Then follow superpowers:systematic-debugging. Ledger the cause and its fix with its own failing test.

Ledger which case it was.

- [ ] **Step 5: Wire the shared albedos into the shader.** In `src/seabed/seabedShading.ts`, replace lines 9–11 (the three `const ... = vec3(...)`) with:

```ts
// The bed's albedos are bedLook's, shared with the CPU check that the reef reads from the face (spec 2026-10-02 §2.5).
const REEF_ALBEDO = vec3(...REEF_ALBEDO_RGB), SAND_ALBEDO = vec3(...SAND_ALBEDO_RGB), WEED_ALBEDO = vec3(...WEED_ALBEDO_RGB);
```

and add `import { REEF_ALBEDO as REEF_ALBEDO_RGB, SAND_ALBEDO as SAND_ALBEDO_RGB, WEED_ALBEDO as WEED_ALBEDO_RGB } from './bedLook';`.
Set `bedLook.ts`'s albedos to the values Step 4 chose: (a) is `REEF_ALBEDO = [0.24, 0.23, 0.19]`, `WEED_ALBEDO = [0.05, 0.075, 0.03]`; `SAND_ALBEDO` is unchanged.

- [ ] **Step 6: Run the tests to verify they pass.**
Run: `npx vitest run src/seabed/bedLook.test.ts src/ocean/waterOptics.test.ts && npm run typecheck`
Expected: PASS, and typecheck clean. At 12 m, (a) gives a rock-against-weed contrast of about 1.4, and sand against rock about 1.2.

- [ ] **Step 7: Commit.**

```bash
git add src/seabed/bedLook.ts src/seabed/bedLook.test.ts src/seabed/seabedShading.ts <src/ocean/waterOptics.ts and its test, if Step 4 chose (b)>
git commit -m "feat(reef): the reef reads from the face: pale bare limestone against dark weed, shared CPU/GPU albedos"
```

`task-done` command: `npx vitest run src/seabed/bedLook.test.ts src/ocean/waterOptics.test.ts src/seabed/bathymetry.test.ts`

---

### Task 8: GPU checks, final stills, Gate 2 (STOP)

**Files:**
- Modify: `src/seabed/seabedShading.selftest.ts`: add the face ray (Review Focus 5).

**Interfaces:**
- **Consumes:** everything above.
- **Produces:** passing self-tests, the final stills and overlay, and a message to Andrew.

- [ ] **Step 1: Add the face ray.** In `src/seabed/seabedShading.selftest.ts`, append this to `RAYS`:

```ts
  [[-4, 3, 3], [-0.55, -0.64, 0.53]], // from the take-off down the new face (plan 2026-10-02 Review Focus 5: the bed drops up to 8 m ahead)
```

- [ ] **Step 2: Run the GPU self-tests in Electron.** Restart the `ld-reef` preview first. Then, for each filter (`seabed`, `seabed shading`, `underwater`, `breaker`, `ribbon`, `surf`):

```bash
npx electron "$SCRATCH/selftest-runner.mjs" --url="http://localhost:5181/?selftest=<filter>" --out="$SCRATCH/reef/selftest-<filter>.txt"
```

URL-encode a space in a filter as `%20`.
Expected: every `[selftest] SUMMARY` is n/n passed. The `breaker` run includes "GPU onset psi0 matches the CPU" on the new reef.

A failure is a mirror bug: superpowers:systematic-debugging. The bathymetry texture carries the new depth and material, and `depthBgNode` is unchanged, so look first at what this build changed on the GPU side: the albedos, and the onset texture's ψ range.

- [ ] **Step 3: Final stills and the overlay.**
1. Restart the preview.
2. Capture all three moments at the Task 1 times as `final-<name>`.
3. Render the Task 6 material overlay PNG:

   ```bash
   VITE_REEF_MATERIAL_OUT="$SCRATCH/reef/material.html" npx vitest run src/seabed/reefViewer.test.ts
   ```

   then run `html2png`.
4. Look at all of them.

- [ ] **Step 4: Commit, push and send Gate 2.**

```bash
git add src/seabed/seabedShading.selftest.ts
git commit -m "test(reef): a seabed march down the new face, GPU = CPU"
git push
```

Then send with SendUserFile, status `proactive`:
- the before/final pairs for `takeoff` and `peak12`;
- `lineup` final;
- the material overlay PNG.

Write a short message:
- what the bed is now (rock, weed, where the sand is);
- what you can see from the take-off and how deep;
- the self-tests' results;
- that build B (the weed moving with the water) is next;
- that **the merge waits for his word**.

**STOP. Wait for Andrew.** Changes he asks for go back to Task 6 (where the rock and sand are) or Task 7 (how it looks), each with its test first.

`task-done` command: `npx vitest run`

---

## After Gate 2

Run the executing-plans final review (one reviewer on the most capable model, over `git merge-base main HEAD`..HEAD) and its single fix pass.

Then update memory `womb-reef-look.md` with:
- the outcome;
- the rulings;
- that build B is next.

**Never merge without Andrew's word.**
