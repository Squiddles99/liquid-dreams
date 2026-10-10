# Level read on a plateaued ray: for Fable (Opus 5.5, 2026-10-10)

Branch `level-read` (worktree `../ld-level-read`) from main 9b5e7e2. Plan `plans/2026-10-10-level-read-plateau.md`.
Ledger `.superpowers/sdd/2026-10-10-level-read-plateau/progress.md` (git-ignored). Evidence `docs/superpowers/evidence/level-read/`;
frame `../liquid-dreams-captures/level-read-2026-10-10/before-Pumping-tide0-dtl-404.17.png`. Probes on the branch
(55b43f0): candidates A/B/C sit behind env switches (`LEVEL_READ=A|B`, `LEVEL_READ_EDGE=<levels>`,
`LEVEL_READ_NOSMOOTH=1`). They are Node-only (the browser never sees them) and get removed at Task 2.

## STOP at Task 1: the plan's premise doesn't hold, and no level-read rule reaches 0 seams

### Task 0 baselines (whole trace, dt 1/3/6, `_curlSeams --quiet`, the crestTrace test's bar)

| | violations | worst step |
|---|---|---|
| 6 ft | 9 (7 TB + 2 UNTIL) | 1.95 s, arcs 182/183, 233 m from the tip |
| 8 ft | 1 | 1.03 s, arcs 196/197, 238 m |
| 12 ft | 0 | — |

All of them are on the inner shelf inside the right, 231–248 m from the tip. The ride (`_rideCost` 7/12 ft) is
deterministic: a rerun matches step for step (`ride-old-rerun.txt`).

### What the seam actually is (`tools/_levelRead.ts`: the seam station's four corner nodes, each ray walked back)

1. **The rays are not plateaued.** At arc 182 every corner's running maximum is still rising (age 0). It climbs
   0.167 → 0.219 over the last 30 m. Level 5 broke ~60 m back (tb5 ≈ 6 s), the wave's own level q* = 0.2135 was crossed
   3–8 m back (~0.3–0.8 s ago), and "crossing now" is about right for these rays. **Candidate A (store when the run
   last rose) is therefore a no-op**: identical seam counts, since every ray at the seam has age 0.
2. **The 2 s step is the along-crest smoothing of onset times** (`smoothOnsetTimes`, σ 8 m, over the nodes broken
   at that level only). At the level-6 band's edge, a node that crossed Q6 ~5 m back (~0.5 s) stores tb6 = 2.2–2.3 s,
   which is the band's average along the crest. Just outside the band, the toRun read uses the ray's own unsmoothed "now".
   With the smoothing off (`LEVEL_READ_NOSMOOTH`), 182/183 reads 0.60 → 1.40: a ramp, not a 2 s step.
3. **Under the smoothing, the inner shelf's own order is reversed (the hook).** With smoothing off the count goes UP
   (6 ft 27, 8 ft 7; worst steps 0.80 / 0.18 s). Along the crest away from the run's curl, tb rises 0.6 → 3.5 s over
   16 m because those rays really broke earlier (the level-6 line's hooked leg). No change to how the level is read can
   make that order monotone. It is Task 4's subject (the curl's order in the bake), not a reader defect.

### Candidates, measured on the CPU only

| | 6 ft | 8 ft | 12 ft | ridden line (`_rideCost` 7 / 12 ft vs Task 0) | `_curlReport` vs Task 0 | record / GPU |
|---|---|---|---|---|---|---|
| A: run's age field, reader uses `age − D_k` | 9, worst 1.95 | 1, 1.03 | 0 | identical | identical | +1 float/node; fits texel 0 `.y` (free channel), no new texture or load |
| B: extrapolate the run's time from levels k−1, k | 4, worst 1.59 | 2, 1.08 | 0 | moves: 7 ft from +2.5 s, path ≤ 0.1 m, until −0.01…−0.02 s; 12 ft until +0.01 | **peel +0.2…+0.6 m/s on every band** (fails the 0.1 bar) | none |
| B also adds a violation ON the ridden run (6 ft t+6, arc −68, 65 m from the tip: tb 0.48 → 0.94) | | | | | | |
| C: smoothing fades back to the ray's own time at the band edge (smoothstep over 1 level of log q above Q_k; bake only) | 11, worst **1.02** | 6, 0.62 | 0 | moves: 7 ft from +1.0 s, path ≤ 0.3 m by +5.5 s, until +0.01…+0.06 s, phase −0.02; 12 ft until +0.01 at 2 steps | Solid 20: 12.7→12.6, onset 2.1→2.2; Pumping 20: second 19.5→19.6; Solid 12: 10.7→10.8 (all within 0.1) | none: record unchanged in layout, GPU reads it as is (CPU = GPU by construction) |
| C at ½ level | 10, 1.31 | 5, 0.61 | 0 | (not run) | (not run) | none |

(Seam counts for C go up because the smoothed plateau that hid the hook's small steps is gone; the worst step halves.)

### Why I can't pick within the plan's gate

The gate wants 0 seams over the whole trace **and** the ridden line unchanged. A changes nothing. B and C both move the
ridden line (B more, and B also breaks the ridden run once). None reaches 0, because the remaining steps are the bake's
real crest order on the inner shelf. The ride moves under C because the band-edge fade also applies on the ledge
wherever a level's band edge crosses her line. That is honest, since edge nodes then read their own break time
instead of the band's average, but it is a change.

### Recommendation

**C + Task 4, gate re-premised.** C removes the seam's actual cause (smoothed band average vs the ray's own "now"),
costs nothing on the GPU (bake only, so no mirror is needed and Task 3 shrinks to a self-test run), and keeps the curl
report within 0.1 m/s. Then Task 4 (order the curl along the crest where the level-6 line hooks) is what can bring the
count to 0. Gate: "ridden line within ≤ 0.3 m / ≤ 0.06 s, every differing step named" instead of "identical".
Alternative if the ridden line must stay bit-identical: **carry it**. Keep the 220 m limit, correct the crestTrace
comment's cause (smoothing + hook, not a plateau), and close the segment. A (the plan's) and B are not worth taking.

**Rulings wanted (one line each):**
1. Pick: C + Task 4 with the re-premised gate / carry and close / other.
2. If C: edge width 1 level (measured) or ½ level?
3. If C: is a ridden-line move of ≤ 0.3 m / ≤ 0.06 s acceptable, or does the fade need to be limited (e.g. only where
   the band edge is wider than N m, which the ledge's fast climb never is)? That would be a third probe.

## Fable's ruling (2026-10-10): C + Task 4, gate re-premised; A and B not taken

The memo's finding stands on the evidence: at the seam every corner ray's run is still rising (age 0), so the plan's
plateau premise is wrong, and the 2 s step is `smoothOnsetTimes`' band average read against the ray's own unsmoothed
"now" at the level-6 band edge (NOSMOOTH turns it into a 0.6 → 1.4 s ramp). What remains under that is the bake's real
crest order on the inner shelf (the hook). The plan note's "plateau" wording is to be corrected wherever it is quoted.

**Rulings (one line each).**
1. **Pick: C + Task 4.** A is a no-op on the data (not taken; the age field and `ONSET_RECORD_LENGTH = 2 + 6·LEVELS` go back
   to `1 + 6·LEVELS`, no new texel). B moves the peel 0.2–0.6 m/s on every band and adds a violation ON the ridden run (not
   taken). All three env probes come out of `src/` at Task 2 (`LEVEL_READ`, `LEVEL_READ_EDGE`, `LEVEL_READ_NOSMOOTH`); C
   becomes plain code in `smoothOnsetTimes` with a named constant and a comment that says what it is for (the band-edge
   read, not a plateau). `tools/_levelRead.ts` and `_curlSeams --quiet` stay as tools.
2. **Edge width: 1 level** of log q above Q_k (worst step 1.02 s measured; ½ level was worse at 1.31 s and its ride/curl
   were not run, so it is not preferred on evidence).
3. **The ridden-line move is accepted, no third probe.** An edge node reading its own break time instead of the band's
   average is the more honest value on the ledge too; the plan's own bar for the curl report (0.1 m/s) holds (12.7→12.6,
   10.7→10.8, onset 2.1→2.2), and ≤ 0.3 m / ≤ 0.06 s on a 0.5 s-sampled ride is under what the player can feel. Gate for
   Task 5 is therefore: **ridden line within ≤ 0.3 m / ≤ 0.06 s of Task 0, every differing step named** (position, phase,
   until), the Pumping frame's ribbon-region pixel difference stated (not required identical), curl report within 0.1 m/s.
   This departs from Andrew's "ridden line unchanged" by that bound; it is flagged for him at the merge decision and he
   can veto it there.

**Task 2 as re-premised.** The plan's "two arcs within 0.1 s" test is withdrawn (with C they read a ramp, which is the
truth). In its place: a unit test on `smoothOnsetTimes` with a synthetic row: a node whose run is just over Q_k keeps its
own time (fade weight ≈ 0); a node a full level above Q_k takes the smoothed time; a node that has not broken at that level
is untouched. The crestTrace one-curl check **keeps the 220 m limit for now**, with its comment corrected (band-edge
smoothing read + the level-6 hook, not a plateau); it widens to the whole trace only if Task 4 reaches 0. Whole-trace
`_curlSeams` numbers after C go into the evidence folder (`seams-C.txt`), with each remaining violation classed TB/UNTIL,
its station, and whether it lies on the level-6 hook.

**Task 3 shrinks to a run.** The record's layout is unchanged and the GPU reads the same baked values, so there is no
mirror to write. Run `npx electron tools/_selftest.mjs --filter=breaker --max-s=2400`, expect 14/14; no new parity case.

**Task 4: one attempt, time-boxed, then STOP.** Measure first (the `seams-C.txt` list above). Then one commit that orders
the curl along the crest where the level-6 line hooks under it, in the bake, local to that place. Gate: 0 violations over
the whole trace at 6/8/12 ft, ridden line still within the Task 5 bound (named), curl report within 0.1 m/s. If one
attempt does not reach 0, do **not** carry silently: STOP with a short memo in this file (the count and worst step after
the attempt, what the attempt changed, and what a non-local fix would take), and I decide carry or continue.

**Task 5 as planned** with the re-premised gate above; handovers `-opus.md` and this file; push; do not merge.

Proceed: Task 2 (C as plain code, probes out, record layout restored, the new unit test), Task 3 run, Task 4 measure +
one attempt, then STOP or Task 5.

## STOP at Task 4 (Opus, 2026-10-10): the one attempt does not reach 0

**Done before it.** Task 2 e4de42a: C as plain code (`reefField.ONSET_EDGE_LEVELS = 1` in `smoothOnsetTimes`), probes out,
record layout back to 1 + 6 levels, new unit test (`reefField.test.ts` "smoothOnsetTimes keeps a band edge on its own
clock", RED→GREEN), crestTrace comment corrected, 220 m limit kept. Whole trace (`evidence/level-read/seams-C.txt`,
classed): 6 ft 11 (worst 1.02 s), 8 ft 6 (0.62 s), 12 ft 0. All 9 of the 6 ft TB steps are on the level-6 hook (line 17685);
the 2 UNTIL steps at 6 ft and all 6 at 8 ft are not (level-5 line 35179, level-4 line 409, the level-5 band's edge).
Task 3: GPU self-test 14/14 at e4de42a (no mirror needed). Breaker suite after Task 2 (busy machine): 50 red / 421, vs
shelf-polish's `breaker-baseline-names.txt` 2 new: **`smallSwell` "Solid at tide 0.5 m"** (first-leg peel off the
womb-retune matrix by 0.080 m/s against its 0.06 pin: the accepted C move, left red for you to rule on re-pinning that
row) and `peelStretch` "two sections meet" (a 5 s timeout under load).

**The attempt (one commit, this one).** `curlTimes` takes an optional `seedRank`. For level k ≥ 1, `curlPass` seeds each
line's curl at the node whose ray broke level k − 1 first (the first march's record, physical), instead of at the
line's own earliest break. So a level's curl runs the way the level below peeled. Unit test `curlClock.test.ts` "curlTimes
seeds a line where the level below broke first" RED→GREEN, 9/9.

**Measured (`seams-T4.txt`, `ride-T4.txt`, `curl-T4.txt`).**
- Seams: **6 ft 3** (worst 0.77 s; was 11 / 1.02), **8 ft 6** (unchanged, 0.62 s: not the hook), 12 ft 0.
  The 6 ft remainder is the hook's corner where it meets the level-5 curl: arcs 182→183→184 tb 0.58 → 1.36 → 1.73 (rays
  meet the reseeded line at T′ 5.05 beside the east band's 5.31), and UNTIL at arcs 197/198 (2.01 → 1.66: the north leg is
  now held to T′ 5.45, so the wait ahead of it shortens).
- Ridden line vs C: identical except the live-station count (+1/+2 at three samples). It is still within the accepted
  bound of Task 0.
- Curl report vs C: Solid/20 first peel 12.6 → 12.7 m/s (back to Task 0's); **Pumping/20 first peel 13.3 → 13.4, first
  break 1.9 → 2.1 s, held 31.6 → 33.3 %; Solid/20 held 26.9 → 27.8 %**. The reseed reaches the ridden left's lines too
  (within 0.1 m/s, but its first break moves 0.2 s).

**What a non-local fix would take.** The 8 ft steps are a level-4/5 band edge read across a level-4 line that is itself
ordered against the crest. Nothing on one line fixes them. Zero over the whole trace needs the one-curl rule enforced
**along the crest rather than along lines**: in the bake, per level, sweep each crest (a τ contour) out from its earliest
break and hold every ray behind its crest neighbour nearer that break. That is a new pass over every line, the ridden
left included, with its own ride/curl measurement. Alternatively, the one-curl test's premise is wrong on the inner
shelf: two sections meeting there is a closeout, which the Womb's inside does, so the check stays at 220 m and the
inner shelf is excluded by name.

**Rulings wanted (one line each):**
1. Keep the Task 4 attempt (6 ft 11 → 3; it moves the ridden left's first break 0.2 s) or revert it to C alone?
2. Carry or continue: the crest-ordered pass (new segment), or accept the inner shelf as a closeout and close at 220 m?
3. `smallSwell` "Solid at tide 0.5 m": re-pin the matrix row to the new first-leg peel, or widen?

## Fable's ruling (2026-10-10, Task 4 STOP): revert the attempt, close on C at 220 m, re-pin the row

The attempt is honest and well measured, and it is not taken. It reaches 3 at 6 ft, not 0, and the 8 ft steps are not
the hook at all. Its cost lands on the ridden wave: the reseed reaches the left's lines, and at Pumping the first break
moves 1.9 → 2.1 s with the held share 31.6 → 33.3 % (`curl-T4.txt`). That is the Womb's ridden curl changed for a seam
on an inner-shelf closeout 230 m from the tip that no one rides. Andrew's gate for this segment is the ridden line
unchanged; C's ≤ 0.3 m / 0.06 s was already the limit of what I would accept on his behalf.

**Rulings (one line each).**
1. **Revert ae321a7's source** (`curlClock.ts`, `reefField.ts`, `curlClock.test.ts`) in one commit; keep `seams-T4.txt`,
   `curl-T4.txt`, `ride-T4.txt` and the STOP memo above as the record of the attempt. `seedRank` does not ship.
2. **Carry, close at 220 m.** Two curls meeting along one crest on the inner shelf is a closeout, which the Womb's
   inside is; the one-curl check keeps its 220 m limit and its comment names the inner shelf as excluded for that reason,
   with the measured remainder after C (6 ft 11 / 1.02 s, 8 ft 6 / 0.62 s, 12 ft 0). The crest-ordered pass (sweep each
   τ contour from its earliest break, per level) goes into the handover's follow-ups as a named candidate for a later
   segment with its own ride/curl gate; it is not started now.
3. **Re-pin** the `smallSwell` "Solid at tide 0.5 m" row to C's first-leg peel (0.080 m/s off the old pin, inside the
   0.1 m/s bound), with a comment naming level-read C as the cause. Do not widen the tolerance.

**Task 5 on C alone** (e4de42a + the revert): `_rideCost` 7/12 ft vs Task 0 with every differing step named (ride-C is
that measurement; re-run only if the revert changes a byte of the record, which it must not: assert the record is
identical to e4de42a's), `_curlReport` vs Task 0 within 0.1 m/s (curl-C), the Pumping down-the-line frame with the
ribbon-region pixel difference stated, the breaker suite rerun idle for the `peelStretch` timeout, handovers, push.
Do not merge: Andrew decides, with the ≤ 0.3 m / 0.06 s ridden-line move flagged to him.

Proceed: the revert commit, the re-pin, Task 5, push.
