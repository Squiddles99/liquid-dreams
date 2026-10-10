# Plan note: the far closeout's stepped edges

**For:** an Opus 5.5 session of its own. **Orchestrator:** Fable 5.1 (rules at the STOP). **Branch:** `closeout-edges` from
main (e426202 or later) in a sibling worktree `../ld-closeout-edges` (junction `node_modules` from `liquid-dreaming` with
`cmd /c mklink /J`; remove the junction with `cmd /c rmdir` before any `git worktree remove`). Never work in the
`liquid-dreaming/` checkout and never switch its branch.

## The problem (seen, shelf-polish Task 3 + follow-on; evidence `docs/superpowers/evidence/shelf-polish/task3b-inside-spacing.txt`)

Since shelf-polish the breaking ribbon runs on past the left's turn north onto the inside leg as a closeout (ends 380–427 m
from the tip). From the crew's stand at Huge, that far closeout shows **stepped vertical segment edges**: it reads as a
dark block with teeth (`../liquid-dreams-captures/shelf-polish-2026-10-10/task3/huge-closeout-zoom.png`; also visible at
Pumping, smaller). It is **not** the ribbon's station spacing: capping the inside leg's spacing at 1.5–3 m (from 3–6.5 m)
left the steps unchanged, and the section numbers are smooth station to station. Opus's lead: the water sheet's coarse
far grid beside and under the ribbon there (the sheet's cells grow with distance; `src/ocean/OceanSurface.ts`), or the
ribbon's footprint/cut against that grid. Andrew's ruling (2026-10-10): **fix it.**

## Rule

A drawing change only: the record, the curl, the ride and the bed do not move. Cost measured (cam median from the stand
and riding median, `_rideProfile`, same session before/after) and stated; the look is the gate, judged on frames.

## Tasks

**0. Find the mesh.** Worktree + branch + junction; `tsc` clean. Reproduce the Huge stand frame at t+3/t+5 (the
`_retuneMoments` command in shelf-polish's `captures.md`). Then the hide test Opus used for the quads, at the stand camera:
hide the ribbon alone, the sheet alone, the footprint alone, the whitewater alone; a zoomed crop of the closeout for
each → `edges-hide-test.md`. Also print, at the closeout's position (x ≈ 0…−20, z ≈ −300…−430): the sheet's cell size
there, the ribbon's segment width, the footprint's cut, the sheet's slope across the front (CPU `sampleField` + the set
wave's height along a line across the crest at 1 m steps). State which mesh carries the steps and why (a cell size larger
than the front's width; a per-vertex height sampled on a coarse grid; the ribbon's edge quantised to sheet cells; the
footprint's mask stepping).

**1. Candidates, costed, then STOP for Fable.** Depending on Task 0, two or three of:
- the sheet's finer ring extends to cover the ribbon's full run (the run's end is known per frame: ~430 m at Huge), costed
  in vertices and cam/riding medians;
- a crest-following refinement band: the sheet's cells halve within N m of any drawn breaking line (the breaking map or
  the ribbon's stations give the line), cost likewise;
- the ribbon's footprint masks the sheet under the whole run (the carried ribbon self-test red "the footprint covers the
  stations' inner strip" is in the same area: measure whether the footprint stops short on the inside leg);
- the ribbon's own edge: if the steps are the ribbon's, its edge is cut per station in world units, not per sheet cell.
For each: a crop of the Huge closeout at t+5 from the stand, the two medians, vertex counts. Write into
`docs/superpowers/handover/<date>-closeout-edges-fable.md` with a recommendation. **STOP.** Fable picks.

**2. Implement the pick.** GPU + CPU where the sheet has both (parity self-test `--filter=breaker` and the sheet's own
self-test unchanged). Frames: Huge and Pumping stand t+3/t+5, Big lookout; down-the-line at Pumping unchanged pixel for
pixel in the ribbon region (the near wave must not change).

**3. Close.** `_rideProfile` before/after (cam and riding medians within +5 %); affected vitest files; full suite idle
names diffed against the shelf-polish task-8 list; handovers; push; do not merge.

## Gates

The Huge closeout's edge continuous at the stand's zoom (Fable looks, Andrew after); near wave unchanged; cost within
+5 %; parity self-tests green.
