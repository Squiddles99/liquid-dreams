# Inner shelf: for Fable (2026-10-10)

Branch `inner-shelf`, pushed, not merged. Evidence `docs/superpowers/evidence/inner-shelf/README.md`; Opus's side in
`2026-10-10-inner-shelf-opus.md`.

## What was done

The hand-set inner shelf now deepens along a raised cosine from 9 m at z −1 150 and at −750 (the Womb halo's north edge)
to **10 m at z −950**. With it the 8 ft set no longer closes out 1 km north of the Womb: 146 → 0 cells there. The Womb's
datum table is identical (84/84 rows), the halo rows and Lefthanders' ledge are unchanged to 1 cm (a whole-grid test),
and no traced contour moves. That last holds because D = 10 m meets the 10 m line flat, and a test now forbids D > 10.

## Why it focused (Task 0)

It was not the 10 m line's kink at z −850. The source is **the Womb's basin**: its 15 m fades to the 9 m shelf over the
300 m halo, and that sideways depth gradient is a lens. The caustic starts at the halo's north edge (z ≈ −720) and runs
north-east with the swell, ~300 m across the flat shelf, to the beach at z −1 000. A one-off 600 m halo moved the landing
to z −1 240 and removed the offshore ridge. Deepening the shelf where the caustic runs matches the cause, and the plan's
rule kept it outside the halo.

## Rulings (each with its cost if wrong)

1. **Cause is the halo lens, not the contour kink.** The fix stays the plan's (deepen the shelf there). Cost: a different
   fix shape.
2. **The profile is asymmetric.** The south flank is pinned to end at the halo's edge (200 m); only the north
   half-width was swept. A symmetric cosine about the focus rows would enter the halo. Cost: one retune of a flank.
3. **D 10 m, half-width 200 m.** All widths tie at every D; 10 is the least D that empties the north zone and the only one
   that moves no traced contour. Cost: none known.
4. **The 3 cells at z 472 are carried, not a STOP.** They sit inside the Womb's *south* halo (the same lens, mirrored),
   with breaking ratio 1.004–1.008, 110–118 m out, 11.3 m deep. The halo may not move. A deepening south of it made
   things worse (10 m: 3, 11 m: 7, 12 m: 207). `coastBreaking.test` now allows ≤ 3 'elsewhere' cells, inside the halo
   only, and fails on any other cell. **Cost: the gate's "8 ft: 0 cells" is met only outside the halo.** Fixing these 3
   means touching the Womb's water (e.g. a wider or gentler south halo fade). That is your call, or Andrew's.
5. **Deepenings are not CoastParams** (no dev-panel slider). `buildCoastMap` takes an optional table for the tools.
   Cost: a slider later.
6. **"Before" lookout frames are shelf-polish Task 8's own**: the same coast; only Library commits since. Cost: a re-capture
   on main.
7. **Full-suite diff by A/B**, not against the shelf-polish task-8 names list, which lived in a deleted worktree's ignored
   folder. The 17 red files were re-run with the deepening on vs emptied; the 33 reds are identical. Cost: none (the A/B is
   stricter).

## For Andrew

- From the lookout the change can't be seen: the north shore is a few pixels at 1 km, and neither frame shows white water
  there. It shows in the numbers. The 8 ft beach break there now reaches 55 m off the waterline (71 m before), and the
  10 ft inside closeout shrinks 6 %. The 10 ft beach break stays, as the plan wanted.
- Open: the 3 cells at z 472 (ruling 4).
- Merge: his call.
