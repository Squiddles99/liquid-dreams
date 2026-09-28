# Phase 5: Sound

Spec: `docs/superpowers/specs/2026-09-28-sound-design.md`. Plan: `docs/superpowers/plans/2026-09-28-sound.md`.

There are no pictures for sound. These are the checks and measurements from the browser. Claude can't listen, so every check is on levels and timing. Whether it sounds right is Andrew's call.

**How the checks ran:** the Browser pane wasn't painting, so the game's frames were driven by calling `App.frame()` from the console. The sound was started with a real click.

## What was checked

| Where | What the sound model did |
|---|---|
| Before a click | The "Click or press a key for sound" hint shows; nothing plays; no console errors. |
| First click | The audio starts (context `running`); the album starts: `▶ 1/16 Morning of the Earth`. |
| `surf-from-the-lineup` (free camera, 4 ft), 60 s | **Hits:** 32 lip hits a minute, at most 7 sounding at once. **Continuous:** the roar peaks at 1.46 (full is 1); the shore wash at 0.63. **Absent, as expected:** no lapping (the camera isn't in the water) and no swash. |
| `bombie-from-the-lineup` (lineup, 8 ft) | **Lineup sounds:** lapping at 0.86; the Bombie's rumble at 1.23 while a burst rolls. **The Bombie's hit:** jumping back to just before its break (188.5 s) gives a hit exactly at the break: 403 m away, heard 1.17 s later. |
| Walking at the water's edge (192, −38) | **Swash:** peaks at 0.48, with the draw-back and the pebble clatter (0.46) as it runs back. **Also:** the wash goes on; there's no lapping. |
| Walking at (234, −38) | No plants within 15 m there (the rise is rock), so no scrub. |
| Walking at the top of the rise (285, −40) at 9 m/s | Plant density is full, scrub at 0.49, no swash. |
| Underwater (4 m down) | The muffle comes on; it goes off above the surface. |
| Pause (P) | The effects fade out; the music plays on. |
| Sound folder | **Next track:** gives `▶ 2/16 I'll Be Alright`, which plays (the apostrophe in the name is fine). **Play/pause:** toggles `❚❚` / `▶`. |
| `M` | Mutes (master gain 0, "Sound muted (M)" toast); `M` again unmutes. |
| Reload | The volumes and mute are remembered. `?fresh` doesn't save, as for every setting. |

**GPU self-tests:** 57/57 (the 53 before this phase plus 4 new ones, run in the browser):
- **Every voice renders audible, finite audio:** RMS from 9e-3 (lapping) to 0.26 (rumble).
- **Underwater:** it cuts the highs by 45 dB.
- **Hit timing:** a hit scheduled 0.5 s ahead starts at 0.513 s. The HRTF panner adds about 13 ms.
- **Hit cost:** a frame with a hit costs a median 0.1 ms to build on a live context.

**Not reproducible from the pane:** a hidden tab. The page's visibility can't be changed from a script. The `visibilitychange` listener fades the effects, and the model's test covers "hidden means effects off".

## Measured cost

RTX 4060 Laptop, Chrome. `SoundSystem.update` covers the model, the engine and the music. The browser timer's resolution is 0.1 ms.

| Where | Mean | Median | 95% | 99% | Max |
|---|---|---|---|---|---|
| Lineup, 4 ft, 60 s (2,391 frames) | 0.097 ms | 0.1 ms | 0.2 ms | 0.8 ms | 10.3 ms (once; a garbage collection, most likely) |
| Walking the heath, 67 m (1,343 frames) | 0.077 ms | 0 | 0.3 ms | 0.7 ms | 2.5 ms |

**Against the target** (≤ 0.2 ms a frame): met on the mean and median.
- **Frames with hits** (about 1 in 100) cost 0.3 ms for one hit and up to 1.1 ms for four.
- **The plant count around you** is redone every 2 m of walking, over about 35,000 plants; it peaks at 1.6 ms.
- **Voices:** at most 16 hits sound at once, plus the 8 continuous voices. The most seen was 7 hits.
- **Other costs:** no GPU cost. No audio loads before the first click, and the music streams one track at a time.

## Tuning points for Andrew

Each has its file and constant.

- **Lip hits** (`src/sound/hits.ts`):
  - `hitGain(H)`: loudness by wave height;
  - `thumpHz(H)`: the thump, 90 Hz for a small wave down to 40 Hz for a big one;
  - `HIT_MIN_GAP_S = 0.3`: how often a peeling lip booms;
  - `HIT_MERGE_M = 8`: how much of a lip counts as one hit.
- **The Bombie's hit** (`BOMBIE_HIT_GAIN`, `BOMBIE_THUMP_FACTOR = 0.6`): its thump starts at 24 Hz, below what laptop speakers play. On a laptop you'll hear its crack and rumble; raise the factor if you want the thump itself.
- **The roar** (`src/sound/levels.ts`):
  - `ROAR_FULL_M2 = 15`: how much landing lip makes a full roar;
  - `ROAR_RELEASE_S = 2`: the tail, about 6 s to fade.
- **The shore wash:** `WASH_RISE_S`, `WASH_DECAY_S` and `WASH_FLOOR`.
- **Wind:** `WIND_FULL_MS = 15`, the wind speed for full wind noise.
- **Each voice's level in the mix:** the multipliers in `AudioEngine.apply` (roar 0.9, wash 0.8, rumble 1.2, wind 0.35, scrub 0.25, swash 0.5; lapping plips 0.4, pebbles 0.3).
- **How fast distant sound fades:** each placed voice's `refDistance` in `AudioEngine` (roar 20 m, wash 30 m, rumble 60 m) and `playHit`'s 15 m. A bigger distance keeps a sound louder further away.
- **Underwater:** `UNDERWATER_CUTOFF_HZ = 400`, `UNDERWATER_GAIN = 0.5` (−6 dB), `HUM_LEVEL`.
- **Music level:** the Sound folder's `music` slider. The default 0.2 is 14 dB under the effects.

## Known limitations

- **The Impact folder's `amount` at 0 silences the lip hits and the roar:** they come from the impact spray's emitters.
- **The hidden-tab fade** was checked by test, not in the browser.
- **How it sounds** is untested: Claude can't listen.

## What it isn't

No recorded samples, no surfer, board or paddling sounds, no birds, no music ducking on big sets, no cliff reverb (spec §7).
