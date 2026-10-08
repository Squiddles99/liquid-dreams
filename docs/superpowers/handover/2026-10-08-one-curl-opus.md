# One curl, one clock: handover for the next Opus

**Branch** `one-curl` from main 8863430, pushed, **not merged** (stopped for Fable's ruling: the 6 ft expert's `heldS` moved
+13.6 s, see `-fable.md`). Ledger `.superpowers/sdd/2026-10-08-one-curl/progress.md` (git-ignored, every ruling copied into
the evidence files and `-fable.md`).

## Commits

| commit | what |
|---|---|
| 1ff3584 | Task 0: boot cover waits for pending pipeline builds (cap 15 s); `tools/_bootWater.mjs`; evidence `t0-boot-water.md` |
| 5b300e0 | Task 1: `fillUntil` until = max(0, −tb) on broken nodes; stations' `wait`/`holdDownTheLine`/`standing` gone |
| bcf5d08 | Task 2: `curlClock.ts` (breakingLines, curlTimes), curl pass in `computeOnsetRecord`, `BreakParams.curlMaxMs` |
| b083575 | Task 3: ledge depth profile unwarped; `curlMaxMs` default 40; `t3-reef.txt` |
| ed6a00d | Task 4: traced-line monotone guard, A bar 5 % (red), smoothing probe `t4-smoothing.txt` |
| (Task 5) | evidence `t5-ride.txt`, `t5-captures.md`, these handovers |

## Suite

Baseline (branch start 8863430, quiet): **54 failed / 1904 passed / 20 skipped** (23 files; several were timeouts).
After (HEAD before the handover commit, quiet): **40 failed / 1940 passed / 21 skipped** (14 files).
New reds by name (all from the unwarped ledge unless said; none a retired pin): breakingField "1 cm apart, breaking adds at
most 0.15 m…", "no point stands 0.5 m above everything 4 m around it", "runs from the crest down … no flat terrace";
r1Reef "6 ft / 8 ft, mid tide: the first section peels 9–11 m/s"; crestTrace "every station sits on its crest (|ξ| < 2 ms)",
"A along the first leg holds within 5 %" (the plan's tightened bar; red at 8 % on main too); reefField "its running maximum
… never falls along a ray"; peakFace "reads the biggest 6 ft wave as breaking".
Retired pins (spec §4): crestTrace "a held section reads as unbroken to the stations", "a held section's station carries the
held ratio". Baseline reds now green include rideOnSections' 6 ft expert, reefField "peels along the north ledge … A-frame",
r1Report "the first leg peels at a speed the surfer can hold", bathymetry's and shoreReef's, and the timeouts.
Lists: `.superpowers/sdd/2026-10-08-one-curl/fails-baseline-names.txt`, `fails-after-names.txt`.

## Reef table (`evidence/one-curl/t3-reef.txt`, curlMaxMs 40)

| ft | first leg peel, hollow, broke | second leg | first-leg held / capped |
|---|---|---|---|
| 6 | 11.4 m/s, 0.76, −0.1–5.5 s | 15.0, 0.82 | 0 % / 0 % |
| 8 | 11.3, 1.00, −0.7–4.9 s | 14.1, 1.00 | 0 % / 0 % |
| 12 | 11.7, 1.00, −0.7–4.7 s | 14.9, 1.00 | 0 % / 0 % |

Main's ledge (curl off): 10.1 / 10.0 / 10.5 m/s first leg, −0.3 / −0.9 / −0.9 s.

## The monotone guard (Task 4)

`crestTrace.test` "one curl per wave on one clock": green at 6/8/12 ft at peak +1/+3/+6 s (140–203 broken, ~150 waiting
station steps per size). Peak onsets: −0.505 / −0.799 / −0.988 s (main −0.646 / −0.817 / −1.044). Green on main's bake too.

## The ride (`t5-ride.txt`)

92/92. heldS: 6 int 14.33 (=), 6 beginner 12.32 (−0.13), 12 int 15.00 (−0.02), 6 expert 14.37 (+13.59, was the R3 red).
Probe lazy (R9) 0.00 cm. Profile 6 ft: caught, riding median 29 ms.

## Smoothing (`t4-smoothing.txt`)

Curl width phase 1 → 0.45: onset σ 8 / station σ 4: 13 m; 8/2: 7 m; 4/4: 13 m; 4/2: 10 m.

## Gotchas

- **Toggling the old behaviour without a worktree:** every main-equivalent number here came from editing in place and
  restoring by `cp` from /tmp (never a stash): `const curl = f.curl ?? false` in `reefField.ts` turns the curl off;
  `sdDepth = sd` in `bathymetry.ts` restores the warped ledge. Check `git status` after.
- `tools/_*.ts` probes run with plain `node tools/_x.ts` (Node 24 strips types; `runnerImport` from vite loads src).
- A vitest name with an apostrophe inside single quotes breaks the oxc transform with no test listed ("no tests"):
  use double quotes.
- `breaking.onsetUntil` / GPU `onsetTimeNode` return 0 for any broken section (held included): a hold must be read
  from `tb` (stations do), not from `onsetUntil`.
- The curl's lines start at the line's first break, which on this reef is the south ledge's far end, not the peak: any
  speed floor that binds anywhere binds at the peak.
- `_rideProfile.mjs` and `captureMoments.mjs` ran against my own dev server on 5174 (a temporary `launch.json` entry,
  reverted at the end).
- Capture times come from `tools/_curlMoments.ts` (the biggest wave of the first set after 300 s: arrival 1467.49 s).
