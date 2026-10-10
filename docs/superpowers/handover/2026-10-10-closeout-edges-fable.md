# Far closeout edges: for Fable (Opus 5.5, 2026-10-10)

Branch `closeout-edges` (worktree `../ld-closeout-edges`) from main 9b5e7e2. Plan
`plans/2026-10-10-far-closeout-edges.md`. Ledger `.superpowers/sdd/2026-10-10-far-closeout-edges/progress.md`
(git-ignored). Evidence `docs/superpowers/evidence/closeout-edges/`; captures
`../liquid-dreams-captures/closeout-edges-2026-10-10/` (task0, task1, prof).

## STOP at Task 1: pick a candidate

### Task 0 refuted the plan's lead: the steps are the ribbon's, not the sheet's

Hide test at the Huge stand, t+3 and t+5 (`edges-hide-test.md`; crops `task0/hide-408.png`, `hide-410.png`). The steps
vanish only with the ribbon hidden. With the sheet hidden, the footprint off or the whitewater off, the tube is unchanged
pixel for pixel. The ribbon tint covers every stepped surface.

**What they are** (`task0/along-crop.png`, a camera 120 m off looking along the closeout the way the stand does): the
tube **jogs sideways**. Each "tooth" is the rounded end of one stretch of tube with the next stretch beginning metres further
across the crest. The cause is the stations' positions. Where the field's arrival time τ kinks along the inside leg, the
traced crest steps across itself: 2.7 m in one 4 m station step at t+3 (z −321, the curl front), 5.2 m at t+5 (z −385),
and ±2 m zigzags elsewhere (z −264…−233). ξ ≤ 0.01 s at every station, so the trace sits on the true crest line, and
that line itself jogs. `fillSections` smooths the section numbers and the normals (σ 4 m), but not the positions, so the
tube's axis follows every kink. That also explains why shelf-polish's denser spacing changed nothing: the kinks sit at
fixed places in τ.

The sheet's coarse far grid is real (6.5–9 m cells against a 3–12 m front, lerp error up to 2.4 m), but it lies under the
footprint and the stand never sees it.

### Candidates (a drawing change only: τ, the record, the curl, the ride and the bed do not move)

All three move each inside-leg station along its own normal onto the line's Gaussian average over arc, weighted by
`closeoutWeight(z)`. That is 0 up to 10 m past the turn, so the left's ridden line is bit-for-bit untouched. The change
is CPU only (`crestTrace.smoothInsideLine`, called at the end of `fillSections`), with the same stations, the same vertex
count and no GPU change. The spray and impact emitters on the inside leg follow the smoothed line.

| | largest across-crest step per 4 m station (t+3 / t+5) | worst station off the sheet's crest (|ξ|) | look (stand t+3 / t+5; along) |
|---|---|---|---|
| HEAD (none) | 2.74 / 5.16 m | 0.01 s | 2 / 3–4 tube ends; jogging pipe |
| A: σ 8 m | 1.26 / 2.50 m | 0.10 s (≈1.2 m) | t+3 one continuous tube; t+5 a faint step left; along: one tube |
| **B: σ 12 m** | **0.92 / 1.71 m** | **0.15 s (≈1.8 m)** | **one continuous tube at both; along: one tube** |
| (σ 4 m, CPU only) | 1.99 / 4.29 m | 0.04 s | not captured: the curl-front jog survives |

Frames: `task1/stand-s0-s8-s12.png` (rows: HEAD, σ 8, σ 12 at t+3, then at t+5; stand crop x 1550–2100, y 480–620, ×2)
and `task1/along-s0-s8-s12.png`.

**Cost.** Trace CPU (`traceStations` at the stand, Huge, 140 timed reps, interleaved HEAD/B/HEAD/B): t+3 median 0.98 /
0.99 / 0.88 / 1.02 ms; t+5 1.53 / 1.51 / 1.42 / 1.58 ms. That is within noise, at most +0.1 ms. GPU: none (no vertex,
pass or shader change). In-game `_rideProfile --ft=7 --sim-t=300`, interleaved, on a machine contended by two other Opus
sessions: riding median HEAD 238.2 / 71.4 ms, B 58.0 / 157.8 ms; cam median HEAD 3.5 / 2.8 ms, B 3.8 / 16.4 ms. The ±3×
spread cannot resolve this change. Logs are in `prof/`. Task 3 retakes the pair when the machine is idle.

**Not taken.**
- Smoothing τ itself on the inside leg: it would move the water, the record and the curl, which the plan's rule forbids.
- The plan's sheet candidates (a finer ring, a crest-following band, a wider footprint): the sheet does not carry the steps.

**Left after B.** One end face stays, at the curl front, where the tube starts: the lip grows from 0 to full over about
6 m of crest (lipWeight 0 → 1 across two stations, phase 0.40 → 0.60). That is the tube's real start, seen end-on from
the stand, and not a jog. Softening it would mean stretching the lip's along-crest growth, a separate look question.

**Recommendation: B (σ 12 m).** It is the only candidate that leaves one continuous tube at t+5. The 1.8 m worst offset
from the sheet's crest sits under the footprint, and the ribbon's edges still meet the sheet at their homes exactly. B is
wired on the branch now (`INSIDE_LINE_SMOOTHING_M = 12`, uncommitted tests to follow in Task 2). Task 2 adds the
regression test: no inside-leg station step over 2 m across, and the left's stations unchanged.
