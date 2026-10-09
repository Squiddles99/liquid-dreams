# Lineup truth: handover for the next Opus

**Branch** `lineup-truth` from main be21485, pushed, **not merged** (waiting on Fable/Andrew: the coast moves the Womb,
see `-fable.md`). Ledger `.superpowers/sdd/2026-10-09-lineup-truth/progress.md` (git-ignored; rulings copied to `-fable.md`).

## Commits

| commit | what |
|---|---|
| 255ee67 | T0 `src/seabed/coastContours.ts` (10–30 m contours, `contourDepthAt`), `tools/_lineupTrace/`, `evidence/t0-tracing.md` |
| 69b3e50 | T1 `coastMap.ts` (`buildCoastMap`, `wombHalo`), `coastFeatures.ts` (params, features, footprints), `COAST_GRID` nx 501, `COAST_WATERLINE` |
| d9c32c3 | T2a `breaker/waveField.ts` `solveWaveField` (refactor alone; reef tests same names before/after) |
| 1240c6a | T2 `breaker/coastField.ts` (`computeCoastField`, `coastSample`, `coastSeed`), `ReefFieldRequest.coast / coastField`, worker builds + caches, `?coast=off`, `tools/_fieldCost.mjs` |
| 6550012 | T3 `SetWaves` coast textures + `hasCoast`, `sampleField` coast branch (`coastDrawn`, `REEF_BLEND_M` 40, `COAST_EDGE_BLEND_M` 100), coast GPU self-test, sets crest 5–7 km, window after 150 s |
| fe1aab4 | T4 `breaker/coastBreaking.ts` + test, `tools/_coastBreaks.ts`, tuned shelf/ramp/Bombie, Cobblestones zone, Coast dev-panel folder |
| (T5) | `tools/_coastRide.ts`, `_lineupMoments.ts`, `_lookoutSets.mjs`, `_rideProfile --query`, `_selftest --max-s`; evidence, these notes |

## Suite

Baseline (branch start be21485): **2004 tests, 61 failed** (23 files; several timeouts under load).
After (T4 HEAD, full suite): **2033 tests, 44 failed** (16 files). One new red by name: BreakingRibbon.limits "aboveMaterial:
at most 8 storage buffers and 16 sampled textures per stage" (17: the coast texture) — **fixed in T5** by packing the coast
field's two textures into one and the far field's two into one 2-row texture (limits + SetWaves 22/22 after). 18 baseline
reds now green (mostly timeouts). Lists: `.superpowers/sdd/2026-10-09-lineup-truth/fails-baseline-names.txt`, `fails-after-names.txt`.
src/ride: 92 passed / 3 skipped on branch and main alike (heldS identical; those tests use no coast).

## Tools

- `npx node tools/_coastBreaks.ts [--sizes=…] [--params='{…}']`: breaking maps per size, ASCII, zones.
- `npx node tools/_coastRide.ts`: rideOnSections' four rides, far-field vs coast seed.
- `npx node tools/_lineupMoments.ts`: capture times and `captureMoments.mjs` command lines.
- `npx electron tools/_fieldCost.mjs --boots=3`: field build cost, coast on/off alternating.
- `npx electron tools/_selftest.mjs --base=… --filter=breaker --max-s=2400`: the breaker suite takes > 10 min (14/14 pass).

## Gotchas

- Never `cat > file` without a heredoc in the Bash tool: it waits on stdin (a 2-minute hang).
- The coast field's `tau` and `far.tauOffset` are moved onto the reef field's clock inside `computeReefField`: pass a
  copy (`fieldWorker.cloneCoast`).
- `coastSeed` (the reef's seed) is not `coastSample` (what the sheet draws): it adds back the far field's 4 m interpolation
  error alongside the Womb (≤ 4 ms). The GPU mirrors `coastSample`.
- Scratch tests in `src/_probe_tmp` break the launcher's tsc build: delete them (done).
- A `main` worktree for A/B lives at `../ld-main-ab` with a **junctioned** node_modules: `cmd /c rmdir ..\ld-main-ab\node_modules`
  before `git worktree remove`. `.claude/launch.json` carries a temporary `ld-main-ab` entry (5174): restore it.

## Left

Fable's ruling on the Womb (options in `-fable.md`); the old `src/bombie` vs the coast's Bombie; the seabed render
outside the reef map; a far foam layer (spec §5); boot cost on Andrew's machine; persisting the Coast dials.
