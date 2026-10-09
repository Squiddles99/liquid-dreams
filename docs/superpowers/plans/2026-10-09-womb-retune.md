# Plan: the Womb retune (lineup truth, segment 2)

Spec: `docs/superpowers/specs/2026-10-09-womb-retune-design.md` (read it first; its §1 rule "change the bed, never the
water" governs every task). Executor: Opus 5.5 on branch `lineup-truth` in a sibling worktree (`../ld-lineup-truth`; the
`liquid-dreaming/` checkout stays on `main` for Andrew's launcher). Ledger: `.superpowers/sdd/2026-10-09-womb-retune/progress.md`,
one line per verified step; commit after every task; push when a task's gate is green. Evidence to
`docs/superpowers/evidence/womb-retune/`. Fable rules at the two STOP points; Andrew looks at the end.

Process rules that held last time: measure before theorising; never `cat > file` without a heredoc; no scratch in `src/`
(probes live in `tools/_*.ts`); a junctioned `node_modules` is removed with `cmd /c rmdir` before `git worktree remove`;
run the FULL suite at the end and diff failing names against `.superpowers/sdd/2026-10-09-lineup-truth/fails-after-names.txt`.

## Task 0: bring main in, baseline

1. `git merge main` into `lineup-truth`. Conflict in `src/breaker/breaking.ts`: keep **2 m** (`SHALLOW_BREAKING_DEPTH_M`,
   main's constant + comment). Expect `breaking.test.ts` and `smallSwell.test.ts` from main; they will go red on the coast
   later (Task 4 re-pins them). The spec/plan files arrive with the merge.
2. `tools/_smallSwell.ts`: restore the coast imports (`buildCoastMap`, `computeCoastField`, `coastSeed` path as
   `tools/_coastRide.ts` uses them) behind a `--coast` flag (default on); `--no-coast` keeps main's run.
3. Full suite once; save `fails-task0-names.txt`. `src/ride` and `src/breaker` counts in the ledger.
4. Boot cost once on the worktree (`npx electron tools/_fieldCost.mjs --boots=3`), logged. No bar.

Gate: merge committed, suite baseline saved, probe runs with the coast (paste its 225° matrix: the "before" of Task 4).

## Task 1: the datum (spec §2)

1. `tools/_wombDatum.ts`: for bands × distinct tides × fromDeg {202, 225, 247}, build coast map + coast field + reef field,
   print at the peak (0,0) and at the reef map's west edge (x −400, z 0): arrival angle (`atan2(dirZ,dirX)`), amp, hmin, the
   set-1 biggest wave's local height `min(H·amp, 0.78·hmin)` in m and in ft (invert `units.ts`'s curve). One table.
2. Run it: `datum-before.txt`.
3. Move the dial's reference to the coast seed: in `coastFarField.ts` (and wherever `h_ref = depthBg(FAR_X0)` is read for
   `p` and `fluxRef`) the reference depth becomes the coast map's depth at the coast grid's west edge on the Womb's row
   (z 0). Read it from the built coast map (one number, logged); the far-field (no-coast) path keeps 15 m so `?coast=off`
   is unchanged. The GPU's far-field uniforms must carry the same reference (check `SetWaves` reads it from the field, not
   a constant).
4. Run again: `datum-after.txt`. Expected: angles equal within 0.1°, amp up by the shoaling factor (Fable's estimate ×1.10
   at 15 s; print the actual per band).
5. Test: `coastFarField.test.ts` (or extend `coastField.test.ts`): with the coast, the seed's reference depth equals the
   map's depth at that point; with no coast it is 15 m; direction at the seed unchanged by the move.

Gate: both tables pasted; test green; commit "feat(swell): the dial is the offshore swell at the coast seed (spec §2)".

## Task 2: the reef sweep — then STOP for Fable

1. `tools/_reefSweep.ts`: parametric over `NORTH_LEDGE` leg-0 bearing {24, 30, 34, 38, 42}° and leg-1 bearing {leg0 − 9,
   leg0 − 5}°, `ledgeDepthM` {3.5, 3.0, 2.5}, keeping leg lengths (70 m, 46 m) and leg 2 due north from leg 1's end. For
   each: at 225° mid tide, for every band Task 0's matrix left breaking plus the next smaller one, print first-leg peel,
   hollow, start, first-break depth, second-leg peel, leg-2 peel (closeout?), and the right (south ledge) stretch's peel.
   Also the 202° and 247° first-leg peel for the two middle bands. Rows that meet every spec §3 target marked. One file
   `sweep.txt`; keep the run under ~15 min (reuse the coast field across reef params: the coast seed does not depend on
   the reef inside the halo? It does through `wombHalo` only via the reef map's footprint depth; if a rebuild is needed
   per param set, say so and sample fewer points).
2. If no row passes with lever (1)+(2), add `faceWidthM` {15, 10} and `faceBaseDepthM` {15, 10} (lever 3); if the second leg
   closes out everywhere, `shelfDepthM` {4, 5} (lever 4). Do not touch `curlMaxMs`, amp, directions.
3. Paste the passing rows and your recommended one (closest to today's reef) into the handover stub
   `docs/superpowers/handover/2026-10-09-womb-retune-fable.md` (§"Task 2 ruling wanted"). **STOP.** Fable picks.

Gate: `sweep.txt`, the recommendation, a commit "tools: the reef sweep (womb-retune Task 2)". No reef change yet.

## Task 3: apply the ruling, re-pin the reef tests

1. Set `NORTH_LEDGE` (and `DEFAULT_REEF_PARAMS` if ruled) to the chosen row. Update the comment block in `wombReef.ts:63-70`
   (the R1 history) with one paragraph: the real shelf's arrival and why the legs turned. South ledge only if the right's
   behaviour changed in the sweep (report).
2. Re-pin: `r1Reef.test.ts` (the 15 m basin assertion goes: the bed is the coast's; the 45° bearing test becomes the
   measured arrival ±2°; first-break depth caps per offered band), `satelliteReef.test.ts` (peel band per offered band, every
   tide; barrel at the two middle bands; leg 2 closeout), `breaking.test.ts` (2 m floor pins stay), `smallSwell.test.ts`
   (rewritten in Task 4). Every test builds the field with the coast via one shared helper (`src/breaker/testField.ts`:
   `coastReefField(opts)`, cached per key for the run).
3. GPU/CPU parity self-test (`_selftest.mjs --filter=breaker`) unchanged.
4. `tools/_curlReport.ts` at the three middle bands, pasted (one curl per side; wall ahead standing: one-curl's look).

Gate: `src/breaker` green except named carried reds; the curl report; commit "feat(reef): the Womb's ledge turned to the
real shelf's arrival (spec §3, Fable's ruling)".

## Task 4: the select screen tells the truth

1. `tools/_smallSwell.ts --coast` at 225° → `matrix-225.txt`; at 202°, 247° → reported files. Rule as before: first leg
   28/28 broken, start ≤ 2.0 s, peel 8–13 m/s.
2. Extend the probe's output and `sessionSetup.ts`: `BREAKS` rewritten; new `FACE_FT: Record<band, (number|null)[]>` per
   tide, the half-foot face from `_wombDatum`'s local height at the peak at that band × tide (null where not offered).
   `smallSwell.test.ts` checks `BREAKS` and `FACE_FT` against `matrix-225.txt` (parse the file).
3. Conditions screen: next to the swell words, the face line "Womb faces ~N ft" (one `<span>`, the existing type; no new
   layout; follows [[aaa-ui-bar]]: the same face as the other labels, no new colour). Random and presets re-run through
   `offeredSetup`; list any preset that moved band.
4. Screenshot of the conditions screen at two bands (Playwright, 1080p) → evidence.

Gate: matrix files; `BREAKS`/`FACE_FT` test green; screenshots; commit "feat(select): offered pairs re-measured on the real
shelf; the Womb's face shown".

## Task 5: the ride — then STOP for Fable

1. `src/ride` tests build the field through `coastReefField`. Re-pin `rideOnSections.test.ts` cases to bands: smallest
   offered × {intermediate, beginner, expert}, biggest offered × intermediate. Gate heldS ≥ 10 s each; `lazy (R9)` 0.00 cm.
2. Run. For any lost case: trace (`tools/_rideProfile.mjs --query` with ratio at the take-off vs t, bot speed vs curl speed,
   pop-up time) → `ride-trace-<case>.txt`. Diagnose size vs peel vs pop-up. **Do not change bot or camera code**; write the
   diagnosis and the candidate fix into the handover stub and **STOP** for Fable's ruling. If all cases pass, no stop.
3. Frames: `_rideProfile --sim-t=300` cam and riding medians vs this session's main (same machine, same session).

Gate: heldS table; traces if any; frames; commit "test(ride): the ride pinned on the real shelf's Womb".

## Task 6: close

1. Full suite; names diffed against Task 0's and lineup-truth's lists; every new red explained in the handover.
2. Captures for Andrew (`tools/captureMoments.mjs` per `_lineupMoments.ts`): smallest, middle, biggest offered bands at
   t+3 and t+5 from the stand down the line; the lineup shot; the lookout shot. → `evidence/womb-retune/captures.md`.
3. Remove `?coast=off` only when Fable says (after Andrew's look): keep it for now.
4. Handovers: `docs/superpowers/handover/2026-10-09-womb-retune-opus.md` (commits, tools, gotchas, left) and `-fable.md`
   (the rulings made, the numbers table before/after, anything Andrew must decide). Push.

## Where Fable rules

- After Task 2 (the reef pick) and after Task 5 if a ride case is lost. Everything else runs through.
- Fable reviews the spec §6 gates from the pasted evidence, then asks Andrew for the §6.7 look. Merge to main is Andrew's.
