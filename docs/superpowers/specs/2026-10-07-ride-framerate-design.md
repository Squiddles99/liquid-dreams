# Ride frame rate: design (2026-10-07)

**Andrew, 2026-10-07:** "when playing as the surfer, I'm getting sub 10s for framerate. When I leave surfer in cam
mode, I'm solid 60fps." He paused R4 for this: nothing a player judges on the board is a fair test at that rate.

## What was measured (Fable, Electron, dev server, 6 ft intermediate, `tools/_rideProfile.mjs`)

| state | frames | mean ms | fps |
|---|---|---|---|
| cam mode | 1441 | 4.3 | 231 |
| paddling, ride active | 386 | 16.1 | 62 |
| standing on the board | 16 | 372.9 | 2.7 |

Full report: `docs/superpowers/evidence/ride-framerate/baseline-6ft-fable.txt`. CPU profile, riding, inclusive:

- 94% `App.frame`; **80% `sectionWater.withSections → cached → sheet → waterAt → sumWaves`**: building a station's
  cross-section curve on the CPU. 17% `cameraPose` (same path, the camera's probes). 9% `tubeCover → coverAt →
  profileCurve`. 6% `updateUnderwater` (a second `rideWater` instance, same path again).
- Self time: `bilinear` 18%, `sampleOnset` 15%, `waveAtCrest` 8%, `lifecycle` 7%, `densePoint` 6%, `sampleInside` 6%,
  `crestAt` 5%.

## Root cause

1. **Every station curve is rebuilt from the full wave sum.** `withSections.cached(s)` samples the sheet along the
   station's normal 14 times for the knots (`sectionFrameKnots`) and 160 times for the curve points (`sectionPoint`,
   one `sheet(home)` per sample): 174 `waterAt` calls, each 5 `sumWaves` (4 inversion passes + 1). The GPU draws the
   same curve in `BreakingRibbon`'s compute passes; the CPU copy exists only for the board.
2. **The cache lives one water function long.** `rideWater()` returns a fresh `withSections` with an empty cache;
   `frame` builds one for the ride step and the camera (shared), another in `updateUnderwater`, and `tubeCover` keys its
   own `WeakMap` on `Station` objects that `traceStations` recreates every frame, so it misses every frame.
3. **`sumWaves` pays for every active wave.** `waveAt` runs `crestAt` (two field samples of 10 bilinears each, an onset
   record, `lifecycle`) for each of up to 12 active waves, then `waveAtCrest` throws the crest away for any wave whose
   phase is beyond the envelope (`beyondEnvelope`, |ξ| ≥ 1.52 × 0.7 T ≈ 16 s). At 15 s spacing, at most two or three
   waves are ever inside the envelope at a point. The GPU already skips such waves (comment at `beyondEnvelope`).

Per riding frame: 3–5 station curves × 174 samples × 5 `sumWaves` × ~10 waves ≈ 40,000 crest lookups.

## Target

Standing on the board at 6 ft and at 12 ft, intermediate: mean frame ≤ 20 ms (≥ 50 fps) on Andrew's RTX, by
`tools/_rideProfile.mjs`. Cam mode and paddling no slower than the baseline. No change to where she stands: the ride
tests keep their numbers, and the section height under the board moves by no more than the stated tolerance.

## Rulings

- **R1, exactness first.** Step 3 (skip the crest lookup beyond the envelope) changes no number anywhere: the crest is
  discarded on that path today. It goes in first, alone, with a test that `waveAt` equals the old composition at random
  points and times. It speeds every CPU consumer (ribbon trace, spray emitters, the height probe's checks, the ride).
- **R2, one water per frame.** `App.frame` builds the ride's water once, before the ride step, and the step, the camera,
  `updateUnderwater` and `tubeCover` read it. `rideOffset.sent` keeps its sheet-only sample (the probe compares against
  the sheet alone; `rideWater(t, false, false)`).
- **R3, the curve from a sheet table.** `cached(s)` samples the sheet along the normal into a table of N evenly spaced u
  over [−(EDGE_OUTER_UNITS + 1) A, (EDGE_OUTER_UNITS + 1) A] once per station, and the knots and the 160 samples read the
  table by linear interpolation. N is set by the error measurement in the plan, not chosen: the largest N whose cost
  meets the target, and the error it leaves is recorded. The tolerance: max |Δy| of the section under the board ≤ 2 cm
  at 6 ft over the ride test's rows. If 2 cm needs N > 64, say so and stop; do not widen the tolerance.
- **R4, the tube cover's curve is keyed by its inputs.** `profileCurve(phase, hollow)` is memoised on (phase, hollow)
  quantised to 1/64, not on the station object.
- **R5, held in reserve, not done unless R1–R4 miss the target:** a station curve kept across frames (rebuilt when the
  station's A, phase or hollow moves by > 1/64, or every 4th frame), keyed by (wave, arc bucket).
- **Nothing else moves.** No physics constant, no `INVERT_ITERATIONS`, no `CURVE_SAMPLES`, nothing in `breaking.ts`,
  `crestTrace.ts`, `setWaveModel.ts` beyond R1's early return, nothing under `src/seabed`. A bot artefact to ignore:
  the paddling profile's 4% in `SoundSystem.context` comes from the bot re-dispatching keydown every frame.

## Addendum 2026-10-07 (Fable, after Opus's Tasks 1, 2, 4: riding 187 ms at 6 ft, 172 ms at 12 ft)

**What the evidence says.** A riding frame builds about 30 station curves at ~5.5 ms each. The reason is the station
spacing: `traceStations` spaces stations by camera distance (`SPACING_PER_M` 0.012, floor `MIN_SPACING_M` 0.08 m), and the
ride camera sits 4 m back, so the stations under the board are 8 cm apart. The section numbers are smoothed along the crest
with σ = `SECTION_SMOOTHING_M` 4 m, so neighbouring stations' sections are the same to well under a percent. The board's
nose, middle and tail over four substeps, the camera's probe and `MAX_ALONG_M` 6 m of reach together touch ~30 distinct
stations and `withSections` builds every one.

**R3 is closed: no sheet table.** At 12 ft no table meets any sensible tolerance (9.8 cm at N = 96 cubic): the leaned
sheet's front is near vertical along the normal at that size and an even table cannot follow it. Not pursued further.

**R6, the ride's stations are thinned by arc.** The ride's water uses a thinned copy of the frame's stations: within
each run of live stations, the station nearest every `RIDE_STATION_SPACING_M` = 1 m of arc, gaps kept. With σ = 4 m
smoothing this changes the section under the board by a measured, not assumed, amount (the Task 3 probe harness,
committed env-gated this time): tolerance max |Δy| ≤ 2 cm at 6 ft, reported at 12 ft. Expected: ~30 curves → ~5.

**R7, a curve is kept across frames.** The curve of a thinned station is cached by (wave arrival s, round(arc / 1 m)):
the station rides its crest, and in its own units (A, along its normal) the sheet under it is near steady between
frames. A cached curve is reused while its A, phase and hollow are each within 1/64 of the cached ones and it is at most
`RIDE_CURVE_MAX_AGE` = 4 frames old. The station's x, z, nx, nz are taken fresh each frame (only the curve is reused).
Error measured for ages 1, 2 and 4 by the probe; same tolerance. Expected: ~5 curves → ~1–2 per frame.

**R8, reserve:** a warm-started inversion along the normal in `cached(s)` (start each sample's x0 from the previous
sample's, 1–2 passes instead of 4) only if R6 + R7 miss 20 ms; its error measured the same way.

**For the wave-form work, not for this branch:** at 12 ft, save one station's sheet along its normal (400 samples of
u, y over ±8 A, with the station's A, phase, hollow) as evidence of the sharp feature Opus saw: it may be the step crease.

## Addendum 2, 2026-10-08 (Fable's ruling after the addendum pass: riding ~120–210 ms, R1–R8 spent)

**What the evidence says now.** A station curve costs 196 sheet reads: 36 for its knots (`sectionFrameKnots`: 5 back, 5
front, 4 beyond, 11 curl knots × 2) and 160 for its samples, ~44 of which are weight 0 and already free. The ride reads the
curve at **one u per probe** (`lowestWetCrossing`), yet builds all 160 samples. Every sample's u along the normal is known
from the knots alone: `sectionPoint`'s u is w × (the sheet's u at the home) + A × a_u, and the ride's sheet function returns
its own argument as the sheet's u, so the sheet's u *is* the home; `curveSamples` spreads the samples with `hermitePoint`
and reads no sheet. Only a sample's **y** needs the sheet. So of the 160 sample reads, all but the ends of the one to three
intervals that bracket the probe's u are wasted. R6 and R7 failed because they moved the surface; this moves nothing.

**R9, the curve read lazily, exact.** `cached(s)` builds the knots and all 160 samples' u (36 reads) and reads a sample's y
only when `lowestWetCrossing` needs it: for every interval [u_i, u_i+1] (u_i+1 > u_i) containing the probe's u, both ends,
each read at most once per station per frame (the frame's water keeps them). The u is computed by the same expression as
`sectionPoint`'s first component (over A), so the result is bit-identical to today's; the lowest-wet-crossing rule, the
weight-0 skip and R8's warm read are unchanged. Expected: ~196 → ~40 reads per curve, ~4–5× fewer wave sums per physics
step, and the substep spiral (`MAX_STEP_S` = 1/60, up to 4 substeps a slow frame) winds down with it.

**(a) GPU readback: rejected.** A curve one frame late is what R7 measured (92 cm at a fixed point at age 1); the ribbon's
curves sit at the drawing's spacing; WebGPU staging readback in Electron is plumbing with its own failure modes; and R9
removes most of the cost a readback would save. Not pursued.

**(b) Normal distance is the measure for approximations, and R9 is not one.** Height at a fixed point is ill-conditioned on
the clamped wall (slope 2: a few cm along the normal is a metre of y), so from now any lever that *moves* the surface
(thinning, reuse, fewer stations) is measured as the distance from today's point to the variant's surface along the normal,
|Δy| / √(1 + s²) with s today's clamped slope magnitude there: ≤ 2 cm at 6 ft over the ride test's rows, **and** `heldS`
per case within 0.1 s, **and** the largest frame-to-frame step of the board's y no larger than today's. No such lever is
in R9.

**(c) R10, reserve: fewer station reads per step.** Only if R9's riding mean is still > 20 ms at 6 ft or 12 ft, and only
after Fable has seen where the frame goes then. Candidates, under (b): the nose and tail probes reading the middle's station
pair; the camera's probe on the frame's existing curves. Not started by Opus.

**For the wave-form work, not this branch:** the 4-pass inversion is 8.24 cm off converged on the 12 ft wall (Opus, R8
probe); the 12 ft front is smooth and steep (67° at u/A 0.94), not a crease (`evidence/ride-framerate/sheet-normal-12ft.txt`).
