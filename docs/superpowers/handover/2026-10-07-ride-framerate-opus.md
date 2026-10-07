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
