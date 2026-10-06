# Fable → Fable: R1 + R1.5 merged, R2 written (2026-10-07)

For the next Fable session. The memory file `r1-the-ride.md` carries the state; read this, then the R2 spec and plan
only when Opus's R2 handover lands.

## Where things stand

- `main` 118b878: R1 + R1.5 merged (--no-ff) and pushed on Andrew's approval, 2026-10-06 night. Branch `r1-the-ride`
  left on origin. tsc clean after the merge.
- R2 written: `specs/2026-10-07-r2-take-off-finished-design.md` + `plans/2026-10-07-r2-take-off-finished.md`,
  committed on main (not pushed until Andrew reads). Opus works on branch `r2-take-off` from main.
- The old "R2 one body" (one curl per wave on one clock, zip the ribbon to the sheet, lip look) is **not** this R2. It
  is the next segment of its own; "feel" after that. Whether one body or the camera/feel comes first is Andrew's call;
  Opus's R2 handover is asked for a view.

## Two findings from the R1.5 logs that shaped R2 (verify them in Opus's evidence)

1. **Her wave lets go of her.** `live7/log.json` and `live8/log.json` both bail at sim +8.19: the row before, `near`
   (nearest live station of any wave) jumps from `al 0, ah 2.8, tb 1.4` to `al 32, ah 161, tb null` with a different H,
   and her `y` jumps −1.2 → +1.0. Every station of her wave vanished in one frame; she landed on the sheet under the
   barrel; `wipeout`. Three candidate rules in `traceStations`: (a) `traceWave`'s seed from the origin missing the crest
   60 m shoreward (`project(…, 0, 0, …)`, `inGrid`, `CREST_TOLERANCE_S`); (b) the `MAX_STATIONS` cut with the POV camera;
   (c) `alive` (`curlWeight > ALIVE_RHO`). The ride test's kickouts at 10–14 s are probably the same thing on the CPU.
   The R2 probe's station count tells (a)/(c) from (b).
2. **The bot's instant pop-up wipes out with foam 0** within 0.4 s of the crest's arrival at the spot, at 6 and 8 ft.
   Only `steep > WIPEOUT_SLOPE` (2.5) can do that, and only on the sheet (a section is capped at `MAX_SECTION_SLOPE` 2).
   So it is the sheet's pre-onset wall in the frame before the section draws. R2 §4 extends the section's cap to that
   moment (same cap, under the ribbon's reach of a station about to break), no blend. If Opus's trace says `onSection`
   true or foam > 0.5 instead, that ruling is wrong and the task stops: read the trace before anything else.

## Rulings in R2, and why

- **One-way carry** (`dv = vc − v·dir; if dv > 0 …`): the two-way relaxation braked her above 0.85 c and stripped the
  pop-up's line; one-way lets gravity take her through c and down the face. It is my bet for the beginner; the gate
  (2b) is only if the bet is short, and its value comes from the probe's table, not from guessing.
- **Measure first** (Task 1 before Task 2). The nine-row table (6/7/8 ft × 3 levels: ahead, up, station count) is cheap
  and answers the beginner gate, the drop's depth and the vanishing wave at once. Insist on seeing it in the handover.
- **Fix the rule, not around it** in Task 3: no "keep stations for N seconds" fade. Review Focus 4 guards dead waves.
- **The caught/pop-up camera showing only water** is out of R2 (camera work). The bot's third-person frames carry the
  evidence meanwhile.

## What to check when Opus's R2 handover arrives

1. Task 1's table present and read (three sentences in the probe commit).
2. `rideOnSections` 4/4, and the two intermediate cases end *really* (≥ 15 s, or foam/onSection at the last step).
3. Task 3's diagnosis names (a)/(b)/(c) with its evidence line; the crestTrace change is the one rule; the old
   crestTrace cases (spacing, gaps, determinism) still pass.
4. Task 4's trace line before the fix (`foam=0 steep>2.5 sec=false until≤…`); the bot at 6 and 8 ft rides ≥ 6 s.
5. Live 6/7/8 intermediate + 6 beginner: no `near.al` jump mid-ride; the beginner's +1 s frame is the one to look at.
6. Scope: nothing under `src/seabed`; `breaking.ts`, `sets.ts`, `flowFromEta`, `CREST_CARRY`, `CARRY_TAU_S` untouched;
   `crestTrace.ts` changed in one rule.
7. Suite diff: only `rideOnSections` 6 ft beginner leaves the list.

Then: merge is Andrew's call; recommend merging when 2, 4 and 5 hold.

## Budget note

This session: R1.5 review (two handovers, the carry diff, 8 frames, one ride-test run), the merge, and R2 (read the
R1.5 docs, ridePhysics, sectionWater, crestTrace's trace loop, the two capture tools, the live logs at the bail). The
live logs were the cheapest evidence of the session: `log.json` rows around an event beat any new capture. Keep asking
Opus for logs with `near` in them.
