# Ride frame rate: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standing on the board runs at ≥ 50 fps (mean frame ≤ 20 ms) at 6 ft and 12 ft on Andrew's RTX, with no
change to where she stands, measured by `tools/_rideProfile.mjs` before and after each task.

**Architecture:** Three exact or near-exact cuts to the CPU water path the ride reads, in order of exactness: skip the
crest lookup for waves beyond the envelope (Task 1, exact); one ride water per frame shared by the step, the camera, the
underwater check and the tube cover (Task 2, exact); the station's section curve from a sheet table instead of 174 full
wave sums (Task 3, tolerance measured); the tube cover's curve memoised on its inputs (Task 4). Task 5 is the reserve.
Task 6 evidence and handovers.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU/TSL, vitest 5, Electron tools under `tools/`.

**Spec:** `docs/superpowers/specs/2026-10-07-ride-framerate-design.md` (read it first).

**Written by:** Fable (orchestrator), 2026-10-07, for Opus (executor). Branch `ride-framerate` from `main` (ae35174),
already created with the tool and the baseline report. Push at the end; do not merge without Andrew's say-so.

## Global Constraints

- Nothing under `src/seabed`; nothing in `breaking.ts`, `crestTrace.ts`, `wombSection.ts`, `wombProfile.ts`;
  `setWaveModel.ts` only Task 1's early return. `INVERT_ITERATIONS`, `CURVE_SAMPLES`, `SPAN_SAMPLES`, `MAX_STEP_S`,
  `MAX_STEPS` and every ride constant unchanged. No physics change: `ridePhysics.ts`, `ridePose.ts`, `rideLine.ts`,
  `takeoff.ts` untouched.
- Every task ends with the profiler run and its report saved under `docs/superpowers/evidence/ride-framerate/` as
  `<task>-6ft.txt`, and the three frame-rate lines pasted in the commit message.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx tsc --noEmit` clean at every commit. Probes in env-gated vitest files or `tools/_*.mjs`, never `src/_scratch`.
- The full suite times out ~20 tests under load; they pass alone. Baseline the suite on a quiet machine before Task 1
  and re-run only the files that newly fail before calling anything a regression. Record the baseline count.

## Review Focus

1. **Task 1 is exact**: a test compares `waveAt` against `waveAtCrest(…, crestAt(…))` at 200 random (x, z, t) over
   several waves and asserts equality of every field.
2. **Task 3's tolerance is measured, not assumed**: the error table (N × max |Δy|) is in the handover, and N is the
   smallest that meets the target with |Δy| ≤ 2 cm at 6 ft.
3. **The ride tests keep their numbers**: `rideOnSections`, `sectionWater`, `tubeCover`, `takeoff`, `ridePhysics`
   test files pass with no assertion changed. The ride test (R3's) prints the same `heldS` ± 0.1 s per case.

## How to run the profiler

```bash
npx electron tools/_rideProfile.mjs --ft=6 --out=docs/superpowers/evidence/ride-framerate/<task>-6ft-
```

Dev server on 5173 (`npm run dev`). It prints three frame-rate lines (cam, paddling, riding) and the CPU profile
summaries, and writes `<prefix>report.txt` and three `.cpuprofile` files (do not commit the `.cpuprofile` files).
Baseline: cam 4.3 ms, paddling 16.1 ms, riding 372.9 ms (2.7 fps).

---

### Task 1: skip the crest lookup beyond the envelope (exact)

**Files:** `src/breaker/setWaveModel.ts` (`waveAt`), `src/breaker/setWaveModel.test.ts` (or a new
`waveAtEnvelope.test.ts` beside it).

- [ ] Test first: for 3 waves (arrivals 0, 15, 30 s; heights 1.5, 2, 2.5 m) and a real field (the fixture the
      existing `setWaveModel` tests use) and `breakOptions` on, 200 random points in the grid and t in [−20, 60]:
      `waveAt(x, z, t, f, w, ctx, o)` deep-equals `waveAtCrest(x, z, t, f, w, ctx, crestAt(x, z, t, f, w, ctx, o), o)`.
      Green before the change (it is the current definition); it guards the change.
- [ ] In `waveAt`: compute `xi = phaseXi(x, z, t, f, w, ctx)`; if `beyondEnvelope(xi, w)` return `{ ...ZERO }` without
      calling `crestAt`. Nothing else.
- [ ] Add a count in the test: with a spy or a counting `o.sample`, the lookup runs only for waves inside the envelope
      (assert the sample count drops for a point where only one of the three waves is within 16 s).
- [ ] Run the breaker and ride test files; run the profiler; save `task1-6ft.txt`. Expected: riding mean falls by
      roughly 3–4×; cam and paddling no slower.
- [ ] Commit: `perf(waves): waveAt skips the crest lookup for waves beyond the envelope (exact; the GPU already does)`.

### Task 2: one ride water per frame

**Files:** `src/app/App.ts`.

- [ ] In `frame`, before the ride step block (line ~2023): `const rideWater = this.ride.active ?
      this.rideWater(this.clock.simTime) : null; this.frameRideWater = rideWater;` (a private field, nulled at the end
      of `frame`).
- [ ] The ride step and `cameraPose` use it (they already share one). `updateUnderwater` (line ~832) reads
      `this.frameRideWater ?? this.rideWater(this.clock.simTime)` (the lineup camera still needs one when not riding
      and stations exist: keep that path). `tubeCover` is unchanged here (Task 4).
- [ ] `rideOffset.sent` keeps `this.rideWater(t, false, false)` (sheet only, by design).
- [ ] Profiler; save `task2-6ft.txt`. Commit: `perf(ride): one ride water per frame, shared by the step, the camera and
      the underwater check`.

### Task 3: the station curve from a sheet table

**Files:** `src/ride/sectionWater.ts`, `src/ride/sectionWater.test.ts`, a probe (env-gated vitest or `tools/_*.mjs`).

- [ ] Probe first, before any change: for the ride test's 6 ft case, at the frames where she is on a section, for N in
      {24, 32, 48, 64, 96}: build the station curve two ways, today's (`sheet` = full `base`) and from a table of N
      evenly spaced sheet samples over u ∈ [−(EDGE_OUTER_UNITS + 1) A, (EDGE_OUTER_UNITS + 1) A] with linear
      interpolation; evaluate `at(s)` at the board's u for the nearest two stations; record max |Δy| and max |Δslope|
      per N. Print the table. Also time 174 vs N `base` calls.
- [ ] Choose N: the smallest with max |Δy| ≤ 2 cm at 6 ft. If none ≤ 64 meets it, stop and report (spec R3).
- [ ] Test: in `sectionWater.test.ts`, with a synthetic sheet that is a smooth bump, the table-built section at the
      test's points is within 1 mm of the direct build (the test's sheet is smooth enough that the table is nearly
      exact; it guards the plumbing, the probe guards the real error).
- [ ] Implement: `cached(s)` builds `table: Float32Array(N)` of `base(...).y − tideM` along the normal, and `sheet(u)`
      interpolates it; `sectionSamples` and `sectionPoint` are called as before with this `sheet`. Export `SHEET_TABLE_N`
      with its probe row in the comment.
- [ ] Run the ride tests (no assertion changes); the R3 ride test's `heldS` per case ± 0.1 s of before (paste both).
- [ ] Profiler at 6 ft and at 12 ft; save `task3-6ft.txt`, `task3-12ft.txt`. Commit: `perf(ride): the station's section
      from a sheet table of N samples (max |Δy| <x> cm at 6 ft)`.

### Task 4: the tube cover's curve memoised on its inputs

**Files:** `src/ride/tubeCover.ts`, `src/ride/tubeCover.test.ts`.

- [ ] Replace the `WeakMap<Station, P2[]>` with a `Map<string, P2[]>` keyed by `phase` and `hollow` each rounded to
      1/64, capped at 256 entries (clear when full). Test: two stations with the same rounded numbers share a curve;
      the cover values at the test's points are unchanged.
- [ ] Profiler; save `task4-6ft.txt`. Commit: `perf(ride): the tube cover's profile curve keyed by its numbers, not the
      frame's station object`.

### Task 5 (reserve; only if Task 4's riding mean is > 20 ms at 6 ft or 12 ft)

- [ ] Keep each near station's table across frames in `App` keyed by (wave, round(arc / 4 m)); rebuild when A, phase or
      hollow moved by > 1/64 or every 4th frame. Pass it into `withSections` as an optional cache. Same tests; the
      probe's |Δy| re-measured with the reuse (a 4-frame-old table at c ≈ 10 m/s). Commit only if the target is met
      and |Δy| ≤ 2 cm holds.

### Task 6: evidence and handovers

- [ ] The suite on a quiet machine: counts before Task 1 and after Task 4/5; only the named new tests change.
- [ ] One live run of R3's bot (`tools/_takeoffLive.mjs --ft=6`) to show the ride still looks the same: the `caught`,
      `popup` and first `ride` frames beside the R3 `live8` ones.
- [ ] `docs/superpowers/handover/2026-10-07-ride-framerate-opus.md` (detail: every profiler table, the N table, the
      suite counts) and `-fable.md` (short: the three frame-rate lines per task, N and its error, anything red).
- [ ] Push `ride-framerate`. Do not merge.

---

## Addendum 2026-10-07 (Fable): Tasks 7–9 after the first pass missed the target

Spec addendum first (R6–R8). Tasks 3 and 5 are closed. The Task 3 probe harness is re-created **and committed** as an
env-gated vitest file (`PROBE_RIDE_STATIONS=1`), driving `withSections` with the thinned / cached stations against the
direct build, printing max |Δy| and max |Δslope| over the rows she is on a section, 6 ft and 12 ft.

### Task 7: the ride's stations thinned by arc (R6)

**Files:** `src/ride/sectionWater.ts` (a pure `thinStations(entries, spacingM)`), `src/ride/sectionWater.test.ts`,
`src/app/App.ts` (`rideWater` passes `thinStations(this.ribbonStations, RIDE_STATION_SPACING_M)`; compute it once per
frame beside `ribbonStations`, in `updateRibbon`).

- [ ] Test first: a run of 50 live stations 0.1 m apart with a gap then 10 more: thinned at 1 m keeps the gap, keeps the
      first and last of each run, and no two kept stations are < 0.9 m apart by arc; a run shorter than the spacing keeps
      its first station.
- [ ] Probe: thinned vs direct at 6 ft and 12 ft, max |Δy| and |Δslope|, curves built per frame before and after (count
      `cached` misses). Paste the rows. Tolerance ≤ 2 cm at 6 ft; 12 ft reported.
- [ ] Profiler at 6 ft and 12 ft; `task7-6ft-report.txt`, `task7-12ft-report.txt`. Commit with the three lines.

### Task 8: the curve kept across frames (R7)

**Files:** `src/ride/sectionWater.ts` (an optional `CurveCache` argument to `withSections`: `get(key, numbers)` /
`set`), `src/app/App.ts` (one cache per ride session, cleared on `begin`/`end`), tests.

- [ ] Test first: with a counting sheet, a station rebuilt once and then read on 3 later frames with the same numbers and
      moved x, z costs no further sheet reads; a 1/32 change in phase rebuilds; age 5 rebuilds.
- [ ] Probe: ages 1, 2, 4 vs direct at 6 and 12 ft; same tolerance. Choose the largest age that meets it (cap 4).
- [ ] Profiler; `task8-*-report.txt`. Commit.

### Task 9 (reserve, R8): warm-started inversion along the normal

Only if Task 8's riding mean is > 20 ms at 6 ft or 12 ft. `cached(s)` samples u in order and starts each `waterAt`'s
inversion at the previous sample's x0 plus the step along the normal; passes reduced to the fewest with max |Δy| ≤ 2 mm
against the 4-pass build (the probe). `INVERT_ITERATIONS` itself unchanged for every other caller.

### Task 10: evidence and handovers (as Task 6, plus)

- [ ] The 12 ft sheet-along-the-normal sample for the wave-form work (spec addendum's last paragraph), saved as
      `evidence/ride-framerate/sheet-normal-12ft.txt`.
- [ ] Handovers updated in place; push. Do not merge.

## Addendum 2, 2026-10-08 (Fable): Tasks 11–13, the curve read lazily (spec addendum 2, R9)

Same global constraints. Nothing under `src/breaker` changes: `wombSection.ts`, `wombProfile.ts`, `crestTrace.ts` are read,
not edited. Only `src/ride/sectionWater.ts`, its test, the probe and `App.ts` if a signature needs it.

### Task 11: the station curve read lazily (R9, exact)

- [ ] **Test first** (`sectionWater.test.ts`): on the probe's 6 ft frame (or the file's existing station fixture), for ≥ 200
      random (station, u) pairs including u on the fold (several crossings) and u past the curve's ends, the lazy water's
      y and slope **equal** the dense build's (`toBe`, or `toBeCloseTo` to 12 digits if a bit differs; say which). A counting
      sheet asserts reads per curve: 36 for the knots + 2 per interval bracketing u, and a second probe at the same station
      and a different u reads only the new interval's ends. Red first: today reads 196 − weight-0.
- [ ] `cached(s)` returns the samples' u (all 160, from `sectionSamples`, no sheet beyond the knots) with y filled on demand;
      `lowestWetCrossing` takes that lazy curve (keep a `P2[]` path for the probe's `CurveCache` variants, or store filled
      samples in it; your call, say which). The u is `sectionPoint`'s first component / A by the same expression. Weight-0
      samples' y is A × q[4] / A with no read, as today.
- [ ] R8's warm read is unchanged; its nearest prior read is now usually a knot, and the residual guard covers it. Report
      wave sums per frame (the probe's metric) beside `warm 2 passes`.
- [ ] Probe: a `lazy (R9)` variant. Required: max |Δy| **0** at 6 ft and 12 ft; sums per frame reported.
- [ ] `src/ride` tests green, `npx tsc --noEmit` clean. Commit, push, ledger line.

### Task 12: profile and the ride's numbers

- [ ] Profiler at 6 ft and 12 ft with the dev server warm: `evidence/ride-framerate/r9-6ft-report.txt`, `r9-12ft-report.txt`.
      If cam differs from the r8 reports' by more than 15%, an A/B against R8-only in the same session as well.
- [ ] R3's `heldS` with R9 in the loop: 14.33 / 15.02 / 12.45 / 0.78 s expected exactly (R9 is exact); ± 0.1 s is the gate.
- [ ] If riding mean is > 20 ms at either size: **stop**, paste where the frame goes now (inclusive %, curves and reads per
      step), do not start R10. Fable rules on R10.

### Task 13: evidence and handovers

- [ ] Both handover files updated in place (an "R9 pass" section), ledger, memory line for Fable; push. **Do not merge.**
