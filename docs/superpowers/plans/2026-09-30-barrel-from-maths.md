# The Barrel From the Maths — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every crest point's barrel is the one the published equations give for the reef it breaks on: the reef bake
stores ψ₀ per breaking level, the lip builds Pick & Feddersen's tube (Longuet-Higgins' outline) with Feddersen et al.'s
wind factors, the Womb's ledge is softened so conditions move waves between Andrew's states, and the GPU mirrors it all.

**Architecture:**
- `overturn.ts` (new) holds the equations as pure functions: ψ → the tube's area, lip area, width ÷ length and tilt; the
  wind factors; the game rules (drain, dial, nudge); and the sheet's trough drain and surge from ψ.
- `tube.ts` (new) holds the tube's geometry: the LH82 outline in the tube's own axes, its top, its back and its arcs.
- The reef bake writes ψ₀ per breaking level where it wrote the step (same slot, same carry along the rays).
- The crest (`crestAt`) and the lip's stations carry an effective ψ in place of intensity. The sheet reads its trough
  drain and surge from ψ; the lip (`lipProfile.profileFrame`) builds the tube from ψ, H and the wind.
- The GPU mirrors each piece term by term (`SetWaves` for the sheet, `lipProfileNodes` + `BreakingRibbon` for the lip).

**Tech stack:**
- TypeScript, three.js WebGPU with TSL (`three/tsl`), Vitest.
- GPU self-tests run in the browser at `http://localhost:5174/?selftest=<filter>` (preview `liquid-dreams-barrel`).

**Spec:** `docs/superpowers/specs/2026-09-30-barrel-from-maths-design.md`. It replaces §3.1–3.3 of
`docs/superpowers/specs/2026-09-30-condition-driven-barrel-design.md`; read both before starting.

**Where:**
- Work in the worktree `C:\Dev\andrew-dev-personal-projects\ld-barrel`, on branch `barrel-and-whitewater`.
- Never touch the main checkout (`C:\Dev\andrew-dev-personal-projects\liquid-dreaming`) or its branch.
- Run tests with `npx vitest run <path>` from the worktree root. Typecheck with `npx tsc --noEmit -p .`.
- Console output from a test only shows with `--reporter=verbose --silent=false`.
- The typecheck has no Node types: in tests, read environment variables as `import.meta.env.X`, and load `node:fs` with
  `import(/* @vite-ignore */ ['node', 'fs'].join(':'))`.
- Don't put an apostrophe inside a single-quoted `it('…')` name; use double quotes for those.

**Starting point:** `e8ceabe` (the spec). The earlier plan's Tasks 1–7 are built and pushed. A stash
(`superseded: concave-face + state-anchor WIP`) holds superseded work; leave it alone.

**Rulings where the spec is silent or can't be met literally:**
1. **The lip's growth.** The equations give the tube at impact only. Over the throw (progress q = t/τ_land): the tube's
   width grows as W·q (the face hollows as the lip throws), and the lip's tip runs along the tube's upper side to
   ξ_tip = q²·ξ_end (a free-fall-like acceleration). The tube's placement is fixed from its full size, so its round back
   never moves.
2. **The landing clock** is a free fall from the crest top to the landing point: τ_land = landingTime(K.y − P.y).
3. **The lip lands on the water under it.** Placed from the crest, the tube's point can hang above the sheet under it
   (the flattest tubes, near ψ 0.1, reach ~1.2 H ahead but only ~0.9 H down) or below it. Above: the tube drops until
   its point meets the sheet, and the lip over its top thickens by as much (the jet falls until it lands; steeper reefs
   give thicker jets, Pick & Feddersen). Below: the lip lands where its upper side first reaches that height. Either way
   the tube's lower side never dips below the landing point (the foil of their Fig. 5a). The ψ > 0.1 "foil" in the spec
   adds only the Mead & Black roundness on top. The sheet's height at an x is read by `sheetYAt` (four steps of
   u += x − base(u).x from u = x − K.x).
4. **The lip's thickness** is the tube's upper side thickened outward by t(ξ), thickest (t_top) over the tube's top and
   tapering as (1 − u)^0.8 to the tip. t_top = A_J·1.8 ÷ (the upper side's arc length from its top to its point), the
   band's area in closed form. The measured lip area is checked within 25% (the crest wedge and the curvature are left
   out of the closed form).
5. **In the air** the tip has thickness 0.4·t_top·(1 − q), and 0 at the landing, where the lip meets the water.
6. **Wind also scales the lip area** by the tube-area factor (Feddersen et al. 2023 measured the tube, not the lip).
7. **ψ below 0.02** keeps the smallest tube's shape (ψ = 0.02) and fades the constructed curve out by
   smoothstep(0.01, 0.02, ψ) on the frame's weight: the ribbon becomes the sheet (spilling is B's).
8. **The sheet's trough drain and explosion surge** have no paper behind them. They carry over from the photo-traced
   anchors, re-keyed from intensity to ψ at the state points: ψ 0.035 → (0.2194, 0), 0.065 → (0.6544, 0.3),
   0.09 → (0.8178, 0.45), smoothstep-eased between neighbours and held past the ends.
9. **Off the reef grid (no record)** a crest reads ψ = 0.065 (state 5), with no game-rule modifiers.
10. **The ramp's shape.** The spec's (1 − u)² creases where it meets the deep flat. The ramp is instead
    g(v) = v³(4 − 3v) of the way from the ledge depth to the deep water, v = the distance seaward of the ledge line ÷ the
    ramp's width: steepest about two thirds of the way out, flat at both ends. The width is calibrated (Task 5).
11. **ψ₀'s parts** are baked per node: s = the mean seabed slope over ±1 still-water depth either side of the node along
    its ray (floored at 0); h₀ = the deepest still water within 3 depths seaward along the ray; H₀ = the level's
    deep-water height (breaking.onsetLevelHeight) × the amplification where h₀ is. ψ₀ per level = s ÷ (H₀/h₀)^¼. The
    slope is smoothed along the crest as the step was.

## Global Constraints

- **ψ₀ = s / (H₀/h₀)^¼** (Pick & Feddersen 2026, eq. 3.5).
- **The fits** (Pick & Feddersen 2026, eqs 3.7–3.10), H the wave height at impact:
  - tube area A_O / H² = **5.319 ψ − 0.043**
  - lip area A_J / H² = **37.072 ψ² − 0.587 ψ + 0.020**
  - width ÷ length W / L = **1.661 ψ + 0.298**
  - tilt θ = **−5746.4 ψ² + 225.2 ψ + 48.4** degrees
  - evaluated at ψ clamped to **[0.02, 0.1]**.
- **The outline** (Longuet-Higgins 1982): **z′/W = ± (3√3/4) · √(x′/L) · (x′/L − 1)**, 0 ≤ x′ ≤ L; area **(2√3/5)·W·L**.
- **Past ψ = 0.1:** width ÷ length blends to Mead & Black's **1 / (0.065 X + 0.821)** over ψ 0.1 → 0.15, with
  X = 1 / (ψ · 0.5^¼), taking the larger of the two.
- **ψ thresholds:** none below **0.01** (fading in to **0.02**); state 4 **0.02–0.05**; state 5 **0.05–0.08**; state 6
  **0.08–0.1**; slab above **0.1**. Off the record: **0.065**.
- **Wind** (Feddersen et al. 2023), U/C = the onshore wind speed ÷ the crest speed where it breaks, piecewise linear and
  held past the ends:
  - tube area (and lip area) × **1.2 at U/C ≤ −0.4, 1 at 0, 0.6 at +0.75**;
  - width ÷ length × **1.2 at U/C ≤ −0.5, 1 at 0, 0.62 at +0.75**.
- **Game rules on ψ** (labelled, not physics): drain × **(1 + 0.1·smoothstep(T, 2T, gap) − 0.2·(1 − smoothstep(0.6T, T, gap)))**;
  dial × **(1 + dial·draw)**, dial **0 by default**, at most **0.15**; nudge × **(1 + nudge)**, nudge **0 by default**, in
  **[−0.5, 0.5]**. `gap` is Infinity for the first wave of a set and for strays.
- **The softened reef:** 12 ft at mid tide at the peak (the biggest set wave) reads **ψ₀ in [0.055, 0.075]**.
- **The lip's tip-to-top thickness ratio in the air: 0.4 × (1 − q)**. The tube's back sits **0.03 H** ahead of the crest.
- **Tolerances at landing:** tube area **± 3%**, width ÷ length **± 8%**, tilt **± 3°**, lip area **± 25%**.
- **Performance:** GPU frame time at 12 ft barrel-peeling at most **+0.2 ms** over the baseline measured in Task 7, Step 1.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Off the reef grid:** the sheet, the lip and the emitters all read ψ = 0.065, and the CPU and GPU agree there, so a
   crest running off the grid doesn't change shape at the edge. Tests: Task 3 (CPU), Task 7 (GPU sheet), Task 8 (GPU lip).
2. **ψ at the extremes** (0 over a flat bottom; ≫ 0.1 on any steep bit left in the reef; NaN from a zero height): the
   shape stays finite, the ribbon fades to the sheet below 0.01, and the lip never crosses itself or goes NaN. Tests:
   Task 1 (`overturnShape` at 0, 1e-6, 0.2, 5, NaN) and Task 4 (the profile across ψ 0–1 and H 0.3–9 m).
3. **A stored dev look from before this change** (it still carries `throwStrength`, `lipReach`, `lipThickness`,
   `wallBack` or `intensityNudge`) loads without error and doesn't change any crest's shape. Test: Task 4.
4. **The sheet and the lip disagreeing:** a station's ψ equals the sheet's crest ψ at the same point, or the lip lands
   on water drained for a different shape. Tests: Task 3 (CPU) and Task 8 (GPU).
5. **Strong wind** (U/C beyond the measured −1.2 to 0.7): the factors hold at their end values, and the tube never
   grows past its offshore cap. Test: Task 1.

---

### Task 1: The equations (`overturn.ts`) and the tube's geometry (`tube.ts`)

**Files:**
- Create: `src/breaker/overturn.ts`, `src/breaker/overturn.test.ts`
- Create: `src/breaker/tube.ts`, `src/breaker/tube.test.ts`

**Interfaces:**
- Consumes: `smoothstep` (`src/math/smoothstep`), `travelDirectionXZ` (`src/conditions/directions`), `BreakParams` (type).
- Produces (`overturn.ts`):
  - constants `PSI_NONE = 0.01`, `PSI_MIN = 0.02`, `PSI_FIT_MAX = 0.1`, `PSI_FOIL_FULL = 0.15`, `PSI_NORMAL = 0.065`,
    `LH82_K`, `LH82_AREA`, `MB_H_OVER_H0 = 0.5`, `LULL_GAIN = 0.1`, `STACK_LOSS = 0.2`, `RANDOM_DIAL_MAX = 0.15`,
    `PSI_NUDGE_RANGE = [-0.5, 0.5]`, `WIND_AREA_POINTS`, `WIND_ASPECT_POINTS`, `SHEET_POINTS`,
    `PER_CREST_BREAK_KEYS = ['troughDrain', 'pileSurge']`
  - `tubeAreaFit(psi)`, `lipAreaFit(psi)`, `aspectFit(psi)`, `tiltFitDeg(psi)`, `meadBlackAspect(X)`
  - `windUC(offshoreMs: number, c: number): number`, `windAreaFactor(uc)`, `windAspectFactor(uc)`
  - `interface Overturn { psi; presence; AO; AJ; W; L; theta; foil }` and `overturnShape(psi: number, H: number, uc: number): Overturn`
  - `psiState(psi): 'none' | 'oval' | 'cylinder' | 'thrown' | 'slab'`, `psiStateLabel(psi): string`
  - `offshoreSpeed(windSpeedMs, windFromDeg, travelX, travelZ)` (moved from `breakIntensity.ts`)
  - `drainFactor(gapS, periodS)`, `effectivePsi(psi0, i: { drain: number; draw: number }, p: Pick<BreakParams, 'psiNudge' | 'randomDial'>)`
  - `interface SheetShape { troughDrain; pileSurge }`, `sheetShape(psi): SheetShape`, `withSheetShape(p: BreakParams, psi): BreakParams`
- Produces (`tube.ts`): `interface Tube { O; d; n; L; W; clipY }`, `TUBE_XI_EPS`, `TUBE_SEARCH_STEPS = 24`,
  `TUBE_ARC_STEPS = 16`, `TUBE_WATER_STEPS = 20`, `tubeHalf`, `tubeAxis`, `tubeUpper`, `tubeLower`, `tubeUpperNormal`,
  `tubeTopXi`, `tubeBackMostX`, `tubeUpperArc`, `tubeWaterXi`, `tubeAxes(theta)`.

`BreakParams` gains `psiNudge` in Task 3; until then, type `effectivePsi`'s second argument as
`{ psiNudge: number; randomDial: number }`, which `Pick<BreakParams, …>` will satisfy.

- [ ] **Step 1: Write the failing tests**

```ts
// src/breaker/overturn.test.ts
import { describe, expect, it } from 'vitest';
import {
  LH82_AREA, LH82_K, PSI_NORMAL, SHEET_POINTS, aspectFit, drainFactor, effectivePsi, lipAreaFit, meadBlackAspect, offshoreSpeed,
  overturnShape, psiState, sheetShape, tiltFitDeg, tubeAreaFit, windAreaFactor, windAspectFactor, windUC,
} from './overturn';

describe('the overturn equations (spec 2026-09-30-barrel-from-maths §3)', () => {
  it('are Pick & Feddersen eqs 3.7–3.10 exactly', () => {
    expect(tubeAreaFit(0.06)).toBeCloseTo(5.319 * 0.06 - 0.043, 12);
    expect(lipAreaFit(0.06)).toBeCloseTo(37.072 * 0.0036 - 0.587 * 0.06 + 0.02, 12);
    expect(aspectFit(0.06)).toBeCloseTo(1.661 * 0.06 + 0.298, 12);
    expect(tiltFitDeg(0.06)).toBeCloseTo(-5746.4 * 0.0036 + 225.2 * 0.06 + 48.4, 12);
    expect(meadBlackAspect(30)).toBeCloseTo(1 / (0.065 * 30 + 0.821), 12);
  });
  it('the Longuet-Higgins outline: half width (3√3/4)W√ξ(1−ξ), full width W at ξ = 1/3, area (2√3/5)WL', () => {
    expect(LH82_K).toBeCloseTo((3 * Math.sqrt(3)) / 4, 12);
    expect(2 * LH82_K * Math.sqrt(1 / 3) * (2 / 3)).toBeCloseTo(1, 9);
    let a = 0; const n = 20000;
    for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; a += 2 * LH82_K * Math.sqrt(x) * (1 - x) / n; }
    expect(a).toBeCloseTo(LH82_AREA, 6);
  });
  it('overturnShape: size from the area, shape from the aspect, tilt in radians; the fits clamped to [0.02, 0.1]', () => {
    const H = 7, s = overturnShape(0.06, H, 0);
    expect(s.AO).toBeCloseTo(tubeAreaFit(0.06) * H * H, 9);
    expect(s.AJ).toBeCloseTo(lipAreaFit(0.06) * H * H, 9);
    expect(s.W / s.L).toBeCloseTo(aspectFit(0.06), 9);
    expect(LH82_AREA * s.W * s.L).toBeCloseTo(s.AO, 9);
    expect(s.theta).toBeCloseTo((tiltFitDeg(0.06) * Math.PI) / 180, 9);
    expect(overturnShape(0.001, H, 0).AO).toBeCloseTo(tubeAreaFit(0.02) * H * H, 9);
    expect(overturnShape(0.001, H, 0).presence).toBe(0);
    expect(overturnShape(0.02, H, 0).presence).toBe(1);
    expect(overturnShape(0.4, H, 0).AO).toBeCloseTo(tubeAreaFit(0.1) * H * H, 9);
  });
  it('past 0.1 the tube rounds toward Mead & Black (foil 0 → 1 over 0.1 → 0.15), never less round than the fit', () => {
    const at = (psi: number) => overturnShape(psi, 7, 0);
    expect(at(0.1).foil).toBe(0);
    expect(at(0.15).foil).toBe(1);
    expect(at(0.15).W / at(0.15).L).toBeCloseTo(Math.max(aspectFit(0.1), meadBlackAspect(1 / (0.15 * 0.5 ** 0.25))), 9);
    for (let p = 0.1; p <= 0.3; p += 0.01) expect(at(p).W / at(p).L).toBeGreaterThanOrEqual(aspectFit(0.1) - 1e-12);
  });
  it('wind (Feddersen et al. 2023): onshore halves the area and narrows the tube, offshore grows it to a cap', () => {
    expect(windAreaFactor(0)).toBe(1);
    expect(windAreaFactor(-0.4)).toBeCloseTo(1.2, 12);
    expect(windAreaFactor(-3)).toBeCloseTo(1.2, 12);
    expect(windAreaFactor(0.75)).toBeCloseTo(0.6, 12);
    expect(windAreaFactor(3)).toBeCloseTo(0.6, 12);
    expect(windAspectFactor(-0.5)).toBeCloseTo(1.2, 12);
    expect(windAspectFactor(0.75)).toBeCloseTo(0.62, 12);
    expect(windUC(4, 8)).toBeCloseTo(-0.5, 12); // 4 m/s offshore against an 8 m/s crest
    const on = overturnShape(0.06, 7, 0.75), calm = overturnShape(0.06, 7, 0), off = overturnShape(0.06, 7, -2);
    expect(on.AO).toBeLessThan(calm.AO);
    expect(off.AO).toBeGreaterThan(calm.AO);
    expect(off.AO).toBeCloseTo(1.2 * calm.AO, 9);
  });
  it('stays finite at the extremes (ψ 0, NaN, huge; H 0; wind NaN)', () => {
    for (const psi of [0, 1e-6, 0.2, 5, Number.NaN]) for (const H of [0, 0.3, 9]) for (const uc of [0, Number.NaN, 10]) {
      const s = overturnShape(psi, H, uc);
      for (const v of [s.AO, s.AJ, s.W, s.L, s.theta, s.presence, s.foil]) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it('the states by ψ', () => {
    expect(psiState(0.005)).toBe('none');
    expect(psiState(0.035)).toBe('oval');
    expect(psiState(0.065)).toBe('cylinder');
    expect(psiState(0.09)).toBe('thrown');
    expect(psiState(0.2)).toBe('slab');
  });
  it('offshore wind is positive, onshore negative, cross-shore about zero', () => {
    // Waves travel toward +x. Wind from +x (east) blows toward −x, into their faces: offshore.
    expect(offshoreSpeed(8, 90, 1, 0)).toBeCloseTo(8, 6);
    expect(offshoreSpeed(8, 270, 1, 0)).toBeCloseTo(-8, 6);
    expect(Math.abs(offshoreSpeed(8, 0, 1, 0))).toBeLessThan(1e-6);
  });
  it('game rules: a lull ×1.1, stacking ×0.8, normal spacing ×1; the dial and nudge multiply', () => {
    expect(drainFactor(Infinity, 15)).toBeCloseTo(1.1, 12);
    expect(drainFactor(0.3 * 15, 15)).toBeCloseTo(0.8, 12);
    expect(Math.abs(drainFactor(15, 15) - 1)).toBeLessThan(0.02);
    expect(effectivePsi(0.06, { drain: 1, draw: 1 }, { psiNudge: 0, randomDial: 0 })).toBe(0.06);
    expect(effectivePsi(0.06, { drain: 1.1, draw: -1 }, { psiNudge: 0.5, randomDial: 0.15 })).toBeCloseTo(0.06 * 1.1 * 0.85 * 1.5, 12);
  });
  it("the sheet's trough drain and surge: the photo-traced values at the state points, eased between, held past the ends", () => {
    for (const [psi, td, ps] of SHEET_POINTS) { expect(sheetShape(psi).troughDrain).toBe(td); expect(sheetShape(psi).pileSurge).toBe(ps); }
    expect(sheetShape(0).troughDrain).toBe(SHEET_POINTS[0][1]);
    expect(sheetShape(1).pileSurge).toBe(SHEET_POINTS[2][2]);
    expect(sheetShape(PSI_NORMAL).troughDrain).toBe(SHEET_POINTS[1][1]);
    let prev = sheetShape(0.03).troughDrain;
    for (let p = 0.031; p <= 0.1; p += 0.001) { const v = sheetShape(p).troughDrain; expect(Math.abs(v - prev)).toBeLessThan(0.03); prev = v; }
  });
});
```

```ts
// src/breaker/tube.test.ts
import { describe, expect, it } from 'vitest';
import { LH82_AREA, overturnShape } from './overturn';
import { type Tube, tubeAxes, tubeBackMostX, tubeLower, tubeTopXi, tubeUpper, tubeUpperArc, tubeUpperNormal, tubeWaterXi } from './tube';

const shape = overturnShape(0.06, 7, 0);
const t: Tube = { O: [0, 0], ...tubeAxes(shape.theta), L: shape.L, W: shape.W, clipY: -Infinity };

describe('the tube (Longuet-Higgins outline in its own axes)', () => {
  it('both sides meet at the round end (ξ = 0) and at the point (ξ = 1), the point L down the axis', () => {
    expect(tubeUpper(t, 0)).toEqual(tubeLower(t, 0));
    const p = tubeUpper(t, 1), q = tubeLower(t, 1);
    expect(p[0]).toBeCloseTo(q[0], 9); expect(p[1]).toBeCloseTo(q[1], 9);
    expect(Math.hypot(p[0], p[1])).toBeCloseTo(t.L, 9);
    expect(p[1]).toBeLessThan(0); // the point is below the round end: the tube tilts down and forward
    expect(p[0]).toBeGreaterThan(0);
  });
  it('encloses the Longuet-Higgins area', () => {
    const pts = [];
    for (let i = 0; i <= 400; i++) pts.push(tubeUpper(t, i / 400));
    for (let i = 400; i >= 0; i--) pts.push(tubeLower(t, i / 400));
    let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    expect(Math.abs(a) / 2).toBeCloseTo(LH82_AREA * t.W * t.L, 2);
  });
  it('its top and back are found (the highest point of the upper side, the back-most point of either side)', () => {
    const xi = tubeTopXi(t), top = tubeUpper(t, xi);
    for (let i = 0; i <= 200; i++) expect(tubeUpper(t, i / 200)[1]).toBeLessThanOrEqual(top[1] + 1e-6);
    const back = tubeBackMostX(t);
    for (let i = 0; i <= 200; i++) { expect(tubeLower(t, i / 200)[0]).toBeGreaterThanOrEqual(back - 1e-6); expect(tubeUpper(t, i / 200)[0]).toBeGreaterThanOrEqual(back - 1e-6); }
  });
  it("the upper side's outward normal points away from the tube, and its arc is the polyline's length", () => {
    for (const xi of [0.05, 0.3, 0.6, 0.95]) {
      const nr = tubeUpperNormal(t, xi), u = tubeUpper(t, xi), l = tubeLower(t, xi);
      expect(nr[0] * (u[0] - l[0]) + nr[1] * (u[1] - l[1])).toBeGreaterThan(0);
      expect(Math.hypot(nr[0], nr[1])).toBeCloseTo(1, 9);
    }
    let s = 0; for (let i = 0; i < 2000; i++) { const a = tubeUpper(t, 0.2 + (0.8 * i) / 2000), b = tubeUpper(t, 0.2 + (0.8 * (i + 1)) / 2000); s += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    expect(tubeUpperArc(t, 0.2, 1)).toBeCloseTo(s, 1);
  });
  it('the lower side never dips below clipY; the water cut is where the upper side first reaches it', () => {
    const c: Tube = { ...t, clipY: tubeUpper(t, 1)[1] + 0.5 };
    for (let i = 0; i <= 100; i++) expect(tubeLower(c, i / 100)[1]).toBeGreaterThanOrEqual(c.clipY);
    const y = tubeUpper(t, 1)[1] + 0.5, xi = tubeWaterXi(t, tubeTopXi(t), y);
    expect(tubeUpper(t, xi)[1]).toBeCloseTo(y, 3);
  });
});
```

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run src/breaker/overturn.test.ts src/breaker/tube.test.ts`
Expected: FAIL (the modules don't exist).

- [ ] **Step 3: Write `overturn.ts`**

```ts
// src/breaker/overturn.ts
import { travelDirectionXZ } from '../conditions/directions';
import { smoothstep } from '../math/smoothstep';
import type { BreakParams } from './breaking';

/**
 * The barrel from the maths (spec 2026-09-30-barrel-from-maths §3): the overturning tube's size, shape and tilt from
 * ψ₀ = s / (H₀/h₀)^¼ (Pick & Feddersen 2026, eqs 3.5, 3.7–3.10), its outline Longuet-Higgins' (1982), the wind's
 * factors measured at field scale (Feddersen et al. 2023), and the few game rules the papers don't cover (labelled).
 * The source of truth: overturnNodes.ts mirrors it term by term on the GPU.
 */

/** No tube below PSI_NONE; the smallest tube from PSI_MIN (the fits are evaluated at ψ clamped to [PSI_MIN, PSI_FIT_MAX]). */
export const PSI_NONE = 0.01;
export const PSI_MIN = 0.02;
/** The fits cover 0 < ψ < 0.1 (slopes 1:100 to 1:10); past it the tube rounds toward Mead & Black by PSI_FOIL_FULL. */
export const PSI_FIT_MAX = 0.1;
export const PSI_FOIL_FULL = 0.15;
/** A crest off the reef's record reads this (state 5, a normal good day). */
export const PSI_NORMAL = 0.065;
/** Longuet-Higgins' outline: half width LH82_K · W · √ξ (1 − ξ); area LH82_AREA · W · L. */
export const LH82_K = (3 * Math.sqrt(3)) / 4;
export const LH82_AREA = (2 * Math.sqrt(3)) / 5;
/** Mead & Black's gradient X is read from ψ at this wave height ÷ depth (the mockup's). */
export const MB_H_OVER_H0 = 0.5;
/** Game rules (not from the papers): a lull ×(1 + LULL_GAIN), stacking ×(1 − STACK_LOSS); the dial and nudge. */
export const LULL_GAIN = 0.1;
export const STACK_LOSS = 0.2;
export const RANDOM_DIAL_MAX = 0.15;
export const PSI_NUDGE_RANGE: readonly [number, number] = [-0.5, 0.5];
/** Feddersen et al. 2023, relative to calm, (U/C, factor), held past the ends. */
export const WIND_AREA_POINTS: readonly (readonly [number, number])[] = [[-0.4, 1.2], [0, 1], [0.75, 0.6]];
export const WIND_ASPECT_POINTS: readonly (readonly [number, number])[] = [[-0.5, 1.2], [0, 1], [0.75, 0.62]];
/** The sheet's trough drain and surge at the state points (ψ, troughDrain, pileSurge): Andrew's photo-traced anchors,
 * re-keyed to ψ (no paper covers them; plan ruling 8). */
export const SHEET_POINTS: readonly (readonly [number, number, number])[] = [[0.035, 0.2194, 0], [0.065, 0.6544, 0.3], [0.09, 0.8178, 0.45]];
/** The BreakParams keys each crest sets from its ψ (withSheetShape). */
export const PER_CREST_BREAK_KEYS = ['troughDrain', 'pileSurge'] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

export const tubeAreaFit = (psi: number): number => 5.319 * psi - 0.043;
export const lipAreaFit = (psi: number): number => 37.072 * psi * psi - 0.587 * psi + 0.02;
export const aspectFit = (psi: number): number => 1.661 * psi + 0.298;
export const tiltFitDeg = (psi: number): number => -5746.4 * psi * psi + 225.2 * psi + 48.4;
/** Mead & Black 2001: tube length ÷ width = 0.065 X + 0.821 on a seabed gradient 1:X; returned as width ÷ length. */
export const meadBlackAspect = (X: number): number => 1 / (0.065 * X + 0.821);

/** The onshore wind over the crest speed (Feddersen's U/C: positive onshore), from the offshore speed (offshoreSpeed). */
export function windUC(offshoreMs: number, c: number): number {
  return finite(-offshoreMs / Math.max(c, 0.5), 0);
}
function piecewise(points: readonly (readonly [number, number])[], x: number): number {
  const v = finite(x, 0);
  if (v <= points[0][0]) return points[0][1];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    if (v <= x1) return y0 + ((v - x0) * (y1 - y0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}
export const windAreaFactor = (uc: number): number => piecewise(WIND_AREA_POINTS, uc);
export const windAspectFactor = (uc: number): number => piecewise(WIND_ASPECT_POINTS, uc);

export interface Overturn {
  /** The ψ it was built for. */
  psi: number;
  /** 0 below PSI_NONE, 1 from PSI_MIN: the constructed curve's share (plan ruling 7). */
  presence: number;
  /** Tube and lip areas (m²), the tube's width and length (m), its tilt below the horizontal (rad). */
  AO: number;
  AJ: number;
  W: number;
  L: number;
  theta: number;
  /** 0 up to PSI_FIT_MAX, 1 from PSI_FOIL_FULL: how far the roundness has gone toward Mead & Black's. */
  foil: number;
}

/** The tube at the moment the lip lands, for ψ, a wave height H (m) and the wind's U/C. */
export function overturnShape(psi: number, H: number, uc: number): Overturn {
  const q = finite(psi, PSI_NORMAL), h = Math.max(finite(H, 0), 0);
  const p = clamp(q, PSI_MIN, PSI_FIT_MAX);
  const foil = smoothstep(PSI_FIT_MAX, PSI_FOIL_FULL, q);
  const fa = windAreaFactor(uc), fw = windAspectFactor(uc);
  const fit = aspectFit(p);
  const mb = meadBlackAspect(1 / (Math.max(q, 1e-6) * MB_H_OVER_H0 ** 0.25));
  const WL = (fit + (Math.max(mb, fit) - fit) * foil) * fw;
  const AO = tubeAreaFit(p) * h * h * fa, AJ = lipAreaFit(p) * h * h * fa;
  const L = Math.sqrt(AO / (LH82_AREA * WL));
  return { psi: q, presence: smoothstep(PSI_NONE, PSI_MIN, q), AO, AJ, W: WL * L, L, theta: (tiltFitDeg(p) * Math.PI) / 180, foil };
}

export type PsiState = 'none' | 'oval' | 'cylinder' | 'thrown' | 'slab';
/** Andrew's states by ψ: none (< PSI_MIN), 4 oval (< 0.05), 5 cylinder (< 0.08), 6 thrown (≤ 0.1), past it a slab. */
export function psiState(psi: number): PsiState {
  if (!(psi >= PSI_MIN)) return 'none';
  if (psi < 0.05) return 'oval';
  if (psi < 0.08) return 'cylinder';
  if (psi <= PSI_FIT_MAX) return 'thrown';
  return 'slab';
}
export function psiStateLabel(psi: number): string {
  return { none: 'no tube', oval: 'oval (4)', cylinder: 'cylinder (5)', thrown: 'thrown out (6)', slab: 'slab (past 6)' }[psiState(psi)];
}

/** The wind's speed against the waves' travel (m/s): positive offshore (blowing into the waves' faces), negative onshore. */
export function offshoreSpeed(windSpeedMs: number, windFromDeg: number, travelX: number, travelZ: number): number {
  const toward = travelDirectionXZ(windFromDeg);
  return -windSpeedMs * (toward.x * travelX + toward.z * travelZ);
}

/** Game rule: a wave `gapS` after the one before (Infinity: after a lull) finds the reef drained more or less. */
export function drainFactor(gapS: number, periodS: number): number {
  const g = Number.isNaN(gapS) ? Infinity : Math.max(gapS, 0);
  return 1 + LULL_GAIN * smoothstep(periodS, 2 * periodS, g) - STACK_LOSS * (1 - smoothstep(0.6 * periodS, periodS, g));
}

/** The crest's ψ: the reef's ψ₀ with the game rules (drain, the dial's draw, the nudge) as factors. */
export function effectivePsi(psi0: number, i: { drain: number; draw: number }, p: Pick<BreakParams, 'psiNudge' | 'randomDial'>): number {
  return psi0 * i.drain * (1 + p.randomDial * i.draw) * (1 + p.psiNudge);
}

export interface SheetShape {
  troughDrain: number;
  pileSurge: number;
}
/** The sheet's trough drain and surge at ψ: SHEET_POINTS, smoothstep-eased between neighbours, held past the ends. */
export function sheetShape(psi: number): SheetShape {
  const q = finite(psi, PSI_NORMAL), P = SHEET_POINTS;
  if (q <= P[0][0]) return { troughDrain: P[0][1], pileSurge: P[0][2] };
  if (q >= P[P.length - 1][0]) return { troughDrain: P[P.length - 1][1], pileSurge: P[P.length - 1][2] };
  const k = q < P[1][0] ? 0 : 1, a = P[k], b = P[k + 1];
  const t = smoothstep(a[0], b[0], q);
  return { troughDrain: a[1] * (1 - t) + b[1] * t, pileSurge: a[2] * (1 - t) + b[2] * t };
}
/** `p` with the per-crest keys at ψ (a copy). */
export function withSheetShape(p: BreakParams, psi: number): BreakParams {
  const s = sheetShape(psi);
  return { ...p, troughDrain: s.troughDrain, pileSurge: s.pileSurge };
}
```

- [ ] **Step 4: Write `tube.ts`**

```ts
// src/breaker/tube.ts
import { LH82_K } from './overturn';

/**
 * The overturning tube's geometry (spec 2026-09-30-barrel-from-maths §3.2): Longuet-Higgins' outline in the tube's own
 * axes. O is the round end (ξ = 0), d the axis (down and forward), n across it (up and forward); the upper side is
 * O + ξL·d + h(ξ)·n, the lower side O + ξL·d − h(ξ)·n with y held at or above clipY (the water it lands on). The GPU
 * mirror is in lipProfileNodes.ts.
 */
export type Vec2 = [number, number];
export interface Tube { O: Vec2; d: Vec2; n: Vec2; L: number; W: number; clipY: number }

/** ξ is kept this far off 0 where √ξ's slope is needed. */
export const TUBE_XI_EPS = 1e-4;
/** Ternary-search steps for the tube's top and back; samples along an arc; bisections for the water cut. */
export const TUBE_SEARCH_STEPS = 24;
export const TUBE_ARC_STEPS = 16;
export const TUBE_WATER_STEPS = 20;

/** The axes for a tube tilted θ below the horizontal: d down and forward, n up and forward. */
export function tubeAxes(theta: number): { d: Vec2; n: Vec2 } {
  return { d: [Math.cos(theta), -Math.sin(theta)], n: [Math.sin(theta), Math.cos(theta)] };
}
export function tubeHalf(t: Tube, xi: number): number {
  const x = Math.min(1, Math.max(0, xi));
  return LH82_K * t.W * Math.sqrt(x) * (1 - x);
}
export function tubeAxis(t: Tube, xi: number): Vec2 {
  return [t.O[0] + t.d[0] * xi * t.L, t.O[1] + t.d[1] * xi * t.L];
}
export function tubeUpper(t: Tube, xi: number): Vec2 {
  const a = tubeAxis(t, xi), h = tubeHalf(t, xi);
  return [a[0] + t.n[0] * h, a[1] + t.n[1] * h];
}
export function tubeLower(t: Tube, xi: number): Vec2 {
  const a = tubeAxis(t, xi), h = tubeHalf(t, xi);
  return [a[0] - t.n[0] * h, Math.max(a[1] - t.n[1] * h, t.clipY)];
}
/** The upper side's unit normal at ξ, pointing out of the tube. */
export function tubeUpperNormal(t: Tube, xi: number): Vec2 {
  const x = Math.min(1, Math.max(TUBE_XI_EPS, xi));
  const dh = LH82_K * t.W * ((1 - x) / (2 * Math.sqrt(x)) - Math.sqrt(x));
  const T: Vec2 = [t.d[0] * t.L + t.n[0] * dh, t.d[1] * t.L + t.n[1] * dh];
  const l = Math.hypot(T[0], T[1]) || 1;
  let nr: Vec2 = [-T[1] / l, T[0] / l];
  if (nr[0] * t.n[0] + nr[1] * t.n[1] < 0) nr = [-nr[0], -nr[1]];
  return nr;
}
/** Ternary search for the maximum of a unimodal f on [a, b] (fixed steps, as the GPU does it). */
function argmax(f: (x: number) => number, a: number, b: number): number {
  let lo = a, hi = b;
  for (let i = 0; i < TUBE_SEARCH_STEPS; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) lo = m1; else hi = m2;
  }
  return (lo + hi) / 2;
}
/** The ξ of the upper side's highest point. */
export function tubeTopXi(t: Tube): number {
  return argmax((xi) => tubeUpper(t, xi)[1], 0, 1);
}
/** The tube's back-most x (on the lower side, which leans back; or the round end itself). */
export function tubeBackMostX(t: Tube): number {
  const xi = argmax((x) => -tubeLower({ ...t, clipY: -Infinity }, x)[0], 0, 1);
  return Math.min(t.O[0], tubeLower({ ...t, clipY: -Infinity }, xi)[0]);
}
/** The upper side's arc length from ξ = a to b (TUBE_ARC_STEPS chords). */
export function tubeUpperArc(t: Tube, a: number, b: number): number {
  let s = 0, prev = tubeUpper(t, a);
  for (let i = 1; i <= TUBE_ARC_STEPS; i++) {
    const q = tubeUpper(t, a + ((b - a) * i) / TUBE_ARC_STEPS);
    s += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
  }
  return s;
}
/** The first ξ past `from` where the upper side comes down to height y (bisection; the side falls from its top on). */
export function tubeWaterXi(t: Tube, from: number, y: number): number {
  let lo = from, hi = 1;
  for (let i = 0; i < TUBE_WATER_STEPS; i++) { const m = (lo + hi) / 2; if (tubeUpper(t, m)[1] > y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
```

- [ ] **Step 5: Run and check they pass**

Run: `npx vitest run src/breaker/overturn.test.ts src/breaker/tube.test.ts` and `npx tsc --noEmit -p .`
Expected: PASS. (`effectivePsi`'s `Pick<BreakParams, 'psiNudge' …>` needs `psiNudge` on `BreakParams`: add it now to the
interface only, as `psiNudge: number;` next to `intensityNudge`, with `psiNudge: 0` in `DEFAULT_BREAK_PARAMS` and
`p.psiNudge = clampTo(p.psiNudge, -0.5, 0.5, d.psiNudge);` in `normalizeBreakParams`. Task 3 removes `intensityNudge`.)

- [ ] **Step 6: Commit**

```bash
git add src/breaker/overturn.ts src/breaker/overturn.test.ts src/breaker/tube.ts src/breaker/tube.test.ts src/breaker/breaking.ts
git commit -m "feat(overturn): the tube from the maths (Pick & Feddersen 2026 fits, Longuet-Higgins outline, Feddersen et al. 2023 wind) and its geometry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ψ₀ in the reef bake (replacing the step)

**Files:**
- Modify: `src/breaker/reefField.ts` (replace `STEP_LOOK_AHEAD`, `STEP_SAMPLE_M`, `stepAlong`, `rawStep`/`stepHere`; `computeOnsetRecord`'s `stepHere` → `psiHere`)
- Modify: `src/breaker/breaking.ts` (`ONSET_STEP_OFFSET` → `ONSET_PSI_OFFSET`, `onsetStep` → `onsetPsi`, the record comment)
- Modify: `src/breaker/SetWaves.ts` (the import and the copy's `r + ONSET_STEP_OFFSET` → `r + ONSET_PSI_OFFSET`)
- Delete: `src/breaker/reefStep.test.ts`. Create: `src/breaker/reefPsi.test.ts`
- Modify: every other file importing `onsetStep`/`ONSET_STEP_OFFSET`/`stepAlong` (`setWaveModel.ts`, `crestTrace.ts`,
  `breaking.test.ts`, `reefField.test.ts`): rename the import only; the values they read become ψ₀ (Task 3 rewires them).

**Interfaces:**
- Consumes: `onsetLevelHeight(k)`, `ONSET_LEVELS` (breaking.ts); `bilinearCells`, `smoothAlongCrest`, `BREAK_SMOOTHING_M` (reefField.ts).
- Produces: `PSI_SLOPE_HALF_WINDOW = 1`, `PSI_APPROACH_REACH = 3`, `PSI_SAMPLE_M = 1`,
  `psiReef(depthAlong: (s: number) => number, d0: number): { slope: number; h0: number; sApproach: number }`,
  `ONSET_PSI_OFFSET = 1 + 2 * ONSET_LEVELS`, `onsetPsi(rec, offset, heightM, p): number`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/breaker/reefPsi.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_LEVELS, ONSET_PSI_OFFSET, ONSET_RECORD_LENGTH, onsetPsi } from './breaking';
import { computeReefField, psiReef, sampleField, sampleOnset } from './reefField';

const bed = downsample(buildBathymetry(), 2);
const fieldAt = (tideM: number) => computeReefField({ bed, periodS: 15, fromDeg: 225, tideM });
const biggest = (ft: number) => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = ft; return wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => Math.max(a, b.heightM), 0); };
const psiAt = (f: ReturnType<typeof fieldAt>, x: number, z: number, h: number) => onsetPsi(sampleOnset(f, x, z)!, 0, h, DEFAULT_BREAK_PARAMS);

describe('ψ₀ in the reef bake (spec 2026-09-30-barrel-from-maths §5, plan ruling 11)', () => {
  it('psiReef: a planar 1:20 slope reads 0.05; a flat bottom 0; the approach depth is the deepest water seaward', () => {
    const plane = psiReef((s) => 10 - s / 20, 10);
    expect(plane.slope).toBeCloseTo(0.05, 6);
    expect(plane.h0).toBeCloseTo(10 + (3 * 10) / 20, 6);
    expect(plane.sApproach).toBeCloseTo(-30, 6);
    const flat = psiReef(() => 13, 13);
    expect(flat.slope).toBe(0);
    expect(flat.h0).toBe(13);
    expect(psiReef((s) => 10 + s / 20, 10).slope).toBe(0); // deepening ahead: floored at 0
  });
  it('the record keeps a ψ₀ per level after the (time, height) pairs', () => {
    expect(ONSET_PSI_OFFSET).toBe(1 + 2 * ONSET_LEVELS);
    expect(ONSET_RECORD_LENGTH).toBe(1 + 3 * ONSET_LEVELS);
  });
  const mid = fieldAt(0), low = fieldAt(-1.5), high = fieldAt(1.5);
  it('is finite and non-negative everywhere near the peak at both tide extremes, and smooth along the crest (≤ 0.02 per metre)', () => {
    const h = biggest(12);
    for (const f of [low, mid, high]) {
      const f0 = sampleField(f, 0, 0), tx = -f0.dirZ, tz = f0.dirX;
      let prev = psiAt(f, -30 * tx, -30 * tz, h);
      for (let v = -29; v <= 30; v++) {
        const p = psiAt(f, v * tx, v * tz, h);
        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(Math.abs(p - prev)).toBeLessThanOrEqual(0.02);
        prev = p;
      }
    }
  });
  it('is carried along the ray after a section breaks (within 10% of the peak value 20 m on)', () => {
    const h = biggest(12), f0 = sampleField(mid, 0, 0), p0 = psiAt(mid, 0, 0, h);
    console.log(`peak ψ₀, 12 ft: low ${psiAt(low, 0, 0, h).toFixed(3)} mid ${p0.toFixed(3)} high ${psiAt(high, 0, 0, h).toFixed(3)}`);
    expect(Math.abs(psiAt(mid, f0.dirX * 20, f0.dirZ * 20, h) - p0)).toBeLessThanOrEqual(0.1 * p0 + 1e-9);
  });
});
```

- [ ] **Step 2: Run and check it fails**

Run: `npx vitest run src/breaker/reefPsi.test.ts`
Expected: FAIL (`psiReef`, `onsetPsi`, `ONSET_PSI_OFFSET` not exported).

- [ ] **Step 3: The reader in `breaking.ts`**

Replace the record comment's last clause and the constant:

```ts
/** Values per record sample: the running maximum; per level (time since onset, the throw's height ÷ the level's
 * deep-water height); then per level ψ₀ where that level broke (reefField.psiReef, spec 2026-09-30-barrel-from-maths). */
export const ONSET_RECORD_LENGTH = 1 + 3 * ONSET_LEVELS;
/** Offset of level 0's ψ₀ in a record sample. */
export const ONSET_PSI_OFFSET = 1 + 2 * ONSET_LEVELS;
```

Rename `onsetStep` to `onsetPsi` (same body, `ONSET_PSI_OFFSET` in place of `ONSET_STEP_OFFSET`), with the doc comment:
"ψ₀ where the section broke, for a wave of deep-water height `heightM`: levels k and k + 1 around its breaking level,
log-linearly (w = lq − k, clamped). It reads a value whether or not the wave has broken: an unbroken level holds the
node's own ψ₀ (a section breaking there now)."

- [ ] **Step 4: The bake in `reefField.ts`**

Replace `STEP_LOOK_AHEAD`, `STEP_SAMPLE_M` and `stepAlong` with:

```ts
/** ψ₀'s seabed slope is the mean over this many still-water depths either side of a node along its ray… */
export const PSI_SLOPE_HALF_WINDOW = 1;
/** …its approach depth the deepest still water within this many depths seaward… */
export const PSI_APPROACH_REACH = 3;
/** …sampled this far apart (m): the field's cell. */
export const PSI_SAMPLE_M = 1;

/**
 * ψ₀'s reef parts at a point of still-water depth d0 (plan ruling 11): the mean slope over ±PSI_SLOPE_HALF_WINDOW·d0
 * along its ray (depthAlong(s), s metres ahead; floored at 0: a bottom deepening ahead gives no plunge), and the
 * approach depth h0, the deepest still water within PSI_APPROACH_REACH·d0 seaward, with where it is (sApproach ≤ 0).
 */
export function psiReef(depthAlong: (s: number) => number, d0: number): { slope: number; h0: number; sApproach: number } {
  const w = PSI_SLOPE_HALF_WINDOW * d0;
  const slope = w > 0 ? Math.max(0, (depthAlong(-w) - depthAlong(w)) / (2 * w)) : 0;
  let h0 = d0, sApproach = 0;
  for (let s = -PSI_SAMPLE_M; s >= -PSI_APPROACH_REACH * d0 - 1e-9; s -= PSI_SAMPLE_M) {
    const d = depthAlong(s);
    if (d > h0) { h0 = d; sApproach = s; }
  }
  return { slope, h0, sApproach };
}
```

In `computeReefField`, replace the `rawStep`/`stepHere` block with:

```ts
  // ψ₀ at every node and level (spec 2026-09-30-barrel-from-maths, plan ruling 11): the slope smoothed along the crest as
  // the breaking depth is, so small reef bumps don't make the lip ragged; the approach depth and its amplification raw.
  const depthAt = bilinearCells(depth, grid), ampAt = bilinearCells(amp, grid);
  const rawSlope = new Float32Array(n), h0 = new Float32Array(n), amp0 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const col = i % nx, row = (i - col) / nx, dx = dirX[i] / cellM, dz = dirZ[i] / cellM;
    const r = psiReef((s) => depthAt(col + dx * s, row + dz * s), depth[i]);
    rawSlope[i] = r.slope; h0[i] = r.h0; amp0[i] = ampAt(col + dx * r.sApproach, row + dz * r.sApproach);
  }
  const slope = smoothAlongCrest(rawSlope, dirX, dirZ, grid, BREAK_SMOOTHING_M);
  const psiHere = new Float32Array(n * ONSET_LEVELS);
  for (let i = 0; i < n; i++) for (let k = 0; k < ONSET_LEVELS; k++) {
    const H0 = onsetLevelHeight(k) * amp0[i];
    psiHere[i * ONSET_LEVELS + k] = H0 > 0 && h0[i] > 0 ? slope[i] / (H0 / h0[i]) ** 0.25 : 0;
  }
  const onset = computeOnsetRecord({ grid, tau: tau32, amp, hmin, hminBreak, k, dirX, dirZ, fixed, order, omega, psiHere });
```

`bilinearCells(a, grid)` clamps at the grid edge (it did for the step); import `ONSET_LEVELS` and `onsetLevelHeight`
from `./breaking` if not already imported.

In `computeOnsetRecord`: the argument `stepHere: Float32Array` becomes `psiHere: Float32Array` (n × ONSET_LEVELS);
`S = ONSET_PSI_OFFSET`; and in each branch:
- the `!inside` branch and `run < q && !brokenB`: `out[base + S + k] = f.psiHere[i * ONSET_LEVELS + k];`
- `brokenB`: `out[base + S + k] = lerp(out, R, S + k);` (unchanged)
- "broken in between": `const psiB = lerp(f.psiHere, ONSET_LEVELS, k); out[base + S + k] = psiB + fr * (f.psiHere[i * ONSET_LEVELS + k] - psiB);`

(`lerp(a, stride, off)` already takes a stride and offset.)

- [ ] **Step 5: Rename the other readers, run everything that reads the record**

In `SetWaves.ts`, `setWaveModel.ts`, `crestTrace.ts`, `breaking.test.ts`, `reefField.test.ts`: `onsetStep` → `onsetPsi`,
`ONSET_STEP_OFFSET` → `ONSET_PSI_OFFSET`. `breakIntensity`'s `step` input now receives ψ₀ until Task 3 replaces it;
tests pinned to step values (in `setWaveModel.test.ts`'s intensity describe and `crestTrace.test.ts`'s station intensity)
will move in Task 3: mark each failing one `it.skip` with the comment `// Task 3 rewires intensity to ψ`, and list them
in the ledger.

Run: `npx tsc --noEmit -p .` and `npx vitest run src/breaker/reefPsi.test.ts src/breaker/reefField.test.ts src/breaker/breaking.test.ts src/breaker/setWaveModel.test.ts src/breaker/crestTrace.test.ts --reporter=verbose --silent=false`
Expected: PASS (with the skips). Record the printed peak ψ₀ (low, mid, high at 12 ft) in the ledger: on today's 1:2 ledge
they are expected well above 0.1.

- [ ] **Step 6: Commit**

```bash
git rm src/breaker/reefStep.test.ts
git add src/breaker
git commit -m "feat(reef): psi0 per breaking level in the onset record (Pick & Feddersen's s / (H0/h0)^1/4), in place of the step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The crest and the lip's stations carry ψ (CPU)

**Files:**
- Modify: `src/breaker/setWaveModel.ts` (`ActiveWave`, `toActiveWave`, `BreakOptions.force`, `Crest`, `crestAt`)
- Modify: `src/breaker/crestTrace.ts` (`Station.psi`, `stationPsi`, `fillTimes`)
- Modify: `src/breaker/BreakingRibbon.ts` (`packStations`: float 10 = `s.psi`)
- Modify: `src/whitewater/sprayEmitters.ts` (the lip's input)
- Modify: `src/breaker/lipProfile.ts` (`ProfileInput` gains optional `psi` and `offshoreMs`; unused until Task 4)
- Modify: `src/breaker/breaking.ts` (remove `intensityNudge`; `randomDial` range [0, 0.15])
- Modify: `src/dev/DevPanel.ts` (`BREAK_BINDINGS`), `src/dev/DevPanel.test.ts`
- Delete: `src/breaker/breakIntensity.ts`, `src/breaker/breakIntensity.test.ts`, `src/breaker/barrelAnchors.test.ts`, `src/breaker/anchorViewer.test.ts`
- Modify: `src/breaker/setWaveModel.test.ts`, `src/breaker/crestTrace.test.ts`, `src/breaker/BreakingRibbon.test.ts`, `src/breaker/breaking.test.ts`

**Interfaces:**
- Consumes: `effectivePsi`, `drainFactor`, `withSheetShape`, `offshoreSpeed`, `PSI_NORMAL`, `PER_CREST_BREAK_KEYS` (Task 1); `onsetPsi` (Task 2).
- Produces: `ActiveWave.drainFactor?: number`; `BreakOptions.force?: { psi: number }`; `Crest.psi: number`;
  `Station.psi: number`; `stationPsi(field, w, x, z, input): number`; `ProfileInput.psi?: number`, `ProfileInput.offshoreMs?: number`.

- [ ] **Step 1: Write the failing tests**

Replace `setWaveModel.test.ts`'s `describe('break intensity at the crest (condition-driven barrel)', …)` with:

```ts
describe('ψ at the crest (barrel from the maths)', () => {
  const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
  const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 12;
  const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const w = toActiveWave(big), t = big.arrivalS;
  const crest = (wave = w, p = DEFAULT_BREAK_PARAMS) => crestAt(0, 0, t, sampleField(field, 0, 0), wave, ctx, breakOptions(field, p))!;
  it("the crest carries ψ₀ × the game rules, and its own sheet params (the trough drain and surge at its ψ)", () => {
    const cr = crest();
    const rec = sampleOnset(field, 0, 0)!, psi0 = onsetPsi(rec, 0, w.heightM, DEFAULT_BREAK_PARAMS);
    expect(cr.psi).toBeCloseTo(psi0 * (w.drainFactor ?? 1), 9);
    expect(cr.params.troughDrain).toBe(sheetShape(cr.psi).troughDrain);
    expect(cr.params.pileSurge).toBe(sheetShape(cr.psi).pileSurge);
  });
  it('stacking close behind lowers ψ, a lull raises it', () => {
    const stack = crest({ ...w, drainFactor: drainFactor(0.3 * 15, 15) }).psi, lull = crest({ ...w, drainFactor: drainFactor(Infinity, 15) }).psi;
    expect(stack).toBeLessThan(lull);
  });
  it('the dial at 0 ignores the draw; at 0.15 a draw of 1 is ×1.15', () => {
    const a = crest({ ...w, throwDraw: 1 }).psi, b = crest({ ...w, throwDraw: 0 }).psi;
    expect(a).toBe(b);
    const on = crest({ ...w, throwDraw: 1 }, { ...DEFAULT_BREAK_PARAMS, randomDial: 0.15 }).psi;
    expect(on).toBeCloseTo(1.15 * b, 9);
  });
  it('off the reef grid the crest reads ψ = PSI_NORMAL exactly', () => {
    const far = crestAt(5000, 5000, t, sampleField(field, 5000, 5000), w, ctx, breakOptions(field, DEFAULT_BREAK_PARAMS));
    if (far) expect(far.psi).toBe(PSI_NORMAL);
  });
  it('force pins every crest to one ψ (tests and the drawings)', () => {
    expect(crestAt(0, 0, t, sampleField(field, 0, 0), w, ctx, { ...breakOptions(field, DEFAULT_BREAK_PARAMS), force: { psi: 0.04 } })!.psi).toBe(0.04);
  });
});
```

Replace `crestTrace.test.ts`'s `describe('station intensity (condition-driven barrel)', …)` with the same shape of test
for ψ: `it("each station's ψ is the sheet's crest ψ there (the lip lands on water drained for its own shape)", …)`,
comparing `stationPsi(field, w, s.x, s.z, input)` with `crestAt(s.x, s.z, …, breakOptions(field, p, offshoreMs)).psi`
within 1e-6 for every non-gap station of a 12 ft trace. Update imports in both files (`onsetPsi`, `sheetShape`,
`drainFactor`, `PSI_NORMAL`, `stationPsi`).

In `BreakingRibbon.test.ts`, the two packing tests that expect the intensity (1) at float 10 now expect `PSI_NORMAL`
there for stations built with `psi: PSI_NORMAL`.

In `DevPanel.test.ts`, the check that every numeric `BreakParams` field has a binding excludes `PER_CREST_BREAK_KEYS`
(from `../breaker/overturn`) and, until Task 4 removes them, `lipReach`, `lipThickness`, `wallBack`.

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run src/breaker/setWaveModel.test.ts src/breaker/crestTrace.test.ts src/breaker/BreakingRibbon.test.ts src/dev`
Expected: FAIL (`psi` is undefined on the crest and station).

- [ ] **Step 3: Implement**

`setWaveModel.ts`:
- Imports: drop `breakIntensity`'s; add `import { PSI_NORMAL, drainFactor, effectivePsi, withSheetShape } from './overturn';` and `onsetPsi`.
- `ActiveWave`: replace `drainBonus?: number` with `/** The wave's drain factor on its ψ (overturn.drainFactor, a game rule); absent: 1. */ drainFactor?: number;` and update `throwDraw`'s comment to "The wave's random draw for the dial, in [−1, 1]; absent: 0."
- `toActiveWave`: `drainFactor: drainFactor(e.gapS, e.periodS), throwDraw: e.throwDraw,`.
- `BreakOptions`: `offshoreMs`'s comment names `overturn.offshoreSpeed`; `force?: { psi: number };` "Tests and the drawings: every crest takes this ψ."
- `Crest`: replace `intensity` with `/** The crest's ψ (overturn.effectivePsi of the record's ψ₀; PSI_NORMAL off the record). */ psi: number;` and `params`' comment: "o.params with the trough drain and surge at its ψ (overturn.withSheetShape)."
- In `crestAt`, replace the intensity block with:

```ts
  // Its ψ (spec 2026-09-30-barrel-from-maths §3), read on the point's own ray as the time since onset is. Off the
  // record: PSI_NORMAL, with no game rules (plan ruling 9).
  const psi = o.force?.psi ?? (rec
    ? effectivePsi(onsetPsi(rec, 0, w.heightM, o.params), { drain: w.drainFactor ?? 1, draw: w.throwDraw ?? 0 }, o.params)
    : PSI_NORMAL);
  const params = withSheetShape(o.params, psi);
```

  and return `psi` in place of `intensity`.

`crestTrace.ts`: `Station.intensity` → `/** The crest's ψ, as the sheet's crest there (setWaveModel.crestAt): the lip's shape. */ psi: number;`; `stationIntensity` → `stationPsi` with the body

```ts
  const rec = sampleOnset(field, x, z, onsetScratch);
  if (!rec) return PSI_NORMAL;
  return effectivePsi(onsetPsi(rec, 0, w.heightM, input.params), { drain: w.drainFactor ?? 1, draw: w.throwDraw ?? 0 }, input.params);
```

and in `fillTimes` every `intensity` → `psi`, `stationIntensity` → `stationPsi`. Where stations are created, `intensity: …` → `psi: PSI_NORMAL`.

`BreakingRibbon.ts` `packStations`: `s.intensity` → `s.psi`.

`lipProfile.ts` `ProfileInput`: add

```ts
  /** The crest's ψ (setWaveModel.Crest.psi): the tube's shape. Absent: PSI_NORMAL. */
  psi?: number;
  /** The wind's offshore speed (m/s, overturn.offshoreSpeed): the tube's wind factors. Absent: 0. */
  offshoreMs?: number;
```

`sprayEmitters.ts`: `import { offshoreSpeed } from '../breaker/overturn';` (drop the `breakIntensity` import); the frame
call becomes `profileFrame(base, { H: s.H, c: s.c, r: s.r, tb: s.tb, psi: s.psi, offshoreMs }, params)`.

`breaking.ts`: remove `intensityNudge` (interface, default, normalize); `randomDial`'s comment "each wave's ψ moves by up
to ± this fraction (its seeded draw); 0 is pure physics", its clamp `[0, 0.15]`.

`DevPanel.ts` `BREAK_BINDINGS`: remove `intensityNudge`, `troughDrain`, `pileSurge`; add
`psiNudge: { label: 'ψ nudge (×)', min: -0.5, max: 0.5, step: 0.01 },`; `randomDial`'s max 0.15.

Delete `breakIntensity.ts`, `breakIntensity.test.ts`, `barrelAnchors.test.ts` and `anchorViewer.test.ts` (the anchors are
gone; Task 4 rewrites their collapse checks against the tube, Task 6 the drawings). Grep for any remaining importer of
`./breakIntensity` and switch it to `./overturn`.

Remove the `it.skip`s Task 2 left: those tests are replaced above.

- [ ] **Step 4: Run**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/breaker src/whitewater src/dev`
Expected: PASS. `BreakingRibbon.limits.test.ts` and `plants.test.ts` can time out under the full suite's load: rerun
them alone and record both runs.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(crest): the crest and the lip's stations carry psi (the reef's psi0 x the game rules); the sheet's trough and surge follow it; the anchors and intensity retire

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The lip from the maths (CPU)

**Files:**
- Modify: `src/breaker/lipProfile.ts` (the frame, the samples, the lip's thickness, `riding`, `profilePoint`'s foam; remove
  `barrelMetrics`, `outer`, `outerNormal`, `under`, `faceAt`, `FACE_AT_BISECT`, `WALL_HEIGHT`, `LANDING_REFINE`,
  `TIP_LAND_REFINE`, `LIP_GROW_PROGRESS`, `MAX_THICKNESS_OF_RADIUS`, `MIN_LIP_THICKNESS_M`, `LAND_CLEARANCE_M` use in the frame)
- Modify: `src/breaker/breaking.ts` (remove `lipReach`, `LIP_REACH_RANGE`, `lipThickness`, `wallBack`)
- Modify: `src/dev/DevPanel.ts`, `src/dev/DevPanel.test.ts` (drop the three bindings and exclusions)
- Modify: `src/breaker/lipProfileNodes.ts` (compile only: remove the three uniforms; Task 8 rewrites it)
- Modify: `src/whitewater/sprayEmitters.ts` (the tip and the landing from the frame's fields)
- Create: `src/breaker/peakStation.fixture.ts`, `src/breaker/overturnProfile.test.ts`
- Modify: `src/breaker/lipProfile.test.ts`, `src/dev/devSettings.test.ts`

**Interfaces:**
- Consumes: `overturnShape`, `windUC`, `PSI_NORMAL` (Task 1); `Tube`, `tubeAxes`, `tubeUpper`, `tubeLower`,
  `tubeUpperNormal`, `tubeTopXi`, `tubeBackMostX`, `tubeUpperArc`, `tubeWaterXi` (Task 1); `ProfileInput.psi`,
  `ProfileInput.offshoreMs`, `BreakOptions.force.psi` (Task 3).
- Produces:
  - constants `TUBE_BACK_AHEAD_H = 0.03`, `LIP_TAPER_POWER = 0.8`, `FACE_JOIN_MIN_M = 1`, `OUTER_LIP_SHARE = 0.85`, `FACE_DIR_STEP = 0.02`
  - `ProfileFrame` fields: `K, F, tF, uFoot, uFront, uBack, tauLand, prog, weight, collapse, landing, rho, uLand, shape,
    tube, xiTop, xiTip, xiEnd, tTop, tipE, tip, P, vj, reach, lift?`
  - `lipThicknessAt(f: ProfileFrame, xi: number): number`
  - `sheetYAt(base: (u: number) => Vec2, K: Vec2, x: number): number`
  - `tubeMetrics(p: Profile): { area: number; aspect: number; tiltDeg: number; lipArea: number }` (test helper)
  - `peakStation.fixture.ts`: `field`, `ctx`, `BIG12`, `wave`, `peakStation(psi, tb, opts?)`, `peakLanding(psi, opts?)`

- [ ] **Step 1: Write the fixture and the failing tests**

```ts
// src/breaker/peakStation.fixture.ts
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, breakingRatio, onsetTime } from './breaking';
import { type ProfileInput, type Vec2, profileFrame } from './lipProfile';
import { withSheetShape } from './overturn';
import { type ReefField, computeReefField, sampleField, sampleOnset } from './reefField';
import { type ActiveWave, type BreakOptions, breakOptions, localHeight, sumWaves } from './setWaveModel';

/**
 * Stations on the peak's ray for tests and the drawings (not a test file itself, so importing it doesn't rerun tests):
 * the biggest set wave at a size and tide, every crest forced to one ψ, the sheet and the lip on one clock.
 */
export function peakSetup(sizeFt = 12, tideM = 0): { field: ReefField; wave: ActiveWave; ctx: { omega: number; travelX: number; travelZ: number } } {
  const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM });
  const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = sizeFt;
  const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const wave: ActiveWave = { arrivalS: 0, heightM: big.heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };
  return { field, wave, ctx };
}
const MID12 = peakSetup();
export const { field, wave, ctx } = MID12;

const P = DEFAULT_BREAK_PARAMS;
/** The station on the peak's ray whose section has been broken tb seconds (null: 40 m up the ray, unbroken), at ψ. */
export function peakStation(psi: number, tb: number | null, o: { setup?: ReturnType<typeof peakSetup>; offshoreMs?: number } = {}) {
  const { field: f, wave: w, ctx: cx } = o.setup ?? MID12;
  const f00 = sampleField(f, 0, 0);
  const onRay = (s: number) => ({ x: f00.dirX * s, z: f00.dirZ * s });
  const tbAlong = (s: number): number | null => { const p = onRay(s); const rec = sampleOnset(f, p.x, p.z); return rec ? onsetTime(rec, 0, w.heightM, P) : null; };
  let s0 = -40;
  if (tb !== null) { let lo = -60, hi = 60; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, v = tbAlong(m); if (v === null || v < tb) lo = m; else hi = m; } s0 = (lo + hi) / 2; }
  const p0 = onRay(s0), f0 = sampleField(f, p0.x, p0.z), t = f0.tau;
  const sheet: BreakOptions = { ...breakOptions(f, P, o.offshoreMs ?? 0), force: { psi } };
  const along = (opt: BreakOptions) => (u: number): Vec2 => {
    const x = p0.x + f0.dirX * u, z = p0.z + f0.dirZ * u, r = sumWaves(x, z, t, sampleField(f, x, z), [w], cx, opt);
    return [u + r.dx * f0.dirX + r.dz * f0.dirZ, r.eta];
  };
  const input: ProfileInput = { H: localHeight(w, f0), c: cx.omega / f0.k, r: breakingRatio(w.heightM * f0.amp, f0.hminBreak, P), tb: tb === null ? null : tbAlong(s0), psi, offshoreMs: o.offshoreMs ?? 0 };
  return { base: along(sheet), frameBase: along({ ...sheet, pile: false }), input, lip: withSheetShape(P, psi), s0 };
}
/** The lip's landing time at ψ: the station where tb equals its own τ_land (three fixed-point steps from 1 s). */
export function peakLanding(psi: number, o: { setup?: ReturnType<typeof peakSetup>; offshoreMs?: number } = {}): number {
  let tb = 1;
  for (let i = 0; i < 3; i++) { const st = peakStation(psi, tb, o); tb = profileFrame(st.frameBase, st.input, st.lip).tauLand; }
  return tb;
}
```

```ts
// src/breaker/overturnProfile.test.ts
import { describe, expect, it } from 'vitest';
import { PROFILE_SEGMENTS, buildProfile, crossings, foldDepth, sheetYAt, tubeMetrics } from './lipProfile';
import { aspectFit, lipAreaFit, overturnShape, tiltFitDeg, tubeAreaFit } from './overturn';

import { peakLanding, peakStation } from './peakStation.fixture';

const n = PROFILE_SEGMENTS, faceStart = n.front, wallStart = n.front + n.face, wallEnd = wallStart + n.wall;
const prof = (psi: number, tb: number | null) => { const s = peakStation(psi, tb); return { s, p: buildProfile(s.base, s.input, s.lip, s.frameBase) }; };

describe('the lip from the maths (spec 2026-09-30-barrel-from-maths §3.2–3.4)', () => {
  it('at landing the drawn tube is the equations: area ±3%, width ÷ length ±8%, tilt ±3°, lip area ±25%', () => {
    for (const psi of [0.03, 0.045, 0.06]) {
      const { s, p } = prof(psi, peakLanding(psi)), H = s.input.H, m = tubeMetrics(p);
      console.log(`ψ ${psi}: ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(3)])))}`);
      expect(Math.abs(m.area / (tubeAreaFit(psi) * H * H) - 1), 'tube area').toBeLessThanOrEqual(0.03);
      expect(Math.abs(m.aspect / aspectFit(psi) - 1), 'width ÷ length').toBeLessThanOrEqual(0.08);
      expect(Math.abs(m.tiltDeg - tiltFitDeg(psi)), 'tilt').toBeLessThanOrEqual(3);
      expect(Math.abs(m.lipArea / (lipAreaFit(psi) * H * H) - 1), 'lip area').toBeLessThanOrEqual(0.25);
    }
  });
  it('the lip lands on the water under it, never in the air; on the face in state 4, past the foot from state 6', () => {
    for (let psi = 0.02; psi <= 0.1201; psi += 0.01) {
      const { s, p } = prof(psi, peakLanding(psi)), f = p.frame;
      expect(Math.abs(f.P[1] - sheetYAt(s.frameBase, f.K, f.P[0])), `ψ ${psi.toFixed(2)}: the landing off the sheet (m)`).toBeLessThanOrEqual(0.05);
    }
    const oval = prof(0.035, peakLanding(0.035)).p.frame, thrown = prof(0.09, peakLanding(0.09));
    const footX = thrown.s.frameBase(1.9 * 0.5 * thrown.s.input.H)[0];
    expect(oval.P[0], 'state 4 lands on the face, before the foot').toBeLessThan(oval.F[0]);
    expect(thrown.p.frame.P[0], 'state 6 lands past the foot').toBeGreaterThanOrEqual(footX - 0.5);
  });
  it('the face is one smooth concave curve from the trough to the lip: no step, no pocket behind the crest (Andrew, 2026-09-30)', () => {
    for (const psi of [0.025, 0.04, 0.06, 0.08, 0.1, 0.15]) {
      const tau = peakLanding(psi);
      for (const frac of [0.3, 0.6, 0.9, 1]) {
        const { s, p } = prof(psi, frac * tau), pts = p.points;
        let lo = 0;
        for (let j = 0; j < wallStart; j++) if (pts[j][1] < pts[lo][1]) lo = j;
        for (let j = Math.max(lo, faceStart - 2) + 1; j + 1 < wallEnd; j++) {
          if (j === wallStart) continue; // where the lip meets the face
          const a = [pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]], b = [pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]];
          const la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
          if (la < 1e-6 || lb < 1e-6) continue;
          expect((a[0] * b[1] - a[1] * b[0]) / (la * lb), `ψ ${psi} at ${frac} of the throw: sample ${j} turns back`).toBeLessThanOrEqual(0.05);
        }
        const backMost = Math.min(...pts.slice(wallStart, wallEnd).map((q) => q[0]));
        expect(backMost, `ψ ${psi} at ${frac}: the tube's back behind the crest`).toBeGreaterThanOrEqual(p.frame.K[0] - 1e-6);
        expect(Number.isFinite(s.input.H)).toBe(true);
      }
    }
  });
  it('never crosses itself before the lip lands; at contact the tip meets the water by at most 5 cm', () => {
    for (const psi of [0.015, 0.03, 0.05, 0.07, 0.09, 0.12, 0.3]) {
      const tau = peakLanding(psi);
      for (const frac of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 0.99, 0.999]) {
        const pts = prof(psi, frac * tau).p.points;
        if (frac < 0.99) expect(crossings(pts), `ψ ${psi} ${frac}`).toBe(0);
        else expect(foldDepth(pts), `ψ ${psi} ${frac}`).toBeLessThanOrEqual(0.05);
      }
    }
  });
  it('after it lands the tip stays where it landed, and the tube fills with no fold, step or horn, to the hand-back', () => {
    for (const psi of [0.035, 0.065, 0.09]) {
      const tau = peakLanding(psi), L0 = prof(psi, tau);
      const standing = Math.max(...L0.p.points.map((q) => q[1]));
      for (const dt of [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5]) {
        const { s, p } = prof(psi, tau + dt), pts = p.points, f = p.frame;
        expect(foldDepth(pts), `ψ ${psi} +${dt} s: fold`).toBeLessThanOrEqual(0.1);
        const jump = (i: number) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        const r = pts.length - n.back - 1, fi = n.front - 1;
        expect(jump(r), `ψ ${psi} +${dt}: step at the crest`).toBeLessThanOrEqual(1.2 * Math.max(jump(r - 1), jump(r + 1)) + 0.1);
        expect(jump(fi), `ψ ${psi} +${dt}: step at the foot`).toBeLessThanOrEqual(1.2 * Math.max(jump(fi - 1), jump(fi + 1)) + 0.1);
        const mound = Math.max(...p.homes.map((u) => s.base(u)[1]));
        expect(Math.max(...pts.map((q) => q[1])), `ψ ${psi} +${dt}: horn`).toBeLessThanOrEqual(Math.max(standing, mound) + 0.2);
        if (f.weight >= 0.2) {
          const capStart = n.front + n.face + n.wall + n.under, tipPt = pts[capStart];
          expect(Math.hypot(tipPt[0] - f.P[0], tipPt[1] - f.P[1] - (s.base(f.uLand)[1] - s.frameBase(f.uLand)[1])), `ψ ${psi} +${dt}: the tip left where it landed`).toBeLessThanOrEqual(0.5 + 0.3 * (1 - f.weight) * s.input.H);
        }
      }
    }
  });
  it('onshore wind shrinks the tube at the same wave; offshore grows it up to the cap', () => {
    const at = (off: number) => { const s = peakStation(0.06, peakLanding(0.06, { offshoreMs: off }), { offshoreMs: off }); return tubeMetrics(buildProfile(s.base, s.input, s.lip, s.frameBase)).area; };
    expect(at(-8)).toBeLessThan(at(0));
    expect(at(8)).toBeGreaterThan(at(0));
    expect(at(8)).toBeLessThanOrEqual(1.2 * at(0) * 1.03);
  });
  it('below ψ 0.01 the ribbon is exactly the sheet (no tube: B crumbles it)', () => {
    const { s, p } = prof(0.005, 0.5);
    p.points.forEach((q, j) => { const b = s.base(p.homes[j]); expect(Math.hypot(q[0] - b[0], q[1] - b[1])).toBeLessThan(1e-9); });
  });
  it('stays finite from ψ 0 to 1, for tiny and huge times', () => {
    for (const psi of [0, 0.01, 0.5, 1]) for (const tb of [null, 0, 1e-6, 0.4, 5, Infinity]) {
      const { p } = prof(psi, tb as number | null);
      for (const q of p.points) { expect(Number.isFinite(q[0])).toBe(true); expect(Number.isFinite(q[1])).toBe(true); }
    }
    expect(overturnShape(Number.NaN, 7, 0).L).toBeGreaterThan(0);
  });
});
```

In `lipProfile.test.ts`:
- Delete "the tip follows the ballistic arc from the crest" and "the lip is never thinner than 2 cm once it has grown"
  (their parameters are gone; `overturnProfile.test.ts` covers the tip and the thickness).
- "the biggest default wave at the peak lands its lip 0.6–1.5 s after onset…" becomes
  `it('the biggest default wave at the peak lands its lip 0.4–1.5 s after onset (a free fall from the crest)', …)`
  asserting `0.4 < f.tauLand < 1.5` and `Math.abs(f.tauLand - Math.sqrt((2 * (f.K[1] - f.P[1])) / GRAVITY_MS2)) < 1e-9`.
- In "never crosses itself…", the parameter variations `{ ...LIP, lipReach: … }`, `{ ...LIP, lipThickness: … }` become
  station inputs `{ ...input, psi: 0.015 }`, `{ ...input, psi: 0.3 }`; keep the `faceWidth` variations; the contact
  check at frac ≥ 0.99 uses `foldDepth ≤ 0.05`.
- "the foam zones" keeps its assertions; wherever it named `outer`/`under` sigma, it reads the frame's `xiTip`.

In `devSettings.test.ts` add:

```ts
it('a stored look from before the maths barrel (the old shape sliders) loads and changes no crest', () => {
  const p = { ...DEFAULT_BREAK_PARAMS };
  assignParams(p, { ...DEFAULT_BREAK_PARAMS, throwStrength: 1.2, lipReach: 0.7, lipThickness: 0.2, wallBack: 0.5, intensityNudge: 0.3 } as unknown as BreakParams);
  normalizeBreakParams(p);
  expect(p).toEqual(DEFAULT_BREAK_PARAMS);
});
```

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run src/breaker/overturnProfile.test.ts src/breaker/lipProfile.test.ts src/dev/devSettings.test.ts`
Expected: FAIL (`tubeMetrics` and the new frame fields don't exist; the stored look still carries the old keys through
`DEFAULT_BREAK_PARAMS`).

- [ ] **Step 3: The frame**

In `lipProfile.ts`, replace the constants block's lip-specific entries (`LAND_CLEARANCE_M` stays for `uFront`) with:

```ts
/** The tube's round back sits this many H ahead of the crest's vertical (Pick & Feddersen Fig. 6b: just ahead of it). */
export const TUBE_BACK_AHEAD_H = 0.03;
/** The lip thins from its thickest (over the tube's top) to its tip as (1 − u)^LIP_TAPER_POWER (plan ruling 4). */
export const LIP_TAPER_POWER = 0.8;
/** Where the lip lands beyond the wave's foot, the face below it rejoins the sheet at least this far past it (m). */
export const FACE_JOIN_MIN_M = 1;
/** The outer samples' share on the lip's band (the rest run level from the tube's top to the crest). */
export const OUTER_LIP_SHARE = 0.85;
/** The face leaves the landing point toward the tube's lower side this far back along it (ξ). */
export const FACE_DIR_STEP = 0.02;
```

Keep `FOOT_WIDTHS`, `EDGE_MARGIN_M`, `BACK_EDGE_H`, `TIP_THICKNESS_RATIO`, `HAND_BACK_S`, `LANDING_FOAM_RISE`,
`BACK_OFF_DROP_H`, `HOME_SETTLE`, `LAND_CLEARANCE_M`. `LipParams` becomes
`Pick<BreakParams, 'collapseTime' | 'ribbonOnset' | 'faceWidth' | 'troughDrain' | 'delta'>`.

Replace the `ProfileFrame` interface with:

```ts
export interface ProfileFrame {
  /** The crest top on the frame's sheet (u = 0). */
  K: Vec2;
  /** Where the face leaves the sheet (u = uFoot): the wave's foot, or past the landing if the lip lands beyond it; the
   * sheet's direction there, back up toward the crest. */
  F: Vec2;
  tF: Vec2;
  uFoot: number;
  uFront: number;
  uBack: number;
  /** The free fall from the crest top to the landing point (s); the throw's progress t/τ_land in [0, 1]. */
  tauLand: number;
  prog: number;
  /** The constructed curve's share against the sheet: steep × (1 − collapse) × the tube's presence. */
  weight: number;
  collapse: number;
  landing: number;
  rho: number;
  /** The pile's landing knot (PileLift): the face's join. */
  uLand: number;
  /** The tube at impact (overturn.overturnShape), and as it stands now (its width grown to W·prog, clipped at P.y). */
  shape: Overturn;
  tube: Tube;
  /** The upper side's top (ξ), the lip's tip now (ξ), where it lands (ξ: 1, or where the water cuts the tube). */
  xiTop: number;
  xiTip: number;
  xiEnd: number;
  /** The lip's thickness over the tube's top, and at its tip now (m). */
  tTop: number;
  tipE: number;
  /** The lip's tip now (on the tube's upper side) and where it lands. */
  tip: Vec2;
  P: Vec2;
  /** The tip's mean speed across (m/s) and how far ahead of the crest it is now (m): the emitters read them. */
  vj: number;
  reach: number;
  /** The whitewater pile's lift under the curl (pileLift): absent, none (the frame's own sheet is the profile's). */
  lift?: PileLift;
}
```

Replace `profileFrame` with:

```ts
/**
 * The station's frame (spec 2026-09-30-barrel-from-maths §3.2–3.3): the tube at impact from ψ, H and the wind, placed
 * with its round back just ahead of the crest and its top the lip's thickness under it; where the lip lands (the tube's
 * point, or where its upper side first reaches the water in front); the free-fall clock; and the throw's progress, over
 * which the tube's width grows and the tip runs along its upper side (plan rulings 1–5).
 */
export function profileFrame(base: (u: number) => Vec2, input: ProfileInput, p: LipParams): ProfileFrame {
  const { H, c, r, tb } = input;
  const shape = overturnShape(input.psi ?? PSI_NORMAL, H, windUC(input.offshoreMs ?? 0, c));
  const uFootWave = FOOT_WIDTHS * p.faceWidth * H;
  const K = base(0), F0 = base(uFootWave);
  const { d, n } = tubeAxes(shape.theta);
  const at0: Tube = { O: [0, 0], d, n, L: shape.L, W: shape.W, clipY: -Infinity };
  const xiTop = tubeTopXi(at0), top0 = tubeUpper(at0, xiTop);
  const tTop = (shape.AJ * (1 + LIP_TAPER_POWER)) / Math.max(tubeUpperArc(at0, xiTop, 1), 1e-3);
  const O0: Vec2 = [K[0] + TUBE_BACK_AHEAD_H * H - tubeBackMostX(at0), K[1] - tTop - top0[1]];
  // The lip lands on the water under it (plan ruling 3): a point hanging above the sheet drops onto it (the lip over the
  // tube's top thickening by as much); a point below it lands where the upper side first comes down to it.
  const point0 = tubeUpper({ ...at0, O: O0 }, 1), under = sheetYAt(base, K, point0[0]);
  const drop = Math.max(0, point0[1] - under);
  const full: Tube = { ...at0, O: [O0[0], O0[1] - drop] };
  const xiEnd = point0[1] - drop < under - 1e-6 ? tubeWaterXi(full, xiTop, under) : 1;
  const P = tubeUpper(full, xiEnd);
  const tauLand = landingTime(K[1] - P[1]);
  const uFoot = P[0] <= F0[0] - FACE_JOIN_MIN_M ? uFootWave : uFootWave + (P[0] - F0[0]) + FACE_JOIN_MIN_M;
  const F = uFoot === uFootWave ? F0 : base(uFoot), Fb = base(uFoot - 0.1);
  const tF = norm2([Fb[0] - F[0], Fb[1] - F[1]]);
  const t = tb === null ? 0 : Math.min(Math.max(tb, 0), tauLand);
  const prog = t / tauLand;
  const tube: Tube = { ...full, W: shape.W * prog, clipY: P[1] };
  const xiTip = prog * prog * xiEnd;
  const tip = tubeUpper(tube, xiTip);
  const steep = tb === null
    ? steepening(r, p) * smoothstep(p.ribbonOnset, p.ribbonOnset + RIBBON_FULL_OFFSET, r)
    : smoothstep(BACK_OFF_DROP_H[0] * H, BACK_OFF_DROP_H[1] * H, K[1] - F0[1]);
  const span = settleSpan(H, p);
  const settleFrom = Math.max(tauLand, landingEstimate(H, p));
  const collapse = tb === null ? 0 : smoothstep(settleFrom, settleFrom + span, tb);
  const landing = tb === null ? 0 : smoothstep(tauLand, tauLand + LANDING_FOAM_RISE * span, tb);
  return {
    K, F, tF, uFoot, uFront: uFoot + LAND_CLEARANCE_M + EDGE_MARGIN_M, uBack: -(BACK_EDGE_H * H + EDGE_MARGIN_M),
    tauLand, prog, weight: steep * (1 - collapse) * shape.presence, collapse, landing, rho: ribbonWeight(r, tb, settleFrom, span, p),
    uLand: uFoot, shape, tube, xiTop, xiTip, xiEnd, tTop: tTop + drop, tipE: TIP_THICKNESS_RATIO * (tTop + drop) * (1 - prog), tip, P,
    vj: (P[0] - K[0]) / tauLand, reach: tip[0] - K[0],
  };
}
```

and add the helper:

```ts
/** The frame sheet's height at x (the sheet is single-valued in x in front of the crest): u from x − K.x, four steps of
 * u += x − base(u).x (base(u) is displaced from u). */
export function sheetYAt(base: (u: number) => Vec2, K: Vec2, x: number): number {
  let u = x - K[0], q = base(u);
  for (let i = 0; i < 4; i++) { u += x - q[0]; q = base(u); }
  return q[1];
}
```

Imports: `overturnShape`, `windUC`, `PSI_NORMAL`, `type Overturn` from `./overturn`; the `tube.ts` functions and
`type Tube`; `landingEstimate` stays (`settleFrom`).

- [ ] **Step 4: The samples**

Replace `lipThicknessAt`, `outer`, `outerNormal`, `under` and `constructed` with:

```ts
/** The lip's thickness at ξ on its band (the tube's top to its tip): t_top there, the tip's now at the tip, tapering as
 * (1 − u)^LIP_TAPER_POWER between; t_top behind the top; the tip's alone before the tip has reached the top. */
export function lipThicknessAt(f: ProfileFrame, xi: number): number {
  if (f.xiTip <= f.xiTop) return f.tipE;
  if (xi <= f.xiTop) return f.tTop;
  const u = Math.min(1, (xi - f.xiTop) / (f.xiTip - f.xiTop));
  return f.tipE + (f.tTop - f.tipE) * (1 - u) ** LIP_TAPER_POWER;
}

/** The constructed (unblended) point for sample j, its lip thickness, lipness, and the x its lift is read at. */
function constructed(j: number, f: ProfileFrame, baseHome: Vec2): { pos: Vec2; thickness: number; lipness: number; liftX: number } {
  const { seg, s } = sampleSegment(j);
  const on = (pos: Vec2, thickness = 0, lipness = 0, liftX = pos[0]) => ({ pos, thickness, lipness, liftX });
  switch (seg) {
    case 'front':
    case 'back':
      return on(baseHome);
    case 'face': {
      // From where the face leaves the sheet up to where the lip lands, arriving along the tube's lower side.
      const back = tubeLower(f.tube, f.xiEnd * (1 - FACE_DIR_STEP));
      const dP = norm2([back[0] - f.P[0], back[1] - f.P[1]]), Lf = Math.hypot(f.P[0] - f.F[0], f.P[1] - f.F[1]);
      return on(hermite(f.F, [f.tF[0] * Lf, f.tF[1] * Lf], f.P, [dP[0] * Lf, dP[1] * Lf], s));
    }
    case 'wall': // the tube's lower side, from where the lip lands back up to its round end
      return on(s === 0 ? f.P : tubeLower(f.tube, f.xiEnd * (1 - s)));
    case 'under': { // the tube's upper side, the lip's underside, from the round end out to the tip
      const xi = s * f.xiTip, pt = tubeUpper(f.tube, xi);
      return on(pt, lipThicknessAt(f, xi), 1, pt[0]);
    }
    case 'cap': { // round the tip, from the underside to the outer surface
      const no = tubeUpperNormal(f.tube, f.xiTip), e = f.tipE;
      const cx = f.tip[0] + (no[0] * e) / 2, cy = f.tip[1] + (no[1] * e) / 2;
      const a = Math.atan2(-no[1], -no[0]) + Math.PI * s;
      return on([cx + (Math.cos(a) * e) / 2, cy + (Math.sin(a) * e) / 2], e, 1, f.tip[0]);
    }
    default: { // outer: the lip's band from the tip back to the tube's top, then level to the crest
      if (f.xiTip > f.xiTop && s <= OUTER_LIP_SHARE) {
        const xi = f.xiTip + (f.xiTop - f.xiTip) * (s / OUTER_LIP_SHARE);
        const u = tubeUpper(f.tube, xi), no = tubeUpperNormal(f.tube, xi), e = lipThicknessAt(f, xi);
        return on([u[0] + no[0] * e, u[1] + no[1] * e], e, 1, u[0]);
      }
      const fromXi = f.xiTip > f.xiTop ? f.xiTop : f.xiTip, e = f.xiTip > f.xiTop ? f.tTop : f.tipE;
      const u = tubeUpper(f.tube, fromXi), no = tubeUpperNormal(f.tube, fromXi), a: Vec2 = [u[0] + no[0] * e, u[1] + no[1] * e];
      const k = f.xiTip > f.xiTop ? (s - OUTER_LIP_SHARE) / (1 - OUTER_LIP_SHARE) : s;
      return on(lerp2(a, f.K, k), e * (1 - k), 1, u[0] + (f.K[0] - u[0]) * k);
    }
  }
}
```

In `riding`: the face ramp is `lerp2(capped(f.F[0]), capped(f.P[0]), s)`; every other curl segment takes
`capped(c.liftX)` (pass the constructed record into `riding` instead of its position: `riding(j, f, c)` with
`c.pos`/`c.liftX`). In `sampleTarget`, `riding(j, f, constructed(j, f, [0, 0]))[0]` is the x to settle under. In
`profilePoint`: `landAt = f.P[0]`; the spray's σ is `seg === 'outer' ? (f.xiTip > 0 ? Math.max(0, Math.min(1, 1 - s / OUTER_LIP_SHARE)) : 0) : seg === 'cap' ? 1 : 0`.

Remove `barrelMetrics` and `BarrelMetrics`; add the test helper:

```ts
/** The tube's measurements off a profile at the lip's landing (tests): its area (the wall and underside samples, closed),
 * width ÷ length and tilt about its farthest point from where the lip lands, and the lip's band area. */
export function tubeMetrics(p: Profile): { area: number; aspect: number; tiltDeg: number; lipArea: number } {
  const n = PROFILE_SEGMENTS, w0 = n.front + n.face, u0 = w0 + n.wall, c0 = u0 + n.under, o0 = c0 + n.cap;
  const shoelace = (q: readonly Vec2[]): number => { let a = 0; for (let i = 0; i < q.length; i++) { const x = q[i], y = q[(i + 1) % q.length]; a += x[0] * y[1] - y[0] * x[1]; } return Math.abs(a) / 2; };
  const tube = p.points.slice(w0, c0), P = p.frame.P;
  let far = tube[0], best = -1;
  for (const q of tube) { const d = Math.hypot(q[0] - P[0], q[1] - P[1]); if (d > best) { best = d; far = q; } }
  const ax: Vec2 = norm2([far[0] - P[0], far[1] - P[1]]), across: Vec2 = [-ax[1], ax[0]];
  const w = tube.map((q) => (q[0] - P[0]) * across[0] + (q[1] - P[1]) * across[1]);
  const band = [...p.points.slice(u0, c0), ...p.points.slice(o0, o0 + Math.round(n.outer * OUTER_LIP_SHARE)).reverse()];
  return { area: shoelace(tube), aspect: (Math.max(...w) - Math.min(...w)) / best, tiltDeg: (Math.atan2(ax[1], -ax[0]) * 180) / Math.PI, lipArea: shoelace(band) };
}
```

(The tilt reads the angle of the round end above the landing point, looking back: θ below the horizontal from the round
end down to the point.)

- [ ] **Step 5: The parameters and the callers**

- `breaking.ts`: remove `lipReach`, `LIP_REACH_RANGE`, `lipThickness`, `wallBack` (interface, defaults, normalize).
- `DevPanel.ts`: remove their bindings and the `LIP_REACH_RANGE` import; `DevPanel.test.ts`: remove their exclusions.
- `lipProfileNodes.ts`: remove the `lipReach`, `lipThickness`, `wallBack` uniforms and their updates; in
  `profileFrameNode` replace `u.lipReach.mul(c)` with `c` and `u.lipThickness` with `float(0.2)`, `u.wallBack` with
  `float(0)`, with the comment `// Task 8 rewrites this mirror to the tube from the maths.` (It must compile; the GPU lip
  is stale until Task 8, as the ledger already records.)
- `sprayEmitters.ts`: the spray's position is `f.tip` (u = `f.tip[0]`, y = `f.tip[1]`), the impact's is `f.P`; the
  velocity across stays `f.vj`.

- [ ] **Step 6: Run**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/breaker/overturnProfile.test.ts src/breaker/lipProfile.test.ts src/dev --reporter=verbose --silent=false`
Expected: PASS. Then `npx vitest run src/breaker src/whitewater src/dev`: PASS (reruns for the two known timeouts).

If the area check fails by more than 3%, print `tubeMetrics` against `shape.AO` and compare the wall/under sample counts
(12 + 28): the polygon must close at the point (under's last sample is the tip at `xiTip = xiEnd`). Don't widen the
tolerance.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(lip): the barrel from the maths (CPU): the Longuet-Higgins tube at the fitted size, shape and tilt, placed under the crest, the lip landing where it falls; the throw grows it on the free-fall clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The softened ledge

**Files:**
- Modify: `src/seabed/bathymetry.ts` (the seaward ramp), `src/seabed/wombReef.ts` (`ledgeWidthM`'s default and doc)
- Modify: `src/seabed/bathymetry.test.ts`
- Modify: `src/dev/DevPanel.ts` (the reef folder's ledge-width range)
- Modify: `src/breaker/reefPsi.test.ts` (the table on the softened reef)
- Modify: any field-dependent test the new reef moves (see Step 5)

**Interfaces:**
- Consumes: `onsetPsi`, `psiState` (Tasks 1–2).
- Produces: `rampShape(v: number): number` (exported from `bathymetry.ts`); `DEFAULT_REEF_PARAMS.ledgeWidthM` calibrated.

- [ ] **Step 1: Write the failing tests**

```ts
// src/seabed/bathymetry.test.ts (add)
it('the seaward ramp: v³(4 − 3v), flat at both ends, steepest two thirds of the way out (plan ruling 10)', () => {
  expect(rampShape(0)).toBe(0);
  expect(rampShape(1)).toBe(1);
  expect(rampShape(2)).toBe(1);
  const slope = (v: number) => (rampShape(v + 1e-4) - rampShape(v - 1e-4)) / 2e-4;
  expect(slope(1e-4)).toBeLessThan(1e-3);
  expect(Math.abs(slope(1 - 1e-4))).toBeLessThan(2e-3);
  expect(slope(2 / 3)).toBeGreaterThan(slope(0.3));
  expect(slope(2 / 3)).toBeGreaterThan(slope(0.9));
});
it('the ledge line stays at the ledge depth, and nothing outside the shelf near the peak is steeper than 1:8', () => {
  const b = buildBathymetry(), g = b.grid, W = DEFAULT_REEF_PARAMS.ledgeWidthM;
  const d = (c: number, r: number) => -b.bed[r * g.nx + c];
  const c0 = Math.round(-g.x0 / g.cellM), r0 = Math.round(-g.z0 / g.cellM);
  expect(d(c0, r0)).toBeCloseTo(DEFAULT_REEF_PARAMS.ledgeDepthM, 1);
  let steepest = 0;
  for (let r = 1; r < g.nz - 1; r++) for (let c = 1; c < g.nx - 1; c++) {
    const x = g.x0 + c * g.cellM, z = g.z0 + r * g.cellM;
    if (Math.hypot(x, z) > W + 20 || d(c, r) <= DEFAULT_REEF_PARAMS.ledgeDepthM + 0.5) continue; // the ramp, not the shelf
    steepest = Math.max(steepest, Math.hypot(d(c + 1, r) - d(c - 1, r), d(c, r + 1) - d(c, r - 1)) / (2 * g.cellM));
  }
  expect(steepest).toBeLessThanOrEqual(1 / 8 + 0.02);
});
```

Keep `bathymetry.test.ts`'s existing checks; "drops to deep water just seaward of the ledges" moves its sample points out
past `ledgeWidthM` (read the constant rather than a literal).

Replace `reefPsi.test.ts`'s last test with the table on the softened reef:

```ts
  it('on the softened ledge: 12 ft mid tide reads state 5, low ≥ mid ≥ high at the same size, too big breaks outside', () => {
    const rows: string[] = [];
    for (const ft of [4, 6, 8, 10, 12, 15]) {
      const h = biggest(ft), v = [low, mid, high].map((f) => psiAt(f, 0, 0, h));
      rows.push(`${ft} ft: low ${v[0].toFixed(3)} mid ${v[1].toFixed(3)} high ${v[2].toFixed(3)}`);
    }
    console.log(rows.join('\n'));
    const h12 = biggest(12), p12 = psiAt(mid, 0, 0, h12);
    expect(p12).toBeGreaterThanOrEqual(0.055);
    expect(p12).toBeLessThanOrEqual(0.075);
    for (const ft of [6, 8]) { const h = biggest(ft); expect(psiAt(low, 0, 0, h)).toBeGreaterThanOrEqual(psiAt(mid, 0, 0, h) - 0.005); expect(psiAt(mid, 0, 0, h)).toBeGreaterThanOrEqual(psiAt(high, 0, 0, h) - 0.005); }
    expect(psiAt(low, 0, 0, biggest(15))).toBeLessThan(0.05);
    expect(psiAt(high, 0, 0, biggest(4))).toBeLessThan(0.05);
  });
```

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run src/seabed/bathymetry.test.ts src/breaker/reefPsi.test.ts`
Expected: FAIL (`rampShape` not exported; the 1:2 ledge is steeper than 1:8; 12 ft mid tide reads past 0.1).

- [ ] **Step 3: The ramp**

In `bathymetry.ts`:

```ts
/**
 * The seaward ramp's shape: how far from the ledge depth to the deep water at v = (distance seaward of the ledge line) ÷
 * the ramp's width: v³(4 − 3v), flat at the ledge and at the deep edge, steepest two thirds of the way out (spec
 * 2026-09-30-barrel-from-maths §4, plan ruling 10). A bigger swell or a lower tide breaks further out, on the steeper
 * part, and throws heavier; a higher tide further in, on the gentler part; a swell too big for the reef breaks on the flat.
 */
export function rampShape(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  return x * x * x * (4 - 3 * x);
}
```

and in `buildBathymetry`'s outside branch:

```ts
        // Outside the shelf: rise from the surrounding deep water to the ledge depth over ledgeWidthM (rampShape).
        const dLedge = p.ledgeDepthM + (background - p.ledgeDepthM) * rampShape(-sd / p.ledgeWidthM);
```

`wombReef.ts`: `ledgeWidthM`'s doc: "The seaward ramp's width (m): from the deep flat to the ledge line (rampShape).
Calibrated so 12 ft at mid tide reads ψ₀ ≈ 0.065 at the peak (plan Task 5)." Set the default to 150 for now.

`DevPanel.ts`: the ledge-width binding `min: 40, max: 300, step: 5`.

- [ ] **Step 4: Calibrate the width**

Add to `reefPsi.test.ts`:

```ts
describe.skipIf(!import.meta.env.RAMP_CALIBRATE)('calibrate the ramp width', () => {
  it('finds the width where 12 ft at mid tide reads ψ₀ 0.065 at the peak', { timeout: 1_800_000 }, () => {
    let lo = 40, hi = 300;
    for (let i = 0; i < 10; i++) {
      const w = (lo + hi) / 2, b = downsample(buildBathymetry({ ...DEFAULT_REEF_PARAMS, ledgeWidthM: w }), 2);
      const f = computeReefField({ bed: b, periodS: 15, fromDeg: 225, tideM: 0 }), p = psiAt(f, 0, 0, biggest(12));
      console.log(`width ${w.toFixed(1)} m → ψ₀ ${p.toFixed(4)}`);
      if (p > 0.065) lo = w; else hi = w;
    }
    console.log(`ledgeWidthM ≈ ${((lo + hi) / 2).toFixed(0)}`);
  });
});
```

Run: `RAMP_CALIBRATE=1 npx vitest run src/breaker/reefPsi.test.ts -t "finds the width" --reporter=verbose --silent=false`
(PowerShell: `$env:RAMP_CALIBRATE=1; npx vitest run …`).
Expected: ψ₀ falls as the width grows; a width between 60 and 280 m. Set `DEFAULT_REEF_PARAMS.ledgeWidthM` to the printed
value, rounded to 5 m.

If ψ₀ doesn't reach 0.065 anywhere in 40–300 m, or isn't monotone in the width, stop and report the printed table: the
reef needs a ruling from Andrew.

- [ ] **Step 5: Run everything the reef touches, and re-pin what it moves**

Run: `npx tsc --noEmit -p .` and `npx vitest run --reporter=verbose --silent=false > .superpowers/sdd/2026-09-30-barrel-from-maths/task5-suite.txt 2>&1`,
then read the failures.

The softened ramp moves where waves start to break (further out), so tests pinned to today's geometry can fail:
`breakingField.test.ts` (the tide moves the break, too big breaks outside, the peak stays tallest),
`reefField.test.ts`, `crestTrace.test.ts` (the left's peel speed, the right's close-out), `bathymetry.test.ts`, and the
seabed look tests. For each failure, decide which it is and ledger it as a ruling:
- **A pin on the old reef's numbers** (a location, a distance, a time on the 1:2 ledge): re-measure on the new reef,
  print the new value, and move the pin to it with the reason in the test's comment.
- **A behaviour the spec or Andrew requires** (the left peels, the right closes out, too big breaks outside, the peak
  stays tallest): if it fails, that's a real regression. Don't weaken it: stop and report with the numbers.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(reef): the softened ledge: the seaward ramp v^3(4 - 3v) over the calibrated width (12 ft mid tide reads psi0 ~0.065 at the peak)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The examples from the code, then stop for Andrew's sign-off

**Files:**
- Create: `src/breaker/overturnViewer.test.ts`

**Interfaces:**
- Consumes: `peakSetup`, `peakStation`, `peakLanding` (Task 4); `onsetPsi`, `psiStateLabel`, `buildProfile`.
- Produces: an HTML file at `OVERTURN_VIEW_OUT`: static SVG only (Andrew's viewer runs no scripts).

- [ ] **Step 1: Write the viewer**

```ts
// src/breaker/overturnViewer.test.ts
import { describe, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, onsetPsi } from './breaking';
import { type Vec2, buildProfile } from './lipProfile';
import { psiStateLabel } from './overturn';
import { peakLanding, peakSetup, peakStation } from './peakStation.fixture';
import { sampleField, sampleOnset } from './reefField';

const OUT: string = import.meta.env.OVERTURN_VIEW_OUT ?? '';
// node:fs through a computed specifier: the project's typecheck has no Node types, and this viewer only runs under Vitest.
const nodeFs = (): Promise<{ writeFileSync(p: string, d: string): void }> => import(/* @vite-ignore */ ['node', 'fs'].join(':'));

/** One side view: the profile (water, the tube as air) over the sheet and the seabed along the peak's ray, true scale. */
function side(title: string, caption: string, sea: Vec2[], bed: Vec2[], pts: Vec2[]): string {
  const U0 = -30, U1 = 35, Y0 = -16, Y1 = 9, PX = 14, W = (U1 - U0) * PX, H = (Y1 - Y0) * PX;
  const X = (u: number) => ((u - U0) * PX).toFixed(1), Y = (y: number) => ((Y1 - y) * PX).toFixed(1);
  const path = (q: Vec2[]) => 'M' + q.map((p) => `${X(p[0])},${Y(p[1])}`).join('L');
  const xFront = pts[0][0], xBack = pts[pts.length - 1][0];
  const fill = (q: Vec2[]) => (q.length ? `<path d="${path(q)}L${X(q[q.length - 1][0])},${Y(Y0)}L${X(q[0][0])},${Y(Y0)}Z" fill="#1f4e9c"/>` : '');
  const behind = [...sea.filter((q) => q[0] <= xBack), pts[pts.length - 1]], ahead = [pts[0], ...sea.filter((q) => q[0] >= xFront)];
  return `<figure><figcaption><b>${title}</b> ${caption}</figcaption><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;height:auto;background:#eef3f8">
    ${fill(behind)}${fill(ahead)}<path d="${path(pts)}L${X(xBack)},${Y(Y0)}L${X(xFront)},${Y(Y0)}Z" fill="#1f4e9c"/>
    <path d="${path(pts)}" fill="none" stroke="#bdf0f7" stroke-width="1.4"/>
    <path d="${path(bed)}L${X(U1)},${Y(Y0)}L${X(U0)},${Y(Y0)}Z" fill="#8b6f4e"/>
    <line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#c33" stroke-dasharray="4 4"/></svg></figure>`;
}

describe.skipIf(!OUT)('the barrel from the maths, drawn from the code', () => {
  it('draws the tide × size table at the peak, and the collapse of the normal day', { timeout: 1_800_000 }, async () => {
    const fs = await nodeFs();
    const figs: string[] = [];
    const biggest = (ft: number) => { const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = ft; return wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => Math.max(a, b.heightM), 0); };
    const cases: [string, number, number][] = [['low tide', -1.5, 6], ['low tide', -1.5, 10], ['low tide', -1.5, 15], ['mid tide', 0, 8], ['mid tide', 0, 12], ['high tide', 1.5, 4], ['high tide', 1.5, 12]];
    for (const [tideName, tideM, ft] of cases) {
      const setup = peakSetup(ft, tideM);
      const rec = sampleOnset(setup.field, 0, 0)!, psi = onsetPsi(rec, 0, biggest(ft), DEFAULT_BREAK_PARAMS);
      const tau = peakLanding(psi, { setup }), st = peakStation(psi, tau, { setup });
      const prof = buildProfile(st.base, st.input, st.lip, st.frameBase), f = prof.frame;
      const sea: Vec2[] = []; for (let u = -30; u <= 35; u += 0.25) sea.push(st.base(u));
      const f0 = sampleField(setup.field, 0, 0), bed: Vec2[] = [];
      for (let u = -30; u <= 35; u += 1) { const s = st.s0 + u; const g = sampleField(setup.field, f0.dirX * s, f0.dirZ * s); bed.push([u, -g.depth]); }
      figs.push(side(`${ft} ft, ${tideName}`, `ψ₀ ${psi.toFixed(3)}: ${psiStateLabel(psi)}. The lip lands ${((f.K[1] - f.P[1]) / (f.K[1] - f.F[1]) * 100).toFixed(0)}% of the way down, ${(f.P[0] - f.K[0]).toFixed(1)} m ahead of the crest.`, sea, bed, prof.points));
    }
    const mid = peakSetup(12, 0), psiN = onsetPsi(sampleOnset(mid.field, 0, 0)!, 0, biggest(12), DEFAULT_BREAK_PARAMS), tauN = peakLanding(psiN, { setup: mid });
    for (const dt of [-0.5, 0, 0.5, 1]) {
      const st = peakStation(psiN, tauN + dt, { setup: mid }), prof = buildProfile(st.base, st.input, st.lip, st.frameBase);
      const sea: Vec2[] = []; for (let u = -30; u <= 35; u += 0.25) sea.push(st.base(u));
      const f0 = sampleField(mid.field, 0, 0), bed: Vec2[] = [];
      for (let u = -30; u <= 35; u += 1) { const s = st.s0 + u; const g = sampleField(mid.field, f0.dirX * s, f0.dirZ * s); bed.push([u, -g.depth]); }
      figs.push(side(`12 ft, mid tide, ${dt === 0 ? 'the lip landing' : `${dt > 0 ? '+' : ''}${dt} s`}`, `ψ₀ ${psiN.toFixed(3)}`, sea, bed, prof.points));
    }
    fs.writeFileSync(OUT, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Womb Barrels</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:16px;background:#fff;color:#222}figure{margin:0 0 16px}</style>
<h2>The barrel from the maths, on the softened Womb</h2><p>From the game's own code: the biggest set wave at the peak for each tide and size, at the moment the lip lands, over the seabed it breaks on. True scale; still water dashed.</p>
${figs.join('\n')}</html>`);
  });
});
```

`FieldSample.depth` is the still-water depth at the field's tide; if the field sample calls it something else, use that
field (check `sampleField`'s return type).

- [ ] **Step 2: Draw and look**

Run: `OVERTURN_VIEW_OUT=<scratchpad>/womb-barrels.html npx vitest run src/breaker/overturnViewer.test.ts`
Expected: PASS and the file written. Open it (serve the folder with `python -m http.server` and view it in a browser, or
read the SVG) and check by eye: each tube a smooth teardrop in front of a concave face, the lip landing where the table
says, no step, pocket, horn or square part.

- [ ] **Step 3: Send it to Andrew and STOP**

Send the HTML with `SendUserFile` (display: render), with the ψ₀ table printed by `reefPsi.test.ts`. Ledger:
`Task 6: GATE — drawings sent; waiting for Andrew's sign-off before Task 7.` Mark this task complete only when Andrew
signs off; his mark-ups become rulings or fixes in this task before it completes. This is also a compaction checkpoint.

- [ ] **Step 4: Commit**

```bash
git add src/breaker/overturnViewer.test.ts
git commit -m "test(overturn): the tide x size examples and the collapse, drawn from the code as static SVG (OVERTURN_VIEW_OUT)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The GPU sheet reads ψ

**Files:**
- Create: `src/breaker/overturnNodes.ts`
- Modify: `src/breaker/breakingNodes.ts` (`createBreakUniforms`/`updateBreakUniforms`; `lifecycleNode` and
  `breakPointNode` take an optional per-crest shape; add `onsetPsiNode`)
- Modify: `src/breaker/SetWaves.ts` (the ψ pair texture, `sampleOnset`, the wave record's third vec4, `sumBreaking`,
  `onsetPsiAt` for the self-test)
- Modify: `src/breaker/breaker.selftest.ts`

**Interfaces:**
- Consumes: `SHEET_POINTS`, `PSI_NORMAL`, `RANDOM_DIAL_MAX` (Task 1); `ONSET_PSI_OFFSET` (Task 2);
  `ActiveWave.drainFactor`, `ActiveWave.throwDraw` (Task 3).
- Produces: `sheetShapeNode(psi: N): { troughDrain: N; pileSurge: N }`,
  `effectivePsiNode(psi0: N, drain: N, draw: N, u: { psiNudge: N; randomDial: N }): N`,
  `onsetPsiNode(lo: N, hi: N, level: { lq: N; k: N }): N`, `SetWaves.onsetPsiAt(xz: N, heightM: N): N`,
  `lifecycleNode(…, sh?: { drainGrowth: N; pileSurge: N })`, `breakPointNode(…, sh?: { troughDrain: N })`.

- [ ] **Step 1: Measure the performance baseline, before any GPU change**

Start the preview (`liquid-dreams-barrel`, port 5174). Pick the `barrel-peeling` moment, set the swell to 12 ft, wait
10 s, and read the GPU panel's median. Write the number and the time in the ledger; it goes in Task 10's report.

- [ ] **Step 2: Write the GPU mirror of the sheet's rules**

```ts
// src/breaker/overturnNodes.ts
import { clamp, float, mix, select, smoothstep } from 'three/tsl';
import { SHEET_POINTS } from './overturn';

type N = any;

/** overturn.effectivePsi on the GPU: ψ₀ × drain × (1 + dial·draw) × (1 + nudge). */
export function effectivePsiNode(psi0: N, drain: N, draw: N, u: { psiNudge: N; randomDial: N }): N {
  return float(psi0).mul(drain).mul(float(1.0).add(u.randomDial.mul(draw))).mul(float(1.0).add(u.psiNudge));
}

/** overturn.sheetShape on the GPU: SHEET_POINTS, smoothstep-eased between neighbours, held past the ends. */
export function sheetShapeNode(psi: N): { troughDrain: N; pileSurge: N } {
  const [a, b, c] = SHEET_POINTS;
  const q = clamp(float(psi), a[0], c[0]);
  const upper = q.greaterThanEqual(b[0]);
  const t = select(upper, smoothstep(b[0], c[0], q), smoothstep(a[0], b[0], q));
  return {
    troughDrain: select(upper, mix(float(b[1]), float(c[1]), t), mix(float(a[1]), float(b[1]), t)),
    pileSurge: select(upper, mix(float(b[2]), float(c[2]), t), mix(float(a[2]), float(b[2]), t)),
  };
}
```

- [ ] **Step 3: Thread the per-crest shape through the sheet's nodes**

In `breakingNodes.ts`:
1. `createBreakUniforms`: add `psiNudge: uniform(0), randomDial: uniform(0)`; `updateBreakUniforms`:
   `u.psiNudge.value = p.psiNudge; u.randomDial.value = p.randomDial;`.
2. `lifecycleNode(r, hasRecord, broken, tb, rMax, H, rSlurp, u, sh?: { drainGrowth: N; pileSurge: N })`: open with
   `const drainGrowth = sh?.drainGrowth ?? u.drainGrowth, pileSurge = sh?.pileSurge ?? u.pileSurge;` and use them in
   place of `u.drainGrowth` (in `land`) and `u.pileSurge` (in `surgeWeight`).
3. `breakPointNode(i, steep, u, curves, pc?, sh?: { troughDrain: N })`: `const depth = (sh?.troughDrain ?? u.troughDrain).mul(u.delta).mul(i.H).mul(drain);`
4. Add:

```ts
/** breaking.onsetPsi from the record's pair at level k (texel k holds (ψ_k, ψ_{k+1})): w = clamp(lq − k, 0, 1). */
export function onsetPsiNode(lo: N, hi: N, level: { lq: N; k: N }): N {
  return mix(lo, hi, clamp(level.lq.sub(level.k), 0.0, 1.0));
}
```

- [ ] **Step 4: The ψ texture, the wave record and `sumBreaking` in `SetWaves`**

1. Add `const PSI_TEXELS = ONSET_LEVELS - 1;` and a field `private readonly onsetPsiTex = floatTexture(FIELD_NX * PSI_TEXELS, FIELD_NZ);`.
   In `setField`, after the onset copy:

```ts
    const pd = this.onsetPsiTex.image.data as Float32Array;
    for (let i = 0; i < f.tau.length; i++) {
      const col = i % FIELD_NX, row = (i - col) / FIELD_NX, r = i * ONSET_RECORD_LENGTH + ONSET_PSI_OFFSET;
      for (let k = 0; k < PSI_TEXELS; k++) {
        const o = ((row * FIELD_NX + col) * PSI_TEXELS + k) * 4;
        pd[o] = f.onset[r + k]; pd[o + 1] = f.onset[r + k + 1];
      }
    }
```

   and add `this.onsetPsiTex` to the `needsUpdate` list.
2. `sampleOnset(xz, k)` also returns `psiLo`/`psiHi`: the bilinear of texel `(i0.x + dx)·PSI_TEXELS + int(k)` at row
   `i0.y + dz`, `.x` and `.y`, reusing its `t` and `i0`:

```ts
    const psiTexel = (() => {
      const kk = int(k);
      const load = (dx: number, dz: number): N => textureLoad(this.onsetPsiTex, ivec2(i0.x.add(dx).mul(PSI_TEXELS).add(kk), i0.y.add(dz)), int(0));
      return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y).toVar();
    })();
```

   and returns `psiLo: psiTexel.x, psiHi: psiTexel.y` with the existing fields.
3. The wave record grows to three vec4s: `wavesAttr` holds `MAX_ACTIVE_WAVES * 12` floats and `waves` is
   `storage(this.wavesAttr, 'vec4', MAX_ACTIVE_WAVES * 3)`. In `setEvents`, write slots at `i * 12`, `i * 12 + 4` and
   `i * 12 + 8` = `w ? [w.drainFactor ?? 1, w.throwDraw ?? 0, 0, 0] : [1, 0, 0, 0]`. `canBreakFlag`/`longTailFlag` read
   `slot * 12 + 7`. In `sumBreaking`, `a = this.waves.element(i.mul(3))`, `b = … i.mul(3).add(1)`, `cW = … i.mul(3).add(2)`.
4. In `sumBreaking`, declare next to `pc` and `lipH`:
   `const shTrough = float(sheetShape(PSI_NORMAL).troughDrain).toVar(), shSurge = float(sheetShape(PSI_NORMAL).pileSurge).toVar();`
   Inside `If(breaking)`, after `const rec = this.sampleOnset(on, level.k);`:

```ts
            // The crest's ψ (setWaveModel.crestAt): PSI_NORMAL off the record, with no game rules.
            const psi = select(rec.inside, effectivePsiNode(onsetPsiNode(rec.psiLo, rec.psiHi, level), cW.x, cW.y, brk), float(PSI_NORMAL));
            const shape = sheetShapeNode(psi);
            shTrough.assign(shape.troughDrain); shSurge.assign(shape.pileSurge);
```

   and pass `{ drainGrowth: shTrough.mul(brk.delta).add(1.0), pileSurge: shSurge }` as `lifecycleNode`'s last argument
   and `{ troughDrain: shTrough }` as `breakPointNode`'s.
5. For the self-test:

```ts
  /** The onset record's ψ₀ at xz for a wave of deep-water height heightM (self-tests). Inside an Fn. */
  onsetPsiAt(xz: N, heightM: N): N {
    const level = onsetLevelNode(heightM, this.brk);
    const rec = this.sampleOnset(xz, level.k);
    return onsetPsiNode(rec.psiLo, rec.psiHi, level);
  }
```

- [ ] **Step 5: Extend the GPU self-test**

In `breaker.selftest.ts`, add `['dial', { ...DEFAULT_BREAK_PARAMS, randomDial: 0.15, psiNudge: 0.2 }]` to `PARAM_SETS`;
the events come from `wavesNear` with their real `throwDraw` and `gapS`. Add:

```ts
registerSelfTest({
  name: 'breaker: GPU onset psi0 matches the CPU (the pair texture, level interpolation)',
  async run(renderer) {
    const field = getField();
    const sets = new SetWaves(uniform(0));
    sets.setField(field);
    const points = [...peakRay(field), ...OFF_RAY];
    const h = REF_BIGGEST.heightM;
    const { pass, outAttr } = computeAt(points, 1, (xz) => [vec4(sets.onsetPsiAt(xz, float(h)), 0.0, 0.0, 0.0)]);
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    points.forEach(([x, z], i) => { const rec = sampleOnset(field, x, z); if (rec) worst = Math.max(worst, Math.abs(out[i * 4] - onsetPsi(rec, 0, h, DEFAULT_BREAK_PARAMS))); });
    return { pass: worst < 1e-4, detail: `${points.length} points; worst |Δψ₀| ${worst.toExponential(2)}` };
  },
});
```

- [ ] **Step 6: Run the CPU suite, the limits test and the GPU self-tests**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/breaker`
Expected: PASS, including `BreakingRibbon.limits.test.ts`. If the ψ texture pushes a pass over a limit, stop and report:
the pairs then merge into the existing onset texture.

Open `http://localhost:5174/?selftest=breaker`. Expected: every `breaker:` test passes, including the ψ₀ test and the
`dial` param set.

- [ ] **Step 7: Commit**

```bash
git add src/breaker
git commit -m "feat(sheet, GPU): the crest's psi on the GPU (the psi0 pair texture, each wave's drain factor and draw), its trough drain and surge mirrored

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The GPU lip from the maths

**Files:**
- Modify: `src/breaker/lipProfileNodes.ts` (rewrite: the tube, the frame, the samples, the pile lift, the settling target)
- Modify: `src/breaker/overturnNodes.ts` (add `overturnShapeNode`)
- Modify: `src/breaker/BreakingRibbon.ts` (the frame pass: ψ and the wind per station, the pile's knots; the vertex
  pass: the settling target)
- Modify: `src/breaker/lipProfileNodes.test.ts`, `src/breaker/ribbon.selftest.ts`

**Interfaces:**
- Consumes: everything `lipProfile.ts` and `tube.ts` define (Tasks 1, 4); `PileLift`, `pileLiftKnots`, `liftAt`,
  `uAtX`, `sampleTarget`, `HOME_SETTLE` (lipProfile.ts, unchanged since 23c43b0); the station's ψ at float 10.
- Produces: `overturnShapeNode(psi: N, H: N, uc: N)`; `FRAME_VEC4S = 16`, `FRAME_PROFILE_VEC4S = 16`;
  `profileFrameNode(baseAt, pileAt, input: { H; c; r; tb; psi; offshoreMs }, u)` (pileAt: the sheet with the pile);
  `sampleTargetNode(j, f, home)`; `profilePointNode(j, f, baseTarget, home)`; `packFrameCpu(f)` in the new layout.

This task mirrors the CPU term by term, including `sheetYAt` (four more base samples per station in the frame pass). The CPU (`lipProfile.ts`, `tube.ts`, `overturn.ts`) stays the source of truth:
read it side by side while writing each node, in the same order, with the same constants, the same fixed iteration
counts (`TUBE_SEARCH_STEPS`, `TUBE_ARC_STEPS`, `TUBE_WATER_STEPS`) and the same clamps.

- [ ] **Step 1: The tube and the shape on the GPU**

In `overturnNodes.ts` add:

```ts
import { LH82_AREA, MB_H_OVER_H0, PSI_FIT_MAX, PSI_FOIL_FULL, PSI_MIN, PSI_NONE, WIND_AREA_POINTS, WIND_ASPECT_POINTS } from './overturn';

function piecewiseNode(points: readonly (readonly [number, number])[], x: N): N {
  const [[x0, y0], [x1, y1], [x2, y2]] = points;
  const v = clamp(float(x), x0, x2);
  return select(v.lessThanEqual(x1), v.sub(x0).mul((y1 - y0) / (x1 - x0)).add(y0), v.sub(x1).mul((y2 - y1) / (x2 - x1)).add(y1));
}
/** overturn.overturnShape on the GPU (inputs finite: the frame pass never feeds it NaN). */
export function overturnShapeNode(psi: N, H: N, uc: N): { presence: N; AO: N; AJ: N; W: N; L: N; theta: N } {
  const q = float(psi), h = max(float(H), 0.0);
  const p = clamp(q, PSI_MIN, PSI_FIT_MAX);
  const foil = smoothstep(PSI_FIT_MAX, PSI_FOIL_FULL, q);
  const fa = piecewiseNode(WIND_AREA_POINTS, uc), fw = piecewiseNode(WIND_ASPECT_POINTS, uc);
  const fit = p.mul(1.661).add(0.298);
  const mb = float(1.0).div(float(0.065).div(max(q, 1e-6).mul(MB_H_OVER_H0 ** 0.25)).add(0.821));
  const WL = fit.add(max(mb, fit).sub(fit).mul(foil)).mul(fw).toVar();
  const AO = p.mul(5.319).sub(0.043).mul(h).mul(h).mul(fa).toVar();
  const AJ = p.mul(p).mul(37.072).sub(p.mul(0.587)).add(0.02).mul(h).mul(h).mul(fa);
  const L = AO.div(WL.mul(LH82_AREA)).sqrt().toVar();
  const theta = p.mul(p).mul(-5746.4).add(p.mul(225.2)).add(48.4).mul(Math.PI / 180);
  return { presence: smoothstep(PSI_NONE, PSI_MIN, q), AO, AJ, W: WL.mul(L), L, theta };
}
```

(Import `clamp`, `max`, `select`, `smoothstep`, `float` from `three/tsl` there.) Note `meadBlackAspect(1/(ψ·c))` =
`1/(0.065/(ψ·c) + 0.821)`, as written.

In `lipProfileNodes.ts`, add the tube functions mirroring `tube.ts` (`tubeHalfNode`, `tubeUpperNode`, `tubeLowerNode`,
`tubeUpperNormalNode`, `tubeTopXiNode`, `tubeBackMostXNode`, `tubeUpperArcNode`, `tubeWaterXiNode`), each a direct
transcription: the ternary searches as a JS `for` loop of `TUBE_SEARCH_STEPS` iterations over `.toVar()` bounds with
`select`, the arc as `TUBE_ARC_STEPS` chords, the water cut as `TUBE_WATER_STEPS` bisections. A tube is a record of
nodes `{ O: vec2, d: vec2, n: vec2, L, W, clipY }`.

- [ ] **Step 2: The frame, the pile lift, the samples and the settling target**

Rewrite `profileFrameNode` as the transcription of `profileFrame` (Task 4 Step 3), plus the pile's knots:
`pileAt(u)` is the sheet with the pile, `baseAt(u)` without; at each of `pileLiftKnots(f)`'s seven u, store
`(u, x_without, dx, dy)` as `pileLift` does. The frame's layout (`FRAME_LAYOUT`) becomes, in 16 vec4s:
`K.xy F.xy | tF.xy P.xy | tip.xy tube.O.xy | tube.d.xy tube.L tube.W | tube.clipY xiTop xiTip xiEnd | tTop tipE uFoot uFront |
uBack tauLand prog weight | collapse landing rho vj | reach uLand theta 0 | knot0 … knot6` (each knot a vec4 (u, x, dx, dy)).
`packFrameCpu` returns the same 64 numbers from a CPU frame (`tube.n` is derived from `d` as (−d.y, d.x), so it isn't
stored; the knots from `f.lift`, zeros if absent).

Rewrite `profilePointNode(j, f, baseTarget, home)` as the transcription of `constructed` + `riding` + `profilePoint`,
with the `If` chain on the segment id as today, and add `sampleTargetNode(j, f, home)` as the transcription of
`sampleTarget` (it evaluates the constructed point once and reads `uAtX` over the stored knots). `liftAtNode` and
`uAtXNode` walk the seven knots with a JS loop (the knots are sorted by x on the CPU; on the GPU compare in order: the
knots are monotone in x along the ray, as the CPU's `uAtX` assumes).

- [ ] **Step 3: The ribbon's passes**

In `BreakingRibbon.buildFramePass`: read `cS = stations.element(i·3 + 2)` for ψ (`cS.z`); pass
`{ H: b.x, c: b.y, r: b.z, tb: b.w, psi: cS.z, offshoreMs: this.offshoreMs }` and `pileAt` built like `baseAt` from
`this.surface.smooth`. Add `private readonly offshoreMs = uniform(0)` and `setOffshore(ms: number)`. The frames buffer
holds `MAX_STATIONS * FRAME_VEC4S` vec4s.

In `buildVertexPass`: `home = sampleHomeNode(j, f)`; `target = sampleTargetNode(j, f, home)`;
`xzTarget = S + n·target`; the base at the target (`this.surface.smooth(xzTarget)`) replaces the base at the home; the
lateral displacement along t̂ stays read at the home (as today); `profilePointNode(j, f, baseTarget, home)`.

- [ ] **Step 4: The mirror tests**

In `lipProfileNodes.test.ts`, the table checks stay; update the layout test to the new `FRAME_LAYOUT` length (64 floats).

In `ribbon.selftest.ts` "GPU profile matches lipProfile": stations with ψ 0.03, 0.065, 0.09 and 0.2 in turn and tb
before, during and after the landing; the CPU reference is `buildProfile(base, { …input, psi, offshoreMs }, params, frameBase)`;
compare the packed frames (`packFrameCpu`) within 1e-3 relative and the points within 2 cm.

- [ ] **Step 5: Run**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/breaker`. Expected: PASS.
Open `http://localhost:5174/?selftest=ribbon` and `?selftest=breaker`. Expected: every test passes. Record the summaries.
This is a compaction checkpoint.

- [ ] **Step 6: Commit**

```bash
git add src/breaker
git commit -m "feat(ribbon, GPU): the lip from the maths on the GPU, mirrored term by term (the tube, the free-fall throw, the pile lift and the settling target)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Wiring in the app, the Break panel and the readout

**Files:**
- Modify: `src/app/App.ts` (the offshore speed to the ribbon; the trace's `offshoreMs`; the status readout)
- Modify: `src/breaker/peakFace.ts`, `src/breaker/peakFace.test.ts` (`peakPsi`, `formatPeakPsi`)
- Modify: `src/dev/DevPanel.ts` (the readout next to "face at the peak"; the `setStatus` type)

**Interfaces:**
- Consumes: `offshoreSpeed`, `psiStateLabel`, `crestAt`, `breakOptions(field, params, offshoreMs)`, `BreakingRibbon.setOffshore`.
- Produces: `peakPsi(field, events, t, p, offshoreMs): number | null`, `formatPeakPsi(psi: number | null, hasField: boolean): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/breaker/peakFace.test.ts (add)
it('reads the ψ of the wave at the peak and names its state', () => {
  const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 12;
  const events = wavesOfSet(1, c, DEFAULT_SET_PARAMS);
  const big = events.reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const psi = peakPsi(field, events, big.arrivalS, DEFAULT_BREAK_PARAMS, 3)!;
  expect(psi).toBeGreaterThan(0);
  expect(formatPeakPsi(0.065, true)).toBe('ψ 0.065, cylinder (5)');
  expect(formatPeakPsi(0.035, true)).toBe('ψ 0.035, oval (4)');
  expect(formatPeakPsi(null, true)).toBe('no wave at the peak');
  expect(formatPeakPsi(0.05, false)).toBe('waiting for the reef field');
});
```

- [ ] **Step 2: Run and check it fails**

Run: `npx vitest run src/breaker/peakFace.test.ts`. Expected: FAIL (`peakPsi` not exported).

- [ ] **Step 3: Implement**

`peakFace.ts`:

```ts
/** The ψ of the wave at the peak now (its crest within half a period of it), as the sheet reads it; null if none. */
export function peakPsi(field: ReefField | null, events: readonly WaveEvent[], t: number, p: BreakParams, offshoreMs: number): number | null {
  if (!field || !p.enabled) return null;
  const e = events.find((w) => Math.abs(w.arrivalS - t) <= w.periodS / 2);
  if (!e) return null;
  const w = toActiveWave(e), ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  return crestAt(0, 0, t, sampleField(field, 0, 0), w, ctx, breakOptions(field, p, offshoreMs))?.psi ?? null;
}

/** "ψ 0.065, cylinder (5)" for the Sets folder. */
export function formatPeakPsi(psi: number | null, hasField: boolean): string {
  if (!hasField) return 'waiting for the reef field';
  if (psi === null) return 'no wave at the peak';
  return `ψ ${psi.toFixed(3)}, ${psiStateLabel(psi)}`;
}
```

`App.ts`:
- `readonly setStatus = { nextSet: '', wave: '', face: '', psi: '' };`
- a private `offshoreMs = 0` and

```ts
  /** The wind's offshore speed against the field's swell (overturn.offshoreSpeed): the lip's wind factors. */
  private updateOffshore(): void {
    this.offshoreMs = this.field ? offshoreSpeed(this.conditions.wind.speedMs, this.conditions.wind.directionDeg, this.field.far.dirX, this.field.far.dirZ) : 0;
    this.ribbon?.setOffshore(this.offshoreMs);
  }
```

  called wherever the field is set and in `onConditionsEdited` (use the ribbon field's actual name in App).
- The trace input passes `offshoreMs: this.offshoreMs`.
- Status: `this.setStatus.psi = formatPeakPsi(peakPsi(this.field, events, this.clock.simTime, this.breakParams, this.offshoreMs), this.field !== null);`

`DevPanel.ts`: `psi: string` in the `setStatus` type, and after the `face` binding
`sets.addBinding(m.setStatus, 'psi', { label: 'barrel at the peak', readonly: true, interval: 250 }),`.

- [ ] **Step 4: Run**

Run: `npx tsc --noEmit -p .` and `npx vitest run`. Expected: PASS (reruns for the two known timeouts).
Start the preview and check: the Break panel has the ψ nudge and the dial, and no throw, lip, wall, trough or surge
sliders; the Sets folder shows "barrel at the peak" during a set.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(app): the wind reaches the lip; the Break panel's psi nudge and dial; the barrel at the peak in the Sets folder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verify in the game, measure, and report

**Files:** none (verification). Update memory afterwards.

- [ ] **Step 1: The whole suite and the self-tests**

Run: `npx tsc --noEmit -p .` and `npx vitest run`: PASS (known timeouts rerun alone, both runs reported).
Open `http://localhost:5174/?selftest=breaker` and `?selftest=ribbon`: all PASS; copy the summary lines.

- [ ] **Step 2: Performance**

Same moment and size as Task 7 Step 1: the GPU median at 12 ft barrel-peeling. Expected: at most +0.2 ms over the
baseline. If it's over, profile (the frame pass's tube searches, the vertex pass's settling target) and report before
changing anything.

- [ ] **Step 3: In the game, by eye**

At 12 ft, screenshots from the lineup and from the shoulder at the `low-tide-set`, `barrel-peeling` (mid tide) and
`high-tide-set` moments, and `barrel-peeling` again with the wind onshore (wind from 225°, 6 m/s). Check:
- low tide throws visibly heavier than mid, and mid than high; onshore shrinks the tube;
- the readout "barrel at the peak" reads in that order;
- no step, pocket, horn or square part in the lip's life.

Send the screenshots to Andrew with SendUserFile, next to Task 6's drawings.

- [ ] **Step 4: Push and report**

Push `barrel-and-whitewater`. Don't merge to main; that's Andrew's call.
Report: the test and self-test summaries, the before and after GPU timings, the screenshots, every test changed or
retired and why, and every ruling from the ledger.
