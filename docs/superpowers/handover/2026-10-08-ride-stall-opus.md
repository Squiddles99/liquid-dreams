# Ride stall: Opus's handover (2026-10-08)

Branch `ride-stall` (from main 19e6b25), pushed, **not merged** (Andrew's say-so). Spec
`docs/superpowers/specs/2026-10-08-ride-stall-design.md`, plan `docs/superpowers/plans/2026-10-08-ride-stall.md`,
ledger `.superpowers/sdd/2026-10-08-ride-stall/progress.md` (local, git-ignored, with every ruling).

## Commits

| commit | what |
|---|---|
| 822164f | T1 idle-run scanner: `src/dev/cpuprofileIdle.ts` (+ test), `tools/_stallScan.mjs`, `evidence/ride-stall/stall-scan.txt` |
| a41ec05 | T2 frame log `src/dev/frameLog.ts` (`App.frameLog`: dt, sim, gpu, ticks per system, under, ribbon, pending), GPUDevice creation hooks + Electron content tracing in `_rideProfile.mjs --stall --trace`, `src/dev/traceSlices.ts` + `tools/_traceStall.mjs` |
| b572619 | T2 smoke fixes: reader survives 100+ MB traces, `ldStall:` pass marker aligns page and trace clocks, one trace over paddle + ride, frames saved before the trace stops, stall frames summed by thread |
| 2e615e6 | T3 evidence (stall table, paddle-out verdict); profiler reads end focus before the trace stops |
| 41ebc63 | Gate A report |
| 1e1d0cb | (Fable) Gate A ruling: Tasks 4a–4c |
| 03ae043 | 4a: the stall under deliberate GPU contention: not reproduced |
| ca15203 | 4b: frame stats start after `Profiler.start`; rider drawn once before the cam pass (+ cam pose restored, focus re-grabbed); 60 s ride wait; first line says a paddle-start pass |
| 6697e98 | 4c: `AsyncPipelines.inflight()` / `started`, frame log `building` |
| 05558a5 | 4c: write-up; a once-per-label `console.warn` for a build unsettled after 10 s (dev naming only) |
| (this) | T5 handovers, `evidence/ride-stall/t5-probe.txt` |

Also done at Andrew's word: the four stray untracked `src/dev/_probe.test.ts`, `_spike.test.ts`, `_spk2.test.ts`,
`_spk3.test.ts` deleted (they were never in git). `tsc --noEmit` is clean.

## Suite

`npx vitest run --reporter=default` (22:11, loaded machine): 224 files, **1903 passed, 55 failed, 20 skipped**.
- 39 failures are identical by name to the last segment's baseline (`fails-t16.txt`, breaker + whitewater), plus R3's
  committed red (`rideOnSections` 6 ft expert, 0.78 s).
- The other 15 are load: 13 timeouts (5–120 s limits) and one timing assertion (`crestTrace` 36.7 ms vs 20 ms). They are
  in `BreakingRibbon.limits`, `SetWaves`, `breakingField` (tide), `setWaveModel` (extreme), `heath/plants` ×2,
  `seabed/bathymetry` and `whitewater/foamStep`.
- **Rerun of those 8 files alone: every one of the 15 passes**; the 18 failures left there are all baseline names.
- `npx vitest run src/dev src/render` 174 passed. `npx tsc --noEmit` clean.

## The stall table (Task 3, copied)

17 focused riding passes (branch and main code, with and without the log and trace, 6 and 12 ft): **0 idle runs
≥ 150 ms** in the riding cpuprofiles. r10b (17:1x the same day, same code) had a ~450 ms one in every pass. Every pass's
riding frames ≥ 200 ms:

| run | sim s | dt ms | gpu ms (this, next) | ticks f/s/i/k | creations | trace inside the frame |
|---|---|---|---|---|---|---|
| 6ft | 396.14 | 509 | 104.7, 104.7 | 2/2/2/2 | 0 | Renderer BeginMainFrame 355 (pass began in paddle: the catch + profiler start) |
| 6ft-b | 398.46 | 207 | 7.7, 7.7 | 2/2/2/2 | 1 `_readback` | Renderer BeginMainFrame 28 + 206 ms DevToolsSession mojo task |
| 12ft | 397.42 | 242 | 7.0, 7.0 | 2/2/2/2 | 3 `_readback` | Renderer BeginMainFrame 42 + DevToolsSession mojo task |
| 12ft-b | – | – | – | – | – | none ≥ 200 ms (max 164, frame #1) |

All of them are frame #0/#1, i.e. CDP `Profiler.start`: a 164–314 ms `Receive mojo message` on the renderer's main
thread, tagged `blink.mojom.DevToolsSession`. Paddling (profiler path) = the replay (240/58/58/80 ticks) + 114–115
**sync** rider pipelines (`?frontend=off`: first draw), then 1.0–4.5 s GPU-process `CommandBuffer::Flush` calls per frame.
Full table with the riding lines: `evidence/ride-stall/stall-table.md`.

## Paddle-out verdict (Task 3 step 5)

**Hidden by the cover.** The code's gate (`underCover` work → `setPaused(true)` → `release()`; the gate only counts frames
after release; `planTicks` replays even while paused) means the replay frame always draws before the dissolve. Live
(Playwright, front end on): the replay frame was at +713 ms after START, its GPU frame (823 ms) ended at +1536, and the
dissolve came at +4724. `evidence/ride-stall/t3-paddle-out.txt`.

## Task 4 before / after (riding lines, focused, no flags)

Before (Task 3, branch code):
```
t3-cost-off-a  6 ft: 152 frames, mean 34.5 ms, median 32.5 ms, p90 44.1 ms, max 178.0 ms
t3-cost-off-b  6 ft: 146 frames, mean 36.8 ms, median 33.6 ms, p90 48.8 ms, max 285.6 ms
ab-br-12ft    12 ft:  80 frames, mean 65.6 ms, median 66.0 ms, p90 77.1 ms, max 163.4 ms
ab-br-12ft-b  12 ft:  67 frames, mean 79.7 ms, median 78.4 ms, p90 109.0 ms, max 262.1 ms
```
After (4b's profiler):
```
t4b-6ft      riding: 141 frames, mean 36.1 ms, median 31.5 ms, p90 60.8 ms, max 79.6 ms    paddling max 432.7 ms
t4b-6ft-b    riding: 170 frames, mean 29.9 ms, median 27.8 ms, p90 42.5 ms, max 54.3 ms    paddling max 414.2 ms
t4b-12ft     riding:  77 frames, mean 66.3 ms, median 64.8 ms, p90 74.1 ms, max 81.5 ms    paddling max 454.9 ms
t4b-12ft-b2  riding:  72 frames, mean 70.9 ms, median 69.5 ms, p90 77.9 ms, max 101.7 ms   paddling max 91.4 ms
```
The restated gate (spec §3 addendum): **no riding frame ≥ 150 ms: met in all four** (max 54–102 ms). Medians against
Task 3's no-flag runs: 12 ft −5 % / +2 % (within ±10 %). 6 ft −4 % / **−15 %**: outside ±10 %, but *faster*, a
6 ft run-to-run spread already seen in Task 3 (30.5–39.4 ms across its 6 ft runs). Paddling: 2.6–5.4 s → 0.09–0.45 s.

4a (deliberate contention, `evidence/ride-stall/t4a-contention.md`): a second WebGPU page with the game, throttled
off-screen at 1 Hz and visible at ~27 fps: 0 idle runs ≥ 150 ms in four passes. Not reproduced.

4c (`evidence/ride-stall/t4c-pending.md`): the build holding the paddle-out cover is `MeshBasicNodeMaterial (output)`,
left over from boot. It was pending at the select screen in 3/4 loads at ~21:30 (0/16 at ~20:40), and it is slow rather
than proven stuck. Two fixes were tried and both withdrawn:
- the plan's 2 s timeout fired on legitimate boot builds, which would regress the boot cover;
- `pendingSince(mark)` could let that object pop in after the dissolve.

## The probe (no ride code changed)

`PROBE_RIDE_STATIONS=1 PROBE_VARIANTS='direct|lazy|warm 2' npx vitest run src/ride/rideStations.probe.test.ts
--reporter=default` (`evidence/ride-stall/t5-probe.txt`), identical to r10b:
```
6 ft:  lazy (R9) | 0.00 | 0.0000 | 7.0 | wave sums per frame 972 | curves at g = 1 84.4% | p50 0.00 p95 0.00 p99 0.00 cm, rows > 2 cm 0
12 ft: lazy (R9) | 0.00 | 0.0000 | 6.7 | wave sums per frame 982 | curves at g = 1 72.8% | p50 0.00 p95 0.00 p99 0.00 cm, rows > 2 cm 0
```

## Gotchas met

- **Port 5173** served another checkout (`ld-select-ui`; its `App.ts` has no frameLog). Profiled on my own 5174 via a
  temporary `.claude/launch.json` entry, reverted at every commit, server stopped.
- **Focus**: 3 of 4 traced runs read *minimized* after `contentTracing.stopRecording` (focus now read before it). In 4b,
  three 12 ft runs lost the window during the cam/paddle passes while Andrew used the desktop; `grab()` is now repeated
  after the 3 s rider draw. Riding is always re-grabbed. Any pass at 1.0 fps (6 frames) means the window was hidden.
- **Trace size**: one trace over paddle + ride is ~235 MB at 6 ft. The reader needs `node --max-old-space-size=12000`.
  `disabled-by-default-gpu.dawn` did yield events (D3D12 RecordCommands, MapAsync, Flush).
- **Vitest 5 hides passing tests' `console.log` under an agent** (its agent reporter): run the probe with
  `--reporter=default` or its table is lost. The probe with all variants took 46 min on the loaded machine; with
  `PROBE_VARIANTS='direct|lazy|warm 2'`, 14 min.
- **Playwright's Chromium** keeps its profile across sessions: localStorage from earlier paddle-outs changes the select
  screen (the rider already built). Clear storage for a first-ever path.
- The plan's 4b `toggleRide()` off calls `stopRide(true)`, which moves the camera to the board: the cam pose is
  restored after it.

## Deferred minors

- `_rideProfile.mjs`'s paddling pass has no focus check; a hidden window there shows only as ~1 fps.
- `AsyncPipelines.build()` still awaits every build it started; a promise that never settles would hang its awaiter
  (boot's prewarm). Not seen; a timeout there was out of this segment's scope.
- The 10 s naming warning also names legitimately slow boot builds on a loaded machine (dev console only).
