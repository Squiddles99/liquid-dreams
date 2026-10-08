# Fable → Fable: R3 reviewed, ride frame rate written (2026-10-07)

For the next Fable session. Memory `ride-framerate.md` carries the state; read this, then the spec and plan only when
Opus's handover lands.

## Where things stand

- Andrew paused R4 (2026-10-07) with five points: frame rate on the board (sub-10 fps), the lineup's swell angle and
  everything-breaks look, the blister barrel, blocky patches in front of the wave at size, the step crease and the
  right-angle bowl. Agreed order: frame rate → wave form step 4 (one curl, one clock) → lineup truth (swell wrap +
  bathymetry with the four real breaks) → blocky patches (capture first) → back to R4.
- `r3-staying-on` d1f5169 pushed, **not merged**, held until ride work resumes (tests + tools only, one red expert
  case; Opus reported 40 suite fails, 39 presumably baseline: ask).
- `ride-framerate` branch from main ae35174: `tools/_rideProfile.mjs` (Electron + CDP profiler: cam / paddling /
  riding frame times and CPU summaries), the baseline report, spec, plan, this file. Opus executes.

## What I measured (6 ft intermediate, dev server, Electron)

cam 4.3 ms (231 fps) · paddling 16.1 ms (62 fps) · **riding 372.9 ms (2.7 fps)**. 80% of a riding frame is
`sectionWater.withSections` rebuilding station curves from 174 full `waterAt` calls per station (5 `sumWaves` each,
each `sumWaves` running `crestAt` for all ~10 active waves though `waveAtCrest` discards the crest beyond the envelope).

## Rulings, and why

- **Exact cut first** (Task 1: `waveAt` early-returns beyond the envelope). Zero behaviour change, every CPU consumer
  gains. If Opus "also" touches `crestAt` or the envelope width, that is the thing not to do.
- **One water per frame** (Task 2); **sheet table for the curve** (Task 3, N by a measured error table, ≤ 2 cm at
  6 ft, stop if N > 64 needed); **tube cover memo by numbers** (Task 4). Cross-frame reuse (Task 5) only if the
  target (≤ 20 ms riding at 6 and 12 ft) is still missed.
- No physics constant moves; the ride tests keep their numbers; `heldS` per case ± 0.1 s.

## What to check when Opus's handover arrives

1. Task 1's equality test exists and passed before the change; the sample-count assertion.
2. Four (or five) profiler reports under `docs/superpowers/evidence/ride-framerate/`, three lines each; riding mean
   ≤ 20 ms at 6 ft and 12 ft; cam and paddling not slower than 4.3 / 16.1 ms.
3. Task 3's N table with max |Δy| per N; the chosen N is the smallest meeting 2 cm.
4. Ride test files unchanged in their assertions; `heldS` before/after pasted.
5. Scope: nothing under `src/seabed`, `breaking.ts`, `crestTrace.ts`, `wombSection.ts`, `wombProfile.ts`,
   `ridePhysics.ts`, `ridePose.ts`; `setWaveModel.ts` only the early return.
6. Suite counts before/after; only named new tests change.

Then recommend merging when 2, 4 and 5 hold. Andrew merges.
