# Fable's handover, 2026-10-09 (end of session)

For the next Fable session (orchestrator: diagnose, design, write spec + plan, review Opus's evidence; Opus executes).
Andrew's budget is tight: read this, the memory index, and only the files a task needs.

## Where main is

`main` = **22e3823**, pushed. Today's merges, in order:
1. (earlier sessions) one-curl 5d9c367, select-screen-ui 3095079.
2. **small-swell** (this session, Andrew merged via me): the shallow breaking floor 3 → 2 m so 3–4 ft sets stand up at
   low tide (6/8/12 ft unchanged, ride hold times identical); dev tide slider clamped to ±0.8 m (the shelf can never
   surface: that was the "green rectangles"); the select screen offers only swell × tide pairs whose first leg breaks
   (measured matrix `docs/superpowers/evidence/small-swell/t4-matrix.txt`: Fun and up at every tide, Flat-ish and Small
   never; the Summer sea-breeze preset became a Fun day). Plan + diagnosis:
   `docs/superpowers/plans/2026-10-09-small-swell-low-tide.md`. Probe `tools/_smallSwell.ts`.

The Electron launcher builds whatever is checked out in `liquid-dreaming/`: keep that checkout on `main` while Andrew
plays; branch work goes in sibling worktrees (`../ld-*`). Andrew learned this today after playing an unmerged branch.

## Open: the lineup-truth ruling (Andrew's, not yet made)

Branch `lineup-truth` (c9ac07a, pushed, **not merged**; executed by Opus today, reviewed). It builds a coast map of the
real shelf (traced Seamap contours) with Lefthanders, Ellensbrook Bombie and Ellensbrook as features, solves the swell
over it and seeds the Womb's reef field from it. Everything works as specced except the headline: **the real shelf
turns the swell ~10° more shore-normal and the Womb's amplification falls 1.15 → 0.72**; first-leg peel 12.7–14 m/s
(out of 9–12), hollow at 8 ft 1.0 → 0.55, and the 6 ft bot rides are lost at every level (12 ft rides).
`?coast=off` restores main's Womb exactly. Three options are in
`docs/superpowers/handover/2026-10-09-lineup-truth-fable.md` (seed the Womb from the far field and draw the coast only
outside it; redefine the swell dial at the Womb; accept the real arrival and retune the reef). Also there: boot cost
+5.6–6.1 s on Opus's machine (spec ≤ +4 s, Andrew's machine unmeasured), the 10 ft inside closeout ruling, the
Cobblestones approach, two Bombies (`src/bombie` vs the coast's), deferred minors M1–M7.

**Small-swell interacts with it:** lineup-truth was branched before the floor change; a merge will conflict in
`src/breaker/breaking.ts` (one constant + comment: keep 2 m) and `smallSwell.test.ts`'s pins must be re-run on the
coast-seeded Womb if option 3 is taken. With the coast, 3.5 ft at low tide reaches ratio 0.45 (does not break):
whichever option Andrew picks has to be re-measured with `tools/_smallSwell.ts` (restore its coast imports, which
Opus removed because coastMap exists only on that branch).

## Also seen today, not acted on

- `ld-select-ui` worktree is on a branch `sea-life-slides` at 3322841 (Andrew's other session; not mine).
- An empty folder `../ld-small-swell/.vite` may remain (a vite cache held by a lingering node process at cleanup); its
  node_modules junction was removed first and main's node_modules is intact. Delete the folder after a reboot.
- `excludedBy` (Random's exclusions) still only limits rolls; Huge at Low remains selectable because it breaks.

## Process notes that held up today

- Measure before theorising: the "small swell doesn't break" report was three causes (play build, dev slider, floor);
  a 10-minute probe settled it. Write rulings into plan files, not chat.
- Opus's gate files missed two test pins the full suite caught (`breaking.test` pinned the constant; a 1e-4 s
  rounding bar): always have Opus run the full suite and diff failing names against a baseline list.
- Fresh-reviewer pass found one real thing on lineup-truth (I1, measured to 1.3 %, guarded) and seven minors; worth
  its cost on a 5-task branch, skip it on a 3-commit fix.
