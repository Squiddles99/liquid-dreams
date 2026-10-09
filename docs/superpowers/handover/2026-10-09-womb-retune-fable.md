# Womb retune: handover for Fable (stub, Opus 5.5, 2026-10-09)

## Task 1 ruling wanted (blocks Tasks 2-6): what does "the dial at the coast seed" fix — height only, or height and direction?

Plan Task 1.3 as written (implemented, tested, NOT committed: `coastFarField.ts` `ampRefDepthM`/`refDepthM`/`fluxRef`,
`coastField.ts` `seedDepth`, test in `coastField.test.ts`): the energy flux reference moves to the coast seed (29.7 m at
mid tide, x −1500, z 0) while Snell's p stays set in FAR_X0's 15 m, so angles are unchanged. Measured (first datum rows,
low tide, peak (0,0)):

| from | band | amp before | amp after (as written) |
|---|---|---|---|
| 202 | Pumping | 0.667 | 0.271 |
| 225 | Pumping | 0.725 | 0.515 |
| 247 | Pumping | 1.265 | 1.352 |

Amp goes DOWN at 225°, not up ×1.10. Why (`.superpowers/sdd/2026-10-09-womb-retune/seed-angle-check.mjs`, linear theory):
with p fixed in 15 m, the same swell in 29.7 m water is far more oblique (225°: 45° → 72° off the shore normal; 202°: past
grazing — that swell cannot exist at the seed), so cg·cosθ there is small and every amp measured against it shrinks. The
×1.10 estimate is pure shoaling for a square-on wave.

| option | what the dial means | amp at 15 m vs today (T 15) | arrival |
|---|---|---|---|
| A (as written) | height in the seed's water, direction in 15 m | 225: ×0.74, 202: ×0.40, 247: ×1.07 | unchanged |
| B | height by shoaling only (cg ratio, cosθ kept from 15 m) | ~×1.0 all | unchanged |
| C | height AND direction in the seed's water (a buoy) | 225: ×1.01, 202: ×0.80, 247: ×1.09 | 225° reaches 15 m at 32° off normal (today 45°): ~13° more square-on at the peak; breaks gate §6.1 and §1's fixed −22.9° |

Opus's lean: C is the only one that is a buoy's reading and energy-consistent (Andrew: "true to the scientific data"),
but it rotates the arrival the spec calls fixed, so it is your call (and possibly Andrew's). A makes 202° nearly flat.

**RULED (Andrew, in chat, 2026-10-09): option C.** The dial is a buoy reading: height, period and direction in the coast
seed's water. `computeFarField(..., { refDepthM })` sets both Snell's p and the flux reference there; with no coast it is
15 m as before (`?coast=off` unchanged). Spec §1's fixed −22.9° and gate §6.1's "angles within 0.1°" are superseded: the
datum table reports the new arrival.

## Task 2 ruling wanted: the reef pick

Evidence: `docs/superpowers/evidence/womb-retune/sweep.txt` (71 rows, 225° mid tide, coast-seeded, dial at the seed per ruling C;
bands Fun..Huge; coast field reused across rows, checked identical to a per-row rebuild on rows 0 and 22).

**No row meets every §3 target.** What the sweep says:

- **First leg (lever 1 works):** peel falls as leg 0 turns: today's 23.6° → 15.5–15.8 m/s (nothing offered after ruling C);
  30° → ~14; 34° → ~13.2; 38° → ~12.3; **42° → Solid 10.2, Pumping 11.5, Big 12.1, Huge 12.5**. At 42° with today's 3.5 m
  ledge the hollow pattern is the spec's: Solid (smallest offered) 0.54 soft, Pumping 0.86, Big 1.00; first break on the ledge
  (−4.5 / 0.0 / 2.5 m). Big 12.1 and Huge 12.5 sit just over the 12 bar (inside the select rule's 13).
- **Second leg (fails everywhere):** 30–80 m/s at every geometry tried: leg-1 offsets b0 −5 … −40 (leg 1 from 37° to 2°),
  face 10/15 × 10/15, shelf 4/5/6. The sharper the turn the slower it gets (b1 37° → 54–78; 22° → 39–48; 2° → 30–34), but
  never near 8–15: today's (23.6/14.6) gave 18 only because its first leg also ran 15.5. Lever 4 (shelf) does nothing to it.
  Spec §3 says report it: a slower second act does not come from these levers on the real shelf's arrival.
- **Leg 2** closes out (26.7–28.3 m/s) on every row. **The right** is unchanged by the north ledge (r0 starts −1.7 to −2.7 s,
  r1 −5.7 to −6.8 s, i.e. it stands up south first and runs to the corner at 22–27 m/s, a closeout, as today).
- **Ledge depth (lever 2):** 3.0/2.5 m make Solid hollow (0.63/0.93: the smallest band barrels), so 3.5 m stays.
- **Outer directions** (Pumping/Big at 42°): 202° first leg 7.0–8.0 m/s (slow, still breaking 28/28), 247° 14.1–14.4 (fast).
- Face 10/10 (row 63) brings Huge into the offer (12.5 → offered at ≤ 13) with peels 11.7–11.9, but Solid barrels (0.84).

**Opus recommends row 66:** leg 0 **42°**, leg 1 **12°** (today 14.6°, closest), ledge **3.5 m**, face/shelf unchanged:
`NORTH_LEDGE = [[0,0],[47,-52],[57,-98],[57,-450]]` (lengths kept). First leg 10.2 / 11.5 / 12.1 / 12.5 m/s at Solid /
Pumping / Big / Huge, hollow 0.54 / 0.86 / 1.00 / 1.00, first break 4.5 m inside / on / 2.5 / 4.5 m off; second leg 34–40
(closes out); leg 2 27–28; the right unchanged. Alternatives: row 49 (leg 1 22°: identical first leg, second leg 39–48)
or row 63 (face 10/10: Huge offered, smallest barrels).

Questions for the ruling: (1) the pick; (2) accept the second leg as a closeout on the real shelf (drop the "second act"
target), or ask for a new lever (e.g. a ledge segment set seaward, which the plan did not list); (3) Big 12.1 / Huge 12.5
against the 9–12 bar (the select rule's 13 offers them).

## Fable's finding on Task 2 (2026-10-09): the second leg is the beach, not the ledge

Probe (temporary `tools/_tmpLeg1.ts`, deleted; row 66's ledge, Pumping, 225°, mid tide): along leg 1 every ray breaks
**7–19 m seaward of the ledge, in 4.8–5.3 m of water, on a line at x ≈ 38–40 running due north**. The ledge's own τ along
leg 1 runs 19 m/s (geometry: c/sin α with α = 12° + 18.4°); the first-break times run 39 m/s because they are on that
north-running line, not on the ledge. That line is the Womb's beach ramp (`depthBg`: 1.2 m at 20 m off the beach, 4 m at
60 m, 7.3 m at 80 m, 11 m at 100 m, 15 m by 140 m), which `seawardDepth` lets cap the reef profile across the offshore band.
A Pumping set (3.8 m) breaks in ~5.5 m, i.e. ~70 m off the beach; Huge (7 m) in ~10 m, ~100 m off. Leg 0 at 42° already
touches it (s ≥ 60 m: breaks 1.5–5 m off the ledge). **So no ledge shape at the present take-off can carry a peel past
~x 40: the left runs out of water, not out of reef.** Lever 4 (shelf) could never touch it; nor could the curl.

The structural truth under it: on the real shelf the swell reaches the Womb ~18° off shore-normal. A left peels only
along a ledge heading downstream of the crest, i.e. north-east, toward the beach (bearing ≈ 42° for 10–12 m/s; a
north-west leg would make a right). Every metre of left costs 0.67 m of the distance to the beach. Today's take-off is
94 m off the beach, which is exactly where the beach ramp starts breaking a 7 ft set. On main the −33.5° arrival hid this
by letting a near-north ledge peel.

### The choice (Andrew's: it moves the Womb's geography)

| | take-off stays at (0,0) | take-off moves ~120–150 m seaward |
|---|---|---|
| the left | one ~70 m hollow section at 10–12 m/s, ~7 s, then the inside closes out (a slab) | a 150–200 m ledge at ~42°, ~14–18 s at 10–12 m/s, then the inside |
| paddle-out | 94 m (today) | 215–245 m (what a reef break is) |
| what changes | the ledge only (row 66-like) | the reef map's ledges, rock reach, warp centre; `SHORE_REEF_AT_MAP_M`-relative constants; the stand/crew/lookout aims and the lineup moments; the select-screen break map; the set lines' peak; every ride/reef pin |
| truth | honest but small | honest and the shape Andrew asked for (barrel along the line) |

Fable recommends the move: the ledge from about (−130, 0) to (−10, −135) at 42°, 180 m, then due north (the inside); the
right (south ledge) mirrored from the new tip and closing out as today; ledge 3.5 m, face 15/15 kept (row 66's hollow
pattern). Opus to sweep only the take-off x ∈ {−100, −130, −160} and the ledge length {150, 180, 210} on that bearing,
measuring peel, hollow, where the inside takes over, and the right. Task 2's sweep stands as evidence; row 66 is the
fallback if Andrew keeps the take-off.

Andrew's Task 1 ruling (option C) is confirmed from the datum: at 225° the peak amp is back to ~1.0 (Pumping face 6.9 ft),
arrival −18.4°; at 247° −7.8°, amp 1.33; at 202° −22.6°, amp 0.57. The dial is the buoy.

**RULED (Andrew, in chat, 2026-10-09): move the take-off seaward.** Task 2b below is the instruction; then Tasks 3–6 run as
written on the new reef.

## Task 2b ruling wanted (Opus, 2026-10-09): no row passes; one near-pass

Code (no game change yet: `TIP` stays [0, 0]): `ReefParams.tip`, `TIP`, `LEFT_BEARING_DEG`, `leftLedgeFrom`, `rightLedgeFrom`
(wombReef.ts); the warp's 15 m taper and the sand pockets follow the tip (bathymetry.ts); the reef field's τ is normalised
at `TIP` (reefField.ts). Sweep: `tools/_reefSweep.ts --tip [--bearings= --tips= --lens=]`, coast map rebuilt per row, times
on the tip's clock. Evidence: `evidence/womb-retune/sweep-tip-{0,1,2}.txt` (the plan's 9 rows at 42°), `sweep-tip-b-*.txt`
(follow-up: bearing 44/46/48 at tip −100/−130, 180 m), `sweep-tip-leave.txt` (the leave measure re-run).

**What the move fixed:** at every tip, Pumping breaks within ~4 m of the ledge along its whole length (150, 180 and 210 m),
the beach ramp never takes over (Fable's finding holds: the left now runs out of ledge, not water). Big/Huge break a steady
4 / 7 m out on the face along all of it. Hollow: Solid 0.48–0.56 (smallest, < 0.6), Pumping 0.86–0.90, Big/Huge 1.00. The
right closes out (r0/r1 −22…−24) at every row. Fun (2 ft-ish) is never offered at −100/−130: it breaks 10–60 m inshore on
the shelf (at −160 it is offered, peel 9–10, hollow 0.72–0.77, which fails "smallest < 0.6" and makes Solid a mid at 0.5).
The ledge length barely moves anything (peel ±0.3): 180 m is the middle.

**What fails:** the peel bar 9–12. At 42° Pumping 12.0–12.3, Big 12.3–12.5, Huge 12.4–12.6 (every row). Turning the ledge
further from the crest slows it but flattens Pumping:

| tip x | bearing | Solid peel/h | Pumping peel/h | Big peel | Huge peel | 202° Pump/Big | 247° Pump/Big | verdict |
|---|---|---|---|---|---|---|---|---|
| −100 | 42 | 11.9 / 0.49 | 12.2 / 0.86 | 12.4 | 12.5 | 9.5 (64/72) / 11.0 | 14.1 / 14.3 | Pump, Big, Huge peel |
| −130 | 42 | 11.9 / 0.54 | 12.2 / 0.89 | 12.4 | 12.5 | 10.0 / 11.3 | 14.2 / 14.3 | Pump, Big, Huge peel |
| −100 | 44 | 11.6 / 0.51 | 11.9 / 0.83 | 12.2 | 12.3 | 8.8 (60/72) / 10.6 | 13.8 / 13.9 | Big, Huge peel |
| −130 | 44 | 11.7 / 0.55 | 12.0 / 0.88 | 12.2 | 12.3 | 9.3 / 10.9 | 13.8 / 13.9 | Big, Huge peel |
| −100 | 46 | 11.3 / 0.55 | 11.8 / 0.79 | 11.9 | 12.2 | 8.2 (57/72) / 9.8 | 13.4 / 13.6 | Huge peel, Pump hollow |
| **−130** | **46** | 11.3 / 0.56 | 11.7 / 0.81 | 11.9 | **12.1** | 8.7 (58/72) / 10.1 | 13.5 / 13.6 | **Huge peel only (0.1 over)** |
| −100 | 48 | 11.0 / 0.54 | 11.5 / 0.75 | 11.7 | 11.9 | 8.6 / 8.7 | 13.1 / 13.3 | Pump hollow |
| −130 | 48 | 10.8 / 0.51 | 11.5 / 0.74 | 11.7 | 11.9 | 8.5 / 8.8 (65/72) | 13.1 / 13.3 | Pump hollow |

(180 m rows; all four bands Solid–Huge offered in each; 247° runs 13–14 m/s in every row, 202° Pumping does not fully break
at −100.)

**Opus's recommendation:** tip (−130, 0), 46°, 180 m (to (−1, −125), then north): the only near-pass, Huge 12.1 against 12.
At −100 the same bearing loses Pumping's hollow (0.79) and 202° Pumping breaks only 57/72. Alternatives: accept 42°/44° at
−100 (smallest move, peel ~12.2–12.5 at the big bands) or read the bar as "≤ 12.5 at Big/Huge".

Questions: (1) the row; (2) Huge at 12.1 (or the bar); (3) Fun not offered at −100/−130 (the select list then starts at
Solid). **STOPPED** before Task 2b step 3 (no constant changed).

**RULED (Fable, 2026-10-09), Task 2b:**
1. **The row: tip (−130, 0), bearing 46°, 180 m** (to (−1, −125), then north). Set `TIP`, `LEFT_BEARING_DEG`, `LEFT_LEDGE_M`
   to it; ledge 3.5 m, face 15/15, shelf 4 unchanged; the right translated to the tip (it closes out at every row: good).
2. **Huge 12.1 is accepted.** The 9–12 bar is R3's line for the bands a surfer rides most; `leftStretches` fits 2.5 m samples
   and 0.1 m/s is inside its noise. Re-pin as: Solid–Big first leg 9–12, Huge 9–12.5, and say so in the test's comment
   (not a loosening of the rule, a statement of the biggest day). If the Task 3 pins come out above 12.5 at Huge, stop.
3. **Fun not offered: accepted.** A 3.5 ft swell does not stand up on a 3.5 m ledge 230 m out in 15 m of water; the select
   list starts at Solid, and the Random roll + presets follow (Task 4 lists any preset that moved). Andrew ruled the
   screen honest; this is what honest says. The Summer sea-breeze "Fun day" preset becomes a Solid day or is relabelled.
4. **247° runs 13–14 m/s at every row: report only** (spec §4: the offering stays band × tide). Put one line in the
   Task 4 evidence and in the -fable handover; a direction-aware offering is a later segment.
5. 202° Pumping at −130/46° breaks 58/72 of the ledge: report in the datum, no gate (the offering is measured at 225°).

Proceed: Task 2b step 3 (commit the constants) and step 4 (scene follow-through), then Tasks 3–6. Next STOP is after Task 5
only if a ride case is lost.

## Task 5 ruling wanted (Opus, 2026-10-09): two ride cases lost; the take-off anchor sits on the right

Done since the Task 2b ruling (all pushed on `lineup-truth`): d19b2e0 constants + scene follow-through (TIP (−130, 0), 46°,
180 m; τ, set waves' dTau/lateral/taper CPU+GPU, peakFace, firstBreak, TAKEOFF_ANCHOR, WOMB_LINEUP/DEFAULT_LINEUP_POSITION/
surfer params, break map rebaked, reef-wall probe, self-test peak points; the land's junction stays (295, 45)); GPU self-test
breaker 14/14; frames `../liquid-dreams-captures/womb-retune-2026-10-09/Pumping-tide0-{dtl,stand,lineup}-*.png` (the
take-off in the stand frame; **small square marks on the breaking line in the stand frame**, to look at); Task 3 0344983 +
6684b1f (r1Reef/satelliteReef rewritten on the coast field per offered band × tide: 17/17; curl report at the game's 40 m/s:
11.3/11.7/11.9, no held nodes); Task 4 fea7a87 + 3d71e5a (see `evidence/womb-retune/task4-select.md`).

**Task 5 (rideOnSections, the game's coast-seeded field, 225°, mid tide):**

| case | held s (≥ 10) | end |
|---|---|---|
| Solid × intermediate | **1.97** of 8.08 | kickout behind the crest |
| Huge × intermediate | 14.95 | window end |
| Solid × beginner | 14.12 | window end |
| Solid × expert | **0.83** of 7.55 | kickout behind the crest |

Trace (`evidence/womb-retune/ride-trace-<case>.txt`, PROBE_RIDE_TRACE=1: her place along the left's ledge vs the curl's,
speed vs crest c, slope, ahead): the take-off spot is (−143.1, 42.5), **39 m before the tip along the left**: TAKEOFF_ANCHOR
is the old "on the south ledge 40 m south of the corner" (tip + (−6, 40)), now on the right. From there to the corner the
curl runs ~17 m/s (s −47 → +5 in 3 s: the right closing out into the corner); the intermediate rider pops up at t −0.5 s,
peaks 10.3 m/s at +1 s with the slope under the board falling to 0.01–0.13 (on the flat in front of a closing-out section),
and is behind the crest at +2 s. The beginner's assist (11–12 m/s) outruns it to the corner and then holds the left with
ease (the ledge peels ~11 m/s). Size is not it (Huge holds); pop-up timing is as before (caught, popped at slope 1.5).

Candidate fix (game data, not bot/camera code; measured, then reverted, the game unchanged): **TAKEOFF_ANCHOR at the tip**
(`{ x: TIP[0], z: TIP[1] }`): all four cases hold 14.3 s (Solid int 14.28, Huge 15.08, Solid beg 14.27, Solid exp 14.28;
traces `ride-trace-*-candidate-anchor-at-tip.txt`). 15 m along the left's ledge instead loses Solid int/exp again (1.9 / 1.3 s:
caught where the curl is already on her). Opus recommends the tip; the anchor's comment would say "the corner, where the left
starts peeling on the real shelf". **STOPPED** before Task 5 step 3 (frames) and Task 6.

Also for the ruling / Andrew:
1. Fun: the matrix passes it at **Low (−0.5 m)** alone (72/72, start 1.1 s, peel 9.3, hollow 0.61); kept not offered per the
   ruling. Re-offer at Low only?
2. Big at +0.5 m peels 12.1 (Huge-style 12.5 applied in satelliteReef, same 0.1 m/s-noise argument).
3. FACE_FT at High reads Solid 6 ft = Pumping 6 ft (read where each first breaks on the peak's ray).
4. coastBreaking: at 8 ft a closeout ~1 km north of the reef at (−32…−48, −988…−972) (167 cells): outside the reef's halo,
   so not the tip move; likely Task 1's dial at the seed (amp ×1.06–1.44). Carried red.
5. Task 3 gate: src/breaker carried reds not yet re-taken idle (the 59-red run was under 3 probes' load; peelStretch,
   breaking, BreakingRibbon.limits, the tide test pass alone). Physics misses on the coast-seeded field, measured, not
   loosened: reefField lean 4.0 vs slurp 5.1 at 25 m out on the tip's ray (bar < 0.5×), until-hold 1 cell back 0.020–0.040 s
   (bar 0.02), march at the tip +10 m 0.33 vs 0.66–1.51 s; breakingField highest water stood still 4 steps (≤ 2), peak 2.05
   vs shoulders 2.21 m, 6 ft lift 20 m in front 0.277 (< 0.25), pile lip spread 0.065 (< 0.05), pile grows 2.066 vs 2.028,
   onset→closure 0.51 s (≥ 0.55); crestTrace left 7.98 m/s (≥ 8, the peeler wave), right spread 1.84 s (≤ 1.5), station ψ
   1.4e-4 (< 1e-6), one-curl 6/8 ft order; plus lineup-truth's carried list. Task 6 re-takes the suite idle and diffs.
6. Housekeeping: `liquid-dreaming/.claude/launch.json` got an `ld-lineup-truth` config (port 5189) for the worktree's
   server; reverted at this stop.

**RULED (Fable, 2026-10-09), Task 5 and the rest:**
1. **TAKEOFF_ANCHOR at the tip: accepted.** The diagnosis is sound (the anchor was the old right-side spot; from there the
   right's closeout carries her into the corner) and the fix is game data. Comment it "the corner, where the left starts
   peeling on the real shelf". Re-run the four cases, paste the heldS table, then Task 5 step 3 (frames).
2. **Fun at Low: offered.** The matrix is the rule and it passes there (72/72, start 1.1 s, peel 9.3); my "not offered" was
   about Fun at every tide. `BREAKS.Fun = [true, false, false, false]`; FACE_FT at Low; the presets that moved to Solid
   stay Solid unless their tide is Low. Say in the evidence that Fun is a low-tide-only day at the Womb.
3. **Big at High 12.1: the 12.5 bar applies** (same noise argument), with the comment.
4. **FACE_FT: re-read uncapped.** Solid 6 ft = Pumping 6 ft at High is the cap talking (`min(H·amp, 0.78·depth)` at a
   smoothed depth), not the wave. The face a surfer names is the height the wave carries into its break: read `H·amp` at the
   first-break point on the peak's ray, no cap. Expect Solid ~5, Pumping ~6.5–7, Big ~8, Huge ~9+ at every tide. If a
   bigger band still reads smaller than a smaller band at any tide, paste both reads and stop there (a one-line ruling).
5. **coastBreaking's 8 ft closeout 1 km north (167 cells, ~130 m off the beach): carried.** It is on the hand-set inner
   shelf, which is not survey; the no-closeout rule's 60 m shore band predates the buoy dial. Note it in -fable.md for
   Andrew's lookout look; a shore-band re-pin is a later segment.
6. **Breaker physics reds: carried, named.** Task 6 re-takes the suite idle. Every red that is a bar on the new field (lean/
   slurp, until-hold, march, breakingField, crestTrace, station ψ, one-curl order, lineup-truth's list) goes into `-opus.md`
   as name + measured + bar, no fix this segment; they are the merge's debt for a "re-pin the breaker bars on the real
   shelf" segment, like one-curl's unwarp reds. Anything that is not a bar (a crash, a NaN, a GPU/CPU mismatch) stops.
7. **The marks in the frames (Task 6 item, before captures):** in the stand frame a row of ~6 flat beige quads sits on the
   breaking line, evenly spaced, like a sprite layer seen edge-on or unlit; in the down-the-line frame a row of small white
   dots runs along the lip. Find which layer they are (dev panel: toggle whitewater, spray/spit, the pile, the ribbon's
   debug points, at the stand camera) and whether a size/placement did not follow the tip move (likely); fix only that
   kind of cause; otherwise name the layer and carry. Capture the stand frame again after.
8. launch.json revert: fine. Keep the worktree entry out of main's checkout.

Then Task 6 as planned (suite idle + diff, captures at Solid / Pumping / Huge, both handovers, push). Andrew's look is next.

## Task 5 ruling applied + Task 6 (Opus, 2026-10-09 late): one ruling wanted (Fun at Low)

Applied (a38b4eb): TAKEOFF_ANCHOR = TIP ("the corner, where the left starts peeling on the real shelf"); `BREAKS.Fun =
[true, false, false, false]`; Big at High under the 12.5 bar (already in satelliteReef); FACE_FT uncapped (`H·amp` at the
first break on the peak's ray). Presets unchanged: none sits at Low. Evidence `matrix-225.txt` (re-run), 203/203 frontend.

**FACE_FT, uncapped (ft, tides Low / Low pushing / Mid / High):** Fun 4 / – / – / – · Solid 6 / 6 / 6 / 6 · Pumping 8 / 8 /
7.5 / 7.5 · Big 10 / 10 / 10 / 9.5 · Huge 13 / 13 / 13 / 13. Bigger band ≥ smaller at every tide: no stop. (Huge reads
above its 12 ft dial: shoaling onto the ledge, amp > 1.)

**The ride, anchor at the tip (225°):** Solid int 14.28 · Huge int 15.08 · Solid beg 14.27 · Solid exp 14.28 s: all hold.

### Ruling wanted: Fun at Low is offered but nobody can ride it

With Fun now the smallest offered band I pinned it too (plan Task 5: smallest offered × every level), at −0.5 m:

| case | held s (≥ 10) | rode s |
|---|---|---|
| Fun × intermediate | 1.63 | 7.63 |
| Fun × beginner | 0.00 | 3.60 |
| Fun × expert | 0.00 | 4.18 |

Trace (`evidence/womb-retune/ride-trace-Fun-*.txt`): wave 2.02 m; caught and popped normally; the curl runs ~10.6 m/s along
the ledge (s 0 → 79 m in 7.5 s); the slope under the board is 0.04–0.12 once she is up, she peaks at 8.4 m/s (crest c 5.4) and
fades; the beginner's assist doesn't reach the curl at all. Size against peel: a 2 m wave on a ledge that peels 9.3 m/s
(matrix) / ~10.6 (her ride) doesn't carry a rider that fast. No bot/camera change tried (plan). Options:
- **A. Fun not offered after all** (BREAKS.Fun all false; the select starts at Solid; your Task 2b ruling). The matrix rule
  ("breaks") stays as is, and a second rule is added to the offering: "rideable" (the smallest band's ride gate). Opus leans A:
  Andrew's "not offering a swell and tide option that won't break" reads, for a player, as "won't give a ride".
- B. Fun offered at Low with no ride gate (a day to watch, not ride), the three cases dropped.
- C. A later segment: a slower first leg at Low for small swell (bed change), then re-offer.

### Task 6

- **Suite, idle:** lineup-truth 2050 tests, 52 failed (after re-pinning surferParams' lineup spot to TIP); idle baseline
  (4f70490) 2046 / 65. 17 red here and not in the baseline, all bars on the new field (no crash/NaN/mismatch): the table with
  measured and bar is in `-opus.md` §Full suite; carried per your ruling 6, plus the Fun rides above.
- **Marks in the frames:** the beige quads are the **water sheet** (scene-child hide test: only the sheet removes them; ribbon
  hidden, they stay; no overlay colours them), on the inside leg past the ribbon's run end, moving with the crest. GPU and CPU
  heights agree there (no spike): the sheet's coarse far grid folds on the steep front the ribbon no longer draws. Not a
  placement that missed the tip; carried. Lip dots: the ribbon's own shading; carried.
- **Frames:** riding median 46.0 (main) → 51.7 ms (p90 53 → 76), same session.
- **Captures:** `evidence/womb-retune/captures.md` (Fun at Low, Solid, Pumping, Huge at t+3/t+5: stand, down the line, lineup).
- `?coast=off` kept (plan 6.3). launch.json entry removed.

Next: your Fun ruling, then Andrew's look; merge is his.

## Fable's closing review (2026-10-10): ready for Andrew's look; merge is his

**Fun at Low: option A, not offered.** The offering means "a day you can surf": the matrix's "breaks" rule AND the ride gate
at the smallest offered band. `BREAKS.Fun` all false; the three Fun ride cases dropped (keep their traces in the evidence);
a one-line comment on `BREAKS` saying Fun breaks at Low but a 2 m wave on a 9–10 m/s ledge carries no rider. Option C (a
slower small-swell leg) is a later segment if Andrew wants small days.

**Spec §6 gates, from the evidence:** 1 datum ✓ (buoy dial, amp ~1.0 at 225°); 2 reef ✓ (tip (−130, 0), 46°, 180 m; Solid
10.2 soft, Pumping 11.7 barrel, Big 11.9, Huge 12.1; the right closes out); 3 ride ✓ (Solid int/beg/exp 14.3 s, Huge int
15.1 s, anchor at the tip); 4 select ✓ (Solid–Huge, faces 6 / 7.5–8 / 9.5–10 / 13 ft, three presets moved to Solid); 5 suite:
52 red of 2050 vs an idle baseline of 65; 17 new bars carried as named merge debt; 6 frames ✗ **riding median 46 → 51.7 ms
(+12 %, bar ±10 %), p90 53 → 76 ms**: carried, but it is the first item of the follow-up (one FOCUSED profile naming the
pass that grew: the ribbon is 180 m of hollow ledge now, or the sheet past its end); 7 Andrew's eyes: captures.md.

**Carried, in the order the follow-up segment should take them:** (1) the frame cost; (2) `crestTrace: one curl, one clock`
9 violations at 6 ft and `reefField: until carries the hold` 8 jumps: the one-curl invariant is by construction, so a
violation on the new ledge is a real seam (likely where the ledge turns north into the inside), not noise; (3) the sheet's
far grid folding past the ribbon's run end (the beige quads from the stand): either run the ribbon on into the inside or
stop the sheet standing a front the ribbon does not draw; (4) the remaining breakingField/crestTrace bars; (5) the 8 ft
shore closeout 1 km north; (6) `?coast=off` removal after Andrew's look. The two Bombies, the seabed outside the reef map
and the far foam layer stay on lineup truth's list.

**For Andrew's look:** `captures.md`. From the stand the Womb is now 230 m out and reads small; the long wall at Huge is the
honest shape of a 12 ft day on this reef. Down the line, Solid is a soft shoulder, Pumping and Huge hollow. If the look
passes: merge `lineup-truth` into main (Andrew), then the follow-up segment above.
