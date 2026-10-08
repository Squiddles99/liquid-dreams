# Handover for Fable: ride stall closed (2026-10-08, written by Opus)

This replaces the segment's opening brief of the same name, per plan Task 5; that brief is still at
`git show 95e0ecd:docs/superpowers/handover/2026-10-08-ride-stall-fable.md`.

Branch `ride-stall`, pushed, not merged; Andrew decides the merge. Opus's detail:
`docs/superpowers/handover/2026-10-08-ride-stall-opus.md`.

## The cause, as ruled

**The ~450 ms riding stall was machine state, not the game** (your Gate A ruling, 1e1d0cb). The deciding evidence:
- 0 of 17 focused riding passes (Task 3, branch and main code) had an idle run ≥ 150 ms, against every r10b pass two
  hours earlier on the same code.
- 4a's deliberate contention (a second WebGPU game page, throttled 1 Hz and visible ~27 fps) did not bring it back: 0 of
  4 passes. Another GPU user at the time (`riderArt.py`, Epic, another session's server) remains the likely source; it
  is not reproducible on demand.

The ~200–500 ms frame left in every report was the profiler's own `Profiler.start` (a 164–314 ms DevToolsSession task
on the renderer's main thread). The 3–5 s paddling frame was the profiler's `?frontend=off` path: the rider's first
draw, with 114–115 sync pipelines, plus the replay. In the real path the paddle-out cover hides the replay.

## What changed

- **Tools only, for the ride**: the frame log and the scanners (`_stallScan`, `_traceStall`, frame log, creation hooks,
  content tracing). In `_rideProfile.mjs`, the frame stats now start after `Profiler.start`, the rider is drawn once
  before the cam pass, and the ride wait is 60 s.
- Riding after 4b: max 54–102 ms at both sizes (gate: < 150 ms, met). Medians 31.5 / 27.8 ms at 6 ft and 64.8 / 69.5 ms
  at 12 ft. Paddling max 0.09–0.45 s.
- `AsyncPipelines`: dev readout only (`inflight()`, `started`, the frame log's `building`, a once-per-label warning for
  a build unsettled after 10 s). No behaviour change.
- **The ride's water is untouched**: nothing under `src/ride`, `src/breaker` or `src/seabed` changed. Probe: `lazy (R9)` 0.00 cm,
  972 / 982 wave sums per frame (identical to r10b). Suite: the baseline's 39 breaker/whitewater reds + R3's expert red;
  15 extra reds in the loaded full run were timeouts that pass on rerun.

## What is left

1. **4c, your call.** The paddle-out cover is held to its 4 s give-up by `MeshBasicNodeMaterial (output)` (an unnamed
   object, target `output`), a build left over from boot. It was pending at the select screen in 3/4 loads on a loaded
   machine and 0/16 on a quieter one, and it is slow rather than proven stuck. Two fixes were tried and withdrawn (the
   reasons are in `evidence/ride-stall/t4c-pending.md`):
   - the plan's 2 s timeout breaks the boot cover;
   - `pendingSince(mark)` could let the object pop in.
   
   Next: name the object (add `object.type` / parent name to the label), then prewarm it at boot or rule
   `pendingSince`. Also, `SMOOTH.underMs = 33` is never met under the paddle-out cover on a loaded machine (frames
   50–300 ms), so the give-up decides there anyway.
2. **First-ever paddle-out** (clean storage): the rider's 12 pipelines build under the cover, which then dissolves
   1.5–3.2 s after release. A select-screen prewarm of the chosen rider would shorten it.
3. Carried from spec §7: the fixed-step physics accumulator; R3's 6 ft expert red (0.78 s); in-game curve share at
   curl weight 1; R9 minors.
4. Seen but not the stall: the sound system's `AudioContext` gesture frame (~264 ms) in r10b-6ft's paddling profile.
   This is from your plan; I did not re-measure it.

## Next segment

Per memory `ride-framerate` and the agreed order: **wave form step 4** (one curl, one clock), then lineup truth, blocky
patches, R4. Andrew may reorder.
