# Whitewater, spray, foam and mist: Opus handover (2026-10-10/11)

Branch `whitewater` (worktree `../ld-whitewater`; node_modules is a junction to main's: `cmd /c rmdir ..\ld-whitewater\node_modules`
before any `git worktree remove`), from main 6b67f6f, pushed, **not merged** (Andrew merges). A detached main worktree
`../ld-ww-main` (port 5175) served the A/B reference; remove it the same way. Spec `specs/2026-10-10-whitewater-spray-design.md`,
plan `plans/2026-10-10-whitewater-spray.md`, ledger `.superpowers/sdd/2026-10-10-whitewater-spray/progress.md` (git-ignored),
evidence `docs/superpowers/evidence/whitewater/` (acceptance moments in `accept/`), captures
`../liquid-dreams-captures/whitewater-2026-10-10/`. Rulings, carried items and the "for Andrew" list: `2026-10-10-whitewater-fable.md`.

## Commits (6b67f6f..whitewater)

| commit | task | what |
|---|---|---|
| 2c5fb4f | 0 | tools take `--wind`; captureMoments at 1920×1080; the A/B moments (M-beach, M-tube) |
| 0eacf89 | 1–3 | the surge, the lip's timing (tip fringe, face foam), the boiling front (churn), the foam volume (mistLight) |
| 4e435ef | 3 | A/B moments and the Task 3 STOP pairs |
| f383bdb | F2–F4 | the tip's own fringe, solid fresh boil, the surge look-only on the ride's trace |
| 26be960 | F5 | the idle frame gate (0.98 × main) and the spray's CPU cost |
| 9dfec70 | 4 + F6 | lace that lingers (two lives), carried by the bore and the wind; the soft boil edge |
| c4256e3 | 4 | covered replays exact, uncovered cheap; aged lace opens to water (L1) |
| ec9a508 | L2 | inside the foam box CoastalSurf keeps to a shore band; the map owns the rest |
| 0e39721 | 5 | the plume, the veil forward in onshore wind, dense spit; per-particle kinds |
| 4722540 | 6 | crest feathering |
| 0ba76fa | 6 | Task 6 STOP evidence |
| a8bbb5c, 470f6dd | 7 | the mist slab (the foam map's third channel) and soft particles; the slab skips mist-free pixels |
| 094b6d0 | 7b S1, S2 | the plume (rate 12, opacity 0.3, isotropic 0.7, size 3–10 m); FEATHER_KIND on every stood crest |
| d0cba75, 199c287, 9055986, 4e8fe7e | 7b S3 | the solid boil: no bars; 3-D billows; the foam volume exposed for itself (0.55) |
| 64e42c1 | 7b | the STOP evidence (seven rows, feather-wide, tube A/B, mound) |
| d132b55 | 7b | the whitewater exposure dial |
| 22f3647, a3b795a, (last) | 8 + L3 | acceptance moments (hidden, one process), the frame gate, L3 (the lace tears into streaks), calm identity, the suite, these handovers |

## Numbers against their bars

| bar | measured | |
|---|---|---|
| riding median, 7 ft Pumping, 18 kn from 90°, ≤ main × 1.10 (5 pairs, interleaved, idle window 02:49–03:00) | no-stall: main 25.85 / branch 24.8 ms = **0.96 ×**; raw 26.0 / 29.0 = 1.115 × (the branch drew 2 of the 3 paddle-out stalls; main-5 the third) | met on the stall-matched comparison (Fable's ruling); `frames-final.txt`, `frames-final-gate.txt` |
| GPU: cam median ≤ 5.3 + 1 ms (lineup cam) | main 3.6, branch 3.7 ms (this window's machine state; Task 7's was 5.3 / 5.3) | met |
| `_rideCost --spray --wind=18,90` breakEmitters per 20 Hz tick (births ≤ 14.0 ms; feathering ≤ +2 ms over 2.7) | main 3.02 / 2.85, branch 3.46 / 3.27 ms (+0.4); births median 74 / 75 | met (`ridecost-final.txt`) |
| births per tick ≤ SPRAY_BIRTH_CAP 320 | max 150 at 8 ft, 166 at 12 ft (CPU pool replay) | met |
| the foam map's covered replay ≤ 400 ms (Fable's Task 4 ruling) | 351–367 ms; uncovered 178 ms | met |
| replay ≡ live within 2 % at +10 s / +60 s | 0.0175 / 0.0139 | met |
| calm identity: flat sea vs main | 49308 px, bbox (0, 643)–(2449, 960): L2's accepted shore band only (main vs its own older capture: 12867 px, the capture noise) | met as ruled at L2 |
| Glassy with a break: differs only in the broken section and the foam | tol 8: 306862 px, bbox (0, 627)–(2540, 1165): the inside water band (broken sections, foam); sky and land unchanged | met |
| GPU ≡ CPU self-tests (branch) | foam 11/12 (surf: main's own, identical 0.4512), spray 5/5, ribbon 6/7 (footprint: main's own), breaker 14/14 | met |
| unit suite vs main (full `vitest run`, both trees, same session) | main 34 failed / 2123; branch 34 failed / 2203 after one stale expectation fixed (breaking.test's churnSize default 0.2 → 0.25, Andrew's dial); the failing names are identical | met |

## Andrew's dials (dev panel)

- Breaking › surge **0.5** (0–1): the pocket's heave where a pitching lip lands.
- Breaking › churnSize **0.25** (× A): the boil's lumps.
- Foam › whitewater exposure **0.55** (0.4–1.0): 0.55 shows the billows' form; ~0.7 is whiter, flatter.
- Foam › lace life 75 s; Spray › plume 1 (× rate).

_rideProfile now flags a paddle-out stall (`# paddling max … STALLED`, line 2) and `tools/_frameGate.mjs` prints raw and no-stall medians.

## Tools added (kept)

- `tools/_whitewaterMoments.ts` (cameras: lookout `beach`, `tube` 100 m down the line, `high` drone, `side` 55 m), `--ft --period
  --wind --hour --tide --times --label`: captureMoments lines and `#m=` links.
- `tools/captureMoments.mjs`: **hidden by default** (never focused, never on top), `--batch=<jobs.json>` one process per batch,
  `--offscreen`, `--focused` (the old path; hidden ≡ focused, 0 px).
- `tools/_sprayScreen.mjs` (what of the spray shows on screen: the frame with and without the pool, crest + 1 H projected;
  feathering pixels per station); `tools/_plumeProbe.ts` (the CPU pool's face-on alpha box: not visibility — see S1's ruling);
  `tools/_featherCount.ts`, `tools/_featherProbe.ts`, `tools/_billowIso.ts`, `tools/_pixelDiff.mjs`, `tools/_rideCost.ts --wind`.

## Gotchas

- **The ribbon's detail coordinate collapses on the caved-in mound** (`ribbonDetail` = S + n·mix(home u, developed u, frame
  weight); the weight is low there, so it is the home's xz, which barely moves down a near-vertical face). Anything read in it
  streaks down the face: the lace's holes made vertical bars; a 2-D billow field streaked. The billows read a 3-D field over
  (detail x, height above the tide, detail z).
- **The foam volume sat on the tone curve's flat shoulder** at exposure 1 (R 250/255): no shading shows there. A camera exposes
  for the whitewater; the volume has its own exposure (the dial).
- **vite misses `sed -i` edits** (a new inode): `touch` the file after, and check the served module (`curl …/src/x.ts | grep`).
- **A second compiled copy of SetWaves' breaking sum makes every foam step ~3× slower** (isolated probe, cause not found: same
  WGSL size and uniforms). Everything rides one sum (`mistWanted`, `timeShift`, `foamPushNode`). Tried: half/f32 state, no
  midpoint, linear decay, no push, main's SetWaves, one pipeline vs two.
- Electron: `executeJavaScript` returning a three object throws "could not be cloned" and hangs the tool: end with `; 0`.
- App.frame resets the pools' visibility each frame: pin it with `Object.defineProperty` to hide one for a capture.
- **Process: stop only Electron processes confirmed as your own** (check the command line), never `taskkill /IM electron.exe`
  (Andrew's game runs on the same exe). **Evidence capture never takes the foreground** (hidden window, one process per batch);
  only the profiler keeps its focus, and only when Andrew gives the window.
- The full suite in parallel times out a few 5 s spray-emitter tests; they are main's (`fail-main.txt`) and pass alone.
- **A capture after a change of conditions in the same batch carries a faint residue** (0.3–0.7 levels over the whole frame; looks identical): a pixel-identity check captures its moment first, alone.
- The paddle-out stall (a ~4 s frame while paddling, either tree) shifts the riding pass ~0.6 s early onto a costlier stretch: compare stalled runs only with stalled runs.

## Left

- The final review (Fable) and the merge (Andrew).
- Follow-ups in -fable.md (the boil/curl seam, the 3× second-sum mystery, the plume life lever, the trace's reach for
  feathering, the sun's white balance on sand).
