# Liquid Dreams

A surfing game built for the love of it. The first (and only) break is **The Womb**, Ellensbrook, WA.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
```

- `#ref=<name>` loads a named reference moment (see `src/dev/referenceMoments.ts`).
- `?selftest` runs the GPU self-tests instead of the app.
- Needs a WebGPU browser (current Chrome or Edge). On hybrid-GPU laptops, set the browser to "High performance" in Windows Graphics settings and fully quit the browser (including background processes) before relaunching; the stats overlay names the GPU in use. Keep both GPU drivers current.
- Rendering is capped at 60 fps (dev panel: Picture → "max fps", 0 = display rate). `H` hides the dev UI, `L` copies a moment link, `K` saves a screenshot, `P` pauses and resumes (reference moments open paused; a "Paused — P to resume" badge shows under the stats).

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
| `golden-hour` | 16:50 facing the sun, Doctor in. Glitter path, crest transmission, choppier surface, horizon haze. |
| `sunset` | 17:25 facing the sun. Sky colour, exposure, horizon. |
| `overview` | Free camera 40 m up at noon. No tiling, LOD transitions, horizon curvature. |
| `set-arriving` | 08:15 facing south-west as a set appears: lines darkening on the horizon, 60 s out. |
| `set-on-the-reef` | 08:15 looking north-north-east across the peak as the set's biggest wave stands up on the ledge. |
| `low-tide-set` | The same wave at −0.5 m tide: shallower water, standing up harder and earlier. |
| `high-tide-set` | The same wave at +0.5 m tide: deeper water, softer. |
| `looking-down` | 10:30 looking down from the lineup: limestone, weed and turquoise sand pockets through clear water. |
| `reef-overhead` | Free camera 60 m above the reef at noon: the wedge, the shelf and the sand pockets from above. |

Pick these with settings: default (or open `#ref=<name>`) to see them exactly as designed; in custom mode your own swell, tide and camera are kept. Sets arrive every 10–20 minutes. Use `N` or the Sets folder's button to call one, and the Reef folder for depths and the crest-line overlay.

## Controls

- Mouse look: hold the left mouse button and drag to look; release to free the cursor.
- `H` hides the dev UI.
- `L` copies a moment link.
- `K` saves a screenshot.
- `P` pauses and resumes (reference moments open paused; a "Paused — P to resume" badge shows under the stats).
- `N` calls a set.
- Settings panel: custom/default switch and Reset settings button; settings are remembered between visits.

Design: `docs/superpowers/specs/`. Plans: `docs/superpowers/plans/`.
