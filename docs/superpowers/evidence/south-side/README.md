# South side: evidence (2026-10-11)

Spec `specs/2026-10-11-south-side-design.md`. Baseline = main 41e1ea9 (the spec's 9ab4bbb plus the spec commit). After =
branch `south-side` with `RIGHT_SHAPE` replaced by the spec's trace.

| file | what |
|---|---|
| `vitest-reds-before.txt` | full `npx vitest run` on the baseline: 38 reds (2066 pass) |
| `vitest-reds-after.txt` | the same after the change: 75 reds (2029 pass) |
| `vitest-diff.txt` | new reds (with each failure's message) and reds gone green |
| `claims-before.txt`, `claims-after.txt` | `npm run claims` (the left's claims; they read only `NORTH_LEDGE`) |
| `bed-lines-before.txt`, `bed-lines-after.txt` | `tools/_southEdge.ts`: `bedHeightAt` along z 200, x −120, across the edge at x −100/−40/20, and the edge's normals |
| `right-ride-before.txt`, `right-ride-after.txt` | `tools/_southRight.ts`: the right's reefReport rides, 6/8/10/12 ft, tides −0.5/0/+0.5 |
| `before-andrew-30.00.png`, `after-andrew-30.00.png` | Andrew's camera (−94, 33, 117) yaw 204 pitch −24, 10 ft 15 s 225°, paused |
| `before-topdown-30.00.png`, `after-topdown-30.00.png` | the spec's top-down (−60, 140, 60) yaw 180 pitch −60 (it looks south) |
| `after-edge-north-30.00.png` | (−40, 140, 100) yaw 0 pitch −60: looking north over the new edge |
| `moments.txt` | the three moments, base64 for `tools/captureMoments.mjs --m=` |
| `timeouts-rerun.txt` | the after run's timed-out files re-run alone |

## Bed lines (after)

- The old square is basin: z 200 is −15 m from x −200 to −100 (before: −4 m from x −155); x −120 is −15 m from z 200 to
  280 (before: −4 m to z 240).
- Across the new edge (z 0 → 80): x −100 shelf −2.9 to −3.6 m to z 15, −5.6 at 20, −11.0 at 25, −15 by 30; x −40 −3.5 at
  z 20, −5.1 at 25, −10.4 at 30, −15 by 40; x 20 −3.5 at z 40, −5.3 at 45, −10.7 at 50, −11.5 from 55 (the coast's
  offshore band, shallower this close in).
- Normal profiles at the trace's (−100, 15.9), (−40, 21.5), (20, 41.2): ledge depth 3.5 m on the edge, −6.5 m 5 m out,
  −12 m 10 m out, −15 m (−12 at x 20) by 15 m: the ledges' own face, no special taper (spec).

## The right

See the table in `../../handover/2026-10-11-south-side-fable.md`. The first 40 m of the new `SOUTH_LEDGE` (the stub then
26 m east), first-to-last break time:
**1.52–1.86 s** at every size and tide (6 ft 1.72/1.76/1.86, 8 ft 1.52/1.68/1.79, 10 ft 1.63/1.72/1.72, 12 ft 1.63/1.68/1.60
at −0.5/0/+0.5 m), peel 16.4–19.4 m/s: `rideOf` reads it "barrel" (soft at 6 ft +0.5) except 8 ft −0.5 m ("closes out",
19.4 > 18). The old ledge's first 40 m spread 1.81 s at baseline (`breakingField:221`, already red). So the first 40 m is
about as fast as before; what is new is that the 48 m east of the stub peels 11–12.5 m/s.

## bake:map

`public/ui/breakMap.json` rebaked (12.2 KB → 8.6 KB: the reef contours lose the square). The bake makes no offered pairs;
those are the `smallSwell.test.ts` matrix rows (Fun −0.5 m and Solid +0.5 m red on the left's peel, 0.30 and 0.13 m/s off).

## Timeouts

The after suite ran alongside another session's heavy job and my captures; 12 tests timed out at 5 s. The eight files
re-run alone (03:12, `timeouts-rerun.txt`): 148/149 green; the one red is a real one, `bathymetry` "is shallow on the
shelf" (7.48 m vs < 4). So the timeouts in `vitest-diff.txt` (BreakingRibbon.limits ×5, breaking foam, wombProfile, plants
×2, landBuild 539 ms, bathymetry determinism, coastMap halo, shoreReef sand) are load, not the change.
