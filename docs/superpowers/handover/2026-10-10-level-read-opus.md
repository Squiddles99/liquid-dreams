# Level read: Opus handover (2026-10-10)

Branch `level-read` (worktree `../ld-level-read`; node_modules is a junction to main's, so `cmd /c rmdir` it before any
`git worktree remove`) from main 9b5e7e2. Pushed, **not merged**. Plan `plans/2026-10-10-level-read-plateau.md`; ledger
`.superpowers/sdd/2026-10-10-level-read-plateau/progress.md` (git-ignored); evidence `docs/superpowers/evidence/level-read/`;
captures `../liquid-dreams-captures/level-read-2026-10-10/`. Fable's rulings and the "for Andrew" list are in
`2026-10-10-level-read-fable.md`.

## What ships

One change to the water: `reefField.smoothOnsetTimes` fades each level's smoothed onset time back to the node's own over
the first `ONSET_EDGE_LEVELS` (1) level of log q above the level. A band's edge node keeps its own break time beside a ray
that reads its own "now". It is bake only: the record's layout is unchanged and the GPU reads the same texture (self-test
14/14). It does not touch the physics, the reader or the GPU code.

## Commits (9b5e7e2..level-read)

| commit | task | what |
|---|---|---|
| 55b43f0 | 0, 1 | baselines; candidates A/B/C as env-gated probes (removed in e4de42a) |
| bfd5510 | 1 | design memo: no plateau, the seam is band-edge smoothing over a reversed inner-shelf order; STOP |
| 9d133a7 | 1 | Fable: C + Task 4, gate re-premised |
| e4de42a | 2 | C as plain code (`ONSET_EDGE_LEVELS`), probes out, layout 1 + 6 levels, `smoothOnsetTimes` band-edge unit test |
| (none) | 3 | GPU self-test 14/14 at e4de42a (no mirror: bake only) |
| ae321a7 | 4 | one attempt: each level's curl seeded where the level below broke first (6 ft 11 → 3); STOP |
| c39fb7b | 4 | Fable: revert, close at 220 m, re-pin |
| 8da193c | 4 | revert of ae321a7's source (src byte-identical to e4de42a) |
| ff38d44 | 4 | `smallSwell` Solid 0.5 m peel re-pinned 10.5 → 10.6 m/s in matrix-225.txt; crestTrace comment names the inner shelf as a closeout |
| fc5982e | 5 | Task 5 evidence |
| (last) | 5 | breaker suite rerun (`breaker-names-after.txt`), these handovers |

## Task 5 evidence (C alone vs Task 0)

- **Ride** (`ride-diff-named.txt`): 7 ft moves from +1.0 s. The position drifts 0.10 → 0.32 m by +5.5 s, until goes
  +0.01 → +0.06 s, phase moves −0.01/−0.02, and the sheet-read counts change by ±1 curve at some steps. 12 ft: until
  +0.01 s at two samples, positions unchanged. **The 7 ft maximum 0.32 m is at the 0.3 m bound to within the 0.1 m print
  resolution, and it is still growing when the 6.5 s sample ends.** Identical step for step to the probe C run.
- **Curl report** (`curl-diff-named.txt`): peel within 0.1 m/s on every band (Solid/20 12.7 → 12.6; Pumping/20 second
  19.5 → 19.6; Solid/12 10.7 → 10.8). First breaks: Solid/20 2.1 → 2.2 s, Solid/12 4.7 → 4.8 s.
- **Frame** (`frame-pumping.md`): the capture is deterministic (0 pixels between two after-captures). Before vs after:
  1.79 % of pixels differ. Most of it is the spray plume over the peak (4,839 > 16 levels). The rest is thin lines
  along the lip and shoulder (1,751 > 16, mean 4.2). Not pixel-identical in the ribbon region; the shape reads the same.
- **Seams, whole trace** (`seams-C.txt`): 6 ft 11 (worst 1.02 s, was 1.95), 8 ft 6 (0.62, was 1.03), 12 ft 0. All on
  the inner shelf 231–248 m from the tip, now excluded from the one-curl check as a closeout (220 m limit kept).
- **Breaker suite**: see "Suite" below.

## Tools (kept)

- `tools/_curlSeams.ts --quiet`: violations over the whole trace with a count and the worst step; the per-station row
  reads the wave's own two levels.
- `tools/_levelRead.ts --at=x,z`: a station's four corner nodes and each one's ray walked back.
- `tools/_smallSwellRow.ts --band= --tide=`: the small-swell matrix test's first-leg numbers.

## Suite

`npx vitest run src/breaker` at the branch head (`evidence/level-read/breaker-names-after.txt`): **421 tests, 32 red,
378 green, 11 skipped**. **No red that is not in shelf-polish's `breaker-baseline-names.txt`**, and 38 of that list's reds
are green now (that run had 27 timeouts). `smallSwell` Solid 0.5 m is green after the re-pin; `peelStretch` "two sections
meet" is green, so Task 2's red there was the timeout. One timeout this run, `reefField` "the field joins the outside
smoothly", which is already in the baseline list. **The run was NOT idle**: Andrew had it run alongside ld-whitewater's
`_rideProfile` instead of waiting. Earlier, the Task 2 run under load had 50 red, 2 of them new (both explained above).
Only `src/breaker` was run, not the full suite.

## Lessons

- Read the ray, not the label. The plan named a plateau from the record's numbers at one station; walking the four
  corner rays back showed them still rising, and the smoothing step was the cause. `_levelRead.ts` does that walk.
- Ports: 5191 belonged to another session's vite (ld-small-swell) and my first capture hit it. Check the owner of a port
  before using it. `TaskStop` on a backgrounded `npx vite` can leave the node child alive: kill it by port.
- A wait loop that greps the process list must not match its own command line (filter on node/electron).
