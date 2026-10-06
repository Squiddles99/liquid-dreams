# Fable → Fable: R2 merged, R3 written (2026-10-07)

For the next Fable session. The memory file `r2-take-off-finished.md` carries the state; read this, then the R3 spec
and plan only when Opus's R3 handover lands.

## Where things stand

- `main` 44e1377: R2 merged (--no-ff) and pushed on Andrew's "merge it to main and push", 2026-10-07, after my review
  (evidence held; the ride test's gate passes by coasting; six crestTrace fails are all baseline).
- R3 written: `specs/2026-10-07-r3-staying-on-design.md` + `plans/2026-10-07-r3-staying-on.md`, committed on main.
  Opus works on branch `r3-staying-on` from main.

## Rulings in R3, and why

- **The honest gate first, red on purpose.** `heldS` (riding seconds with `ahead` > 0) ≥ 5 on a 35° line; R2's
  `herLive > 0` end clause goes. If it is green without §3, the 88° line was the whole problem: fine, say so.
- **Measure before the carry.** The table (line × pop delay, with `along` beside `c` and a `behind` row) decides §3
  by the `behind` row's signature: face / top / sheet. Only the face signature earns the carry.
- **The face carry is the push only.** `faceCarrying()` gates R2's one-way push in `ride` on a section with lift; the
  drag's reference stays the sheet's water (Andrew 2026-10-04: dragging against carried water ate the drop's speed).
  Watch for Opus "simplifying" by extending `carrying()` or `ux/uz`: that is the thing not to do.
- **No value search.** `CREST_CARRY`/`CARRY_TAU_S` are not dials in R3. A red case keeps its table row.
- **The in-tube bails are named, not fixed.** From the R2 logs they look like closeouts (`y` jumping onto a collapsing
  lip at H 2 m, `tb` 3+ s). If all three are throws on the sheet by one cause, one rule in `sectionWater.ts` is allowed.

## What to check when Opus's R3 handover arrives

1. Task 1's four lines before (red) and after; `heldS` is counted on `ahead` > 0 only.
2. Task 2's table present with the three sentences; (iii) names the signature per case.
3. Task 3 only if (iii) said face; `carrying()`, the `ux/uz` line and the drag block unchanged; the five physics tests;
   12 ft max speed < 18, slope < 2.5.
4. Task 4's three bails named with their rows.
5. Live: six runs, `ah` > 0 on every ride row, ends named; the 8 ft 0.4-s-pop +1.4 s frame first.
6. Scope: `src/seabed`, `breaking.ts`, `sets.ts`, `flowFromEta`, `crestTrace.ts`, `sectionWater.ts` (unless Task 4's
   condition), `CREST_CARRY`, `CARRY_TAU_S`, `POPUP_S` untouched.
7. Suite diff: only `rideOnSections` names move.

Then: merge is Andrew's call; recommend merging when 1, 3 and 5 hold.
