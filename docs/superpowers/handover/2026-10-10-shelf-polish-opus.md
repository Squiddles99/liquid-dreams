# Shelf polish: Opus handover (2026-10-10)

Branch `shelf-polish` (worktree `../ld-shelf-polish`, node_modules a junction to main's: `cmd /c rmdir` it before any
`git worktree remove`), from main a9e79ea, pushed, **not merged**. Spec `specs/2026-10-10-shelf-polish-design.md`, plan
`plans/2026-10-10-shelf-polish.md`, ledger `.superpowers/sdd/2026-10-10-shelf-polish/progress.md` (git-ignored), evidence
`docs/superpowers/evidence/shelf-polish/`, captures `../liquid-dreams-captures/shelf-polish-2026-10-10/`. Rulings, carried
items and the "for Andrew" list: `2026-10-10-shelf-polish-fable.md`.

## Commits (a9e79ea..shelf-polish)

| commit | task | what |
|---|---|---|
| f624ed8 | 0 | baselines (frames, src/breaker+ride names) |
| e908560 | 1 | spray frames only the emitting stations (exact; 41.5 -> 14.0 ms per tick) |
| 05a9cfc | 2 | crestTrace one-curl check on the ridden run (220 m); reefField until test on the game's field (peel 1) |
| 46c60a8 | 3 | the ribbon's run continues onto the inside leg as a closeout |
| 9eecedb | 3+ | inside-leg spacing cap tried (1.5 m, +0.2 ms/step): steps unchanged, reverted; `_ribbonRun --camera` |
| e4604a4 | 4 | breaker bars on the real shelf: 3 re-pinned (a), 7 rewritten (c), 1 carried (b) |
| aafbcdb | 5 | coastBreaking.shoreBands: the band is where the shelf breaks the set (+20 m); 8 ft locus carried |
| 5fca5a4 | 6 | `?coast=off` gone; the coast always seeds the field |
| 30e9883 | 7 | one Bombie, the coast's: bursts re-aimed + coast-map gate; old mound out of the bed |
| (last) | 8 | full suite diff, captures, these handovers |

## Tools added (probes, kept)

- `tools/_rideCost.ts` the ride's CPU cost per step off the GPU (`--spray --old`); `tools/_curlSeams.ts`, `_untilJumps.ts`,
  `_heldScan.ts` (Task 2); `tools/_ribbonRun.ts` (`--crest`, `--camera=x,z` for the game's spacing from a camera).
- `tools/_breakerBars.ts --case=terrace|closure|peak|lift|liftdump|spike|spike2|stall|pile|pilegrow|peel` (breakingField and
  crestTrace bars on the tests' own field; `--game` = the game's sheet, lean and no pile); `tools/_sprayThrow.ts`.
- `tools/_shoreBand.ts` (coast breaking cells vs the shore band, row profiles); `tools/_retuneMoments.ts --bombie` (lookout
  frames turned to the Bombie at burst times); `tools/captureMoments.mjs --probe=<js>` (prints an expression per frame).
- Deleted: `tools/_fieldCost.mjs` (the coast on/off A/B).

## Gotchas

- tsc's overload pick for TSL `select()` depends on the program's import order: removing the Bombie mound from
  bathymetry's imports turned two `select()` results in `wombSectionNodes.ts` into `never`; typed `N` (type-only).
- toCrest stalls just over CREST_TOLERANCE_S (|xi| 0.010057) on the inside leg with a 2 m step: a run can end early
  depending on the step (why the spacing cap tried 1.5 m, not 2).
- The full breaking sheet (no `shape`) is not what the game draws (`shape: 'lean'`, `pile: false`): a sheet test about what
  the player sees should read the game's options (the lift test now does).
- The breakingField tests' (0, 0) tip coordinates were stale since womb-retune moved the tip; now TIP (pile tests).
- The full suite in parallel times out ~11 short tests (5 s) on this machine; re-run those files alone (all green today).
- In-game frame timing was unmeasurable again (another session's Blender at 65 % CPU during Task 8's `_rideProfile`:
  riding median 132.9 ms, DIRTY; Task 6's run alongside the suite 54.8 ms). The off-GPU `_rideCost` numbers are the evidence.
- Bash heredocs: an apostrophe inside a Python `'...'` test name written via `\'` lands as a literal backslash; use a
  typographic apostrophe in test names.

## Left

- Fable/Andrew: the rulings and the "for Andrew" list in -fable.md; the merge (Andrew's call).
- Carried reds: breakingField "highest water moves with the wave" (b, at the tip), coastBreaking 8 ft (the focus on the 9 m
  shelf), plus the pre-retune baseline reds (`evidence/shelf-polish/full-suite-diff.txt`).
