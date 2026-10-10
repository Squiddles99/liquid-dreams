# South side: for Fable (Opus 5.5, 2026-10-11)

Branch `south-side` (worktree `../ld-south-side`) from main 41e1ea9 (the spec says 9ab4bbb; 41e1ea9 is 9ab4bbb plus the
spec commit only). Spec `specs/2026-10-11-south-side-design.md`. Evidence `docs/superpowers/evidence/south-side/` (index
in its `README.md`). Commits, tools and gotchas: `2026-10-11-south-side-opus.md`.

## STOP: the right no longer closes out (spec "What may change, and is reported, not fixed")

`RIGHT_SHAPE` is the spec's table verbatim (no interior point moved): `[[0,0],[-1,14],[47,17],[95,22],[118,30],[139,40],
[194,46]]`, so `SOUTH_LEDGE` = (−130,0) (−131,14) (−83,17) (−35,22) (−12,30) (9,40) (64,46); the last x is SHELF_INNER_X
and `shelfPolygon` adds no leg. Nothing else changed in `src/`. I stopped there: no depth, bearing, threshold or test
touched.

**The right peels, as the spec foresaw.** `tools/_southRight.ts` (reefReport `leftStretches` on the game's field,
`coastReefField`, 225°; `right-ride-before.txt` / `right-ride-after.txt`):

| ft (s) | tide | before: r0 / r1 (old ledge legs 50 m, 101 m) | after: r0 = the 14 m stub | after: r1 = the first 48 m east | after: first 40 m |
|---|---|---|---|---|---|
| 6 (14) | −0.5 | closes out −21.5 / −22.9 | closes out −27.9 | **barrel 11.6 m/s**, hollow 0.96 | 1.72 s, peel 17.0 (barrel) |
| 6 (14) | 0 | closes out −21.9 / −23.4 | closes out −27.8 | **barrel 11.4**, 0.66 | 1.76 s, 16.6 (barrel) |
| 6 (14) | +0.5 | closes out −22.6 / −23.8 | closes out −25.3 | **soft 10.7**, 0.53 | 1.86 s, 16.4 (soft) |
| 8 (15) | −0.5 | closes out | closes out −33.4 | **barrel 11.9**, 1.00 | 1.52 s, 19.4 (**closes out**) |
| 8 (15) | 0 | closes out | closes out −27.0 | **barrel 11.9**, 1.00 | 1.68 s, 17.6 (barrel) |
| 8 (15) | +0.5 | closes out | closes out −25.1 | **barrel 11.9**, 0.77 | 1.79 s, 16.6 (barrel) |
| 10 (16) | all | closes out | closes out −29 to −32 | **barrel 12.4** | 1.63–1.72 s, 17.2–17.6 (barrel) |
| 12 (17) | all | closes out | closes out −28 to −31 | **barrel 12.3–12.5** | 1.60–1.68 s, 17.3–18.0 (barrel) |

(A negative peel is a section breaking from its far end back toward the tip at once: `rideOf` reads it as a closeout.)
"First 40 m" = the stub plus 26 m east, first-to-last break time and peel. Every point of the stub and of the first
48 m east breaks (6/6, 20/20). The stub still stands up at once; the edge running
east from it peels at 11–12.5 m/s, a makeable barrelling right, about the left's own speed (11.3–12.1).

**The four closeout pins** (spec: `breakingField.test.ts:221`, `crestTrace.test.ts:130`, `reefField.test.ts:60`,
`satelliteReef.test.ts:49`):

- `satelliteReef` "…the right close out at every tide": **red for Solid, Pumping, Big, Huge** (first failure each at −0.5 m:
  `expected 'barrel' to be 'closes out'`). Green before. This is the STOP.
- `breakingField` "the right closes out: …first 40 m breaks within 1.5 s": **red before (spread 1.81 s) and after
  (Infinity: a point in the first 40 m never reaches onset for one of the two test waves)**.
- `crestTrace` "the right closes out: …broke within 1.5 s": **red before (21 sections, spread 1.84 s) and after (7
  sections, needs > 15)**. Note its geometry: it walks 40 m along `SOUTH_LEDGE[0] → [1]` only, which is now the 14 m stub,
  so its last 26 m are extrapolated due south into the basin. The test no longer measures the edge it names; I did not
  edit it (spec: never loosen tests).
- `reefField` "peels along the north ledge and stands up at once along the south ledge (the A-frame)": **green** before and
  after (the south 40 m's τ spread is still less than the north's).

## Rulings wanted

1. **The right.** Accept a peeling right off the stub (the trace is literal, and the model says a 225° swell peels an
   edge running east at ~45°), or keep the right a closeout by some other means (the spec forbids retuning depths/bearings/
   thresholds here). Andrew observes the real right closing out; the spec leaves the reading to him.
2. **The other new reds (left-side regression set).** The south side moved the field around the tip, and several bars that
   are about the left moved with it (reasons in `vitest-diff.txt`). Not load: these are assertion failures, not timeouts.
   - `smallSwell` select matrix: Fun −0.5 m and Solid +0.5 m — the left's first-leg peel moved 0.30 and 0.13 m/s against a
     0.06 tolerance (broken/of, start and hollow held). The pinned matrix rows need re-measuring or the change rejected.
     Whether any offered pair changes is not measured here (no bake produces them; `bake:map` only draws the contours).
   - `crestTrace` one-curl at 6/8/12 ft: one violation each (`t + 6, arc −13.0: until 2.54 after 2.75` at 6 ft) — arc −13
     is on the right's side of the curl, i.e. on the new edge.
   - `reefField` until/hold (`5.99 < 5.75`; "the line first breaks at the right's far south end": 0, the right's far end
     is no longer 242 m south), onset-record running max (−107, −22: 0.39426 vs 0.39438, a 4e-4 slip).
   - `breakingField` sheet bars at the tip and the left's first 25 m: never un-breaks (0.9553 vs 0.9555), the probe's
     fixed point at (−105.3, −3.6) (0.27 vs < 0.03), face re-steepening at 12 ft (0.22 vs < 0.1), the pile at (−108, −21)
     (1.11 vs ≤ 1.04).
   - `reefCriteria` §2.1 "nowhere does a 12 ft set break > 30 m (40 m at low) seaward of the ledges": (26, 120) at low tide
     breaks 77.7 m from the nearest ledge. That point used to be on the shelf (the old square); it is now basin 70 m south of
     the new edge, inshore, where the coast's offshore band shoals it (bed −11.5 m at x 20). The 12 ft set breaks there on
     the coast, not on the reef.
   - `bathymetry` "is shallow on the shelf (its base depth or less on average)": 7.48 m vs < 4 — its sample points must
     include the old square's south area, now basin. `reefWallProbe` (2 tests): the probe's ray no longer meets the reef
     (−1), presumably aimed at the old west wall south of the tip.
   - `crestTrace` station spacing / timeSinceOnset / determinism / ψ, `sprayEmitters` births/emitters, `lipFoam` 4 ft,
     `tubeLight` 8 ft high, `flow` 12 ft draw (2.78 vs ≥ 3): fields/waves sampled at the tests' own points around the
     peak. Each is a measured change of the wave, not a crash; which of these sample the old square I have not traced.
   - Timeouts (5 s) in the parallel run (machine shared with another session's heavy job): the eight files re-run alone
     are green but for `bathymetry` "shallow on the shelf" (real, above). Load, not the change.
3. **Six baseline reds went green** (crestTrace on-crest |ξ|, lipProfile foam zones, peakFace 6 ft, reefField lean,
   setWaveModel ψ drain, shoreReef open coast): listed, not claimed as fixes; some were load timeouts at baseline.

## Carried

- `breakingField:221` and `crestTrace:130` were already red on main (1.81 s, 1.84 s): they were not guarding a closeout
  before this branch either.
- The crestTrace closeout test's geometry (first leg only) and the bathymetry/reefWallProbe sample points assume the old
  242 m right; they need a ruling on what they should measure now, not a loosening.
- The kelp/sand pockets (pale ovals) seaward of the left in the north-facing capture are unchanged by this branch.

## For Andrew

- Before/after captures of your camera and the top-down (`evidence/south-side/before-*.png`, `after-*.png`), plus
  `after-edge-north-30.00.png` looking north over the new edge (the spec's top-down camera looks south, so after the change
  it shows only basin: the shelf is gone from both your views, which is the trace).
- The right now peels east off a 14 m stub, 11–12.5 m/s, barrelling at 6–12 ft. Is that the Womb's right, or does the
  real one close out on a shape the trace does not show?

## My reading

The bed matches the trace: south of the peak the shelf ends 14–46 m south (−4 m on the shelf, the ledge's 3.5 m at the
edge, −6.5 m 5 m out, −12 m at 10 m, −15 m by 15 m; −11.5 m east of x ≈ 10 where the coast's offshore band is shallower),
and the old square's west wall (z 200: −4 m to x −160) and south leg (x −120: −4 m to z 240) are basin, −15 m. From above
the shelf is now a wedge pointing at the peak with its south side running east into the platform, not a rectangle. The
corner at (−12, 30)–(9, 40), the "tongue", reads as a visible kink in the capture; the spec allows ≤ 5 m smoothing and I
left the points as traced. What the right does is the open question above: on this model it is a second makeable wave.

## Fable's review and ruling (2026-10-11, Andrew asleep, delegated)

Evidence verified: Andrew's camera after the change shows open basin (the square is gone); the north-facing capture shows
a sharp-tipped wedge with its south side running east into the platform, the satellite's plan shape, with one visible
kink at (−12, 30)–(9, 40). The bed lines across the new edge are the ledges' own face. The claims are unchanged.

**The left's "regression" is the shape, not a bug.** On main with only `southLedge` swapped, the bed north of the tip
differs in 562 cells by at most 0.089 m (at (−102, −0.5)); the 0.30 / 0.13 m/s peel moves in the select matrix come from
the field solving over the traced shape (the swell now crosses a south edge 14 m from the tip), not from the drawn left.
Any south edge this close to the tip moves those rows; re-pinning them is the honest fix if the shape stays.

**The right is the open ruling, and it is Andrew's** (the spec's STOP, which he set). In this model a 225° swell meets
an edge running east at ~45° and peels along it at the left's own speed; the engine is built for one curl, one clock
(R2/R3), so the one-curl checks, the until/hold bars and the ride stack now see a second curl they do not model. The
satellite's shape and the game's physics disagree about the right. I do not spend more of the budget on a shape
experiment without him. Branch held at e6cde28, pushed, **not merged**.

Options for Andrew, cheapest first:

1. **Rounded corner, old right (no physics change).** Keep the 242 m closeout ledge; replace only the square closing leg
   with a slanted or rounded south-west corner, ~60 m radius. Fixes the view from his camera; the shelf stays wider than the
   satellite's. One Opus task, the regression set should stay green but for the bars that sample the old corner.
2. **This branch, plus a gentler south edge.** Keep the trace but drop the shelf to the basin over 60–80 m along the south
   edge instead of the ledge face, so no lip stands up on it (soft or no break; the stub keeps its closeout). Needs a probe
   first: the one-curl checks may still see a curl there. One Opus task plus a re-pin of the select matrix rows.
3. **Accept a two-wave peak.** The engine would need to model a second curl. Not this phase.

Recommendation: 1 now (the ask was the square), 2 as the next experiment if he wants the satellite's wedge.
