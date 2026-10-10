# Plan note: deepen the hand-set inner shelf where the coast focuses the swell

**For:** an Opus 5.5 session of its own. **Orchestrator:** Fable 5.1 (rules at the STOP). **Branch:** `inner-shelf` from
main (e426202 or later) in a sibling worktree `../ld-inner-shelf` (junction `node_modules` from `liquid-dreaming` with
`cmd /c mklink /J`; remove the junction with `cmd /c rmdir` before any `git worktree remove`). Never work in the
`liquid-dreaming/` checkout and never switch its branch (it may be on another session's branch).

## The problem (measured, shelf-polish Task 5, `tools/_shoreBand.ts`, `coastBreaking.test.ts` comment)

The Seamap survey stops 300–500 m short of the beach, so the inner shelf is hand-set: `INNER_SHELF_M = 9` rising linearly
into the traced 10 m line, the beach ramp over `SHORE_RAMP_END_M = 60` (`src/seabed/coastMap.ts` ~15–80). About 1 km north
of the Womb (z −988…−850, and 3 cells near z 450) the coast field focuses an 8 ft set ×1.77–1.92 (one cell ×2.54), so
H·amp reaches 8.1–8.4 m and breaks 69–189 m off the beach on the flat 9 m shelf: 146 cells outside the shore band (the
band is where the shelf breaks the unfocused set, 6.5 m deep, 68–90 m out, +20 m). At 4 and 6 ft nothing breaks there.

Andrew's ruling (2026-10-10): **deepen the shelf there.** The hand-set part is ours; the traced 10 m line and deeper are
the survey's and do not move.

## Rule

Change only the hand-set bed (inside the 10 m line) and only where the focus is; never the Womb's water: the Womb's
halo (`WOMB_HALO_M`, `depthBg` alongside the reef map) is untouched, and the Womb's datum table is identical before and
after. Lefthanders' ledge (110 m off the real waterline, `coastFeatures.ts`) keeps breaking as its test says.

## Tasks

**0. Baseline.** Worktree + branch + junction; `tsc` clean. `tools/_wombDatum.ts` → `datum-before.txt` (the Womb must not
move). `tools/_coastBreaks.ts --sizes=4,6,8,10` → `breaks-before.txt` (cells per zone). A map of the coast field's amp at
8 ft over the hand-set region (x from the waterline to the 10 m line, z −1 500…+600): where amp > 1.5, the depth there and
the bearing of the 10 m line → `focus-map.txt`. Say in one paragraph **why** it focuses (the 10 m line's bend north of the
Womb turning west, the shelf's flatness, or a kink in the traced contour): the fix should match the cause.

**1. Parametrise the inner shelf's depth along the coast.** `INNER_SHELF_M` becomes `innerShelfM(z)`: 9 m everywhere
except a deepening profile over the focus rows, smooth (a raised-cosine over ≥ 300 m of z), to a depth `D` reached at the
rows of greatest focus; the shore ramp keeps its 60 m; the linear rise into the 10 m line starts from the deeper value
(so the shelf never steps). Sweep D ∈ {10, 11, 12, 13} m and the profile's half-width {200, 300, 400} m with
`_coastBreaks --sizes=8` → the smallest D and width that empties the 8 ft cells outside the band; report 10 ft too (its
inside closeout is ruled true and stays, but the count should not grow). If no D ≤ 13 m empties the zone, the focus is
upstream (the traced line's shape): say so and **STOP** for Fable with the map.

**2. Apply the pick.** `coastMap.ts` (with a comment naming the measurement and that the bed is hand-set, not survey),
`coastMap.test.ts` (depth at the focus rows equals the profile; monotone deepening offshore still holds; the Womb's
halo rows unchanged to 1 cm; Lefthanders' ledge depth unchanged), `coastBreaking.test.ts` 4/6/8 ft green with the carried
comment removed, `_shoreBand.ts` re-run. **`_wombDatum` diff against Task 0: zero.** `smallSwell` matrix test unchanged.

**3. Look.** Lookout frame at Big and at Huge (the capture commands in `docs/superpowers/evidence/shelf-polish/captures.md`),
before/after crops of the shore 1 km north → `../liquid-dreams-captures/inner-shelf-<date>/`. The far shore's white water
should thin, not vanish (a beach break at 10 ft+ is real).

**4. Close.** Breaker + seabed suites idle; full suite names diffed against the shelf-polish task-8 list; handovers
`-opus.md`/`-fable.md`; push; do not merge.

## Gates

8 ft: 0 cells outside the four breaks + the shore band; Womb datum identical; coastMap tests green; lookout frames; the
chosen D and width stated with the sweep table.
