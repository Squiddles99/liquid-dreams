# Loading screens: no more black — design

Andrew, 2026-10-04: "the loading black screen is detracting from that vibe". He wants intro and loading screens that
warm the game up out of sight, layer by layer, with the game's logo on them so players remember what they're playing.
Brainstormed in chat. The rulings below are his (A, C, A, A, then "looks right" on each section). Mockups are in
`.superpowers/brainstorm/14043-1791076369/content/`.

## What it is

A branded loading screen covers every long wait: the Electron start-up, Paddle out, and Back to the dune. Behind it the
game builds and warms what it is about to show. Once the world is drawing smoothly, the screen dissolves into the live
scene. The player never sees black, and never sees anything half-built.

## Rulings

- **The look: layout A, in sand.** It is Andrew's logo design as drawn: the surf photo across the top, the grasstree
  emblem straddling the photo's edge, and "Liquid Dreams" below on a pale sand tone, not the Canva file's cream. The
  sand is a stand-in until Andrew matches it to the dunes in Canva. It must not clash after the dune or the sea.
- **Bit by bit: progress, then a soft hand-off.** At start-up, a progress bar and one short step line show each stage.
  When everything is built, the screen dissolves into the live scene (choice C: neither a bare bar nor a world that
  assembles in view).
- **Which screen where, once the flora screens exist:** the logo screen at start-up. Paddle out and Back to the dune
  show a random plant screen with a small corner logo. This spec builds the logo screen for all three, with the
  background as a slot the plant screens fill later (§6).
- **How it gets on screen first: the splash is in the page.** It is plain HTML and CSS in `index.html`, so it paints
  before the game's code downloads. That rules out a separate native Electron splash window (Electron-only, and a window
  swap, not a dissolve) and a splash drawn by WebGPU (it would come after the slow part).

## Out of scope

- **The flora screens.** Each will be a full-screen Blender hero render of a break plant in its own dirt and setting,
  with facts overlaid. They get their own brainstorm, spec and plan. Their facts are written in our own words, with the
  flora site credited. Plant photos from the web go in `reference/dune/flora/` (git-ignored) with a `sources.txt`, and
  are never shipped.
- **The icons.** `electron/icon.png`, `electron/icon.ico` and `public/favicon.png` still show the old palm emblem.
  `electron/makeIcons.py` is measured to that 2000 px design and must be re-measured for the 3000 px grasstree source
  (its thin fronds need a different cut-out). That is a separate small fix.
- **New sound.** §3 only lines up the existing sound start with the dissolve.

## The art

Andrew's own originals (made in his licensed Canva account; the surf photo is AI-generated, then composed there) are
in `art/loading/`, which is tracked and ships:

| File | What it is | Note |
|---|---|---|
| `photo-wide.png` | the surf photo alone, 16:9, no emblem | 3360 × 1890 today; Andrew is re-exporting it at Canva's largest size |
| `logo-emblem.svg` | the grasstree emblem | circle in vector; the grasstree is a 2400 px raster embedded by Canva (sharp enough) |
| `logo-wordmark.svg` | "Liquid Dreams" | true vector |

`tools/loadingArt.py` makes the sized copies the page loads (§5). They are a WebP photo at 1920 and 3840 px wide,
picked with `srcset`, and the SVGs as they are. Only originals live in `art/`.

**Before the Steam build:** check that the AI image tool's terms allow commercial use, and note the art's provenance in
`LICENSES.md`.

## 1. Start-up

### 1.1 First paint

- The splash markup, its CSS, and a `<link rel="preload">` for the photo and the emblem go inline in `index.html`, ahead
  of the module script. Its colours are CSS custom properties: sand, teal `#3f959b`, orange `#f7931e`.
- Electron (`electron/main.js`): the window is created with `show: false` and `backgroundColor` set to the sand. It is
  shown on `ready-to-show`. Not one black frame reaches the screen.
- The browser build gets the same splash. The page's own background is sand from the first byte.
- **Layout:** the photo band fills the screen's width and about 55% of its height. It is positioned so the surfer and
  the barrel stay in view (sky cropped first). The emblem is centred on the band's lower edge, with the wordmark below
  on sand. It is laid out in CSS (`vw`/`vh` and `clamp`) and checked at 16:9, 16:10, 21:9 and 4:3.

### 1.2 Stages and the bar

The bar is a thin teal line, 400 px at 1080p, centred near the bottom. A single step line sits under it in teal. The
stages and their draft lines (Andrew may reword them):

| Stage | Where in the code | Step line |
|---|---|---|
| `gpu` | `checkWebGpuSupport` and `createRenderer` (`src/main.ts`) | Waking the GPU… |
| `world` | `new App(...)`: sea, sky, swell, reef | Swell rolling in… |
| `reef` | `app.prewarm()`: the break's ribbon, white water, particles, land materials | Laying the reef… |
| `heath` | the land (`land.load`), the heath kit (`loadKit` → `prewarmKit`), the ground layers | Growing the heath… |
| `crew` | the crew settled on the stand spot (today's veil test: `standSpot()` and `crewReady()`) | Waking the crew… |

- **Weights:** each stage's share of the bar comes from a weights table. The weights are measured on Andrew's RTX 4060
  from `performance.now()` marks at each boundary, logged once like `[prewarm]` today.
- **Creep:** within a stage, the bar creeps toward that stage's end mark on an ease-out curve (it slows as it nears the
  mark, reaching about 90% of the stage's span at its expected duration). It never passes the mark before the stage ends.
- **Catch-up:** when a stage ends, the bar runs to the mark in at most 250 ms. It never moves backwards. Stages that
  overlap (land, kit and crew load at the same time) report independently, and the bar follows the sum of the shares
  completed.

### 1.3 One cover, not two

The front end's load-in veil (`fe-veil`, `#05080a`, `src/frontend/frontEndPage.ts`) is removed. Its lift test
(`liftVeil`: the stand spot, and `crewReady`) becomes the `crew` stage's end. The front end opens under the loading
screen as it opens under the veil today.

### 1.4 Failure

If WebGPU is missing or fails to start, the loading screen is removed and `showOverlay` shows the error as today. If a
stage throws, the screen is removed and the error surfaces as it would now. The bar never hangs, frozen, over a dead
game.

## 2. The dissolve

- **Ready:** every stage is done, and then the **smooth-frames gate** opens. That is 10 frames in a row under 33 ms,
  drawn behind the cover. One slow frame resets the count. The gate opens anyway after 4 s.
- **Motion:** the cover's opacity goes 1 → 0 over 1.2 s, with an ease-out curve (`cubic-bezier(0.33, 1, 0.68, 1)`, the
  same curve as today's veil). At the same time the logo group scales 1 → 1.03. The scene underneath is live (the
  crew's idle, wind in the heath).
- **Calm menus** (`FrontSettings.calmMenus`): a 300 ms fade with no scale.
- **No minimum time at start-up.** A fast machine gets in as soon as it is ready.
- The element is removed when the fade ends. Input reaches the front end once the fade passes 50%.

## 3. Sound

Check how the soundtrack and ambience start today (`SoundSystem.arm()`, `src/sound/SoundSystem.ts`, called by
`app.start()`, and the front end's music slot). Anything audible before the dissolve begins is held back until it
starts, and fades in over the dissolve's length. No new sounds.

## 4. Paddle out and Back to the dune

These replace the black fade in `App.paddleOut` and `App.backToDune` (`PADDLE_OUT_MS`, `src/frontend/entry.ts`).

1. **Cover in:** the UI leaves (180 ms, as today), then the loading screen fades in over 400 ms. There is no bar. There
   is one step line that pulses slowly in opacity (0.55 ↔ 1, 1.6 s): "Paddling out…" or "Walking back up the dune…".
2. **The work:** it runs under the cover exactly as today. For Paddle out: the session, the rider on the stand, the
   camera pose and `startRide()`. For Back to the dune: `stopRide`, then `openFrontEnd`. The game keeps rendering the
   real scene underneath, so first-time shader builds happen out of sight.
3. **Wait:** the smooth-frames gate (§2), and a **minimum of 1.5 s on screen**, counted from when the cover is fully in
   (0.6 s with calm menus). Then:
4. **Dissolve:** as §2.

The background is a slot. Today it holds the logo screen (the same markup as start-up, reused, not rebuilt). When the
flora screens exist, the slot gets a random plant screen, and the logo shrinks to a corner. Nothing else changes.

## 5. Pieces

- **`index.html`:** the splash's markup, its inline CSS and the preloads (§1.1).
- **`src/app/loadingScreen.ts`:** the `LoadingScreen` class. It owns the element: `stage(name)`, `done()`,
  `cover(line)`, `dissolve()`, `remove()`. It drives the bar and the step line, and runs the fades.
- **`src/app/loadingProgress.ts`:** pure and tested. The weights table, and the bar's position from the stage times
  (creep, catch-up, never backwards).
- **`src/app/smoothFrames.ts`:** pure and tested. The gate, fed frame times. The minimum hold is here too.
- **`src/main.ts` and `App.ts`:** the `stage(...)` calls at each boundary. `paddleOut` and `backToDune` use the cover;
  their black divs go.
- **`src/frontend/frontEndPage.ts`:** the veil is removed. Its ready test is exposed for the `crew` stage.
- **`electron/main.js`:** `show: false`, a sand `backgroundColor`, and showing on `ready-to-show`.
- **Sized art:** `tools/loadingArt.py` (Pillow, run by hand like `electron/makeIcons.py`; no new npm dependency) writes
  the sized photo and copies the SVGs from `art/loading/` into `public/loading/`. Its outputs are committed.

## 6. Leaving room for the flora screens

- The cover's background is one element (`.ld-cover-bg`) that a later spec fills. The logo group (`.ld-logo`) has two
  layouts: `hero`, which is start-up's, and `corner`.
- `cover(line, { background, logo: 'hero' | 'corner' })` takes these as options now, defaulting to the logo screen,
  so the flora work only adds a background and passes `corner`.

## 7. Testing

**Unit (vitest):**
- `loadingProgress`: the weights sum to 1; the bar creeps but never passes a stage's mark early; it catches up in at
  most 250 ms; it never goes backwards; overlapping stages add up.
- `smoothFrames`: the gate opens after 10 frames in a row under 33 ms; one slow frame resets it; it opens at 4 s; the
  minimum hold is 1.5 s (0.6 s calm) for transitions and 0 at start-up.

**Electron probe (`--probe`, extended):**
- From the window's show until the start-up dissolve ends, a capture every ~100 ms. It **fails if any capture is mostly
  black** (more than 50% of its pixels with luminance under 0.04).
- Hitches over 50 ms are logged for 3 s after the start-up dissolve, and after a scripted Paddle out and Back to the
  dune. **The target is none.** The probe reports them with their times.

**By eye at 1080p (Andrew's AAA bar):** real frames of the splash, the mid-dissolve, and the Paddle out cover, captured
and shown to Andrew before merge.

## Success

- No black frame from double-clicking the shortcut to standing on the dune, and none on Paddle out or Back to the dune.
- No hitch over 50 ms in the 3 s after any dissolve, on the RTX 4060.
- Andrew's verdict on the 1080p frames: it looks and feels like a shipped game, with the logo remembered.
