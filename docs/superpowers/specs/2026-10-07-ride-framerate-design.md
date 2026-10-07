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
