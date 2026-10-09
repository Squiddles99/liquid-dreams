# One curl per wave, on one clock: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every set wave breaks as one curl per side that advances from the peak and never retreats, and the ribbon,
the CPU sheet and the GPU sheet all read that one clock; plus the boot picture's water present from the first frame.

**Architecture:** The curl is computed once, in the reef bake, as a pass over each breaking line between the two
marches of `computeOnsetRecord` (a running max with a speed floor along the line), and carried along the rays as the
peel stretch's origin already is; every reader of the onset record then agrees without new code. The hold moves into
the record's `until` channel so the stations' `wait` plumbing goes. The ledge's depth profile stops reading the domain
warp so the breaking line stops wandering. Task 0 is the separate boot-cover fix.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU/TSL, vitest (`src/**/*.test.ts`), the field built in a worker
(`App.ts` ~L1576: `fieldClient.request({… peel …})`, follow the `peel` field with grep to the worker and
`computeReefField`), Electron capture tools under `tools/`.

**Spec:** `docs/superpowers/specs/2026-10-08-one-curl-one-clock-design.md` (read it first; §3 is the design, §5 the
gates, §7 Task 0).

**Written by:** Fable (orchestrator), 2026-10-08, for Opus (executor). Branch `one-curl` from `main` (f8857e5).
Push after every task; no merge without Andrew's say-so.

## Global Constraints

- `src/ride` untouched; GPU shaders untouched except comments. Record layout (`ONSET_RECORD_LENGTH`, offsets) unchanged.
- No new blend, smoothing σ, fade or `min()` between the sheet and the profile. `ONSET_SMOOTHING_M` and
  `SECTION_SMOOTHING_M` keep their values (Task 4 measures them; Fable rules after).
- Baseline the full suite on a quiet machine before Task 1 (`npx vitest run --reporter=default 2>&1 | grep -E "✗|×|FAIL" > .superpowers/sdd/2026-10-08-one-curl/fails-baseline.txt`;
  the last segment's baseline is 39 breaker/whitewater names + R3's 6 ft expert); after each task, name new reds by
  file and say whether each is a retired pin (spec §4) or a regression.
- `npx tsc --noEmit` clean at every commit. Probes in `tools/_*.mjs` or env-gated tests, never `src/_scratch`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. After every task: commit,
  one ledger line in `.superpowers/sdd/2026-10-08-one-curl/progress.md`, push.
- Evidence under `docs/superpowers/evidence/one-curl/`; captures under `liquid-dreams-captures/one-curl-2026-10-08/`
  (outside the repo, as before) with the frame list in the handover.

## Review Focus

1. **The curl pass must leave a monotone input alone**: with `curlMaxMs = Infinity` and `T` already non-decreasing in
   `s`, `T′ = T` exactly (Task 2's unit test pins it), so a reef with no pockets draws as it did.
2. **The first break never moves**: `T′(first) = T₀` for every line and level (unit test), and the peak's section's
   onset in the game is within 0.05 s of main's (Task 4's monotone test prints it; compare against main's value).
3. **`until` continuity at the turn**: along a ray through a held node `until` falls to 0 at the turn with no jump
   (Task 1's test reads three cells along the ray).
4. **The hold cap**: `T′ − T ≤ PEEL_MAX_HOLD_S` everywhere (unit test), and Task 3 reports how many onset nodes per
   level hit the cap at 6, 8, 12 ft (if more than 5 % on the first leg, Fable rules before Task 5).
5. **The ride still catches**: Task 5 runs the `src/ride` suite and the R3 live bot; a case whose `heldS` moves by
   more than 0.5 s, or a lost catch, stops the segment for a ruling.

---

### Task 0: the boot picture's water (spec §7; bounded)

**Files:**
- Modify: `src/app/smoothFrames.ts` (`SmoothFramesGate.frame(dtMs, nowMs, blocked = false)`), `src/app/smoothFrames.test.ts`
- Modify: `src/app/loadingScreen.ts` (`frameDrawn(dtMs, blocked)`, the boot dissolve names `inflight()`), `src/app/App.ts` (`reportLoading`)
- Create: `docs/superpowers/evidence/one-curl/t0-boot-water.md`

**Interfaces:**
- Produces: `SmoothFramesGate.frame(dtMs: number, nowMs: number, blocked = false): boolean`; while `blocked` the
  give-up clock is paused: the gate opens by smooth frames, or `SMOOTH.giveUpMs` of *unblocked* time after the start,
  or `BOOT_BUILD_CAP_MS = 15_000` after the start whatever the state. `LoadingScreen.frameDrawn(dtMs: number, blocked = false)`.

- [ ] **Step 1: Diagnose first.** Playwright Chromium on your own dev server (5174 via a temporary `launch.json`
  entry, reverted), fresh storage, `page.addInitScript` installing the GPUDevice creation hooks from
  `tools/_rideProfile.mjs` (labels) and, as soon as `window.liquidDreams` exists, `frameLog.on = true`. Wrap
  `loadingScreen.dissolve` (or read its `[loading]` lines) to timestamp the boot dissolve; take a screenshot every
  500 ms from 1 s before to 6 s after it. Write `t0-boot-water.md`: the frame log rows from the dissolve (dt, pending,
  `building` labels), the creations in the 6 s after, and which screenshot first shows water. Verdict line: "a pending
  build: <label>" / "not a build: <what>". If not a build, commit the evidence and STOP Task 0 for Fable's ruling.
- [ ] **Step 2: Failing test** (`smoothFrames.test.ts`): a gate started at 0 fed 33 ms+ frames with `blocked = true`
  for 6000 ms stays closed; the same gate unblocked opens at 4000 ms of unblocked time; blocked 20 000 ms opens at
  `BOOT_BUILD_CAP_MS`. Run: `npx vitest run src/app/smoothFrames.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `SmoothFramesGate` keeps `blockedMs` (accumulated while `blocked`):

```ts
export const BOOT_BUILD_CAP_MS = 15_000;
frame(dtMs: number, nowMs: number, blocked = false): boolean {
  if (this.isOpen) return true;
  if (blocked) this.blockedMs += Math.max(0, nowMs - (this.lastMs ?? nowMs));
  this.lastMs = nowMs;
  this.run = !blocked && dtMs < SMOOTH.underMs ? this.run + 1 : 0;
  const since = nowMs - this.startMs;
  if (this.run >= SMOOTH.frames || since - this.blockedMs >= SMOOTH.giveUpMs || since >= BOOT_BUILD_CAP_MS) this.isOpen = true;
  return this.isOpen;
}
```

  (`lastMs: number | null = null` initialised in the constructor.) `LoadingScreen.frameDrawn(dtMs, blocked = false)`
  passes `blocked` through **only in the boot phase** (`this.phase === 'boot'`); transitions keep today's behaviour
  (ride-stall 4c). `App.reportLoading`: `l.frameDrawn(dtMs, this.asyncPipelines.pending > 0)` replaces the `Infinity`
  trick for boot; keep feeding `Infinity` for the transition phases (`l.phase !== 'boot'`), since their gate is
  unchanged. In `loadingScreen.dissolve`, when `phase === 'boot'`, `console.info('[loading] dissolve; builds pending:', labels)`
  with the labels passed in from App (`l.setPendingLabels(() => this.asyncPipelines.inflight())` once at construction).
- [ ] **Step 4: Tests pass**, `tsc` clean. Then the live gate: three fresh boots as in step 1; the first screenshot after
  the dissolve shows water in all three; `[loading]` log's dissolve time ≤ today's + 2 s. Append to `t0-boot-water.md`.
- [ ] **Step 5: Commit.** `fix(boot): the boot cover waits for pending pipeline builds (cap 15 s) instead of dissolving on the 4 s give-up without the water (Task 0)`.

---

### Task 1: `until` carries the hold; the stations drop `wait`

**Files:**
- Modify: `src/breaker/reefField.ts` (`fillUntil`), `src/breaker/reefField.test.ts`
- Modify: `src/breaker/crestTrace.ts` (`Station`, `stationOnset`, `fillTimes`, `traceStations`; delete `holdDownTheLine`), `src/breaker/crestTrace.test.ts`
- Modify: `src/breaker/wombSection.ts` (`SectionInput.wait` gone, `standing` gone, `sectionPhase`), `src/breaker/wombSection.test.ts` if it uses `wait`
- Modify: `src/whitewater/sprayEmitters.ts` only if it reads `wait` (grep says no)

**Interfaces:**
- Produces: `Station` without `wait`; `SectionInput` without `wait`; `sectionPhase` reads `wallWeight(s.until)` only.
  The record's `until` at a held node = `max(0, −tb)`.

- [ ] **Step 1: Failing test** (`reefField.test.ts`, with the suite's 6 ft field fixture and `peel = 1.7` so holds
  exist): find an onset node on the north ledge's first leg whose level-k `tb` (slot `1 + 2k`) is negative; assert
  `until` (slot `ONSET_UNTIL_OFFSET + k`) equals `−tb` within 1e-4; then one and two cells back along its ray
  (`x − dirX·cellM`, …) `until` exceeds the node's by the arrival-time difference (`tau` difference) within 0.02 s.
  Run → FAIL (today `until` is 0 there).
- [ ] **Step 2: Implement** in `fillUntil`: `if (out[base] >= ONSET_LEVEL_Q[k]) { out[base + U + k] = Math.max(0, -out[base + 1 + 2 * k]); continue; }`.
  Run → PASS.
- [ ] **Step 3: Failing test** (`crestTrace.test.ts`): replace the two retired describes ("a held section reads as
  unbroken…", "a held section's station carries the held ratio…") with one: with `peel = 1.7`, a station whose
  record `tb < 0` has `tb === null`, `until > 0` equal to the record's `−tb` (± the bilinear's 0.05 s), its `r ≤ 1`
  (`peelRatio` kept), and `section.phase` equals `STOOD_PHASE · wallWeight(until)` within 1e-3; and an unbroken,
  unheld station 2–6 s ahead of the curl (`until` finite, `tb` null) has the same `STOOD_PHASE · wallWeight(until)`,
  whatever its ratio. Run → FAIL (`wait` still set, `until` 0; the ratio term stands the second one up).
- [ ] **Step 4: Implement**: delete `Station.wait` and its initialiser in `traceWave`, the `wait` line in
  `stationOnset`, `holdDownTheLine` and its call, `SectionInput.wait`, `standing`; `sectionPhase`'s unbroken branch
  becomes: on the record (`until` finite) **the clock alone**, `STOOD_PHASE * wallWeight(s.until)`; off the record
  (`until` null or Infinity) the ratio as before, `STOOD_PHASE * smoothstep(p.ribbonOnset, 1, s.r)`. (The old
  `max(ratio, clock)` let a section whose ratio reached 1 ahead of the curl stand at full height: with one clock,
  that is exactly the pocket the curl holds. The GPU sheet keeps its own standing rule; the drawn section is
  sheet(home) + offset, so this branch is read by the ribbon, the ride and the spray only. Task 5's `t + 3` captures
  show the wall ahead of the curl for Fable's check.) `fillSections` passes no `wait`. Run the three test files → PASS; `npx vitest run src/breaker src/whitewater src/ride` → list new reds by name
  (expected: none beyond the baseline and the two retired describes).
- [ ] **Step 5: Commit.** `feat(one-curl): the record's until carries the hold; stations read one channel (wait, holdDownTheLine, standing gone) (Task 1)`.

---

### Task 2: the curl pass in the bake, and its dial

**Files:**
- Create: `src/breaker/curlClock.ts`, `src/breaker/curlClock.test.ts`
- Modify: `src/breaker/reefField.ts` (`computeOnsetRecord`: the pass between the marches; the second march carries `T′`), `src/breaker/reefField.test.ts`
- Modify: `src/breaker/breaking.ts` (`BreakParams.curlMaxMs`, default 20, `normalizeBreakParams` clamp [4, 40]), the dev panel's break params (where `peel` is listed), `src/app/App.ts` (`fieldKey` and the worker request carry `curlMaxMs`), the worker request type (follow `peel`)

**Interfaces:**
- Produces: `curlTimes(T: Float32Array, lineOf: Int32Array, nx: number, nz: number, cellM: number, curlMaxMs: number, maxHoldS: number): Float32Array`
  — `T` is one level's stretched onset time per node (NaN off the onset nodes), `lineOf[i]` the node's line id (−1
  off the onset nodes); returns `T′` per node (NaN where `T` is). `peelLines` gains a second output: `lineOf` per level
  (`Int32Array(n · ONSET_LEVELS)`, the union-find root after the merge), returned as `{ first: Float32Array; lineOf: Int32Array }`.
- `BreakParams.curlMaxMs: number` (m/s); `computeReefField`'s request carries `curlMaxMs?: number` (absent: 20).

- [ ] **Step 1: Failing unit tests** (`curlClock.test.ts`, a 1 × 40 grid, cellM 2, one line = all 40 nodes, first
  break at node 10):
  - monotone input, `curlMaxMs = Infinity`: `T′` equals `T` exactly;
  - a pocket: `T` rises 0.2 s per node away from node 10 except nodes 25–27 which are 1.5 s earlier than node 24:
    `T′` is non-decreasing in distance from node 10 on each side and `T′[25] === T′[24]` (the pocket waits);
  - the speed floor: `T` constant (a closeout), `curlMaxMs = 10`: `T′[i] = T₀ + |i − 10| · 2 / 10`;
  - the cap: a pocket 10 s early with `maxHoldS = 6`: `T′ − T ≤ 6` everywhere;
  - the first break keeps `T₀`; a node off the line (`lineOf = −1`) stays NaN.
  Run → FAIL (module missing).
- [ ] **Step 2: Implement `curlClock.ts`**: per line id, find the first-break node (smallest `T`); BFS over nodes with
  the same `lineOf` within `PEEL_NEIGHBOUR_CELLS` (import it), accumulating `s` = BFS distance in metres (Euclidean per
  step); process nodes by increasing `s` (a binary heap or sort of the BFS output), and for each
  `T′(i) = max(T(i), min over processed neighbours j of (T′(j) + dist(i, j) / curlMaxMs))`, then
  `T′(i) = min(T′(i), T(i) + maxHoldS)`. Run → PASS.
- [ ] **Step 3: Wire the bake.** In `computeOnsetRecord`: the second march runs whenever `stretch > 0 ||
  Number.isFinite(curlMaxMs)` (so always in the game); after `peelLines`, per level build `Ts` (the stretched
  times) and `curl = curlTimes(Ts, lineOf_k, …)`; store it per node in a `curlT: Float32Array(n · ONSET_LEVELS)`.
  In the second march, replace `delayOf(T, T0)` by `delayFrom(T, Tc)` = `clamp(Tc − T, 0, PEEL_MAX_HOLD_S)` where `Tc`
  is `curlT` at an onset node and, back along a ray, `curlBack(k)` (the same bilinear-over-carrying-corners as
  `lineStartBack`, over `curlT` carried in `t0`'s place: rename `t0` → `tc` and carry `curlT`). Keep a
  `PEEL_MAX_HOLD_S` cap. `BreakParams.curlMaxMs` default 20, clamp [4, 40], on the dev panel beside `peel`; `fieldKey`
  includes it; the worker request carries it; `computeReefField` passes `req.curlMaxMs ?? 20` into
  `computeOnsetRecord`.
- [ ] **Step 4: Failing field test** (`reefField.test.ts`, 6 ft field, default params): for level k of the 6 ft wave
  (`onsetLevel`'s k for `setWaveHeight(6)`), along the north ledge's first 120 m, the onset nodes' effective onset
  time (`tau − tb_physical + delay`, i.e. `tau − (tbS)` where `tbS` is slot `1 + 2k`) is non-decreasing with distance
  from the peak's onset node along the ledge within 0.05 s; and the regression guard: `computeOnsetRecord` takes a
  test-only `curl?: boolean` (default true); with `peel = 1`, the record built with `curl: false` (one march, as main)
  equals the one built with `curl: true, curlMaxMs: Infinity` within 1e-6 at every node whose physical `T` was already
  non-decreasing along the ledge from the peak (and the two differ only at nodes beyond a dip). Run → FAIL, then PASS
  after step 3. Record build time before and after (`console.time` in the test): the second march always running
  costs what it costs; write it in the ledger.
- [ ] **Step 5: Commit.** `feat(one-curl): one curl per breaking line in the bake (running max with a speed floor, curlMaxMs dial, hold capped), carried along the rays (Task 2)`.

---

### Task 3: the ledge line stops wandering

**Files:**
- Modify: `src/seabed/bathymetry.ts` (`buildBathymetry`: the depth profile's `sd` at the unwarped point), `src/seabed/bathymetry.test.ts`
- Create: `docs/superpowers/evidence/one-curl/t3-reef.txt`

- [ ] **Step 1: Failing test** (`bathymetry.test.ts`): along the line 3 m seaward of `NORTH_LEDGE`'s first segment
  (100 samples over 100 m from the peak), the bed depth's max − min < 0.3 m. Run → FAIL (the warp wanders it).
- [ ] **Step 2: Implement**: in the cell loop, `const sdDepth = lattice(sdf, x, z)` for the branch choice and the depth
  (`seawardDepth(-sdDepth …)`, `dShelf`'s `smoothstep(0, 20, sdDepth)`), while `rock`, `pocketOut`, `patchOut`,
  `heads`, `pocket`, `sShelf`, `wShelf` keep `sd = lattice(sdf, xw, zw)` and `(xw, zw)`. Keep "is 6 m deep at the
  take-off corner" and "holds ledge depth along both ledges" green. Run → PASS.
- [ ] **Step 3: Measure the reef's clock**: a one-off env-gated test or `tools/_curlReport.mjs` printing, at 6, 8 and
  12 ft mid tide, `reefReport.leftStretches` (peel m/s, hollow, onset height on the first and second stretch) and the
  share of first-leg onset nodes whose hold hit `PEEL_MAX_HOLD_S` (from the record: `delay ≥ 6 − 1e-3`), with
  `curlMaxMs` 20 and 12. Save as `t3-reef.txt`. If the capped share exceeds 5 % at any size, say so in the ledger and
  stop for a ruling before Task 5.
- [ ] **Step 4: Commit.** `feat(one-curl): the ledge's depth profile reads the unwarped point: the breaking line follows the drawn ledges (Task 3)`.

---

### Task 4: the in-game guards, and the smoothing measured

**Files:**
- Modify: `src/breaker/crestTrace.test.ts` (new describe "one curl per wave on one clock"; the step-1 A bar 8 % → 5 %)
- Create: `src/breaker/curlProfile.probe.test.ts` (env-gated `PROBE_CURL=1`), `docs/superpowers/evidence/one-curl/t4-smoothing.txt`

- [ ] **Step 1: Failing test** (`crestTrace.test.ts`): for 6, 8 and 12 ft (the biggest set wave, `spacingM: 1`), at
  `peakBreak + 1, + 3, + 6` s: on each side from the station with the largest `tb`, `tb` is non-increasing station to
  station (each ≤ previous + 0.05 s), and beyond the last broken station `until` is non-decreasing (each ≥ previous
  − 0.05 s). Print the peak section's onset time for the Review Focus 2 comparison. Run → expect PASS after Tasks 1–3
  (if it fails, the failure is the finding: name the stations and stop).
- [ ] **Step 2: Tighten the A bar** in "A along the first leg holds within 8 %" to `1.05`. Run → PASS (if not, report
  the range; do not loosen it).
- [ ] **Step 3: The smoothing probe** (measurement only): with `PROBE_CURL=1`, at 6 ft, `peakBreak + 3`, print the
  stations' `section.phase` and `tb` against `arc` over the 40 m around the curl, for `SECTION_SMOOTHING_M` 4 and 2
  and `ONSET_SMOOTHING_M` 8 and 4 (the constants are `export const`: the probe copies `fillSections` with a σ argument
  rather than editing the modules; for the record's σ, build the field twice with `smoothOnsetTimes(field, σ)`). Save
  the four tables as `t4-smoothing.txt` with one line each on the curl's width (the arc over which phase goes
  0.45 → 1). Fable rules on the values after the segment.
- [ ] **Step 4: Commit.** `test(one-curl): onset monotone along every traced line at 6/8/12 ft; A within 5 %; the smoothing's cost measured (Task 4)`.

---

### Task 5: the ride check, captures, handovers

**Files:**
- Create: `docs/superpowers/evidence/one-curl/t5-ride.txt`, `t5-captures.md`
- Create: `docs/superpowers/handover/2026-10-08-one-curl-opus.md`, `docs/superpowers/handover/2026-10-08-one-curl-fable.md`

- [ ] **Step 1: The ride.** `npx vitest run src/ride --reporter=default` (the `heldS` lines per case, against main's:
  R3's handover lists them; ±0.5 s), `PROBE_RIDE_STATIONS=1 PROBE_VARIANTS='lazy' npx vitest run src/ride/rideStations.probe.test.ts --reporter=default`
  (`lazy (R9)` 0.00 cm), and one focused `tools/_rideProfile.mjs --ft=6 --sim-t=300` run (she catches and rides; the
  riding line). Save as `t5-ride.txt`. A lost catch or a `heldS` moved > 0.5 s: stop for a ruling.
- [ ] **Step 2: Captures** with `tools/captureMoments.mjs` (header of the file for the flags; `--pre` sets
  `liquidDreams.setDuneSets(true)` as the wave-form memory says): the standard moment (conditions `sizeFt` 6, 8, 12,
  period 15, 225°, tide 0; the capture camera from `evidence/ride-framerate`'s profiler lineup or the R2 captures'
  camera) at `t + 3` and `t + 5` after the peak's break, and Andrew's lineup moment link from memory
  `wave-form-redesign` (~1393.3 s). Twelve frames plus the lineup pair; `t5-captures.md` lists each with one line of
  what it shows (one curl / wall ahead / any pocket or second section). Fable reads them before Andrew.
- [ ] **Step 3: Handovers.** `…-opus.md`: commits; suite baseline vs after (new reds by file, retired pins named);
  the reef table (`t3-reef.txt`); the monotone test's output; the ride lines; the smoothing tables; gotchas.
  `…-fable.md`: what changed and why (one clock in the record, the carried `T′`, `until` as the hold, the unwarped
  ledge); the numbers to rule on (cap share, smoothing σ, `curlMaxMs`); what is left (spec §6); Task 0's verdict.
- [ ] **Step 4: Commit and push.** `docs(one-curl): evidence, captures and handovers (Task 5)`.

---

## Fable's closing ruling (2026-10-09), on Opus's Tasks 0–5 (branch head 8812780)

Verified by Fable on the branch: `tsc` clean; `curlClock`, `smoothFrames`, `reefField` tests (the four reef-field reds: three
are baseline names, one new: the 0.2 % running-max dip); the Task 4 monotone guard green under my own run; merge-tree onto
main clean; the five down-the-line frames at 6 / 8 / 12 ft read as the spec's gate asks (one curl per side, the wall ahead
standing over the lead, no pocket, no second section).

1. **Accepted; recommend merge to main.** Andrew decides.
2. **`curlMaxMs` 40 (effectively unbound): accepted.** Opus's finding stands as a design fact: on this reef every level's
   line starts at the south ledge's far end, so a speed floor from the line's first break binds at the peak before it
   filters anything. A floor that means something needs its origin at the peak (a second origin per line); not now. The
   curl pass's real work, holding pockets so no second section opens, is in; on this reef it binds only far south.
3. **The formula and the lines**: Opus's corrections accepted (`max(T, max_U T′, min_U (T′ + d/v))` over upwind
   neighbours; connected components within 10 cells instead of the peel sections). The unit tests pin them.
4. **The 6 ft expert's rescue (heldS 0.78 → 14.37 s)**: wanted. It is the straightened first leg (the unwarped ledge), the
   reef the spec drew; the peel there is 11.4 m/s (main 10.1), over R1's 9–11 bar by 0.4. If it rides too fast for Andrew
   on the board, the bake's `peel` dial is the lever, not the warp.
5. **The eight unwarped-ledge reds**: not merge blockers (main carried 39 breaker reds; the suite is 54 → 40 red). Carried as
   one small follow-up, "re-pin after the unwarp": re-measure each bar on the straight ledge and either re-pin or fix; look
   first at breakingField's 0.48 m step 1 cm apart at (2, −5.5) at arrival, the only one that could be a real seam.
   The A-within-5 % bar stays red as a target (it was red at 8 % on main).
6. **Spec §3b's GPU claim was wrong** (`onsetUntil` reads 0 for any broken section): the GPU still stands a held section at
   r = 1 from the physical break. Holds exist only on the right's far south on this reef, so no player-visible cost today.
   Carried, low.
7. **Smoothing σ**: the curl is 13 m wide at σ 8 / 4 and 7 m at 8 / 2. A capture A/B of `SECTION_SMOOTHING_M` 4 → 2 is the
   next look (the 4 was for the ribbon self-test's sliced back edges: check those first). Not in this segment.
8. **Task 0**: the sea-less select screen is fixed (water in the first frame after the dissolve, three boots); the boot cover
   is ~3 s longer here because `MeshBasicNodeMaterial (output)` lands ~7 s after the crew. Follow-up: name that object and
   prewarm it with the rest (`App.prewarm`), which also closes ride-stall 4c's find.
9. Andrew's lineup link is not in the repo; the lineup pair is not his view. He can paste the link for a capture any time.

Next segment per the agreed order: lineup truth (swell wrap + bathymetry, four real breaks), then blocky patches, then R4.
