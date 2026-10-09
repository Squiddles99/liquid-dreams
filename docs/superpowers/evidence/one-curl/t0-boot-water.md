# Task 0: the boot picture's water (one-curl, 2026-10-08)

**Verdict: a pending build: `MeshBasicNodeMaterial (output)`.**

## Diagnosis (step 1)

`tools/_bootWater.mjs` (Electron, fresh storage, dev server on 5174; preload hooks the page before its scripts, the frame
log on from the first frame `liquidDreams` exists, the cover's `is-out` timestamped with `inflight()` at that moment).
Ruling: Electron, not Playwright Chromium (no playwright package in the repo; Electron is the runtime that ships).
Screenshots came every ~1.2 s, not 0.5 s (`capturePage` at 1600×900 costs that much). Frames:
`liquid-dreams-captures/one-curl-2026-10-08/t0-diag/`.

`[loading]` lines: gpu 396 ms, world 1600, reef 14 736, heath 14 752, crew 18 903; **dissolve at 23 255 ms** (crew + 4.35 s:
the gate's 4 s give-up). Pending at the dissolve: `["MeshBasicNodeMaterial (output)"]`.

Frame log around the dissolve (t relative to it; only rows where the pending set changes):

| t (ms) | dt (ms) | pending | building |
|---|---|---|---|
| −2957 | 134 | 24 | MeshBasicNodeMaterial (output), the crew's body/lashes/hair/clothes … |
| −1744 | 47 | 5 | MeshBasicNodeMaterial (output), body base ×2, lashes ×2 |
| −1262 | 23 | 1 | MeshBasicNodeMaterial (output) |
| **+1148** | 20 | **0** | — |

Every frame from −1262 to +1148 ms was smooth (dt ~20 ms) but fed the gate `Infinity` (a build pending), so the gate could
only open by the give-up. The crew's builds land in ~1.7 s; the one left is the `MeshBasicNodeMaterial`, and it lands
1.15 s after the dissolve began.

Screenshots: `shot--859` (cover), `shot-623` (dissolving: land, crew, sky, **no sea**: the sky shows through where the
ocean is), `shot-2130` (**water present**, the first shot after the build landed), later shots the same.

(The GPUDevice creation hooks recorded nothing in the preload: the creations table is empty; the frame log's labels
carry the verdict.) This machine shows ~1.1 s of missing water; Andrew's ~4 s is the same mechanism on a slower build.

## The fix and the live gate (step 4)

`SmoothFramesGate.frame(dt, now, blocked)`: blocked frames never count as smooth and pause the give-up; `BOOT_BUILD_CAP_MS`
15 000 opens it anyway. Only the boot cover passes `blocked` (`LoadingScreen.frameDrawn(dt, blocked)` in phase `boot`);
the transitions still get `Infinity` for a pending frame and keep the 4 s give-up. The boot dissolve logs
`[loading] dissolve at <ms>; builds pending: <labels>`. `npx vitest run src/app` 46/46.

Three fresh boots (`t0-fix1..3/`):

| boot | crew done (ms) | dissolve (ms) | crew → dissolve | pending at dissolve | water build landed (rel. dissolve) |
|---|---|---|---|---|---|
| diag (before) | 18 903 | 23 255 | 4.35 s (give-up) | MeshBasicNodeMaterial (output) | +1148 ms |
| 1 | 14 260 | 21 593 | 7.33 s | none | −192 ms |
| 2 | 17 422 | 24 811 | 7.39 s | none | −211 ms |
| 3 | 14 345 | 22 380 | 8.04 s | none | (−0.2 s, same) |

**Water present in the first frame after the dissolve in all three** (`t0-fix-first-after.png`: the first shot after each
dissolve, the sea in all three).

**Gate missed: the cover is 3.0–3.7 s longer than the 4.35 s give-up, not ≤ 2 s.** The cover now waits exactly for the
build: it dissolves ~0.2 s (ten smooth frames) after `MeshBasicNodeMaterial (output)` lands. That build was already pending
when the frame log started (9 s before the dissolve, before the crew's builds), and takes ~7 s past the crew on this
machine; nothing in this fix can make it land sooner. Ruling (Opus): keep the fix, the picture without the sea was the bug;
the boot time is the build's own cost. Fable/Andrew: if the extra ~3 s matters, the follow-up is to find which material
that is (an unlabelled `MeshBasicNodeMaterial`: label it) and start its build earlier or make it cheaper.
