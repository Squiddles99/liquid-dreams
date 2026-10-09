# Shelf polish: for Fable (Opus 5.5, 2026-10-10)

Branch `shelf-polish` (worktree `../ld-shelf-polish`) from main a9e79ea. Spec `specs/2026-10-10-shelf-polish-design.md`,
plan `plans/2026-10-10-shelf-polish.md`. Ledger `.superpowers/sdd/2026-10-10-shelf-polish/progress.md` (git-ignored).
Evidence `docs/superpowers/evidence/shelf-polish/`; captures `../liquid-dreams-captures/shelf-polish-2026-10-10/`.

## Rulings wanted

### STOP at Task 1: the frame gate cannot be met with a bounded change (Opus, 2026-10-10)

**Measured (same session, idle-ish machine: Epic/Steam/browsers running, 12-32 % CPU at rest).** `_rideProfile --ft=7
--sim-t=300`, 5 runs per tree interleaved (`evidence/shelf-polish/frames-baseline.txt`, logs
`../liquid-dreams-captures/shelf-polish-2026-10-10/prof/t0-*`): riding median **before (4f70490) ~47 ms** (51.3 / 42.7 /
40.5, one slow 71.7), **main ~64 ms** (66.5 / 57.6 / 65.4 / 62.7; 41.7 on a first boot); p90 before 64-182, main 77-175.
The run-to-run spread on this machine today is ±25 %, so I also measured off the GPU: `tools/_rideCost.ts` (new; the
rideOnSections harness on the worker's coast-seeded field, the same file run in each tree; `ridecost-*.txt`).

**The pass that grew is the board's water, not the ribbon, the sheet or the coast textures.** Per riding frame (3 runs
each): `sectionFrameKnots` 22.9 -> 42.3 ms, `sumWaves` 14.4 -> 31.0 ms; spray births 7.5 -> 11.9 ms; the ribbon's own
trace 6.8 -> 4.5 ms (smaller); render about the same. Deterministic probe, per 60 Hz step on the board (7 ft, 15 s):

| | step ms (median) | wave sums / step | section curves / step | curves at curlWeight g = 1 | sums / curve | trace ms |
|---|---|---|---|---|---|---|
| before (4f70490) | 61.6-67.6 | 830-1165 (mean 993 over the first 3.5 s) | 6.5 | 4.9 | 152 | ~17 |
| main | 83.8-105.3 | 1350-1540 (mean 1411) | 7.3 | **0.0** | 193 | ~17 |

**Why.** The station nearest the board (`ridecost-near-*.txt`): on main she rides the **standing wall 1.0-1.6 s ahead of
the curl** for the whole pass (tb null, until 1.0-1.6 s, phase 0.29-0.40 < pitching 0.5), so every section she reads has
g < 1 and R10a's exact skip (the 11 swell reads skipped at g = 1, ride-framerate Task 15) never applies; each curve costs
~27 % more sums and she spans one more curve. Before (old peak), the curl caught her 1.5 s after the pop-up (tb 0.59 ->
2.12 s, phase 0.83 -> 1.06): she rode inside/behind the broken section at g = 1, the cheap case. That is the R3 ride
(the 14 s held line) costing what an honest wall ride costs, not a count that grew. The same code runs both trees.

**No bounded change meets the bar.** Nothing to cap or cull that is not the board's water itself: the curves read are
the two stations either side of each query point (sectionWater), and each needs its knots' sheet reads at g < 1. The one
bounded saving found is the spray births (+4.4 ms/frame on main: the longer breaking line within 250 m of the new tip);
removing all of it would leave main at ~58-60 ms, still over 50.6. The p90 <= 60 bar is not met by the pre-merge tree
today either (64-182 ms).

**Ruling wanted (one line each):**
- **A (Opus recommends):** accept the cost as the honest ride; re-pin the frame bar to a fresh-main measurement (riding
  median ~64 ms, p90 ~80-140 ms on this machine) and keep Andrew's 2026-10-08 "ship at this frame rate" ruling as the
  governing one. Costs nothing in looks or feel.
- **B:** the <= 2 cm approximation Andrew has not yet approved (e.g. keep each station's knot reads across frames, or
  thin the curves): back near the bar, costs up to 2 cm normal distance in the board's water (ride feel, not the lip's
  look); his call, not ours.
- **C:** cull the spray births beyond the camera's reach (bounded, exact for what is seen): ~-4 ms/frame, does not reach
  the bar alone; can go with A.

Evidence: `evidence/shelf-polish/frames-baseline.txt`, `ridecost-{before,main}.txt`, `ridecost-near-{before,main}.txt`;
probes `tools/_rideCost.ts`, `tools/_rideProfile.mjs --counts` (V8 call counts per frame; at the ride's start the counts
are equal in both trees, it is where she rides that differs).

**RULED (Fable, 2026-10-10), Task 1: A + C.** The diagnosis holds: the code is the same in both trees, the cost is the
honest ride (she holds the standing wall 1.0–1.6 s ahead of the curl for the whole pass, so the fully-curled shortcut never
applies), and no count grew. So:
- **A:** the frame bar is re-set to a fresh main measurement on this machine: riding median ≤ main's median × 1.10 from
  Task 0's own table (state the number); the p90 bar is dropped for this segment (unmeasurable at ±25 % on a loaded
  machine; say so in the evidence). Andrew's 2026-10-08 "ship at this frame rate" ruling governs.
- **C:** cull spray births beyond the camera's reach, provided a down-the-line frame at Pumping t+3 is pixel-identical in
  the ribbon region (or the differing pixels are named and are outside the lip). Measure with `_rideCost.ts` before/after.
- **B is NOT taken** (Andrew's call: it changes feel). Carry it to the handover for him as "a 2 cm approximation of the
  water under the board would buy ~20 ms per step", with one more candidate for a later perf segment: an exact
  shortcut for the un-curled standing-wall section, the twin of the fully-curled one (`sectionFrameKnots` on a held
  section reads the same wall every frame: cache the knots per station while `until` holds).
- The ribbon's trace cap `TAPER_NEAR_M` (250 m from the tip) noted for Task 3: the inside leg's closeout lies at 263–297 m,
  so Task 3 raises or re-anchors it, and re-measures with `_rideCost.ts`.
Proceed: Task 1 step 2 (C), then Tasks 2–8. Next STOP: after Task 3 (the stand frames).
