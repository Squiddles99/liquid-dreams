# F5: the idle frame gate and the spray's CPU cost (before Task 4)

Machine idle (CPU load 7% before the runs; Andrew's other session finished). `_rideProfile.mjs --ft=7 --sim-t=300
--wind=18,90`, main (detached worktree at 63d7604, port 5175) and the branch at f383bdb (port 5174) interleaved,
window focused in every run. Every valid run caught at 399.24–399.32 s and rode 400.2–405.6 s (the same wave, the same
moment).

| pair | main riding median | branch riding median | note |
|---|---|---|---|
| 1 | 39.0 ms | — | branch run invalid: the bot never caught (riding pass began in phase paddle) |
| 2 | 38.2 | 42.5 | |
| 3 | 40.1 | 29.7 | |
| 4 | 29.0 | 37.9 | |
| 5 | 69.2 | 196.8 | both disturbed (riding pass cut to 3.7–3.9 s, 36–47 frames): excluded |
| 6 | 49.1 | 38.4 | |

Median of the valid runs: **main 39.0 ms (5 runs), branch 38.2 ms (4 runs): 0.98 × main** (bar ≤ 1.10 ×). The
pair-to-pair spread is the known ±25 %. Cam mode medians 2.9–4.0 ms on both.

`_rideCost.ts --ft=7 --spray --wind=18,90`, breakEmitters per 20 Hz tick, median (mean):

| run | main | branch |
|---|---|---|
| 1 | 2.77 (3.06) ms | 3.16 (3.27) ms |
| 2 | 2.98 (3.09) ms | 2.76 (2.99) ms |

Same within noise (the branch's emitters changed only the impact window and the kick); births per tick unchanged
(median 74). The plan's 14.0 ms baseline predates shelf-polish's exact cull: today's is ~2.9 ms.
