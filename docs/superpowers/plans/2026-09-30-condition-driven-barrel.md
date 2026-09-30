# The Condition-Driven Barrel (A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every crest point gets a *break intensity* (0 gentle, 1 normal, 2 heavy). It comes from the reef's step where that point breaks, the wind, the period, the wave's drain and a random dial. The barrel's throw, lip thickness, back wall, trough drain and explosion surge follow it, blended between three calibrated anchors.

**Architecture:**
- The reef bake stores a *step* per breaking level in the onset record.
- `breakIntensity.ts` holds the rules as pure functions: step → intensity, intensity → barrel shape.
- The CPU model (`crestAt`, `crestTrace`, the emitters) and its GPU mirrors (`SetWaves` for the sheet, the `BreakingRibbon` frame pass for the lip) apply those rules per crest point.
- The shape's inputs (`throwStrength`, `lipThickness`, `wallBack`, `troughDrain`, `pileSurge`) stay on `BreakParams` as per-crest carriers. `withShape(params, barrelShape(I))` fills them in, so `lifecycle`, `breakPoint` and `profileFrame` keep their signatures.

**Tech stack:**
- TypeScript, three.js WebGPU with TSL (`three/tsl`), Vitest.
- GPU self-tests run in the browser at `http://localhost:5174/?selftest=<filter>`.

**Spec:** `docs/superpowers/specs/2026-09-30-condition-driven-barrel-design.md`. Read it before starting any task.

**Where:**
- Work in the worktree `C:\Dev\andrew-dev-personal-projects\ld-barrel`, on branch `barrel-and-whitewater`.
- Never touch the main checkout (`C:\Dev\andrew-dev-personal-projects\liquid-dreaming`) or its branch.
- Run tests with `npx vitest run <path>` from the worktree root. Typecheck with `npx tsc --noEmit -p .`.

**Rulings where the spec is silent or can't be met literally:**
1. Each wave's GPU record has no spare slots: all 8 floats are in use. It grows from two vec4s to three, and the third carries `(drainBonus, throwDraw, 0, 0)`.
2. The throw, lip thickness, trough drain and pile surge stay on `BreakParams` (plus a new `wallBack`). They are **per-crest values** set by `withShape`, and the panel no longer shows them. The spec's "leave BreakParams" is met in effect: nothing global sets them any more.
3. A point off the onset record (outside the reef grid) takes intensity exactly **1**, the normal anchor, with no wind or period term.
4. The anchors' inputs are found by a **calibration search** (Task 6) against the spec's measured targets, not guessed.
5. The step's table in the GPU keeps pairs: texel `k` holds `(step_k, step_{k+1})`, so a wave reads its step with one bilinear fetch.

## Global Constraints

- The step is clamped to **[1, 3]**, with a look-ahead of **1.5 ×** the still-water depth where the section starts to break.
- Step → intensity is piecewise linear through **1.25 → 0, 2.2 → 1, 2.8 → 2**. It extrapolates below 1.25 and above 2.8 before the final clamp.
- Wind adds **0.25 × clamp(offshore speed ÷ 8 m/s, −1, 1)**.
- Period adds **0.15 × clamp((T − 12 s) ÷ 6 s, −1, 1)**, where T is the wave's own period.
- The drain bonus is **0.1 × smoothstep(T, 2T, gap) − 0.3 × (1 − smoothstep(0.6T, T, gap))**. `gap` is the seconds since the previous wave reached the peak; Infinity for the first wave of a set and for strays.
- The random dial adds **dial × a seeded uniform in [−1, 1] per wave**. The dial is **0 by default** and goes up to 0.3.
- The nudge adds an overall offset, **0 by default**, range [−1, 1].
- The intensity used for the shape is clamped to **[0, 2]**.

The anchor targets, measured at the lip's landing on the peak for the biggest 12 ft set wave (lengths × H):

| | tubeRatio | landAhead | rootThickness | troughBelow | pileSurge |
|---|---|---|---|---|---|
| 0 gentle | 2.0 | 1.0 | 0.1 | 0.2 | 0 |
| 1 normal | 1.3 | 1.7 | 0.2 | 0.55 | 0.3 |
| 2 heavy | 1.1 | 2.0 | 0.3 | 0.7 | 0.45 |

- Tolerances: `tubeRatio` ± 0.15; the others ± 10%; the surge exactly.
- The lip's tip-to-root thickness ratio stays **0.4**.
- Performance: GPU frame time at 12 ft barrel-peeling is at most **+0.2 ms** over the baseline measured in Task 8, Step 1.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Off the reef grid (no onset record):** the sheet, the lip and the emitters must all read intensity 1. The CPU and GPU must agree there, so a crest running off the grid doesn't change shape at the edge. The test is in Task 4 (CPU) and Task 8 (GPU).
2. **Extreme conditions** (tide ±1.5 m, 15 ft, strong onshore): the step stays finite in [1, 3], the intensity clamps to [0, 2], and the lip never crosses itself or goes NaN. The tests are in Task 2 (the step at the tide extremes) and Task 6 (crossings across the whole intensity range).
3. **The first wave of a set, and strays:** a gap of Infinity must produce a finite bonus (0.1) on the CPU and a finite value in the GPU record. The test is in Task 3.
4. **Stored dev settings from before this change:** a saved "look" that still carries `throwStrength` or `pileSurge` must load without error, and must not change the per-crest shape. The test is in Task 10.
5. **The sheet and the lip disagreeing:** the lip's station intensity must match the sheet's crest intensity at the same point, or the lip lands on water drained for a different shape. The test is in Task 5.

---

### Task 1: The intensity rules (`breakIntensity.ts`) and the wall as a parameter

**Files:**
- Create: `src/breaker/breakIntensity.ts`
- Create: `src/breaker/breakIntensity.test.ts`
- Modify: `src/breaker/breaking.ts` (`BreakParams`, `DEFAULT_BREAK_PARAMS`, `normalizeBreakParams`)
- Modify: `src/breaker/lipProfile.ts` (lines 46–47 `WALL_BACK_H`, line 59 `LipParams`, line 151 `W`)
- Modify: `src/breaker/lipProfileNodes.ts` (the imports at line 7, `createLipUniforms`/`updateLipUniforms` lines 77–98, line 211 `W`)

**Interfaces:**
- Produces:
  - `STEP_MIN = 1`, `STEP_MAX = 3`, `STEP_POINTS: readonly (readonly [number, number])[]`, `INTENSITY_MAX = 2`, `RANDOM_DIAL_MAX = 0.3`
  - `stepToIntensity(step: number): number`
  - `offshoreSpeed(windSpeedMs: number, windFromDeg: number, travelX: number, travelZ: number): number`
  - `drainBonus(gapS: number, periodS: number): number`
  - `interface IntensityInput { step: number; offshoreMs: number; periodS: number; waveBonus: number; throwDraw: number }`
  - `breakIntensity(i: IntensityInput, p: Pick<BreakParams, 'intensityNudge' | 'randomDial'>): number` (clamped to [0, 2])
  - `interface BarrelShape { throwStrength: number; lipThickness: number; wallBack: number; troughDrain: number; pileSurge: number }`
  - `ANCHORS: readonly [BarrelShape, BarrelShape, BarrelShape]`
  - `barrelShape(intensity: number, anchors?: readonly BarrelShape[]): BarrelShape`
  - `withShape(p: BreakParams, s: BarrelShape): BreakParams`
  - `PER_CREST_BREAK_KEYS: readonly (keyof BarrelShape)[]`
  - `BreakParams` gains `wallBack: number`, `intensityNudge: number` and `randomDial: number`. `LipParams` gains `'wallBack'`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/breaker/breakIntensity.test.ts
import { describe, expect, it } from 'vitest';
import { travelDirectionXZ } from '../conditions/directions';
import { DEFAULT_BREAK_PARAMS, normalizeBreakParams } from './breaking';
import { ANCHORS, INTENSITY_MAX, PER_CREST_BREAK_KEYS, barrelShape, breakIntensity, drainBonus, offshoreSpeed, stepToIntensity, withShape } from './breakIntensity';

const P = { intensityNudge: 0, randomDial: 0 };
const base = { step: 2.2, offshoreMs: 0, periodS: 12, waveBonus: 0, throwDraw: 0 };

describe('breakIntensity', () => {
  it('maps the step through 1.25 → 0, 2.2 → 1, 2.8 → 2, clamping the step to [1, 3]', () => {
    expect(stepToIntensity(1.25)).toBeCloseTo(0, 9);
    expect(stepToIntensity(2.2)).toBeCloseTo(1, 9);
    expect(stepToIntensity(2.8)).toBeCloseTo(2, 9);
    expect(stepToIntensity(1.725)).toBeCloseTo(0.5, 9);
    expect(stepToIntensity(0.5)).toBeCloseTo(stepToIntensity(1), 9);
    expect(stepToIntensity(9)).toBeCloseTo(stepToIntensity(3), 9);
    expect(stepToIntensity(1)).toBeLessThan(0);
  });
  it('offshore wind is positive, onshore negative, cross-shore about zero', () => {
    const d = travelDirectionXZ(225);
    expect(offshoreSpeed(5, 45, d.x, d.z)).toBeCloseTo(5, 6); // blowing from the NE, against a swell from the SW
    expect(offshoreSpeed(5, 225, d.x, d.z)).toBeCloseTo(-5, 6);
    expect(Math.abs(offshoreSpeed(5, 135, d.x, d.z))).toBeLessThan(1e-6);
    expect(offshoreSpeed(3, 80, d.x, d.z)).toBeGreaterThan(2); // the default morning offshore
  });
  it('the drain bonus: +0.1 after a lull, −0.3 stacked close behind, about 0 at normal set spacing', () => {
    expect(drainBonus(Infinity, 15)).toBeCloseTo(0.1, 9);
    expect(drainBonus(15, 15)).toBeCloseTo(0, 9);
    expect(drainBonus(0.5 * 15, 15)).toBeCloseTo(-0.3, 9);
    expect(Math.abs(drainBonus(0.9 * 15, 15))).toBeLessThan(0.05);
    expect(Math.abs(drainBonus(1.1 * 15, 15))).toBeLessThan(0.05);
    expect(Number.isFinite(drainBonus(0, 15))).toBe(true);
  });
  it('adds wind, period, drain, the dial and the nudge in order, then clamps to [0, 2]', () => {
    expect(breakIntensity(base, P)).toBeCloseTo(1, 9);
    expect(breakIntensity({ ...base, offshoreMs: 8 }, P)).toBeCloseTo(1.25, 9);
    expect(breakIntensity({ ...base, offshoreMs: -20 }, P)).toBeCloseTo(0.75, 9);
    expect(breakIntensity({ ...base, periodS: 18 }, P)).toBeCloseTo(1.15, 9);
    expect(breakIntensity({ ...base, waveBonus: -0.3 }, P)).toBeCloseTo(0.7, 9);
    expect(breakIntensity({ ...base, throwDraw: 1 }, P)).toBeCloseTo(1, 9); // the dial is 0
    expect(breakIntensity({ ...base, throwDraw: -1 }, { intensityNudge: 0, randomDial: 0.3 })).toBeCloseTo(0.7, 9);
    expect(breakIntensity(base, { intensityNudge: 0.4, randomDial: 0 })).toBeCloseTo(1.4, 9);
    expect(breakIntensity({ ...base, step: 3, offshoreMs: 20 }, P)).toBe(INTENSITY_MAX);
    expect(breakIntensity({ ...base, step: 1, offshoreMs: -20 }, P)).toBe(0);
  });
  it('the shape is the anchors at 0, 1 and 2, eased between them with no jumps', () => {
    for (const k of [0, 1, 2]) expect(barrelShape(k)).toEqual(ANCHORS[k]);
    expect(barrelShape(-1)).toEqual(ANCHORS[0]);
    expect(barrelShape(5)).toEqual(ANCHORS[2]);
    for (const key of PER_CREST_BREAK_KEYS) {
      for (let I = 0; I < 2; I += 0.05) {
        const k = I < 1 ? 0 : 1, span = Math.abs(ANCHORS[k + 1][key] - ANCHORS[k][key]);
        expect(Math.abs(barrelShape(I + 0.05)[key] - barrelShape(I)[key])).toBeLessThanOrEqual(0.08 * span + 1e-12);
      }
    }
  });
  it('withShape sets exactly the per-crest keys; the defaults are the normal anchor', () => {
    const s = ANCHORS[2], p = withShape(DEFAULT_BREAK_PARAMS, s);
    for (const key of PER_CREST_BREAK_KEYS) expect(p[key]).toBe(s[key]);
    expect(p.gamma).toBe(DEFAULT_BREAK_PARAMS.gamma);
    for (const key of PER_CREST_BREAK_KEYS) expect(DEFAULT_BREAK_PARAMS[key]).toBe(ANCHORS[1][key]);
  });
  it('normalizes the new params into range', () => {
    const p = { ...DEFAULT_BREAK_PARAMS, wallBack: 9, intensityNudge: -9, randomDial: 9 };
    normalizeBreakParams(p);
    expect(p.wallBack).toBe(0.5);
    expect(p.intensityNudge).toBe(-1);
    expect(p.randomDial).toBe(0.3);
  });
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run src/breaker/breakIntensity.test.ts`
Expected: FAIL (`Cannot find module './breakIntensity'`).

- [ ] **Step 3: Implement `breakIntensity.ts`**

```ts
// src/breaker/breakIntensity.ts
import { travelDirectionXZ } from '../conditions/directions';
import { smoothstep } from '../math/smoothstep';
import type { BreakParams } from './breaking';

/**
 * Break intensity (spec 2026-09-30-condition-driven-barrel §3.2–3.3): one number per crest point, 0 gentle, 1 a normal
 * good day, 2 heavy, from the reef's step where the point breaks, the wind, the period, the wave's drain and a random
 * dial; and the barrel's shape from it, blended between three anchors. The source of truth: breakIntensityNodes.ts
 * mirrors it term by term on the GPU.
 */

/** The step (depth where a section starts to break ÷ the shallowest depth over 1.5 depths ahead) is clamped here. */
export const STEP_MIN = 1;
export const STEP_MAX = 3;
/** Step → intensity, piecewise linear through these (step, intensity) points; extrapolated past both ends. */
export const STEP_POINTS: readonly (readonly [number, number])[] = [[1.25, 0], [2.2, 1], [2.8, 2]];
/** The step a normal day's break reads (intensity 1). */
export const STEP_NORMAL = 2.2;
/** Offshore wind adds WIND_WEIGHT × clamp(offshore ÷ WIND_FULL_MS, −1, 1). */
export const WIND_WEIGHT = 0.25;
export const WIND_FULL_MS = 8;
/** The period adds PERIOD_WEIGHT × clamp((T − PERIOD_MID_S) ÷ PERIOD_SPAN_S, −1, 1). */
export const PERIOD_WEIGHT = 0.15;
export const PERIOD_MID_S = 12;
export const PERIOD_SPAN_S = 6;
/** The drain bonus: + LULL_BONUS after a long gap, − STACK_PENALTY close behind the wave before. */
export const LULL_BONUS = 0.1;
export const STACK_PENALTY = 0.3;
export const RANDOM_DIAL_MAX = 0.3;
export const INTENSITY_MAX = 2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function stepToIntensity(step: number): number {
  const s = clamp(step, STEP_MIN, STEP_MAX);
  const [[s0, i0], [s1, i1], [s2, i2]] = STEP_POINTS;
  return s <= s1 ? i0 + ((s - s0) * (i1 - i0)) / (s1 - s0) : i1 + ((s - s1) * (i2 - i1)) / (s2 - s1);
}

/** The wind's speed against the waves' travel (m/s): positive offshore (blowing into the waves' faces), negative onshore. */
export function offshoreSpeed(windSpeedMs: number, windFromDeg: number, travelX: number, travelZ: number): number {
  const toward = travelDirectionXZ(windFromDeg);
  return -windSpeedMs * (toward.x * travelX + toward.z * travelZ);
}

/** How drained the reef is when a wave arrives `gapS` after the one before it (Infinity: after a lull). */
export function drainBonus(gapS: number, periodS: number): number {
  const g = Number.isNaN(gapS) ? Infinity : Math.max(gapS, 0);
  return LULL_BONUS * smoothstep(periodS, 2 * periodS, g) - STACK_PENALTY * (1 - smoothstep(0.6 * periodS, periodS, g));
}

export interface IntensityInput {
  step: number;
  offshoreMs: number;
  periodS: number;
  /** The wave's drain bonus (drainBonus). */
  waveBonus: number;
  /** The wave's random draw in [−1, 1] (sets.WaveEvent.throwDraw). */
  throwDraw: number;
}

/** The crest point's intensity, clamped to [0, INTENSITY_MAX]. */
export function breakIntensity(i: IntensityInput, p: Pick<BreakParams, 'intensityNudge' | 'randomDial'>): number {
  const I = stepToIntensity(i.step)
    + WIND_WEIGHT * clamp(i.offshoreMs / WIND_FULL_MS, -1, 1)
    + PERIOD_WEIGHT * clamp((i.periodS - PERIOD_MID_S) / PERIOD_SPAN_S, -1, 1)
    + i.waveBonus + p.randomDial * i.throwDraw + p.intensityNudge;
  return clamp(I, 0, INTENSITY_MAX);
}

/** The shape inputs intensity sets (BreakParams' per-crest keys). */
export interface BarrelShape {
  throwStrength: number;
  lipThickness: number;
  /** The tube's back wall stands this many H behind the crest at full throw (negative: ahead of it). */
  wallBack: number;
  troughDrain: number;
  pileSurge: number;
}
export const PER_CREST_BREAK_KEYS: readonly (keyof BarrelShape)[] = ['throwStrength', 'lipThickness', 'wallBack', 'troughDrain', 'pileSurge'];

/**
 * The anchors (gentle, normal, heavy), calibrated in Task 6 against the spec's measured targets (barrelAnchors.test.ts).
 * Until then these are first guesses.
 */
export const ANCHORS: readonly [BarrelShape, BarrelShape, BarrelShape] = [
  { throwStrength: 0.45, lipThickness: 0.1, wallBack: 0.1, troughDrain: 0.3, pileSurge: 0 },
  { throwStrength: 0.6, lipThickness: 0.25, wallBack: 0.25, troughDrain: 0.7, pileSurge: 0.3 },
  { throwStrength: 0.9, lipThickness: 0.3, wallBack: 0.1, troughDrain: 0.9, pileSurge: 0.45 },
];

/** The shape at `intensity`: anchor k at k, smoothstep-eased between neighbours (zero slope at each anchor). */
export function barrelShape(intensity: number, anchors: readonly BarrelShape[] = ANCHORS): BarrelShape {
  const I = clamp(intensity, 0, INTENSITY_MAX);
  const k = I < 1 ? 0 : 1;
  const t = smoothstep(0, 1, I - k);
  const a = anchors[k], b = anchors[k + 1];
  const out = {} as BarrelShape;
  for (const key of PER_CREST_BREAK_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}

/** `p` with its per-crest keys from shape `s` (a copy). */
export function withShape(p: BreakParams, s: BarrelShape): BreakParams {
  return { ...p, throwStrength: s.throwStrength, lipThickness: s.lipThickness, wallBack: s.wallBack, troughDrain: s.troughDrain, pileSurge: s.pileSurge };
}
```

- [ ] **Step 4: Add the new params to `BreakParams`**

In `src/breaker/breaking.ts`:
1. Add to `interface BreakParams`, after `pileSurge`:

```ts
  /** The tube's back wall stands this many H behind the crest at full throw (negative: ahead). Per crest: set from its
   * intensity (breakIntensity.withShape), as are throwStrength, lipThickness, troughDrain and pileSurge. */
  wallBack: number;
  /** An overall offset on every crest's break intensity (the Break panel). */
  intensityNudge: number;
  /** The random dial: each wave's throw moves by up to ± this much intensity (its seeded draw); 0 is pure physics. */
  randomDial: number;
```

2. In `DEFAULT_BREAK_PARAMS`, add `wallBack: 0.25, intensityNudge: 0, randomDial: 0`. Keep `throwStrength: 0.6, lipThickness: 0.25, troughDrain: 0.7, pileSurge: 0.3`: they equal `ANCHORS[1]` for now. Task 6 updates both together.

3. In `normalizeBreakParams`, add:

```ts
  p.wallBack = clampTo(p.wallBack, -0.3, 0.5, d.wallBack);
  p.intensityNudge = clampTo(p.intensityNudge, -1, 1, d.intensityNudge);
  p.randomDial = clampTo(p.randomDial, 0, 0.3, d.randomDial);
```

- [ ] **Step 5: Make the wall a parameter**

In `src/breaker/lipProfile.ts`:
- Delete `WALL_BACK_H` (lines 46–47).
- Line 59 becomes `export type LipParams = Pick<BreakParams, 'throwStrength' | 'lipThickness' | 'wallBack' | 'collapseTime' | 'ribbonOnset' | 'faceWidth' | 'troughDrain' | 'delta'>;`
- Line 151 becomes `const W: Vec2 = [K[0] - p.wallBack * H * prog, F[1] + WALL_HEIGHT * (R[1] - F[1])];`

In `src/breaker/lipProfileNodes.ts`:
- Remove `WALL_BACK_H` from the import.
- Add `wallBack: uniform(0.25)` to `createLipUniforms`'s object, and `u.wallBack.value = p.wallBack;` to `updateLipUniforms`.
- Line 211 becomes `const W = vec2(K.x.sub(H.mul(u.wallBack).mul(prog)), F.y.add(R.y.sub(F.y).mul(WALL_HEIGHT))).toVar();`

Then find any other references with `grep -rn "WALL_BACK_H" src` and replace each with `DEFAULT_BREAK_PARAMS.wallBack` (tests) or `p.wallBack`.

- [ ] **Step 6: Run the tests, the typecheck and the breaker suite**

Run: `npx vitest run src/breaker/breakIntensity.test.ts` and expect PASS.
Run: `npx tsc --noEmit -p .` and expect no errors.
Run: `npx vitest run src/breaker src/dev` and expect PASS, except `DevPanel.test.ts`'s "every numeric BreakParams field has a binding". Make that pass now by adding the three new keys to `BREAK_BINDINGS` in `src/dev/DevPanel.ts`. Task 10 revises the panel.

```ts
  wallBack: { label: 'wall back (×H, per crest)', min: -0.3, max: 0.5, step: 0.01 },
  intensityNudge: { label: 'intensity nudge', min: -1, max: 1, step: 0.05 },
  randomDial: { label: 'random dial', min: 0, max: 0.3, step: 0.01 },
```

- [ ] **Step 7: Commit**

```bash
git add src/breaker/breakIntensity.ts src/breaker/breakIntensity.test.ts src/breaker/breaking.ts src/breaker/lipProfile.ts src/breaker/lipProfileNodes.ts src/dev/DevPanel.ts
git commit -m "feat(intensity): the break intensity rules and the barrel's shape from them; the tube's wall is a parameter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The step in the reef bake

**Files:**
- Modify: `src/breaker/breaking.ts` (`ONSET_RECORD_LENGTH` near line 261; add `ONSET_STEP_OFFSET`, `onsetStep`)
- Modify: `src/breaker/reefField.ts` (add `STEP_LOOK_AHEAD`, `stepAlong`; the raw step and its smoothing in `computeReefField` near line 287; `computeOnsetRecord` lines 307–371)
- Modify: `src/breaker/SetWaves.ts` line 129 (copy only the (time, height) pairs into the GPU texture)
- Create: `src/breaker/reefStep.test.ts`
- Modify: `src/breaker/reefField.test.ts` and `src/breaker/breaking.test.ts` wherever they build records of `ONSET_RECORD_LENGTH` by hand. Keep them passing: the new values sit after the pairs.

**Interfaces:**
- Consumes: `STEP_MIN`, `STEP_MAX` (Task 1).
- Produces:
  - `ONSET_RECORD_LENGTH = 1 + 3 * ONSET_LEVELS`
  - `ONSET_STEP_OFFSET = 1 + 2 * ONSET_LEVELS`
  - `onsetStep(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number`
  - `stepAlong(depthAhead: (s: number) => number, d0: number): number`
  - `STEP_LOOK_AHEAD = 1.5`

- [ ] **Step 1: Write the failing tests**

```ts
// src/breaker/reefStep.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_RECORD_LENGTH, ONSET_LEVELS, onsetStep } from './breaking';
import { STEP_MAX, STEP_MIN } from './breakIntensity';
import { computeReefField, sampleField, sampleOnset, stepAlong } from './reefField';

const bed = downsample(buildBathymetry(), 2);
const fieldAt = (tideM: number) => computeReefField({ bed, periodS: 15, fromDeg: 225, tideM });
const biggest = (ft: number) => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = ft; return wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => Math.max(a, b.heightM), 0); };
const stepAt = (f: ReturnType<typeof fieldAt>, x: number, z: number, h: number) => onsetStep(sampleOnset(f, x, z)!, 0, h, DEFAULT_BREAK_PARAMS);

describe('the step', () => {
  it('stepAlong: a ledge gives deep ÷ shallow, a flat bottom 1, and it clamps to [1, 3]', () => {
    expect(stepAlong((s) => (s < 5 ? 13 : 6), 13)).toBeCloseTo(13 / 6, 9);
    expect(stepAlong(() => 13, 13)).toBe(1);
    expect(stepAlong(() => 0.5, 13)).toBe(STEP_MAX);
    expect(stepAlong(() => 20, 13)).toBe(STEP_MIN);
    expect(stepAlong((s) => (s < 25 ? 13 : 2), 13)).toBe(1); // beyond 1.5 depths ahead it isn't seen
  });
  it('the record has a step per level after the (time, height) pairs', () => {
    expect(ONSET_RECORD_LENGTH).toBe(1 + 3 * ONSET_LEVELS);
  });
  const low = fieldAt(-1.5), mid = fieldAt(0), high = fieldAt(1.5);
  const h12 = biggest(12);
  it('at the peak, 12 ft: low tide throws onto a bigger step than high tide; mid tide reads a normal day', () => {
    const [sl, sm, sh] = [stepAt(low, 0, 0, h12), stepAt(mid, 0, 0, h12), stepAt(high, 0, 0, h12)];
    console.log(`peak step, 12 ft: low ${sl.toFixed(2)} mid ${sm.toFixed(2)} high ${sh.toFixed(2)}`);
    expect(sl).toBeGreaterThan(sh);
    expect(sm).toBeGreaterThan(1.8);
    expect(sm).toBeLessThan(2.6);
  });
  it('too big at low tide (15 ft) breaks out over the flat bottom: its step reads about 1', () => {
    const s = stepAt(low, 0, 0, biggest(15));
    console.log(`peak step, 15 ft low tide: ${s.toFixed(2)}`);
    expect(s).toBeLessThan(1.3);
  });
  it('is carried along the ray after a section breaks (10 and 20 m shoreward of the peak read the peak's value)', () => {
    const f0 = sampleField(mid, 0, 0), s0 = stepAt(mid, 0, 0, h12);
    for (const d of [10, 20]) expect(Math.abs(stepAt(mid, f0.dirX * d, f0.dirZ * d, h12) - s0)).toBeLessThan(0.05 * s0);
  });
  it('is smooth along the crest line through the peak (≤ 0.1 per metre) and finite at both tide extremes', () => {
    for (const f of [low, mid, high]) {
      const f0 = sampleField(f, 0, 0), tx = -f0.dirZ, tz = f0.dirX;
      let prev = stepAt(f, -30 * tx, -30 * tz, h12);
      for (let v = -29; v <= 30; v++) {
        const s = stepAt(f, v * tx, v * tz, h12);
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(STEP_MIN);
        expect(s).toBeLessThanOrEqual(STEP_MAX);
        expect(Math.abs(s - prev)).toBeLessThanOrEqual(0.1);
        prev = s;
      }
    }
  });
});
```

- [ ] **Step 2: Run and check it fails**

Run: `npx vitest run src/breaker/reefStep.test.ts`
Expected: FAIL (`onsetStep` and `stepAlong` are not exported).

- [ ] **Step 3: Extend the record layout and add the reader**

In `src/breaker/breaking.ts`, replace the `ONSET_RECORD_LENGTH` definition and its comment with:

```ts
/** Values per record sample: the running maximum; per level (time since onset, the throw's height ÷ the level's
 * deep-water height); then per level the step where that level broke (reefField.stepAlong, spec 2026-09-30 §3.1). */
export const ONSET_RECORD_LENGTH = 1 + 3 * ONSET_LEVELS;
/** Offset of level 0's step in a record sample. */
export const ONSET_STEP_OFFSET = 1 + 2 * ONSET_LEVELS;
```

Add after `onsetHeight`:

```ts
/**
 * The step where the section broke, for a wave of deep-water height `heightM`: levels k and k + 1 around its breaking
 * level, log-linearly (w = lq − k, clamped). Unlike onsetTime it reads a value whether or not the wave has broken: an
 * unbroken level holds the node's own step (a section breaking there now), which the drain uses before the break.
 */
export function onsetStep(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number {
  const g = heightM * onsetGain(p), s = offset + ONSET_STEP_OFFSET;
  if (!(g > 0)) return rec[s];
  const lq = Math.log(1 / (g * ONSET_LEVEL_Q0)) / Math.log(ONSET_LEVEL_RATIO);
  const k = Math.min(ONSET_LEVELS - 2, Math.max(0, Math.floor(lq)));
  const w = Math.min(1, Math.max(0, lq - k));
  return rec[s + k] + w * (rec[s + k + 1] - rec[s + k]);
}
```

- [ ] **Step 4: Bake the step**

In `src/breaker/reefField.ts`:
1. Import `ONSET_STEP_OFFSET` from `./breaking` and `STEP_MAX, STEP_MIN` from `./breakIntensity`. `MIN_DEPTH_M` is already imported.
2. Add after `SLURP_STEP_M`:

```ts
/** The step looks this many still-water depths ahead along the ray (spec 2026-09-30 §3.1). */
export const STEP_LOOK_AHEAD = 1.5;
/** The look-ahead's samples are this far apart (m): the field's cell. */
const STEP_SAMPLE_M = 1;

/**
 * The step at a point of still-water depth d0: d0 ÷ the shallowest depth over the next STEP_LOOK_AHEAD × d0 metres along
 * its ray (depthAhead(s), s metres ahead), clamped to [STEP_MIN, STEP_MAX]. Deep before and shallow after is a heavy
 * throw; a flat bottom is 1.
 */
export function stepAlong(depthAhead: (s: number) => number, d0: number): number {
  const reach = STEP_LOOK_AHEAD * d0;
  let m = d0;
  for (let s = STEP_SAMPLE_M; s <= reach + 1e-9; s += STEP_SAMPLE_M) m = Math.min(m, depthAhead(s));
  return Math.min(STEP_MAX, Math.max(STEP_MIN, d0 / Math.max(m, MIN_DEPTH_M)));
}
```

3. In `computeReefField`, before the `computeOnsetRecord` call, add the following and pass `stepHere` into `computeOnsetRecord`'s argument object:

```ts
  // The step at every node (spec §3.1), smoothed along the crest as the breaking depth is, so small reef bumps don't
  // make the lip ragged.
  const depthAt = bilinearCells(depth, grid);
  const rawStep = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const col = i % nx, row = (i - col) / nx, dx = dirX[i] / cellM, dz = dirZ[i] / cellM;
    rawStep[i] = stepAlong((s) => depthAt(col + dx * s, row + dz * s), depth[i]);
  }
  const stepHere = smoothAlongCrest(rawStep, dirX, dirZ, grid, BREAK_SMOOTHING_M);
```

`bilinearCells(a, grid)` takes cell coordinates and clamps at the edges. Check that before relying on it; if it doesn't clamp, clamp `col + dx * s` and `row + dz * s` to `[0, nx − 1]` and `[0, nz − 1]`.

4. In `computeOnsetRecord`, add `stepHere: Float32Array` to its argument type. Then, with `S = ONSET_STEP_OFFSET`, write level `k`'s step in each branch:
   - The `!inside` branch: `out[base + S + k] = f.stepHere[i];` for every k (inside its existing loop).
   - `run < q && !brokenB`: `out[base + S + k] = f.stepHere[i];`
   - `brokenB`: `out[base + S + k] = lerp(out, R, S + k);`
   - "Broken in between": `const stepB = lerp(f.stepHere); out[base + S + k] = stepB + fr * (f.stepHere[i] - stepB);`

5. In `src/breaker/SetWaves.ts` line 129, change `r + ONSET_RECORD_LENGTH` to `r + ONSET_STEP_OFFSET`, and import `ONSET_STEP_OFFSET`. Otherwise the texture copy overruns into the next node.

- [ ] **Step 5: Run the new and the existing tests**

Run: `npx vitest run src/breaker/reefStep.test.ts src/breaker/reefField.test.ts src/breaker/breaking.test.ts src/breaker/setWaveModel.test.ts`
Expected: PASS. If `reefField.test.ts` or `breaking.test.ts` build a record by hand with `new Float32Array(ONSET_RECORD_LENGTH)` and index it by the old layout, they keep working, because the pairs didn't move. Fix any that assume `R = 1 + 2L`.

If the mid-tide range test fails (the step at the peak is outside 1.8–2.6), print the value and stop. That means the calibration points in the spec's §3.2 need a ruling from Andrew; don't change `STEP_POINTS` on your own.

- [ ] **Step 6: Commit**

```bash
git add src/breaker/breaking.ts src/breaker/reefField.ts src/breaker/SetWaves.ts src/breaker/reefStep.test.ts src/breaker/reefField.test.ts src/breaker/breaking.test.ts
git commit -m "feat(reef): the step where each section breaks, baked per level into the onset record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Each wave's drain bonus and random draw

**Files:**
- Modify: `src/swell/sets.ts` (`WaveEvent` near line 58; `wavesOfSet` lines 110–140; `straysAfterSet` lines 143–169; add `THROW_SALT`)
- Modify: `src/breaker/setWaveModel.ts` (`ActiveWave` lines 43–53; `toActiveWave` lines 101–107)
- Modify: `src/swell/sets.test.ts`
- Modify: every test or fixture that builds a `WaveEvent` literal by hand (`grep -rn "longTail:" src --include=*.ts`). Add `gapS: Infinity, throwDraw: 0`.

**Interfaces:**
- Consumes: `drainBonus` (Task 1).
- Produces:
  - `WaveEvent.gapS: number` (Infinity for the first wave of a set and for strays)
  - `WaveEvent.throwDraw: number` (in [−1, 1])
  - `ActiveWave.drainBonus?: number`, `ActiveWave.throwDraw?: number` (absent = 0)

- [ ] **Step 1: Snapshot today's waves, before changing anything**

Add this test to `src/swell/sets.test.ts` and run it once. Vitest writes the inline snapshot on the first run.

```ts
it('adding the throw draw and the gap leaves every other value of a set and its strays as it was', () => {
  const pick = (w: WaveEvent) => ({ id: w.id, arrivalS: +w.arrivalS.toFixed(6), heightM: +w.heightM.toFixed(6), periodS: +w.periodS.toFixed(6), fromDeg: +w.fromDeg.toFixed(6), crestLengthM: +w.crestLengthM.toFixed(3), crestOffsetM: +w.crestOffsetM.toFixed(3), longTail: w.longTail });
  const all = [1, 2].flatMap((slot) => [...wavesOfSet(slot, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS), ...straysAfterSet(slot, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)]);
  expect(all.map(pick)).toMatchInlineSnapshot();
});
```

Run `npx vitest run src/swell/sets.test.ts` and expect PASS, with the snapshot now written into the file.

- [ ] **Step 2: Write the failing tests**

```ts
describe('the throw draw and the gap (condition-driven barrel)', () => {
  const set = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
  it('the first wave of a set follows a lull; each later one the gap to the one before', () => {
    expect(set[0].gapS).toBe(Infinity);
    for (let i = 1; i < set.length; i++) expect(set[i].gapS).toBeCloseTo(set[i].arrivalS - set[i - 1].arrivalS, 9);
  });
  it('strays follow a lull', () => {
    for (const s of straysAfterSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)) expect(s.gapS).toBe(Infinity);
  });
  it('each wave has its own repeatable draw in [−1, 1], not all the same', () => {
    const again = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
    set.forEach((w, i) => { expect(w.throwDraw).toBeGreaterThanOrEqual(-1); expect(w.throwDraw).toBeLessThanOrEqual(1); expect(again[i].throwDraw).toBe(w.throwDraw); });
    expect(new Set(set.map((w) => w.throwDraw)).size).toBeGreaterThan(1);
  });
  it('toActiveWave carries a finite drain bonus (Infinity → +0.1) and the draw', () => {
    const a = toActiveWave(set[0]);
    expect(a.drainBonus).toBeCloseTo(0.1, 9);
    expect(a.throwDraw).toBe(set[0].throwDraw);
    for (const w of set) expect(Number.isFinite(toActiveWave(w).drainBonus!)).toBe(true);
  });
});
```

Import `toActiveWave` from `../breaker/setWaveModel`.

- [ ] **Step 3: Run and check it fails**

Run: `npx vitest run src/swell/sets.test.ts`
Expected: the new tests FAIL (`gapS` is undefined).

- [ ] **Step 4: Implement**

In `src/swell/sets.ts`:
1. Add to `WaveEvent`:

```ts
  /** Seconds since the wave before it reached the peak: Infinity for the first of its set and for strays (after a lull). */
  gapS: number;
  /** This wave's draw for the throw's random dial, in [−1, 1] (its own stream: every other value stays as it was). */
  throwDraw: number;
```

2. Add `const THROW_SALT = 13000;` next to `TAIL_SALT`, and this helper after `signed`:

```ts
const throwDrawOf = (c: Conditions, id: number): number => signed(createRng(deriveSeed(c.seed, THROW_SALT + id)).next());
```

3. In `wavesOfSet`'s push add `gapS: i === 0 ? Infinity : t - waves[i - 1].arrivalS,` and `throwDraw: throwDrawOf(c, slot * 64 + i),`. Both go before `t` advances, and neither draws from `rng`.
4. In `straysAfterSet`'s push add `gapS: Infinity, throwDraw: throwDrawOf(c, slot * 64 + 32 + n),`.

In `src/breaker/setWaveModel.ts`:
- Add to `ActiveWave`:

```ts
  /** The wave's drain bonus to its break intensity (breakIntensity.drainBonus); absent: 0. */
  drainBonus?: number;
  /** The wave's random draw for the throw's dial, in [−1, 1]; absent: 0. */
  throwDraw?: number;
```

- In `toActiveWave` add `drainBonus: drainBonus(e.gapS, e.periodS), throwDraw: e.throwDraw,`, and import `drainBonus` from `./breakIntensity`.

- [ ] **Step 5: Run everything that builds waves**

Run: `npx tsc --noEmit -p .`, then fix each hand-built `WaveEvent` literal the typecheck reports by adding `gapS: Infinity, throwDraw: 0`.
Run: `npx vitest run src/swell src/breaker src/whitewater src/sound`
Expected: PASS, with the Step 1 snapshot unchanged.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(sets): each wave's gap to the one before and its own throw draw; active waves carry the drain bonus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The CPU sheet reads intensity

**Files:**
- Modify: `src/breaker/setWaveModel.ts` (`BreakOptions` lines 81–91, `breakOptions` 94–97, `Crest` 141–161, `crestAt` 177–204, `waveAtCrest` line 296, `crestPileTop` line 372)
- Modify: `src/breaker/setWaveModel.test.ts`

**Interfaces:**
- Consumes:
  - `onsetStep`, `ONSET_STEP_OFFSET` (Task 2)
  - `breakIntensity`, `barrelShape`, `withShape`, `STEP_NORMAL`, `BarrelShape` (Task 1)
  - `ActiveWave.drainBonus` and `ActiveWave.throwDraw` (Task 3)
- Produces:
  - `BreakOptions.offshoreMs?: number`
  - `BreakOptions.force?: { intensity: number; shape?: BarrelShape }`
  - `breakOptions(field, params, offshoreMs = 0)`
  - `Crest.intensity: number`
  - `Crest.params: BreakParams` (the crest's own, `withShape` applied)

- [ ] **Step 1: Write the failing tests** (add to `src/breaker/setWaveModel.test.ts`, reusing its field, context and wave helpers, or building them as `lipProfile.test.ts` lines 15–21 do)

```ts
describe('break intensity at the crest (condition-driven barrel)', () => {
  const c12 = cloneConditions(DEFAULT_CONDITIONS); c12.swell.sizeFt = 12;
  const big = wavesOfSet(1, c12, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const w: ActiveWave = { arrivalS: 0, heightM: big.heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };
  const t = sampleField(field, 0, 0).tau + 0.5;
  const crestWith = (o: BreakOptions, wave = w) => crestAt(0, 0, t, sampleField(field, 0, 0), wave, ctx, o)!;
  const lowestAhead = (o: BreakOptions) => {
    const f0 = sampleField(field, 0, 0);
    let m = Infinity;
    for (let u = 0; u <= 25; u += 0.5) { const x = f0.dirX * u, z = f0.dirZ * u; m = Math.min(m, sumWaves(x, z, t + 1, sampleField(field, x, z), [w], ctx, o).eta); }
    return m;
  };
  it('the crest carries its intensity and its own params (the shape at that intensity)', () => {
    const c = crestWith(breakOptions(field, DEFAULT_BREAK_PARAMS));
    expect(c.intensity).toBeGreaterThanOrEqual(0);
    expect(c.intensity).toBeLessThanOrEqual(2);
    expect(c.params.troughDrain).toBeCloseTo(barrelShape(c.intensity).troughDrain, 12);
    expect(c.params.gamma).toBe(DEFAULT_BREAK_PARAMS.gamma);
  });
  it('offshore wind raises the intensity by 0.5 over the same onshore wind (unclamped here)', () => {
    const on = crestWith(breakOptions(field, DEFAULT_BREAK_PARAMS, -8)).intensity, off = crestWith(breakOptions(field, DEFAULT_BREAK_PARAMS, 8)).intensity;
    if (on > 0 && off < 2) expect(off - on).toBeCloseTo(0.5, 6);
    else expect(off).toBeGreaterThan(on);
  });
  it('a heavier intensity drains the water in front deeper', () => {
    const o = breakOptions(field, DEFAULT_BREAK_PARAMS);
    expect(lowestAhead({ ...o, force: { intensity: 2 } })).toBeLessThan(lowestAhead({ ...o, force: { intensity: 0 } }) - 0.3);
  });
  it('the dial at 0 ignores the draw; at 0.3 a draw of 1 adds 0.3', () => {
    const o0 = breakOptions(field, DEFAULT_BREAK_PARAMS), o3 = breakOptions(field, { ...DEFAULT_BREAK_PARAMS, randomDial: 0.3 });
    expect(crestWith(o0, { ...w, throwDraw: 1 }).intensity).toBeCloseTo(crestWith(o0, { ...w, throwDraw: -1 }).intensity, 12);
    const a = crestWith(o3, { ...w, throwDraw: 0 }).intensity, b = crestWith(o3, { ...w, throwDraw: 1 }).intensity;
    if (a < 1.7) expect(b - a).toBeCloseTo(0.3, 6);
  });
  it('off the reef grid the crest reads the normal anchor exactly', () => {
    const x = field.grid.x0 - 50, z = 0, f = sampleField(field, x, z);
    const c = crestAt(x, z, f.tau, f, w, ctx, breakOptions(field, DEFAULT_BREAK_PARAMS, 8));
    if (c) expect(c.intensity).toBe(1);
  });
});
```

- [ ] **Step 2: Run and check it fails**

Run: `npx vitest run src/breaker/setWaveModel.test.ts`
Expected: FAIL (`crest.intensity` undefined, `breakOptions` has no third argument).

- [ ] **Step 3: Implement**

In `src/breaker/setWaveModel.ts`:
1. Imports: add `onsetStep` from `./breaking`; add `type BarrelShape, STEP_NORMAL, barrelShape, breakIntensity, withShape` from `./breakIntensity`.
2. Add to `BreakOptions`:

```ts
  /** The wind's offshore speed (m/s; breakIntensity.offshoreSpeed, negative onshore). Absent: 0. */
  offshoreMs?: number;
  /** Tests, calibration and the anchor viewer: every crest takes this intensity (and this shape, if given). */
  force?: { intensity: number; shape?: BarrelShape };
```

3. `breakOptions` becomes:

```ts
export function breakOptions(field: ReefField, params: BreakParams, offshoreMs = 0): BreakOptions {
  const rec = new Float32Array(ONSET_RECORD_LENGTH);
  return { sample: (x, z) => sampleField(field, x, z), params, onset: (x, z) => sampleOnset(field, x, z, rec), offshoreMs };
}
```

4. Add to `Crest`:

```ts
  /** The crest's break intensity [0, 2] (breakIntensity; 1 off the record). */
  intensity: number;
  /** The params its shape uses: o.params with the per-crest keys at its intensity (breakIntensity.withShape). */
  params: BreakParams;
```

5. In `crestAt`, after `const lipH = …`, compute the intensity and the crest's params, and use them in `lifecycle`:

```ts
  // Its break intensity (spec 2026-09-30 §3.2), read on the point's own ray as the time since onset is. Off the record:
  // the normal anchor.
  const intensity = o.force?.intensity ?? (rec
    ? breakIntensity({ step: onsetStep(rec, 0, w.heightM, o.params), offshoreMs: o.offshoreMs ?? 0, periodS: (2 * Math.PI) / w.omega, waveBonus: w.drainBonus ?? 0, throwDraw: w.throwDraw ?? 0 }, o.params)
    : 1);
  const params = withShape(o.params, o.force?.shape ?? barrelShape(intensity));
  const rSlurp = breakingRatio(w.heightM * fc.amp, fc.hminSlurp, o.params);
  const lc = lifecycle(r, tb, localHeight(w, fc), params, rMax, rSlurp);
  return { x: cx, z: cz, f: fc, r, s: lc.stage, tb, lc, confidence, lipH, intensity, params };
```

Delete the old `rSlurp`/`lc`/`return` lines. `STEP_NORMAL` is unused here; don't import it.

6. In `waveAtCrest`, line 296, pass `crest.params` instead of `o.params` as `breakPoint`'s last argument.
7. `crestPileTop` keeps `o.params`: `settledCrestTop` reads only β.

- [ ] **Step 4: Run the tests and the whole breaker suite**

Run: `npx vitest run src/breaker src/whitewater`
Expected: the new tests PASS. Some existing tests that pinned numbers at the old single shape may now fail, because the crest now reads its own intensity (for example, drain depths at the peak). For each failure:
- If the test measures the old fixed shape, pass `force: { intensity: 1, shape: ANCHORS[1] }` in its options, so it measures the normal anchor as before. `ANCHORS[1]` equals today's defaults until Task 6.
- Change nothing else. List every test you changed this way in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/breaker
git commit -m "feat(sheet): each crest reads its break intensity (step, wind, period, drain, dial) and shapes the drain and the pile from it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The lip's stations carry the same intensity (CPU), and the emitters use it

**Files:**
- Modify: `src/breaker/crestTrace.ts` (`Station` lines 32–52, `TraceInput` 56–64, `traceWave` line 125, `fillTimes` 142–165)
- Modify: `src/breaker/BreakingRibbon.ts` (`packStations` line 232)
- Modify: `src/whitewater/sprayEmitters.ts` (lines 228–244: the trace input, `breakOptions`, `profileFrame`)
- Modify: `src/breaker/crestTrace.test.ts`, `src/whitewater/sprayEmitters.test.ts` (if it builds `Station` literals)

**Interfaces:**
- Consumes: Task 4's `crestAt(...).intensity`; `onsetStep`; `breakIntensity`, `barrelShape`, `withShape`, `offshoreSpeed`.
- Produces:
  - `Station.intensity: number`
  - `TraceInput.offshoreMs?: number`
  - `stationIntensity(field, w, x, z, input): number` (exported)
  - `packStations` writes `intensity` at float index 10 of each station's 12

- [ ] **Step 1: Write the failing tests** (in `src/breaker/crestTrace.test.ts`, using its existing field and wave setup)

```ts
it("each station's intensity is the sheet's crest intensity there (the lip lands on water drained for its own shape)", () => {
  const input = { cameraX: 0, cameraZ: 0, params: DEFAULT_BREAK_PARAMS, minHeightM: 0, offshoreMs: 5 };
  const o = breakOptions(field, DEFAULT_BREAK_PARAMS, 5);
  const stations = traceStations(field, [w], t, ctx, input).filter((e): e is Station => !e.gap);
  expect(stations.length).toBeGreaterThan(20);
  let worst = 0;
  for (const s of stations.filter((_, i) => i % 7 === 0)) {
    const c = crestAt(s.x, s.z, t, sampleField(field, s.x, s.z), w, ctx, o);
    if (c) worst = Math.max(worst, Math.abs(c.intensity - s.intensity));
  }
  expect(worst).toBeLessThan(0.05);
});
it('packStations puts the intensity in the third vec4', () => {
  const s: Station = { gap: false, wave: 0, x: 1, z: 2, arc: 0, nx: 1, nz: 0, H: 3, c: 9, r: 1.2, tb: 0.4, intensity: 1.37 };
  const out = new Float32Array(12);
  packStations([s], out);
  expect(out[10]).toBeCloseTo(1.37, 6);
});
```

`t` and `w` are the file's existing peak-breaking time and wave. If the file has none, use the 12 ft biggest wave from Task 4's test and `t = tau(0,0) + 0.5`.

- [ ] **Step 2: Run and check it fails**

Run: `npx vitest run src/breaker/crestTrace.test.ts`
Expected: FAIL (`intensity` missing on `Station`).

- [ ] **Step 3: Implement**

In `src/breaker/crestTrace.ts`:
1. Import `onsetStep` from `./breaking`, and `breakIntensity` from `./breakIntensity`.
2. Add `intensity: number;` to `Station`, documented as: "The crest's break intensity (breakIntensity), as the sheet's crest there (setWaveModel.crestAt): the lip's shape."
3. Add `offshoreMs?: number;` to `TraceInput`, documented as "The wind's offshore speed (m/s; absent 0)."
4. Add:

```ts
/** The station's break intensity: the onset record's step there, as setWaveModel.crestAt reads it; 1 off the record. */
export function stationIntensity(field: ReefField, w: ActiveWave, x: number, z: number, input: TraceInput): number {
  const rec = sampleOnset(field, x, z, onsetScratch);
  if (!rec) return 1;
  return breakIntensity({ step: onsetStep(rec, 0, w.heightM, input.params), offshoreMs: input.offshoreMs ?? 0, periodS: (2 * Math.PI) / w.omega, waveBonus: w.drainBonus ?? 0, throwDraw: w.throwDraw ?? 0 }, input.params);
}
```

5. In `traceWave`'s `side.push({...})`, add `intensity: 1`. `fillTimes` fills it.
6. In `fillTimes`, change the signature to take `input: TraceInput` in place of `p: BreakParams`, and use `input.params` where it used `p`. Then:
   - At each key, set `line[k].intensity = stationIntensity(field, w, line[k].x, line[k].z, input)`.
   - Between two keys, interpolate linearly by `arc`, as `tb` is.
   - Wherever a station falls back to `timeSinceOnset` (the else-branch), also compute its intensity exactly.
   - Update the call in `traceStations` to `fillTimes(field, w, line, ctx, input)`.

In `src/breaker/BreakingRibbon.ts` `packStations`, the last two zeros of the 12 become `s.intensity, 0`.

In `src/whitewater/sprayEmitters.ts` `breakEmitters`:
- Compute `const offshoreMs = offshoreSpeed(i.wind.speedMs, i.wind.fromDeg, ctx.travelX, ctx.travelZ);`.
- Pass `offshoreMs` in the trace input (line 228).
- Use `breakOptions(field, params, offshoreMs)` (line 230).
- Line 244 becomes `profileFrame(base, { H: s.H, c: s.c, r: s.r, tb: s.tb }, withShape(params, barrelShape(s.intensity)))`.
- Import `offshoreSpeed, withShape, barrelShape` from `../breaker/breakIntensity`.

- [ ] **Step 4: Run**

Run: `npx tsc --noEmit -p .` and fix every `Station` literal it reports by adding `intensity: 1`.
Run: `npx vitest run src/breaker src/whitewater`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/breaker src/whitewater
git commit -m "feat(ribbon): each lip station carries its crest's intensity; the emitters' lips use it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Calibrate the three anchors

**Files:**
- Create: `src/breaker/barrelAnchors.test.ts`
- Modify: `src/breaker/breakIntensity.ts` (`ANCHORS`)
- Modify: `src/breaker/breaking.ts` (`DEFAULT_BREAK_PARAMS`: the per-crest keys equal `ANCHORS[1]`)
- Modify: `src/breaker/lipProfile.test.ts`: delete the test "the barrel matches Andrew's photo when the lip lands" (lines 80–97). Its targets are superseded by the spec's anchors, and this task's tests replace it.

**Interfaces:**
- Consumes: `BreakOptions.force` (Task 4), `barrelMetrics`, `buildProfile`, `profileFrame` (existing), `barrelShape`, `withShape`, `ANCHORS`.
- Produces: final `ANCHORS` values; `anchorStation(I, tb, shape?)`, `anchorLanding(I, shape?)`, `anchorMetrics(I, shape?)`, `TARGETS`, `field`, `ctx`, `wave`. All are exported from the test file for Task 7 to import from `./barrelAnchors.test`.

- [ ] **Step 1: Write the anchor tests and the calibration search**

```ts
// src/breaker/barrelAnchors.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, breakingRatio, onsetTime } from './breaking';
import { ANCHORS, type BarrelShape, PER_CREST_BREAK_KEYS, barrelShape, withShape } from './breakIntensity';
import { type ProfileInput, type Vec2, barrelMetrics, buildProfile, crossings, profileFrame } from './lipProfile';
import { computeReefField, sampleField, sampleOnset } from './reefField';
import { type ActiveWave, type BreakOptions, breakOptions, localHeight, sumWaves } from './setWaveModel';

// The spec's anchors (2026-09-30 §3.3): measured at the lip's landing on the peak for the biggest 12 ft set wave.
export const TARGETS = [
  { tubeRatio: 2.0, landAhead: 1.0, rootThickness: 0.1, troughBelow: 0.2, pileSurge: 0 },
  { tubeRatio: 1.3, landAhead: 1.7, rootThickness: 0.2, troughBelow: 0.55, pileSurge: 0.3 },
  { tubeRatio: 1.1, landAhead: 2.0, rootThickness: 0.3, troughBelow: 0.7, pileSurge: 0.45 },
] as const;

export const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
export const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const c12 = cloneConditions(DEFAULT_CONDITIONS); c12.swell.sizeFt = 12;
export const BIG12 = wavesOfSet(1, c12, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
export const wave: ActiveWave = { arrivalS: 0, heightM: BIG12.heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };

const P = DEFAULT_BREAK_PARAMS;
const f00 = sampleField(field, 0, 0);
/** The peak's ray: s metres along it from the peak. */
const onRay = (s: number) => ({ x: f00.dirX * s, z: f00.dirZ * s });
/** The time since onset the record gives at s on the peak's ray (null before the section breaks). */
const tbAlong = (s: number): number | null => { const p = onRay(s); const rec = sampleOnset(field, p.x, p.z); return rec ? onsetTime(rec, 0, wave.heightM, P) : null; };
/** Where on the peak's ray the section has been broken for tb seconds as the crest gets there (bisection: tb grows along the ray after onset). */
function sAtTb(tb: number): number {
  let lo = -60, hi = 60;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2, v = tbAlong(mid); if (v === null || v < tb) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * The cross-section at intensity I (forced on the sheet and the lip), on the peak's ray at the crest point whose section
 * has been broken for tb seconds, at the moment the crest is there: the sheet and the lip on one clock, as in the game
 * (the ribbon's stations sit on the crest and read tb there). tb null: 40 m up the ray, before it breaks.
 */
export function anchorStation(I: number, tb: number | null, shape: BarrelShape = barrelShape(I)) {
  const sheet: BreakOptions = { ...breakOptions(field, P), force: { intensity: I, shape } };
  const flat: BreakOptions = { ...sheet, pile: false };
  const s0 = tb === null ? -40 : sAtTb(tb), p0 = onRay(s0);
  const f0 = sampleField(field, p0.x, p0.z), t = f0.tau;
  const along = (o: BreakOptions) => (u: number): Vec2 => {
    const x = p0.x + f0.dirX * u, z = p0.z + f0.dirZ * u, s = sumWaves(x, z, t, sampleField(field, x, z), [wave], ctx, o);
    return [u + s.dx * f0.dirX + s.dz * f0.dirZ, s.eta];
  };
  const input: ProfileInput = { H: localHeight(wave, f0), c: ctx.omega / f0.k, r: breakingRatio(wave.heightM * f0.amp, f0.hminBreak, P), tb: tb === null ? null : tbAlong(s0) };
  return { base: along(sheet), frameBase: along(flat), input, lip: withShape(P, shape), s0 };
}

/** The lip's landing time at intensity I: the station where tb equals its own τ_land (three fixed-point steps from 1 s). */
export function anchorLanding(I: number, shape: BarrelShape = barrelShape(I)): number {
  let tb = 1;
  for (let i = 0; i < 3; i++) { const st = anchorStation(I, tb, shape); tb = profileFrame(st.frameBase, st.input, st.lip).tauLand; }
  return tb;
}

/** The barrel's metrics at the lip's landing for intensity I (or a trial shape). */
export function anchorMetrics(I: number, shape: BarrelShape = barrelShape(I)) {
  const s = anchorStation(I, anchorLanding(I, shape), shape);
  return { ...barrelMetrics(buildProfile(s.base, s.input, s.lip, s.frameBase), s.input.H), pileSurge: shape.pileSurge };
}

describe('the anchors (spec 2026-09-30 §3.3)', () => {
  for (const k of [0, 1, 2] as const) {
    it(`anchor ${k} reproduces its row`, () => {
      const m = anchorMetrics(k), tgt = TARGETS[k];
      console.log(`anchor ${k}: ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([a, v]) => [a, +(+v).toFixed(3)])))}`);
      expect(Math.abs(m.tubeRatio - tgt.tubeRatio), 'tube width ÷ height').toBeLessThanOrEqual(0.15);
      for (const key of ['landAhead', 'rootThickness', 'troughBelow'] as const) expect(Math.abs(m[key] - tgt[key]), key).toBeLessThanOrEqual(0.1 * tgt[key]);
      expect(m.pileSurge).toBe(tgt.pileSurge);
      expect(m.tipRatio).toBeCloseTo(0.4, 2);
    });
  }
  it('the lip never crosses itself anywhere from gentle to heavy, before it lands', () => {
    for (const I of [0, 0.5, 1, 1.5, 2]) {
      const tau = anchorLanding(I);
      for (const frac of [0.05, 0.25, 0.5, 0.75, 0.95, 0.999]) {
        const s = anchorStation(I, frac * tau);
        expect(crossings(buildProfile(s.base, s.input, s.lip, s.frameBase).points), `I ${I} frac ${frac}`).toBe(0);
      }
    }
  });
  it("the defaults' per-crest keys are the normal anchor", () => {
    for (const key of PER_CREST_BREAK_KEYS) expect(DEFAULT_BREAK_PARAMS[key]).toBe(ANCHORS[1][key]);
  });
});

/**
 * The calibration search (run once: CALIBRATE=1 npx vitest run src/breaker/barrelAnchors.test.ts). Each input steers
 * one metric (throw → landAhead, lipThickness → rootThickness, troughDrain → troughBelow, wallBack → tubeRatio); rounds
 * of bisection on each in turn, the others held, until all four sit within their tolerance. Prints the ANCHORS literal.
 */
describe.skipIf(!process.env.CALIBRATE)('calibrate the anchors', () => {
  it('finds each anchor', { timeout: 3_600_000 }, () => {
    const knobs = [
      { key: 'throwStrength', metric: 'landAhead', lo: 0.1, hi: 1.5, up: true },
      { key: 'lipThickness', metric: 'rootThickness', lo: 0.03, hi: 0.4, up: true },
      { key: 'troughDrain', metric: 'troughBelow', lo: 0, hi: 1, up: true },
      { key: 'wallBack', metric: 'tubeRatio', lo: -0.3, hi: 0.5, up: true },
    ] as const;
    const found: BarrelShape[] = [];
    for (const k of [0, 1, 2] as const) {
      const s: BarrelShape = { ...ANCHORS[k], pileSurge: TARGETS[k].pileSurge };
      for (let round = 0; round < 6; round++) {
        for (const kn of knobs) {
          let lo: number = kn.lo, hi: number = kn.hi;
          for (let it = 0; it < 18; it++) {
            const mid = (lo + hi) / 2;
            const m = anchorMetrics(k, { ...s, [kn.key]: mid })[kn.metric];
            if ((m < TARGETS[k][kn.metric]) === kn.up) lo = mid; else hi = mid;
          }
          s[kn.key] = +((lo + hi) / 2).toFixed(4);
        }
      }
      console.log(`anchor ${k}: ${JSON.stringify(s)} → ${JSON.stringify(anchorMetrics(k, s))}`);
      found.push(s);
    }
    console.log(`export const ANCHORS: readonly [BarrelShape, BarrelShape, BarrelShape] = ${JSON.stringify(found)};`);
  });
});
```

If `wallBack` moves `tubeRatio` the other way (the search log shows it going away from the target), set `up: false` for that knob and rerun. Check the direction from the first round's printed metrics.

- [ ] **Step 2: Run the anchor tests and check they fail**

Run: `npx vitest run src/breaker/barrelAnchors.test.ts`
Expected: the "anchor k reproduces its row" tests FAIL (the first-guess anchors), and the crossings and defaults tests PASS.

- [ ] **Step 3: Run the calibration**

Run: `CALIBRATE=1 npx vitest run src/breaker/barrelAnchors.test.ts -t "finds each anchor"`. In PowerShell: `$env:CALIBRATE=1; npx vitest run …`.
Expected: three `anchor k:` lines, each with its metrics inside tolerance, then an `export const ANCHORS …` line.

If an anchor can't reach its row, the metrics printed after 6 rounds are still outside tolerance. Don't loosen the tolerance. Stop and report the closest shape and its metrics, because the anchor's target needs a ruling from Andrew.

- [ ] **Step 4: Put the calibrated values in**

Replace `ANCHORS` in `breakIntensity.ts` with the printed literal, formatted one anchor per line, and update its doc comment to "calibrated 2026-09-30 by barrelAnchors.test.ts". In `DEFAULT_BREAK_PARAMS`, set `throwStrength`, `lipThickness`, `wallBack`, `troughDrain` and `pileSurge` to `ANCHORS[1]`'s values, as literals.

- [ ] **Step 5: Run the anchors and the whole suite**

Run: `npx vitest run src/breaker/barrelAnchors.test.ts` and expect PASS.
Run: `npx vitest run` and expect PASS. Tests that forced `ANCHORS[1]` in Task 4 now measure the calibrated normal anchor. Where one of them pins an old number (for example "lands 1.1–1.3 H"), the anchor tests now own that measurement: delete the pin and say so in the commit.

- [ ] **Step 6: Commit**

```bash
git add src/breaker
git commit -m "feat(intensity): the three anchors calibrated against the spec's side-on targets; the old single-shape barrel test retired

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The side-on and front-on drawings for Andrew, then stop for his sign-off

**Files:**
- Create: `src/breaker/anchorViewer.test.ts`

**Interfaces:**
- Consumes: `anchorStation`, `anchorLanding`, `field`, `ctx`, `wave`, `TARGETS` (Task 6); `traceStations` (Task 5); `profileFrame`, `buildProfile`, `sumWaves`, `breakOptions` with `force` (Task 4).
- Reads (not in git, the main checkout's `reference/wave/traces/`):
  - `andrew-target-1s.json`: an array of [u, y] points, the crest at u = 0.
  - `t7.json`: the cyan tube's mouth in photo pixels, keys `mouth` and `water`.
  - `t10.json` and `t8.json`: front-on lip edges, keys `edge`, `crest` and `base`.

- [ ] **Step 1: Write the viewer** (it runs only when `ANCHOR_VIEW_OUT` is set)

```ts
// src/breaker/anchorViewer.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, GRAVITY_MS2 } from './breaking';
import { barrelShape, withShape } from './breakIntensity';
import { type Station, traceStations } from './crestTrace';
import { type ProfileFrame, type Vec2, buildProfile, profileFrame } from './lipProfile';
import { sampleField } from './reefField';
import { type BreakOptions, breakOptions, sumWaves } from './setWaveModel';
import { TARGETS, anchorLanding, anchorStation, ctx, field, wave } from './barrelAnchors.test';

const OUT = process.env.ANCHOR_VIEW_OUT ?? '';
const TRACES = process.env.TRACE_DIR ?? 'C:/Dev/andrew-dev-personal-projects/liquid-dreaming/reference/wave/traces';
const read = (f: string) => JSON.parse(readFileSync(join(TRACES, f), 'utf-8'));
const NAMES = ['gentle', 'normal', 'heavy'];

/** An SVG panel mapping (u, y) metres at PX px per metre over the given ranges, with a still-water line. */
function panel(U0: number, U1: number, Y0: number, Y1: number, PX: number, body: (X: (u: number) => string, Y: (y: number) => string) => string): string {
  const X = (u: number) => ((u - U0) * PX).toFixed(1), Y = (y: number) => ((Y1 - y) * PX).toFixed(1);
  const W = (U1 - U0) * PX, H = (Y1 - Y0) * PX;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f3f6f8"/>${body(X, Y)}<line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#c33" stroke-dasharray="4 4"/></svg>`;
}
const line = (X: (u: number) => string, Y: (y: number) => string, pts: Vec2[]) => 'M' + pts.map((p) => `${X(p[0])},${Y(p[1])}`).join('L');
/** The lip tip's height: the outer arc at its tip (lipProfile's outer at sigma = 1). */
const tipY = (f: ProfileFrame) => f.K[1] - 0.5 * GRAVITY_MS2 * (f.reach / Math.max(f.vj, 1e-6)) ** 2;

describe.skipIf(!OUT)('anchor drawings', () => {
  it('draws the three anchors side on and the lip end front on', { timeout: 900_000 }, () => {
    const target: Vec2[] = read('andrew-target-1s.json');
    const t7 = read('t7.json');
    const sides: string[] = [];
    for (const I of [0, 1, 2]) {
      const tau = anchorLanding(I);
      for (const dt of [-0.5, 0, 0.5]) {
        const s = anchorStation(I, tau + dt);
        const prof = buildProfile(s.base, s.input, s.lip, s.frameBase), f = prof.frame;
        const sea: Vec2[] = [];
        for (let u = -20; u <= 30; u += 0.25) sea.push(s.base(u));
        const tg = TARGETS[I];
        sides.push(`<figure><figcaption><b>${NAMES[I]} (${I})</b>, ${dt === 0 ? 'the lip landing' : `${dt > 0 ? '+' : ''}${dt} s from landing`}. Target: tube ${tg.tubeRatio}, lands ${tg.landAhead} H, lip ${tg.rootThickness} H, trough ${tg.troughBelow} H.</figcaption>${panel(-20, 30, -8, 11, 16, (X, Y) => {
          let overlay = '';
          if (I === 1 && dt === 0) overlay = target.map(([u, y]) => `<circle cx="${X(u)}" cy="${Y(y)}" r="1.2" fill="#ff7a00" fill-opacity="0.55"/>`).join('');
          if (I === 2 && dt === 0) {
            // The cyan tube's mouth, mirrored (its wall is on the right in the photo), scaled to this tube's height (the
            // foot F to the lip's root R), its back wall on this tube's wall W and its floor on the foot.
            const m: [number, number][] = t7.mouth, floor: number = t7.water[0][1];
            const wallPx = Math.max(...m.map((p) => p[0])), ceilPx = Math.min(...m.map((p) => p[1]));
            const sc = (f.R[1] - f.F[1]) / (floor - ceilPx);
            overlay = `<path d="${line(X, Y, m.map(([px, py]) => [f.W[0] + (wallPx - px) * sc, f.F[1] + (floor - py) * sc]))}" fill="none" stroke="#e0249a" stroke-width="3"/>`;
          }
          return `<path d="${line(X, Y, sea)}L${X(30)},${Y(-8)}L${X(-20)},${Y(-8)}Z" fill="#1f4e9c"/><path d="${line(X, Y, prof.points)}" fill="#6fb6de" fill-opacity="0.85" stroke="#bdf0f7" stroke-width="1.4"/>${overlay}`;
        })}</figure>`);
      }
    }

    // Front on: 1 s after the peak's lip lands, every station along the crest (1 m apart) with its own cross-section at
    // intensity I: its crest top, its lip tip and the lowest water in front, against the arc along the crest. The two
    // photos' lip edges are scaled to the face (crest top to lowest water), their feet where the tip meets the water.
    const t10 = read('t10.json'), t8 = read('t8.json');
    const photoEdge = (t: { edge: [number, number][]; crest: [number, number][] }, basePx: number): Vec2[] => {
      const crestPx = Math.min(...t.crest.map((p) => p[1])), x0 = Math.min(...t.edge.map((p) => p[0]));
      return t.edge.map(([px, py]) => [(px - x0) / (basePx - crestPx), (basePx - py) / (basePx - crestPx)]); // in face heights
    };
    const edges = { dark: photoEdge(t10, 470), sunset: photoEdge(t8, 420) };
    const fronts: string[] = [];
    for (const I of [1, 2]) {
      const t = sampleField(field, 0, 0).tau + anchorLanding(I) + 1;
      const opts: BreakOptions = { ...breakOptions(field, DEFAULT_BREAK_PARAMS), force: { intensity: I } };
      const flat: BreakOptions = { ...opts, pile: false };
      const lip = withShape(DEFAULT_BREAK_PARAMS, barrelShape(I));
      const stations = traceStations(field, [wave], t, ctx, { cameraX: 0, cameraZ: 0, params: DEFAULT_BREAK_PARAMS, minHeightM: 0, spacingM: 1 }).filter((e): e is Station => !e.gap);
      const rows = stations.map((s) => {
        const along = (o: BreakOptions) => (u: number): Vec2 => {
          const x = s.x + s.nx * u, z = s.z + s.nz * u, r = sumWaves(x, z, t, sampleField(field, x, z), [wave], ctx, o);
          return [u + r.dx * s.nx + r.dz * s.nz, r.eta];
        };
        const fr = profileFrame(along(flat), { H: s.H, c: s.c, r: s.r, tb: s.tb }, lip);
        let low = Infinity;
        for (let u = 0; u <= 25; u += 0.5) low = Math.min(low, along(opts)(u)[1]);
        return { v: s.arc, crest: fr.K[1], tip: s.tb === null ? fr.K[1] : tipY(fr), low, landed: s.tb !== null && s.tb >= fr.tauLand };
      });
      // The foot: the first station, from the unbroken side (its stations have no time since onset), whose lip has landed.
      const unbrokenFirst = stations.length > 0 && stations[0].tb === null;
      const ordered = unbrokenFirst ? rows : [...rows].reverse();
      const foot = ordered.find((r) => r.landed) ?? ordered[ordered.length - 1];
      const face = Math.max(...rows.map((r) => r.crest)) - Math.min(...rows.map((r) => r.low));
      const dir = unbrokenFirst ? -1 : 1; // the photo edge rises toward the unbroken side
      const photo = (e: Vec2[]): Vec2[] => e.map(([a, b]) => [foot.v + dir * a * face, foot.low + b * face]);
      const vs = rows.map((r) => r.v);
      fronts.push(`<figure><figcaption><b>${NAMES[I]} (${I})</b> from in front: dark line the crest top, blue the lip tip, grey the lowest water in front. The photos' lip edges are scaled to this ${face.toFixed(1)} m face: navy the dark tube (0.66 face heights along the line), orange the sunset lip (0.94). True scale.</figcaption>${panel(Math.min(...vs) - 5, Math.max(...vs) + 5, -6, 10, 6, (X, Y) =>
        `<path d="${line(X, Y, rows.map((r) => [r.v, r.crest]))}" fill="none" stroke="#0b1d40" stroke-width="2"/>` +
        `<path d="${line(X, Y, rows.map((r) => [r.v, r.tip]))}" fill="none" stroke="#2f7fb8" stroke-width="2"/>` +
        `<path d="${line(X, Y, rows.map((r) => [r.v, r.low]))}" fill="none" stroke="#888" stroke-width="1"/>` +
        `<path d="${line(X, Y, photo(edges.dark))}" fill="none" stroke="#0b3a5c" stroke-width="3"/>` +
        `<path d="${line(X, Y, photo(edges.sunset))}" fill="none" stroke="#c9771d" stroke-width="3"/>`)}</figure>`);
    }
    writeFileSync(OUT, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Barrel Anchors</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:16px;background:#fff;color:#222}figure{margin:0 0 14px}svg{max-width:100%;height:auto;border:1px solid #ccc;display:block}</style>
<h2>The three anchors side on</h2><p>The biggest 12 ft wave on the peak's ray, crest at 0 m, true scale, at the crest point whose lip is landing. Orange dots on the normal landing: Andrew's 29 Sep markup. Magenta on the heavy landing: the cyan tube's mouth, scaled to this tube.</p>
${sides.join('\n')}<h2>From in front: the end of the lip where it peels</h2>${fronts.join('\n')}</html>`);
  });
});
```

- [ ] **Step 2: Run the viewer and look at it**

Run (PowerShell): `$env:ANCHOR_VIEW_OUT="C:/Users/Andre/AppData/Local/Temp/anchors.html"; npx vitest run src/breaker/anchorViewer.test.ts`
Expected: the file is written. Open it in the built-in browser (`file:///…`) and check the following yourself before showing Andrew:
- The heavy tube is roughly as wide as tall, with a flat ceiling.
- The gentle tube is long and low.
- The normal tube sits near the orange markup, except that its wall rises under the crest.
- The front-on lip edge falls from crest to water over roughly 0.66–0.94 face heights.

Note anything that doesn't hold.

- [ ] **Step 3: Commit the viewer**

```bash
git add src/breaker/anchorViewer.test.ts
git commit -m "test(anchors): side-on and front-on drawings of the three anchors over Andrew's traces (ANCHOR_VIEW_OUT)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: STOP. Andrew's sign-off gate (spec §4 "By eye, before any tuning")**

Send Andrew the HTML with SendUserFile, with a short note on what matches and what doesn't. Wait for his mark-up. Then:
- If he asks for changes to an anchor's target, change `TARGETS` in `barrelAnchors.test.ts` (and the spec's §3.3 table, in the same commit), rerun Task 6 Steps 3–5, and redraw.
- Don't start Task 8 until he signs off the drawings.

---

### Task 8: The GPU sheet reads intensity

**Files:**
- Create: `src/breaker/breakIntensityNodes.ts`
- Modify: `src/breaker/breakingNodes.ts` (`createBreakUniforms`, `updateBreakUniforms`, `lifecycleNode`, `breakPointNode`; add `onsetStepNode`)
- Modify: `src/breaker/SetWaves.ts` (the step texture, `sampleOnset`, the wave record, the offshore uniform, `sumBreaking`)
- Modify: `src/breaker/breaker.selftest.ts`

**Interfaces:**
- Consumes: `ANCHORS`, `STEP_POINTS`, `STEP_MIN`, `STEP_MAX`, `WIND_*`, `PERIOD_*`, `INTENSITY_MAX` (Task 1); `ONSET_STEP_OFFSET` (Task 2); `ActiveWave.drainBonus` and `ActiveWave.throwDraw` (Task 3).
- Produces:
  - `stepToIntensityNode(step: N): N`
  - `breakIntensityNode(i: { step: N; offshoreMs: N; periodS: N; waveBonus: N; throwDraw: N }, u: { intensityNudge: N; randomDial: N }): N`
  - `barrelShapeNode(I: N): { throwStrength: N; lipThickness: N; wallBack: N; troughDrain: N; pileSurge: N }`
  - `onsetStepNode(stepLo: N, stepHi: N, level: { lq: N; k: N }): N`
  - `SetWaves.setOffshore(ms: number)`
  - `lifecycleNode(..., u, sh?: { drainGrowth: N; pileSurge: N })`
  - `breakPointNode(..., pc?, sh?: { troughDrain: N })`

- [ ] **Step 1: Measure the performance baseline, before any GPU change**

Start the preview (`liquid-dreams-barrel`, port 5174). Pick the `barrel-peeling` moment, set the swell to 12 ft, and wait 10 s. Read the GPU panel's median, and write down the number and the time; it goes in the Task 11 report. Stop the preview if Andrew isn't using it.

- [ ] **Step 2: Write the GPU mirror of the rules**

```ts
// src/breaker/breakIntensityNodes.ts
import { clamp, float, mix, select, smoothstep } from 'three/tsl';
import { ANCHORS, INTENSITY_MAX, PER_CREST_BREAK_KEYS, PERIOD_MID_S, PERIOD_SPAN_S, PERIOD_WEIGHT, STEP_MAX, STEP_MIN, STEP_POINTS, WIND_FULL_MS, WIND_WEIGHT } from './breakIntensity';

type N = any;

/** The TSL mirror of breakIntensity.ts, term by term (the self-tests check it against the CPU). */
export function stepToIntensityNode(step: N): N {
  const s = clamp(float(step), STEP_MIN, STEP_MAX);
  const [[s0, i0], [s1, i1], [s2, i2]] = STEP_POINTS;
  return select(s.lessThanEqual(s1), s.sub(s0).mul((i1 - i0) / (s1 - s0)).add(i0), s.sub(s1).mul((i2 - i1) / (s2 - s1)).add(i1));
}

export function breakIntensityNode(i: { step: N; offshoreMs: N; periodS: N; waveBonus: N; throwDraw: N }, u: { intensityNudge: N; randomDial: N }): N {
  const I = stepToIntensityNode(i.step)
    .add(clamp(float(i.offshoreMs).div(WIND_FULL_MS), -1.0, 1.0).mul(WIND_WEIGHT))
    .add(clamp(float(i.periodS).sub(PERIOD_MID_S).div(PERIOD_SPAN_S), -1.0, 1.0).mul(PERIOD_WEIGHT))
    .add(i.waveBonus).add(u.randomDial.mul(i.throwDraw)).add(u.intensityNudge);
  return clamp(I, 0.0, INTENSITY_MAX);
}

/** barrelShape: anchor k at k, smoothstep-eased between neighbours. */
export function barrelShapeNode(intensity: N): Record<(typeof PER_CREST_BREAK_KEYS)[number], N> {
  const I = clamp(float(intensity), 0.0, INTENSITY_MAX);
  const upper = I.greaterThanEqual(1.0);
  const t = smoothstep(0.0, 1.0, select(upper, I.sub(1.0), I));
  const out = {} as Record<(typeof PER_CREST_BREAK_KEYS)[number], N>;
  for (const key of PER_CREST_BREAK_KEYS) {
    out[key] = select(upper, mix(float(ANCHORS[1][key]), float(ANCHORS[2][key]), t), mix(float(ANCHORS[0][key]), float(ANCHORS[1][key]), t));
  }
  return out;
}
```

- [ ] **Step 3: Thread the per-crest shape through the sheet's nodes**

In `src/breaker/breakingNodes.ts`:
1. `createBreakUniforms`: add `intensityNudge: uniform(0), randomDial: uniform(0)`. `updateBreakUniforms`: `u.intensityNudge.value = p.intensityNudge; u.randomDial.value = p.randomDial;`.
2. `lifecycleNode(r, hasRecord, broken, tb, rMax, H, rSlurp, u, sh?: { drainGrowth: N; pileSurge: N })`:
   - `const drainGrowth = sh?.drainGrowth ?? u.drainGrowth, pileSurge = sh?.pileSurge ?? u.pileSurge;`
   - Replace `u.drainGrowth` in `land` with `drainGrowth`, and `u.pileSurge` in `surgeWeight` with `pileSurge`.
3. `breakPointNode(i, steep, u, curves, pc?, sh?: { troughDrain: N })`:
   - `const depth = (sh?.troughDrain ?? u.troughDrain).mul(u.delta).mul(i.H).mul(drain);`
4. Add:

```ts
/** breaking.onsetStep from the record's pair at level k (texel k holds (step_k, step_{k+1})): w = clamp(lq − k, 0, 1). */
export function onsetStepNode(stepLo: N, stepHi: N, level: { lq: N; k: N }): N {
  return mix(stepLo, stepHi, clamp(level.lq.sub(level.k), 0.0, 1.0));
}
```

- [ ] **Step 4: The step texture, the wave record and the offshore uniform in `SetWaves`**

1. Add `const STEP_TEXELS = ONSET_LEVELS - 1;`. Add a field `private readonly onsetStepTex = floatTexture(FIELD_NX * STEP_TEXELS, FIELD_NZ);`. In `setField`, after the onset copy:

```ts
    const sd = this.onsetStepTex.image.data as Float32Array;
    for (let i = 0; i < f.tau.length; i++) {
      const col = i % FIELD_NX, row = (i - col) / FIELD_NX, r = i * ONSET_RECORD_LENGTH + ONSET_STEP_OFFSET;
      for (let k = 0; k < STEP_TEXELS; k++) {
        const o = ((row * FIELD_NX + col) * STEP_TEXELS + k) * 4;
        sd[o] = f.onset[r + k]; sd[o + 1] = f.onset[r + k + 1];
      }
    }
```

   Add `this.onsetStepTex` to the `needsUpdate` list.

2. `sampleOnset(xz, k)` also returns `stepLo` and `stepHi`: the bilinear of texel `(i0.x + dx)·STEP_TEXELS + int(k)` at row `i0.y + dz`, taking `.x` and `.y`. Reuse `t` and `i0`:

```ts
    const stepTexel = (() => {
      const kk = int(k);
      const load = (dx: number, dz: number): N => textureLoad(this.onsetStepTex, ivec2(i0.x.add(dx).mul(STEP_TEXELS).add(kk), i0.y.add(dz)), int(0));
      return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y).toVar();
    })();
    return { inside, run, tbLo: …, ampLo: …, tbHi: …, ampHi: …, stepLo: stepTexel.x, stepHi: stepTexel.y };
```

3. The wave record grows to three vec4s:
   - `wavesAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_ACTIVE_WAVES * 12), 4)` and `waves = storage(this.wavesAttr, 'vec4', MAX_ACTIVE_WAVES * 3)`.
   - In `setEvents`, write the slots at `i * 12`, `i * 12 + 4`, and `i * 12 + 8` = `w ? [w.drainBonus ?? 0, w.throwDraw ?? 0, 0, 0] : [0, 0, 0, 0]`.
   - `canBreakFlag` and `longTailFlag` read `slot * 12 + 7`.
   - In `sumBreaking`: `a = this.waves.element(i.mul(3))`, `b = … i.mul(3).add(1)`, `cW = … i.mul(3).add(2)`.
4. Add `private readonly offshoreMs = uniform(0);` and `setOffshore(ms: number): void { this.offshoreMs.value = ms; }`.
5. In `sumBreaking`:
   - Next to `pc` and `lipH`, declare `const shTrough = float(DEFAULT_BREAK_PARAMS.troughDrain).toVar(), shSurge = float(DEFAULT_BREAK_PARAMS.pileSurge).toVar();`.
   - Inside `If(breaking)`, after `const rec = this.sampleOnset(on, level.k);`:

```ts
            // The crest's break intensity (setWaveModel.crestAt): 1 off the record.
            const I = select(rec.inside, breakIntensityNode({ step: onsetStepNode(rec.stepLo, rec.stepHi, level), offshoreMs: this.offshoreMs, periodS: float(2 * Math.PI).div(a.z), waveBonus: cW.x, throwDraw: cW.y }, brk), float(1.0));
            const shape = barrelShapeNode(I);
            shTrough.assign(shape.troughDrain); shSurge.assign(shape.pileSurge);
```

   - Pass `{ drainGrowth: shTrough.mul(brk.delta).add(1.0), pileSurge: shSurge }` as `lifecycleNode`'s last argument, and `{ troughDrain: shTrough }` as `breakPointNode`'s last argument.

- [ ] **Step 5: Extend the GPU self-test**

In `src/breaker/breaker.selftest.ts`, add a third entry to `PARAM_SETS`: `['wind', { ...DEFAULT_BREAK_PARAMS, randomDial: 0.3, intensityNudge: 0.2 }]`. In the loop, set the offshore speed per set: 6 m/s for `'wind'`, 0 otherwise. Call `sets.setOffshore(offshore)` and build `o = breakOptions(field, params, offshore)`. The events come from `wavesNear` and carry real `throwDraw` and `gapS`.

Add a new self-test comparing the step:

```ts
registerSelfTest({
  name: 'breaker: GPU onset step matches the CPU (the pair texture, level interpolation)',
  async run(renderer) {
    const field = getField();
    const sets = new SetWaves(uniform(0));
    sets.setField(field);
    const points = [...peakRay(field), ...OFF_RAY];
    const h = REF_BIGGEST.heightM;
    const { pass, outAttr } = computeAt(points, 1, (xz) => [vec4(sets.onsetStepAt(xz, float(h)), 0.0, 0.0, 0.0)]);
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    points.forEach(([x, z], i) => { const rec = sampleOnset(field, x, z); if (rec) worst = Math.max(worst, Math.abs(out[i * 4] - onsetStep(rec, 0, h, DEFAULT_BREAK_PARAMS))); });
    return { pass: worst < 1e-3, detail: `${points.length} points; worst |Δstep| ${worst.toFixed(5)}` };
  },
});
```

It needs a small public helper on `SetWaves`, for self-tests:

```ts
  /** The onset record's step at xz for a wave of deep-water height heightM (self-tests). Inside an Fn. */
  onsetStepAt(xz: N, heightM: N): N {
    const level = onsetLevelNode(heightM, this.brk);
    const rec = this.sampleOnset(xz, level.k);
    return onsetStepNode(rec.stepLo, rec.stepHi, level);
  }
```

- [ ] **Step 6: Run the CPU suite, the limits test and the GPU self-tests**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/breaker`
Expected: PASS, including `BreakingRibbon.limits.test.ts`. The step texture adds one sampled texture to the passes that sample the sheet. If the limits test reports a count over its limit, stop and report: the pair texture then has to be merged into the existing onset texture instead.

Start the preview and open `http://localhost:5174/?selftest=breaker`.
Expected: every `breaker:` test passes, including the new step test and the `wind` param set.

- [ ] **Step 7: Commit**

```bash
git add src/breaker
git commit -m "feat(sheet, GPU): the crest's break intensity on the GPU (the step texture, each wave's bonus and draw, the offshore wind), mirrored term by term

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The GPU lip reads each station's intensity

**Files:**
- Modify: `src/breaker/lipProfileNodes.ts` (`createLipUniforms`: add `delta`; `profileFrameNode`: an optional shape)
- Modify: `src/breaker/BreakingRibbon.ts` (`buildFramePass`, lines 609–630)
- Modify: `src/breaker/ribbon.selftest.ts` ("GPU profile matches lipProfile")

**Interfaces:**
- Consumes: `barrelShapeNode` (Task 8); the station's intensity at float 10 (`stations.element(i·3 + 2).z`, Task 5).
- Produces: `profileFrameNode(baseAt, input, u, shape?: { throwStrength: N; lipThickness: N; wallBack: N; drainGrowth: N })`

- [ ] **Step 1: Let the frame take a per-station shape**

In `lipProfileNodes.ts`:
1. `createLipUniforms` adds `delta: uniform(1)`, and `updateLipUniforms` sets `u.delta.value = p.delta;`.
2. `profileFrameNode(baseAt, input, u, shape?)` opens with:

```ts
  const throwS = shape?.throwStrength ?? u.throwStrength, thick = shape?.lipThickness ?? u.lipThickness;
  const wallBack = shape?.wallBack ?? u.wallBack, drainGrowth = shape?.drainGrowth ?? u.drainGrowth;
```

   Then replace `u.throwStrength` (two places), `u.lipThickness` (two), `u.wallBack` (one) and `u.drainGrowth` (one) with those.

- [ ] **Step 2: The frame pass reads the station's intensity**

In `BreakingRibbon.buildFramePass`, after `b`:

```ts
      const cS = stations.element(i.mul(STATION_VEC4S).add(2)).toVar();
      const shape = barrelShapeNode(cS.z);
      const f = profileFrameNode(baseAt, { H: b.x, c: b.y, r: b.z, tb: b.w }, this.lip, {
        throwStrength: shape.throwStrength, lipThickness: shape.lipThickness, wallBack: shape.wallBack,
        drainGrowth: shape.troughDrain.mul(this.lip.delta).add(1.0),
      });
```

This replaces the existing `profileFrameNode` call. Import `barrelShapeNode`.

- [ ] **Step 3: Extend the ribbon self-test**

In `ribbon.selftest.ts` "GPU profile matches lipProfile":
- Wherever it builds its stations, give them intensities 0, 1.3 and 2 in turn (`intensity: [0, 1.3, 2][n % 3]`).
- Build the CPU reference with `withShape(params, barrelShape(s.intensity))` in place of `params`.

- [ ] **Step 4: Run**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/breaker`, and expect PASS.
Open `http://localhost:5174/?selftest=ribbon`. Expected: every `ribbon:` test passes.

- [ ] **Step 5: Commit**

```bash
git add src/breaker
git commit -m "feat(ribbon, GPU): each station's lip takes its own shape from its intensity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Wiring in the app, the Break panel and the readout

**Files:**
- Modify: `src/app/App.ts` (compute and push the offshore speed; trace input line 637; emitter input line 566; status readout line 1228; `setStatus` line 145)
- Modify: `src/breaker/peakFace.ts` (add `peakIntensity`, `formatPeakIntensity`)
- Modify: `src/dev/DevPanel.ts` (`BREAK_BINDINGS`: drop the per-crest keys and keep the nudge and the dial; the readout next to "face at the peak"; `setStatus` type line 47)
- Modify: `src/dev/DevPanel.test.ts` (its "every numeric BreakParams field" check excludes `PER_CREST_BREAK_KEYS`)
- Modify: `src/dev/devSettings.test.ts`
- Create or modify: `src/breaker/peakFace.test.ts`

**Interfaces:**
- Consumes: `offshoreSpeed`, `PER_CREST_BREAK_KEYS`, `crestAt`, `breakOptions(field, params, offshoreMs)`, `SetWaves.setOffshore`.
- Produces:
  - `peakIntensity(field, events, t, p, offshoreMs): number | null`
  - `formatPeakIntensity(I: number | null, hasField: boolean): string`
  - `App.offshoreMs`

- [ ] **Step 1: Write the failing tests**

```ts
// src/breaker/peakFace.test.ts (add)
it('reads the intensity of the wave at the peak and names it', () => {
  const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 12;
  const events = wavesOfSet(1, c, DEFAULT_SET_PARAMS);
  const big = events.reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const I = peakIntensity(field, events, big.arrivalS, DEFAULT_BREAK_PARAMS, 3)!;
  expect(I).toBeGreaterThanOrEqual(0); expect(I).toBeLessThanOrEqual(2);
  expect(formatPeakIntensity(1.17, true)).toBe('1.17 (normal)');
  expect(formatPeakIntensity(0.3, true)).toBe('0.30 (gentle)');
  expect(formatPeakIntensity(1.8, true)).toBe('1.80 (heavy)');
  expect(formatPeakIntensity(null, true)).toBe('no wave at the peak');
});
```

```ts
// src/dev/devSettings.test.ts (add)
it("a stored look from before the condition-driven barrel (with the old shape sliders) loads, and doesn't set the per-crest shape", () => {
  const p = { ...DEFAULT_BREAK_PARAMS };
  assignParams(p, { ...DEFAULT_BREAK_PARAMS, throwStrength: 1.2, pileSurge: 0.55 } as BreakParams);
  normalizeBreakParams(p);
  expect(Number.isFinite(p.throwStrength)).toBe(true);
  // Every crest's shape comes from its intensity: withShape overwrites whatever the look stored.
  expect(withShape(p, barrelShape(1)).throwStrength).toBe(barrelShape(1).throwStrength);
});
```

Change `DevPanel.test.ts`'s binding check so the expected set of keys excludes `PER_CREST_BREAK_KEYS`.

- [ ] **Step 2: Run and check it fails**

Run: `npx vitest run src/breaker/peakFace.test.ts src/dev`
Expected: FAIL (`peakIntensity` not exported; the panel check sees the per-crest bindings).

- [ ] **Step 3: Implement**

`src/breaker/peakFace.ts`:

```ts
/** The intensity of the wave at the peak now (its crest within half a period of it), as the sheet reads it; null if none. */
export function peakIntensity(field: ReefField | null, events: readonly WaveEvent[], t: number, p: BreakParams, offshoreMs: number): number | null {
  if (!field || !p.enabled) return null;
  const e = events.find((w) => Math.abs(w.arrivalS - t) <= w.periodS / 2);
  if (!e) return null;
  const w = toActiveWave(e), ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const f = sampleField(field, 0, 0);
  return crestAt(0, 0, t, f, w, ctx, breakOptions(field, p, offshoreMs))?.intensity ?? null;
}

/** "1.17 (normal)" for the Sets folder: below 0.5 gentle, from 1.5 heavy. */
export function formatPeakIntensity(I: number | null, hasField: boolean): string {
  if (!hasField) return 'waiting for the reef field';
  if (I === null) return 'no wave at the peak';
  return `${I.toFixed(2)} (${I < 0.5 ? 'gentle' : I < 1.5 ? 'normal' : 'heavy'})`;
}
```

Import `crestAt` and `breakOptions` from `./setWaveModel`.

`src/dev/DevPanel.ts`:
- Remove `throwStrength`, `lipThickness`, `troughDrain`, `pileSurge` and `wallBack` from `BREAK_BINDINGS`. Keep `intensityNudge` and `randomDial`.
- Add `intensity: string` to the `setStatus` type, and after the `face` binding add `sets.addBinding(m.setStatus, 'intensity', { label: 'intensity at the peak', readonly: true, interval: 250 }),`.

`src/app/App.ts`:
- Add `readonly setStatus = { nextSet: '', wave: '', face: '', intensity: '' };` (line 145).
- Add a private `offshoreMs = 0` and a method:

```ts
  /** The wind's offshore speed against the field's swell (breakIntensity.offshoreSpeed), pushed to the GPU sheet. */
  private updateOffshore(): void {
    this.offshoreMs = this.field ? offshoreSpeed(this.conditions.wind.speedMs, this.conditions.wind.directionDeg, this.field.far.dirX, this.field.far.dirZ) : 0;
    this.setWaves.setOffshore(this.offshoreMs);
  }
```

- Call it wherever the field is set (the same place `ribbonMinHeightM` is recomputed, near line 475) and in `onConditionsEdited`.
- Trace input (line 637): add `offshoreMs: this.offshoreMs`. The emitters already get the wind (Task 5).
- Status (line 1228): add `this.setStatus.intensity = formatPeakIntensity(peakIntensity(this.field, events, this.clock.simTime, this.breakParams, this.offshoreMs), this.field !== null);`.

- [ ] **Step 4: Run**

Run: `npx tsc --noEmit -p .` and `npx vitest run`, and expect PASS.
Start the preview and check the Break panel: no throw, lip thickness, trough drain or surge sliders; a nudge and a dial are there. Check the Sets folder shows "intensity at the peak" during a set.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(app): the offshore wind reaches the sheet and the lip; the Break panel's nudge and dial replace the shape sliders; intensity at the peak

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verify in the game, measure, and report

**Files:** none (verification). Update memory afterwards.

- [ ] **Step 1: The whole suite and the self-tests**

Run: `npx tsc --noEmit -p .` and `npx vitest run`, and expect PASS. If a known timeout flakes (`plants.test.ts`, the grazing-swell field test), rerun those files alone and report both runs.
Open `http://localhost:5174/?selftest=breaker` and `?selftest=ribbon`. Expected: all PASS. Copy the summary lines.

- [ ] **Step 2: Performance**

Use the same moment and size as Task 8, Step 1: the GPU median at 12 ft barrel-peeling. Expected: at most +0.2 ms over the baseline. If it's over, profile (the extra texel fetch per wave) and report before changing anything.

- [ ] **Step 3: In the game, by eye**

At 12 ft, take screenshots from the lineup and from the shoulder for each of these, with the wind and swell as the moment sets them:
- the `low-tide-set` moment;
- the `barrel-peeling` moment (mid tide);
- the `high-tide-set` moment;
- `barrel-peeling` again with the wind turned onshore (wind from 225°, 6 m/s).

Check:
- low tide throws visibly heavier than mid, and mid heavier than high;
- onshore lowers the throw;
- "intensity at the peak" reads in that order.

Send the screenshots to Andrew with SendUserFile, next to the anchor drawings from Task 7.

- [ ] **Step 4: Push and report**

Push: `git push origin barrel-and-whitewater`. Don't merge to main; that's Andrew's call.
Report: the test and self-test summaries, the before and after GPU timings, the screenshots, and every test changed or retired and why.
