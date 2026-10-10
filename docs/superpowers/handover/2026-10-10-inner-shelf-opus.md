# Inner shelf: Opus handover (2026-10-10)

Branch `inner-shelf` (worktree `../ld-inner-shelf`, node_modules a junction to main's: `cmd /c rmdir` it before any
`git worktree remove`), from main 9b5e7e2, pushed, **not merged**. Plan `plans/2026-10-10-inner-shelf-focus.md`, ledger
`.superpowers/sdd/2026-10-10-inner-shelf-focus/progress.md` (git-ignored), evidence `docs/superpowers/evidence/inner-shelf/`
(README first), captures `../liquid-dreams-captures/inner-shelf-2026-10-10/`. Rulings and what Fable decides:
`2026-10-10-inner-shelf-fable.md`.

## Commits (9b5e7e2..inner-shelf)

| commit | task | what |
|---|---|---|
| 1828974 | 0–2 | `innerShelfM(z)` + `INNER_SHELF_DEEP` (10 m about z −950, flanks −1 150 / −750); coastMap + coastBreaking tests; the two tools |
| 9bc695c | 2–4 | evidence: datum identical, coast breaks before/after, full-suite A/B |
| 7f92b96 | review | guards: changes only between the flanks and inshore of the 10 m line; depthM ≤ 10 |
| (last) | 4 | these handovers |

## Gates

- 8 ft outside the breaks + shore band: 146 → **3** (the 3 at z 472, inside the Womb's south halo: carried, see -fable).
  4 / 6 ft: 0 → 0. 10 ft inside closeout: 3 357 → 3 167. Every footprint's count unchanged (`breaks-before/after.txt`).
- Womb datum (`tools/_wombDatum.ts`, 84 rows): identical (`datum-diff.txt`).
- coastMap 13/13 (3 new), coastBreaking 7/7 (8 ft green, carried comment replaced), smallSwell matrix 4/4.
- Full suite: 44 red of 2 126; the 17 red files alone, deepening on vs emptied: the same 33 names (`full-suite-ab.txt`);
  the other 11 are parallel timeouts, green alone.
- Lookout frames at Big and Huge: no visible change (a far-shore strip of pixels differs; no white water there either way).

## Tools added (probes, kept)

- `tools/_innerShelf.ts` the coast field's amp over the hand-set shelf, per 20 m of z, and an ASCII amp map (Task 0).
- `tools/_innerShelfSweep.ts` D × north half-width → 'elsewhere' cells per size; `--also` adds deepenings (`InnerShelfDeep`).
- `buildCoastMap(reef, p, deep?)`: the deepenings are an optional third argument (default `INNER_SHELF_DEEP`), not
  CoastParams (no dev-panel slider: hand-set bed, not a dial).

## Gotchas

- `tools/_wombDatum.ts` takes ~46 min (84 reef fields) with other sessions on the machine; tools load modules at start, so
  a run started before an edit measures the old code (that is how datum-before is valid) and one started after does not
  (my first breaks-before was after the edit; re-run with the deepening emptied).
- A/B by emptying `INNER_SHELF_DEEP` with sed and copying the file back (never stash).
- The worktree dev server: a temporary `ld-inner-shelf` entry in liquid-dreaming's tracked `.claude/launch.json`
  (`npx vite ../ld-inner-shelf --port 5199`), reverted right after `preview_start`.

## Deferred minors (final review)

- coastBreaking's halo exception is not pinned to the south halo (z ≥ 450) or to the three cells.
- The `wombHalo(zSouth) + wombHalo(zNorth)` line checks only the endpoints (the whole-grid test covers it).
- `innerShelfM` masks a shallowing entry (depthM < 9) via max, silently.
- `tools/_innerShelf.ts`'s usage example names a CoastParams key that does not exist (`--params` still works for real keys).
- `sweep.txt` has no D 9 row (it is in `breaks-before.txt`).
- `buildCoastMap`'s `deep` parameter is not in its JSDoc.
