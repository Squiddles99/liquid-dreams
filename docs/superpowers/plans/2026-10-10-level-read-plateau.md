# Plan note: the breaking-level read on a plateaued ray

**For:** an Opus 5.5 session of its own. **Orchestrator:** Fable 5.1 (rules at the STOP). **Branch:** `level-read` from main
(e426202 or later) in a sibling worktree `../ld-level-read` (junction `node_modules` from `liquid-dreaming` with
`cmd /c mklink /J`; remove the junction with `cmd /c rmdir` before any `git worktree remove`). The `liquid-dreaming/`
checkout is Andrew's launcher and may be on another session's branch: never work there, never switch its branch.

## The problem (measured, shelf-polish Task 2, `tools/_curlSeams.ts`, evidence `docs/superpowers/evidence/shelf-polish/curl-seams.txt`)

The onset record stores, per breaking level k (12 levels, `ONSET_LEVEL_Q`), the time the wave's running amplification
first crossed Q[k]. A wave whose height falls between two levels reads the record by `onsetLevel` (`src/breaker/breaking.ts`
~313): if the ray's running maximum `run` is still under Q[k+1] it assumes the section is **crossing now** (`toRun`: the
break time is read from today's delay, `−delay[k]`). On a ray whose running maximum plateaued just under Q[k+1] long ago,
that is wrong, and the neighbouring ray that reached just over Q[k+1] reads level k+1's clock instead. Result: at 6 ft, arcs
182 and 183 (1 m apart, on the inner shelf inside the right, 226–250 m from the tip) read tb 0.58 s and 2.53 s: a 2 s
jump across 1 m of crest. Separately, the level-6 breaking line there hooks under the crest, so the crest reads it out of
order. Neither is on the Womb's ridden line; `crestTrace`'s one-curl check is limited to 220 m from the tip since
shelf-polish (05a9cfc), with this named as carried. The GPU mirrors the reader in `src/breaker/breakingNodes.ts`
(`onsetLevelNode`, `onsetTimeNode`, ~99–125): any change is made twice and proven equal by the self-test.

Andrew's ruling (2026-10-10): fix it. It changes how the water reads its breaking time, so the gate is "the ridden line is
unchanged" as much as "the seam is gone".

## Rule

Change the record or its reader, never the water's physics (no amp scaling, no peel caps); CPU and GPU identical; the
ridden line's rides, curl report and frames identical within measurement.

## Tasks

**0. Baseline.** Worktree + branch + junction; `tsc` clean. Run `_curlSeams.ts` at 6 and 8 ft (the two worst arcs and the
count of violations over the WHOLE trace, not just 220 m) → `seams-before.txt`. `_rideCost.ts` 7 and 12 ft (step-by-step
ride record) → `ride-before.txt`. `_curlReport` 6/8/12 → `curl-before.txt`. Down-the-line frame at Pumping t+3 (the
retune's capture command) → outside the repo, `../liquid-dreams-captures/level-read-<date>/`.

**1. Design memo, then STOP for Fable.** Two candidates, each measured on the CPU alone with a probe before any GPU work:
- **A. A plateau field in the record.** Per level, store when the running maximum last rose (or a flag "plateaued below
  Q[k+1] for > τ_p"); the reader treats a plateaued ray as "not crossing", reading level k's own clock with the hold it
  has. Record grows from `1 + 6·ONSET_LEVELS` to `1 + 7·ONSET_LEVELS` (CPU array and the GPU texture layout: count the
  texture rows against `BreakingRibbon.limits`).
- **B. A reader rule without a new field.** From the existing fields alone (run, the levels' times, delay), decide
  "crossing now" by whether the delay is consistent with a rising run (e.g. the level-k time is recent relative to τ):
  no layout change, but prove it on the record's existing data, not on a guess.
For each: the seam count after, the ridden line's `_rideCost` diff (must be identical steps or the differences named to
the millimetre), the curl report, the record size. Write both into `docs/superpowers/handover/<date>-level-read-fable.md`
with a recommendation. **STOP.** Fable picks.

**2. Implement the pick on the CPU** (`breaking.ts` reader and, for A, `computeOnsetRecord` in `reefField.ts`), tests:
the two arcs read within 0.1 s of each other; the one-curl check widened back to the whole trace (remove the 220 m
limit, keep the inner-shelf comment as history) with 0 violations at 6/8/12 ft; the until-hold test unchanged.

**3. Mirror on the GPU** (`breakingNodes.ts`, and the record texture's packing for A). `npx electron tools/_selftest.mjs
--filter=breaker --max-s=2400` 14/14 (or more if a new parity case is added: add one that samples the two arcs).

**4. The hook.** If the level-6 line still hooks under the crest after the read is fixed (measure with `_curlSeams`),
order the curl along the crest rather than along the line at that place; if that is more than a local change, carry it
with the measurement.

**5. Close.** `_rideCost` 7/12 ft identical to Task 0 (or every differing step named); `_curlReport` equal to Task 0 within
0.1 m/s; the Pumping down-the-line frame pixel-identical in the ribbon region; full suite idle, names diffed against
`.superpowers/sdd/2026-10-10-shelf-polish/` task-8 list; handovers `-opus.md` and `-fable.md`; push; do not merge.

## Gates (Fable reviews from pasted evidence)

Seam count 0 over the whole trace at 6/8/12 ft; ridden line unchanged (ride steps, curl report, frame); CPU = GPU
self-test; record size and frame cost stated (`_rideProfile` cam median within ±5 % if the record grew).
