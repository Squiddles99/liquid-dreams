# Ride stall, Gate A: Opus's report to Fable (2026-10-08)

Branch `ride-stall`, pushed, not merged. Tasks 1–3 done; **Task 4 not started** (it waits for your ruling). Full table:
`docs/superpowers/evidence/ride-stall/stall-table.md`; paddle-out verdict: `.../t3-paddle-out.txt`. Ledger:
`.superpowers/sdd/2026-10-08-ride-stall/progress.md` (local).

## Commits

| commit | task |
|---|---|
| 822164f | T1 idle-run scanner (`src/dev/cpuprofileIdle.ts` + test, `tools/_stallScan.mjs`, `stall-scan.txt`) |
| a41ec05 | T2 frame log (`src/dev/frameLog.ts`, `App.frameLog`, ticks per system, ribbon, pending), creation hooks, content tracing, `_traceStall.mjs` |
| b572619 | T2 smoke fixes: trace reader handles 100+ MB traces, `ldStall:` pass marker aligns the clocks exactly, one trace over paddle + ride, frames saved before the trace stops, stall frames summed by thread |
| 2e615e6 | T3 evidence + profiler reads end focus before the trace stops |

Tests: `npx vitest run src/dev` 139 passed. `tsc` clean except four **untracked** files in this checkout that are not
this segment's: `src/dev/_probe.test.ts`, `_spike.test.ts`, `_spk2.test.ts`, `_spk3.test.ts` (dated 2026-09-29, wrong
relative imports). They also fail vitest's import and would break the launcher's tsc build here (memory
`no-scratch-in-src`). Andrew's to delete; I left them.

## What Gate A needs to know

1. **The ~450 ms riding stall did not reproduce: 0 of 17 focused riding passes.** That covers branch code and main's
   (`App.ts` copied in; two runs with main's own profiler as well), 6 and 12 ft, with and without the log and trace.
   `_stallScan --min=150` finds no idle run ≥ 150 ms in any of the 17. Medians match r10b (6 ft 30–34 ms, 12 ft
   56–78 ms); only the ~500 ms frame is gone. r10b (17:1x today, same code) had it in every pass. **So it is
   machine state, not code.** My reading is GPU contention from another process. The r10b-era ledger records other
   sessions' load (ld-select-ui on 5173, `riderArt.py`, Epic), and 12 ft-b stalled every ~1.1 s, which looks like a
   throttled background page presenting. Neither H1 nor H2 fits; nearest is H3, "not the game". To confirm, reproduce it
   deliberately (the game in a second Chrome tab, say) with `--stall --trace` and see the trace put the wait in another
   process.
2. **The spec §3 gate cannot pass as written, stall or not.** Frame #0/#1 of every riding pass is CDP `Profiler.start`:
   a 164–314 ms `Receive mojo message` task (`blink.mojom.DevToolsSession`) on the renderer's main thread, 2.6–6.6×
   the median. With frames #0–1 skipped, the worst riding frame is 59–127 ms: 1.4–1.85× at 12 ft, 2.0–3.2× at 6 ft
   (ordinary jitter). Fix in the profiler: turn the frame recorder on after `Profiler.start` returns, or skip 2 frames.
3. **Paddling.**
   - Real path (front end on, Playwright, RTX): the replay frame (240/58/58/80 ticks) drew at +713 ms. Its GPU cost
     landed on the next frame (823 ms) and the cover dissolved at +4724 ms. **Hidden by the cover**, as the code says
     (citations in `t3-paddle-out.txt`).
   - Profiler path (`?frontend=off`): the rider is drawn for the first time on the board. That means 114–115 *sync*
     `createRenderPipeline`/`createShaderModule` calls (hair, eyes, braid, teeth, body, hairTie, lashes) plus the
     replay, then GPU-process `Flush` calls of 1–4.5 s per frame. That is H1 and H2 together, but only in the
     profiler's path. At ~1 fps the bot's 30 s wait for the ride phase can time out, so some passes began in paddle.
4. **Side finding:** under the paddle-out cover, `asyncPipelines.pending` stayed at 1 the whole time. Each frame fed the
   gate `Infinity`, so the dissolve came from the 4 s give-up, not from smooth frames. The cover holds ~2.5 s longer
   than the work needs. I didn't identify which pipeline was pending.

## Rulings I made (all in the ledger)

- Profiled on 5174 through a temporary `launch.json` entry (5173 serves another checkout; its `App.ts` has no
  frameLog). Reverted, server stopped. Cost if wrong: none.
- `traceSlices` finds t0 with a loop: a 58 MB trace overflowed `Math.min(...spread)`. Test RED→GREEN. Cost: none.
- Pass marker `performance.mark('ldStall:<now>')` plus the `blink.user_timing` category, read by `passMarker()`. The
  plan's first-frame alignment was off by `startRecording`'s latency. Test RED→GREEN. Cost: none.
- One trace over the paddling and riding passes, with no `paddle.trace.json`. Stopping the paddle trace took ~2 s and
  pushed the riding pass past the 6 ft stall's sim time (400.0). Cost: a ~235 MB file; the reader needs
  `node --max-old-space-size=12000`.
- Frame recorder off and log saved *before* `traceStop`. In the plan's order, the riding stats took in the ~8 s write.
- `_traceStall.mjs` also sums slices ≥ 2 ms inside each stall frame by thread: the ≥ 30 ms list alone could not say
  what filled a frame.
- No extra-categories rerun (spec §5 last row): there is no stall for it to attribute.
- Added a same-session A/B with main's code (not in the plan) to tell "gone on the branch" apart from "gone today".
- Step 5 live check ran in Playwright Chromium via `probePaddleOut()` (START on the select screen), not Chrome by hand.
  The temporary `console.info` in `dissolve` is reverted.

## For your ruling / Task 4

Options as I see them:
- (a) Close the riding stall as environmental after a deliberate repro (one session, ~10 min).
- (b) Fix the profiler's gate artefact (recorder after `Profiler.start`).
- (c) Optionally, the stuck `pending` under the cover.

Nothing under `src/ride`, `src/breaker` or `src/seabed` was touched. The probe (`PROBE_RIDE_STATIONS=1`) was not
re-run, since no ride code changed.
