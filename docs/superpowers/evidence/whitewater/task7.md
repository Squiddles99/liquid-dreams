# Task 7: the mist slab and soft particles (evidence)

| file | what |
|---|---|
| `ab-task7-tube.png` | strong offshore 18 kn E, tube cam (M-tube), Task 6's branch (top) vs Task 7 (bottom), 403.67 / 404.67 s |
| `backlit-plume.png` | photo 2's moment: 12 ft, strong offshore, 17:00 (sun beyond the break from the lookout), 403.17 s and +60 s (461.17) |

Costs (idle machine, interleaved, `_rideProfile --ft=7 --sim-t=300 --wind=18,90`, window focused every run):

| | main | branch | bar |
|---|---|---|---|
| cam median (3 pairs) | 5.4 / 5.3 / 5.3 ms | 5.4 / 5.3 / 5.3 ms | slab ≤ +1.5 ms; since Task 0 ≤ +2.5 ms |
| riding median (3 pairs) | 26.6 / 27.9 / 26.2 → 26.6 ms | 27.3 / 26.8 / 28.7 → 27.3 ms | ≤ 1.10 × (1.03 ×, +0.7 ms) |

The first run (slab evaluated everywhere) read riding 26.6 vs 28.3 ms (+1.7, all three pairs slower); the slab now skips its
light and path where the map holds no mist (MIST_MIN: T within 1e-4 of 1 over the longest path), the plan's first lever.

GPU self-tests (branch): foam 11/12 (surf red = main's, identical 0.4512), with the new "GPU mist channel matches
mistSlab.stepMist" (max 0.00048); spray 4/4; ribbon 6/7 (footprint red = main's). Unit: mistSlab 10/10, sprayStep 9/9;
src/whitewater reds = main's three sprayEmitters timeouts.
