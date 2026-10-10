# level-read Task 5: the Pumping down-the-line frame (womb-retune task6 command, t = 404.17 s, 2379x1257 captureFrame PNG)

Files (outside the repo): `../liquid-dreams-captures/level-read-2026-10-10/`
- `before-Pumping-tide0-dtl-404.17.png`: Task 0 tree (main 9b5e7e2's code)
- `after-Pumping-tide0-dtl-404.17.png`, `after2-...`: branch head (C alone), two captures
- `compare-band.png` (before / after / |diff|x6, rows 440-800, half size), `diff-x8.png`, `diff-mask.png`

Noise floor: after vs after2 **0 pixels differ** (capture is deterministic), so every difference below is C's.

| region | pixels differing | > 16 levels | > 32 levels | mean change where differing |
|---|---|---|---|---|
| whole frame | 53,622 (1.79 %) | 6,590 | 3,282 | 7.1 |
| the spray plume over the peak (x 1080-1280, y 440-640) | 19,210 | 4,839 | 2,411 | 12.4 |
| the rest (the sheet and the ribbon, rows 551-731) | 34,412 | 1,751 | 871 | 4.2 |

**Not pixel-identical in the ribbon region.** By eye (compare-band.png) the wave's shape, the lip line and the shoulder
read the same. The plume's puff is a different shape: spray births read the stations' onset times, and C changes the
band-edge times they read. The rest is thin lines along the lip and the shoulder's crest, where the sheet and ribbon read
the same onset times.
