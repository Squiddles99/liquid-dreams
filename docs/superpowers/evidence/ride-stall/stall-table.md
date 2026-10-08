# Ride stall: the stall table (Task 3, Opus, 2026-10-08 19:04–19:45)

All runs `--sim-t=300`, port 5174 (my own dev server: 5173 serves another checkout), RTX 4060, every run `focused true`
at cam and at riding. Raw files (git-ignored): `.superpowers/sdd/2026-10-08-ride-stall/`.

## Headline

**The ~440–460 ms riding stall did not reproduce in this session: 0 of 17 riding passes**, on the branch's code and on
main's (`App.ts` from main copied in, and two runs with main's own profiler too), with and without the frame log and the
trace. `_stallScan.mjs --min=150` finds **no idle run ≥ 150 ms in any of the 17 riding cpuprofiles**. The r10b runs
(17:1x today, same code as main) had one in every pass. So the stall depended on the machine's state at the time, not on
the code. Spec §5 has no row for "does not reproduce"; see "Reading" at the end.

## Step 1: the log's cost (cam mode, 6 ft, interleaved off/on/off/on)

```
t3-cost-off-a  cam mode: 1426 frames, mean 4.4 ms (227.7 fps), median 4.1 ms, p90 8.7 ms, max 274.0 ms
t3-cost-on-a   cam mode: 1431 frames, mean 4.4 ms (226.0 fps), median 3.9 ms, p90 9.5 ms, max 329.3 ms
t3-cost-off-b  cam mode: 1426 frames, mean 4.4 ms (224.9 fps), median 4.0 ms, p90 9.6 ms, max 340.3 ms
t3-cost-on-b   cam mode: 1443 frames, mean 4.4 ms (228.6 fps), median 4.0 ms, p90 9.0 ms, max 249.4 ms
```

Medians 4.1 / 4.0 (off) vs 3.9 / 4.0 (on): within 0.3 ms. The log costs nothing measurable.

## Riding passes: every frame with dt ≥ 200 ms (four `--stall --trace` runs)

| run | sim s | dt ms | gpu ms (this, next) | foam/spray/impact/kelp ticks | creations in the frame | under | ribbon | pending | trace inside the frame (≥ 2 ms, summed) |
|---|---|---|---|---|---|---|---|---|---|
| 6ft | 396.14 | 509 | 104.7, 104.7 | 2/2/2/2 | 0 | 0 | 1 | 0 | Renderer/CrRendererMain ProxyMain::BeginMainFrame 355; GPU/CrGpuMain Flush 9 |
| 6ft-b | 398.46 | 207 | 7.7, 7.7 | 2/2/2/2 | 1 (`_readback`) | 0 | 1 | 0 | Renderer/CrRendererMain BeginMainFrame 28 (+ 206 ms `Receive mojo message`, DevToolsSession) |
| 12ft | 397.42 | 242 | 7.0, 7.0 | 2/2/2/2 | 3 (`_readback`) | 0 | 1 | 0 | Renderer/CrRendererMain BeginMainFrame 42 (+ DevToolsSession mojo message) |
| 12ft-b | — | — | — | — | — | — | — | — | no riding frame ≥ 200 ms in the log (max 164 ms, frame #1) |

Reading, per row:
- **All rows = the profiler's own `Profiler.start`**, not the game. Each is frame #0/#1 of the pass; the trace puts a
  206–314 ms `Receive mojo message` task on the renderer's main thread with `mojo_interface_tag
  blink.mojom.DevToolsSession` over it (smoke trace and these). It matches none of spec §5's rows; the r10b profiles'
  "275 @ +191 ms" start-of-pass runs are the same thing.
- **6ft (509 ms) is not a valid riding row**: that pass began in the *paddle* phase (sim 396.04, before the catch at
  397.33), so its first frame is the catch/take-off with the profiler start; GPU 104.7 ms there. The pass is kept for
  the paddling table only. (Why a pass starts in paddle: see the paddling section; the 30 s wait for the ride phase
  times out when paddling runs at ~1 fps.)
- **Review Focus 2, explicitly:** no slice ≥ 30 ms in the GPU process overlaps any riding frame ≥ 200 ms in any run.
  There is no ~450 ms stall frame to overlap, so the extra-categories rerun (spec §5 last row) was not run: it reads a
  stall, and there is none (ruling in the ledger).

### Riding with the profiler start excluded (frame logs, the four `--stall` runs plus the two cost-on runs)

| run | median | worst frame (the profiler start) | worst after frames #0–1 | × median |
|---|---|---|---|---|
| t3-cost-on-a | 34.5 | 187 (#1) | 110 @ sim 399.76 | 3.2 |
| t3-cost-on-b | 30.1 | 183 (#1) | 59 @ 399.39 | 2.0 |
| t3-6ft-b | 31.5 | 207 (#1) | 73 @ 399.37 | 2.3 |
| t3-12ft | 76.9 | 242 (#1) | 127 @ 401.11 | 1.65 |
| t3-12ft-b | 64.1 | 164 (#1) | 89 @ 402.35 | 1.4 |

So in today's runs the spec §3 gate (`riding max ≤ 2 × median`) fails only because of the profiler's own start frame,
plus ordinary jitter at 6 ft (59–110 ms, 2.0–3.2×).

## Step 4: the riding lines (verbatim) — baseline candidates

The four `--stall --trace` runs (the trace costs: 12 ft medians 76.7 / 63.7 vs 66–68 without):

```
t3-6ft    riding (phase paddle -> ride): 107 frames, mean 48.9 ms (20.4 fps), median 43.4 ms, p90 71.5 ms, max 226.0 ms   [began in paddle]
t3-6ft-b  riding (phase ride -> ride): 153 frames, mean 34.8 ms (28.8 fps), median 31.6 ms, p90 45.3 ms, max 223.2 ms
t3-12ft   riding (phase ride -> ride): 70 frames, mean 78.1 ms (12.8 fps), median 76.7 ms, p90 104.0 ms, max 243.9 ms
t3-12ft-b riding (phase ride -> ride): 84 frames, mean 63.6 ms (15.7 fps), median 63.7 ms, p90 73.9 ms, max 179.1 ms
```

No flags (the honest baseline; branch code unless marked main):

```
t3-cost-off-a   6 ft: 152 frames, mean 34.5 ms, median 32.5 ms, p90 44.1 ms, max 178.0 ms
t3-cost-off-b   6 ft: 146 frames, mean 36.8 ms, median 33.6 ms, p90 48.8 ms, max 285.6 ms
ab-br-6ft       6 ft: 148 frames, mean 36.1 ms, median 32.2 ms, p90 50.6 ms, max 271.4 ms
ab-main-6ft-b   6 ft: 126 frames, mean 41.8 ms, median 39.4 ms, p90 55.5 ms, max 200.7 ms   (main App.ts)
ab-main-12ft   12 ft:  80 frames, mean 67.4 ms, median 67.6 ms, p90 75.7 ms, max 258.8 ms   (main App.ts)
ab-br-12ft     12 ft:  80 frames, mean 65.6 ms, median 66.0 ms, p90 77.1 ms, max 163.4 ms
ab-main-12ft-b 12 ft:  91 frames, mean 58.7 ms, median 59.6 ms, p90 67.3 ms, max 236.8 ms   (main App.ts)
ab-br-12ft-b   12 ft:  67 frames, mean 79.7 ms, median 78.4 ms, p90 109.0 ms, max 262.1 ms
ab-main-6ft     6 ft: 116 frames, mean 50.6 ms, median 39.0 ms, p90 66.9 ms, max 858.2 ms  (main App.ts; began in paddle; the 858 ms is not in the cpuprofile: no idle run >= 150 ms, so it precedes Profiler.start's return)
ab-pure-main-6ft   6 ft: 129 frames, median 33.1 ms, max 328.7 ms  (main's profiler + main App.ts; began in paddle)
ab-pure-main-12ft 12 ft:  97 frames, median 56.2 ms, max 786.8 ms  (main's profiler + main App.ts; began in paddle)
```

r10b for comparison (17:1x, same code): 6 ft median 35.6 / 32.6, max 511.6 / 499.5; 12 ft 58.6 / 58.2, max 520.8 / 526.8.
Medians today are the same within noise; only the ~500 ms frame is gone.

## Paddling passes: frames ≥ 1000 ms (profiler path, `?frontend=off`)

| run | sim s | dt ms | gpu ms (this, next) | ticks | creations in the frame | trace inside the frame (≥ 2 ms, summed) |
|---|---|---|---|---|---|---|
| 6ft-b | 392.04 | 1079 | 5.1, 5.1 | **240/58/58/80** (the replay) | 0 | (spans the pass start) |
| 6ft-b | 392.14 | 2051 | 5.1, 122.1 | 2/2/2/2 | 10 (MeshBasicNodeMaterial pipeline + buffers) | Renderer BeginMainFrame 1589; GPU/CrGpuMain Flush 525 |
| 6ft-b | 392.24 | 1839 | 122.1, 122.1 | 2/2/2/2 | **115**: sync `createShaderModule` + `createRenderPipeline` for the rider: hair, eyes, hairBraid, teeth, body, hairTie, lashes, MeshBasicNodeMaterial; a 2048² texture; buffers | GPU/CrGpuMain `CommandBuffer::Flush` 1506 |
| 6ft-b | 392.34 | 1004 | 122.1 | 2/2/2/2 | 3 | GPU/CrGpuMain one `Flush` 1004 |
| 6ft-b | 392.44 | 1000 | 122.1 | 2/2/2/2 | 0 | GPU/CrGpuMain one `Flush` 1000 |
| 6ft-b | 392.54 | 2005 | 122.1 | 2/2/2/2 | 0 | GPU/CrGpuMain one `Flush` 2004 |
| 6ft | 392.14–392.54 | 2180, 1830, 1003, 1004, 2143 | 31→310 | 2/2/2/2 | 115 in the 1830 ms frame (same rider set) | GPU/CrGpuMain `Flush` 847–2143 per frame |
| 12ft | 391.82 | 4470 | 11.8 | 2/2/2/2 | 2 | GPU/CrGpuMain one `Flush` 4464 |
| 12ft-b | 391.81 | 1956 | 31.7 | 2/2/2/2 | 114 (same rider set) | GPU/CrGpuMain `Flush` 1956 |

Reading: in the profiler's path the paddling seconds are **H1 + H2 together**. The replay frame is cheap on the main
thread (1079 ms there is the pass boundary). Then the rider is drawn for the first time (`?frontend=off`: never shown
before) and 114–115 GPU objects are created *synchronously* (`createRenderPipeline`, not the async path). After that the
GPU process's main thread sits in single `CommandBuffer::Flush` calls of 1.0–4.5 s, frame after frame: Dawn executing
the replay's submissions and compiling the rider's pipelines. sim advances only 0.1 s a frame (the dt clamp), so at
~1 fps the bot's 30 s wait for the ride phase can time out (why t3-6ft and the ab-*main-6ft/pure-main passes began in
paddle).

## Step 5: the paddle-out in the real path

See `t3-paddle-out.txt`: **hidden by the cover**. The replay frame drew 3.2 s before the dissolve, and the rider's
pipelines go through `createRenderPipelineAsync` there, not the sync path above.

## Reading for Gate A (Opus's, for Fable to rule)

1. **The riding stall: not reproducible today.** Seventeen focused passes, both codes, both sizes: no idle run ≥ 150 ms.
   r10b's runs, two hours earlier on the same code, had one in every pass (at 12 ft-b every ~1.1 s). The 2026-10-07/08
   ledger records other sessions loading the machine then (ld-select-ui's server on 5173, `riderArt.py` holding a core,
   "Epic load", bimodal states). A periodic ~1 s GPU-side wait that comes and goes with the machine reads as **GPU
   contention from another process** (another WebGPU/Chrome page or app presenting on the same GPU). That is outside
   spec §5's rows; nearest is H3 (presentation / not the game). What would confirm it: reproduce on purpose (open the
   game in a second Chrome tab, or run the Epic launcher overlay, while profiling) and see the trace put the wait in
   another process's GPU work.
2. **The gate as written cannot pass, even with no stall**: frame #1 of every riding pass is CDP `Profiler.start`
   (164–242 ms, 2.6–6.6× median). The frame recorder should start after `Profiler.start` returns, or the gate should
   skip frames #0–1.
3. **Paddling in the profiler path = H1 replay + H2 sync rider pipelines**, a profiler artefact of `?frontend=off`; the
   real path is hidden (Step 5). Side finding there: `asyncPipelines.pending` stayed 1 under the whole cover, so the
   dissolve came from the gate's 4 s give-up, not from 10 smooth frames: the cover holds ~2.5 s longer than it needs.
