# Fable → Fable: R1 reviewed, R1.5 written (2026-10-06, late)

For the next Fable session. Read this, then `2026-10-06-r1-fable.md` (Opus's handover) only if you need the R1 numbers;
the memory file `r1-the-ride.md` already carries the state.

## Where things stand

- Branch `r1-the-ride`, 13 commits 12cfa39..98e9010, pushed, **not merged**. Local `main` has one commit the branch lacks
  (6d14a35, the async-pipeline prewarm); R1.5's Task 0 merges it in.
- I reviewed the branch against `plans/2026-10-06-r1-the-ride.md`: scope clean (37 files, all R1's; sets, drainFactor,
  REEF_WARP untouched; nothing new between sheet and profile), tsc clean, full suite 43 failed / 1828 passed / 17 skipped
  of 1888 (Opus: 43 / 1827 / 17 of 1887), the ride test's 1.1–2.8 s reproduced, every ledgered ruling checked against the
  code and sound. Frames: −6 s shoulder camera good; −4 s caught frame the best take-off image yet; −3 s she is on the
  back; the live caught frame is all water (fixed in 12e6a72, never re-captured).
- Verdict given to Andrew: do not merge yet; one short segment on top.
- **R1.5 written, uncommitted, awaiting Andrew's read:** `specs/2026-10-06-r1-5-crest-carry-design.md` and
  `plans/2026-10-06-r1-5-crest-carry.md`. Andrew's pattern last time: "Approved, push it and I'll hand it to Opus" (the
  R1 spec + plan went on main as e896680). For R1.5 they belong on the branch: commit them there and push when he says so.

## The finding that decides R1.5

The take-off fails because the ride's water is linear theory. `ride/water.ts` → `breaker/flow.ts` `flowFromEta`:
u = η ω / (k h), capped at √(g (h + η)). At the spot (η 2.7, h 8.3, c 8.9) that is 2.9 m/s, a third of c; a breaking
crest's water runs ≈ c. Gravity on a 0.7 face is 4.6 m/s² and needs > 1 s to take her from 3 to 9 m/s; the steep face
is 3–4 m long and passes in 0.3–0.4 s. Hence no assist value helps (Opus tried 4, 8, 12).

Ruling: Opus's option (b) scoped to the catch. While caught by the slope and prone, and through the pop-up, her velocity
relaxes to `CREST_CARRY × c` (0.85) along the travel with τ `CARRY_TAU_S` 0.15 s, **and the prone drag is taken against
that carried water** (my first draft forgot this: against still water the 0.6 v + 0.3 v² prone drag holds her near
0.7 c). The ride's drag model, `flowFromEta`, the wave and the camera stay untouched. Not (a) a gentler reef face (undoes
R1 §1–2), not (c) a bare arcade launch (fallback if (b) is short).

## What to check when Opus's R1.5 handover arrives

1. `rideOnSections` ×4 green (≥ 5 s, no wipeout). If not, the commit carries the 0.1 s trace and names (i)/(ii)/(iii)
   from the plan's Task 1 Step 6; (ii) "wiped out on the lip" means the pop-up spot's slope exceeds `WIPEOUT_SLOPE` 2.5
   and the answer is R2's lip, not more carry; (iii) "stalled after the drop" is the ride's run along the line (R3 feel).
2. The live frames at 6/7/8 ft: she must be *on the face* at +1.5 s of riding, moving along the line. The caught frame
   must show her (the sight-line lift). If the drop looks like a lift-and-slide rather than a drop, that is `FLOAT_*`
   heave vs the planing switch at pop-up: note it for R3, do not tune it in R1.5.
3. The carry's equilibrium on a 0.5 face at c 9 should be 7.6–8.3 m/s (0.85 c + gravity against the relaxation).
4. Nothing under `src/breaker`, `src/seabed`, `src/ocean` changed. `CREST_CARRY` / `CARRY_TAU_S` tried once only.
5. The suite's failing list: only rideOnSections ×4 should leave it. Any new name is a regression.

Then: merge is Andrew's call. Recommend merging R1 + R1.5 together once (1) and (2) hold.

## Open after R1.5 (unchanged from R1's deferred list)

Spread cap's hard switch; the ψ "oval" state unreachable (step ≥ 1 ⇒ ψ ≥ ~0.060); no 4 ft take-off test; the pop-up
blend τ also slows the camera in the first ride second and in bail; the paddle camera hard-wired to the north shoulder
(`PADDLE_PEEL_SIGN` −1: right for the Womb's left, wrong for a right-hander); H/depth at onset 0.98 vs 0.75–0.85 (the
`breakingDepth` deep-water exponent above 7 m and the σ 8 m shoreward smoothing both lag the onset up the face); the rim
residual 0.11 m (sectionPoint's sheet-column Hermite: R2); the 26 R1-exposed test failures listed in Opus's handover,
several pinning root-cause steps 1–2 at 6 ft on the old onset ("one curl, one clock" is R2).

## Budget notes

This review cost one Fable session: reading two handovers + the plan + diffs, two test runs, four frames. Opus ran the
R1 final review on itself to save Fable; that review found the Critical (dev settings model), so it was worth it. Keep
doing that: Opus reviews Opus, Fable reads the evidence.
