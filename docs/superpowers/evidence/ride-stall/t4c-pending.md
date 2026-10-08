# Task 4c: the pipeline that holds the paddle-out cover (Opus, 2026-10-08 ~20:30–22:00; 90 min box spent)

Setup: Playwright Chromium (RTX 4060 "lovelace" adapter), my dev server on 5174, front end on, fresh page loads,
GPUDevice creation hooks installed **before boot** (`page.addInitScript`, sync + async variants, labels),
`liquidDreams.frameLog` on from the select screen, `loadingScreen.release` / `dissolve` wrapped to timestamp them,
`probePaddleOut()` (START on the select screen). New readout: `AsyncPipelines.inflight()` (labels
"material object (target)") and `started`, plus the frame log's `building` field (6697e98).

## What holds the cover: `MeshBasicNodeMaterial (output)`, a build started late in boot

| batch (time) | loads | pending at the select screen | label | dissolve after release |
|---|---|---|---|---|
| A (~20:37, saved storage) | 1 + 4 | 0 in 5/5 | – | 1495–1502 ms (= minHold 1500): smooth frames, gate fine |
| B (~20:45, saved storage, select-screen check only) | 8 | 0 in 8/8 | – | – |
| C (~20:50, clean storage, first-ever paddle-out) | 3 | 0 in 3/3 | the rider's 12 builds start *under* the cover (`hair female_hair (output)`, eyes, hairBraid, teeth, body, hairTie, lashes, 2× MeshBasicNodeMaterial) and settle in 27–38 frames | 1500, 1690, 3155 ms |
| D (~21:30, saved storage) | 4 | **1 in 3/4** | **`MeshBasicNodeMaterial (output)`**, seen pending from boot at ~68–71 s after load | 4015–4031 ms (all four, including the one with nothing pending) |

- Batch D also matches Task 3's run: `pending` 1 from before START, 0 creations under the cover. In 2 of the 3 loads it
  settled during the cover, and in 1 it was still pending after the dissolve.
- The object has no name (`object.name` empty); the target is `output` (the picture's scene-pass target, not the
  `captureTarget`). It is not a churn: no creation repeats per frame, and `started` is the same 213 at every select
  screen.
- **Not proven never-settling.** The 10 s naming warning (`BUILD_WARN_MS`) also fired for the crew's legitimate boot
  builds in batch D (`male_eyes`, `male_teeth`, `cap base003`, `hairHat male_hairHat`, `body base`, `tee male_tee`), and
  at 2 s it fired for Bloom passes and render pipelines. At ~21:30 the machine was loaded (Andrew at the desktop, a game
  tab open in his Chrome). So "MeshBasicNodeMaterial (output)" reads as **a slow build left over from boot** rather than
  a promise three never resolves, and it appears when boot's builds run long.
- **The gate could not be judged in batch D.** Every dissolve there took ~4.0 s, the one with nothing pending too:
  under the cover the frames ran 50–300 ms, so `SmoothFramesGate` never saw 10 frames under 33 ms and gave up at 4 s,
  whatever was building. Batch A on a quieter machine dissolved at minHold.

## Fixes tried

1. **The plan's (a), `BUILD_TIMEOUT_MS = 2000` dropping a build from `pending`** (test-first, green). **Withdrawn**: at
   boot it fired on legitimately slow builds (Bloom passes, `MeshBasicNodeMaterial`, render pipelines), so the boot cover
   would stop waiting while hundreds of pipelines are still building. That regresses the shader-prewarm fix (memory
   `shader-prewarm`).
2. **`pendingSince(mark)`: a transition waits only for builds started since it began** (test-first, green; live: the
   synthetic never-settling build injected at the select screen no longer held the cover, dissolving 2.6 s after
   release with one 2.3 s frame). **Withdrawn, not shipped**: if the leftover build is a real slow build (as batch D
   suggests), the cover would dissolve with that object not yet drawable. It would then pop in, or compile sync, in view.
   The 4 s give-up already caps the cost. It is a judgement call for Fable, not a proven fix.

**Kept (6697e98 + this commit), dev-only, no behaviour change:** `inflight()`, `started`, the frame log's `building`,
and a once-per-label `console.warn` for a build still pending after `BUILD_WARN_MS = 10 s` (tests: names once, keeps
counting, a timely build is not named).

## For Fable: what would settle it

- Name the object: extend the label with `object.type` and the parent's name (`renderObject.object.parent?.name`), one
  boot, read `inflight()` at the select screen.
- On a quiet machine, run batch D's flow 5× and read whether the build ever settles before the paddle-out. If it always
  settles within ~10 s of boot, prewarm it (or the scene pass's `output` target) in boot's `App.prewarm` so the boot cover
  waits for it. If it never settles, it is three's cache dropping a pending build; then `pendingSince` (above) is safe.
- The cover gate's `SMOOTH.underMs = 33` is never met on a loaded machine under the paddle-out cover (frames 50–300 ms),
  so the 4 s give-up decides there regardless. That is a property of the gate, not of this build.
