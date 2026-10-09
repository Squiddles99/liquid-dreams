# Small swell at low tide: spec + plan (light process)

**Written by:** Fable, 2026-10-09, from Andrew's link (3.5 ft, 13 s, 225°, tide −1.5 m, seed 2002, 1730 s): "water gets
broken up and showing green rectangles, the wave doesn't actually break at such low swell". Probe: `tools/_smallSwell.ts`
(uncommitted; commit it with the fix). Branch `small-swell` from **main** (not lineup-truth). Executor: Opus. Small fix,
light process: one commit per item, `tsc` clean, push; Andrew merges.

## Diagnosis (measured, not guessed)

Three causes, none of them "small swell can't work":

1. **The game was built from the unmerged `lineup-truth` checkout** (dist 14:36). Its coast seeding shrinks the Womb
   (amplification 0.75 vs 1.26): the 3.5 ft set reaches ratio 0.45 at the take-off and 23/28 of the first leg; on main's
   physics the same set reaches 0.86 and 28/28. That branch is waiting on Andrew's ruling (handover
   `2026-10-09-lineup-truth-fable.md`) and must not be the play build meanwhile.
2. **−1.5 m is the dev slider's tide, not the game's.** `CONDITION_RANGES.tideM` is ±1.5 m; the select screen's
   `TIDE_STOPS` are ±0.5 m (the real coast's ~1 m range). At −1.5 m the shelf's 1.5 m minimum depth is at the surface,
   wave troughs drop the sea under the bed, and the ocean mesh's cells show the weedy bed through them: the green
   rectangles. Not reachable from the select screen.
3. **`SHALLOW_BREAKING_DEPTH_M` = 3 m bites small sets.** It makes any water under 3 m count as 3 m for breaking (added
   so the 0.6 m reef flat would not drag the break seaward). At low tide the ledge itself is 2.0–3.0 m, and the shelf's
   heads 1–2 m, so small sets read a breaking depth deeper than the water and the onset record's inner legs go wrong.
   With the floor at 2 m (main physics, `tools/_smallSwell.ts`):

   | set | floor 3 m | floor 2 m |
   |---|---|---|
   | 3.5 ft, −1.5 m: ratio at the take-off / first leg start / peel / hollow | 0.86 / 0.4 s / 10.2 / 0.73 | **1.18 / −0.3 s / 10.9 / 1.00** |
   | 3.5 ft, −0.5 m (the select's Low): first-leg peel / second-leg peel | 7.3 / **−5.2 (broken)** | 10.9 / 14.1 |
   | 3 ft, −0.5 m: first leg start / second peel | 6.3 s / 32.7 | 1.3 s / 14.2 |
   | 4 ft, 0 m: first / second peel | 9.9 / 7.8 | 11.0 / 12.6 |
   | 6 ft, 0 m: start / peel / hollow | −0.1 / 11.4 / 0.76 | −0.1 / 11.5 / 0.76 |
   | 12 ft, 0 m and −1 m: start / peel / hollow | −0.7 / 11.7 / 1.00; −0.9 / 11.6 / 1.00 | the same |

   The big sets do not move; the first break's distance does not move (the flat does not drag it).

   What stays true with the fix: at mid tide a 3.5 ft set (1.7 m) does **not** stand up at the 3.5 m ledge (ratio
   0.60–0.73); its first section breaks 0.8–1.4 s later, inside. That is the real Womb on a small day. 1.5 ft
   ("Flat-ish") and 2.5 ft ("Small") do not break on the ledge at any tide.

## The ruling (Andrew, 2026-10-09: approved, with the tide rule added)

**Andrew: "not offering a swell and tide option that won't break."** So the select screen offers only band × tide
combinations where the Womb breaks (Task 4's matrix decides which), not the two smallest bands alone.

- **Accommodate 3–4 ft** ("Fun" and up): fix the floor (item 3). The Womb on a Fun day breaks a little inside the ledge
  and softer, as it should.
- **Omit "Flat-ish" (1.5 ft) and "Small" (2.5 ft) from the select screen for now.** They are real days, but at the Womb
  they are no-wave days; a "flat at the Womb, go for a swim" outcome is a later feature, not a wave to fake.
- Clamp the dev tide slider to the real range (item 2) so the bed never surfaces.
- Play on main until the lineup-truth ruling (item 1).

## Tasks

### Task 1: the play build
- [ ] `git checkout main` in the working tree (lineup-truth is pushed; the tree is clean). The launcher rebuilds `dist/`
  when stale. Say so in the ledger; no commit.

### Task 2: the breaking-depth floor (TDD)
- Modify: `src/breaker/breaking.ts` (`SHALLOW_BREAKING_DEPTH_M` 3 → 2, and its comment: the 3 m floor read the ledge
  at low tide and the shelf heads as 3 m, so sets under ~2.5 m never reached ratio 1 at the take-off and the inner
  legs' records were wrong; 2 m clears the ledge at the lowest tide (3.5 − 0.8) and still stands in for the flat).
- Create: `src/breaker/smallSwell.test.ts`: on main's reef (2 m field grid, `smooth: true`, `refractFloorM`):
  (a) 3.5 ft, 13 s, tide −0.5: the first leg 28/28 broken, peel 9–12 m/s, the second leg's peel > 0 and < 20;
  (b) 3.5 ft, 13 s, tide −0.8 (the clamped minimum): ratio at the take-off ≥ 1 or the first leg's start ≤ 0.5 s;
  (c) 6 / 8 / 12 ft at mid tide: first-leg start, peel and hollow within 0.1 s / 0.2 m/s / 0.02 of their values with
  the floor at 3 m (pin them from one-curl's `t3-reef.txt`: 11.4 / 11.3 / 11.7 m/s, −0.1 / −0.7 / −0.7 s).
- [ ] Red with 3 m (a's second leg is negative), green with 2 m.
- [ ] Gates: `npx vitest run src/ride` (heldS per case unchanged ±0.3 s vs main), `src/breaker/breakingField.test.ts`,
  `r1Reef`, `reefReport`, `crestTrace`: name any new red against `fails-baseline-names.txt` of the one-curl segment.
- [ ] Commit: `fix(break): the shallow breaking floor 3 → 2 m so small sets stand up at low tide; big sets unchanged`.

### Task 3: the tide range
- Modify: `src/conditions/sanitize.ts` `CONDITION_RANGES.tideM` → `{ min: -0.8, max: 0.8 }` (the select's stops are
  ±0.5; the real range ~1 m). `sanitize` clamps links too, so Andrew's link opens at −0.8.
- [ ] Test in `sanitize.test.ts`: tide −1.5 sanitises to −0.8. Check `DevPanel.test.ts` and any pinned moment with
  |tide| > 0.8 (`referenceMoments.ts`): adjust the pins, none should need it.
- [ ] Commit: `fix(conditions): the tide slider keeps to the coast's real range (±0.8 m); the shelf never surfaces`.

### Task 4: the select screen offers only what breaks (band × tide)
- [ ] **Measure first** (after Task 2, floor 2 m): extend `tools/_smallSwell.ts` to the matrix of every `SWELL_BANDS`
  entry (its `ft`, `periodS`, 225°) × every distinct `TIDE_STOPS.m` (−0.5, −0.25, 0, 0.5), main physics, `smooth: true`,
  `refractFloorM`. A combination **breaks** when the first leg is 28/28 broken, its start ≤ 2.0 s after the peak and
  its peel is 8–13 m/s (a surfer's left, R3's bar). Save the table as
  `docs/superpowers/evidence/small-swell/t4-matrix.txt`. Expected from today's probe: Flat-ish and Small never; Fun at
  every tide (start 0.2–1.9 s; check High); Solid and up everywhere.
- Modify: `src/frontend/sessionSetup.ts`: a `BREAKS: boolean[band][tideStop]` table (or a rule derived from the matrix,
  hand-written as data, not computed at run time) and `offered(band, tideStop)`. `rollSetup` never rolls an unoffered
  pair; the arrow keys on the swell row and the tide row skip to the nearest offered value (if a tide change leaves the
  band unoffered, the band moves to the nearest offered one, and the row says so, e.g. "Fun — breaks on this tide" /
  the unoffered band greyed in the list `rowDisplay` returns). `swellBand()` maps a stored `swellFt` below the first
  offered band to it; `frontSettings` keeps old saves valid.
- [ ] Tests (`sessionSetup.test.ts`): every pair `rollSetup` produces is offered (1 000 rolls); stepping the tide onto a
  stop where the band is unoffered moves the band; a saved 1.5 ft loads as the first offered band; the table matches
  `t4-matrix.txt` (the test reads the same data the UI does; the matrix file is the evidence).
- [ ] Commit: `feat(select): only swell × tide pairs that break at the Womb are offered (measured matrix)`.

### Task 5: one capture
- [ ] Andrew's link with tide at −0.8 and the floor fix, from his camera (free, (75.7, 3.2, 5.7), yaw 219, pitch −12),
  at a set's third wave: one frame, to `liquid-dreams-captures/small-swell-2026-10-09/`. Ledger line, push.

## Out of scope
The lineup-truth Womb ruling; a "flat day" outcome on the select screen; the coast map's own low-tide look.
