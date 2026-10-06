# R3, staying on the wave (2026-10-07)

Follows R2 (merged to main 44e1377). Written by Fable for Opus; Andrew reads first. One segment: the ride test made
honest, a table of what decides whether she stays in front of the crest after the pop-up, the one fix that table points
at, and the in-tube bails named. "One body", the camera and "feel" are not in here; see Out of R3.

## Why

R2 finished the take-off: caught, carried, through the pop-up and into the tube at every size and level, and her wave
no longer vanishes under her. But R2's own evidence says the ride after the pop-up is not yet hers:

1. **The ride test does not test the ride.** Its line is 88° off the swell, so her speed along the wave's travel is
   ~0.3 m/s against a crest at 10–11 m/s. At every size and level she is over the back within ~1 s of the pop-up
   (`ahead` < 0, `up` ≈ +0.6 H, lift 0) and the 10–14 s "rides" are the board coasting ~100 m behind the wave to the
   stall rule. The 5 s gate and R2's end assertion (`herLive > 0 || …`) both pass on that coasting. Opus's final
   reviewer called it: an honest gate turns the four cases red.
2. **Live, the pop-up's timing decides the ride.** At 8 ft a pop 0.4 s (real) after the catch rode 11 s and was on the
   back by +1.4 s (`live8/8-ride1.4.png`: standing on flat water, the wave running off to her right); a pop on the catch
   frame rode 22 s to a bail deep in the tube. The 6 ft beginner (0.4 s pop) dropped into the tube and was left behind
   by ~+4 s. The live bot aims 30° off the travel; with that line, the intermediate at 6 and 7 ft stays in front
   (`ah` ≈ +2 m) for 13–19 s.
3. **The rides that do stay end with a bail while still in front of the crest** (live6 +9.9, live7 +15.9, live8pop0
   +18.6), and the live log has no foam/steep/onSection, so what threw her is not known. The rows before each bail say
   something: at 7 and 8 ft her `y` jumps 1.7 → 3.6 → 4.0 m and 4.2 → 5.2 m with the nearest station's H down to 2.0 m
   and `tb` 3.1–3.5 s (late in the section's life); at 6 ft she sinks 1.5 → 1.0 m at 11 → 9.6 m/s on a station with H 2.4.
   Those read as the wave closing out on her, which is a real end. R3 must say so with the numbers, not guess.

The physics behind 1 and 2: to hold a place on the face her velocity's component along the wave's travel must equal c.
At 12 m/s against c 10 that is a line 33° off the travel; the live bot's 30° is that line. In `ride` phase nothing but
gravity on the face supplies that component (the carry stops at the end of the pop-up and the drag is against the
sheet's water, about c/3), so whether she keeps up with the crest depends on the slope under her in the first second
and on where the pop-up left her. R2's probe says a 0.4 s later pop leaves her lower and slower on a gentler face.

## Constraints

- R1's reef and onset are kept: nothing under `src/seabed`, nothing to `breaking.ts`'s parameters, `flowFromEta`,
  `sets.ts`, `crestTrace.ts`.
- The ride's drag in `ride` phase stays against the sheet's water (Andrew 2026-10-04: dragging against water carried
  with the wave ate the drop's speed). `PLANE_DRAG`, `RAIL_KEEP`, the stall and wipeout rules, `POPUP_S`, `CREST_CARRY`,
  `CARRY_TAU_S`, `ridePose.ts`, the camera: unchanged. `MAX_SECTION_SLOPE`, `withSections`: unchanged.
- No new blend, fade, σ or `min()`. No new constant without the probe row that sets it.
- Dials are tried once; a change that misses its gate at the first value leaves its trace in the commit and the handover.
- Measure before changing: §1 (the honest gate, expected red) and §2 (the table) come before §3.
- `npx tsc --noEmit` clean at every commit; probes in `tools/_*.mjs` or env-gated vitest files, never `src/_scratch`.

## 1. The honest ride test

**Design.** `rideOnSections.test.ts` rides a surfer's line and is gated on being in front of the crest.

- The line: `LINE_OFF_DEG` = 35° off the swell heading toward the left (the sign the test has now; 88 → 35), the live
  bot's 30° plus the margin the physics above gives at 12 m/s.
- Per step, `ahead` (m): the nearest live station of her wave within `MAX_ALONG_M` along the crest, as the R2 probe
  measures it (`dx·nx + dz·nz` from the water's Lagrangian label, + shoreward). No station in reach → `ahead` undefined.
- `heldS`: seconds in `ride` phase with `ahead` > 0. The gate: `heldS` ≥ 5. (`onSection` is not the gate: a section
  spans the back of the wave too.)
- The end: foam > 0 or `onSection` at the last step, or `rodeS` ≥ 15. R2's `herLive > 0` clause goes (it is what let
  coasting pass). A stall behind the wave is not a real end.
- `rodeS` > 5 and no wipeout stay.

**Target.** The four cases run and their numbers go in the handover (line, `heldS`, `rodeS`, the end, `ahead` at the
pop-up and at +1, +2, +3 s of riding). Red is the expected result at this step and is committed as red; green here
without §3 means the line alone was the whole problem, and §3 is then skipped (say so).

## 2. What decides it: the table

**Design.** `takeoffProbe.test.ts` gains two env dials and prints the same columns as R2 plus **along** (her velocity's
component along the wave's travel, m/s, beside c) and **held** (cumulative seconds with `ahead` > 0 while riding):

- `PROBE_RIDE_LINE` = degrees off the swell heading, comma list (default the test's 35).
- `PROBE_RIDE_POP` = pop-up rule, comma list: `slope` (the test's rule, slope > 0.6) or a number (seconds after
  `caught`, sim time).

Rows at the catch, the pop-up, every 0.5 s of riding for the first 4 s, then every second, and the moment `ahead`
first crosses 0 (a row with the event `behind`), with `along`, `c`, slope, lift, `sec`, `up` on that row.

**Runs.** 6 and 8 ft intermediate and 6 ft beginner, lines {30, 45, 88} × pops {0, 0.4, slope}: 27 runs (an hour on
the CPU; run in the background while §1 is written). The table goes in the handover trimmed to the pop-up row, the
`behind` row (or "stayed") and the end.

**Read it, three sentences, before §3:** (i) which line holds `ahead` > 0 longest at each size, and whether 35 is the
test's right line; (ii) the pop delay's effect: does a later pop leave her lower (`up`), slower (`along` vs `c`), or on a
gentler face (slope) at the pop-up row; (iii) the `behind` row's signature: at the moment she falls behind, is she on a
section with slope ≥ `catchSlope` and lift > 0 with `along` < c (the face is under her and she is simply slower than it:
§3's case), or is she at the top (`up` ≥ 0.5 H, lift 0: she climbed, and it is the line or the steer), or on the sheet
(`sec` n: the section ended under her, a §4 question)?

## 3. The face carries her riding, if (iii) says so

**Design.** Only if the `behind` signature is the first one (on the face, lifting, slower than c). Then the one-way push
of R2 §2 applies in `ride` phase too, on the drawn face: `faceCarry = b.phase === 'ride' && w.onSection === true &&
slope ≥ tune.catchSlope && liftAt(w, heading) > 0`, and the push block runs when `carried || faceCarry`. **The drag's
reference does not change**: in `ride` it stays the sheet's water (`carrying()` and `ux/uz` are untouched; the new flag
gates the push only). Physically it is the same water the catch rides: on a breaking wave's face the water near the
crest runs with it, and a board slower than it along the travel is pushed up to it. One-way, so a bottom turn or a
cutback loses nothing to it; at the top (lift 0) or on the sheet it is off, so going over the back is still possible.

**Target.** `ridePhysics.test.ts`: riding on a 0.5 face flagged `onSection` at 0.5 c along the travel is pushed toward
0.85 c over `CARRY_TAU_S`; the same face without `onSection` is not; the same section face with lift 0 (nose along the
crest, slope across her) is not; already at 0.95 c, not slowed; a `ride` step's drag is against `w.ux/uz`, not the
crest's water (her along-the-line speed on the sheet decays by `PLANE_DRAG` alone, the R2 pop-up-line test's twin for
`ride`). Then §1's test: 4/4 green at the first value (no new constant: `CREST_CARRY` and `CARRY_TAU_S` are the dial).
If a case stays red, its row from §2 goes in the commit and the handover; do not search for a value.

**If (iii) is the second signature** (she climbed to the top), §3 is not the carry: write what the table shows about the
steer (the test's `-err / 30` toward a fixed line, versus the live bot's aim relative to the travel) and stop; the fix
is the test's steer, in the test. **If the third** (the sheet under her), stop and hand it to §4.

## 4. The in-tube bails, named

**Design.** `_takeoffLive.mjs` logs per row `foam`, `steep` (|∇y| of the water under her), `sec` (`onSection`), and at
the nearest station `tb`, `until`, `A` and `settle` (`settleSpan(H, p)`); at a `bail` it also pushes the R2 bot's
trace line. Then the three bails (live6, live7, live8pop0 re-run with `--until=20`) are each named from the rows:
**closeout** (`tb` ≥ `settle`, or foam > `WIPEOUT_FOAM` on the section: the wave ended on her: a real end), or
**thrown on the sheet** (`sec` n with `steep` > `WIPEOUT_SLOPE` and `tb` < `settle`: the section ended under her while
the wave still broke: not a real end), or something else, written down.

**Target.** Three named bails in the handover with their last three rows. No fix in R3 unless all three are "thrown on
the sheet" with the same cause and it is one rule in `sectionWater.ts` (then: trace, one test, one change, and the
R2 §4 constraints on the cap). Otherwise it is the first item for R4.

## 5. Evidence

On Andrew's PC against the dev server on 5173, after §3:

1. Live: 6, 7, 8 ft intermediate and 6 ft beginner, `--aim=30 --until=20`, pop 0.4 (the game's real case) **and** 8 ft
   and 6 ft beginner at `--pop=0`. Each: in front of the crest (`ah` > 0) from the pop-up until the end, no "left
   behind" paddle; the end a named closeout or the window. The two frames per run, as R2.
2. §1's four cases green (or their rows), §2's table, §4's three named bails.
3. tsc and the suite diff: only `rideOnSections` names may change; nothing new.

## Out of R3

One curl per wave on one clock (one body). The camera (caught/pop-up frames of water only; the drop's look). Feel:
board weight, damping, pose snaps. Whether `POPUP_S` or the pop-up's hint should follow the face (the game may want to
tell the player *when* to pop: R4, after the table says how much it matters). The lip's flat slab (bot 6 ft +3 s). The
walk gaps and `traceMs` minors from R2's review.

## Handover

As R2: `docs/superpowers/handover/<date>-r3-opus.md` and `-r3-fable.md`. Branch `r3-staying-on` from main (44e1377 or
later); push; do not merge without Andrew's say-so.
