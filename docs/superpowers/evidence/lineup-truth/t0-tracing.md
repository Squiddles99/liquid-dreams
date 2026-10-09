# Task 0: tracing the outer shelf (lineup truth)

Opus, 2026-10-09. Output: `src/seabed/coastContours.ts` (the 10–30 m contours, every metre, 15 points each from
z −2 100 to +1 400). Scripts: `tools/_lineupTrace/` (Python + Pillow; they read `reference/`, which is never committed).
The overlay picture (traced polylines drawn over image 8) is outside the repo, in
`liquid-dreams-captures/lineup-truth-2026-10-09/t0-traced-overlay.png`, because it is a crop of the Seamap/OSM screenshot.

## 1. Scale

Image 8 (2000 × 1328 px) has a 500 m scale bar of 90.5 px and a 2000 ft bar of 111.5 px: **5.5 m/px**. The map's own
"1:31 691" at 96 dpi is 8.39 m per CSS px, which is 5.5 m per screen pixel at a device-pixel ratio of 1.5: consistent.

(Image 1's Google bar reads 4.63 m/px, and Andrew's pin-to-pin distances read 4.8–5.4 m/px. Neither is used for the
contours; the features are placed at the spec's coordinates.)

## 2. Registration: image 8 → game metres

The plan asked for two landmarks (Gracetown's town block, the Ellensbrook creek mouth). Those disagreed with each other
and with image 1 by up to 500 m (the block's centre and the creek's mouth are both vague at this zoom). The game has a
better reference: the baked SRTM terrain (`public/terrain/womb-land.bin`) is geo-referenced on the Womb's peak and
carries the real waterline per 4 m of z. So the image's coastline (the first column of ≥ 30 px with no water colour,
west to east, per row) was fitted to that waterline at the scale above, searching the image row of z = 0 and an x offset
(median absolute misfit):

| scale (m/px) | best misfit (m) | Womb's image row |
|---|---|---|
| 5.2 | 24.0 | 821 |
| 5.35 | 25.3 | 830 |
| **5.5 (the bar)** | **27.2** | **838** |
| 5.65 | 30.1 | 816 |

Kept: **5.5 m/px, the Womb at image row 838, game x = 5.5 · px − 4 749.75**, game z = 5.5 · (row − 838). The fit is
weakly constrained along the coast (rows 816–846 across scales: ±80 m in z), well inside what the eikonal at 4 m cells
and a coast-parallel shelf can feel. At z = 0 the survey's edge ("1 m" line) is at x −227, 400 m off the real
waterline (176): Andrew's "300–500 m short" holds.

Image 7's zoom was **not** used: its Womb marker sits on the survey's edge, about 250 m west of the reef, and its labels
are placed differently from image 8's (Leaflet re-labels per zoom), so it cannot be registered by label.

## 3. Tracing

1. Per row, contour lines are local brightness minima in water-coloured pixels (prominence ≥ 6, parabolic sub-pixel
   centre), with label text (and 3 px around it) masked out.
2. The lines are tracked as curves from a clean row (image row 860, z = +121), counted from the survey's edge, and
   followed row by row with an ordered one-to-one match (a line may not cross or share a neighbour's minimum).
3. Lines 10–20 track identically from two start rows (860 and 1 000) and pass through their printed labels (10, 15, 20
   checked by eye on zoomed crops). Lines 21–30 bunch at the shelf's bend (image rows 680–800, where labels 21–29 sit on
   the lines) and two tracks swapped there; so 21–30 are re-read **by counting west from the verified 20 m line** on each
   label-free row, and from the tracked lines (checked against labels 25 and 30) on the three z samples where every row
   carries a label (z −850, −600, −350).
4. Each contour's x at z = −2 100, −1 850 … +1 400 is the median over ±8 image rows. Eleven points where a deep line's
   spacing jumped (> 3× or < 0.3× its neighbours') were repaired to the median spacing: 21–25 at z −850/−600/−350,
   30 at +1 150, 28–29 at +1 400 (all but the first group lie west of the coast map's edge, x −1 500).

## 4. Numbers (game metres)

| z | 10 m | 15 m | 20 m | 25 m | 30 m |
|---|---|---|---|---|---|
| −2 100 | −1 019 | −1 226 | −1 529 | −1 848 | −2 496 |
| −1 600 | −897 | −1 117 | −1 353 | −1 670 | −2 193 |
| −1 100 | −674 | −858 | −1 067 | −1 342 | −1 865 |
| −600 | −500 | −649 | −821 | −1 024 | −1 406 |
| −100 | −466 | −634 | −832 | −1 067 | −1 465 |
| +400 | −496 | −711 | −957 | −1 274 | −1 800 |
| +900 | −527 | −798 | −1 116 | −1 512 | −2 133 |
| +1 400 | −609 | −950 | −1 318 | −1 808 | −2 972 |

At the Womb (z = 0): 10 m at x ≈ −470 (565 m off the game's beach, 645 m off the real waterline), 20 m at ≈ −815,
30 m at ≈ −1 500 (the coast map's west edge is ≈ 28 m deep there). North of the Womb the shelf turns west with the
coast: at Lefthanders (z −1 666) the 10 m line is at ≈ −920.

## 5. Accuracy

±30 m across the coast for lines 10–20 (sub-pixel centres, ±8-row medians, 5.5 m pixels), ±50 m for 21–30 at the bend;
±80 m along the coast from the registration. Depth: the contours are the survey's own 1 m lines, so ±0.5 m between them
by linear interpolation.

## 6. Corrections found by the coast map (Task 1)

- Line 13 drifted onto line 14 below the "12/13" labels (from image row ≈ 1 035). Re-read by counting west of the
  10 m line on clean rows: 13 m at x −737 (z 1 150) and −805 (z 1 400). A test now checks no contour crosses another
  anywhere along the coast.

## 7. Placing the features (Task 1, step 3)

The coast map's beach is the game's own waterline (`COAST_WATERLINE`: LandHeight.waterlineAt every 25 m, within 1.3 m),
not a straight line at x 94. The real waterline swings from x −266 at z −2 100 (north, toward Cobblestones) to x 403 at
Ellensbrook (z 1 080), so the coast grid is widened east to +500 (spec: +250, which cut off Ellensbrook's beach).

- **Lefthanders' ledge**: 170 m off the waterline at z −1 560, 140 m at −1 670, 110 m at −1 780
  (waterline −56, −91, −151): (−226, −1 560) → (−231, −1 670) → (−261, −1 780). It closes on the beach going north, so
  the left peels north. The spec's line (−220, −1 560) → (−120, −1 760) assumed a beach at x 94; its north end is 27 m
  inland of the real waterline.
- **The Bombie**: the spec's (−280, 1 020), 677 m off the game's waterline there. The survey's 10 m line at that z is at
  x −538 (935 m off the beach), so the Bombie sits on the hand-set inner shelf, ≈ 9.7 m deep, not the spec's 12–15 m:
  real 12–15 m water is 1.1–1.2 km off Ellensbrook. Its mound rises from the shelf to `bombieTopM`.
- **Ellensbrook's bar**: `ellensbrookBarOffM` (80 m) off the waterline from z 930 to 1 230 (waterline 362–403).
