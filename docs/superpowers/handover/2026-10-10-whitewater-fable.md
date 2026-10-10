# Whitewater, spray, foam and mist: for Fable (Opus 5.5, 2026-10-10/11)

Branch `whitewater` (worktree `../ld-whitewater`) from main 6b67f6f, pushed, not merged. Spec
`specs/2026-10-10-whitewater-spray-design.md`, plan `plans/2026-10-10-whitewater-spray.md`, ledger
`.superpowers/sdd/2026-10-10-whitewater-spray/progress.md` (git-ignored; every ruling and every measured number in order).
Evidence `docs/superpowers/evidence/whitewater/` (acceptance moments `accept/README.md`; the STOPs `task6-stop.md`,
`task7.md`, `task7b-stop.md`; foam `foam-replays.md`); captures `../liquid-dreams-captures/whitewater-2026-10-10/`.
Commits, numbers against bars, dials, tools and gotchas: `2026-10-10-whitewater-opus.md`.

## For the final review

- **The frame gate** (Task 8, 5 pairs interleaved, 02:49–03:00): no-stall riding main 25.85 vs branch 24.8 ms = 0.96 × (raw 1.115 ×: the branch drew 2 of the 3 paddle-out stalls); cam 3.6 / 3.7 ms; `_rideCost` +0.4 ms. Accepted on the stall-matched comparison (your ruling).
- **Calm identity**: the flat sea differs from main only in L2's shore band (49308 px, y 643–960); Glassy with a break only in the inside water band (y 627–1165, tol 8).
- **The suite** (full, both trees): the failing names are main's 34 exactly (after the stale churnSize expectation); GPU self-tests foam 11/12, spray 5/5, ribbon 6/7, breaker 14/14 (both failures main's own); tsc clean.
- The acceptance moments (`accept/`) are Andrew's to judge against the five photos.

## Rulings I made (all in the ledger with what they cost if wrong; yours are recorded there too)

Setup and Tasks 1–3
- The ledger lives in the executing-plans workspace `.superpowers/sdd/2026-10-10-whitewater-spray/` (the plan named
  `…/2026-10-10-whitewater/`).
- node_modules junctioned (the plan) though the spec header said install; removed with `rmdir` before any worktree removal.
- Task 1's one-term edit to `sectionFrameKnots` taken as the plan's own scoped exception to "untouched" (0 outside the surge).
- The baselines' first branch runs were contaminated (vite served Task 1 mid-run): re-measured on a detached main worktree.
- The surge travels per station like the other smoothed numbers (ribbon STATION_VEC4S 4 → 5); the lift applies after seatShift
  (a lifted trough re-seated the curl); "never crosses itself" sweeps surgeWeight's envelope; surge optional (absent 0).
- M-tube = a free camera 3 m up, 100 m down the line (moments carry no ride camera).
- Tasks 1–3 in one commit (shared hunks).
- The boil packed per station (CPU) × the vertex's fresh foam × A (GPU); the foam volume takes a separate `breakFoam`
  input (the shore's swash keeps today's look: calm identity).
- F2: the fringe is lost where inner = 0 (a station within the run-end margin). F3: "fresh" = landing → sectionEnd.

Task 4 (the lace)
- Push a scalar (local wave speed × foam) from the one breaking sum; midpoint backtrace (a single one lost 4.2 % of mass);
  the state in RGBA32F (the lace's decay is below a half float's step); coarse steps sample the source 5× (0.109 → 0.0175);
  the pattern axis's wind share gated over 1–3 m/s; clearTimeS read at material build (dev dial only).
- Covered replays exact (≤ 400 ms), uncovered cheap (yours); tools set `exactFoamReplays`.
- L2: the shore band a constant (25 m), not yet a dial.

Tasks 5–6 (spray)
- SPIT_KIND opacity on the kind scale (0.5 × 0.32); onshore makes a forward veil; SprayBirth.kind/yWater optional.
- `standingCrestY` from the station's smoothed numbers and two measured constants (the plan's formula was 0.33–0.56 m off).

Task 7 (mist)
- The slab before the aerial perspective (the plan said after); one hook on Sky (`sky.mist`) rather than a parameter per
  material; the mist's source from the same breaking sum (`mistWanted`); the path rule; absent yWater = NO_WATER (−1e4).
- The slab skips its light where the map holds no mist (it cost +1.7 ms riding without; +0.7 with).

7b
- S1 measured on screen (`_sprayScreen.mjs`, tol 25/255), not the CPU alpha probe (which read 2 H while the frame showed a
  wisp); levers 4 (life) and the updraft not taken (target met at 3).
- S3 (a): the bars were the lace's holes, not LIP_STREAK (the current curl foam has none).
- S3 (b): the billow field is 3-D over (detail x, height above the tide, detail z), not 2-D in the developed coordinates —
  the detail coordinate collapses down the mound's face.
- S3 ruling 3: "the mound's median" read as the red channel's (the one reported throughout): 0.55 → R 230.

Task 8
- Acceptance #5 from a new side camera (55 m), #2 with the landing beside +60 s, #4 a new drone camera (yours accepted).
- L3's torn lace × `tear` (the breaking foam's share of the sheet's foam): the shore's swash and surf foam keep their lace (calm identity); the ribbon passes none.
- Pixel-identity captures taken first and alone (a change of conditions mid-batch leaves a faint residue).

Final review fixes (Fable, on 5606954)
- R1: the impact pool's replay length is its own from construction (the plume's 5 s only for the spray kind); in game App's
  `impact.setMaxLifeS(2.4)` already set it (58 ticks), so this pins the default and adds the test.
- R3: foamStep clamps the age at FOAM_AGE_MAX_S (1e4 s) as FoamField's step does. R4: breaking.ts's surge comment and the
  duplicate ERODING_KINDS re-export. R2: carried (follow-up 11).

## Follow-ups (not done this segment)

1. **The seam where the solid boil meets the curl** (a faint vertical seam at the curl's edge on the mound, tube view): the
   boil's freshness ramps over FRESH_RISE_S 0.5 s at the landing; the lace and the volume meet there.
2. **A second compiled copy of SetWaves' breaking sum makes every foam step ~3× slower** (isolated probe: 200 live ticks main
   130 ms, a second sum 470–580 ms). Cause not found (same WGSL size and uniforms). Tried: half/f32 state, no midpoint, linear
   decay, no push, main's SetWaves, one pipeline vs two. Everything rides one sum today; anything wanting a second read of the
   breaking (a mist pass, a coarse pass of its own) hits this first.
3. The plume's life (PLUME_LIFE_S [4, 7], photo 2's longer plume) needs SPRAY_HISTORY_TICKS 100 → 140 (a 40 % larger pool).
4. Feathering follows the crest trace's stations; where the trace ends before the standing line does, the haze ends too (the
   trace was not extended, as ruled).
5. The sand's warm tint at 17:00 is the sun's white balance (the sky segment), not the whitewater's.
6. S3's billows have no silhouette lumps of their own (shading only); the churn (Andrew's churnSize) is the geometry.
7. L2's shore band (25 m) becomes a dial if the shore break reads thin at low tide.
8. Acceptance #5's opaque navy curtain belongs to the lip-look segment.
9. L3 leaves a few small closed lace cells at the edge of accept-4's frame; a stronger tear mask (smoothstep(0, 0.4)) is the next step if they read.
10. The paddle-out stall (~4 s) in the profiler harness, both trees (ride-stall's follow-up).
11. **No mist under the airborne plume (final review R2, a named gap).** SetWaves' mist `lip` source is gated on the breaking
    foam, which is 0 until the collapse, so the slab's plume share never fires over the throw (§6.1). Tried: gate it on the
    crest band (`near × lateral`) over the throw instead: at strong offshore the share reaches 1 and the slab goes opaque —
    a solid white wall along the whole throwing section (`evidence/whitewater/r2-lip-mist-tried.png`). Reverted. The fix
    wants a small plume share (~0.1) and the band narrowed to the lip's back, tuned by eye.
12. Per-frame allocations in `crestTrace.rideEntries` and `standingCrestY`'s callers (final review R5).
13. The mist slab fetches the foam map in every near-water material before its MIST_MIN gate (final review R6): the
    texture read is paid everywhere; a box test (`inside`) before the fetch would skip it outside the foam box.

## Process rules (this segment's)

- **Stop only Electron processes confirmed as your own** (by command line); never by image name: Andrew's game is the same exe.
- **Evidence capture never takes the foreground**: `captureMoments.mjs` hidden by default, one process per batch (hidden ≡
  focused, 0 px). Only `_rideProfile` keeps the focus, and only in a window Andrew gives.
- After a `sed -i` edit, `touch` the file: vite misses the new inode and serves the old module.

## Fable's closing review (2026-10-11 ~04:10, overnight under Andrew's delegation)

**Recommendation: merge `whitewater` (d1ab69e) to main.** Andrew merges; I did not (he said "be the decision maker", not "merge").
Branch already contains origin/main d8b40fe (level-read + inner-shelf), merged clean; post-merge tsc clean, units = main's reds
exactly, GPU self-tests foam 11/12, spray 5/5, ribbon 6/7, breaker 14/14 (both reds main's own), accept-1 unchanged on the merged shelf.

**What I verified myself:** every STOP's captures against the five photos (Tasks 3, 6, 7b, 8), the four S3 mound zooms, the
lace triples, the seven wind rows; an independent reviewer over the whole diff (verdict MERGEABLE; its R1–R4 fixed in c2eea5d,
R2 tried and carried, R5/R6 carried); the frame gate's stall analysis (no-stall 0.96×, raw 1.115× from three 4 s paddle-out
stalls in both trees — accepted on the stall-matched comparison, and the harness now prints the no-stall median itself).

**Spec §7 bars, final:** riding no-stall 0.96× (bar 1.10); cam 3.6 → 3.7 ms (bar +1); births +0.4 ms (bar +2); foam tick < 0.1 ms;
calm identity: flat sea differs only in L2's shore band, Glassy-with-break only in the inside water band; replay covered 367 ms
(bar 400), uncovered 178 ms; replay ≡ live 0.0175 / 0.0139 (bar 0.02). L3's cam cost unmeasured (no quiet window after it; one
noise read per lace pixel).

**Rulings I made beyond the spec** (all in the ledger): the mound's surge translates knots 5–10 from phase 1.25 (a lift during the
hold crosses the lip); the ride's copy of the stations carries surge 0 (look only, F4); the replay bar split by cover (covered
exact ≤ 400 ms, uncovered cheap); CoastalSurf's foam confined to a 25–50 m shore band inside the map's box (L2); aged lace cover
capped 0.35 (L1) and torn into streaks (L3); the mound's form from a 3-D billow field + the foam volume exposed for itself
(0.55, a dial); captures never take the foreground (hidden, one process per batch — a standing rule now).

**Andrew's dials (set in-game, Foam/Break folders):** surge 0.5, churnSize 0.25, foam volume exposure 0.55 (0.7 = whiter, flatter),
spray amount 1, plume 1, laceLifeS 75.

**For Andrew's eye in the morning:** `docs/superpowers/evidence/whitewater/accept/` beside `reference/wave/whitewater/1–5`; the mound
`s3-mound.png`; the wind rows `wind-*.png`. Known honest gaps: no mist under the airborne plume yet (follow-up 11), the curtain is
the lip-look segment's opaque navy (8), the warm 09:30/17:00 tint is the sky's white balance (5).

**Next segments, my order:** (1) the lip's curtain (translucent green, photo 5) — the one thing in the acceptance frames that is not
this segment's and reads wrong; (2) R4 whitewater physics for the surfer (the mound is look-only); (3) a perf segment: the second
compiled breaking sum (3×), rideEntries/standingCrestY allocations, the mist fetch gate, the paddle-out stall; (4) sky white balance.
