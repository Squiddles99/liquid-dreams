# Liquid Dreams Phase 5 ("Sound") Design

**Date:** 2026-09-28
**Authors:** Andrew and Claude
**Status:** Draft for Andrew's review, on branch `phase-5-sound`.
**Builds on:**
- **Phase 3:** the spray system's break emitters (`whitewater/sprayEmitters.ts`: `breakEmitters`, `impactBirths`) and the Womb's breaking.
- **Phase 4b** (`2026-09-28-the-waterline-design.md`): the surf model (`surf/surfModel.ts`: the coast arrivals, `swashLevel`).
- **Phase 4c-1/4c-2:** walk mode, the rocks and the heath plants (`beach/rocks.ts`, `heath/plants.ts`).
- **Phase 4c-3** (`2026-09-28-the-bombie-design.md`): the Bombie's bursts (`bombie/bombieModel.ts`: `burstsAt`).

---

## 1. What this is

The game is silent. Phase 5 gives it sound, with two parts:
- **Sound effects** placed in the world: the Womb's lip landing, the white water, the wind in the scrub, and the water close by.
- **Music:** Andrew's own copy of the *Morning Of The Earth* soundtrack playing under the ocean.

**Andrew's answers (2026-09-28):**
- **Effects:** synthesised in the browser, with no sample files.
- **Music:** the tracks Andrew drops into `music/` are **committed to git**. It's his personal copy, for his own use; the repo stays private. Claude never sources or downloads recordings.
- **Playback:** the album in order, a gentle mix under the ocean.
- **Sounds:** lip impacts, white water roar and hiss, wind and scrub, and water close by (all four).
- **Approach A:** a Web Audio graph driven each frame from the game's own CPU state (not samples, not an audio library).

## 2. What Andrew should hear

- **In the Womb's lineup on an 8 ft morning:**
  - water lapping at the board as the swell lifts and drops him;
  - an easterly breeze;
  - the shore break washing on the beach behind;
  - when a set wave breaks, the lip lands with a boom a beat after he sees it, then a roar that hisses away as the foam dies;
  - now and then a low rumble from the Bombie out to the south-west.
- **Walking the beach:** the swash rushing up the sand and drawing back through the toe rocks, the wind louder, the scrub rustling as he climbs the dune.
- **Underwater:** everything muffled, the impacts still coming through as low thuds.
- **Under it all:** the album, quietly, in order.

## 3. Design

### 3.1 The engine (`src/sound/AudioEngine.ts`)

- **Start:** browsers only allow audio after a user gesture. The engine is created on the first click or key press. Until then, a small "click for sound" hint shows.
- **The mix:**
  - four groups: **waves** (impacts, white water, the Bombie), **ambience** (wind and scrub), **near water** (lapping and swash) and **music**;
  - each has its own gain, into a master gain, into a gentle limiter (a `DynamicsCompressorNode`), into the output.
- **Spatial:**
  - the listener follows the camera's position and orientation every frame;
  - placed voices use HRTF panners with inverse-distance attenuation;
  - distant sound is duller: each placed voice's low-pass cutoff falls with distance.
- **Speed of sound:** an event at distance d is heard d ÷ 343 s after it happens (the model schedules it; see §3.2).
- **Underwater** (camera below the water surface): the waves, ambience and near-water groups go through a low-pass at about 400 Hz, dropping about 6 dB, plus a quiet pressure hum. It fades in and out over 0.15 s as the camera crosses the surface. The music is untouched.
- **Pause and hidden tab:**
  - when the game is paused or the tab is hidden, the effect groups fade out over 0.3 s and back in on resume;
  - the music keeps playing through both (it has its own play/pause in the Sound folder).

### 3.2 The sound model (`src/sound/soundModel.ts`, pure)

Each frame the App passes the model a snapshot of the game: the camera (position, mode, whether underwater), the sim time and pause state, the conditions, the break's emitters, the surf model's state, the Bombie's bursts, the water height and rate at the camera, the swash level at the camera, and the nearby plant density. The model returns what each voice should be doing. It has no Web Audio in it, so all of it is tested in Node.

**1. Lip impacts (a thump plus a crack)**
- **Events:** each impact the spray system spawns at the Womb's lip (`breakEmitters` → `impactBirths`) is one hit event, at the impact's position. Events are de-duplicated so one landing lip is one hit, not one per particle: the births in one spray tick within 8 m of each other merge.
- **Size:** the wave's breaking height H sets the gain (∝ H, clamped) and the thump's pitch (lower for bigger). A 3 ft wave slaps; an 8 ft one booms.
- **Delay:** each event is scheduled at its birth time + distance ÷ 343.
- **The Bombie:** each new burst from `burstsAt` is one hit event at the reef, bigger and lower (gain from its height, × `bombie size`), delayed the same way (about 1.3 s from the lineup).

**2. White water roar and hiss (continuous, placed)**
- **The Womb's break:** one roar voice, placed at the centre of the active white water (the mean of the current spray and impact emitters, weighted by strength). Its level follows the total emitter strength: it swells with the break and, once the emitters stop, hisses away over about 6 s (a foam tail, with the brightness falling).
- **The shore break:** one wash voice, placed on the surf band at the stretch of coast nearest the camera. Its level rises and falls with each wave's arrival there (the surf model's arrival times and heights at that z).
- **The Bombie:** a distant rumble voice at the reef for the length of each burst, fading with its age.

**3. Wind and scrub (continuous)**
- **Wind:** an unplaced bed. The conditions' wind speed sets its level and brightness (silent at 0, full at about 15 m/s), with slow gusts from a seeded noise.
- **Scrub:** added when the camera is in walk mode on land. Its level is the wind level × the plant density around the camera (from the heath's plant field within about 15 m). It's zero in the lineup and on bare sand.

**4. Water close by (continuous)**
- **Lapping** (in the lineup, camera within 3 m of the surface): the level and pitch follow the water's vertical rate at the camera. A swell passing under the board gurgles more than a flat lull.
- **Swash** (walk mode on the beach): from 4b's swash level at the camera. A rush as it runs up, a fizz at the top, and a draw-back with a pebble clatter when the camera is within 20 m of the toe rocks. It fades with height above the swash and is gone about 25 m up the beach.

**The voice cap:** at most 24 voices at once. When full, the oldest, quietest impact is dropped first; continuous voices are never dropped.

### 3.3 The voices (`src/sound/voices.ts`)

All synthesised from a few shared noise buffers (white, pink and brown, generated once at start), oscillators, biquad filters and gain envelopes:
- **Impact:** a band-passed noise crack (about 15 ms) over a sine thump that sweeps down (40–90 Hz by size), about 1 s long.
- **Roar:** brown and pink noise through a low-pass whose cutoff and level follow the model; slow noise modulation for surge.
- **Wash:** pink noise with a swelling envelope and a high hiss on the draw-back.
- **Wind:** pink noise through a slowly wandering band-pass.
- **Scrub:** high-passed noise with fast random modulation (leaves).
- **Lapping:** short band-passed noise bursts ("plips") at a rate from the model.
- **Swash:** the wash voice's shape, closer and brighter, plus short clicks for the pebbles.
- **Underwater hum:** a quiet low sine and brown noise.

### 3.4 The music (`src/sound/musicPlayer.ts`)

- **Finding the tracks:** every audio file under `music/` (`.mp3`, `.m4a`, `.ogg`, `.flac`, `.wav`), found at build time with Vite's `import.meta.glob` and `?url`.
  - Each folder is one album.
  - Tracks sort by the number at the start of the name. The files are named `1. …` to `16. …` without leading zeros, so a plain name sort would put `10.` before `2.`. Names without a number sort after, by name.
  - The display name is the file name without the number and extension ("Morning of the Earth").
- **Playing:** one `HTMLAudioElement` at a time, streamed, through a `MediaElementAudioSourceNode` into the music group.
  - It starts with the engine (the first gesture) and plays the album in order, looping back to track 1.
  - Tracks fade across over 2 s.
  - A track that fails to load is skipped; if every track fails, the player stops and shows "no music".
  - With no files in `music/`, the Sound folder shows "no music" and nothing else changes.
- **Gentle mix:** the music group defaults to −14 dB relative to the effects.
- **In git:**
  - `music/morning-of-the-earth/` is committed as-is: 16 MP3s, 97 MB, each well under GitHub's 50 MB warning, so no Git LFS;
  - the README gets a note: the `music/` folder is Andrew's personal copy of the soundtrack, for his own use, and the repo must stay private.

### 3.5 The Sound folder and keys

- **A new `Sound` folder in the dev panel:**
  - `master`, `waves`, `ambience`, `near water`, `music` volumes (0–1);
  - `music`: play/pause, next track, and the current track's name (read-only);
- **The M key:** mutes and unmutes everything (the master). It's free: the existing keys are L, P, K, H, N, C, WASD, Q, E and Space.
- **Persistence:** the volumes and mute save with the look (`LOOK_KEYS` gets `sound`), and missing values load the defaults like the other groups. Play/pause and the current track aren't saved; the album starts at track 1 each session.

### 3.6 Cost

On the RTX 4060 Laptop, pane visible:
- **CPU:** the sound model and the engine's per-frame updates ≤ 0.2 ms a frame.
- **Voices:** at most 24 at once. The audio itself runs on the browser's audio thread.
- **GPU:** none. The limits test is unaffected.
- **Loading:** no audio is fetched before the first gesture; the music streams one track at a time.

## 4. Files

- **New (`src/sound/`):**
  - `soundModel.ts` (+test);
  - `AudioEngine.ts`;
  - `voices.ts`;
  - `musicPlayer.ts` (+test for the track list: finding, sorting, naming, wrap-around, skip on failure);
  - `soundParams.ts` (+test).
- **Changed:**
  - `app/App.ts` (the per-frame snapshot, the engine's start on the first gesture);
  - `dev/DevPanel.ts` (the Sound folder), `dev/devSettings.ts` (`sound` in the look), `dev/hotkeys.ts` (M);
  - `README.md` (the music note).
- **Added:** `music/morning-of-the-earth/` (16 MP3s).

## 5. Testing

**CPU (vitest):**
- **Impacts:**
  - one event per landing lip (births merged within 8 m per tick);
  - delayed by distance ÷ 343;
  - the gain grows with H and the thump's pitch falls;
  - a Bombie hit only on a new burst, delayed the same way.
- **Roar:** placed at the emitters' weighted centre; its level follows their strength and decays after they stop.
- **Wash:** its level peaks at the nearest coast's wave arrivals.
- **Wind:** silent at 0 m/s, rising with speed.
- **Scrub:** zero in the lineup and on bare sand; rises with plant density and wind in walk mode.
- **Lapping:** follows the water's vertical rate, only near the surface.
- **Swash:** only in walk mode near the swash; the pebbles only near the toe rocks.
- **Underwater:** the flag follows the camera against the water height.
- **The voice cap:** never more than 24; impacts dropped oldest, quietest first.
- **Music track list:**
  - the numeric sort ("2." before "10.");
  - grouping by folder;
  - display names;
  - wrap-around;
  - skip on failure;
  - empty folder → no music.
- **Params:** normalised, defaults, in the panel, persisted.

**In the browser:**
- The audio graph builds after a click, with no console errors.
- The model's levels move as expected at the moments: a big morning in the lineup, walking the beach, underwater, a Bombie burst.
- The music advances to the next track and wraps.
- Claude can't listen, so these checks are on levels and timing. How it sounds is Andrew's call, and the tuning points go in the README.

## 6. Success criteria

- From the lineup on a big day, the sound matches the picture: each lip lands with a boom a moment after it's seen, the roar follows the white water, and the Bombie rumbles out to sea on its own waves.
- Walking the beach sounds different from sitting in the lineup (swash and scrub, not lapping).
- Underwater is muffled.
- The album plays in order, quietly, and the Sound folder controls it all.
- No visual change, and the costs meet §3.6.

## 7. Not in this phase

- Recorded samples.
- Surfer, board or paddling sounds.
- Birds and other wildlife.
- Ducking the music on big sets.
- Reverb from the cliffs.
