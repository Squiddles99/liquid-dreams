# The shelf's south side: the satellite's, not a square (2026-10-11)

Andrew, 2026-10-11: "Why is the reef an ugly square?" from a free camera above the lineup
(moment: position (−94, 33, 117), yaw 204°, pitch −24°, 10 ft at 15 s from 225°). Ruling (Andrew, after seeing the
satellite zoom): **literal trace**.

## What is wrong

`wombReef.shelfPolygon` closes the shelf with a straight east–west leg at z 242 where the right's ledge (`RIGHT_SHAPE`,
242 m "a little seaward of due south") ends. The 4 m shelf meets the 15 m basin in a ~20 m wall along that leg and down
the right's ledge (x ≈ −160), so from above the shelf reads as a rectangle with a square south-west corner. Verified:
`bedHeightAt` along z 200 is −4 m to x −160 and −15 m by x −180; along x −120 it is −4 m to z 240 and −15 m by z 260.
(A first hypothesis, the kelp canopy's 128 m window, was wrong; its fix stayed as an improvement, main 9ab4bbb.)

## What the satellite shows

`reference/place/womb-correct-topdown-peak-189m-offshore.webp` (north up; the 188.66 m bar is 461 px, 2.443 px/m; the
bar's west end is the peak). In metres from the peak, x east, z south:

- North of the peak (z < 0) the pale shelf fans out: the left. Unchanged here.
- South of the peak the water is dark within 10–20 m, for every x from the peak to the shore platform.
- The shore platform (broken white water) runs from x ≈ 115–120 to the beach at x ≈ 185, all the way south.
- So the shelf's south edge runs **east** from about 12 m south of the peak, drifting a little south, into the platform's
  seaward edge at about (117, 35). The right is a stub.

`3.png` in `reference/place/new-sattelite-and-bathymetry-references/` (wider view, "The Womb" pin) agrees: the reef is
north of the pin; south of it only the inshore platform is pale.

## The trace, in game metres

Game x runs from the tip at TIP = (−130, 0) to the waterline SHORE_X = 94 (224 m) where the satellite has 189 m: scale
x by 1.185 from the peak; z unscaled. The game's platform is SHORE_REEF_AT_MAP_M = 40 m wide (seaward edge x 54), the
shelf's inshore edge SHELF_INNER_X = 64. The south edge therefore runs from the tip to SHELF_INNER_X:

`RIGHT_SHAPE` (relative to the tip) becomes, in order from the tip:

| ref (x, z) | game offset (x, z) | note |
|---|---|---|
| (0, 0) | (0, 0) | the tip |
| (−1, 12) | (−1, 14) | the stub: the right's ledge, 14 m |
| (40, 14) | (47, 17) | |
| (80, 18) | (95, 22) | |
| (100, 25) | (118, 30) | the dark water's tongue toward the platform |
| (117, 35) | (139, 40) | |
| — | (194, 46) | SHELF_INNER_X (x 64): the polygon's inner leg starts here |

Opus may move any interior point by ≤ 5 m to keep the edge smooth; the stub's length (12–16 m) and the end at
SHELF_INNER_X are fixed. The last point's x must equal SHELF_INNER_X − TIP[0] so `shelfPolygon` adds no extra leg.

## What must not change

- The left: `NORTH_LEDGE`, `LEFT_BEARING_DEG`, `LEFT_LEDGE_M`, `TIP`, every `ReefParams` depth, the warp, the sand
  pockets, `SHELF_INNER_X`, the map grid, the coast map. The left's stretches in `satelliteReef.test.ts`, the
  one-curl/ride/level-read bars and the breaking map's offered pairs are the regression set.
- The wall's profile: the face (ledge 6 m → faceBase over faceWidthM, then the slope) already applies along the whole
  polygon boundary, so the new south edge gets the same drop as the ledges. Do not add a special taper; the ugliness was
  the straightness and the square corner, not the drop.
- `edgeFade` (230 → 299) stays: it still fades the seaward rock before the map's south edge.

## What may change, and is reported, not fixed

The right. Its first 40 m now lie along an edge running east, which a 225° swell meets at ~45°: the field may peel it
east as a makeable right instead of closing it out. The tests that pin "the south ledge's first 40 m break within 1.5 s"
(`breakingField.test.ts:221`, `crestTrace.test.ts:130`, `reefField.test.ts:60`, `satelliteReef.test.ts:49` right
`closes out`) measure along the new `SOUTH_LEDGE`. If they go red: **STOP** and report the numbers (onset spread,
`reefReport` ride for the right at 6/8/10/12 ft, both tides). Do not retune depths, bearings or thresholds to force a
closeout, and do not delete or loosen the tests. Andrew observes the real right closing out; whether the model's does
over the traced edge is his to read.

## Evidence (docs/superpowers/evidence/south-side/)

1. Baseline on main 9ab4bbb before any change: full `npx vitest run` red list (there are known reds: an expert ride
   test, breaker bars); `npm run claims`; `bedHeightAt` lines z 200 / x −120 / and the new edge's normal at three points.
2. After: the same, diffed. The bed lines across the new edge at x −100, −40, 20 (z 0 → 80, 5 m steps).
3. Captures: the top-down (moment with position (−60, 140, 60), yaw 180, pitch −60, paused) and Andrew's camera (above)
   before and after; `tools/captureMoments.mjs` or the moment hash on the dev page.
4. The breaking map rebake if `bake:map` reads the reef (`npm run bake:map`), and its diff of offered pairs.

## Process

Worktree `../ld-south-side`, branch `south-side` from main 9ab4bbb; node_modules as a junction to main's
(`cmd /c mklink /J`), removed with `cmd /c rmdir` before any `git worktree remove`. Commit after every step. Push the
branch. Do not merge. Handovers: `docs/superpowers/handover/2026-10-11-south-side-opus.md` (commits, tools, gotchas,
evidence index) and `-fable.md` (rulings needed, carried items, the "for Andrew" list), as the shelf-polish pair.
