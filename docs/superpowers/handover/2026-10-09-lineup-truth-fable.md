# Lineup truth: handover for Fable

**From:** Opus 5.5 (executor), 2026-10-09. Branch `lineup-truth` (from main be21485), pushed, **not merged**. Spec
`specs/2026-10-09-lineup-truth-design.md`, plan `plans/2026-10-09-lineup-truth.md`, ledger
`.superpowers/sdd/2026-10-09-lineup-truth/progress.md` (git-ignored; every ruling is also below). Details: `-opus.md`.

**Needs a ruling (spec §4.5, "Andrew decides"): the real shelf moves the Womb, and the 6 ft ride no longer holds.**
With the coast seeding the reef field, the swell reaches the reef map ~10° more shore-normal and a third smaller; the
first-leg peel leaves 9–12 m/s at every size, and the bot loses the 6 ft wave at all three levels (12 ft still rides).
`?coast=off` gives main's Womb back exactly (same ride, same frames). Nothing is tuned to hide it.

| | main (far-field seed) | coast seed |
|---|---|---|
| arrival at the reef map's west edge / at the peak | −45.0° / −33.5° | −35.7° / −22.9° |
| amp at the peak | 1.15 | 0.72 |
| first-leg peel 6 / 8 / 12 ft | 11.4 / 11.3 / 11.7 m/s | 12.7 / 14.0 / 13.7 m/s |
| hollow 8 ft | 1.00 | 0.55 |
| rideOnSections heldS (6 int / 12 int / 6 beg / 6 exp) | 14.33 / 15.00 / 12.32 / 14.37 s | 0.00 / 14.52 / 0.15 / 2.23 s |

It is the survey's 15–28 m shelf turning the swell east, R1 §1's own finding ("the 20 → 30 m ramp turned every swell east
and the curl ran 12–15 m/s"): an 800 m halo (15 m water along the coast in front of the reef) changes the west edge's
arrival not at all. Options I see, for you and Andrew:
1. **Seed the Womb from the far field** (main's Womb) and draw the coast only outside it: the reef/coast τ differ by up to
   4–7 s at the reef map's edges, so the sampler's 40 m blend would have to grow to a few hundred metres (a phase stretch
   there).
2. **Redefine the swell dial at the Womb** (choose the far field's direction so the arrival at the reef map's west edge is
   the dial's): the Womb keeps its angle and peel; the far breaks get the shelf's bend relative to it. Its height would
   still drop unless the amp is renormalised at the reef edge too.
3. **Accept the real Womb** and retune the reef (the peel and the ride) for the new arrival: a wave-form segment.

## What changed (Tasks 0–5)

- **T0 contours** (255ee67): image 8 registered to the game frame by fitting its coastline to the game's own SRTM
  waterline (5.5 m/px from its scale bar, the Womb at image row 838, misfit 27 m); 10–30 m lines traced as curves.
  At z 0 the 10 m line is at x −470 (565 m off the game beach), 20 m at −815. Fable's §2 "10 m about 300 m out" was
  image 7's misplaced Womb marker (it sits on the survey's edge, ~250 m too far out).
- **T1 coast map** (69b3e50): beach = the game's waterline (pinned at the Womb, SRTM elsewhere); **grid to x +500** (the
  real Ellensbrook beach is at x 360–470: the spec's +250 cut it off); hand-set inner shelf 9 m rising linearly into the
  traced 10 m line; alongside the Womb the coast is depthBg exactly (15 m basin open to the sea, fading over 300 m along
  the coast), so it meets the reef map with no step. **Lefthanders' ledge re-placed** 170 → 110 m off the real
  waterline (the spec's line ends 27 m inland). The Bombie stays at (−280, 1 020), but that is on a ~9.7 m shelf: the
  survey's 12–15 m water is 1.1–1.2 km off Ellensbrook, not 360 m.
- **T2 coast field** (d9c32c3 refactor alone, 1240c6a): the shared `solveWaveField`; the coast's edges seeded by exact
  1-D refraction along each edge row; hmin recovers behind shoals (100 m); alongside the Womb each node carries the far
  field plus the shelf's own change (real − flat 4 m solve), so over the 1-D profile the coast-seeded reef field equals
  main's (τ ≤ 0.013 s, amp ≤ 0.4 %, record ≤ 1e-3). Worker builds and caches map and field. **Boot cost +5.6–6.1 s on my
  machine** (two 4 m solves, cached while the swell/tide hold) against the spec's ≤ +4 s on Andrew's: not measured there.
- **T3 the sheet** (6550012): outside the reef grid the GPU and CPU draw the coast field, eased in over 40 m from the reef
  grid's edge and out into the far field over the coast grid's last 100 m (no step either side; x −1 600 is exactly the
  far field). **Set lines lengthened 300–600 m → 5–7 km and kept in flight 150 s past the peak** (was 60): without this no
  set existed at Lefthanders or Ellensbrook at all (each line ended ±300 m from the Womb's). Cam median unchanged (3.8 ms);
  riding median +12 % with the longer lines (40.0 → 44.7 ms, coast off).
- **T4 no closeout** (fe1aab4): contained to the four breaks + the 60 m shore band at 4, 6 and 8 ft; the Bombie none at
  4/6, breaks at 8, an 86 m A-frame at 10 (top 6.5 m, radius 110 m: the spec's 5 m broke at 6 ft). **§4.4 at 10 ft cannot
  hold on the real shelf**: a 10 ft set is 5.7 m and breaks in 7–9 m, which the survey puts 300–750 m off the whole beach;
  10/12 ft break on the inside (647 / 5 962 cells), reported. North of Lefthanders the survey's shelf focuses the swell ×2
  (the approach to Cobblestones): from 8 ft sets stand up there; reported as its own zone.
- **T5**: evidence `t5-ride.txt`, `t5-captures.md`; these notes.

## Suite

Baseline 61 failed of 2004; after 44 of 2033; one new red (the sheet past 16 sampled textures) fixed by packing textures (T5). Details in `-opus.md`.

## Also found

- `src/bombie/` (the old atmospheric Bombie at (−300, 340), its own bursts and seabed mound) is untouched and now
  disagrees with the coast map's Bombie at (−280, 1 020): two Bombies.
- The rendered seabed outside the reef map is still `depthBg` shifted to the waterline, not the coast map.
- From the lineup (eye 0.8 m) the far breaks are not readable 1–2 km away; the lookout shows the set lines and the
  shore's white water. The spec's §3e pictures need a higher camera.
