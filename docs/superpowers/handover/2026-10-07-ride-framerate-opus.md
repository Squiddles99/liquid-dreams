# Ride frame rate: Opus's handover (2026-10-07)

Branch `ride-framerate`, commits b0da4f3..HEAD, pushed, **not merged**. Spec `specs/2026-10-07-ride-framerate-design.md`,
plan `plans/2026-10-07-ride-framerate.md`.

**Outcome: the target is not met.** Riding is 187 ms at 6 ft and 172 ms at 12 ft (target ≤ 20 ms). Task 3 (the sheet table)
hit the spec's R3 stop rule and is not shipped. Task 5 builds on Task 3's tables, so it was not done either. Tasks 1, 2 and 4
are in, exact or camera-only, with the ride's numbers unchanged.

| commit | task |
|---|---|
| 585d3b5 | Task 1: `waveAt` skips the crest lookup beyond the envelope (exact) |
| 3f9f215 | Task 2: one ride water per frame (step, camera, underwater check) |
| e70156b | Task 4: tube cover curve keyed on (phase, hollow) to 1/64; the Task 3 probe table |

## Profiler (`tools/_rideProfile.mjs`, Electron, dev server, intermediate; reports in `evidence/ride-framerate/`)

| run | cam ms | paddling ms | riding ms (fps) |
|---|---|---|---|
| baseline 6 ft (Fable) | 4.3 | 16.1 | 372.9 (2.7) |
| task1 6 ft | 5.6 | 16.0 | 254.5 (3.9) |
| task2 6 ft | 5.6 | 17.0 | 250.9 (4.0) |
| task4 6 ft | 4.3 | 14.7 | 187.0 (5.3) |
| task4 12 ft | 4.4 | 3 frames, not measured | 172.4 (5.8) |

The cam 5.6 ms on the task1 and task2 runs was noise: those changes only take CPU work away, and the task4 run is back at
4.3. The plan expected Task 1 alone to cut riding by 3–4×. It cut it by 1.5×.

## Task 3: the N table (`evidence/ride-framerate/task3-probe.txt`)

Probe (env-gated vitest, not committed; kept in the session scratchpad): R3's rider on a 35° line, driven on today's
sections. On every frame where she stands on a section, the section under the board is read again from a sheet table of
N samples over ±(EDGE_OUTER_UNITS + 1) A. Outside the table the sheet is read directly. 975 rows at 6 ft, 1098 at 12 ft.

| N | 6 ft max \|Δy\| cm | 6 ft max \|Δslope\| | 12 ft max \|Δy\| cm | base calls / row | ms / row |
|---|---|---|---|---|---|
| direct | 0 | 0 | 0 | 393 | 11.0 |
| 24 linear | 10.05 | 0.298 | 73.83 | 51 | 1.7 |
| 32 linear | 7.08 | 0.352 | 51.40 | 67 | 2.0 |
| 48 linear | 7.02 | 0.414 | 18.69 | 99 | 2.8 |
| 64 linear | **2.19** | 0.317 | 14.49 | 131 | 3.6 |
| 96 linear | 0.73 | 0.107 | 12.32 | 195 | 5.2 |
| 32 cubic | 2.31 | 0.184 | 48.56 | 67 | 2.0 |
| 48 cubic | 1.03 | 0.111 | 16.33 | 99 | 2.8 |
| 64 cubic | 0.49 | 0.115 | 12.17 | 131 | 3.6 |
| 96 cubic | 0.12 | 0.065 | 9.76 | 195 | 5.2 |

- With linear interpolation (the spec's method), 2 cm at 6 ft needs N = 96, and the spec says to stop past 64.
- Cubic (Catmull–Rom) is here for information only, since the spec fixes linear. It meets 2 cm at 6 ft from N = 48.
- At 12 ft no table comes near 2 cm. The sheet along a station's normal has a feature sharper than an even table can
  follow at 12 ft. That looks like the same thing as the "step crease" Andrew named in his five pause points.

## Where the riding frame goes now (task4 6 ft, inclusive)

- 78% `withSections` → `cached`: building station curves, and 73% `sumWaves` underneath them.
- 62% `stepRide`, of which 41% is `boardSurface`. 18% `cameraPose`.
- The probe measured ~5.5 ms per station curve. A ~187 ms frame therefore builds about **30+ station curves**. The
  board's several surface probes and the camera's probes each reach different stations within MAX_ALONG_M, and
  `traceStations` makes new Station objects every frame, so nothing carries over to the next frame.
- The cheapest curve still costs 174 sheet reads. Fewer stations built per frame (cross-frame reuse, R5) multiplies with
  fewer reads per station (a table).

## Tests

- Suite on a quiet machine: before Task 1, 39 failed | 1846 passed | 18 skipped (1903), 13 files. After Task 4,
  39 failed | 1849 passed | 18 skipped (1906). The failing set is identical (diffed). The +3 are the new tests.
- Task 1's equality test (`src/breaker/waveAtEnvelope.test.ts`) passed before the change and passes after. The
  sample-count test was red before the change (6 field samples, 2 expected) and is green after.
- Task 4's test (`tubeCover.test.ts`, the last case) was red before (`coverCurve` missing) and is green after. The cover's
  existing assertions are unchanged.
- R3's ride test (`r3-staying-on`'s `rideOnSections.test.ts` + `rideLine.ts`, copied in for the run, then restored) gives
  the same numbers as R3's handover: 6 int held 14.33 s, 12 int 15.02, 6 beg 12.45, 6 expert 0.78 (R3's committed red).
- `npx tsc --noEmit` is clean at every commit.

## Rulings

- Task 1: the plan's 3–4× estimate was not met (1.5×). The change is exact, so the shortfall is in the estimate, not the code.
- Task 2: the shared water is keyed on its sim time. A reset (`catchSetWave`) jumps the clock between the step and the
  underwater check, and the check then builds its own water as before. It is nulled right after `updateUnderwater`.
  `tubeCover` was left to Task 4: it reads stations, not a WaterFn.
- Task 3: the probe drives `withSections` through a `tableN` parameter (0 = direct), so it measured the code that would
  ship. The probe stopped under R3 and `sectionWater.ts` is unchanged on the branch.
- Task 3 → 4: I went on to Task 4 after the stop, because it does not depend on Task 3.
- Task 6: I skipped the live `_takeoffLive` visual run. Physics inputs are unchanged (exact Tasks 1–2, `heldS` identical to
  two decimals), and Task 4 touches only the camera's cover.

## Deferred minors (final review: no Critical or Important findings)

- No test pins the tube cover's rounding error against the unrounded `profileCurve` (phase off by ≤ 1/128, cosmetic,
  camera only).
- The evidence files are named `<task>-6ft-report.txt`, not `<task>-6ft.txt`.

---

## Addendum pass (Tasks 7–10), 2026-10-07

Tolerance unchanged: max |Δy| ≤ 2 cm at 6 ft under the board, against today's build; 12 ft reported. The probe is
committed: `src/ride/rideStations.probe.test.ts` (`PROBE_RIDE_STATIONS=1`, `--silent=false`; `PROBE_VARIANTS` regex,
`PROBE_REF` regex for the reference, `PROBE_SHEET_NORMAL=<file>`).

| commit | what |
|---|---|
| bf481e5 | Tasks 7–8 measured: `thinStations`, `CurveCache` (tested; probe only, not in App) |
| 6a968ea | exact: a curve sample at sheet weight 0 reads no sheet (43.6 of 196 reads per curve) |
| a04368d, 86add84, ee8f649 | R8 plumbing: `waterAt(start?, passes)` + `residual`; `withSections(…, { stats, kept, along })` |
| f171f9c | R8 in App: the stations' sheets read warm, `RIDE_WARM_PASSES` 2; an unconverged warm read is redone cold |
| 5dafc27 | Task 10: `evidence/ride-framerate/sheet-normal-12ft.txt` |

### Task 7 (R6, thinned by arc): fails at every spacing

| spacing | 6 ft max \|Δy\| | p95 | rows > 2 cm | 12 ft max | curves / physics step |
|---|---|---|---|---|---|
| direct | 0 | 0 | 0 | 0 | 7.0 (6.7 at 12 ft) |
| 1 m | 105.62 cm | 1.36 | 21 / 975 | 64.86 | 3.0 |
| 0.5 m | 127.60 | 0.43 | 10 | 45.40 | 4.1 |
| 0.25 m | 27.66 | 0.08 | 6 | 20.95 | 5.8 |

The rows over 2 cm sit where the board is on the clamped-steep wall (slope 2.0) or a fold. There, a few centimetres
along the crest is a metre of height at a fixed point.

### Task 8 (R7, curves kept across frames): fails at every age

6 ft max |Δy|: every station in 0.08 m buckets, age 1 / 2 / 4: 91.9 / 215.3 / 224.9 cm (curves per step
4.5 / 3.9 / 3.4). R7 as written (thinned 1 m), age 1 / 2 / 4: 230.4 / 195.1 / 228.9 cm. Even a curve one frame old has
p95 4.1 cm: the sheet under a station is not steady between frames at the take-off and on the wall.

### The ~30 curves a frame

At 60 fps one physics step builds ~7 curves. A slow frame runs up to `MAX_STEPS` 4 substeps over more crest, so the ~30
seen in the profiler partly feed on themselves.

### R8 (warm inversion): in, 2 passes, guarded

Wave sums per frame, and max |Δy| against today's 4-pass build / a converged 12-pass build:

| variant | 6 ft sums | 6 ft vs today | 6 ft vs converged | 12 ft sums | 12 ft vs today | 12 ft vs converged |
|---|---|---|---|---|---|---|
| today (cold 4) | 5187 | 0 | 0.03 cm | 5272 | 0 | **8.24 cm** |
| warm 1, guarded | 4189 | 0.05 | 0.05 | 5543 | 1.24 | 9.03 |
| **warm 2, guarded** | **3469** | **0.04** | 0.04 | **4482** | 1.30 | 9.01 |
| warm 3, guarded | 4310 | 0.01 | 0.03 | 4771 | 3.45 | 9.00 |
| warm 2, unguarded | | 0.12 | 0.13 | | 17.21 | 24.86 |

Today's 4-pass inversion is itself 8 cm off converged on the 12 ft wall. Unguarded, a warm start from a neighbour can
start on the wrong side of the steep face, so a warm read whose residual is over 1 mm (`WARM_RESIDUAL_M`) is redone
cold.

Profiler, A/B in one session (the machine ran ~25% slower than this morning: cam 5.5 ms against 4.4):

| riding | R8 off | R8 on |
|---|---|---|
| 6 ft mean / median | 216.1 / 175.6 ms | 181.9 / 126.6 ms |
| 12 ft mean / median | 219.8 / 170.6 ms | 210.0 / 178.5 ms |

Earlier in the day, on the faster machine state, the weight-0 skip alone took 6 ft riding from 187.0 to 156.8 ms.

R3's ride test with R8's warm read in the loop: held 14.33 / 15.02 / 12.45 / 0.78 s, the same as R3 (the expert case is
R3's committed red). `src/ride` tests are green; `npx tsc --noEmit` is clean.

### Task 10: the 12 ft sheet along a normal

At the first 12 ft frame on the clamped wall (t 396.124 s), the leaned front falls from 5.5 m to −1.7 m over ~4 m of u.
It is steepest at dy/du −2.42 (67°) at u/A 0.94, and smooth: no kink at this frame. The thing no table could follow at
12 ft is this steep front, not a crease.

### Where it stands

The target is still missed: riding ~120–210 ms against 20 ms. Every lever in the spec (R1–R8) is now spent or measured
out. The bound is structural. Each physics step builds ~7 station curves, each ~200 sheet reads of 3–5 wave sums. On
the steep face no cheaper approximation of the curve holds 2 cm at a fixed point, because height at a fixed point is
ill-conditioned there.

The options are Fable's to rule on, none started:
- (a) Read the board's water from the GPU's own section curves. The ribbon's compute passes build the same curves every
  frame; read them back asynchronously, one frame late.
- (b) Measure the tolerance as distance to the surface (normal distance), not |Δy| at a fixed point. Under that
  measure, thinning and reuse may pass.
- (c) Build fewer curves per step: the nose, middle and tail read the same two stations.

---

## R9 pass (Tasks 11–13), 2026-10-08

**Still red, but about 4× closer.** Riding is 45.5 ms at 6 ft (median 39.8) and 79.4 ms at 12 ft (median 82.7). R8 was
181.9 and 210.0 ms. Cam is 4.4 ms on both runs, the same machine state as the R8 reports. Per Task 12 I stopped there.
R10 is not started.

| commit | what |
|---|---|
| ae717f2 | R9: the station curve read lazily (`sectionWater.ts`), its tests, the probe's `lazy` rows |
| 286ab28 | `evidence/ride-framerate/r9-probe.txt` |
| dcbba51 | `r9-*-report.txt` profiles |

### What changed

`withSections` builds a station's curve from its knots (36 sheet reads) and every sample's u. A sample's y is read only
when a crossing at the probe's u needs it, once per station per frame. The u is `sectionPoint`'s first component, with the
sheet's u being its own argument (A × home). The dense build stays behind `{ dense: true }`; the probe uses it as its
reference, and `CurveCache` builds dense. Only `src/ride/sectionWater.ts`, its test and the probe changed. `App.ts` and
`src/breaker` are untouched.

### Tests

- `sectionWater.test.ts`, the read count: red 197 vs 39 before the change, green after. It expects the 36 knot reads plus
  the w ≠ 0 ends of the intervals holding u; a second point on the same station reads only the ends not read yet.
- Equality: 240 seeded random points over 13 stations with differing sections on a curved crest. A third of the points
  are between the tube's floor and the tip, and over 40 of them have several crossings; some are past the curve's ends.
  Lazy vs dense is compared with `toEqual`, so every field matches by `Object.is`. It passed before the change too: it
  guards equality, it does not drive the change.
- The old weight-0 read-count test now runs on `{ dense: true }`.
- `src/ride`: 92 passed, 3 skipped. `npx tsc --noEmit` is clean.
- Full suite: 64 failed under load. Re-running the 23 failing files alone (`--no-file-parallelism`) gives 39 failed |
  397 passed, the baseline's count. All 39 are in `src/breaker` and `src/whitewater`, which R9 doesn't touch.

### Probe (`r9-probe.txt`; R3's rider; reference = the dense cold build)

| variant | 6 ft max \|Δy\| | 6 ft wave sums / frame | 12 ft max \|Δy\| | 12 ft sums / frame |
|---|---|---|---|---|
| direct (dense, cold: before R9) | 0 | 5187 | 0 | 5272 |
| **lazy (R9)** | **0.00 cm** | **1297** | **0.00 cm** | **1251** |
| lazy + warm 2 passes (the game) | 0.04 cm | 1120 | 1.30 cm | 1330 |
| warm 2 passes (R8, dense) | 0.04 cm | 3469 | 1.30 cm | 4482 |

Curves per physics step are unchanged (7.0 / 6.7). Lazy plus warm reads the same water as R8 did, to the probe's two
decimals.

### Profiles (dev server warm, cam 4.4 ms on every clean run)

| run | cam | paddling | riding mean / median |
|---|---|---|---|
| r9-6ft-c | 4.4 | 22.9 | **45.5 / 39.8 ms** (117 frames) |
| r9-6ft | 4.5 | 112.4 | 55.6 / 51.5 (97 frames) |
| r9-12ft | 4.4 | 1614.7 (3 frames) | **79.4 / 82.7 ms** (67 frames) |
| r9-6ft-b | 4.4 | 26.5 | 458.4 / 449.3 (14 frames) |
| R8 only (dense in App), 6 ft | 36.1 (loaded) | 184.4 | 829.6 (9 frames) |
| R8 only, 12 ft | 4.4 | 1703.7 | 1007.0 (8 frames) |

- **Run-to-run spread is large.** r9-6ft-b has the same function mix per sampled ms as r9-6ft-c, but about 8× the work
  per frame. The profiler applies the conditions at whatever sim time the page loads at, so each run rides a different
  moment of a different wave. Read the 6 ft number as 40–55 ms, with outlier moments. The A/B's R8-only rows are on
  moments as slow as -b's, so they don't pair with the R9 rows run for run.
- **Machine:** Epic Games Launcher and its overlay loaded the GPU (59%, 88 °C) and CPU at times, giving cam 30–36 ms. I
  left them alone and re-ran on quiet stretches.
- **Port:** after I closed the browser pane at ~11:15, another session's dev server took 5173. It serves `../ld-select-ui`
  (`select-screen-ui`). Three early runs measured that branch, and I deleted them. Every report kept was run on my own
  server on 5174, after checking it served the lazy code.

### Where the riding frame goes now (r9-6ft-c / r9-12ft, inclusive)

| | 6 ft | 12 ft |
|---|---|---|
| `lazyOf` (the ride's curves built) | 48.2% | 55.6% |
| `sectionFrameKnots`, all callers (the ride's 36 knot reads + the spray/camera's `sectionFrame`) | 48.6% | 60.3% |
| the curl knots inside it (`wombSection.ts:219`: the swell home + the knot's own home) | 32.7% | 36.6% |
| `curveSamples` (160 Hermite samples, no sheet) | 10.3% | < 6% (not in the top 40) |
| `stepRide` (physics) | 35.3% | 48.6% |
| `cameraPose` | 14.4% | 11.2% |
| spray (`breakEmitters`, not the ride) | 12.3% | 15.3% |
| `traceStations` | 12.4% | 8.1% |

The knots are now the frame. A curve costs 36 reads plus ~4 for its samples. There are ~7 curves per physics step and up
to 4 steps in a slow frame, plus the camera's curves. Inside the knots, the 22 curl-knot reads (11 at the swell homes,
11 at the knots' own homes) cost about twice the 14 sheet-end reads.

### R3's numbers

R3's ride test (`r3-staying-on`'s `rideOnSections.test.ts` + `rideLine.ts`, copied in, then removed) gives held
14.33 / 15.02 / 12.45 / 0.78 s on the lazy cold read and the same with lazy plus warm 2 passes (the game's read).
That's identical to R3; the expert case is R3's committed red.

### Rulings (R9 pass)

- The weight-0 read-count test (added on this branch) runs on `{ dense: true }`. The new R9 count covers the default.
  Cost if wrong: none.
- The dense build is kept behind `SectionOptions.dense`, used by the probe's reference, the thinned/converged/R8-only rows,
  and `CurveCache`. Cost if wrong: an option only the probe uses.
- Max |Δy| 0 is required of lazy with cold reads. Lazy plus R8's warm read reads samples in a different order, so warm
  starts differ. It is measured against direct like R8 was, and comes out at R8's numbers. Cost if wrong: R8's accepted
  ~1.3 cm at 12 ft.
- Profiled on my own server on 5174 (a temporary `launch.json` entry, reverted). Cost if wrong: none.
- The R8-only A/B was run although the cam trigger came from machine load, not from code. Cost if wrong: one noisy row.
- The final reviewer ran on Opus, not Fable, because Fable reviews this evidence next. Cost if wrong: a subtler finding
  waits for Fable.
- The final review had no Critical findings and confirmed bit-identity. Its one Important finding is a plan question:
  R8 on top of R9 costs more at 12 ft and is inexact. App keeps R8 as wired, for Fable to rule on. Cost if wrong: ~6% more
  sums at 12 ft and 1.3 cm until then.

### Deferred minors (R9 final review)

- NaN as the unread sentinel re-reads a sample whose sheet y is NaN. That only happens on water that is already broken.
- `stats.reads` is not used by the tests or the probe.
- The equality test's fold counter uses a flat-sheet curve of the chosen station, not the curve under test. The 240
  equalities still hold.
- The read-count test never asserts that some u brackets 2 or more intervals.


## Task 14, 2026-10-08

**Done, still red.** The game now reads the probe's `lazy (R9)` row exactly. `App.rideWater` calls
`withSections(sheet, this.ribbonStations, tide)` with no `along`. `RIDE_WARM_PASSES` is the probe's only, and its doc says so.
The profiler takes `--sim-t=<s>` (a CLI flag, not an env var). Riding at sim-t 300, window focused:

| run | cam ms | riding mean / median |
|---|---|---|
| r10-6ft | 7.1 | 78.3 / 70.8 ms (69 frames) |
| r10-6ft-b | 4.4 | 67.3 / 57.0 ms (80 frames) |
| r10-12ft | 4.5 | **91.9 / 93.2 ms** (59 frames) |
| r10-12ft-b | 6.3 | **98.7 / 98.3 ms** (55 frames) |

Other clean 6 ft runs at sim-t 300 (a scratch copy of the profiler, or before the focus fix) gave 57.3 / 48.5, 46.0 / 43.1,
68.2 / 62.9 and 48.5 / 46.2. **12 ft pairs within 7%. 6 ft does not pair tightly (46–78 ms).** The set, the wave and the
arrival are the same every run (set called from 306.00 s, arrives 397.94 s). The bot's pop-up (0.4 s after catch) and its
A key are timed in real time, though, so her line drifts with the frame rate. These are not R9's moments, so the rows
don't compare to R9's 45.5 / 79.4 run for run. The probe gives R8's removal: wave sums per frame go up 16% at 6 ft (1120 to
1297) and down 6% at 12 ft (1330 to 1251).

| commit | what |
|---|---|
| 5eb7502 | R8 out of `App.rideWater`; probe row `lazy + warm 2 passes (R8, not the game)` |
| a19741a | `_rideProfile.mjs --sim-t` |
| 1f5d9da | `r10-probe.txt` |
| 448234a | the profiler stays on top and focused, and line 1 says whether it was |
| 4a4872e | `r10-6ft`, `-6ft-b`, `-12ft`, `-12ft-b` reports |

**Checks.** `src/ride`: 91 passed, 1 failed (the expert `heldS` 0.78 s, R3's committed red), 3 skipped. `npx tsc --noEmit`
is clean. The probe's `lazy (R9)` row is 0.00 cm at both sizes (1297 / 1251 sums per frame), unchanged. `heldS` on the cold
lazy read (`rideOnSections.test.ts`, on main now) is 14.33 / 15.02 / 12.45 / 0.78 s, identical to R3.

**Found on the way: an unfocused profiler window runs about 8× slower.** Runs with cam at ~35 ms instead of 4.4 ride at
400–520 ms. In a scratch copy that times `ride.step` in the page, the same sim time, place and ~570 stations cost 199 ms
per step in a slow run and ~30 ms in a clean one. So the whole process is slower; the ride does no extra work. The slow
runs had `document.hasFocus()` false and the clean runs true: Windows throttles the unfocused process. Two runs ran at
1 fps (~1000 ms frames, likely the display asleep); a keep-awake hold stopped that. **R9's "8× more work per frame at a
different moment" (r9-6ft-b, 458 ms) was very likely this, not the moment.** The profiler now sets
`setAlwaysOnTop` + `app.focus({ steal: true })` + `win.focus()` before the cam pass, and line 1 records the focus at the
cam pass and at the end. Reports from unfocused or loaded runs stay git-ignored in `cpuprofiles` (`*-unfocused`,
`*-slow`, `*-loaded*`).

### Where the riding frame goes (inclusive, the four r10 runs)

| | 6 ft | 12 ft |
|---|---|---|
| `sectionFrameKnots`, all callers | 52–54% | 56–57% |
| `lazyOf` (the ride's curves) | 50% | 49–51% |
| the curl knots (`wombSection.ts:219`) | 33–34% | 37% |
| `sumWaves` | 49–51% | 53–55% |
| `stepRide` | 38–40% | 43–44% |
| spray `breakEmitters` | 14–15% | 19% |
| `cameraPose` | 13–14% | 10–11% |
| `traceStations` | 10–11% | 9% |
| `curveSamples` | 8–10% | < top 40 |

The mix is R9's. The curl knots are still a third of the frame, which is R10a's target.

### Rulings (Task 14)

- `--sim-t` is a CLI flag. The clock goes back to it after the field build (which takes as long as it takes), and to
  it + 6 s before the set is called. That makes the set call, wave and arrival the same every run. Cost if wrong: the cam
  pass starts at sim-t, not at the moment the conditions were applied (cam only).
- sim-t 300, picked arbitrarily and used for every size and run. Cost if wrong: one moment of the sea. Tasks 15–16 use
  the same one.
- The profiler steals focus and stays on top while it runs (~1.5 min per run). Cost if wrong: it covers Andrew's screen
  during a run.
- The bot's real-time pop-up and steering timing are not changed: that's a tool change beyond "a fixed sim time". Cost if
  wrong: 6 ft runs keep a ~±15% spread, so compare 6 ft over 2+ runs.
- `RIDE_WARM_PASSES`'s doc comment now says probe-only (`sectionWater.ts`, the brief's scope). Cost if wrong: none.
- Profiled on my own server on 5174 (a temporary `launch.json` entry `ld-5174`, reverted, never committed). 5173 served
  another tree: its `sectionWater.ts` lacks Task 14's doc line. Cost if wrong: none.
- Unfocused or loaded reports are excluded from `evidence`. Cost if wrong: none (kept git-ignored).

### Deferred minors

- The four R9 minors stand (NaN sentinel, unused `stats.reads`, the flat-sheet fold counter, the single-interval u).
- The bot's real-time input timing (above).
- Every profiled paddling pass has one 4–6 s frame (max 3.9–6.2 s). It's outside the riding window and may be the first
  ride build or a pipeline compile. Not investigated.
- Another session's `python tools/riderArt.py` held a core during the early runs, and Epic Games Launcher was resident
  (GPU 0–57% between runs).
