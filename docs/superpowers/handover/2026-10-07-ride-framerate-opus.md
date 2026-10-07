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
