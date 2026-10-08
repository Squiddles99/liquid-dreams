# The ride stall: design

**Written by:** Fable (orchestrator), 2026-10-08, for Opus (executor). Branch `ride-stall` from `main` (95e0ecd).
Andrew's ask (2026-10-08): "Ship it at this frame rate, profile the 500 ms stall next." Handover:
`docs/superpowers/handover/2026-10-08-ride-stall-fable.md`.

## 1. The problem

Every riding pass of `tools/_rideProfile.mjs --sim-t=300` has one frame of ~500 ms (6 ft max 511.6 / 499.5 ms, 12 ft
520.8 / 526.8 ms; `evidence/ride-framerate/r10b-*-report.txt`). It pulls the mean up ~10 ms over the median and is a
hitch a player feels on the board. Every paddling pass has one 3.5–4.1 s frame. Cam mode has neither (max 233–377 ms,
all of it the profiler's own start-up; see §2).

## 2. What Fable read from the existing CPU profiles (no new runs)

The riding `.cpuprofile` files (`.superpowers/sdd/2026-10-07-ride-framerate/cpuprofiles/r10b-*-ride.cpuprofile`,
200 µs sampling) show the stall as a **contiguous run of `(idle)` samples on the main thread**: the frame-time
recorder's rAF simply did not fire for ~400–460 ms. It is not JavaScript.

| run | idle runs ≥ 200 ms (ms, at +ms into the pass) | sim time of the ~440 ms one | pass start (sim s) |
|---|---|---|---|
| r10b-6ft | 440 @ +1576 (275 @ +191 is the profiler's start) | ≈ 400.06 | 398.48 |
| r10b-6ft-b | 455 @ +1737; 324 @ +315; 312 @ +4852 | ≈ 399.98 | 398.24 |
| r10b-12ft | 458 @ +1665; 390 @ +2761; 377 @ +222 | ≈ 398.8 | 397.15 |
| r10b-12ft-b | 442 @ +1286; 397 @ +2358; 393 @ +3364; 371 @ +4504; 255 @ +293 | ≈ 398.4 | 397.14 |

- **The 80 ms before each idle run holds nothing unusual**: the ride's water sums, the ribbon's trace, `writeBuffer`
  of uniforms, a few ms of GC. The first sample after is the next frame's normal start.
- **No pipeline or shader build in JavaScript during any riding pass**: no `createRenderPipeline`,
  `createComputePipeline`, `createShaderModule`, node-builder or `getForRender` sample anywhere in the four riding
  profiles. (three builds WGSL on the main thread for several ms before any create call; it would show.)
- **GC** is 2% of the riding pass and is not clustered before the stalls.
- **Cam mode is clean**: the only ≥ 200 ms gap in the three cam profiles is the `(program)` sample at index 0 (the
  profiler attaching) and one 352 ms idle at +326 ms in 6ft-b (the focus grab). So the stall is ride-only.
- At 12 ft the b run stalls ~every 1.0–1.1 s (five idle runs in 5.3 s); the a run three times. At 6 ft, once (plus
  the ends). The 6 ft stall lands at the same sim time (≈ 400.0 s) in both runs; the 12 ft one at 398.4–398.8 s.
- **Paddling**: the paddle profiles are 2.8 s (6 ft) and 3.6 s (12 ft) of contiguous idle, starting 0.2–0.7 s into
  the pass. The pass begins 0.5 s after `toggleRide()` → `startRide()` → `catchSetWave()`, which jumps the clock
  (`clock.setTime(arrival − lead)`), `resetFoam()` and `invalidateParticles()`: the next frame replays the foam map
  (`replayTickCount(10 s)` = 240 ticks of a 530 × 750 texel compute pass), the spray (`replayTicksForMaxLife`),
  the impact pool and the kelp (`KELP_REPLAY_S` 4 s = 80 ticks), all in one frame, on the GPU. In the shipped game
  the same `startRide()` runs under the paddle-out cover (`App.paddleOut` → `underCover('Paddling out…')`, min hold
  1500 ms, dissolving on a steady frame via `loadingScreen.frameDrawn`): whether a player ever sees it is a question
  for Task 3, not a given.

Since the main thread is idle, the ~450 ms is spent either **on the GPU** (a frame whose GPU work takes that long: the
swap chain back-pressures rAF), **in the GPU process's CPU** (Dawn compiling a pipeline or allocating a large resource
synchronously, the page's frames queued behind it, as the loading-cover freeze was: memory `shader-prewarm`) or **in
the compositor / presentation** (BeginFrame withheld; the window is `setAlwaysOnTop(…, 'screen-saver')`). The
existing instruments cannot tell these apart. This segment's first job is an instrument that can.

## 3. Goal and gate

**Goal:** no riding frame longer than twice the riding median, at 6 ft and 12 ft, in the profiler's focused run, with
the median unchanged; and the paddling frame either shown to be hidden by the paddle-out cover or fixed the same way.

**Gate (the segment's acceptance):** in two focused `--sim-t=300` runs per size in one session,
`riding max ≤ 2 × riding median` in all four runs, riding median within ±10 % of a same-session baseline run, and
`src/ride/rideStations.probe.test.ts` (`PROBE_RIDE_STATIONS=1`) unchanged: `lazy (R9)` 0.00 cm, 972 / 982 sums
per frame (the ride's water is not touched by this segment at all).

## 4. Measurement design (Task 2)

Three instruments, all in the profiler and a dev-only log in the page, nothing in the ride:

1. **A per-frame log in the page** (`src/dev/frameLog.ts`, written by `App.frame` when switched on by the profiler):
   `t` (performance.now), `dt` (ms since the previous frame), `sim` (sim time), `gpu` (the last resolved GPU ms:
   render + compute timestamps, as `perf.update` reads them; it lags a frame or two), `ticks` (foam, spray, impact,
   kelp ticks run this frame), `under` (the underwater flag), `ribbon` (1 when the ribbon's key changed this frame),
   `pending` (`asyncPipelines.pending`). Ring of 4096 frames, read back as JSON.
2. **GPUDevice creation hooks**, installed by the profiler in the page after load (prototype patches on
   `createRenderPipeline`, `createComputePipeline`, `createShaderModule`, `createBuffer`, `createTexture`): a list of
   `[performance.now(), method, label, size]`. Zero entries during a stall rules out a page-initiated build.
3. **Electron content tracing of the riding pass** (`contentTracing.startRecording` with `toplevel`, `gpu`, `viz`,
   `cc`, `disabled-by-default-gpu.dawn`; stopped to `<prefix>ride.trace.json`), read by `tools/_traceStall.mjs`: the
   slices ≥ 30 ms in every process and thread (named from the trace's `thread_name` / `process_name` metadata),
   in time order, so the stall frame's wall time is attributed to a process. This is the one instrument that sees the
   GPU process and the compositor.

The stall table (Task 3) joins the three by wall time: for each riding frame with `dt ≥ 200 ms`, its sim time, dt,
GPU ms, ticks, creations in the frame, underwater, ribbon, and the trace slices ≥ 30 ms overlapping it.

## 5. Decision rules (Fable's Gate A ruling, from the stall table) and the fix menu

| what the table shows | cause | the fix (Task 4, written as an addendum once chosen) |
|---|---|---|
| GPU ms of the frame (or the next) ≈ dt, no creations, trace slices in the GPU process's main or Dawn thread named as command execution | **H1: a GPU work burst** in one frame (a tick replay, a cloud or shadow march, a sunlight march, or a very heavy pass) | spread the burst over frames (a per-frame tick cap in `FoamSchedule.planTicks`, with the remainder carried; or the march already sliced), under the cover where one exists; never a change to what the ride reads |
| GPU ms small, creations ≥ 1 in the frame, or the trace shows `CreateRenderPipeline` / `CreateComputePipeline` / shader compile / a large allocation in the GPU process | **H2: the GPU process blocks on a build** | prewarm the object (a `withOnlyShown` render through `asyncPipelines.build`, as `App.prewarm` does) at ride start under the paddle-out cover; or pool the allocation |
| GPU ms small, no creations, the trace shows the renderer's compositor waiting (no `BeginFrame`, a swap wait) | **H3: presentation** | report to Andrew with the trace; try the profiler without `setAlwaysOnTop` (same-session A/B) before any game change |
| nothing attributable (trace empty for the window) | the trace categories miss it | add `disabled-by-default-devtools.timeline` and `disabled-by-default-gpu.service`, rerun once; then report |

The paddling frame: if the paddle-out cover's gate (`loadingScreen.frameDrawn`, `release`, `minHoldMs`) swallows the
replay frame — the cover dissolves only on a steady frame after it — the player never sees it; record that and leave
it. If the cover can dissolve before the replay frame, treat it as H1 under the cover (run the replay before `release`).

## 6. Constraints

- Nothing under `src/ride`, `src/breaker`, `src/seabed` changes in this segment; the probe above must read identically.
- A fix may be cosmetic-only (prewarm, pooling, spreading GPU work): the final foam / spray / kelp state after a
  spread replay must equal the one-frame replay's (ticks are sim-time indexed, so a carried remainder reaches the same
  tick k; a test pins it).
- Only focused runs count; same-session A/B only (the machine drifts ~15 %/hour); port 5174 via a temporary
  `launch.json` entry if 5173 is taken, reverted before commit. `npx tsc --noEmit` clean at every commit; probes in
  `tools/_*.mjs` or env-gated tests, never `src/_scratch`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commit, ledger (`.superpowers/sdd/2026-10-08-ride-stall/progress.md`) and push after every task (memory
  `log-progress-often`).

## 7. Out of scope (carried)

Fixed-step physics accumulator; R3's 6 ft expert red; in-game curve share at curl weight 1; R9 minors; the agreed
order after this segment (wave form step 4 → lineup truth → blocky patches → R4).
