# Plan: shelf polish (the merge's debts, in order)

Spec: `docs/superpowers/specs/2026-10-10-shelf-polish-design.md` (read first). Executor: Opus 5.5 on branch `shelf-polish`
from main d48d7c9, in the sibling worktree `../ld-shelf-polish` (the `liquid-dreaming/` checkout stays on `main` for
Andrew's launcher). Ledger `.superpowers/sdd/2026-10-10-shelf-polish/progress.md`, one line per verified step; commit after
every task; push when a task's gate is green. Evidence `docs/superpowers/evidence/shelf-polish/`. Fable rules at the STOPs.

Process rules that held: measure before theorising; never `cat > file` without a heredoc; no scratch in `src/` (probes are
`tools/_*.ts`, deleted or kept deliberately); `node_modules` in the worktree is a junction (`cmd /c mklink /J
..\ld-shelf-polish\node_modules ..\liquid-dreaming\node_modules`) and is removed with `cmd /c rmdir` before any
`git worktree remove`; the breaker suite takes > 10 min, run it idle; full suite at the end, names diffed against
`.superpowers/sdd/2026-10-09-womb-retune/task6-fails-names.txt` (copy it into this segment's ledger dir first).

## Task 0: set up, baseline

1. Worktree + branch + junction as above. `npx tsc --noEmit` clean.
2. Baselines this session, same machine, idle: `_rideProfile --ft=7 --sim-t=300` (riding median, p90, cam median) on
   `../ld-datum-before` (4f70490) and on the worktree; the FOCUSED profile's per-pass table for both → `frames-baseline.txt`.
3. `src/breaker` + `src/ride` idle once → `breaker-baseline-names.txt`.

Gate: the two tables pasted in the ledger; commit "chore(shelf-polish): baselines".

## Task 1: the frame cost (spec §1)

1. Diff the per-pass tables: name the pass(es) that grew and by how much. If it is the ribbon: segment count and emitter
   count on main vs 4f70490 (print them); if the sheet: its draw size; if the coast textures: the sample count.
2. Fix the bounded cause only (a cap on segments per metre, a cull of the ribbon beyond the camera's reach, a texture
   sample skipped where the coast is not drawn). Never a change at the lip's look (A/B a down-the-line frame at Pumping
   t+3: pixel-identical ribbon region, or explain the pixels).
3. Re-measure, same session. If the gate cannot be met with a bounded change, write the diagnosis + cost and **STOP** for
   a ruling (one line: what the next-cheapest change costs in looks).

Gate: riding median ≤ 50.6 ms, p90 ≤ 60 ms; commit "perf(ride): <the pass> back within the bar".

## Task 2: one curl, one clock (spec §2)

1. `tools/_curlSeams.ts`: on the game's field (coastReefField, 6 ft mid tide) print every cell where `T′(i) < min_j(T′(j) +
   d/curlMaxMs)` or where until-hold jumps > 0.02 s along a ray: cell, line id, Tₛ, T′, the binding neighbour, position
   relative to the ledge's corners (tip, the turn north). → `curl-seams.txt`.
2. Diagnose from the table (expected: the inside leg as a separate `peelLines` component, or the second march's ray carry
   crossing the turn). Fix in `computeOnsetRecord`/`curlClock`/`peelLines`, not in the tests.
3. `crestTrace` + `reefField` tests green, bars unchanged; `_curlReport` at 6/8/12 ft pasted.

Gate: as spec §2; commit "fix(curl): one clock across the ledge's turn".

## Task 3: the sheet's fold (spec §3)

1. Measure the ribbon's run end vs the breaking line's extent at Pumping (`_sheetEta.ts`, the breaking map): how far the
   front runs past the ribbon, and the sheet's slope there.
2. Continue the ribbon's run onto the inside leg as a closeout (the line's cells north of the ledge's turn: hollow 0,
   whitewater on), subject to the run-length cap; if the cap binds, raise it and re-measure Task 1's frames; if frames
   break the bar, instead clamp the sheet's front where no ribbon runs (the second option) and say which you took.
3. Stand frames at Pumping and Huge, t+3/t+5 (`_retuneMoments` commands) → evidence; GPU/CPU self-test; `_rideProfile`
   once more (the §1 gate still met). **STOP** for Fable's look at the frames before Task 4.

Gate: spec §3; commit "feat(ribbon): the run continues onto the inside as a closeout".

## Task 4: the breaker bars (spec §4)

1. For each named red: run it idle, paste measured vs bar, class it (a)/(b)/(c) in one line in the ledger.
2. (a): re-pin with the number and the reason in the test's comment; (c): rewrite the assumption (the tip, the ledge's
   bearing, the first-break ray); (b): fix if under an hour, else carry with the diagnosis.
3. `src/breaker` idle run → names diffed against `breaker-baseline-names.txt`.

Gate: spec §4; commit per class or per file, "test(breaker): <file> on the real shelf (reason)".

## Task 5: the shore band (spec §5)

1. `coastBreaking.ts`: `shoreBandM(z, H)` = distance off the waterline where the coast profile's depth reaches
   `breakingDepth(H)` + 20 m (read the built coast map along the row); `classify` uses it; `SHORE_BAND_M` goes.
2. Test at 4/6/8 ft; if 8 ft still has cells outside, print them with their depth and the band and carry with the reason.

Gate: spec §5; commit "fix(coast): the shore band is where the shelf breaks the set, not 60 m".

## Task 6: `?coast=off` goes (spec §6)

1. Remove the flag, the no-coast request path, the dev toggle; keep the flat-bed seed as a test helper.
2. `rg "coast=off|coastOff|coast: false" src tools` → only test helpers; `_rideProfile` boots and rides; the matrix test
   unchanged.

Gate: spec §6; commit "chore: one truth, the coast map always seeds the field".

## Task 7: one Bombie (spec §7)

1. `rg -n "bombie|Bombie" src --glob '!src/bombie/**'` to find every reader of the old module and the mound.
2. Remove the mound from the bed; re-aim the bursts at the coast's Bombie gated by the coast breaking map (≥ 8 ft), or
   delete the module (say which and why in one line).
3. Lookout frames at Big and Solid → evidence.

Gate: spec §7; commit "feat(bombie): one Bombie, the coast's".

## Task 8: close

1. Full suite idle; names diffed against the merge's list; every change named.
2. Captures: stand + down the line at Pumping and Huge, lookout at Big → `evidence/shelf-polish/captures.md`.
3. Handovers `docs/superpowers/handover/2026-10-10-shelf-polish-{opus,fable}.md` (commits, tools, gotchas, rulings made,
   what Andrew must decide, the full-suite diff). Push. Do not merge.

## Where Fable rules

Task 1 if the gate needs a look-affecting change; after Task 3 (the frames); otherwise at the end.
