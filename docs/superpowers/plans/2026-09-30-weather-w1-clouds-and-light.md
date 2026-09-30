# Weather W1: Clouds and Light, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every sky from clear to overcast, grey drizzle and sea mist: volumetric low and mid cloud, a high cirrus layer,
cloud shadows sweeping over the sea and land, cloudy sky light, and exposure and visibility that follow them. Presets,
moment links and dev panel included.

**Architecture:**
- A `WeatherConditions` block joins `Conditions`.
- A `Clouds` system (src/weather/) owns five parts:
  - the GPU noise textures;
  - a weather map;
  - a time-sliced panorama of the clouds around the camera (the **sky map**: cloud light RGB plus transmittance A);
  - a downsampled copy of it for reflections and sky light;
  - a cloud shadow map.
- `Sky` composes the atmosphere with the sky map in `radiance(dir)` and integrates its irradiance from the downsampled
  map. A combined sunlight source (the land's shade × the cloud shadow × the fog) replaces `land.sunlight` everywhere.

**Tech stack:** three.js 0.186 WebGPU + TSL (compute passes, `StorageTexture`, `Storage3DTexture`), vitest, the
`?selftest` GPU harness.

**Spec:** `docs/superpowers/specs/2026-09-30-weather-and-sky-design.md`, §3–§4.7 and §5 (W1).

## Global constraints

- Clear weather must render exactly as today:
  - the sky map holds T = 1, L = 0;
  - radiance, irradiance and sun light match the old path (self-test to 1e-4 relative);
  - the reference moments tuned under clear keep their look.
- Old `#m=` links decode with **clear** weather. Andrew's stored custom profile decodes with the **default** weather
  (scattered): it predates weather rather than choosing clear.
- The clouds move with the sim clock (`clock.simTime`), so paused captures and moment links are deterministic.
- Budget: at most **+1.5 ms** GPU at 12 ft in the worst preset (showers), measured with GPU timestamps.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `reference/`. Push to
  origin/weather-and-sky; no merge without Andrew.
- Match the codebase's style: CPU reference functions with vitest tests, GPU mirrors checked by self-tests, comments
  that say why.

## Review focus

1. **A time jump** (scrubbing the time of day, opening a moment link, pausing and stepping): the sky map must fully
   refresh. Stale slices would show clouds half in the old sun and half in the new.
2. **Looking straight up and at the horizon:** no seam at azimuth 0/360°, no pinch at the zenith, no band at the
   horizon where the map ends (rays below the horizon: T = 1, L = 0).
3. **Night and twilight:** clouds must darken with the atmosphere's light (no glowing grey clouds at night); no NaN
   when the sun is below the horizon.
4. **Underwater:** the light under an overcast sky must dim too. The underwater path reads `sunIlluminance` without
   the land's shade today.
5. **Sea mist:** the sun and horizon fade while the lineup stays clear. The fog's top must not show as a hard line on
   the dunes.

---

### Task 1: The weather state

**Files:**
- Create: `src/weather/weather.ts`, `src/weather/weather.test.ts`
- Modify:
  - conditions: `src/conditions/types.ts`, `defaults.ts` (clone and assign), `sanitize.ts`, `sanitize.test.ts`;
  - dev: `src/dev/referenceMoments.ts`, `devSettings.ts` (+ test), `DevPanel.ts` (+ test), `momentLink.test.ts`.

**Produces:**
```ts
export interface WeatherConditions {
  lowCover: number; convection: number; lowBaseM: number; midCover: number; highCover: number;
  rain: number; storm: number; visibilityKm: number; fogTopM: number; windAloftDeg: number; windAloftMs: number;
}
export const WEATHER_PRESET_NAMES: readonly WeatherPresetName[];   // clear … sea mist, in spectrum order
export const WEATHER_PRESETS: Readonly<Record<WeatherPresetName, Readonly<WeatherConditions>>>;
export const WEATHER_RANGES: Record<keyof WeatherConditions, { min: number; max: number }>;
export function sanitizeWeather(input: unknown, fallback: Readonly<WeatherConditions>): WeatherConditions;
export function presetOf(w: Readonly<WeatherConditions>): WeatherPresetName | null;   // exact match or null
// conditions: Conditions.weather; sanitizeConditions(input, legacyWeather = WEATHER_PRESETS.clear)
```

**Ruling:** `fogTopM` is added beyond the spec's table. Mist is a thin layer (about 60 m) and rain haze a deep one
(about 1.5 km); without it the two look the same. Cost if wrong: one field.

- [ ] Write the failing tests:
  - every preset is inside the ranges and survives `sanitizeWeather` unchanged;
  - junk and out-of-range values are clamped, and directions wrap;
  - a missing block gives the fallback;
  - `presetOf` round-trips every preset;
  - `sanitizeConditions({…no weather})` gives clear;
  - `sanitizeConditions(x, WEATHER_PRESETS.scattered)` gives scattered;
  - the moment link round-trips its weather, and an old link decodes as clear;
  - the stored profile without weather gives scattered;
  - `DEFAULT_CONDITIONS.weather` is scattered;
  - `morning-offshore` is scattered, and every other reference moment is clear;
  - `assignConditions` keeps the weather object's identity.
- [ ] Run `npx vitest run src/weather src/conditions src/dev` and watch them fail.
- [ ] Implement:
  - the weather module;
  - `Conditions.weather`;
  - clone and assign in `defaults.ts`;
  - `sanitizeConditions`' `legacyWeather` parameter;
  - `devSettings` passes `DEFAULT_CONDITIONS.weather`;
  - reference moments: `conditions()` defaults to clear, and morning-offshore patches in scattered.
- [ ] Add a DevPanel **Weather** folder under Wind:
  - a preset dropdown (plus "custom" when `presetOf` is null);
  - sliders for every field, bound through the same `onConditions` handler;
  - picking a preset `Object.assign`s it into `conditions.weather` and refreshes the pane.
- [ ] Run the tests (pass), and `npx tsc --noEmit -p .` (clean).
- [ ] Commit: `feat(weather): the weather state: presets, links, the panel`.

### Task 2: The cloud model's CPU reference

**Files:**
- Create: `src/weather/cloudModel.ts` + test, `src/weather/skyMapLayout.ts` + test, `src/weather/fog.ts` + test.

**Produces (all pure functions of numbers):**
- `lowLayer(w) → { baseM, topM }`. The thickness follows convection: stratocumulus 400 m, cumulus 1.5 km, congestus
  4 km, cumulonimbus to 9 km, piecewise-smooth.
- `heightProfile(hFrac, convection)`:
  - 0 outside [0, 1];
  - stratiform (convection 0): a rounded slab;
  - cumuliform: a sharp base (smoothstep 0–0.07) and a rounded tapering top;
  - above convection 0.85 it widens again near the top (the anvil).
- `coverageDensity(noise, cover)`: Nubis remap: `saturate((noise − (1 − cover)) / max(cover, 1e-3))`; 0 at cover 0.
- `cloudDensity(profile, coverageNoise, shapeNoise, detailNoise, cover)`: the full density with the noise values
  passed in, so the GPU self-test can force them.
- `shellInterval(camHeightM, dirY, baseM, topM, earthRadiusM)`: the ray's [tEnter, tExit] through a spherical shell,
  or null. Below the horizon: null for a camera under the base.
- `skyMapUv(elevation, azimuthWorld) ↔ skyMapDir(u, v)`: upper hemisphere, `v = sqrt(el / (π/2))`, u = world
  azimuth / 2π.
- `SKY_MAP = { width: 2048, height: 768 }`, `SKY_MAP_SMALL = { width: 512, height: 192 }`, `SLICES = 16`,
  `sliceOf(x, y)`: a 4 × 4 ordered pattern.
- `fogExtinctionPerM(visibilityKm)`: 3.912 / (visibilityKm · 1000) (Koschmieder).
- `fogOpticalDepth(camHeightM, dirY, distanceM, sigma0, fogTopM)`: the exact integral of a density falling off as
  `exp(−h / (fogTopM / 3))`.
- `exposureCloudStops(clearLum, cloudyLum, compensation = 2/3)`.

- [ ] Write the failing tests:
  - `heightProfile` is 0 outside [0, 1], peaks inside, and the cumulus top lies above the stratocumulus top;
  - `coverageDensity(n, 0) = 0`, it is monotonic in cover, and `coverageDensity(1, 1) = 1`;
  - `shellInterval`: straight up gives [base, top]; at the horizon, with a 1 km base, the entry is about 113 km
    (√(2Rh)), within 1%;
  - uv ↔ dir round-trips; the zenith has v = 1 and the horizon v = 0;
  - over 16 slices, every texel appears exactly once;
  - Koschmieder: visibility 1 km gives a contrast of 0.02 at 1 km;
  - fog depth: a horizontal ray is σ0·d at h = 0, and it falls off going up;
  - exposure stops are 0 when clear, positive under cloud, and 2/3 of the full log2 ratio.
- [ ] Watch them fail, implement, watch them pass, run tsc, commit: `feat(weather): the cloud model's CPU reference`.

### Task 3: The noise and weather textures (GPU)

**Files:**
- Create: `src/weather/CloudTextures.ts`, `src/weather/cloudNoiseNodes.ts`, `src/weather/clouds.selftest.ts`
  (registered in `src/dev/selfTests.ts`).

**Produces:**
- `CloudTextures`:
  - `shape: Storage3DTexture` (128³, RGBA8: Perlin–Worley in R, Worley fBm in GBA);
  - `detail: Storage3DTexture` (32³, RGBA8: Worley fBm);
  - `weather: StorageTexture` (512², covering 128 km, repeating). R is the low-cover noise, G the type modulation,
    B the rain cells, A the mid-layer noise.
  - `build(renderer)` runs once. `setSeed(seed)` rebuilds the weather map only.
- Tileable noise: the Worley cells and Perlin lattice wrap modulo the period, so the textures repeat seamlessly.

- [ ] Write the failing self-tests (read back through `getArrayBufferAsync` on a copy buffer, or by sampling in a small
  compute pass into a storage buffer):
  - the shape's mean is in 0.3–0.7 with a standard deviation above 0.1;
  - opposite edges match within 0.02 (it tiles);
  - the weather map differs between two seeds.
- [ ] Implement until they pass (`?selftest` in the ld-weather dev server on port 5175, SUMMARY line). Run tsc, commit:
  `feat(weather): cloud noise and weather textures`.

### Task 4: The sky map (the cloud march)

**Files:**
- Create: `src/weather/cloudNodes.ts` (density, lighting and march), `src/weather/SkyMap.ts`,
  `src/weather/Clouds.ts` (the orchestrator).
- Modify: `src/sky/Sky.ts`, `src/sky/SkyDome.ts`, `src/app/App.ts`, `src/weather/clouds.selftest.ts`.

**Produces:**
- `Clouds`:
  - `constructor(sky)`;
  - `setWeather(w, seed)`;
  - `update(renderer, sunDir, camera: Vector3, simTimeS)`, which marches one slice a frame and all of them after
    `invalidate()`;
  - `skyMap`, `skyMapSmall` textures, `shadow` (Task 6), and uniforms.
- `Sky`:
  - `attachClouds(clouds)`;
  - `radiance(dir, sharp = false)` = `atm(dir) · T + L`: the sharp map for the dome, the small map for reflections
    and irradiance, and T = 1, L = 0 below the horizon;
  - the sun disk × `T(sunDir)` from the sharp map.
- The march:
  - the low layer between `lowLayer(w)`, on the spherical shell;
  - 48 steps, stretched with distance, capped at 60 km;
  - empty-space skipping at 2× step while the coarse density is 0;
  - light from 6 cone steps toward the sun;
  - a two-lobe HG phase (g 0.8 / −0.2, mixed 0.7);
  - the multiple-scattering octaves (3 octaves: a, b, c = 0.5);
  - ambient `skyIrradiance / π` scaled from 0.6 at the base to 1.0 at the top;
  - the sun's colour at the sample from `luts.transmittanceAt`;
  - each sample's in-scatter fades by the atmosphere's extinction to that distance.
- The mid layer is a second, thin shell (3.5–4.2 km, 16 steps). The high layer is an analytic sheet at 9 km: noise
  from the weather map's A at a large scale plus a streaky fBm, optical depth from `highCover`.
- The slices: frame `k` marches the texels with `sliceOf = k mod 16`. `invalidate()` is called when:
  - the weather or seed changes;
  - the sun moves more than 0.5°;
  - the sim time jumps more than 2 s;
  - the camera jumps more than 200 m.
- After each full or partial update, a 4 × 4 box pass makes the small map.

- [ ] Write the failing self-tests:
  - **clear weather:** the sky map is exactly T = 1, L = 0; `radiance` equals the old LUT radiance at 20 directions
    (≤ 1e-4 relative);
  - **overcast:** T(zenith) < 0.05, and the zenith luminance sits between 0.2× and 1.2× the clear zenith (grey, not
    black, not blown);
  - **scattered:** the map's cover fraction (T < 0.5) is in 0.2–0.5;
  - no NaN or Inf in the map for the sun at −20°, 2°, 30° and 80°;
  - **the density mirror:** with the noise forced to constants (a `debugFlatNoise` uniform), GPU density at 5 points
    equals `cloudDensity` on the CPU within 1e-3.
- [ ] Implement until they pass. Wire it into App: construct after `sky`, `sky.attachClouds`, `clouds.setWeather`
  from the conditions (and on `onConditionsEdited`), and `update` in the frame before `sky.update`.
- [ ] By eye (Playwright capture on port 5175): the default moment with scattered, overcast and clear. Compare with
  `lefthanders-sunset.webp` at 17:25. Ledger what I see.
- [ ] Commit: `feat(weather): volumetric clouds in a sky map around the camera`.

### Task 5: Cloudy sky light and exposure

**Files:**
- Modify: `src/sky/AtmosphereLuts.ts` (the sky-light pass reads through a supplied radiance function),
  `src/sky/Sky.ts`, `src/render/PicturePipeline.ts`, `src/render/exposure.ts` (+ test), `src/app/App.ts`,
  `src/weather/clouds.selftest.ts`.

**Produces:**
- skyLight element 0 is integrated from the small sky map's `radiance(dir)`. It re-runs after each small-map update,
  not only when the sun moves.
- `Clouds.meter`, a 4-float storage buffer: [clear luminance, cloudy luminance at the camera
  (sun · T_shadow(camera) + irradiance), 0, 0]. It is written after each small-map update and read back async at most
  every 0.25 s.
- `PicturePipeline.setCloudStops(stops)`, eased at 1 stop/s (an eye adapting). `computeExposure` gains a
  `cloudStops` argument.

- [ ] Write the failing tests:
  - vitest: `computeExposure` with `cloudStops` adds them;
  - self-test: overcast irradiance luminance < 0.6× clear, and its chroma is greyer (B/R ratio closer to 1);
  - self-test: clear irradiance equals the old pass within 1e-4.
- [ ] Implement until they pass. Run tsc, commit: `feat(weather): cloudy sky light and a metering exposure`.

### Task 6: Cloud shadows

**Files:**
- Create: `src/weather/CloudShadow.ts`, `src/weather/combinedSunlight.ts`.
- Modify: `src/app/App.ts` (every `land.sunlight` use, and `land.setSunVisibility`), `src/ocean/underwaterNodes.ts` /
  `src/ocean/WaterVolume.ts` (the shade at the camera), `src/weather/clouds.selftest.ts`.

**Produces:**
- `CloudShadow implements SunlightSource`:
  - a 512² map covering 16 km centred on the break (x, z ∈ [−8000, 8000]);
  - each texel marches the sun ray through the low and mid shells (24 steps plus the high sheet's depth) and stores
    `exp(−τ)`;
  - refreshed every 4th frame, or at once after `invalidate`.
  - `visibilityNode(xz)` samples it, fading to the map's mean beyond its edge. It also multiplies in the fog's
    transmittance to the sun (Task 7 fills that in; 1 until then).
- `combineSunlight(a, b): SunlightSource`: its `visibilityNode` is `a.visibilityNode(xz) · b.visibilityNode(xz)`.
- Underwater: a uniform `cameraSunVisibility` read from the shadow at the camera's xz.

- [ ] Write the failing self-tests:
  - clear gives visibility 1 everywhere;
  - overcast gives mean visibility < 0.1;
  - scattered gives a map with both visibility < 0.3 and > 0.9 present;
  - a shadow moves downwind by `windAloftMs · Δt` within 1 texel over 30 s of sim time.
- [ ] Implement, wire it, and watch it pass. By eye: shadows on the sea and dunes from the drone view.
- [ ] Commit: `feat(weather): cloud shadows over the sea and land`.

### Task 7: Visibility and sea mist

**Files:**
- Modify: `src/sky/Sky.ts` (`applyAerialPerspective` adds the fog), `src/sky/SkyDome.ts` (the dome is fogged along
  its ray up to the fog's top), `src/weather/Clouds.ts` (fog uniforms, the sun's fog transmittance in the shadow),
  and the clouds' march (in-scatter fogged by distance).

**Produces:**
- `Sky.fog = { sigma0, topM }` uniforms from the weather.
- The fog's in-scatter colour is the small map's horizon radiance averaged over azimuth, times (1 − T).
  Written into the meter pass as element [2].

- [ ] Write the failing tests:
  - vitest (`fog.ts`) is covered in Task 2;
  - self-test: with sea mist, the dome's radiance at the horizon differs from the fog colour by < 5%, while at the
    zenith it keeps > 30% of its own;
  - self-test: with clear, the aerial perspective is unchanged (sigma0 = 0).
- [ ] Implement, pass, run tsc, commit: `feat(weather): visibility, haze and sea mist`.

### Task 8: The look pass, the cost and the review

- [ ] Tune the presets by eye with Playwright captures on port 5175. Every preset at 08:15 from the lineup (facing
  west), the channel and the drone; showers and scattered at 17:25 facing the sun. Put
  `lefthanders-sunset.webp` beside the sunset tiles. Ledger each change of preset value with its reason.
- [ ] Cost: GPU timestamps (`renderer.info.render.timestamp`) for clear, scattered, showers and overcast at 12 ft.
  Record them in the ledger. Over +1.5 ms: lower the march steps or the slice rate first.
- [ ] Run the full vitest suite, `?selftest` and tsc, and ledger the results (known flakes: heath plant cache, sound
  frame cost).
- [ ] Final whole-branch review (executing-plans final review), then the fix pass.
- [ ] Push `weather-and-sky`. Send Andrew the preset sheet via SendUserFile. Update memory.
