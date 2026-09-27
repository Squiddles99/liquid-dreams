# Phase 2 Rework "The breaking ribbon" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The breaking part of each set wave is drawn as its own fine mesh, the breaking ribbon, with a gravity-thrown lip curling over a real hollow tube. There are no holes, folds or jagged edges from any angle, and it holds up from about 5 m. The ocean sheet goes back to a single-valued surface that the height probe reads exactly.

**Architecture:**
- The sheet becomes Phase 1 plus drain, bore and a front-only crest sharpening (heights only), with an analytic slope. The curl, the finite-difference normals and the double-sided material go.
- Each frame, `crestTrace.ts` traces every set wave's crest across the reef into camera-spaced stations. Each station carries its time since onset.
- `lipProfile.ts` defines the cross-section at a station: the sheet's own cross-section, with the face, the gravity-thrown lip and the tube built between the face's foot and the crest.
- On the GPU, `BreakingRibbon.ts` evaluates that profile for every station × sample in compute passes and draws the result with the shared water shading.
- A top-down footprint mask stops the sheet drawing under the ribbon.

**Tech Stack:** TypeScript 7.0.2 (strict), Vite 8.3.1, Vitest 5.0.2, three 0.186.1 (`three/webgpu`, `three/tsl`), Tweakpane 4.0.5, stats-gl 4.2.3.

**Spec:** `docs/superpowers/specs/2026-09-27-breaking-ribbon-design.md` (Andrew approved it on 2026-09-27). It revises `docs/superpowers/specs/2026-09-27-the-break-design.md`, whose criterion, stage, drain, bore, probe rule, readout, moments and budget still apply. The Phase 1 and vision specs govern world conventions.

## Global Constraints

- TypeScript strict; versions exactly as pinned in `package.json`; no new dependencies.
- three 0.186.1 TSL only (WebGPU); TSL files use `type N = any;`; cast only a rejected expression and mark it `// three typings gap`.
- World axes +X east, +Y up, +Z south; origin at the Womb's peak; directions are "from", degrees true.
- One source of truth for water height: the sheet and the height probe read one displacement function (`SetWaves.displacementNode` / `setWaveModel.sumWaves`), with no render-only variant.
- Every GPU formula has a CPU mirror (`breaking.ts`, `setWaveModel.ts`, `lipProfile.ts`, `crestTrace.ts`), tested in vitest and checked by a GPU self-test.
- Deterministic: the same conditions, tuning params, sim time and camera position give the same surface, stations and ribbon.
- Never pass TSL `smoothstep` a low edge above its high edge; write `1 − smoothstep(e1, e0, x)` instead.
- GPU budget about 3 ms per frame at 2560×1600 on Andrew's RTX 4060 Laptop GPU. CPU crest tracing target 2 ms per frame (Q7).
- Implementers never open a browser. GPU checks (`?selftest`, screenshots, GPU ms) belong to the controller and are reported as pending until run.
- `reference/` is never committed; stage files by path (never `git add -A` or `git add .`); never commit `.superpowers/`.
- Commit after every task; every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never merge `phase-2-the-break` into `main`; Andrew decides that.

## Review Focus

1. **Andrew's stored overnight settings** (`breaking` holding `thetaMaxDeg`, `pivotDrop`, `backWidth` and so on, with no new fields) must load with the removed fields dropped and the new fields at their defaults, and give a working panel. Pinned by `loads an overnight profile: removed break fields dropped, new ones defaulted` in Task 2.
2. **Break sliders dragged to their ends** (throw strength 0.1/1.5, lip thickness 0.03/0.3, collapse time 0.3/3, ribbon onset 0.3/0.9, face width 0.1/3) must keep the profile a simple curve and every value finite. Pinned by `never crosses itself before the lip lands (…slider ends)` in Task 3 and `every Break slider range survives normalizeBreakParams` in Task 2.
3. **The camera parked where a wave breaks** (the lineup, or free cam inside the tube) must ride the sheet smoothly: the probe's search converges with the sharpening in. The ribbon must also draw when the camera is 0.1 m from a station (spacing floor, no NaN). Pinned by `the probe's fixed-point search converges with the front sharpening` in Task 2 and `spaces stations by distance from the camera, within the cap` in Task 4 (camera at the peak).
4. **A lull, a flat day, no field yet, and swell from unusual directions** must give an empty trace and a ribbon that draws nothing, never a stale or NaN mesh. Pinned by `traces nothing for a wave too small to steepen, a lull, or a flat day` in Task 4, and by `an empty trace draws nothing and keeps the sheet whole` (GPU self-test) in Task 6.
5. **Two waves breaking at once, or a set's next wave arriving while the last one hands back** must keep their stations apart (gap entries), with no triangle bridging them. Pinned by `is deterministic, and separates waves and undrawn stretches with single gaps` in Task 4 and the gap-discard self-test in Task 5.

## Plan-level rulings (from prototyping the spec on the real reef field)

These came from running the spec's formulas against the real Phase 1 field in scratch copies. The code in Tasks 3 and 4 passes its tests there: 8 `lipProfile` tests and 7 `crestTrace` tests, with the Task 2 sheet emulated. The controller records these rulings in the spec's §14 when committing this plan.

- **Q1: the sheet keeps a front-only sharpening, and the probe reads it too.**
  - Near the crest the Phase 1 wave at the peak is almost flat: it is 113 m long, and within ±5 m of the crest it drops about 3%. So a steep breaker face can't come from the Phase 1 profile. The overnight sheet made it by sinking the water ahead of the crest toward the trough level (`sharpenDrop`), which is single-valued because it changes heights only.
  - It also sank the water **behind** the crest from `backWidth·H` on, which made the **flat tabletop and the cliff Andrew saw from behind**. The back sinking is removed (`backWidth` goes). The front sinking stays, now driven by the crest's breaking ratio (`steepening(r) = smoothstep(ribbonOnset + 0.2, 1, r)`) rather than the stage, so the face stands up before it breaks (`steepEnd` goes).
  - Sharpening never moves a point sideways, so the probe's fixed-point search is unaffected (P10's concern was the curl). The probe therefore reads the sharpened sheet too: **sheet = probe**, which keeps R8's intent. The spec's "no sharpening" wording is superseded.
- **Q2: the sheet's normal is analytic.** The sheet's slope is Phase 1's slope plus the derivatives of the sharpening, drain and bore along travel. It is mirrored on the GPU and tested against central differences. No finite-difference evaluations.
- **Q3: the lip's geometry.**
  - The face's foot F sits at `1.9 × faceWidth × H` ahead of the crest, where the sharpened sheet has sunk 97% of the way to the trough.
  - The lip's launch speed is `max(throwStrength·c, (F − K + 0.3 m)/τ_land)`, so it always lands 0.3 m clear of the foot.
  - It lands when the **underside of its tip** reaches the higher of the foot and the sheet at the landing spot.
  - At the Womb's defaults the clearance floor is 0.52·c, so the default throw strength is **0.55**, not the spec's 0.35 (at 0.35 the slider would do nothing).
  - Measured at the peak (biggest default wave): τ_land = 0.79 s (target 0.6–1.5 s), reach 3.1 m, foot 3.0 m ahead, a round tube about 3 m across.
- **Q4: backing off.** A broken section whose crest stands less than 0.6·H above its foot has run into deeper water and lost its sharpening. It relaxes back to the sheet, fully by 0.3·H.
- **Q5: edges by construction.** The front and back segments of the profile are the sheet's own points (each sample has a monotone "home" u on the sheet). So the ribbon's edges equal the sheet exactly, and the spec's 2 m edge blend is realised as at least 2 m of pure-sheet samples (`EDGE_MARGIN_M`) beyond the constructed curve.
- **Q6: parameters.** `faceWidth` stays (the front sharpening's width, and the foot); `backWidth` and `steepEnd` go (the spec listed `backWidth` as staying).
- **Q7: tracing numbers.**
  - Stations sit within |ξ| < 2 ms of the crest (spec: 1 ms; measured ≤ 1 ms with two Newton projections a step).
  - The CPU target is 2 ms a frame (spec: 1 ms; measured 1.4 ms median for two breaking waves, with t_b at 2 m key stations). The test bound is 4 ms, so a slow CI machine doesn't flake.
  - The seed projects in steps up to half a wavelength, so a crest 40+ m from the peak is still found.
- **Q8: the look-back.** If even the window's far end has broken, the section is past its hand-back: `t_b = Infinity`, and the station is dropped.
- **Q9: the turquoise patches aren't the seabed clamp.** In Andrew's behind-the-wave moment the set-wave seabed clamp engages at **0 of 17,161** sampled points (CPU). The spec's §10 hypothesis is refuted, so Task 1 is a GPU diagnosis with pre-registered experiments.
- **Q10: gaps.** A gap entry recomputes the previous station and flags its vertices dead. The ribbon's fragment stage discards any triangle touching a dead vertex, so nothing bridges two waves.
- **Q11: ribbon normals** come from central differences over the ribbon's own grid (neighbouring samples and stations), not analytic per segment. The grid is centimetres apart where it matters. A collapsed (zero-length) sample takes the normal of the nearest live one along the profile.
- **Q12: the peel.**
  - The 1.8·Hs wave's time since onset falls along the north ledge at **11.8 m/s** at t = 6 s (test: 8–20 m/s), from t_b along one instant's crest.
  - The south ledge's first 40 m broke within **0.43–0.57 s** of each other (test: < 1.5 s).
  - Only about 2.9 s of peel is ever live (the hand-back), so a peel test must look at one instant.

---

## File Structure

```
src/
  breaker/
    breaking.ts (+test)          MOD  BreakParams: −9 curl/back fields, +throwStrength/lipThickness/collapseTime/ribbonOnset;
                                      front-only sharpening driven by steepening(r); curl, lip mask, lip weight removed; slope terms
    breakingNodes.ts (+test)     MOD  mirror of the above; no curl
    setWaveModel.ts (+test)      MOD  one surface (no includeCurl); crest carries r; analytic breaking slope; FD normal removed
    breakingField.test.ts        MOD  curl/fold tests out; sheet = probe; sharpening front-only; slope vs central differences
    SetWaves.ts                  MOD  one surface; render node returns slope + foam + foam frame (no eps, no normal, no lip)
    breaker.selftest.ts          MOD  curl/FD self-tests replaced: render sheet = probe; GPU slope = CPU slope with breaking
    lipProfile.ts (+test)        NEW  the ribbon's cross-section (Task 3; code below)
    crestTrace.ts (+test)        NEW  stations along each crest (Task 4; code below)
    lipProfileNodes.ts (+test)   NEW  TSL mirror of lipProfile (Task 5)
    BreakingRibbon.ts            NEW  stations buffer, frame/vertex/normal compute passes, mesh, footprint pass (Tasks 5–6)
    ribbon.selftest.ts           NEW  GPU self-tests for the ribbon (Tasks 5–6)
  ocean/
    waterSurface.ts              MOD  displacementWithSetFoam; per-cascade displacement for the ribbon's chop rule
    OceanSurface.ts              MOD  single-sided; Phase 1 normal (set slope + FFT); discards under the ribbon's footprint
    waterShading.ts              MOD  `lip` optional (the ribbon passes its thickness glow); comments
  dev/
    devSettings.ts (+test)       MOD  new break fields persist; removed ones dropped on load
    DevPanel.ts (+test)          MOD  BREAK_BINDINGS −9 +4; `ribbon tint` overlay
    referenceMoments.ts (+test)  MOD  behind-the-wave, lip-close-up
  app/App.ts                     MOD  trace stations per frame; ribbon update; overlay
README.md                        MOD  Break folder changes, new moments, ribbon tint
docs/superpowers/gallery/phase-2/  NEW shots 08+ (Task 8)
```

---

### Task 1: Diagnose the turquoise patches (controller, GPU)

The spec's §10 hypothesis (the seabed clamp) is refuted on the CPU (Q9). This task finds the real cause before the sheet changes, so the fix lands in the right task. The controller runs it: it needs the browser.

**Files:** none unless experiment C or D below applies. Record the result in the ledger and in the spec's §10.

- [ ] **Step 1: Reproduce.** Open Andrew's moment (the `m=` link in the ledger, the same values as `behind-the-wave` in Task 7) in the pane and screenshot it. The hard-edged turquoise patches sit in the trough behind the wave line, lower middle and right.
- [ ] **Step 2: Experiment A, breaking off.** Untick Break → `breaking` and screenshot. If the patches persist, they aren't the break.
- [ ] **Step 3: Experiment B, tide +1 m.** Set the tide to +1.0 (after a paused-frame redraw: press `P` twice) and screenshot. If the patches shrink or vanish, they are shallow water over the shelf.
- [ ] **Step 4: Experiment C, seabed look-through off.** In a local unstaged edit, make `seabedTerms` return `transmittance: vec3(0)`, then screenshot and revert. If the patches vanish, they are the seabed seen through thin water.
- [ ] **Step 5: Experiment D, total-surface clamp off.** In a local unstaged edit, make `WaterSurfaceModel.clampToSeabed` return `d`, then screenshot and revert. If the patches change, the FFT chop is being pinned.
- [ ] **Step 6: Rule and record.**
  - **C (seabed through shallow trough water):** the patches are the shelf's sand and bright reef seen through the thin water left in a trough. The reference shows that water aerated and the bed dark. Ruling: add to Task 6 a "broken water" term. Behind a bore that has passed, the sheet's foam trail weight (the Phase 2 foam's trail, before its noise) scales the seabed transmittance down by up to 80% and adds the mint bubble-cloud colour (`transmission × 0.3`). Also darken `SAND_ALBEDO` by 25% (the 2026-09-26 reference note: the reef reads dark).
  - **D (the clamp):** replace `clampToSeabed`'s hard `max` with a smooth floor, `floor + softplus((d − floor)/0.1)·0.1`, in Task 2 (CPU has no FFT, so this is GPU-only and needs no mirror).
  - **Neither:** record the screenshots, and ask Andrew at the Task 8 review with the evidence.
  - Commit nothing unless a spec note changes (the spec's §10 result goes in with the plan-rulings commit).

---

### Task 2: One sheet: front sharpening, analytic slope, no curl

**Files:**
- Modify: `src/breaker/breaking.ts`, `breaking.test.ts`, `breakingNodes.ts`, `breakingNodes.test.ts`, `setWaveModel.ts`, `setWaveModel.test.ts`, `breakingField.test.ts`, `SetWaves.ts`, `SetWaves.test.ts`, `breaker.selftest.ts`, `peakFace.ts` (only if it reads a removed name)
- Modify: `src/ocean/waterSurface.ts`, `OceanSurface.ts`, `waterShading.ts`
- Modify: `src/dev/DevPanel.ts`, `DevPanel.test.ts`, `devSettings.ts`, `devSettings.test.ts`

**Interfaces:**
- **Produces** `BreakParams`, exactly:
  ```ts
  export interface BreakParams {
    enabled: boolean; gamma: number; delta: number; hFloorM: number; stageSpan: number;
    troughDrain: number; beta: number; faceWidth: number; drainEnd: number; collapseStart: number;
    /** The lip leaves the crest at throwStrength × crest speed (relative to the wave), floored so it lands clear of the face. */
    throwStrength: number;
    /** The lip's thickness at its root (× H). */
    lipThickness: number;
    /** The curl collapses over collapseTime × τ_land after the lip lands. */
    collapseTime: number;
    /** The ribbon fades in from this breaking ratio, full at ribbonOnset + RIBBON_FULL_OFFSET; the sheet's front sharpening
     * ramps from there to r = 1. */
    ribbonOnset: number;
  }
  // DEFAULT_BREAK_PARAMS: the existing values for the kept fields, plus
  //   throwStrength 0.55, lipThickness 0.12, collapseTime 1.0, ribbonOnset 0.5
  // normalizeBreakParams clamps: throwStrength [0.1, 1.5], lipThickness [0.03, 0.3], collapseTime [0.3, 3],
  //   ribbonOnset [0.3, 0.9] (non-finite → default, as the others)
  export const RIBBON_FULL_OFFSET = 0.2;
  /** The front sharpening's weight: 0 below ribbonOnset + RIBBON_FULL_OFFSET, 1 from r = 1. */
  export function steepening(r: number, p: Pick<BreakParams, 'ribbonOnset'>): number; // smoothstep(ribbonOnset + 0.2, 1, r)
  ```
  **Removed:** `thetaMaxDeg`, `pivotDrop`, `pivotAhead`, `lipZone`, `lipBackReach`, `backWidth`, `steepEnd`, `curlStart`, `curlEnd`; `curlDisplacement`, `CurlResult`, `lipMask`, `lipWeight`, `FOAM_LIP_TOLERANCE`; `StageCurves.steep` and `StageCurves.curl`.
- `sharpenDrop(ahead, eta, etaCrest, H, k, steep, p)`: unchanged for `ahead ≥ 0`. It **returns 0 for `ahead < 0`**, and its `width` is `p.faceWidth * H`.
- `breakPoint(i, s, r, p)`: the `includeCurl` parameter is removed and `r` (the crest's breaking ratio) is added. It returns `{ eta, foam, dEtaDAhead }`, with no `du` and no `lip`:
  ```
  steep = steepening(r, p); c = stageCurves(s, p)          // { drain, collapse }
  gate: return { eta: i.eta, foam: 0, dEtaDAhead: 0 } unless (steep > 0 || s > 0) && H > MIN_BREAKING_HEIGHT_M
  sharpened = i.eta − sharpenDrop(ahead, i.eta, etaCrest, H, k, steep, p)
  eta = (sharpened − drainDepth(H, c.drain, p)·drainShape(θ)·env) · boreScale(H, hmin, c.collapse, p)
  foam = land·env·front·trail   (foamWeight without the lip term)
  dEtaDAhead = ∂eta/∂ahead of the breaking terms at fixed crest (sharpenDrop's and drainShape's derivatives, the latter via
     ∂θ/∂ahead = −ω·k/ω_mean·… as the Phase 1 slope's dξ/ds), scaled by boreScale; see Step 3
  ```
- `setWaveModel.ts`:
  - `Crest` gains `r: number`.
  - `crestAt` returns a crest (with `s` possibly 0) whenever breaking is enabled and the wave can reach `ribbonOnset`, since the sharpening now acts before onset.
  - `BreakOptions` loses `includeCurl`: `{ sample, params }`.
  - `SetWaveResult` loses `lip`. `slopeX/slopeZ` become the slope of the **final** surface (Phase 1's `slopeAlong` plus `dEtaDAhead` along the crest's travel direction, Jacobian-corrected as Phase 1's).
  - Removed: `sumWavesWithNormal` and `shiftField`.
- `SetWaves.ts`:
  - `displacementNode(xz)` returns the one surface.
  - `displacementWithSetFoamNode(xz, out: { slope: N; foam: N; foamFrame: N })` is the render path: it returns the displacement and assigns the varyings.
  - `breakSampleNode(xz)` returns `{ disp, slope, foam, stage }` (self-tests).
  - `slopeNode(xz)` returns the full slope (with breaking).
  - Removed: `displacementWithBreakNode`.
- `WaterSurfaceModel` (`waterSurface.ts`):
  - `displacement(xz, lod?)` is unchanged.
  - `displacementWithSetFoam(xz, lod, out)` replaces `displacementWithSetBreak`.
  - New: `fftCascadeDisplacement(xz: N, cascade: number, lod: N): N`, one cascade's weighted displacement (used by Task 5's chop rule).
- `OceanSurface.ts`:
  - `THREE.FrontSide`.
  - The normal is Phase 1's formula: `normalize(−fsx − setSlope.x, 1, −fsz − setSlope.y)`, with the FFT slopes Jacobian-corrected as now.
  - `underside` and the flip are removed; `lip` is not passed.
- `waterShading.ts`: `lip?: N` becomes optional (absent means 0).
- `DevPanel.ts` `BREAK_BINDINGS`: remove the 9 removed fields' entries and add:
  ```ts
  throwStrength: { label: 'throw strength (×c)', min: 0.1, max: 1.5, step: 0.01 },
  lipThickness: { label: 'lip thickness (×H)', min: 0.03, max: 0.3, step: 0.005 },
  collapseTime: { label: 'collapse time (×τ land)', min: 0.3, max: 3, step: 0.05 },
  ribbonOnset: { label: 'ribbon onset r', min: 0.3, max: 0.9, step: 0.01 },
  ```

- [ ] **Step 1: Write the failing tests** (in the files named; delete the tests of removed behaviour: curl displacement, lip mask/weight, back sharpening, finite-difference normals, cross-section fold tests that relied on the curl):
  - `breaking.test.ts`:
    - `sharpenDrop is zero behind the crest and unchanged ahead`: for `ahead` ∈ {−10, −1, −0.01}, it returns 0. For `ahead` ∈ {0.5, 2}, it equals the formula at `width = faceWidth·H`.
    - `steepening ramps from ribbonOnset + 0.2 to r = 1`: `steepening(0.69, p) = 0`, `steepening(1, p) = 1`, `steepening(0.85, p)` ∈ (0.4, 0.6) at the defaults.
    - `breakPoint keeps the Phase 1 point when neither steep nor breaking`: `r = 0.5`, `s = 0` gives `{ eta: i.eta, foam: 0, dEtaDAhead: 0 }`.
    - `breakPoint's dEtaDAhead matches a central difference of its eta along ahead`: sample (θ, ahead) pairs across [−π, π] with `uUnbroken` and `θ` moved consistently (θ changes by `−k·d` for a step `d` ahead); tolerance 2% of max |slope| + 1e-4.
    - `normalizeBreakParams clamps the new fields and repairs non-finite ones`.
  - `breakingField.test.ts`:
    - `the sheet is the probe`: `sumWaves(…, { sample, params })` at 200 points and times through a breaking moment equals itself called by the probe path. There is only one path now, so this is a single-call smoke test that the probe module calls exactly `sumWaves`.
    - `the back of a breaking wave is its unbroken back`: for the biggest default wave at the peak at `REF_BIGGEST.arrivalS + 0.5` (arrival 0 with `testWave`), at points 0.5–20 m behind the crest along the ray, η equals the Phase 1 η minus drain × drainShape (which is 0 behind) times boreScale, within 1 mm. No sinking.
    - `the face stands up before it breaks`: at a point on the north ledge where the crest's `r` = 0.85 (search along the ray), the sheet 2 m ahead of the crest is lower than Phase 1 by at least 0.1·H.
    - `the sheet's slope matches central differences of its height`: at 300 random points and times through REF_BIGGEST's break (inside the reef grid), `slopeX` ≈ (η(x + 0.02) − η(x − 0.02))/0.04 in world x, the same for z, within 3% of max|slope| + 2e-3. Skip points within 5 cm of a crest where `ahead` changes sign, since the Gaussian's kink at `ahead = 0` makes the one-sided definition differ.
    - `the probe's fixed-point search converges with the front sharpening`: the lineup-camera fixed-point loop from `HeightProbe`/`probe.selftest` (4 iterations `x0 ← x − d(x0)`) on a breaking wave at 50 lineup positions gives |x0 + d(x0) − x| < 1 cm.
    - Keep and adjust every other existing test (reduction to Phase 1 when breaking is off, the peel, the closeout, extremes).
  - `devSettings.test.ts`: `loads an overnight profile: removed break fields dropped, new ones defaulted`. A stored profile whose `breaking` has every overnight field (including `thetaMaxDeg: 120`, `backWidth: 2`) and none of the new ones loads as `{ …DEFAULT_BREAK_PARAMS, gamma: <stored> }` with no removed key present.
  - `DevPanel.test.ts`: the existing "every numeric BreakParams field has a binding" and "every Break slider range survives normalizeBreakParams" tests cover the new bindings (update their key lists).
- [ ] **Step 2: Run** `npx vitest run src/breaker src/dev`. **Expected:** the new tests FAIL (missing exports, wrong values).
- [ ] **Step 3: Implement** the interface above.
  - The derivative, term by term, at fixed crest (the crest's frame is constant across a cross-section):
    - `sharpenDrop = steep·sink(a)·fade(a)·m(a)`, with `a = ahead`, `sink = 1 − exp(−(a/w)²)`, `fade = smoothstep(2q, q, |a|)` (q a quarter wavelength), `m = max(η − (η_c − H), 0)`. Its derivative is `steep·(sink'·fade·m + sink·fade'·m + sink·fade·m')`, where `m' = ∂η/∂a` (the Phase 1 slope along travel where `m > 0`, else 0).
    - The drain term's derivative uses `drainShape'(θ)·∂θ/∂a`, with `∂θ/∂a = ω·∂ξ/∂a` and `∂ξ/∂a = dXiDs` as in Phase 1.
    - Everything is times `boreScale`.
  - Mirror it in `breakingNodes.ts` and `SetWaves.ts`: the per-wave sum adds `dEtaDAhead` along `f.dir`, divided by Phase 1's Jacobian as `slopeAlong` is.
  - The seabed clamp stays: where it engages, the slope is set to 0 there, on both CPU and GPU.
  - Remove the finite-difference points from `sumBreaking` entirely: no `eps`, no neighbours.
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck`. **Expected:** all PASS.
- [ ] **Step 5: GPU self-tests** (`breaker.selftest.ts`):
  - Replace the curl/finite-difference tests with:
    - `breaker: the rendered sheet is the probe's surface`: `breakSampleNode(xz).disp` equals `displacementNode(xz)` at the POINTS and at 64 points around the peak during REF_BIGGEST's break, within 1e-5.
    - `breaker: GPU slope with breaking matches the CPU`: `slopeNode` against `sumWaves(…).slopeX/Z`, within 2e-3 absolute or 2%.
  - Keep the field, Phase 1 parity (breaking off), stage and probe tests; update names and calls.
  - The implementer runs none of these; the controller does (`?selftest`).
- [ ] **Step 6: Commit.**
  ```bash
  git add src/breaker src/ocean src/dev
  git commit -m "refactor(breaker): one sheet (front sharpening, analytic slope); the heightfield curl, FD normals and back sinking go

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 3: `lipProfile.ts`: the ribbon's cross-section

**Files:**
- Create: `src/breaker/lipProfile.ts`
- Test: `src/breaker/lipProfile.test.ts`

**Interfaces:**
- Consumes: `BreakParams`, `RIBBON_FULL_OFFSET` and `steepening` from Task 2; `sumWaves`, `BreakOptions { sample, params }` and `localHeight` (Task 2 signatures).
- Produces (used by Tasks 4 and 5):
  - `Vec2`
  - `LipParams`
  - `ProfileInput { H, c, r, tb }`
  - `ProfileFrame`
  - `profileFrame(base, input, p)`
  - `sampleSegment(j)`
  - `sampleHome(j, f)`
  - `profilePoint(j, f, baseHome): { pos, thickness, curlFoam, lipness }`
  - `buildProfile(base, input, p)`
  - `ribbonWeight(r, tb, tauLand, p)`
  - `landingTime(drop)`
  - `lipThicknessAt(f, σ)`
  - `crossings(pts)`
  - the constants `PROFILE_SEGMENTS`, `PROFILE_SAMPLES` (160), `SEGMENT_ID`, `FOOT_WIDTHS`, `LAND_CLEARANCE_M`, `EDGE_MARGIN_M`, `BACK_EDGE_H`, `MIN_LIP_THICKNESS_M`, `TIP_THICKNESS_RATIO`, `LIP_GROW_PROGRESS`, `MAX_THICKNESS_OF_RADIUS`, `WALL_BACK_H`, `WALL_HEIGHT`, `HAND_BACK_S`, `LANDING_FOAM_RISE`, `BACK_OFF_DROP_H`, `GRAVITY_MS2`

This code was prototyped against the real field (Q3–Q5). Transcribe it. If a test fails on the Task 2 sheet, report it (DONE_WITH_CONCERNS, with the failing case) rather than loosen a threshold. The controller rules.

- [ ] **Step 1: Write the failing test**: `src/breaker/lipProfile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, breakingRatio } from './breaking';
import {
  GRAVITY_MS2, type LipParams, MIN_LIP_THICKNESS_M, PROFILE_SAMPLES, PROFILE_SEGMENTS, type ProfileInput, type Vec2, buildProfile, crossings,
  landingTime, profileFrame, sampleHome,
} from './lipProfile';
import { computeReefField, sampleField } from './reefField';
import { type ActiveWave, type BreakOptions, type WaveContext, localHeight, sumWaves } from './setWaveModel';

// The app's field (1 m cells, default swell and tide) and the Task 2 sheet: Phase 1 + front sharpening + drain + bore.
const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const SHEET: BreakOptions = { sample: (x, z) => sampleField(field, x, z), params: DEFAULT_BREAK_PARAMS };
const LIP: LipParams = DEFAULT_BREAK_PARAMS;
const HS = surferFeetToHs(DEFAULT_CONDITIONS.swell.sizeFt);
const REF_BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const testWave = (heightM: number): ActiveWave => ({ arrivalS: 0, heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 });

/** The sheet's cross-section through the crest station at (x0, z0) when w's crest is there, along the field's ray. */
function stationAt(x0: number, z0: number, w: ActiveWave, tb: number | null, faceWidth = LIP.faceWidth) {
  const sheet: BreakOptions = { ...SHEET, params: { ...SHEET.params, faceWidth } };
  const f0 = sampleField(field, x0, z0);
  const t = f0.tau + w.arrivalS;
  const base = (u: number): Vec2 => {
    const x = x0 + f0.dirX * u, z = z0 + f0.dirZ * u;
    const s = sumWaves(x, z, t, sampleField(field, x, z), [w], ctx, sheet);
    return [u + s.dx * f0.dirX + s.dz * f0.dirZ, s.eta];
  };
  const input: ProfileInput = { H: localHeight(w, f0), c: ctx.omega / f0.k, r: breakingRatio(w.heightM * f0.amp, f0.hmin, DEFAULT_BREAK_PARAMS), tb };
  return { base, input };
}
const near = (a: Vec2, b: Vec2, tol = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

describe('lipProfile', () => {
  const big = testWave(REF_BIGGEST.heightM);
  it('has PROFILE_SAMPLES samples whose homes run monotonically from the front edge to the back edge', () => {
    const { base, input } = stationAt(0, 0, big, 0.3);
    const f = profileFrame(base, input, LIP);
    expect(PROFILE_SAMPLES).toBe(160);
    const homes = Array.from({ length: PROFILE_SAMPLES }, (_, j) => sampleHome(j, f));
    for (let j = 1; j < homes.length; j++) expect(homes[j]).toBeLessThan(homes[j - 1]);
    expect(homes[0]).toBeCloseTo(f.uFront, 9);
    expect(homes.at(-1)).toBeCloseTo(f.uBack, 9);
  });

  it('the biggest default wave at the peak lands its lip 0.6–1.5 s after onset, ahead of the face', () => {
    const { base, input } = stationAt(0, 0, big, 0);
    const f = profileFrame(base, input, LIP);
    expect(f.tauLand).toBeGreaterThan(0.6);
    expect(f.tauLand).toBeLessThan(1.5);
    expect(f.K[0] + f.vj * f.tauLand).toBeGreaterThanOrEqual(f.F[0] + 0.3 - 1e-9);
    console.log(`peak: H ${input.H.toFixed(2)} τ_land ${f.tauLand.toFixed(3)} s, vj ${f.vj.toFixed(2)} m/s (c ${input.c.toFixed(2)}), reach ${(f.vj * f.tauLand).toFixed(2)} m, foot ${f.uFoot.toFixed(2)} m, drop ${(f.K[1] - f.F[1]).toFixed(2)} m`);
  });

  it('the tip follows the ballistic arc from the crest', () => {
    for (const tb of [0.1, 0.3, 0.6]) {
      const { base, input } = stationAt(0, 0, big, tb);
      const p = buildProfile(base, input, LIP);
      const f = p.frame;
      const tip = p.points[PROFILE_SEGMENTS.front + PROFILE_SEGMENTS.face + PROFILE_SEGMENTS.wall + PROFILE_SEGMENTS.under + PROFILE_SEGMENTS.cap];
      expect(near(tip, [f.K[0] + f.vj * tb, f.K[1] - 0.5 * GRAVITY_MS2 * tb * tb], 1e-9)).toBe(true);
    }
  });

  it('never crosses itself before the lip lands (peak, ledge points, bigger waves, slider ends)', () => {
    const cases: { x: number; z: number; h: number; p: LipParams }[] = [];
    // Only where the crest has broken (r ≥ 1): a time since onset means the section broke.
    for (const [x, z] of [[0, 0], [20, -40], [35, -90], [15, 16], [50, 36]] as const) for (const h of [REF_BIGGEST.heightM, 1.8 * HS, 3 * HS]) {
      const f = sampleField(field, x, z);
      if (breakingRatio(h * f.amp, f.hmin, DEFAULT_BREAK_PARAMS) >= 1) cases.push({ x, z, h, p: LIP });
    }
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const p of [{ ...LIP, throwStrength: 0.1 }, { ...LIP, throwStrength: 1 }, { ...LIP, lipThickness: 0.03 }, { ...LIP, lipThickness: 0.3 }, { ...LIP, faceWidth: 0.1 }, { ...LIP, faceWidth: 3 }]) {
      cases.push({ x: 0, z: 0, h: REF_BIGGEST.heightM, p });
    }
    let worst = 0;
    for (const c of cases) {
      const w = testWave(c.h);
      const probe = stationAt(c.x, c.z, w, 0, c.p.faceWidth);
      const tau = profileFrame(probe.base, probe.input, c.p).tauLand;
      for (const frac of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 0.999]) {
        const { base, input } = stationAt(c.x, c.z, w, frac * tau, c.p.faceWidth);
        const n = crossings(buildProfile(base, input, c.p).points);
        worst = Math.max(worst, n);
        if (n) console.log(`crossing at (${c.x},${c.z}) h ${c.h.toFixed(2)} frac ${frac} ${JSON.stringify(c.p)}`);
      }
      for (const r of [0.55, 0.7, 0.85, 0.99]) {
        const { base, input } = stationAt(c.x, c.z, w, null, c.p.faceWidth);
        expect(crossings(buildProfile(base, { ...input, r }, c.p).points)).toBe(0);
      }
    }
    expect(worst).toBe(0);
  });

  it('is exactly the sheet before it steepens and after it collapses', () => {
    for (const [r, tb] of [[0.6, null], [0.69, null], [2, Infinity], [2, 10]] as const) {
      const { base, input } = stationAt(0, 0, big, tb);
      const p = buildProfile(base, { ...input, r }, LIP);
      p.points.forEach((pt, j) => expect(near(pt, base(p.homes[j]), 1e-9)).toBe(true));
    }
  });

  it('its edges are the sheet at every stage', () => {
    for (const tb of [null, 0, 0.4, 0.9, 1.4, 3]) {
      const { base, input } = stationAt(0, 0, big, tb);
      const p = buildProfile(base, { ...input, r: tb === null ? 0.9 : input.r }, LIP);
      expect(near(p.points[0], base(p.frame.uFront))).toBe(true);
      expect(near(p.points.at(-1) as Vec2, base(p.frame.uBack))).toBe(true);
      for (let j = 0; j < PROFILE_SEGMENTS.front; j++) expect(near(p.points[j], base(p.homes[j]))).toBe(true);
    }
  });

  it('the lip is never thinner than 2 cm once it has grown, and has no foam before it lands', () => {
    const thin = { ...LIP, lipThickness: 0.03 };
    const probe = stationAt(0, 0, big, 0);
    const tau = profileFrame(probe.base, probe.input, thin).tauLand;
    for (const frac of [0.35, 0.6, 0.95]) {
      const { base, input } = stationAt(0, 0, big, frac * tau);
      const p = buildProfile(base, input, thin);
      p.lipness.forEach((l, j) => { if (l > 0.99) expect(p.thickness[j]).toBeGreaterThanOrEqual(MIN_LIP_THICKNESS_M - 1e-12); });
      expect(Math.max(...p.curlFoam)).toBe(0);
    }
    const after = stationAt(0, 0, big, 1.5);
    expect(Math.max(...buildProfile(after.base, after.input, LIP).curlFoam)).toBeGreaterThan(0.5);
  });

  it('stays finite at the extremes (12 ft, 0.5 ft, huge and tiny times)', () => {
    for (const h of [0.05, surferFeetToHs(12) * 1.8]) for (const tb of [null, 0, 0.5, 5, 1e6, Infinity]) {
      const { base, input } = stationAt(0, 0, testWave(h), tb);
      const p = buildProfile(base, { ...input, r: tb === null ? 0.95 : input.r }, LIP);
      for (const pt of p.points) { expect(Number.isFinite(pt[0])).toBe(true); expect(Number.isFinite(pt[1])).toBe(true); }
    }
    expect(landingTime(-3)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/breaker/lipProfile.test.ts`. **Expected:** FAIL (`Cannot find module './lipProfile'`).
- [ ] **Step 3: Implement**: `src/breaker/lipProfile.ts`:

```ts
import { smoothstep } from '../math/smoothstep';
import { type BreakParams, RIBBON_FULL_OFFSET, steepening } from './breaking';

/**
 * The breaking ribbon's cross-section (breaking-ribbon spec §6): the water's surface outline in the vertical plane
 * across one crest station, as PROFILE_SAMPLES points in one unbroken line from the front edge (the trough ahead) up the
 * face, round the tube, out along the underside of the lip, round its tip, back over its top to the crest and down the
 * back to the back edge. u is metres ahead of the crest's undisplaced position along the station's travel normal, y
 * metres up from still water. The source of truth: lipProfileNodes.ts mirrors it term by term on the GPU.
 *
 * The curve is built on the sheet's own cross-section `base(u)`: the displaced sheet point for undisplaced u (the sheet
 * is Phase 1 + drain + bore + the front sharpening, spec R8 as amended by Q1). Every sample has a "home" u on the base,
 * monotone along the curve, and ends up at lerp(base(home), constructed, steep·(1 − collapse)): before the wave
 * steepens, and again once it has collapsed, the ribbon is exactly the sheet.
 */

export type Vec2 = [number, number];

export const GRAVITY_MS2 = 9.81;

/** Samples per segment, front edge to back edge (spec §6.6, R7). */
export const PROFILE_SEGMENTS = { front: 12, face: 16, wall: 12, under: 28, cap: 12, outer: 40, back: 40 } as const;
export type ProfileSegment = keyof typeof PROFILE_SEGMENTS;
const SEGMENT_ORDER: readonly ProfileSegment[] = ['front', 'face', 'wall', 'under', 'cap', 'outer', 'back'];
export const PROFILE_SAMPLES = SEGMENT_ORDER.reduce((n, s) => n + PROFILE_SEGMENTS[s], 0); // 160
/** Segment ids in PROFILE_SEGMENTS order (the GPU mirror uses the numbers). */
export const SEGMENT_ID: Record<ProfileSegment, number> = { front: 0, face: 1, wall: 2, under: 3, cap: 4, outer: 5, back: 6 };

/** The face's foot sits this many face widths ahead of the crest: where the sheet's front sharpening has sunk 97% of
 * the way to the trough (1 − exp(−1.9²) ≈ 0.97). */
export const FOOT_WIDTHS = 1.9;
/** The lip lands at least this far ahead of the foot, so the tip never meets the face before it lands. */
export const LAND_CLEARANCE_M = 0.3;
/** The front and back edges sit this far beyond the constructed curve (the sheet's own shape out there). */
export const EDGE_MARGIN_M = 2;
/** The back edge: this many H behind the crest, plus EDGE_MARGIN_M. */
export const BACK_EDGE_H = 0.5;
export const MIN_LIP_THICKNESS_M = 0.02;
/** The lip's thickness at the tip, as a fraction of its thickness at the root. */
export const TIP_THICKNESS_RATIO = 0.25;
/** The lip grows to its full thickness over this fraction of the throw (at onset it has no length, so no thickness). */
export const LIP_GROW_PROGRESS = 0.3;
/** The underside is the outer arc offset inward; its thickness never exceeds this fraction of the arc's smallest radius
 * of curvature (v_j²/g, at the root), so the offset curve never folds. */
export const MAX_THICKNESS_OF_RADIUS = 0.8;
/** The tube's back wall W: this many H behind the crest at full throw… */
export const WALL_BACK_H = 0.1;
/** …at this fraction of the way from the trough up to the lip's root. */
export const WALL_HEIGHT = 0.45;
/** After the collapse ends the ribbon fades out (hands back to the sheet) over this long (s). */
export const HAND_BACK_S = 0.5;
/** The foam from the lip's landing rises over this fraction of the collapse. */
export const LANDING_FOAM_RISE = 0.3;
/** A broken section whose crest stands less than BACK_OFF_DROP_H[1]·H above its foot (it has run into deeper water and
 * the sheet has stopped sharpening it) relaxes back to the sheet, fully by BACK_OFF_DROP_H[0]·H. */
export const BACK_OFF_DROP_H: readonly [number, number] = [0.3, 0.6];

/** The BreakParams the profile reads (breaking.ts documents each). */
export type LipParams = Pick<BreakParams, 'throwStrength' | 'lipThickness' | 'collapseTime' | 'ribbonOnset' | 'faceWidth'>;

/** What the profile needs from its station. */
export interface ProfileInput {
  /** Local wave height (m), capped and tapered as the sheet's (setWaveModel.localHeight × lateral). */
  H: number;
  /** Crest speed ω/k (m/s). */
  c: number;
  /** The crest's breaking ratio (breaking.breakingRatio, uncapped H). */
  r: number;
  /** Time since onset (s): null before the section breaks, Infinity once it is past the hand-back (crestTrace). */
  tb: number | null;
}

/** Everything about one station's profile that does not depend on the sample: computed once per station. */
export interface ProfileFrame {
  K: Vec2;
  F: Vec2;
  /** Unit tangent of the base at F, pointing back toward the crest (the direction the curve runs). */
  tF: Vec2;
  uFoot: number;
  uFront: number;
  uBack: number;
  tauLand: number;
  vj: number;
  /** Throw progress t/τ_land, clamped to [0, 1]. */
  prog: number;
  /** How far the lip has thrown (m, ahead of K). */
  reach: number;
  /** Root thickness (m), grown in over the throw. */
  eRoot: number;
  /** The weight of the constructed curve against the base: steep × (1 − collapse). */
  weight: number;
  collapse: number;
  /** Landing foam [0, 1]. */
  landing: number;
  /** Ribbon weight ρ [0, 1] (0: the station is dropped). */
  rho: number;
  W: Vec2;
  R: Vec2;
}

const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const norm2 = (v: Vec2): Vec2 => { const l = Math.hypot(v[0], v[1]); return l > 1e-9 ? [v[0] / l, v[1] / l] : [0, 1]; };

function hermite(p0: Vec2, t0: Vec2, p1: Vec2, t1: Vec2, s: number): Vec2 {
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return [h00 * p0[0] + h10 * t0[0] + h01 * p1[0] + h11 * t1[0], h00 * p0[1] + h10 * t0[1] + h01 * p1[1] + h11 * t1[1]];
}

/** ρ: fades in over [ribbonOnset, ribbonOnset + 0.2] before breaking, 1 from onset, out over HAND_BACK_S after the collapse. */
export function ribbonWeight(r: number, tb: number | null, tauLand: number, p: LipParams): number {
  if (tb === null) return smoothstep(p.ribbonOnset, p.ribbonOnset + RIBBON_FULL_OFFSET, r);
  const end = tauLand * (1 + p.collapseTime);
  return 1 - smoothstep(end, end + HAND_BACK_S, tb);
}

/** The landing time for a crest `drop` metres above the trough it lands in: a fall from rest, √(2·drop/g). */
export function landingTime(drop: number): number {
  return Math.sqrt((2 * Math.max(drop, 0.05)) / GRAVITY_MS2);
}

/**
 * The station's frame, from four base points: the crest K = base(0), the foot F = base(uFoot), base(uFoot − 0.1) for the
 * face's tangent there, and the sheet where the lip lands. The lip lands when the underside of its tip reaches the
 * higher of the foot and the water at the landing spot.
 */
export function profileFrame(base: (u: number) => Vec2, input: ProfileInput, p: LipParams): ProfileFrame {
  const { H, c, r, tb } = input;
  const uFoot = FOOT_WIDTHS * p.faceWidth * H;
  const K = base(0), F = base(uFoot), Fb = base(uFoot - 0.1);
  const tF = norm2([Fb[0] - F[0], Fb[1] - F[1]]);
  const tau0 = landingTime(K[1] - F[1]);
  const vj0 = Math.max(p.throwStrength * c, (F[0] - K[0] + LAND_CLEARANCE_M) / tau0);
  const landing0 = base(uFoot + (K[0] + vj0 * tau0 - F[0]));
  const tipBelow = TIP_THICKNESS_RATIO * p.lipThickness * H;
  const tauLand = landingTime(K[1] - Math.max(F[1], landing0[1]) - tipBelow);
  const vj = Math.max(p.throwStrength * c, (F[0] - K[0] + LAND_CLEARANCE_M) / tauLand);
  const t = tb === null ? 0 : Math.min(Math.max(tb, 0), tauLand);
  const prog = t / tauLand;
  const reach = vj * t;
  const steep = tb === null
    ? steepening(r, p)
    : smoothstep(BACK_OFF_DROP_H[0] * H, BACK_OFF_DROP_H[1] * H, K[1] - F[1]);
  const collapse = tb === null ? 0 : smoothstep(tauLand, tauLand * (1 + p.collapseTime), tb);
  const landing = tb === null ? 0 : smoothstep(tauLand, tauLand * (1 + LANDING_FOAM_RISE * p.collapseTime), tb);
  const grow = smoothstep(0, LIP_GROW_PROGRESS, prog);
  const eRoot = Math.max(MIN_LIP_THICKNESS_M, Math.min(p.lipThickness * H, (MAX_THICKNESS_OF_RADIUS * vj * vj) / GRAVITY_MS2)) * grow;
  const R: Vec2 = [K[0], K[1] - eRoot];
  const W: Vec2 = [K[0] - WALL_BACK_H * H * prog, F[1] + WALL_HEIGHT * (R[1] - F[1])];
  // Beyond where the lip will land (fixed over the throw, so the front edge doesn't move).
  const uFront = Math.max(uFoot, K[0] + vj * tauLand) + LAND_CLEARANCE_M + EDGE_MARGIN_M;
  return {
    K, F, tF, uFoot, uFront, uBack: -(BACK_EDGE_H * H + EDGE_MARGIN_M), tauLand, vj, prog, reach, eRoot,
    weight: steep * (1 - collapse), collapse, landing, rho: ribbonWeight(r, tb, tauLand, p), W, R,
  };
}

/** Which segment sample j is in, and its position s ∈ [0, 1) within it (s = j' / count; the back's last sample is 1). */
export function sampleSegment(j: number): { seg: ProfileSegment; s: number } {
  let i = j;
  for (const seg of SEGMENT_ORDER) {
    const n = PROFILE_SEGMENTS[seg];
    if (i < n) return { seg, s: seg === 'back' ? i / (n - 1) : i / n };
    i -= n;
  }
  return { seg: 'back', s: 1 };
}

/** The home u of sample j: monotone from uFront (j = 0) to uBack (the last sample), through uFoot and the crest (0). */
export function sampleHome(j: number, f: ProfileFrame): number {
  const { seg, s } = sampleSegment(j);
  const uF = f.uFoot;
  switch (seg) {
    case 'front': return f.uFront + (uF - f.uFront) * s;
    case 'face': return uF * (1 - 0.25 * s);
    case 'wall': return uF * (0.75 - 0.15 * s);
    case 'under': return uF * (0.6 - 0.3 * s);
    case 'cap': return uF * (0.3 - 0.05 * s);
    case 'outer': return uF * 0.25 * (1 - s);
    default: return f.uBack * s;
  }
}

/** The outer surface of the lip at arc parameter σ ∈ [0, 1] (root to tip): the ballistic arc from K. */
function outer(f: ProfileFrame, sigma: number): Vec2 {
  const du = f.reach * sigma, tp = du / f.vj;
  return [f.K[0] + du, f.K[1] - 0.5 * GRAVITY_MS2 * tp * tp];
}
/** The arc's outward (upper) unit normal at σ. */
function outerNormal(f: ProfileFrame, sigma: number): Vec2 {
  const tp = (f.reach * sigma) / f.vj;
  return norm2([(GRAVITY_MS2 * tp) / f.vj, 1]);
}
/** Lip thickness at σ: eRoot at the root, TIP_THICKNESS_RATIO of it at the tip, never below the minimum once grown. */
export function lipThicknessAt(f: ProfileFrame, sigma: number): number {
  const e = f.eRoot * (1 - (1 - TIP_THICKNESS_RATIO) * sigma);
  return f.eRoot > 0 ? Math.max(e, MIN_LIP_THICKNESS_M * smoothstep(0, LIP_GROW_PROGRESS, f.prog)) : 0;
}
function under(f: ProfileFrame, sigma: number): Vec2 {
  const o = outer(f, sigma), n = outerNormal(f, sigma), e = lipThicknessAt(f, sigma);
  return [o[0] - n[0] * e, o[1] - n[1] * e];
}

export interface ProfilePoint {
  pos: Vec2;
  /** The lip's thickness here (m); 0 off the lip (segments under, cap, outer carry it). Keys the turquoise glow. */
  thickness: number;
  /** Foam from the lip's landing [0, 1] (spec D4: where the wave turns inside out). Composed with the sheet's by max. */
  curlFoam: number;
  /** 1 on the lip (under, cap, outer), 0 elsewhere: the FFT chop fades out over it (spec R6). */
  lipness: number;
}

/** The constructed (unblended) point for sample j. */
function constructed(j: number, f: ProfileFrame, baseHome: Vec2): { pos: Vec2; thickness: number; lipness: number } {
  const { seg, s } = sampleSegment(j);
  switch (seg) {
    case 'front':
    case 'back':
      return { pos: baseHome, thickness: 0, lipness: 0 };
    case 'face': {
      const L = Math.hypot(f.W[0] - f.F[0], f.W[1] - f.F[1]);
      return { pos: hermite(f.F, [f.tF[0] * L, f.tF[1] * L], f.W, [0, L], s), thickness: 0, lipness: 0 };
    }
    case 'wall': {
      const L = Math.max(Math.hypot(f.R[0] - f.W[0], f.R[1] - f.W[1]), 0.05);
      return { pos: hermite(f.W, [0, L], f.R, [L * f.prog, L * (1 - f.prog)], s), thickness: 0, lipness: 0 };
    }
    case 'under':
      return { pos: under(f, s), thickness: lipThicknessAt(f, s), lipness: 1 };
    case 'cap': {
      const P = outer(f, 1), n = outerNormal(f, 1), e = lipThicknessAt(f, 1);
      const cx = P[0] - (n[0] * e) / 2, cy = P[1] - (n[1] * e) / 2;
      const a = Math.atan2(-n[1], -n[0]) + Math.PI * s;
      return { pos: [cx + (Math.cos(a) * e) / 2, cy + (Math.sin(a) * e) / 2], thickness: e, lipness: 1 };
    }
    default: // outer, tip → root
      return { pos: outer(f, 1 - s), thickness: lipThicknessAt(f, 1 - s), lipness: 1 };
  }
}

/** Sample j of the profile, given its frame and the base at its home (base(sampleHome(j, f))). */
export function profilePoint(j: number, f: ProfileFrame, baseHome: Vec2): ProfilePoint {
  const c = constructed(j, f, baseHome);
  const { seg } = sampleSegment(j);
  // Landing foam: the curl (wall, lip) and the front out to just past where the lip lands.
  const home = sampleHome(j, f);
  const landAt = f.K[0] + f.vj * f.tauLand;
  const region = seg === 'back' ? 0 : seg === 'front' ? 1 - smoothstep(landAt, landAt + 1.5, home) : seg === 'face' ? 0.5 : 1;
  return { pos: lerp2(baseHome, c.pos, f.weight), thickness: c.thickness * f.weight, curlFoam: f.landing * region, lipness: c.lipness * f.weight };
}

export interface Profile {
  frame: ProfileFrame;
  points: Vec2[];
  homes: number[];
  thickness: number[];
  curlFoam: number[];
  lipness: number[];
}

/** The whole profile for one station (CPU reference and tests). */
export function buildProfile(base: (u: number) => Vec2, input: ProfileInput, p: LipParams): Profile {
  const frame = profileFrame(base, input, p);
  const out: Profile = { frame, points: [], homes: [], thickness: [], curlFoam: [], lipness: [] };
  for (let j = 0; j < PROFILE_SAMPLES; j++) {
    const home = sampleHome(j, frame);
    const pt = profilePoint(j, frame, base(home));
    out.points.push(pt.pos); out.homes.push(home); out.thickness.push(pt.thickness); out.curlFoam.push(pt.curlFoam); out.lipness.push(pt.lipness);
  }
  return out;
}

/**
 * How many pairs of non-adjacent segments of the polyline cross properly (0 for a simple curve). Touching at an end
 * (within 1e-6 of either segment's ends, as the unthrown lip's root touches the crest) and zero-length segments don't
 * count. Test helper.
 */
export function crossings(pts: readonly Vec2[]): number {
  const EPS = 1e-6;
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], rx = pts[i + 1][0] - ax, ry = pts[i + 1][1] - ay;
    const lr = Math.hypot(rx, ry);
    if (lr <= EPS) continue;
    for (let j = i + 2; j + 1 < pts.length; j++) {
      const [cx, cy] = pts[j], sx = pts[j + 1][0] - cx, sy = pts[j + 1][1] - cy;
      const ls = Math.hypot(sx, sy);
      if (ls <= EPS) continue;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-15) continue; // parallel
      const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
      if (t * lr > EPS && (1 - t) * lr > EPS && u * ls > EPS && (1 - u) * ls > EPS) n++;
    }
  }
  return n;
}
```

- [ ] **Step 4: Run** `npx vitest run src/breaker/lipProfile.test.ts` and `npm run typecheck`. **Expected:** 8 PASS. The log line reads `peak: H 3.16 τ_land ≈ 0.79 s …`, within 0.6–1.5 s.
- [ ] **Step 5: Commit.**
  ```bash
  git add src/breaker/lipProfile.ts src/breaker/lipProfile.test.ts
  git commit -m "feat(breaker): lipProfile, the ribbon's cross-section (gravity-thrown lip, tube, landing, collapse)

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 4: `crestTrace.ts`: stations along each crest

**Files:**
- Create: `src/breaker/crestTrace.ts`
- Test: `src/breaker/crestTrace.test.ts`

**Interfaces:**
- Consumes: `BreakParams` (Task 2); `HAND_BACK_S` and `landingTime` (Task 3); `sampleField`, `ReefField`, `ActiveWave`, `WaveContext`, `localHeight`, `phaseXi`, `TAPER_NEAR_M`, `fieldBreakingHeight` (existing).
- Produces (used by Tasks 5 and 6):
  - `Station { gap: false; wave; x; z; arc; nx; nz; H; c; r; tb }`
  - `StationEntry = Station | { gap: true }`
  - `TraceInput { cameraX; cameraZ; params; minHeightM }`
  - `traceStations(field, waves, t, ctx, input): StationEntry[]`
  - `timeSinceOnset(field, w, x, z, ctx, p): number | null`
  - `landingEstimate(H, p)`
  - `minRibbonHeight(fieldBreakingHeightM, p)`
  - the constants `SPACING_PER_M`, `MIN_SPACING_M`, `MAX_SPACING_M`, `MAX_STATIONS` (2048), `BELOW_ONSET_RUN_M`, `KEY_SPACING_M`, `LOOK_BACK_STEP_M`, `LOOK_BACK_MARGIN_S`, `PROJECT_ITERATIONS`, `SEED_ITERATIONS`, `CREST_TOLERANCE_S`, `STEP_PROJECT_MAX_M`

Prototyped against the real field (Q7, Q8, Q12). Transcribe it. Report any failure rather than loosen a threshold.

- [ ] **Step 1: Write the failing test**: `src/breaker/crestTrace.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { NORTH_LEDGE, SOUTH_LEDGE } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import {
  MAX_SPACING_M, MAX_STATIONS, MIN_SPACING_M, SPACING_PER_M, type Station, type StationEntry, minRibbonHeight, timeSinceOnset, traceStations,
} from './crestTrace';
import { computeReefField, sampleField } from './reefField';
import { type ActiveWave, type WaveContext, fieldBreakingHeight, phaseXi } from './setWaveModel';

const P = DEFAULT_BREAK_PARAMS;
const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const HS = surferFeetToHs(DEFAULT_CONDITIONS.swell.sizeFt);
const REF_BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const testWave = (heightM: number): ActiveWave => ({ arrivalS: 0, heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 });
const MIN_H = minRibbonHeight(fieldBreakingHeight(field, P), P);
const LINEUP: [number, number] = [-25, 45];
const trace = (waves: ActiveWave[], t: number, cam: [number, number] = LINEUP): StationEntry[] =>
  traceStations(field, waves, t, ctx, { cameraX: cam[0], cameraZ: cam[1], params: P, minHeightM: MIN_H });
const live = (e: StationEntry[]): Station[] => e.filter((s): s is Station => !s.gap);
/** Position along a ledge polyline's first segment from its start (m). */
const alongLedge = (line: readonly (readonly [number, number])[], x: number, z: number): number => {
  const [a, b] = [line[0], line[1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / len;
};

describe('crestTrace', () => {
  const big = testWave(REF_BIGGEST.heightM), peeler = testWave(1.8 * HS);

  it('every station sits on its crest (|ξ| < 2 ms) and a trace takes a few ms at most', () => {
    for (const w of [big, peeler]) for (const t of [-1, 0, 1, 2, 3, 4]) {
      const st = live(trace([w], t));
      for (const s of st) expect(Math.abs(phaseXi(s.x, s.z, t, sampleField(field, s.x, s.z), w, ctx))).toBeLessThan(2e-3);
    }
    const times: number[] = [];
    for (let i = 0; i < 10; i++) { const t0 = performance.now(); trace([peeler, big], 2); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    console.log(`trace (two waves) median ${times[5].toFixed(2)} ms, stations ${trace([peeler, big], 2).length}`);
    expect(times[5]).toBeLessThan(4);
  });

  it('spaces stations by distance from the camera, within the cap', () => {
    const cam: [number, number] = [8, 2];
    const st = live(trace([peeler], 2, cam));
    expect(st.length).toBeGreaterThan(50);
    for (let i = 1; i < st.length; i++) {
      const a = st[i - 1], b = st[i];
      if (a.wave !== b.wave || Math.abs(b.arc - a.arc) > 5) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      const rule = Math.min(MAX_SPACING_M, Math.max(MIN_SPACING_M, SPACING_PER_M * Math.hypot(a.x - cam[0], a.z - cam[1])));
      expect(d).toBeGreaterThan(rule * 0.5);
      expect(d).toBeLessThan(rule * 1.5);
    }
    const crowded = trace([peeler, big, testWave(1.6 * HS)], 2, [10, 0]);
    expect(crowded.length).toBeLessThanOrEqual(MAX_STATIONS);
  });

  it('is deterministic, and separates waves and undrawn stretches with single gaps', () => {
    const a = trace([big, peeler], 2), b = trace([big, peeler], 2);
    expect(a).toEqual(b);
    expect(a[0].gap).toBe(false);
    expect((a.at(-1) as StationEntry).gap).toBe(false);
    for (let i = 1; i < a.length; i++) expect(a[i].gap && a[i - 1].gap).toBe(false);
  });

  it('traces nothing for a wave too small to steepen, a lull, or a flat day', () => {
    expect(trace([testWave(0.3 * MIN_H)], 0)).toEqual([]);
    expect(trace([], 0)).toEqual([]);
  });

  it('the left peels north along the ledge at 8–20 m/s (time since onset falls toward the shoulder)', () => {
    // P8: the 1.8·Hs wave peels over the first 100 m. Stations north of the peak on the north ledge's first segment.
    const t = 6;
    const st = live(trace([peeler], t)).filter((s) => s.tb !== null && Number.isFinite(s.tb) && s.tb > 0.05 && s.z < 0);
    const pts = st.map((s) => ({ d: alongLedge(NORTH_LEDGE, s.x, s.z), tb: s.tb as number })).filter((p) => p.d > 5 && p.d < 110);
    expect(pts.length).toBeGreaterThan(10);
    const n = pts.length, md = pts.reduce((a, p) => a + p.d, 0) / n, mt = pts.reduce((a, p) => a + p.tb, 0) / n;
    const slope = pts.reduce((a, p) => a + (p.d - md) * (p.tb - mt), 0) / pts.reduce((a, p) => a + (p.d - md) ** 2, 0);
    console.log(`peel: ${n} stations, d ${pts[0].d.toFixed(0)}..${pts.at(-1)?.d.toFixed(0)} m, speed ${(-1 / slope).toFixed(1)} m/s`);
    expect(-1 / slope).toBeGreaterThan(8);
    expect(-1 / slope).toBeLessThan(20);
  });

  it('the right closes out: the south ledge’s first 40 m broke within 1.5 s of each other', () => {
    const w = peeler;
    let checked = 0;
    for (const t of [1, 1.5, 2]) {
      const st = live(trace([w], t)).filter((s) => s.tb !== null && Number.isFinite(s.tb));
      const onSouth = st.filter((s) => { const d = alongLedge(SOUTH_LEDGE, s.x, s.z); return d > 0 && d < 40 && s.z > 0; });
      if (onSouth.length < 5) continue;
      const tbs = onSouth.map((s) => s.tb as number);
      console.log(`closeout t ${t}: ${onSouth.length} stations, onset spread ${(Math.max(...tbs) - Math.min(...tbs)).toFixed(2)} s`);
      expect(Math.max(...tbs) - Math.min(...tbs)).toBeLessThan(1.5);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('timeSinceOnset: null before breaking, grows with the crest, Infinity past the hand-back', () => {
    const f0 = sampleField(field, 0, 0);
    // The crest at the peak at t = τ(0,0) = 0, then points shoreward along the ray.
    expect(timeSinceOnset(field, testWave(0.5), 0, 0, ctx, P)).toBeNull();
    const along = (d: number): [number, number] => [f0.dirX * d, f0.dirZ * d];
    const seq = [0, 5, 10, 20].map((d) => timeSinceOnset(field, peeler, ...along(d), ctx, P));
    console.log(`tb along the ray from the peak: ${seq.map((v) => (v === null ? 'null' : v.toFixed(2))).join(', ')}`);
    for (let i = 1; i < seq.length; i++) if (seq[i - 1] !== null && seq[i] !== null && Number.isFinite(seq[i] as number)) expect(seq[i] as number).toBeGreaterThanOrEqual(seq[i - 1] as number);
    expect(timeSinceOnset(field, peeler, ...along(80), ctx, P)).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/breaker/crestTrace.test.ts`. **Expected:** FAIL (`Cannot find module './crestTrace'`).
- [ ] **Step 3: Implement**: `src/breaker/crestTrace.ts`:

```ts
import { type BreakParams, breakingRatio, drainDepth } from './breaking';
import type { FieldSample } from './fieldSample';
import { HAND_BACK_S, landingTime } from './lipProfile';
import { type ReefField, sampleField } from './reefField';
import { type ActiveWave, TAPER_NEAR_M, type WaveContext, localHeight, phaseXi } from './setWaveModel';

/**
 * Crest stations for the breaking ribbon (breaking-ribbon spec §5): each set wave's crest line (ξ = 0) traced across
 * the reef into stations, spaced by distance from the camera, each carrying what its cross-section needs. Pure CPU,
 * per frame; BreakingRibbon uploads the result.
 */

/** Station spacing: SPACING_PER_M × distance to the camera, clamped (spec R1). */
export const SPACING_PER_M = 0.008;
export const MIN_SPACING_M = 0.08;
export const MAX_SPACING_M = 4;
export const MAX_STATIONS = 2048;
/** A side of the trace ends after this much crest (m) below the ribbon's onset ratio. */
export const BELOW_ONSET_RUN_M = 20;
/** The time since onset is computed at key stations at most this far apart (m of crest) and interpolated between. */
export const KEY_SPACING_M = 2;
/** The look-back march for the time since onset steps this far (m) along the ray. */
export const LOOK_BACK_STEP_M = 1;
/** Extra look-back beyond the hand-back (s), and the CPU's culling margin over its landing-time estimate. */
export const LOOK_BACK_MARGIN_S = 0.5;
/** Newton projections onto ξ = 0 per step (the seed takes SEED_ITERATIONS). */
export const PROJECT_ITERATIONS = 2;
export const SEED_ITERATIONS = 8;
/** A seed or step whose |ξ| stays above this (s) after projecting has not found the crest: the side (or wave) ends. */
export const CREST_TOLERANCE_S = 0.01;
/** A step's projection moves at most this far (m); the seed's at most half a wavelength (maxStep 0). */
export const STEP_PROJECT_MAX_M = 5;

export interface Station {
  gap: false;
  /** Index of the wave in the `waves` passed to traceStations. */
  wave: number;
  /** Crest position (undisplaced world xz). */
  x: number;
  z: number;
  /** Arc length along this wave's crest from its seed (m; negative on the second side). */
  arc: number;
  /** Unit normal to the crest line, in the wave's travel direction: the profile's u axis. */
  nx: number;
  nz: number;
  /** Local wave height (m), as the sheet's (setWaveModel.localHeight). */
  H: number;
  /** Crest speed ω/k (m/s). */
  c: number;
  /** Breaking ratio at the crest (uncapped H). */
  r: number;
  /** Time since onset (s): null before breaking, Infinity once past the hand-back. */
  tb: number | null;
}

export type StationEntry = Station | { gap: true };

export interface TraceInput {
  cameraX: number;
  cameraZ: number;
  params: BreakParams;
  /** Waves no taller than this (m) are skipped (they never reach the ribbon's onset ratio); see minRibbonHeight. */
  minHeightM: number;
}

const inGrid = (f: ReefField, x: number, z: number): boolean => {
  const g = f.grid;
  return x >= g.x0 && z >= g.z0 && x <= g.x0 + (g.nx - 1) * g.cellM && z <= g.z0 + (g.nz - 1) * g.cellM;
};

/** The crest-line normal at a field sample: ∇ξ points against (dir + w − mean). Returns it unit, with |∇ξ| (s/m). */
function crestNormal(w: ActiveWave, f: FieldSample, ctx: WaveContext): { nx: number; nz: number; grad: number } {
  const ax = f.dirX + w.travelX - ctx.travelX, az = f.dirZ + w.travelZ - ctx.travelZ;
  const len = Math.hypot(ax, az) || 1;
  return { nx: ax / len, nz: az / len, grad: (f.k / ctx.omega) * len };
}

/** Newton steps onto ξ = 0 along the crest normal, each at most `maxStep` m (the seed: half a wavelength). */
function project(field: ReefField, w: ActiveWave, t: number, ctx: WaveContext, x: number, z: number, iterations: number, maxStep = STEP_PROJECT_MAX_M): { x: number; z: number; xi: number; f: FieldSample } {
  for (let i = 0; i < iterations; i++) {
    const f = sampleField(field, x, z);
    const n = crestNormal(w, f, ctx);
    const cap = maxStep > 0 ? maxStep : Math.PI / f.k;
    const d = Math.max(-cap, Math.min(cap, phaseXi(x, z, t, f, w, ctx) / n.grad));
    x += n.nx * d;
    z += n.nz * d;
  }
  const f = sampleField(field, x, z);
  return { x, z, xi: phaseXi(x, z, t, f, w, ctx), f };
}

/** The landing time the CPU assumes for culling: a fall from the crest to the drained trough, H + the full drain. */
export function landingEstimate(H: number, p: BreakParams): number {
  return landingTime(H + drainDepth(H, 1, p));
}

/**
 * How long ago (s) the crest at (x, z) first broke: march back along the ray (against the field direction) over the
 * look-back window; the onset is the farthest-back point in the window with r ≥ 1, and the time is the distance from
 * there to the crest over the mean crest speed along it. null if nothing in the window has broken; Infinity if even the
 * window's far end had (the section is past its hand-back).
 */
export function timeSinceOnset(field: ReefField, w: ActiveWave, x: number, z: number, ctx: WaveContext, p: BreakParams): number | null {
  const f0 = sampleField(field, x, z);
  const windowS = landingEstimate(localHeight(w, f0), p) * (1 + p.collapseTime) + HAND_BACK_S + LOOK_BACK_MARGIN_S;
  const windowM = (ctx.omega / f0.k) * windowS;
  const rs: number[] = [], cs: number[] = [];
  let px = x, pz = z;
  for (let d = 0; d <= windowM; d += LOOK_BACK_STEP_M) {
    const f = sampleField(field, px, pz);
    rs.push(breakingRatio(w.heightM * f.amp, f.hmin, p));
    cs.push(ctx.omega / f.k);
    px -= f.dirX * LOOK_BACK_STEP_M;
    pz -= f.dirZ * LOOK_BACK_STEP_M;
  }
  let onset = -1;
  for (let i = rs.length - 1; i >= 0; i--) if (rs[i] >= 1) { onset = i; break; }
  if (onset < 0) return null;
  if (onset === rs.length - 1 && rs.length > 1) return Infinity;
  let cSum = 0;
  for (let i = 0; i <= onset; i++) cSum += cs[i];
  return (onset * LOOK_BACK_STEP_M) / (cSum / (onset + 1));
}

/** Whether a station still draws: before breaking, from the ribbon's onset ratio; after, until the (estimated) hand-back. */
function alive(s: Station, p: BreakParams): boolean {
  if (s.tb === null) return s.r >= p.ribbonOnset;
  return s.tb <= landingEstimate(s.H, p) * (1 + p.collapseTime) + HAND_BACK_S + LOOK_BACK_MARGIN_S;
}

/** One wave's crest, both ways from its seed, at `factor` × the spacing rule. Empty if the crest isn't on the reef. */
function traceWave(field: ReefField, w: ActiveWave, wave: number, t: number, ctx: WaveContext, input: TraceInput, factor: number): Station[][] {
  const p = input.params;
  const seed = project(field, w, t, ctx, 0, 0, SEED_ITERATIONS, 0);
  if (!(Math.abs(seed.xi) < CREST_TOLERANCE_S) || !inGrid(field, seed.x, seed.z)) return [];
  const sides: Station[][] = [];
  for (const sign of [1, -1]) {
    const side: Station[] = [];
    let { x, z, f } = seed;
    let arc = 0, below = 0;
    for (let n = 0; n < 20000; n++) {
      const nrm = crestNormal(w, f, ctx);
      if (sign > 0 || n > 0) {
        side.push({ gap: false, wave, x, z, arc, nx: nrm.nx, nz: nrm.nz, H: localHeight(w, f), c: ctx.omega / f.k, r: breakingRatio(w.heightM * f.amp, f.hmin, p), tb: null });
      }
      const ds = factor * Math.min(MAX_SPACING_M, Math.max(MIN_SPACING_M, SPACING_PER_M * Math.hypot(x - input.cameraX, z - input.cameraZ)));
      const next = project(field, w, t, ctx, x - nrm.nz * sign * ds, z + nrm.nx * sign * ds, PROJECT_ITERATIONS);
      if (!(Math.abs(next.xi) < CREST_TOLERANCE_S) || !inGrid(field, next.x, next.z) || Math.hypot(next.x, next.z) > TAPER_NEAR_M) break;
      arc += sign * Math.hypot(next.x - x, next.z - z);
      ({ x, z, f } = next);
      below = breakingRatio(w.heightM * f.amp, f.hmin, p) < p.ribbonOnset ? below + ds : 0;
      if (below > BELOW_ONSET_RUN_M) break;
    }
    sides.push(side);
  }
  return sides;
}

/** Fills each station's time since onset: exact at key stations ≤ KEY_SPACING_M apart, linear between two finite keys,
 * exact again wherever a neighbouring key is null (the onset boundary). */
function fillTimes(field: ReefField, w: ActiveWave, line: Station[], ctx: WaveContext, p: BreakParams): void {
  if (line.length === 0) return;
  const keys: number[] = [0];
  for (let i = 1; i < line.length; i++) if (Math.abs(line[i].arc - line[keys[keys.length - 1]].arc) >= KEY_SPACING_M || i === line.length - 1) keys.push(i);
  for (const k of keys) line[k].tb = timeSinceOnset(field, w, line[k].x, line[k].z, ctx, p);
  for (let q = 0; q + 1 < keys.length; q++) {
    const a = line[keys[q]], b = line[keys[q + 1]];
    for (let i = keys[q] + 1; i < keys[q + 1]; i++) {
      const s = line[i];
      if (a.tb !== null && b.tb !== null && Number.isFinite(a.tb) && Number.isFinite(b.tb)) {
        s.tb = a.tb + ((b.tb - a.tb) * (s.arc - a.arc)) / (b.arc - a.arc);
      } else if (a.tb === Infinity && b.tb === Infinity) {
        s.tb = Infinity;
      } else {
        s.tb = timeSinceOnset(field, w, s.x, s.z, ctx, p);
      }
    }
  }
}

/**
 * Every wave's stations, in drawing order: each wave's crest from one end to the other, runs of live stations
 * separated by a single gap entry (between waves, and where a stretch of crest isn't drawn). At most MAX_STATIONS
 * entries: if a trace would exceed it, the spacing grows by 1.5× and the trace is redone (up to four times, then cut).
 */
export function traceStations(field: ReefField, waves: readonly ActiveWave[], t: number, ctx: WaveContext, input: TraceInput): StationEntry[] {
  let out: StationEntry[] = [];
  for (let attempt = 0, factor = 1; attempt < 5; attempt++, factor *= 1.5) {
    out = [];
    waves.forEach((w, i) => {
      if (!(w.heightM > input.minHeightM)) return;
      const sides = traceWave(field, w, i, t, ctx, input, factor);
      if (sides.length === 0) return;
      const line = [...sides[1].reverse(), ...sides[0]];
      fillTimes(field, w, line, ctx, input.params);
      for (const s of line) {
        if (alive(s, input.params)) out.push(s);
        else if (out.length > 0 && !out[out.length - 1].gap) out.push({ gap: true });
      }
      if (out.length > 0 && !out[out.length - 1].gap) out.push({ gap: true });
    });
    if (out.length <= MAX_STATIONS) break;
  }
  while (out.length > 0 && out[out.length - 1].gap) out.pop();
  return out.slice(0, MAX_STATIONS);
}

/**
 * The height (m) below which a wave never reaches the ribbon's onset ratio anywhere: ribbonOnset × the field's breaking
 * height (setWaveModel.fieldBreakingHeight). Conservative: r grows faster than linearly with height, so a wave of this
 * height has r < ribbonOnset wherever the full-height wave would have r < 1.
 */
export function minRibbonHeight(fieldBreakingHeightM: number, p: BreakParams): number {
  return p.ribbonOnset * fieldBreakingHeightM;
}
```

- [ ] **Step 4: Run** `npx vitest run src/breaker/crestTrace.test.ts` and `npm run typecheck`. **Expected:** 7 PASS; the logs read about `peel: … speed 11.8 m/s`, `closeout … spread 0.4–0.6 s` and `trace (two waves) median ~1.4 ms`.
- [ ] **Step 5: Commit.**
  ```bash
  git add src/breaker/crestTrace.ts src/breaker/crestTrace.test.ts
  git commit -m "feat(breaker): crestTrace, camera-spaced stations along each crest with the time since onset

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 5: The ribbon on the GPU: profile mirror and compute passes

**Files:**
- Create: `src/breaker/lipProfileNodes.ts`, `src/breaker/lipProfileNodes.test.ts`, `src/breaker/BreakingRibbon.ts`, `src/breaker/ribbon.selftest.ts`
- Modify: `src/dev/selfTests.ts` (register `ribbon.selftest.ts` beside `breaker.selftest.ts`)

**Interfaces:**
- Consumes:
  - Task 3 (every export; the GPU mirrors `profileFrame`, `sampleHome`, `sampleSegment`, `profilePoint` and `lipThicknessAt` term by term);
  - Task 4 `StationEntry`, `MAX_STATIONS`;
  - Task 2 `BreakParams`, `WaterSurfaceModel.displacement(xz, lod)` and `fftCascadeDisplacement(xz, c, lod)`.
- Produces (Task 6 relies on these):
  ```ts
  /** A TSL function of undisplaced world xz (vec2) → the sheet's vec3 displacement there (relative to the tide). */
  export type BaseSurfaceNode = (xz: N) => N;
  export interface RibbonSurface {
    /** The sheet without cascade 2 (the profile's construction base) and cascade 2 alone (the chop), both with the
     * render's distance fades at the given camera distance. Production: from WaterSurfaceModel; self-tests: SetWaves
     * only (no FFT), so the GPU can be compared with the CPU model. */
    smooth: BaseSurfaceNode;
    chop: BaseSurfaceNode;
  }
  export class BreakingRibbon {
    constructor(surface: RibbonSurface, params: BreakParams);
    setParams(p: BreakParams): void;
    /** Uploads this frame's stations (≤ MAX_STATIONS; gaps included) and the camera position. */
    setStations(entries: readonly StationEntry[], camera: THREE.Vector3): void;
    /** Runs the frame, vertex and normal compute passes (no-op with no stations). */
    compute(renderer: THREE.WebGPURenderer): void;
    /** Per vertex (MAX_STATIONS × VERTS_PER_STATION): position.xyz + dead flag; normal.xyz + foam; vec4(thickness, lipness, curlFoam, rho). */
    readonly positions: THREE.StorageBufferAttribute;
    readonly normals: THREE.StorageBufferAttribute;
    readonly extras: THREE.StorageBufferAttribute;
    /** How many station rows are live this frame (the draw range covers these). */
    stationCount: number;
  }
  export const SKIRT_DEPTH_M = 0.3;
  /** PROFILE_SAMPLES plus one skirt vertex at each end (index 0: under the front edge; last: under the back edge). */
  export const VERTS_PER_STATION = PROFILE_SAMPLES + 2;
  ```

**What to build:**
- **Stations buffer:** a storage buffer of `MAX_STATIONS` × 3 `vec4`:
  - `[x, z, nx, nz]`
  - `[H, c, r, tb]`, where `tb` is `−1` for null and `1e9` for Infinity (the frame pass maps them back: `tb < 0` means pre-break, `tb ≥ 1e8` means Infinity)
  - `[gap, 0, 0, 0]`

  A gap entry is written as a **copy of the previous live station's data with `gap = 1`** (Q10), so its vertices land on the previous station's and its triangles have zero width. `stationCount` = entries in use.
- **Frame pass** (one invocation per station): the TSL mirror of `profileFrame`.
  - It needs the base at four points: `u = 0`, `uFoot`, `uFoot − 0.1`, and the first landing guess. Each is `base(u) = (dot(d, n) + u, d.y)`, where `d = surface.smooth(S + n·u)` and `S = (x, z)`. The base's u is the displaced point's component along `n`.
  - It writes the frame into a storage buffer: `K, F, tF, W, R` (as `vec2`s) and `uFoot, uFront, uBack, tauLand, vj, prog, reach, eRoot, weight, collapse, landing, rho` (6 `vec4`s per station).
- **Vertex pass** (one invocation per vertex; `VERTS_PER_STATION` per station):
  - `j = local − 1` for the profile samples.
  - `home = sampleHome(j)`, then `d = surface.smooth(S + n·home)`, then `baseHome = (home + dot(d, n), d.y)`.
  - Then `profilePoint(j, frame, baseHome)` gives `(u, y)`.
  - World position = `(S + n·u + t̂·dot(d, t̂)).xz`, `y`, where `t̂ = (−n.z, n.x)`. The lateral displacement at home is carried unchanged.
  - Plus the chop: `surface.chop(S + n·home) × (1 − lipness)`.
  - Skirt vertices copy the adjacent edge vertex, lowered by `SKIRT_DEPTH_M`.
  - Dead flag = the station's gap.
  - `extras` = `(thickness, lipness, curlFoam, rho)`.
  - The sheet's foam at home: Task 6 reads it in the vertex stage (it needs the render-side foam frame), so it isn't stored here.
- **Normal pass** (one invocation per vertex):
  - The central difference of positions along the profile (`j ± 1`, one-sided at the ends) × along the stations (`i ± 1` within the same run; one-sided next to a gap), oriented so the normal points out of the water.
  - The profile runs front edge → back edge with water below/behind, so `normal = normalize(cross(∂P/∂station, ∂P/∂j))`, and the sign is flipped if the result's `y` is negative at the **back** edge sample (a per-run convention check, done once per station from its last sample).
  - A vertex whose `|∂P/∂j| < 1e-6` (the collapsed, unthrown lip) takes the normal of the nearest sample along the profile with a live difference (search ±8).
- **The chop rule (R6)** is exactly: `smooth` = the sheet with cascade 2's lod set to 0; `chop` = cascade 2 alone. So at the edges (lipness 0) the ribbon is `smooth + chop` = the sheet, exactly.
- **Performance:** frame pass 2048 × 4 base evaluations; vertex pass 2048 × 162 evaluations plus the profile maths; normal pass trivial. Build it with vars hoisted as `SetWaves.sumBreaking` does (evaluate each base sample once).

- [ ] **Step 1: Write the failing CPU test**: `lipProfileNodes.test.ts`.
  - The node module's pure helpers must equal `lipProfile.ts`'s: `sampleHomeTable` (a `Float32Array` of the home fractions per sample) and `segmentOfSample` (a `Uint8Array` of `SEGMENT_ID`s), for every `j < PROFILE_SAMPLES`.
  - Export these tables from `lipProfileNodes.ts` and upload them as uniform arrays, so the GPU's segment logic is data, not branches on `j`.
  - Test: `the GPU sample tables reproduce sampleSegment and sampleHome` (build a frame on the CPU, recompute each home from the table and compare with `sampleHome`, within 1e-12).
- [ ] **Step 2: Run** `npx vitest run src/breaker/lipProfileNodes.test.ts`. **Expected:** FAIL.
- [ ] **Step 3: Implement** `lipProfileNodes.ts` (the tables plus TSL functions `profileFrameNode(baseAt, input, uniforms)` and `profilePointNode(j, frame, baseHome, uniforms)`, mirroring `lipProfile.ts` term by term) and `BreakingRibbon.ts` (buffers and the three passes).
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck`. **Expected:** all PASS.
- [ ] **Step 5: GPU self-tests** (`ribbon.selftest.ts`; the controller runs them):
  - `ribbon: GPU profile matches lipProfile`. Stations from `traceStations` at `REF_BIGGEST.arrivalS + {0.3, 0.6, 1.0, 1.6}` (lineup camera). `RibbonSurface` from `SetWaves` only (both nodes; chop = 0). Every vertex's position is compared with the CPU `buildProfile` placed in the world the same way (base from `sumWaves`), within 5 mm (f32 over metres). Frame values within 1e-3.
  - `ribbon: edges are the sheet`. With the production surface (FFT on), the first and last profile vertices of every live station equal `S + n·home + WaterSurfaceModel.displacement(S + n·home, lods)` within 1 mm.
  - `ribbon: gap rows are zero-width and dead`. Two waves traced together: every gap row's vertices equal the previous row's, and are flagged dead.
  - `ribbon: normals face up out of the water on the back slope and down under the lip`. At `+0.6 s`: the back-edge normals have `y > 0.8`; the underside samples' normals have `y < 0` for stations at the peak.
- [ ] **Step 6: Commit.**
  ```bash
  git add src/breaker/lipProfileNodes.ts src/breaker/lipProfileNodes.test.ts src/breaker/BreakingRibbon.ts src/breaker/ribbon.selftest.ts src/dev/selfTests.ts
  git commit -m "feat(breaker): the breaking ribbon on the GPU (profile mirror, frame/vertex/normal compute passes)

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 6: Draw the ribbon and join it to the sheet

**Files:**
- Modify: `src/breaker/BreakingRibbon.ts` (mesh, material, footprint pass), `src/breaker/ribbon.selftest.ts`, `src/ocean/OceanSurface.ts` (footprint discard, broken-water term if Task 1 ruled C), `src/ocean/waterShading.ts`, `src/app/App.ts`, `src/dev/DevPanel.ts` and `DevPanel.test.ts` (`ribbon tint` overlay), and `src/ocean/OceanSurface.ts`'s `DebugOverlays` (`ribbonTint: boolean`)

**Interfaces:**
- Consumes: Task 5's `BreakingRibbon`; Task 4's `traceStations` and `minRibbonHeight`; `shadeWater`, `seabedTerms`, `setFoamPattern`, `WaterOpticsUniforms` (existing).
- Produces:
  - `BreakingRibbon.mesh: THREE.Mesh`
  - `BreakingRibbon.footprint: THREE.Texture` (R8, 0.5 m texels over the field grid)
  - `BreakingRibbon.renderFootprint(renderer)`
  - `OceanSurface` takes the footprint texture: constructor option `footprint?: { texture, origin: Vector2, cellM: number, size: Vector2 }`
  - `DebugOverlays.ribbonTint`

**What to build:**
- **The ribbon mesh:**
  - One fixed index buffer over `MAX_STATIONS × VERTS_PER_STATION`: two triangles per quad between station rows `i` and `i + 1` and samples `j` and `j + 1`, wound so the front faces are the water side.
  - The draw range is `(stationCount − 1) × (VERTS_PER_STATION − 1) × 6`.
  - `positionNode` reads `positions` by vertex index (`storage(...).toAttribute()` or `.element(vertexIndex)`).
  - A `dead` varying: the fragment `Discard()`s where `dead > 1e-4` (Q10).
  - `side: THREE.FrontSide`.
- **The ribbon's shading:**
  - `shadeWater` with the ribbon's normal (interpolated, normalized), plus the FFT detail normal from cascades 0–1 at full weight and cascade 2 × `(1 − lipness)`.
  - Build the detail with `WaterSurfaceModel.fftSlopes` at the vertex's undisplaced home xz (carried as a varying), tilted into the ribbon normal's tangent frame: the along-crest tangent `t̂` and `n × t̂`.
  - `seabedTerms`; `underside = 1 − smoothstep(−0.3, 0.3, normal.y)`.
  - `lip = (1 − smoothstep(0.05, 0.6, thickness)) × lipness`: the turquoise glow follows the real thickness (spec §7.3).
  - `foam = max(fft foam, setFoamPattern(max(sheetFoam, curlFoam), frame, time).x)`, with `sheetFoam` and the foam frame from `SetWaves` at the home xz in the vertex stage (`displacementWithSetFoamNode`'s varyings, or `breakSampleNode(...).foam` plus the frame).
- **Footprint pass:**
  - An orthographic camera looking down over the field grid (`x0..x1`, `z0..z1`) renders a second mesh that shares the ribbon's geometry and position buffer into a 1300×1500 R8 render target.
  - Its fragment writes 1 where `rho ≥ 0.01` and the sample is **inside** the footprint shrunk by 1 m. Pass a per-vertex `inner` flag computed in the vertex pass: 1 for samples whose home lies more than 1 m inside both edges (`uFront − home > 1 && home − uBack > 1`), else 0. The fragment writes `inner > 0.5 ? 1 : 0`.
  - Clear to 0 each frame. Skip the pass, leaving the target cleared, when `stationCount = 0`.
- **Sheet discard:** `OceanSurface`'s fragment samples the footprint at `positionWorld.xz` (the displaced position, matching the ribbon's) and `Discard()`s where it is > 0.5. Outside the field grid it never discards.
- **Skirt:** already built in Task 5; it draws with the ribbon.
- **Broken water:** only if Task 1 ruled C. The sheet and the ribbon scale the seabed transmittance by `1 − 0.8·trail`, where `trail` is the sheet's foam trail weight before noise (add it to `displacementWithSetFoamNode`'s outputs). They add `transmission × 0.3 × trail` as mint bubble-cloud light, and `SAND_ALBEDO` × 0.75.
- **Tint overlay:** with `ribbonTint` on, the ribbon's colour is mixed 40% with magenta.
- **App wiring**, each frame after `setEvents`:
  - `traceStations(field, events.map(toActiveWave), simTime, ctx, { cameraX, cameraZ, params: breakParams, minHeightM })`, where `minHeightM` is recomputed when the field or params change.
  - Then `ribbon.setStations(...)`, `ribbon.compute(renderer)` and `ribbon.renderFootprint(renderer)` before `picture.render()`.
  - With no field, or breaking off, pass an empty trace.
  - Add `ribbon.mesh` to the scene.
- **Performance check:** the controller measures the GPU ms at Task 8. Pre-registered levers: spacing factor 0.008 → 0.012; `PROFILE_SAMPLES` 160 → 120 (segments scaled); footprint at 1 m texels.

- [ ] **Step 1: Write the failing tests:**
  - `DevPanel.test.ts`: the overlay binding `ribbon tint` exists.
  - `devSettings.test.ts`: `overlays.ribbonTint` persists and defaults to false.
- [ ] **Step 2: Run** them. **Expected:** FAIL.
- [ ] **Step 3: Implement** the above.
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck`. **Expected:** all PASS.
- [ ] **Step 5: GPU self-tests** (added to `ribbon.selftest.ts`):
  - `ribbon: the footprint covers the stations' inner strip and nothing else`. Render the footprint for `REF_BIGGEST.arrivalS + 0.6` and read it back. It is 1 at the texels under every live station's `u = 0` point, and 0 at 3 m beyond every front edge.
  - `ribbon: an empty trace draws nothing and keeps the sheet whole`. `setStations([])`, then `stationCount = 0`, and the footprint reads back all 0.
- [ ] **Step 6: Commit.**
  ```bash
  git add src/breaker/BreakingRibbon.ts src/breaker/ribbon.selftest.ts src/ocean src/app/App.ts src/dev
  git commit -m "feat(breaker): draw the breaking ribbon with the water shading; the sheet steps aside under its footprint

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 7: Moments and README

**Files:**
- Modify: `src/dev/referenceMoments.ts`, `src/dev/referenceMoments.test.ts`, `README.md`

**Interfaces:**
- Consumes: `setMoment`, `conditions`, `REF_BIGGEST` (existing in `referenceMoments.ts`).
- Produces: the moments `behind-the-wave` and `lip-close-up`.

- [ ] **Step 1: Write the failing test** (`referenceMoments.test.ts`): `findReferenceMoment('behind-the-wave')` and `findReferenceMoment('lip-close-up')` exist, both are kind `'set'`, and both are paused. `behind-the-wave` has swell 4.65 ft, 15 s, from 225°, wind 22 km/h (6.09 m/s) from 57°, seed 2002, 08:15, tide 0, and camera `{ mode: 'free', position: [12, 3.5, -32], yawDeg: 73.5, pitchDeg: -13 }`.
- [ ] **Step 2: Run.** **Expected:** FAIL.
- [ ] **Step 3: Implement.**
  - `behind-the-wave`: Andrew's saved view. His link's `simTime` was 4163.55. Rebase it onto the reference set: find the wave in `wavesNear(4163.55, <his conditions>)` whose arrival was 7.2 s before (`4156.4`), and express the moment as that set's wave arrival + 7.2 s. If his conditions don't produce the same wave in the reference slot, use `REF_BIGGEST.arrivalS + 7.2` with his conditions, and note that in the description.
    - Description: `"08:15, 4.65 ft, from behind the wave line (Andrew's view): the back of the breaking wave, the sheet in the trough behind it."`
  - `lip-close-up`: 5 ft (as `barrel-peeling`, P8). Free camera about 6 m from the lip at the peak as it throws, at `REF_BIGGEST.arrivalS + 1.0`.
    - Start from `{ mode: 'free', position: [4, 2.0, -8], yawDeg: 200, pitchDeg: 5 }`; the controller adjusts it in Task 8 after looking.
    - Description: `"08:15, 5 ft: about 6 m from the lip at the peak as it throws over the tube."`
  - `README.md`:
    - In the Break folder section, replace the removed sliders with the four new ones, each with one line on what it does.
    - Add the `ribbon tint` overlay.
    - Add both moments to the moments list.
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck`. **Expected:** PASS.
- [ ] **Step 5: Commit.**
  ```bash
  git add src/dev/referenceMoments.ts src/dev/referenceMoments.test.ts README.md
  git commit -m "feat(dev): behind-the-wave and lip-close-up moments; README for the breaking ribbon

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 8: Acceptance: checks, gallery, Andrew's review (STOP)

The controller does all of this.

- [ ] **Step 1:** `npx vitest run` and `npm run typecheck`, all PASS; `?selftest`, all PASS on the RTX (no integrated-graphics banner).
- [ ] **Step 2: Look.** In the pane at full size, check `barrel-peeling`, `behind-the-wave`, `lip-close-up`, `closeout-right` and `the-drain`, each playing through the break. The checks:
  - no holes, folds or jagged steps;
  - a smooth lip edge at 20–100 m and a crisp one at 5 m;
  - a rounded back from behind;
  - no visible seam at the ribbon's edges (turn on `ribbon tint` to find them, then off to check);
  - no flicker where the ribbon and the sheet overlap.

  Fix what's wrong in a fix round (the SDD loop) before capturing.
- [ ] **Step 3: Gallery.** Capture, numbered after the overnight shots:
  - `08-barrel-ribbon.png`
  - `09-behind-the-wave.png`
  - `10-lip-close-up.png`
  - `11-closeout-right.png`
  - `12-ribbon-tint.png`

  Capture method: the real `K` key plus a forced frame, or `window.liquidDreams.captureFrame()`. Write `docs/superpowers/gallery/phase-2/README.md` entries and commit.
- [ ] **Step 4: Measure what the pane can.** If the pane is visible and on the RTX, read the GPU ms on `barrel-peeling` and `lip-close-up` at max fps 0, and ledger them. Otherwise mark them pending for Andrew.
- [ ] **Step 5: STOP.** Send Andrew the gallery shots (SendUserFile) and a plain-English handover: what changed, what to try, known issues, and a request for his GPU ms reading and visual notes. Don't merge. The final whole-branch review and fix wave follow his notes.
