# The foam map's replays: covered or not (Fable's Task 4 ruling)

`FoamField.advance(renderer, simTime, prepare, covered)`. Every replay is planned on the frame after an invalidate (or a
jump), in `App.stepFoam`, which passes `covered = exactFoamReplays || loadingScreen.blocking` (the cover is booting,
coming in, fully in, or less than halfway out). Covered: each coarse (0.5 s) step samples its source 5 times (exact).
Uncovered: once (lace older than 10 s may show stripes ~3 m apart; no hitch beyond ~180 ms).

| trigger (App) | when | case |
|---|---|---|
| boot (the first frame plans a replay) | start-up, with or without a `#m=` moment link | covered (boot cover) |
| `fieldClient.onField` → `invalidateParticles` | the reef field arrives: boot; a select-screen condition change (Paddle out's cover) | covered |
| | a dev-panel condition change (the field rebuilds mid-play) | uncovered |
| `applyMoment` → `invalidateParticles` | a moment link at boot; Paddle out (`underCover`) | covered |
| | a dev moment / `window.liquidDreams.applyMoment` mid-play | uncovered (tools set `exactFoamReplays`, below) |
| `setDuneSets` → `invalidateParticles` | the select screen opening (boot / Back to the dune, under the cover) or closing (Paddle out) | covered |
| `rebuildSpectrumIfNeeded` → `invalidateParticles` | new conditions: from the select screen (under Paddle out's cover) | covered |
| | from the dev panel | uncovered |
| `catchSetWave` → `invalidateParticles` | a ride's start: Paddle out (under the cover) | covered |
| | the dev ride toggle mid-play | uncovered |
| `callSetNow` → `invalidateParticles` | the dev "call a set" key | uncovered |
| `scheduleParticleReplay`, `scheduleFoamOnlyReplay` | dev-panel sliders (debounced) | uncovered |
| `FoamSchedule` jump (> FOAM_JUMP_S between frames) | a stalled frame, a clock jump without an invalidate | uncovered |
| `measureFoamReplay` (dev timing) | explicit | covered (times the exact path) |
| `exactFoamReplays` (tools only: `captureMoments.mjs` sets it) | a capture's `applyMoment` has no cover | covered |

Measured (foam self-test, the game's 530 × 750 box, 87 s of history, this machine): covered 354 steps in 367 ms (bar
400 ms), replay = live within 0.0175 at +10 s and 0.0139 at +60 s after a set; uncovered 354 steps in 178 ms, replay vs
live 0.054 at +60 s (stripes accepted). Main's replay (240 fine steps, 12 s of history) in the same harness: 75–205 ms.
