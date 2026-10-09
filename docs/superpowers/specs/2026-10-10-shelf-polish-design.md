# Shelf polish: the Womb on the real shelf, finished

**Author:** Fable 5.1 (orchestrator), 2026-10-10. **Executor:** Opus 5.5. **Branch:** `shelf-polish` from main d48d7c9
(the lineup-truth + womb-retune merge). **Why:** the merge carried six named debts (`handover/2026-10-09-womb-retune-fable.md`,
"Fable's closing review"). This segment pays them, in that order. Rule from the retune still governs: **change the bed or the
drawing, never the water**; no amp scaling, no peel caps; a test bar moves only with a one-line reason.

## 1. The ride's frame cost (the merge's one failed gate)

Riding median 46.0 → 51.7 ms (+12 %, bar ±10 %), p90 53 → 76 ms, same session, `_rideProfile --sim-t=300`. Find the pass
that grew with the FOCUSED profile against the pre-merge worktree `../ld-datum-before` (4f70490, still present). Likely
suspects: the ribbon now draws 180 m of hollow ledge (more segments, more emitters), the sheet past the ribbon's end, the
coast textures. Fix only a bounded cause (a count, a cap, a cull) and never the look at the lip. **Gate:** riding median ≤
50.6 ms (+10 % of 46.0) and p90 ≤ 60 ms, same session as a fresh main measurement; or a diagnosis naming the pass and its
cost with a one-line ruling request.

## 2. One curl, one clock on the new ledge

`crestTrace: one curl, one clock` 9 violations at 6 ft, 1 at 8 ft; `reefField: until carries the hold back along its ray`
8 jumps of 0.020–0.040 s (bar 0.02). The curl rule `T′(i) = max(Tₛ(i), min_j(T′(j) + d/curlMaxMs))` is monotone by
construction, so a violation is a seam, not noise. Expect it where the 46° ledge turns due north into the inside (one line
or two? `peelLines` groups connected components within 10 cells) or at the tip where the right meets the left. Diagnose
with the trace (which cells, which line, their Tₛ, T′, the neighbour that should have bound them), then fix the record.
**Gate:** both tests green with their bars unchanged; the curl report (`_curlReport`) at 6/8/12 ft: one curl per side, no
held nodes, peel within 0.2 m/s of the retune's 11.3/11.7/11.9.

## 3. The sheet's fold past the ribbon's run end

From the stand at Pumping and Huge a row of flat beige quads sits on the inside leg, past where the ribbon stops: the
water sheet's coarse far grid stands a steep front the ribbon no longer draws (Opus's hide test, `_sheetEta.ts`). Ruling:
**the ribbon draws every breaking front; the sheet never stands one alone.** So the ribbon's run continues onto the
inside leg (the north leg to the map's edge) as the closeout it is (whitewater, no hollow), or, if the run length is
capped for cost, the sheet's front is clamped to the unbroken swell where no ribbon runs. Prefer the first. **Gate:** stand
frames at Pumping and Huge at t+3/t+5 with no quads (Fable looks); the GPU/CPU sheet self-test unchanged; the ride's
frame gate (§1) still met after.

## 4. The remaining breaker bars

From `handover/2026-10-09-womb-retune-opus.md` §Full suite, after §2: breakingField (terrace 6.5 m, closure 0.51 s,
highest water still 4 steps, pile grows, pile spread, peak not tallest, lift 0.277), crestTrace left 7.98 m/s, station ψ
1.4e-4, sprayEmitters mid-throw 2. For each: measure on main, say in one line whether it is (a) the same physics measured
on a different reef (re-pin with the new number and the reason), (b) a real miss (fix, or carry with a diagnosis), or (c)
a test assumption from the old peak (rewrite the test). **Gate:** `src/breaker` red list = lineup-truth's carried list
only (the ones red in the idle baseline before womb-retune), each remaining red named in the handover with its class.

## 5. The shore band is the shelf's, not 60 m

`coastBreaking: 8 ft no closeout` fails on 167 cells ~130 m off the beach, 1 km north of the reef, on the hand-set inner
shelf. `SHORE_BAND_M = 60` is a constant from before the buoy dial. The honest rule: a set wave of height H breaks where
the coast profile reaches its breaking depth (`breakingDepth`), so the shore band at band B is the distance off the
waterline where the hand-set profile (`coastMap`'s shore ramp + inner shelf) reaches `breakingDepth(H_B)`, per row,
plus a 20 m margin. Replace the constant by that function; the test then says "no breaking outside the four breaks and
the shore's own break at this size". If the 8 ft cells lie beyond even that band, report where and why (a shoal in the
traced contours?) and carry. **Gate:** `coastBreaking.test` green at 4/6/8 ft, or the 8 ft locus named.

## 6. One truth: `?coast=off` goes

Remove the flag and the no-coast game path (`App.ts:188`, the worker's request, the dev panel's Coast folder toggle if
it duplicates it). The far-field (flat-bed) seed stays only as a function for the tests that need a flat bed
(`coastField.test` "reduces to the far field"). **Gate:** grep for `coast=off`/`coastOff` empty in `src/`; the game boots
and rides (one `_rideProfile` run); the select screen's matrix test unchanged.

## 7. One Bombie

`src/bombie/` (the old atmospheric Bombie at (−300, 340): its own bursts and seabed mound) disagrees with the coast map's
Ellensbrook Bombie at (−280, 1 020), which breaks from 8 ft (the coast's T4). Ruling: **one Bombie, the coast's.** The old
mound goes from the bed (it is inside the reef map's south fade, check nothing else reads it); its bursts, if they are
worth keeping as a far-off visual, re-aim at the coast's Bombie and fire only when the coast breaking map says it breaks
(≥ 8 ft; the A-frame at 10). If re-aiming is more than a position and a gate, delete the module and say so. **Gate:**
`bombie*` tests updated or removed with the reason; the lookout frame at Big shows white water at the Bombie and none at
(−300, 340); at Solid none at either.

## 8. Out of scope

The seabed render outside the reef map (still `depthBg`), a far foam layer, a direction-aware offering (247° runs
13–14 m/s), small-swell rideability (Fun), Cobblestones, riding any break but the Womb, the camera, land beyond the terrain.

## 9. Gates summary (Opus pastes, Fable reviews)

§1 frames table; §2 tests + curl report; §3 stand frames; §4 red list with classes; §5 test or locus; §6 grep + ride; §7
frames; the full suite idle, names diffed against `task6-fails-names.txt` (the merge's list) with every change named;
captures for Andrew: stand + down the line at Pumping and Huge, lookout at Big; both handovers; push.
