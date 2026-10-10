# Inner shelf: evidence (2026-10-10)

Plan `plans/2026-10-10-inner-shelf-focus.md`. Mid tide, 15 s, 225°, the game's refraction floor throughout.

## Why it focuses (Task 0)

`focus-map.txt` (`tools/_innerShelf.ts`): over the hand-set shelf the coast field's amp > 1.5 lies along one ridge that
starts near (−410, −720), at the north edge of the Womb's halo, and runs north-east with the swell (heading −36°: 234 m
east for 140 m north) to the beach at z −1 000 (amp 3.9 at the waterline, 1.8–1.9 at 69–189 m out). The 10 m line has a
kink at z −850 (bearing −24.5° north of it, −13.5° south), but the ridge is already there 130 m south of the kink.

The source is the Womb's basin: alongside the reef map the coast is depthBg's 15 m, fading to the 9 m shelf over
WOMB_HALO_M (300 m) beyond the map's north end (z −450 → −750). A sideways depth gradient is a lens; the flat 9 m shelf
north of it (9.0–9.5 m for 600 m out) lets the caustic run to the beach unchecked. Check (`diag-halo600.txt`, the halo at
600 m for one run, reverted): the long offshore ridge goes and the landing moves north to z −1 240, weaker offshore.

The 3 cells at z 472 are the same lens on the south side (the basin fading back over z 300 → 600), inside the halo.

## The sweep (Task 1)

`sweep.txt` (`tools/_innerShelfSweep.ts`): a raised cosine from 9 m at z −1 150 + (north half-width) and at −750 (the halo's
edge: the south flank is fixed so the halo never changes) to D at z −950. 'elsewhere' = breaking cells outside the four
breaks, the shore band and the Cobblestones approach.

| D m | north half-width m | 4 ft | 6 ft | 8 ft | 10 ft |
|---|---|---|---|---|---|
| 9 (before) | — | 0 | 0 | 146 (z −980…472) | 3 357 |
| 10 | 200 / 300 / 400 | 0 | 0 | 3 (z 472) | 3 167 |
| 11 | 200 / 300 / 400 | 0 | 0 | 3 | 3 025 |
| 12 | 200 / 300 / 400 | 0 | 0 | 3 | 2 930 |
| 13 | 200 / 300 / 400 | 0 | 0 | 3 | 3 346 / 3 068 / 2 884 |

Pick: **D 10 m, half-width 200 m** (all widths tie; the least D). At 10 m the shelf meets the traced 10 m line flat, so no
traced contour moves (D > 10 would hold the shelf flat past the 10 m line, overriding the survey's 10…D m lines).

The z 472 cells (ratio 1.004–1.008, 110–118 m out, depth 11.3 m) do not move with any D. A deepening south of the halo
(9 → D → 9 over z 600…1 000/1 100) made them worse: D 10: 3, D 11: 7, D 12: 207 (z 468…908). They are carried
(coastBreaking.test: ≤ 3, inside the halo only).

## After (Task 2)

`shoreband-after.txt`: 4 ft 0, 6 ft 0, 8 ft the 3 halo cells; the 8 ft beach break reaches 55 m off the waterline (71 m
before). `datum-before.txt` / `datum-after.txt`: the Womb's datum table (`tools/_wombDatum.ts`), see `datum-diff.txt`.
`breaks-before.txt` / `breaks-after.txt`: `tools/_coastBreaks.ts --sizes=4,6,8,10`.

## Look (Task 3)

`../liquid-dreams-captures/inner-shelf-2026-10-10/`: the lookout frames at Big (9 ft) and Huge (12 ft), the shelf-polish
Task 8 commands on this branch (`run.sh`); "before" is shelf-polish's own frames (`shelf-polish-2026-10-10/task8/`, the same
coast). `north-shore-before-after.png` (the right of the frame: the beach north), `north-shore-4x.png`.

From the lookout the change is invisible: the frames differ only in a strip on the far north shore (y 500–527 px, mean
grey difference 0.01 over the frame, ≤ 136 px over 40 grey levels), and neither shows white water up there at these
moments. 1 km off, the shore is a few pixels tall.
