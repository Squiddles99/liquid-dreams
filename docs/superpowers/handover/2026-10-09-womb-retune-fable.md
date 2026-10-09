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
