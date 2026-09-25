# Liquid Dreams: Vision, Architecture & Phase 0 ("First Light") Design

**Date:** 2026-09-25
**Authors:** Andrew Justice & Claude
**Status:** Draft for review

---

## 1. Vision

Liquid Dreams is a personal passion project: a surfing game made together for the joy of it, not a product. It exists to be beautiful and to relax the mind, recreating the feeling of being at one with the power of nature.

*Kelly Slater's Pro Surfer* (2002) is the touchstone only for the **feeling of riding a wave**. Its score, combo and career systems are explicitly not goals. Light goals may appear much later. For now the heart of the project is:

- the beauty of the ocean, waves, light, sand and reef;
- the unique, unpredictable nature of the sea. Each break has a recognisable **DNA** (shaped by its seabed and by how far its swell has travelled), yet **every wave is slightly different**. That's what makes you come back.

### Guiding decisions

| Decision | Choice |
|---|---|
| Heart of the game | Ocean-first beauty and unpredictability; no scoring or goals for now |
| Scope | Perfect **one break** before designing any other |
| The break | **The Womb**, a real left-hand limestone reef slab, Ellensbrook, WA |
| Platform | Browser, WebGPU + TypeScript, so Claude can see and screenshot the output and iterate |
| Visual style | **Cinematic realism**: physically based light and water, with a subtle filmic grade |
| Primary experience | Floating in the lineup at water level; free-fly camera as a dev tool |
| Hero time of day | **Morning**, early to late: glassy or light easterly offshore, before the Fremantle Doctor arrives |
| Wave technology | Physics-guided wave shaping (layered ocean + reef-driven parametric breaker), built so the approach-to-reef layer can later be swapped for a shallow-water simulation |
| Engine | Three.js `WebGPURenderer` + TSL, with custom compute and shaders where the craft matters |

---

## 2. The Womb: the break we are building

**Location:** peak at approximately **-33.8972366, 114.9832508**, about 232m offshore; about 400m north of Ellensbrook Bombie; about 2km south of Lefthanders; between Margaret River and Gracetown, in the South West of Western Australia. Reached by a 15-minute walk through dune scrub from the Ellensbrook Road car park. Isolated, few people.

**Seabed:** very shallow **limestone** reef (pitted ledges, weed and kelp), with turquoise **sand pockets** that create the odd extra-hollow section. The reef forms a wedge: the left collides with a short section breaking the opposite way at the end of the ride.

**Character:** a short (<50m), fast, ledgy, powerful left. The take-off pitches straight into the barrel. From about 4ft the shape resembles Teahupo'o: the water in front of the wave drains off the reef, so the face drops below sea level with a step in it. It produces a 4–5 second barrel, a thunder-clap as the lip lands, and a blast of spit out of the tube. The ride ends in a spit-out or in the collision with the opposing section.

**Size scale (surfer feet, measured from the back of the wave; this is the project's canonical unit):**

| Surfer ft | Behaviour |
|---|---|
| 2 | Breaks, doesn't really barrel |
| 3 | Starts producing barrels; already well overhead |
| 4+ | Teahupo'o-like slab shape |
| 5 | The perfect barrel |
| 6+ | Starts to close out; still an incredible, heavy barrel |

**Ideal conditions:** S–SW groundswell; E–NE (offshore) wind; mid to high tide. The break works on 150+ days a year. Tide sets the water depth over the reef and is therefore part of the wave's DNA (lower tide means heavier and closer to closing out).

**Look and feel (from Andrew and the reference images):**
- Deep-blue, crystal-clear water; the reef visible beneath you.
- The lip throws and turns brilliant **turquoise**: clear water lit from behind, becoming milky turquoise where air mixes in.
- **Morning is the heart of it (Andrew's fondest memories).** From early to late morning the sun rises and climbs behind the dunes while the easterly offshore wind grooms the lineup and blows spray back off the lip, lit gold against a deep-blue sea. On the best days the Fremantle Doctor (the SW sea breeze) arrives late, and the session stretches on.
- **Afternoon and sunset** are secondary moods: once the Doctor is in, the surface gets choppier; the sun sinks into the Indian Ocean behind the waves, under big cumulus clouds with orange-lit undersides.
- **Autumn glass-offs** (rare and treasured): days with no wind at all, all day long. The ocean turns to glass, the swell lines arrive as smooth, mirror-like corduroy reflecting the sky, and the session never has to end.
- **Overcast days** mute everything to green-grey, a valid mood of their own.
- Inside the barrel: a backlit, glowing lip; a rippled texture running up the inner wall; foam chunks sliding up the face; the tube opening framing the dunes behind a haze of sea spray.
- **The land:** a long straight sandy beach, high dunes, and low coastal heath (silver-grey daisy-bush, succulent pigface turning orange at the tips, pink rice-flower) over sandy limestone soil. Rust-brown rocks at the waterline.
- **Life:** dolphins, the occasional whale, and seabirds.

**Reference material** lives in `reference/` (`place/`, `wave/`, `light/`, `sound/`). It is git-ignored because it contains third-party photos, and must never be published.

---

## 3. Roadmap

Each phase ends with something beautiful you can sit in, and each gets its own spec, plan and build cycle. This document covers the overall architecture and **Phase 0** in full. Phases 1–5 are summarised so that Phase 0 is built to accommodate them.

| Phase | Name | What you experience at the end |
|---|---|---|
| **0** | **First light** | Floating in open Indian Ocean water at the Womb lineup; physically based sky and sun; time-of-day dial; FFT ocean; lineup and free cameras; dev tools |
| 1 | The place | Seabed (limestone reef, wedge, ledge, sand pockets, tide depth), beach, dunes, heath, rocks; clear water showing the reef; depth-driven colour; Ellensbrook Bombie in the distance |
| 2 | The wave | Swell sets and groups; shoaling and refraction over the reef; breaking onset; the Womb barrel peeling left into the opposing section; surfer-feet dial calibrated; every wave unique; turquoise lip transmission |
| 3 | Whitewater | Lip impact, whitewater explosion, spit, offshore spray off the crest, lingering and dissolving foam |
| 4 | Sound | Spatial audio: thunder-clap impacts, whitewater roar and hiss, wind in the scrub, water lapping close by |
| 5 | Life & conditions | Day rhythm (glassy mornings, easterly offshores, then the SW sea breeze, the "Fremantle Doctor", whose arrival time varies from day to day; on the best days it comes in late); rare autumn glass-off days with no wind at all; clouds and overcast moods; dolphins, whales, seabirds |

---

## 4. Overall architecture

One description of **the moment** (`Conditions`) drives everything.

```
Conditions ──► Sky & Sun ──────────────┐
(time, date,   Ocean surface ──────────┤
 swell, wind,  Seabed ──► Breaker ─────┼──► Renderer ──► screen
 tide, seed)             │             │    (water shading, post)
                         └──► events ──┴──► Whitewater, Audio
```

### Units (modules)

Each module has one purpose and a small, explicit interface. Pure maths is kept separate from GPU code so it can be unit tested.

| Module | Purpose | Phase |
|---|---|---|
| `conditions/` | The `Conditions` type (date/time, swell, wind, tide, seed), defaults, seeded RNG, unit conversions (surfer feet) | 0 |
| `astro/` | Pure solar position for a given latitude/longitude and UTC time | 0 |
| `sky/` | Physically based atmosphere, sun disk, environment lighting for reflections, aerial perspective | 0 |
| `ocean/` | Spectrum-based open-ocean surface on the GPU (displacement, normals, foam), surface geometry, water material, height readback | 0 |
| `camera/` | Lineup (floating) camera and free-fly camera, input handling | 0 |
| `render/` | Renderer creation, frame loop, HDR, exposure, tone mapping, bloom, grade | 0 |
| `dev/` | Tuning panel, performance/GPU readout, moment links, screenshot key, pause | 0 |
| `seabed/` | Bathymetry and material masks; tide-adjusted depth queries | 1 |
| `land/` | Beach, dunes, heath, rocks | 1 |
| `swell/` | Seeded set/group generator producing individual wave events | 2 |
| `breaker/` | Per-wave shoaling, refraction and breaking; barrel surface; emits impact events | 2 |
| `whitewater/` | GPU particles and foam field, driven by breaker events | 3 |
| `audio/` | Web Audio spatial sound, driven by breaker events and conditions | 4 |

### Shared principles

- **One source of truth for the water height.** The water surface height at any point and time is defined once per layer and consumed consistently by the renderer, the lineup camera and, eventually, a surfer. In Phase 0 the GPU is authoritative and the CPU obtains heights by asynchronous readback.
- **Deterministic moments.** Every random process is driven by a seeded RNG taken from `Conditions.seed`. The same conditions, seed and simulation time always give the same ocean.
- **Events, not polling.** From Phase 2 the breaker publishes events (for example "lip impact at position P, energy E, time T"). Whitewater and audio subscribe to them rather than reaching into breaker internals.

### World conventions

- Units: **metres**, **seconds**, angles in **degrees** at the interfaces (radians internally).
- Origin: **the Womb's peak** (-33.8972366, 114.9832508), at **y = 0 = mean sea level**. Tide raises or lowers the water surface relative to y = 0 (from Phase 1).
- Axes (right-handed): **+X = east, +Y = up, +Z = south** (so north is -Z).
- Directions in `Conditions` follow meteorological/surf convention: the direction the swell or wind **comes from**, in degrees true (for example swell 225° = from the SW; wind 80° = from the east, which is offshore here).
- Time: `Conditions` stores local time in **AWST (UTC+8, no daylight saving)**, converted to UTC for astronomy.

---

## 5. Phase 0: "First Light", detailed design

### 5.1 Experience

You float at the Womb's lineup position in open Indian Ocean water on a winter morning. Long SW groundswell lifts and lowers you under a light easterly offshore breeze. You can scrub time from pre-dawn to after sunset, and the sky, sun, reflections and water colour all respond believably. There is no land, seabed or breaking wave yet.

### 5.2 Conditions (Phase 0 subset)

```ts
interface Conditions {
  date: string;            // 'YYYY-MM-DD', local AWST
  timeOfDay: number;       // hours, 0–24, local AWST
  swell: {
    sizeFt: number;        // surfer feet (canonical unit)
    periodS: number;       // peak period, seconds
    directionDeg: number;  // coming FROM, degrees true
  };
  wind: {
    speedMs: number;       // metres/second
    directionDeg: number;  // coming FROM, degrees true
  };
  tideM: number;           // metres relative to mean sea level (stored now, used from Phase 1)
  seed: number;            // uint32
}
```

**Defaults:** date `2026-07-15` (winter, the SW groundswell season); time `08:15` (morning session: sun low in the east over the land, behind you as you look out to sea); swell `4ft`, `15s`, from `225°`; wind `3 m/s` from `80°` (light offshore); tide `0`; seed `2002` (a nod to KS:PS).

**Surfer feet in Phase 0:** without shoaling there is no real breaking wave height yet. The swell dial therefore maps surfer feet to the open-ocean **significant wave height** with a provisional factor, `Hs = 0.4 m × sizeFt`, kept in one function in `conditions/`. Phase 2 recalibrates this mapping against the breaking wave's face height at the reef, tuned by eye with Andrew.

### 5.3 Sun and sky

- **Solar position:** a pure function `sunPosition(latDeg, lonDeg, utcDate) → { azimuthDeg, elevationDeg }` using the NOAA solar position algorithm. Converted to a world-space direction using the axis conventions above.
- **Atmosphere:** a physically based sky using the precomputed lookup-table approach (transmittance, multiple-scattering and sky-view tables, after Hillaire 2020), computed on the GPU and refreshed when the sun moves. Rayleigh plus Mie scattering, with Mie (aerosol) settings raised slightly to give the **coastal sea haze** seen in the reference frames. The sun disk has limb darkening. Below the horizon the sky transitions through twilight to night; a dark night sky is acceptable (stars are out of scope).
- **Environment lighting:** reflections sample the sky-view table directly along the reflected ray (no cubemap needed). A small GPU pass integrates that table into a sky irradiance term and computes the sun's illuminance at the surface. Both are regenerated when the sun direction changes by more than 0.25°.
- **Aerial perspective:** distant ocean fades into the atmosphere's in-scattered light, so the horizon sits naturally in the haze. Everything in the scene is within about 20m of sea level, so this uses a sea-level approximation (transmittance `exp(−σₜ(0)·d)`, with the horizon sky radiance as in-scatter) instead of a 3D table.
- **Clouds:** out of scope until Phase 5.

### 5.4 The ocean surface

- **Method:** GPU FFT ocean (Tessendorf) implemented as TSL compute passes. It produces horizontal and vertical displacement, slopes/normals, and a Jacobian-based foam term.
- **Spectrum:** the sum of two directional components, both evaluated for deep water in Phase 0:
  - **Wind sea:** JONSWAP, driven by `wind.speedMs` and a fixed fetch, spread around the downwind direction.
  - **Groundswell:** a narrow-band JONSWAP (high peak enhancement) at `swell.periodS`, scaled to `Hs` from `swell.sizeFt`, with tight directional spreading around `swell.directionDeg`.
- Spectrum maths (dispersion relation, JONSWAP, directional spreading, Hs normalisation) lives in pure TypeScript so it can be unit tested; the initial spectrum is generated from the seeded RNG.
- **Cascades:** three FFT cascades at 256×256 with patch sizes of **3000m / 250m / 35m** (tunable), splitting wavenumber space into contiguous bands so no energy is counted twice and no tiling is visible. The largest patch must span many wavelengths of the ~350m, 15s groundswell to resolve its peak and direction. Each spectrum component is renormalised so the discrete grids reproduce its requested Hs exactly.
- **Geometry:** a camera-centred, concentric level-of-detail grid that displaces vertices from the cascades. The grid extends to the horizon, and beyond about 3km only normals are applied. Earth curvature drop (`y -= d² / 2R`) is applied so the horizon sits at a physically sensible distance for the eye height.
- **Height readback:** a small compute pass samples the displacement at the lineup camera's position each frame into a storage buffer, which is read back asynchronously (1–3 frames of latency, then smoothed). The last good value is held if a readback is late.

### 5.5 Water shading

- **Reflection:** Fresnel (water refractive index 1.33) blended with the sky environment map.
- **Sun glitter:** sun specular whose roughness includes the unresolved sub-grid slope variance, so glitter stays correct at a distance rather than aliasing.
- **Body colour:** deep, clear oceanic water from absorption and scattering coefficients (clear Indian Ocean blue); no seabed is visible in Phase 0.
- **Crest light transmission (first version):** light passing through thin, raised crests toward the viewer when the sun is behind them. This is an approximation driven by crest height, view–sun alignment and a thickness proxy. It is the forerunner of the Phase 2 turquoise lip.
- **Whitecaps:** a foam texture accumulated from the Jacobian (where the surface folds) with gradual decay; subtle at default winds.

### 5.6 Cameras and controls

**Lineup camera (default):**
- Positioned in the lineup near the origin, eye about 0.8m above the local water surface. The camera rides the read-back water height through a damped spring, so it feels like sitting on a board, not glued to the surface.
- Mouse look (pointer lock). `WASD` drifts slowly (paddling pace, about 0.5 m/s). Holding `Space` rises about 2m to see further (letting go settles back down).

**Free camera (dev):**
- `WASD` to move, `Q`/`E` for down/up, `Shift` for fast, mouse wheel to change base speed.

**Toggle:** `C` switches between lineup and free cameras.

### 5.7 Picture pipeline

- HDR half-float rendering.
- **Exposure:** physically motivated, derived from the sun and sky brightness, with a manual EV offset in the dev panel.
- **Tone mapping:** AgX.
- **Bloom:** gentle, mainly for the sun and glitter.
- **Grade:** a simple lift/gamma/gain and saturation control for the "dream" feel, restrained by default.

### 5.8 Dev tools

- **Tuning panel** (Tweakpane): every `Conditions` field, plus ocean, shading, exposure and grade parameters.
- **Performance readout** (stats-gl or equivalent): FPS, CPU frame time, GPU time (timestamp queries where available) and **the active GPU adapter name**, so it is obvious if the Intel integrated GPU is being used instead of the RTX 4060.
- **Moment link:** a URL hash encoding a schema version, `Conditions`, camera mode and pose, and simulation time. Opening the link restores that exact moment. A hotkey (`L`) copies the current moment link to the clipboard.
- **Pause:** `P` freezes simulation time (the camera can still move), so a moment can be inspected closely.
- **Screenshot:** `K` saves a PNG of the current frame.
- **Dev UI toggle:** `H` hides or shows the panel and performance readout (for clean screenshots).
- **Reference links:** `#ref=<name>` opens a named reference moment; `?selftest` runs the GPU self-tests instead of the app.

### 5.9 Tech stack and project layout

- **Build:** Vite + TypeScript (strict), npm, Node 24.
- **Rendering:** Three.js `WebGPURenderer`, TSL for materials and compute. The Three.js version is **pinned** because the WebGPU/TSL API still changes between releases.
- **Tests:** Vitest.

```
liquid-dreaming/
  index.html
  src/
    main.ts              bootstrap, WebGPU capability check
    app/                 frame loop, time, wiring of modules
    conditions/          Conditions, defaults, seeded RNG, units
    astro/               solar position (pure)
    sky/                 atmosphere tables, sky dome, environment, aerial perspective
    ocean/               spectrum (pure), FFT compute, cascades, surface grid, material, readback
    camera/              lineup camera, free camera, input
    render/              renderer, post-processing chain
    dev/                 panel, stats, moment link, screenshot, pause
  docs/superpowers/specs/
  reference/             (git-ignored)
```

Unit tests sit beside the code they test (`*.test.ts`).

### 5.10 Error handling

- **No WebGPU:** a clear full-screen message explaining that a WebGPU-capable browser is needed (current Chrome or Edge), with no WebGL fallback.
- **Integrated GPU selected:** a notice in the dev readout, with instructions for setting the browser to "High performance" in Windows Graphics settings.
- **GPU device lost:** an overlay offering a reload, which restores the current moment from the moment link.
- **Late readback:** the lineup camera holds and smooths the last good height (never a jump).
- **Invalid moment link:** ignored with a console warning; defaults are loaded.

### 5.11 Performance budget

- A steady **60 fps at native resolution** on the RTX 4060 Laptop GPU.
- **GPU time at or below about 8ms per frame** in Phase 0, keeping roughly half the frame for the reef, breaker and whitewater phases.
- If the budget is exceeded, render-scale and cascade-resolution controls in the dev panel are the first levers.

### 5.12 Testing

**Automated (Vitest), for pure logic:**
- `sunPosition` against NOAA reference values for The Womb's coordinates (sunrise/sunset times and noon elevation on several dates, within tolerance).
- Spectrum maths: the deep-water dispersion relation; zero wind produces a valid (finite, non-NaN) swell-only spectrum; the JONSWAP peak at the expected frequency; Hs normalisation (the integrated spectrum reproduces the requested Hs within tolerance); directional spreading integrates to 1.
- `Conditions`: defaults are valid; the surfer-feet conversion; the seeded RNG is deterministic.
- Moment link: the encode/decode round trip is lossless; malformed input is rejected safely.
- Coordinate conventions: compass direction to world vector (for example "from 225°" yields travel toward the NE, i.e. +X and -Z).

**Visual, through reference moments:** a gallery of named moment links, each opened in Claude's browser pane and screenshotted after meaningful changes, to compare against the previous result and the reference photos:

| Moment | Setup | Checks |
|---|---|---|
| `pre-dawn` | 06:30, looking east then west | Twilight gradient, dark sea, no sun artefacts |
| `first-sun` | 07:35, facing east then west | Sunrise colour over the land, first light on the swell |
| `morning-offshore` (default) | 08:15, light E wind, facing west | Low sun behind the camera, clear deep-blue water, groomed surface |
| `late-morning` | 10:30, light E wind, facing west | Higher sun, water clarity, colour holding up before the Doctor |
| `noon-deep-blue` | 12:30, looking down at about 45° | Body colour and clarity, small glitter |
| `autumn-glass` | 2026-04-20, 09:30, wind 0 m/s, facing west | Mirror-smooth swell lines, crisp sky reflection, tight sun highlight, no whitecaps |
| `golden-hour` | 16:50, 6 m/s SW wind, facing the sun | Glitter path, crest transmission, choppier post-Doctor surface, haze on the horizon |
| `sunset` | 17:25, facing the sun | Sky colour, exposure, horizon |
| `overview` | Free camera 40m up, noon | No tiling, LOD transitions, horizon curvature |

**Phase 0 is done when:** you can sit in the lineup on a winter morning, scrub from dawn to dusk, and it already feels like the Indian Ocean off the Capes; all reference moments look right to Andrew; the automated tests pass; and the performance budget is met.

### 5.13 Out of scope for Phase 0

Land, seabed, tide effects, shallow-water effects, breaking waves, whitewater and spray, clouds, stars, audio, wildlife, a surfer, and mobile support.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Three.js WebGPU/TSL APIs change between releases | Pin the version; wrap GPU-specific code inside module boundaries |
| FFT compute cost on a laptop GPU | Cascade resolution and count are tunable; measure with GPU timestamps from the first day |
| The browser runs on the integrated Intel GPU | Request `high-performance`; show the adapter name in the dev readout; document the Windows setting |
| Realism falls short early on | Reference moments plus Andrew's eye as the judge; iterate in small, visible steps |
| Future phases require reworking Phase 0 | Water height defined per layer, `Conditions` as the single source of truth, and the event-based design are all in place from the start |
