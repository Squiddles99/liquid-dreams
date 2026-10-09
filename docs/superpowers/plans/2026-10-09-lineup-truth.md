# Lineup truth: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the lineup and the lookout, a south-west swell arrives as unbroken lines over the real shelf and breaks
only at Lefthanders, The Womb, Ellensbrook Bombie and Ellensbrook, each in character; the Womb itself unchanged.

**Architecture:** A coarse coast depth map (4 m cells, 1.75 × 3.5 km) baked from Seamap data plus four named features,
with the Womb's reef map nested inside it. The worker solves the eikonal on the coast map first and seeds the reef
field from it; the GPU sheet and the CPU sampler read the coast field outside the reef grid. The far breaks break by
ratio alone on the sheet's existing lifecycle. No change to the reef map, the onset record, the ribbon or the ride.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU/TSL, vitest, the field worker (`src/breaker/fieldWorker.ts`,
`ReefFieldClient.ts`). No new dependency: the coast map is built in the worker from traced contour tables and code.

**Spec:** `docs/superpowers/specs/2026-10-09-lineup-truth-design.md` (read it first; §3 design, §4 gates).

**Written by:** Fable (orchestrator), 2026-10-09, for Opus (executor). Branch `lineup-truth` from `main` (3095079).
Push after every task; no merge without Andrew's say-so. Nothing waits on data (spec §3a revised 2026-10-09: traced).

## Global Constraints

- `src/seabed/bathymetry.ts`, `src/seabed/wombReef.ts`, `src/breaker/crestTrace.ts`, the onset record and `src/ride`
  untouched. The reef field's inputs change only at its boundary seeding.
- Baseline the full suite first (`.superpowers/sdd/2026-10-09-lineup-truth/fails-baseline-names.txt`, as the last two
  segments did); after each task name new reds by file and say which are regressions.
- `npx tsc --noEmit` clean at every commit; commit + ledger + push after every task; commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Evidence under `docs/superpowers/evidence/lineup-truth/`; captures under
  `liquid-dreams-captures/lineup-truth-2026-10-09/` (outside the repo).
- Profiles: focused Electron runs only, same-session A/B (`tools/_rideProfile.mjs`), port 5174 via a temporary
  `launch.json` entry if 5173 is taken.

## Review Focus

1. **The Womb does not move**: spec §4.3 pins the reef field under a flat coast; Task 5 pins the ride (`heldS` ±0.3 s,
   probe 0.00 cm) and the down-the-line captures under the real coast.
2. **Outside the coast grid is still the 1-D far field**: a sample at x = −1 600 equals `farSample` exactly (Task 3
   test), so the horizon's lines do not change.
3. **The coast field's τ is continuous across the reef grid's edge**: Task 2's test reads τ one cell either side of
   the reef boundary at 20 points along it (≤ 0.02 s step).
4. **A set wave that breaks at the Bombie does not also close out the beach behind it**: §4.4's containment test at
   10 ft includes the beach band and nothing between.
5. **The GPU and CPU samplers agree outside the reef grid**: Task 3's self-test reads the sheet's height at 12 points
   around Lefthanders and the Bombie from both (≤ 2 cm), as `SetWaves`' existing self-tests do inside.

---

### Task 0: the traced contours (no download)

**Files:**
- Create: `src/seabed/coastContours.ts` (the traced outer contours as polylines with depths, local metres), `src/seabed/coastContours.test.ts`
- Create: `docs/superpowers/evidence/lineup-truth/t0-tracing.md` (how each contour was read: image, pixel scale, the points)

**Interfaces:**
- Produces: `COAST_CONTOURS: readonly { depthM: number; points: readonly [number, number][] }[]` for depths 10, 15,
  20, 25, 30, 40 m (at least), each polyline running the map's full z range (−2 100 … +1 400), in game metres
  (+x east, +z south, origin the Womb's peak); `contourDepthAt(x, z): number | null` = the depth interpolated between
  the two nearest contours along x (null inshore of the 10 m line or beyond the outermost).
- Consumes: `reference/place/new-sattelite-and-bathymetry-references/7.png` (right panel) and
  `8-contours-gracetown-to-ellensbrook.webp` (Andrew, 2026-10-09: 1:31 691, a 500 m scale bar, the Womb at about
  lat −33.895, lon 114.983, Gracetown's town block at the top for registration).

- [ ] **Step 1: Failing test**: every contour has ≥ 12 points spanning the full z range; depth increases offshore at
  z = 0, −1 666 and +1 080 (`contourDepthAt` monotone along x at those rows); the 10 m contour at z = 0 lies
  350–550 m offshore (x in [−550, −350]) and the 20 m at 650–900 m, per image 7.
- [ ] **Step 2: Trace.** Register image 8's pixel frame to metres with its scale bar and two landmarks (Gracetown's
  town block, the Ellensbrook river mouth); read each contour's x at 12–16 z values; write the tables with a comment
  per contour naming the image and the pixel rows read. Where image 7's zoom disagrees with image 8 near the Womb,
  image 7 wins (finer). Record the method in `t0-tracing.md`. Test green.
- [ ] **Step 3: Commit.** `feat(lineup-truth): the outer shelf's contours traced from the bathymetry screenshots (Task 0)`.

---

### Task 1: the coast map with the four breaks

**Files:**
- Create: `src/seabed/coastMap.ts`, `src/seabed/coastMap.test.ts`, `src/seabed/coastFeatures.ts` (the four features'
  geometry and `DEFAULT_COAST_PARAMS`)
- Modify: `src/seabed/coastProfile.ts` (export `COAST_GRID`; `depthBg` documented as "outside the coast map")

**Interfaces:**
- Produces: `buildCoastMap(reef: Bathymetry, p: CoastParams): Bathymetry` on `COAST_GRID` (contours from `coastContours.ts`)
  (`Bathymetry` = `{ grid, bed: Float32Array }` as the reef's, bed = height, negative below datum, so depth = tide − bed);
  `COAST_GRID = { x0: -1500, z0: -2100, cellM: 4, nx: 438, nz: 875 }`;
  `interface CoastParams { lefthandersLedgeM: number; bombieTopM: number; bombieRadiusM: number; ellensbrookBarM: number; ellensbrookBarOffM: number }`,
  `DEFAULT_COAST_PARAMS = { lefthandersLedgeM: 5, bombieTopM: 5, bombieRadiusM: 60, ellensbrookBarM: 2, ellensbrookBarOffM: 80 }`;
  `COAST_FEATURES`: `LEFTHANDERS_LEDGE: Pt[]` (a polyline along the shelf edge from (−220, −1 560) to (−120, −1 760),
  refined in step 3 from the habitat raster's reef edge), `BOMBIE_CENTRE: [−280, 1020]`, `ELLENSBROOK_BAR: { z0: 930, z1: 1230 }`,
  `BREAK_FOOTPRINTS` (four polygons for §4.4's test).

- [ ] **Step 1: Failing tests** (`coastMap.test.ts`):
  deterministic (two builds equal); inside `REEF_GRID`'s footprint the coast bed equals `downsample(buildBathymetry(), 8)`
  within 1 cm at every cell; the Bombie's top depth at its centre equals `bombieTopM` ± 0.1 and ≥ 11 m 150 m away;
  Lefthanders' ledge depth along its polyline equals `lefthandersLedgeM` ± 0.3; Ellensbrook's bar ≤ `ellensbrookBarM`
  + 0.2 along its line; 20 points on the traced contours within 0.5 m of their depth; the join band (the 100 m inside the 10 m contour)
  monotone; away from
  the features, depth never decreases moving offshore along any row (monotone within 0.2 m noise).
- [ ] **Step 2: Implement.** Outer: `contourDepthAt`; inner: the hand profile (spec §3a.2: reef 2–8 m where the
  satellite reads reef, sand gutters 4–7 m, the shore slope as `depthBg` near the sand), joined over 100 m inside the
  10 m line; the reef map blended in over its footprint with a 40 m smoothstep rim; each feature as an
  analytic shape added to the bed (`min` of depths for shoals: a ledge profile `reefProfileDepth`-like across
  Lefthanders' polyline using `ledgeSignedDistance` with that polyline; the Bombie a smooth mound
  `top + (bg − top) · smoothstep(0, radius, r)`; the bar a ridge along the beach line); the waterline from the data
  (cells of depth ≤ 0 are land → `SHORE_FLAT_DEPTH_M` as today).
- [ ] **Step 3: Place the features from the satellite.** From images 1–3, set `LEFTHANDERS_LEDGE` along the dark
  reef's seaward edge at z ≈ −1 666 and the Bombie at the spec position (no survey there); note the pixel reads in
  `t0-tracing.md`. Tests green.
- [ ] **Step 4: Commit.** `feat(lineup-truth): the coast map: Seamap bed with the Womb's reef nested and Lefthanders, the Bombie and Ellensbrook as features (Task 1)`.

---

### Task 2: the coast field, and the reef field seeded from it

**Files:**
- Create: `src/breaker/coastField.ts`, `src/breaker/coastField.test.ts`
- Modify: `src/breaker/reefField.ts` (factor `solveEikonal` + the flux march into `src/breaker/waveField.ts`'s
  `solveWaveField(bed, omega, tideM, seed: (x, z) => FieldSample, opts)`; `computeReefField` seeds from `coastAt`),
  `src/breaker/fieldWorker.ts` / `ReefFieldClient.ts` (the request carries the coast bed; the reply carries the coast
  field), `src/app/App.ts` (loads `womb-coast.bin` at boot, builds the coast map, passes it with the request)

**Interfaces:**
- Produces: `interface CoastField { grid: GridSpec; tau: Float32Array; dirX; dirZ; k; amp; hmin; depth: Float32Array; omega: number }`;
  `computeCoastField(req: { bed: Bathymetry; periodS; fromDeg; tideM; refractFloorM? }): CoastField` (seeded by
  `farSample` on its inflow edges, τ offset so τ(0, 0) = 0 as `far.tauOffset` does);
  `coastSample(c: CoastField, far: FarField, x, z): FieldSample` (bilinear inside the coast grid, `farSample` outside);
  `ReefField.coast: CoastField` (carried in the reply); `ReefFieldRequest.coast?: Bathymetry`.

- [ ] **Step 1: Failing tests** (`coastField.test.ts`): (a) a flat coast bed (`depthBg(x)` on `COAST_GRID`) gives τ
  within 1 % and direction within 1° of `farSample` at 200 random points; (b) with the same flat bed,
  `computeReefField({ …, coast })` equals `computeReefField({ … })` (no coast) within 0.02 s τ and 1 % amp at every
  node and the onset record within 1e-3 (spec §4.3); (c) continuity: on the real coast map, τ read from the coast
  field one cell outside the reef grid and from the reef field one cell inside differ by ≤ 0.02 s at 20 points along
  the boundary; (d) `coastSample` at x = −1 600 equals `farSample` exactly.
- [ ] **Step 2: Factor `solveWaveField`** out of `computeReefField` (no behaviour change: the reef tests stay as they
  were, run `src/breaker/reefField.test.ts` before and after and compare the names). Commit this refactor on its own:
  `refactor(lineup-truth): the eikonal + flux march as solveWaveField, shared by the reef and the coast (Task 2a)`.
- [ ] **Step 3: Implement `computeCoastField`** with `solveWaveField` on the coast grid (seed: `farSample`), then
  `coastAt` in `computeReefField` when `req.coast` is given. Worker + client carry it (the coast bed is ~1.5 MB: send
  it once and cache in the worker, keyed by the coast params, not per request). `App` builds the coast map once
  at boot (in the worker, from the tables) and the worker caches it by coast params. Tests green.
- [ ] **Step 4: Cost.** `console.info('[field] coast eikonal <ms>, reef <ms>')` in the worker; three boots, the numbers
  in the ledger and `evidence/lineup-truth/t2-cost.txt` (gate ≤ +4 s on Andrew's machine; on yours, report).
- [ ] **Step 5: Commit.** `feat(lineup-truth): the coast field (eikonal over the coast map) seeds the reef field (Task 2)`.

---

### Task 3: the sheet reads the coast field

**Files:**
- Modify: `src/breaker/SetWaves.ts` (coast textures; the sampler's third tier), `src/breaker/setWaveModel.ts` and
  `src/breaker/fieldSample.ts` (`sampleField` outside the reef grid → `coastSample`), `src/breaker/SetWaves.selftest`
  (whatever the existing GPU-vs-CPU self-test file is called: extend it)
- Create: `docs/superpowers/evidence/lineup-truth/t3-selftest.txt`

**Interfaces:**
- Produces: `SetWaves.setField(f)` uploads `f.coast` into `coastA` (τ, amp, hmin, k) and `coastB` (dirX, dirZ, depth,
  breakingDepth(hmin)) RGBA32F textures of `COAST_GRID`'s size; the TSL sampler: inside reef grid → reef textures;
  else inside coast grid → coast textures (bilinear); else → `farA/farB`.

- [ ] **Step 1: Failing self-test**: the existing GPU/CPU field self-test (run as the ribbon's and SetWaves' are,
  `tools/_selftest.mjs --filter=…`) gets 12 points around Lefthanders (z −1 666 ± 100) and the Bombie: GPU sheet height
  vs CPU `sumWaves` ≤ 2 cm. Run → FAIL (the GPU reads the 1-D far field there).
- [ ] **Step 2: Implement** the textures and the sampler tier (hoisted loads as the reef's: the coast's loads run only
  outside the reef grid), and the CPU `sampleField` fallthrough to `coastSample`. Self-test green; the existing reef
  self-tests unchanged.
- [ ] **Step 3: Frame time.** Same-session `_rideProfile --ft=6 --sim-t=300` on main's code and the branch: cam median
  within ±10 %. Report lines in `t3-selftest.txt`.
- [ ] **Step 4: Commit.** `feat(lineup-truth): the sheet draws the coast field outside the reef grid (GPU + CPU) (Task 3)`.

---

### Task 4: no closeout — the breaking map and the dials

**Files:**
- Create: `src/breaker/coastBreaking.test.ts`, `tools/_coastBreaks.ts` (prints the ratio-1 locus per size as an ASCII
  map and the four footprints' share), `docs/superpowers/evidence/lineup-truth/t4-breaking.txt`
- Modify: `src/dev/DevPanel.ts` (a "Coast" group with `CoastParams`), `src/seabed/coastFeatures.ts` (`BREAK_FOOTPRINTS`)

- [ ] **Step 1: Failing test** (spec §4.4): for a set wave of `setWaveHeight(6)` on the real coast field (mid tide, 15 s,
  225°), every coast cell with `breakingRatio(H · amp, hminBreak) ≥ 1` lies inside one of the four footprints or
  within 60 m of the waterline; at 4 ft the Bombie's footprint has none; at 10 ft it has, spanning ≥ 80 m of crest
  (the ratio-1 cells' extent along the crest direction).
- [ ] **Step 2: Tune.** Run `tools/_coastBreaks.ts` at 4, 6, 8, 10, 12 ft; adjust `DEFAULT_COAST_PARAMS` (the Bombie's
  top, Lefthanders' ledge, the bar) and, if the data's shelf breaks a 6 ft set short of the features, the shelf's
  slope is the data's: say so and stop for a ruling rather than deepen it. Save the five maps as `t4-breaking.txt`.
  Test green.
- [ ] **Step 3: The dev panel group.** `CoastParams` sliders rebuild the coast map in the worker (debounced like the
  reef's). Commit: `feat(lineup-truth): the breaking map test (no closeout), the Bombie breaks from 8 ft, Coast dials (Task 4)`.

---

### Task 5: the ride check, captures, handovers

**Files:**
- Create: `docs/superpowers/evidence/lineup-truth/t5-ride.txt`, `t5-captures.md`
- Create: `docs/superpowers/handover/2026-10-09-lineup-truth-opus.md`, `…-fable.md`

- [ ] **Step 1: The ride.** `npx vitest run src/ride --reporter=default` (`heldS` per case vs main ±0.3 s),
  `PROBE_RIDE_STATIONS=1 PROBE_VARIANTS='lazy' npx vitest run src/ride/rideStations.probe.test.ts --reporter=default`
  (0.00 cm), one focused `_rideProfile --ft=6 --sim-t=300` (she catches; riding median). `reefReport.leftStretches` at
  6 / 8 / 12 ft: the first-leg peel against one-curl's 11.4 / 11.3 / 11.7 (the shelf may bend the arrival; report).
- [ ] **Step 2: Captures** (`tools/captureMoments.mjs`, `--pre` sets `liquidDreams.setDuneSets(true)`): from the
  lineup (`DEFAULT_LINEUP_POSITION`, yaw north then south, pitch −2) at 6 and 10 ft at a set's third wave; the lookout
  shot (`frontend/beatCamera.lookoutShot`'s pose) at 6 ft; the one-curl down-the-line frames at 6 ft for "unchanged".
  `t5-captures.md` lists each with one line (what breaks, what does not, the lines between).
- [ ] **Step 3: Handovers**, as the previous segments': commits; suite baseline vs after; the tracing note; the cost
  lines; the breaking maps; the ride lines; the captures list; gotchas; what is left (spec §5 + anything found).
- [ ] **Step 4: Commit and push.** `docs(lineup-truth): evidence, captures and handovers (Task 5)`.
