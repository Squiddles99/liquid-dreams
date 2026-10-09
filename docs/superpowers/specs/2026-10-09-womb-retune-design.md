# The Womb retune: the real shelf wins (lineup truth, segment 2)

**Author:** Fable 5.1 (orchestrator), 2026-10-09. **Executor:** Opus 5.5. **Branch:** `lineup-truth` (continues; c9ac07a +
this segment). **Andrew's ruling (2026-10-09):** option 3 of `handover/2026-10-09-lineup-truth-fable.md`: "I want everything in
the game to be true to the scientific data and to have consistency when I come to adding new breaks." He accepts the
smaller wave, wants the conditions screen to say honestly what each condition gives, will review the wave shape after the
retune (hoping it reads closer to the real Womb), and does not mind the boot cost.

## 1. The datum (what is fixed, what is ours)

**Fixed (the science):** the traced Seamap shelf (`coastContours.ts`), the game's SRTM waterline, linear wave theory as the
solver has it (Snell, shoaling, the 10 m refraction floor), the 2 m breaking floor (main a840eb4), γ 0.78. With the coast
seeding the reef field, a 225° swell reaches the peak travelling −22.9° (was −33.5°) with amplification 0.72 (was 1.15).
That is the Womb's real arrival and is **not** to be renormalised, rotated or faded away. `?coast=off` stays as a debug
view of the old Womb until the segment ends, then goes (one truth; see §6).

**Ours (design space):** the Womb's reef itself, inside the reef map. The reef is our fiction placed on the real coast:
the ledge polylines, their depths, the face, the shelf, the heads and pockets (`wombReef.ts`, `DEFAULT_REEF_PARAMS`).
Rule: **change the bed, never the water.** No peel caps (`curlMaxMs` stays 40, unbound), no amp scaling, no per-break
direction fudge. If a target cannot be met with a plausible reef (ledge 2–4 m, slopes a real limestone shelf could have),
report it and Andrew decides.

## 2. The swell dial means the buoy

Today "6 ft" is Hs in 15 m of water at x −400 (`coastFarField.ts`: h_ref = depthBg(FAR_X0)). On the real shelf x −400 is
on top of the 10 m line and the field is seeded at x −1500 (26–30 m water), so the 15 m reference is now arbitrary.
**Ruling:** the dial is the offshore swell as a surfer reads it on a forecast or buoy: Hs and period in the water where
the coast field is seeded (the coast grid's west edge, its real depth per row; one reference depth = the row's depth at
the Womb's z). The ft → Hs curve (`units.ts`) and set-wave factors are unchanged. Expected effect (Fable's estimate,
T 15 s, 28 → 15 m): shoaling ×1.10, so amp at the peak ~0.72 → ~0.79; Opus measures. The far breaks inherit the same
datum, which is the consistency Andrew asked for.

## 3. The reef retune

Targets at 225°, mid tide, measured by `reefReport.leftStretches` on the coast-seeded field, for every band the select
screen will offer (§4), with the two outer directions (202°, 247°) reported alongside:

| | target | why |
|---|---|---|
| first-leg peel | 9–12 m/s at every offered band | R3's bar; a surfer's left (`satelliteReef`, `r1Reef`) |
| hollow, first leg | ≥ 0.8 at the two middle offered bands; < 0.6 at the smallest | the barrel is the Womb's point; small days back off |
| first break | within 5 m of the ledge at the smallest offered band; a first-break depth cap per band as `r1Reef` has | the ledge is the take-off |
| second leg | a slower section (8–15 m/s), not a closeout, at the middle bands | the ride's second act (one-curl) |
| leg 2 (beach-parallel) | closes out (> 18 m/s) | the inside is the inside |
| the right (south ledge) | stands up ~40 m south of the corner and closes out, as today | the Womb's character |

Levers, in order of preference: (1) **the north ledge's bearings**: with the crest at −22.9° the first leg needs α ≈ 61°
to the crest, a leg-0 bearing near 38° from north (today 23.6°), leg 1 then ~29°; (2) ledge depth 3.5 → 2.5–3 m if the
smaller wave does not stand up on the ledge at the smallest offered band (a 6 ft dial gives ~2.3–2.5 m at the peak, the
ledge's breaking height is 2.36 m: marginal); (3) face width / base depth for hollowness; (4) the shelf depth and head
relief for the second leg. The reef grid, seed, warp and rock reach stay. The south ledge moves only if the right's
behaviour changes. The pick is made by a sweep tool (plan Task 2) and **ruled by Fable** from its table before the ride
is retuned on it.

## 4. The select screen tells the truth

- Re-measure the band × tide matrix on the coast-seeded, retuned Womb (`tools/_smallSwell.ts` with its coast imports
  back) at 225°, and additionally at 202° and 247° (reported, not yet gating: the offering stays per band × tide).
- `BREAKS` (`sessionSetup.ts`) rewritten from the new evidence file; the existing test keeps data and evidence equal.
- **New:** each offered pair carries the Womb's measured face, `faceFt` = the set-1 biggest wave's local height at the
  peak (`H·amp`, capped `0.78·hmin`) in feet on the same ft curve inverted, rounded to the half-foot. The conditions
  screen shows it next to the swell: e.g. "Pumping 7 ft swell · Womb faces ~5 ft". Words, not a graph. Bands that give
  no face are not offered (as now). The Random roll and the presets (Summer sea-breeze "Fun day" etc.) re-checked.
- The bands' labels stay the swell's words (Flat-ish … Huge); if the smallest two or three no longer break, they are
  simply not offered, and the matrix says so.

## 5. The ride

- `rideOnSections.test.ts` and every `src/ride` test build their field **with the coast** (the game's field); the
  no-coast path is for `?coast=off` only.
- Cases re-pinned by band, not by ft: the **smallest offered band** at intermediate, beginner, expert, and the **biggest**
  at intermediate. Gate: caught, pop-up, no wipeout, heldS ≥ 10 s each (R3's 35° line holds), probe `lazy (R9)` 0.00 cm.
- If a case is lost, diagnose before touching anything: a trace of ratio at the take-off vs time, the bot's speed vs the
  curl's, the pop-up timing (R2's instant-wipeout trace). Size and peel are different diseases.
- Bot and camera code unchanged unless the diagnosis names them (Fable rules).

## 6. Gates (Opus pastes, Fable reviews)

1. **Datum**: a table (`tools/_wombDatum.ts`) of arrival angle, amp, face height at the peak and at the reef map's west
   edge, bands × tides × {202, 225, 247}, before and after §2; the §2 change alone moves nothing but amp (angles equal to
   0.1°).
2. **Reef**: the sweep table and the chosen params; all §3 targets met at 225° mid tide for the offered bands, with the
   202°/247° columns reported; `r1Reef`, `satelliteReef`, `breaking`, `smallSwell` tests re-pinned to the new truths (no
   test keeps a 15 m-basin or far-field-seed assumption); the GPU/CPU sheet self-test unchanged (coastSample parity).
3. **Ride**: §5 cases green; heldS table; the trace for any case that needed a change.
4. **Select**: new matrix evidence file; `BREAKS` + `faceFt` agree with it (test); a screenshot of the conditions screen
   showing the face text for two bands.
5. **Suite**: full run; failing names diffed against `fails-after-names.txt`; every new red named and explained.
6. **Frames**: cam median and riding median within ±10 % of this session's main; boot cost logged (no bar: Andrew's call).
7. **Andrew's eyes** (after Fable's review): captures at the smallest, middle and biggest offered bands at t+3/t+5 down the
   line from the stand, the lineup shot, the lookout shot. Then `?coast=off` is removed (one truth), the far-field seed path
   kept only for tests that need a flat bed.

## 7. Out of scope (carried from lineup truth)

The two Bombies (`src/bombie` vs the coast map's), the seabed render outside the reef map, a far foam layer, Cobblestones,
the 10 ft inside closeout (ruled: on the real shelf a 10 ft day closes out inside; true, so reported, not fixed), riding
any break but the Womb, persisting the Coast dials, the camera.
