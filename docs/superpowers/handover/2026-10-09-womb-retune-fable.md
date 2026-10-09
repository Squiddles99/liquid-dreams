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
