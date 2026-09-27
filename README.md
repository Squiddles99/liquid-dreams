# Liquid Dreams

A surfing game built for the love of it. The first (and only) break is **The Womb**, Ellensbrook, WA.

## Just want to play? (Windows)

1. Get the folder onto your computer. Either use **GitHub Desktop** (File → Clone repository → `Squiddles99/liquid-dreams`), which lets the game update itself; or, on the GitHub page, click **Code → Download ZIP** and unzip it.
   - GitHub Desktop users: to update, click **Fetch origin**, then **Pull origin**, before starting the game. (The launcher's own auto-update only works when Git for Windows is installed.)
2. Double-click **`Start Liquid Dreams`** in the folder.
   - The first time, it installs Node.js if needed (Windows asks for permission: click Yes, then double-click Start again) and downloads the game's building blocks (a minute or two).
   - Your browser opens the game. Use **Chrome or Edge**. On a laptop with two graphics chips, set the browser to "High performance" in Windows Settings → System → Display → Graphics.
3. Keep the black window open while you play; close it to stop.

## Developers

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
```

- `#ref=<name>` loads a named reference moment (see `src/dev/referenceMoments.ts`).
- `?selftest` runs the GPU self-tests instead of the app.
- Needs a WebGPU browser (current Chrome or Edge). On hybrid-GPU laptops, set the browser to "High performance" in Windows Graphics settings and fully quit the browser (including background processes) before relaunching; the stats overlay names the GPU in use. Keep both GPU drivers current.
- Rendering is capped at 60 fps (dev panel: Picture → "max fps", 0 = display rate). Hotkeys and mouse look: see Controls below.

## Reference moments

Open `http://localhost:5173/#ref=<name>`. All are at The Womb's lineup on 15 July 2026 (winter, 4 ft SW groundswell, light easterly offshore) unless noted.

| Name | What it shows |
| --- | --- |
| `pre-dawn` | 06:30 facing the land (east). Twilight glow where the sun will rise, dark sea, no sun artefacts. |
| `first-sun` | 07:35 facing out to sea (west), sun just up behind you over the land. First light on the swell lines. |
| `morning-offshore` | 08:15 facing west (default). Low sun behind the camera, clear deep-blue water, groomed surface. |
| `late-morning` | 10:30 facing west. Higher sun, water clarity, colour holding up before the Doctor. |
| `noon-deep-blue` | 12:30 looking down at ~45°. Body colour and clarity, small glitter. |
| `autumn-glass` | 2026-04-20 09:30 facing west, no wind. Mirror-smooth swell lines, crisp sky reflection. |
| `golden-hour` | 16:50 facing the sun, Doctor in. Glitter path, choppier surface, horizon haze (turquoise shows only in a breaking lip, not on unbroken crests). |
| `sunset` | 17:25 facing the sun. Sky colour, exposure, horizon. |
| `overview` | Free camera 40 m up at noon. No tiling, LOD transitions, horizon curvature. |
| `set-arriving` | 08:15 facing south-west: the set's first wave lifting on its approach to the reef, 20 s out. |
| `set-on-the-reef` | 08:15 from a drone inshore of the peak, looking out to sea as the set's biggest wave stands up on the ledge. |
| `low-tide-set` | The same wave at −0.5 m tide: shallower water, standing up harder and earlier. |
| `high-tide-set` | The same wave at +0.5 m tide: deeper water, softer. |
| `looking-down` | 10:30 floating over the shelf, looking down: dark limestone and weed, a sand pocket, through clear water. |
| `reef-overhead` | Free camera 60 m above the reef at noon: the wedge, the shelf and the sand pockets from above. |
| `barrel-peeling` | 08:15, 5 ft: from the shoulder, low over the shelf north-east of the peak, looking back at the lip throwing over the tube. |
| `closeout-right` | 08:15 from a drone over the shelf, looking south-west at the south ledge as the biggest wave's right closes out along it. |
| `the-drain` | 08:15, low in the water in the channel north of the peak, looking at the biggest wave's face as the ledge drains in front of it. |
| `behind-the-wave` | 08:15, 4.65 ft, from behind the wave line (Andrew's view): the back of the breaking wave, the sheet in the trough behind it. |
| `lip-close-up` | 08:15, 5 ft: about 6 m from the lip at the peak as it throws over the tube. |

Pick these with settings: default (or open `#ref=<name>`) to see them exactly as designed. In custom mode a pick carries over by kind: `pre-dawn` through `sunset` are time-of-day moments and keep your own swell, tide and camera; `overview`, `looking-down` and `reef-overhead` are view moments and switch to the moment's camera; `set-arriving` through `high-tide-set` and `barrel-peeling` through `lip-close-up` are set moments and apply in full, since a set's timeline only lands on cue with its own conditions. View and set picks are visits: your saved swell, tide and camera stay untouched, and the next time-of-day pick puts you back on them. Set moments land on cue with the default Sets settings, though — a tuned mean interval or jitter of your own can throw the timing off. Sets arrive every 10–20 minutes. Use `N` or the Sets folder's button to call one, and the Reef folder for depths and the crest-line overlay.

## Controls

- Mouse look: hold the left mouse button and drag to look; release to free the cursor.
- `H` hides the dev UI.
- `L` copies a moment link.
- `K` saves a screenshot.
- `P` pauses and resumes (reference moments open paused; a "Paused — P to resume" badge shows under the stats).
- `N` calls a set.
- Settings panel: custom/default switch and Reset settings button; settings are remembered between visits.
- Wind speed is shown and edited in km/h; swell and wind directions show compass points (e.g. `225° SW`), the direction they come from.
- Break folder: the breaking toggle (compare with Phase 1), the breaker index γ, the drain δ, the stage span Δ, the bore height β and the trough drain, plus the breaking ribbon's own controls; remembered with your other settings.
  - throw strength (×c): how fast the lip launches off the crest, as a multiple of the wave's own speed.
  - lip thickness (×H): how thick the pitching lip is, as a fraction of wave height.
  - collapse time (×τ land): how long the thrown lip takes to collapse once it lands, in landing-time units.
  - ribbon onset r: the breaking ratio at which the ribbon (the thrown sheet) starts fading in.
- Reef folder overlays: depth contours, crest lines, and ribbon tint (an unmistakable tint over the ribbon's own detail, to see where it takes over from the sheet).
- Sets folder: "face at the peak" reads the face height (crest to drained trough) of the wave passing the peak, in metres and feet, and whether it is breaking. Use it to calibrate the surfer-feet dial.

Design: `docs/superpowers/specs/`. Plans: `docs/superpowers/plans/`.
