# closeout-edges Task 0: which mesh carries the far closeout's stepped edges

Frames: `../liquid-dreams-captures/closeout-edges-2026-10-10/task0/` (outside the repo), Huge (12 ft, 17 s, 225°, mid
tide, seed 2002), the stand camera of shelf-polish `task3/commands.txt`, sim 408.31 (t+3) and 410.31 (t+5), `--settle=8000`,
dev server on this branch (main 9b5e7e2). Each variant hides one mesh from the page (`Object.defineProperty(mesh,
'visible', false)`; the footprint by clearing it every frame). Crops: `hide-408.png` (x 1550–1850, y 500–610, ×3) and
`hide-410.png` (x 1650–2100, y 480–620, ×2), rows: none, ribbon tint, no ribbon, no sheet, no footprint, no whitewater.

| hidden | the steps |
|---|---|
| nothing | there (t+3: two tube ends; t+5: three or four, evenly spaced) |
| ribbon tint on | every stepped surface is magenta: all ribbon |
| ribbon | gone: the footprint's hole (black) and the sheet round it; no step in the sheet |
| sheet | unchanged, pixel for pixel in the tube |
| footprint (sheet drawn under the ribbon) | unchanged |
| whitewater (spray + impact) | unchanged |

**The ribbon carries them.** Not the sheet's grid: the plan's lead is refuted.

## What in the ribbon (close cameras, t+3)

- `huge-along/none-408.31.png` (camera (53, 12, −225), yaw 330.9°, looking along the closeout like the stand but 120 m
  off, crop `along-crop.png`): the closeout is a long tube that **jogs sideways**: each "tooth" is the rounded end of
  one stretch of tube where the next stretch sits metres further across the crest. From the stand (≈10° off the line,
  460 m) those ends read as dark blocks with vertical edges.
- `huge-side/none-408.31.png` (camera (109, 15, −368), side-on): the same tube looks smooth; one vertical seam where
  it jogs.

## The numbers (CPU, `scratchpad probe1/probe2`: crestTrace.traceStations at the stand's spacing, the w1 run)

The drawn section, station to station (sectionOf on the sheet along each station's n), is smooth: the largest move of any
profile point between neighbours is 0.1–0.9 m on the closeout, 1.3–1.6 m at the curl front (t+3 z −324…−317), 2.6 m at
t+5's curl front (z −385). No phase or hollow threshold steps the profile.

The **stations' positions** jog across the crest. Per 4 m step along t (the station's smoothed normal n):

    t+3   z −323.8 → −320.9   across +2.74 m (the curl front; τ there 21.16 → 21.41 s)
          z −263.8 … −248.3   +0.46, +1.46, +0.56, −2.02, −1.09 (a zigzag)
          z −244.5 … −233.0   +1.16, +0.17, −1.58
    t+5   z −386.7 → −384.6   across +5.16 m (the curl front; τ 23.33 → 23.81 s)
          z −354.1 … −342.6   +0.85, −0.90, −0.51
          z −246.7 → −239.1   +2.07, −2.15

Elsewhere the steps are ≤ 0.2 m. ξ is ≤ 0.01 s at every station (on the crest: the jogs are the crest line itself, the
field's arrival time τ kinking along the inside leg, not the trace's projection). The section's numbers and normals are
smoothed along the line (fillSections, σ 4 m); the positions are not, so the tube's axis follows every kink: a 2–5 m
sideways step over 4 m of crest is a 35–50° bend, which the 5 m-wide tube draws as one stretch ending and the next
beginning beside it.

Why the shelf-polish spacing cap did not help: the kinks are in τ at fixed places; denser stations sample the same
kinks.

## The sheet, for the record (CPU sumWaves across the crest every 1 m; the sheet's polar cell = r × 0.0164)

At the closeout the stand's sheet cells are 6.5–9.1 m (r 394–566 m) while the front's 10–90 % drop is 3–12 m wide; the
sheet's linear interpolation at its cell misses the true water by 0.6–2.4 m there. That is real, but it is hidden under
the footprint (the no-footprint frame is identical): it is not what the stand sees as steps.

The footprint's cut: 0.5 m texels over the reef grid (z −450…300), so the whole run (z −412…−137) is inside it; the
no-ribbon frame shows the hole covering the run.
