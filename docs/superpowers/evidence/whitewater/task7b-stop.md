# Task 7 + 7b STOP: the spray tuned, the mist slab, the boil (evidence)

Moments as Task 6's: 10 ft 15 s, tide 0, seed 2002, 09:30; the biggest wave of the first set after 300 s reaches the tip at
401.17 s. Cameras M-beach (the lookout) and M-tube (free, 3 m up, 100 m down the line). Branch at 9055986 (port 5174), every
frame through `captureMoments.mjs` (exact foam replay). Task 6's frames are in the captures dir (`wind/`) for comparison.

| file | what |
|---|---|
| `wind-glassy.png` … `wind-blown-out.png` | the seven WIND_ROWS re-captured after 7 + 7b: tube above, beach below, 403.67 / 404.67 |
| `feather-wide.png` | photo 3's moment (8 ft, strong offshore, lookout), 399.17 / 400.17 / 402.17 |
| `ab-task6-tube.png` | strong offshore, tube cam: main (top) vs the branch after 7b (bottom), 403.67 / 404.67 |
| `s3-mound-vs-04.png` | the mound at 403.67: as ruled (3-D billows, exposure 1) beside the ×0.4 exposure experiment |
| `s3-mound.png` | the S3 steps: before, crease term, exposure 0.85, exposure 0.4 |
| `ab-task7-tube.png`, `backlit-plume.png` | Task 7: the mist slab (tube A/B against Task 6) and photo 2's backlit moment (12 ft, 17:00) |

## S1, the plume (accepted at lever 3)

Measured on screen (`tools/_sprayScreen.mjs`: the frame with and without the spray pool, diffed; the crest line and 1 H
above it projected through the game camera; "visible" = a pixel changed by more than 25/255). w_off at the throwing section
8.86 m/s, so smoothstep(3, 9) = 1.00.

| lever | tube cam: top above the crest, fan width | lookout: top |
|---|---|---|
| before (Task 7) | 0.26 H, 3.5 m | 1.54 H |
| 1. PLUME_RATE 4 → 12 | 1.25 H, 11.0 m | 1.90 H |
| 2. opacity 0.12 → 0.3, isotropic 0.5 → 0.7 | 1.37 H, 20.2 m | 2.19 H |
| 3. sizeM [2, 6] → [3, 10] | 1.57 H, 24.1 m | 2.37 H |

Not taken: PLUME_LIFE_S [4, 7] (needs a 40 % larger pool), the updraft.

## S2, feathering (Fable's ruling: every stood crest in a strong offshore)

FEATHER_KIND (1–4 m, opacity 0.2) at rate 12; strength (0.25 + 0.75 × wallWeight) × smoothstep(5, 10, w_off) × amount on
every traced station with a finite `until`. At 400.17 (8 ft): 76 feathering stations = every stood station the trace has;
2064 px visibly changed over the 74 on screen (Task 6: 510). The haze stops where the trace's stations stop (the trace is
not extended). None under 5 m/s offshore or at Glassy (unit tests).

## S3, the boil

- (a) The vertical bars were the lace pattern's holes. Root cause: the ribbon's detail coordinate collapses to the home's xz on
  the caved-in mound's near-vertical face, so anything read in it streaks down the face. Fixed: the solid boil fills the
  holes and ends the clean tube's hiding. No bars.
- (b) The billows: an isotropic 3-D field over (detail x, height above the tide, detail z) (isotropy unit-tested: x 0.85, up
  0.80, z 0.75 m), its gradient a bump normal along the surface, its troughs hiding sky × (0.4 + 0.6 h) and sun × (0.6 + 0.4 h).
  No vertical streaks. Target missed: the mound's p10–p90 spread is 3 / 5 / 8 levels (R / G / B; medians 249 / 234 / 219)
  against ≥ 20. The foam volume's radiance sits past the tone curve's shoulder by more than the troughs' ×0.4–0.6, so even
  the deepest trough lands within a few levels of white. At exposure 0.4 the spread is ~30 but the median falls to 199
  (grey) — beside the ruled frame in `s3-mound-vs-04.png` for Andrew's eye. churnSize stays 0.25 (Andrew's dial).

## Costs

| | before | after | bar |
|---|---|---|---|
| `_rideCost --ft=7 --spray --wind=18,90` breakEmitters median | 2.49 / 2.57 ms (Task 6) | 2.49 / 2.48 ms | feathering ≤ +2 ms over 2.7 |
| births per 20 Hz tick, max (CPU pool replay) | — | 150 at 8 ft, 166 at 12 ft | ≤ 320 |
| Task 7 riding median, 3 pairs (main / branch) | — | 26.6 / 27.3 ms (1.03 ×) | ≤ 1.10 × |
