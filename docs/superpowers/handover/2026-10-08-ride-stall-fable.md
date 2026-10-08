# Handover for Fable (new session), 2026-10-08: the ride ships at its frame rate; next, the ~500 ms stall

## Andrew's decisions today (2026-10-08)
- `ride-framerate` and `r3-staying-on` merged to main (011786f, 3ad586e), then Tasks 14–16 merged (0a8ab23). All pushed.
- **"Ship it at this frame rate."** The 20 ms target is retired for the beta. Riding at sim-t 300, window focused:
  6 ft ~33–36 ms median (41–45 mean), 12 ft ~58 ms median (74–103 mean). The exact levers are spent (spec addendum 3 of
  `specs/2026-10-07-ride-framerate-design.md`); no approximation of the ride's water is approved.
- **Next segment: profile the ~500 ms stall** that lands once inside every riding pass (6 ft max 511.6 ms, 12 ft 520.8 ms in
  `evidence/ride-framerate/r10b-*-report.txt`; present in every run of Tasks 14–16, at the same sim time each run).

## What is known about the stall
- One frame per riding pass, ~500 ms, every run, both sizes, sim-t 300. It pulls the mean up ~10 ms; the median is honest.
- Not the ride's maths: the same sim time and stations cost ~30 ms a step in Opus's in-page timing (Task 14 handover).
- Candidates, none measured: a GC pause (GC was 2.3% of the riding pass overall), a shader/pipeline compile on first use
  of something during the ride (see memory `shader-prewarm`: compileAsync misses the scene pass), the set-wave reset or
  `catchSetWave`, a ribbon/footprint rebuild, `traceStations` on a crest change, audio (`SoundSystem`), the HUD.
- Every paddling pass also has one 4–6 s frame (Opus's deferred minor); at 12 ft it lands across the catch. Possibly the
  same cause earlier. Look at both.

## How to measure it (what already exists)
- `tools/_rideProfile.mjs --sim-t=300` (Electron, dev server; line 1 of its report records focus). **Only focused runs
  count**: an unfocused window is throttled ~8× (Task 14 finding). Same-session A/Bs only; the machine drifts ~15%/hour.
- `tools/_profileSelfTime.mjs` (Task 16): self time by function/line from a `.cpuprofile`.
- CPU profiles of every run: `.superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/` (git-ignored, local). The stall is
  in each riding cpuprofile: find the one ~500 ms sample run and read its stack. That is the first step, no new runs.
- Port: 5173 is often another session's `ld-select-ui` server; profile on 5174 via a temporary `launch.json` entry,
  reverted. Epic Games Launcher loads the GPU at times; `python tools/riderArt.py` from another session holds a core.
- The probe `src/ride/rideStations.probe.test.ts` (`PROBE_RIDE_STATIONS=1`) is the exactness check if anything in the
  ride's water moves: `lazy (R9)` must stay 0.00 cm, 972 / 982 sums per frame.

## Suggested shape of the next spec + plan (Fable writes, Opus executes; see memory `orchestrator-mode`)
1. Task 1: from the existing cpuprofiles, the stall frame's stack at both sizes and the paddling 4–6 s frame's. A table.
   Decide the cause from that before any code.
2. Task 2: the fix, exact or cosmetic-only (a prewarm, a pooled allocation, a deferred rebuild), test-first where a test
   can see it; the gate is max riding frame ≤ 2× median in two focused runs per size, median unchanged.
3. Task 3: handovers. Branch name suggestion: `ride-stall`.

## Carried follow-ups (not started)
- Fixed-step physics accumulator: `RideSession.step` splits a frame into up to `MAX_STEPS` 4 sub-steps of `MAX_STEP_S`
  1/60, so the ride plays slightly differently at 30 and 60 fps. Small, separate task.
- R3's 6 ft expert case is main's one `src/ride` red (held 0.78 s of 8.58): she is caught at the lip; R3's handover says
  the pop-up's timing and hint is the real question (`handover/2026-10-07-r3-fable.md`).
- In-game share of curves at curl weight 1 (the probe's rider: 84% / 73%) was never measured in the game itself.
- R9 minors: NaN sentinel re-read, unused `stats.reads`, the test's flat-sheet fold counter, single-interval read-count test.
- Agreed project order after frame rate (memory `ride-framerate`): wave form step 4 (one curl, one clock) → lineup truth
  (swell wrap + bathymetry, four real breaks) → blocky patches → back to R4. Andrew may reorder; the stall comes first.

## Files to read first
- `docs/superpowers/handover/2026-10-07-ride-framerate-fable.md` (all rulings, bottom-up) and `-opus.md` (Tasks 14–16
  sections: the numbers, the self-time table, gotchas).
- `docs/superpowers/evidence/ride-framerate/r10b-table.txt` (where a wave sum goes) and `r10b-*-report.txt`.
- Memory: `ride-framerate`, `orchestrator-mode`, `log-progress-often`, `shader-prewarm`, `small-fixes-light-process`.
