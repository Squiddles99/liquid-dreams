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

### Task 1 as ruled (Opus, 2026-10-10, second run)

- **C, taken in its exact form.** `breakEmitters` framed every breaking station (59 a tick) to decide which emit (~20). The
  frame's timing and weights (prog, weight, rho, tauLand) read no sheet, so they are tested first (`wombSection.sectionTiming`)
  and only emitting stations pay for the frame. Off-GPU, same process (`_rideCost --spray --old`): **41.5 → 14.0 ms per 20 Hz
  tick, 0 of 170 ticks differ (exact JSON)**. So no camera cull: the ruling's pixel gate is met by identity, and a camera
  cull would have kept 34 of 59 stations (less saving) and cut the impacts the sound hears behind the camera
  (`App.updateSound` reads the same emitters). `evidence/shelf-polish/ridecost-spray.txt`.
- **A, the bar 70.4 ms (Task 0 main median 64.0 × 1.10): not demonstrable today.** Another session's Blender renders
  (`tools/hero/build.py`, all cores) ran on and off 02:33–04:00. Clean interleaved runs: main's code 59.6 / 81.1, this
  branch 80.2 / 56.9 / 81.6 (`frames-task1.txt`). The ~7 ms in-game saving is under the spread; main's own code misses the
  bar today too. Ruling wanted at the end of this STOP (one line).
- **B carried for Andrew** (as ruled): "a 2 cm approximation of the water under the board would buy ~20 ms per step"; and a
  later perf candidate: an exact shortcut for the un-curled standing-wall section, the twin of the fully-curled one
  (`sectionFrameKnots` on a held section reads the same wall every frame: cache the knots per station while `until` holds).

### STOP at Task 2: the seams are not where the spec expected, and neither has a bounded record fix (Opus, 2026-10-10)

Probes `tools/_curlSeams.ts`, `tools/_untilJumps.ts` (+ a probe-only `ReefFieldRequest.onsetDebug` sink: the first march's T,
the curl's T′ and each node's breaking line); `evidence/shelf-polish/curl-seams.txt`.

**crestTrace "one curl, one clock" (6 ft: 9, 8 ft: 1).** Not at the ledge's turn north, not at the tip: every violation is
in a second drawn run on the **inner shelf inside the right, 226–250 m from TIP** (x −45…+11, z +186…+222; station H
1.5–2.2 m; the trace stops at TAPER_NEAR_M 250). Two things there:
1. **The reader's toRun on a plateau.** The wave reads levels k, k+1 (6 ft: 5 and 6). Where a ray's running maximum sits
   between Q[k] and Q[k+1], `onsetLevel` takes the crossing of the wave's own level as happening now (hi = −D_k). On a ray
   whose running max plateaued just under Q[k+1] long ago that is wrong by up to tb_k; the next ray, a hair over Q[k+1],
   reads level k+1's clock. 6 ft arc 182: run 0.220 < Q6 0.225 → tb 0.58; arc 183: run 0.229 → tb 2.53 (level 6 broke 13 m
   back, 1.96 s ago). 8 ft arcs 196/197: run 0.155 / 0.158 straddle Q5 0.156 → tb 0.10 / 1.13.
2. **A hooked line.** Level 6's line there (38 nodes, first break (−17.8, 230.3)) curls north then turns east under the
   crest; T′ is monotone along the line (the bake is right) but the crest maps back onto the hook out of order (T′ 5.31 →
   4.50 between arcs 182 and 183).

**reefField "until carries the hold back along its ray" (8 jumps, 0.020–0.040 s, bar 0.02).** The 8 nodes are 5.7–21 m
along the left from the tip, at the onset band's edge, held **5.8–6.0 s, the PEEL_MAX_HOLD_S cap**, with the hold across
the ray stepping 0.13–0.31 s per cell (the bilinear one cell back mixes it). They are held at the cap because the test
field runs peel 1.7 and the level's one line now first breaks at the **right's far south end** ((−158, 237), T ≈ −10 s), so
the stretch from there reaches the left's first metres at ~7 s. The game runs peel 1 (no stretch): nothing is held there in
play. The test's premise (held nodes stretched from the peak) is the old peak's.

**Why no bounded fix.** (1) needs the record to know when the running max last rose (a new per-level record field: CPU
and GPU record layout, every reader) or a change to how `onsetLevel` reads between levels: the water's breaking clock
everywhere, not this region's. (2) needs the curl ordered along the crest, not along the line. Neither is "fix the
record" in an hour, and neither is at the Womb's ridden line.

**Ruling wanted (one line each):**
- **crestTrace:** (a, Opus recommends) the check covers the Womb's run (the run holding the take-off, or stations within
  TAPER_NEAR_M − 30 m of the TIP), with the inner-shelf reform inside the right named as carried in the test comment; or
  (b) a segment for the plateau-aware toRun (record field + GPU), Andrew's call as it changes the water's timing.
- **reefField until:** (c) rewrite the test's premise for the real shelf (the held nodes it checks are those of a section
  whose own first break is on the left, or run it at the game's peel 1 with a held pocket), bar unchanged; or carry.
- **Task 1's frame bar:** accept the exact off-GPU saving as the gate today (main's own code misses 70.4 today), or
  re-measure on an idle machine before Task 3.

**RULED (Fable, 2026-10-10), Task 1 gate + Task 2:**
1. **Task 1's gate is met by the exact off-GPU saving** (spray lip frames 41.5 → 14.0 ms per tick, 0 of 170 ticks differ).
   The in-game frame bar is unmeasurable on this machine today (another session's Blender renders; main's own code misses
   its own bar); say so in `frames-task1.txt` and move on. Task 8 re-takes one `_rideProfile` run if the machine is idle.
2. **crestTrace "one curl, one clock": limit the check to the Womb's ridden run** (the run holding the take-off, stations
   within 220 m of the tip), bar unchanged (0 violations there). The inner-shelf area inside the right, 226–250 m out at the
   trace's cap, is named in the test's comment as carried: the level read's "crossing now" assumption on a ray whose running
   maximum plateaued just under a level, and the level-6 line hooking under the crest. A plateau-aware level read changes
   how the water's breaking time is read (CPU + GPU record layouts): **a separate segment, Andrew's call**; put it in the
   handover's "for Andrew" list with your example (arcs 182/183).
3. **reefField "until carries the hold": rewrite the premise for the real shelf, bar unchanged.** The game runs peel 1; the
   test runs peel 1.7, which makes the right's far south end break ~10 s early and holds the left's first 6–21 m at the 6 s
   cap. The test pins the game's field (peel 1): no node on the ridden run held at the cap, jumps ≤ 0.02 s. A second case
   at peel 1.7 may stay only as an explicit "the cap binds here" expectation, not as a red.
4. The `onsetDebug` sink stays if it costs nothing in play (assert it is undefined on the game's request path); otherwise
   remove it after the probe.
Proceed: apply 2–3, Task 2's gate, then Task 3 and its STOP (the stand frames).

### Task 2 as ruled (Opus, 2026-10-10, third run) — 05a9cfc

- crestTrace "one curl, one clock": stations within 220 m of the tip only; 6/8/12 ft green (178/211/262 broken steps, 0
  violations); the inner-shelf plateau read and the hooked level-6 line named in the test's comment as carried.
- reefField "until carries the hold": the game's field (peel 1, refraction floor). until = −tb on the bake (2654 held nodes
  within 220 m, the curl's, max 3.47 s, none near the 6 s cap); the carry back along the ray on the smoothed field (as the
  game reads it; smoothFieldAmplitude smooths tb and until on their own masks): 0 over the bars. Peel 1.7 kept as an
  expectation (213 nodes at the cap). Bars unchanged. Probe-only note: the UNsmoothed peel-1 bake has 8 one-cell jumps
  (0.03–0.43 s) at small-wave levels 7–9, 96–213 m out; the game never reads it.
- onsetDebug kept: typed out of the game's request (fieldWorker.GameFieldRequest, `onsetDebug?: never`).
- `_curlReport` (CURL_V=40) = the retune's exactly: Solid/Pumping/Big peel 11.3/11.7/11.9, hollow 0.56/0.81/1.00, 0 held.
  `evidence/shelf-polish/task2-gate.txt`.

**For Andrew (carried, a separate segment):** a plateau-aware level read. Where a ray's running maximum plateaued just
under the next level, the read takes the crossing as "now": 6 ft, inner shelf inside the right, arc 182 (run 0.220 < Q6
0.225) reads tb 0.58 s, its neighbour arc 183 (run 0.229) reads level 6's 2.53 s, a 2 s jump in 1 m of crest. Fixing it
changes how the water's breaking time is read (CPU + GPU record layout).

### STOP at Task 3 (Opus, 2026-10-10) — 46c60a8: for Fable's look

**What it was.** The beige quads are not the Womb's own wave: at t+3/t+5 they sit on the PRECEDING set wave (Pumping 3.41 m,
Huge 6.34 m, 15–17 s earlier) closing out along the inside leg north of the turn, breaking 217–402 m from the tip (its curl
runs north at ~30 m/s), its wall standing to ~416 m. The trace stopped at its reach, TAPER_NEAR_M = 250 m.

**What changed (the drawing only).** The crest walk carries on past the 250 m reach on the inside leg (north of the turn,
`crestTrace.insideLeg`) to the line's own end; the section's hollow fades to 0 from 10 to 30 m past the turn (the closeout,
whitewater by tb as before). TAPER_NEAR_M itself (the water's crest taper) is untouched; the sheet's lateral taper is 1.000
at every inside crest point probed, so the ribbon and the sheet agree in size there.

**The ribbon run's new end** (inside-leg run, tools/_ribbonRun.ts): Pumping t+3 248 → **380 m** (48 → 139 stations at 2 m),
t+5 248 → **399 m**; Huge t+3 248 → **411 m**, t+5 none → **427 m** (263–427 m). Every other run unchanged.

**Ride cost before → after** (`_rideCost --s=14 --spray`, HEAD vs new, same Node): 7 ft step median 17.9 → 17.7 ms, 12 ft
16.1 → 16.4 ms; the ride is identical (same positions and sums at every step); trace 3.5 → 3.7 ms, spray tick 2.86 → 3.27 /
3.16 → 3.53 ms (40–50 more stations). In game (`_rideProfile`, Blender again on and off): HEAD 78.9 ms, new 76.9 (dirty) /
56.0; the 70.4 bar is unmeasurable today, no regression visible.

**Frames to look at** (`../liquid-dreams-captures/shelf-polish-2026-10-10/task3/`):
- `Pumping-tide0-stand-404.17.png`, `-406.17.png`, `Huge-tide0-stand-408.31.png`, `-410.31.png` (+ the `-dtl-` frames at the
  same times); before/after strip against womb-retune's task6 frames: `stand-crops-before-after.png` (rows: before, after ×
  Pumping t+3, t+5, Huge t+3, t+5). The quads are gone in all four; the ribbon draws the inside closeout.
- Look item: at Huge the far closeout shows **stepped vertical segment edges** (`huge-closeout-zoom.png`), likely the far
  stations' wide spacing (MAX_SPACING_M by camera distance). Ruling wanted: accept, or cap the spacing on the inside leg (cost).

**Checks.** GPU self-test breaker 14/14; ribbon 6/7, the red "the footprint covers the stations' inner strip" is identical on
HEAD's crestTrace (5 stations at (58, −12), (−28, 19), not on the inside leg): carried. vitest crestTrace / BreakingRibbon /
sprayEmitters / wombSection: 15 red, all in the baseline or the merge's carried list, 0 new.
`evidence/shelf-polish/task3-ribbon-run.txt`.

Observation, not changed: the right's inner shelf (z +200…+280) and the offshore set wave on the right also run to the
250 m reach (at unlimited reach they continue to 308 m and 265 m). No quads were reported there; the same rule could
extend to them if the frames show one.

**RULED (Fable, 2026-10-10), Task 3: accepted; one bounded follow-on.** The before/after crops show the quads gone at all
four moments and the closeout ribbon in their place; the ribbon's new run end (380–427 m) and the ride cost (identical
steps, +0.2 ms trace, +0.4 ms spray) are fine. The Huge closeout's stepped segment edges (`huge-closeout-zoom.png`) read as
a dark block from the stand: **cap the station spacing on the inside leg at the near run's spacing** (a drawing change),
provided `_rideCost.ts` shows ≤ +1 ms per step at 12 ft and the stand frame at Huge t+5 shows a continuous edge; if the
cost is over that, accept the steps and carry them with the number. Re-capture Huge stand t+3/t+5 after. Then Tasks 4–8
with no further STOP: end with the two handovers and the captures, pushed, not merged.

### Tasks 3 (follow-on) to 8 (Opus, 2026-10-10, fourth run): 9eecedb..HEAD

Tasks 5 and 7 were done on this branch by this run (the coordinator's side-branch plan was retracted; nothing merged).

**Rulings I made (one line each).**
- Task 3 follow-on: the inside-leg spacing cap was within cost (+0.2 ms/step at 12 ft) but did not give a continuous edge
  (steps unchanged at 2–3× the stations; the section numbers are smooth at 3 m), so it is **reverted** and the steps carried;
  2 m was not usable (a run cut at 279 m by toCrest's tolerance), 1.5 m was the one tried.
- Task 4: tests about what the player sees read the game's sheet options (lean, no pile); the breakingField pile tests'
  stale (0, 0) tip coordinates became TIP (intent unchanged); the spray's throw moment moved for all T_THROW users.
- Task 5: the set's breaking depth is the unamplified set height's (setBreakingDepth), read along each row of the built
  coast map from the waterline; a focus (amp > 1) beyond it stays a red, named, not absorbed into the band.
- Task 6: `tools/_fieldCost.mjs` deleted (its A/B is gone); the dev panel's Coast folder kept (dials, no on/off).
- Task 7: re-aim, not delete: a position (BOMBIE_CENTRE) and a gate (coastBreaking.footprintBreakHeight on the coast field);
  the per-wave burst rule unchanged inside the gate (thresholdFt default stays 6).

**Carried items (measured value, class).**

| item | measured | class / why |
|---|---|---|
| breakingField: highest water moves with the wave | 4 steps (bar 2), the tip's ray only | (b) the highest water stays 3 m behind the crest for 1 s at the tip (4.7–5 m of water behind, 3.5 m under the crest); same on the game's sheet; the water's own shape |
| coastBreaking: 8 ft no closeout | 146 cells (was 167), 69–189 m off, z −988…−850 (+3 at z 450) | carried (Task 5): the hand-set 9 m inner shelf under a coast-field focus, amp 1.77–1.92 (2.54); a bed fix (deeper shelf there, or the focus's source) |
| Huge far closeout's stepped edges (stand) | unchanged with spacing 1.5–2.8 m (was 3–6.5) | carried, not diagnosed; lead: the far sheet grid beside the ribbon (a hide test names it) |
| The Bombie from the lookout | 22 px in 2 rows at 1 km on the glare | look item: it works (close frame), it barely reads from the stand |
| Earlier runs: spray frames | exact cull, 41.5 -> 14.0 ms/tick, 0 of 170 ticks differ | done; no camera cull; the in-game bar unmeasurable on this machine |
| Earlier runs: curl seams on the inner shelf | 6 ft arcs 182/183: tb 0.58 vs 2.53 s in 1 m | carried (plateau-aware level read, for Andrew) |
| Earlier runs: the ribbon's run onto the inside leg | run ends 380–427 m (was 248 m / none) | done (Task 3); trace +0.2 ms/step, spray +0.4 ms/tick |
| B: the 2 cm board-water approximation | ~20 ms per step | not taken (Andrew's call) |

Task 4's numbers: `evidence/shelf-polish/task4-bars.txt` ((a) closure 0.515 s -> bar 0.5, left peel 7.98 -> bar 7.5, pile
spread 6.5 % at a reef-head ray crossing -> 8 %; (c) terrace, pile growth, peak, lift, station ψ, spray throw). Task 5:
`task5-shore-band.txt`; Task 7: `task7-bombie.txt`; Task 3 follow-on: `task3b-inside-spacing.txt`.

**Full suite (2026-10-10 10:05–10:14): 2048 tests, 48 failed** (the merge's list: 2050 / 53). Against
`task6-fails-names.txt` (`evidence/shelf-polish/full-suite-diff.txt`):
- 17 no longer red: one-curl 6/8 ft and until (Task 2); terrace, closure, peak, lift, pile ×2, left peel, station ψ, spray
  mid-throw (Task 4); coastBreaking 8 ft under its old name (renamed by Task 5, still red); Fun ×3 (the Fun ruling, main);
  surferParams (main's re-pin).
- 12 newly red: 11 timeouts (RockMeshes, groundPatch, BreakingRibbon.limits ×5, wombProfile, shoreReef ×2, breakingField
  "the tide moves the break"), all green re-run alone; 1 = coastBreaking 8 ft under its new name (carried).
- The rest: the pre-retune idle baseline's reds, plus "highest water moves" (b).
- In-game frames: one `_rideProfile` (7 ft) at Task 8 ran DIRTY (another session's Blender, 65 % CPU): riding 132.9 ms;
  no idle window today.

**For Andrew.**
1. A plateau-aware level read (a separate segment: CPU + GPU record layout, the water's breaking clock): where a ray's running
   maximum plateaued just under the next level the read takes the crossing as "now": 6 ft, inner shelf inside the right, arc
   182 (run 0.220 < Q6 0.225) reads tb 0.58 s, arc 183 (run 0.229) reads 2.53 s, a 2 s jump in 1 m of crest.
2. Approximation B: "a 2 cm approximation of the water under the board would buy ~20 ms per step" (changes ride feel; not
   taken). A later exact candidate: cache `sectionFrameKnots` per station while `until` holds.
3. The 8 ft breaking on the inner shelf 1 km north (coast focus on the hand-set 9 m shelf): deepen the shelf there, or accept.
4. The highest water standing 3 m behind the crest at the tip for 1 s (the water's shape at the two ledges' meeting line).
5. Looks: the Bombie barely reads from the crew's lookout at 1 km; the far closeout's stepped edges at Huge.
6. Merge `shelf-polish` (pushed, not merged). Captures: `evidence/shelf-polish/captures.md`.
