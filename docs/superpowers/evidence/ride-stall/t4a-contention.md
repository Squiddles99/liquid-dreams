# Task 4a: the stall under deliberate GPU contention (Opus, 2026-10-08 ~20:00)

Second window: the game itself (`http://localhost:5174/`, front end on, select screen, lookout animating, WebGPU on the
RTX 4060 "lovelace" adapter) in Playwright's Chromium, a separate browser process presenting on the same GPU. A rAF
counter in that page shows it kept presenting through every run. Profiler: `--sim-t=300 --stall`, focused at cam and
riding in all four.

| run | second page | its rAF during the runs | riding line | idle runs ≥ 150 ms (riding cpuprofile) |
|---|---|---|---|---|
| t4a-6ft | off-screen (Playwright default, screenX −21333), throttled | 1.0 Hz (183 frames over 183 s, median gap 1002 ms) | 136 frames, mean 39.2, median 35.9, p90 53.6, max 202.7 ms | **0** |
| t4a-12ft | same | same | 88 frames, mean 60.9, median 61.9, p90 73.2, max 210.7 ms | **0** |
| t4a-vis-6ft | on-screen (10,10, 1050×1000, partly beside the profiler) | ~27 fps (median gap 37.7 ms, p90 77, max 538) | 66 frames, mean 84.1, median 61.1, p90 159.1, max 489.8 ms (began in paddle; focus lost at the end) | **0** |
| t4a-vis-12ft | same | same | 82 frames, mean 66.2, median 64.4, p90 75.3, max 259.6 ms | **0** |

Riding frames ≥ 150 ms in the frame logs (gpu ms, creations):
- t4a-6ft #1 190 ms, t4a-12ft #1 191 ms, t4a-vis-12ft #1 241 ms: the pass's first frame (CDP Profiler.start, as in
  Task 3), gpu 8.8–10.4 ms, 0–1 creations (`_readback`).
- t4a-vis-6ft: #0 711 ms (the pass began in the paddle phase: the catch), then #5–#11 at sim 396.6–397.2 (the take-off,
  before the catch at ~397.3), 159–208 ms each, gpu 7.8–30 ms, 0–3 creations (`_readback` only). These frames are slow,
  not idle: none is an idle run in the cpuprofile (`_stallScan --min=100` finds none). The game and the second page are
  sharing the machine.
- The 489.8 ms max of t4a-vis-6ft's frame-time recorder is the paddle-start frame (#0 in the log, 711 ms there; the two
  recorders start a frame apart).

**Verdict: did not reproduce under a second WebGPU page**, whether throttled off-screen at 1 Hz (the period 12 ft-b had
in r10b) or presenting on-screen at ~27 fps. A browser page on the same GPU gives a uniformly slower game, not
the ~450 ms main-thread idle gap. So the r10b contention was something else, presumably a non-browser GPU user or
machine state at the time (the 2026-10-08 ledgers name `riderArt.py`, the Epic launcher and overlay, another session's
dev server). Either way it is not the game. Item 1 of Fable's ruling is closed; the second window is closed.
