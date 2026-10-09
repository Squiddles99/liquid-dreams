# Womb retune: Opus handover (2026-10-09)

Branch `lineup-truth` (worktree `../ld-lineup-truth`), pushed, **not merged**. Plan
`docs/superpowers/plans/2026-10-09-womb-retune.md`; ledger `.superpowers/sdd/2026-10-09-womb-retune/progress.md` (git-ignored);
rulings and numbers for Fable/Andrew in `2026-10-09-womb-retune-fable.md`.

## What landed (main..lineup-truth, womb-retune part)

| commit | what |
|---|---|
| c81b507, 5d72872 | probes: coast-seeded `_smallSwell --coast`, `_wombDatum`, `_reefSweep`, `src/breaker/testField.ts` `coastReefField` |
| cafddcc | the dial is a buoy reading at the coast seed (ruling C): Snell's p and the flux reference at `seedDepth` (29.7 m) |
| 4228b58, 5edd012 | the reef sweeps (Task 2: 71 rows; Task 2b: tip × ledge length × bearing) |
| d19b2e0, 0da3dd7, 6a68de1 | TIP (−130, 0), one 46° 180 m ledge; scene follow-through (τ, set waves, peakFace, lineup, surfer, break map, reef-wall probe, self-test points); `_retuneMoments` |
| 0344983, 6684b1f | reef/breaker tests on `coastReefField` per offered band × tide |
| fea7a87, 3d71e5a | select screen: BREAKS re-measured, "Womb faces ~N ft" (FACE_FT), presets Fun→Solid |
| 96126ee | ride pinned per offered band; Solid int/exp lost (anchor on the right) |
| a38b4eb | Fable's Task 5 ruling: TAKEOFF_ANCHOR = TIP; Fun at Low; FACE_FT uncapped; Fun×Low ride cases (lost) |
| 55e6beb | `tools/_bedAround.ts`, `tools/_sheetEta.ts` (the marks in the frames) |
| (Task 6) | surferParams pin follows TIP; captures + this handover |

## The ride (rideOnSections, coast-seeded field, 225°)

| case | tide | held s (bar ≥ 10) |
|---|---|---|
| Solid × intermediate | 0 | 14.28 |
| Huge × intermediate | 0 | 15.08 |
| Solid × beginner | 0 | 14.27 |
| Solid × expert | 0 | 14.28 |
| Fun × intermediate | −0.5 | **1.63** (rode 7.63) |
| Fun × beginner | −0.5 | **0.00** (rode 3.60) |
| Fun × expert | −0.5 | **0.00** (rode 4.18) |

Fun at Low (traces `evidence/womb-retune/ride-trace-Fun-*.txt`): wave 2.02 m, curl 10.6 m/s along the ledge, slope under the
board 0.04–0.12 once up; she peaks at 8.4 m/s and fades behind the crest. Size against peel; not pop-up, bot or camera. Open
for Fable (in -fable.md).

Frame times (`_rideProfile --sim-t=300`, 6 ft intermediate, same session, same machine): main cam 3.8 / paddle 9.5 /
riding 46.0 ms median; lineup-truth 3.5 / 10.6 / **51.7** ms (riding p90 53.2 → 75.6). Logs
`../liquid-dreams-captures/womb-retune-2026-10-09/prof/`.

## Full suite (idle machine, Task 6)

lineup-truth: 2050 tests, 53 failed (52 after the surferParams re-pin). Idle baseline `ld-datum-before` (4f70490, the
merge before womb-retune): 2046 tests, **65** failed (Task 0's 89 was the 13-process load). Red on the baseline only:
plants ×5, landBuild 500 ms, BreakingRibbon.limits ×6, shoreReef, bathymetry and others: timing/flaky or fixed by this branch. Files: `task6-fails-names.txt`, `task6-baseline-names.txt` in the ledger dir.

Red on lineup-truth and not in the idle baseline (17 after the re-pin). All are bars on the new field: no crash, NaN or
GPU/CPU mismatch among them. **Carried as merge debt** (Fable's ruling 6; a "re-pin the breaker bars on the real shelf" segment):

| test | measured | bar |
|---|---|---|
| breakingField: face before it breaks, no terrace (6 ft, north ledge) | terrace 6.5 m at 40 m up, −2 s | < 3 m |
| breakingField: onset → tube closure at the peak | 0.51 s | ≥ 0.55 s |
| breakingField: highest water moves with the wave | stood still 4 steps | ≤ 2 |
| breakingField: the pile never grows while it stands | 2.066 m | ≤ 2.028 m |
| breakingField: along a ray the pile reads the same lip | spread 0.065 | < 0.05 |
| breakingField: the breaking peak stays tallest (6 ft) | peak 2.05 m | ≥ 2.10 (shoulders 2.21) |
| breakingField: 6 ft, lift 20 m in front | 0.277 | < 0.25 |
| coastBreaking: 8 ft no closeout | 167 cells at (−32…−48, −988…−972) | 0 (carried, ruling 5) |
| crestTrace: the left peels at 8–20 m/s | 7.98 m/s | > 8 |
| crestTrace: one curl, one clock, 6 ft | 9 violations | 0 |
| crestTrace: one curl, one clock, 8 ft | 1 violation | 0 |
| crestTrace: station ψ = sheet crest ψ | 1.4e-4 | < 1e-6 |
| reefField: until carries the hold back along its ray | 8 jumps (0.020–0.040 s) | 0 (0.02) |
| sprayEmitters: mid-throw emitters on the lip | 2 | > 3 |
| rideOnSections: Fun × Low × int/beg/exp | 1.63 / 0 / 0 s | ≥ 10 s (open for Fable) |

Also red but already red in the idle baseline (not this segment's): reefField lean/slurp and march, lipProfile 2, barrelSize 2,
setWaveModel 2, wombSection, wallDownTheLine, reefReport, reefPsi, peakFace, SetWaves, BreakingRibbon.limits 2, crestTrace
others, breakingField others, sprayEmitters 4 (see the names files). 11 of lineup-truth's own 44 reds are now green.

## The marks in the frames (Task 6 item 7): found, carried

- **Beige quads** on the breaking line in the stand frame are drawn by the **water sheet** (OceanSurface). Hiding each of the
  231 scene children in turn (`layerHunt.mjs` in the session scratchpad, layers mask 0, diff on the quads' crop), only the
  sheet removes them; hiding the ribbon leaves them; no debug overlay colours them. They sit at ≈ (4, −226)…(−17, −275) at
  Pumping t+3, on the inside leg past the ribbon's run end, and travel with the crest (~6 at t+5). Bed there smooth
  (`tools/_bedAround.ts`); the GPU's height (HeightProbe.readNow, 48 points) and the CPU twin (`tools/_sheetEta.ts`) agree
  within the Lagrangian shift: crest ~2.3 m, front dropping ~3 m in 3 m, no spike. So: the sheet's coarse far grid folding on
  a steep front face the ribbon no longer draws (each well is one vertex's diamond). Not a placement that missed the tip (the
  footprint grid is REEF_GRID's; pockets and warp follow TIP). Carried.
- **White dots on the lip** (down-the-line frame) vanish with the ribbon hidden: the ribbon's own shading. Carried.

## Gotchas

- Captures need the worktree's dev server: a temporary `ld-lineup-truth` entry (port 5189) in `liquid-dreaming/.claude/launch.json`,
  removed again at the end (Fable's ruling 8). Close the preview pane's tabs before Electron captures (they render the game too).
- `captureMoments.mjs` boots ~30 s per command; `_retuneMoments.ts` prints the commands (`--bands`, `--times`, `--tide`).
- vitest prints a passing test's console only with `--silent=false`.
- `../ld-datum-before` has a node_modules **junction**: `cmd /c rmdir` it before `git worktree remove`.
- `?coast=off` still in (plan Task 6.3: removed only when Fable says, after Andrew's look).

## Left

- Fable: Fun at Low (offered, unrideable: see -fable.md).
- Andrew's look (captures in `evidence/womb-retune/captures.md`), then merge (Andrew's call).
- Merge debt: the bars above; the sheet fold past the ribbon's end; boot cost not re-measured (no bar).
