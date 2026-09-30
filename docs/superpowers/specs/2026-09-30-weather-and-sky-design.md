# Weather and Sky: Design

**Date:** 2026-09-30 · **Branch:** `weather-and-sky` · **Status:** written by Claude while Andrew was out collecting barrel
references. He delegated this ("start working on weather/sky"). Every call marked **Ruling** is mine, is his to overturn,
and names what it costs if it's wrong.

## 1. What Andrew asked for, and what I assumed

**He said:**
- "Currently, we just have the one setting: clear."
- "It is almost always cloudy to some degree where The Womb is located."
- "I want a full spectrum of weather conditions."
- Last night: "Ensure you keep it looking realistic."

**Already in the project's vision** (first-light spec §2 and roadmap Phase 6):
- A weather dial: clear / cloudy / overcast / stormy. It drives the sky, the light and the colour of the sea.
- "Overcast days mute everything to green-grey, a valid mood of their own."
- Sunsets under big cumulus with orange-lit undersides. His reference photo
  `reference/light/lefthanders-sunset.webp` shows this: post-frontal cumulus over the Capes, with grey bases and gold edges.

**Assumed (all rulings):**
- **A1:** "Full spectrum" means every sky the Capes actually get: clear, fair-weather cumulus, broken stratocumulus,
  high cloud ahead of a front, full overcast, drizzle, showers with sunny breaks, frontal rain, thunderstorms, and sea
  mist. Not snow, not tropical cyclones.
- **A2:** Realism matters more than frame rate. The clouds must be volumetric (lit through their bodies, with silver
  linings and dark bases, casting moving shadows on the sea), not painted on a dome.
- **A3:** Weather is one more *condition*, beside swell, wind, tide and time. You pick it. It is never inferred from
  the others. Presets don't change the wind or the swell (see §6, Q2).
- **A4:** The waves still come first. Weather must not cost the break its frame budget.

**What success looks like:**
- Andrew can set any of those skies in a click.
- Each reads at a glance as a real day at Ellensbrook: the sky, the light on the water, the sea's colour, the
  visibility and the sound.
- A photo he takes on such a day and a screenshot from the game look like the same place.

## 2. The Capes' weather (what the presets are built from)

Margaret River has a Mediterranean climate. In winter (May–Sep), cold fronts cross from the Indian Ocean every 3–6
days. That winter cycle is the surf season, and it is also the source of the Womb's S–SW groundswell.

1. **Pre-frontal:** the wind swings N–NW. High cirrus thickens to a milky sheet (cirrostratus, then altostratus), and
   the sun turns to a watery disk and fades. The sky ahead of the front grows dark grey.
2. **The front:** a band of heavy rain and squalls, sometimes with thunder and hail. Low ragged cloud (nimbostratus
   and scud). Visibility drops to a few kilometres.
3. **Post-frontal:** the wind goes SW–W. Big showery cumulus and cumulonimbus with sunny breaks between them, and grey
   rain curtains standing on the horizon. Crisp, clean air.
4. **The ridge builds:** the wind turns E, offshore: the Womb's best days. Showers ease to fair-weather cumulus or a
   deck of stratocumulus breaking up through the morning, often with clear morning air.

Summer brings clear, dry mornings, the sea breeze, and haze or sea fog on still mornings. Autumn brings calm, high
cloud and glass-offs.

**Ruling (default sky), revised in the W1 look pass:** the default moment (15 Jul, 08:15, 3 m/s E offshore) gets **fair-weather cumulus (1–2 oktas, shallow)**. First ruled scattered (3–4 oktas); at the 08:15 sun a ray crosses ~13 km of a cumulus layer, and scattered cumulus shaded 89% of the lineup, where Andrew's fondest mornings are sunlit. Scattered stays a preset.
That's the ridge-building morning after a front, the setup behind the Womb's best days, and Andrew says it's almost
always cloudy. Old moment links, and the reference moments tuned under a clear sky, stay **clear**, so their baselines
don't move. Cost if wrong: one default value.

## 3. The weather model

`Conditions` gains a `weather` block. Presets are named points in it, and the sliders move freely between them.

| Field | Range | Meaning |
|---|---|---|
| `lowCover` | 0–1 | How much of the sky the low cloud covers (0 clear, 1 overcast) |
| `convection` | 0–1 | How tall the low clouds grow: flat stratocumulus (0), cumulus (0.4), congestus (0.7), cumulonimbus (1) |
| `lowBaseM` | 300–2000 | Height of the low cloud's base (low and ragged in a front, about 1 km in fair weather) |
| `midCover` | 0–1 | Altostratus or altocumulus sheet, 3–5 km |
| `highCover` | 0–1 | Cirrus or cirrostratus, about 9 km |
| `rain` | 0–1 | Rain rate under the rain cells: 0 none, 0.2 drizzle, 0.5 steady rain, 1 downpour |
| `storm` | 0–1 | Lightning and thunder frequency under the tallest cells |
| `visibilityKm` | 0.3–60 | Low-level visibility: haze, mist, sea fog and rain all lower it |
| `fogTopM` | 20–3000 | How deep the low haze is: about 60 m for sea mist, about 1.5 km for rain haze (added in the W1 plan: without it mist and rain haze look the same) |
| `windAloftDeg`, `windAloftMs` | | The steering wind that moves the clouds (independent of the surface wind) |

**Presets** (the dev panel's weather dropdown, and the conditions menu):

| Preset | What it is |
|---|---|
| clear | No cloud: today's sky |
| fair | Few small, shallow cumulus (the default) |
| scattered | Scattered cumulus |
| broken | Broken stratocumulus with gaps of blue |
| high cloud | Pre-frontal cirrus: a watery sun |
| overcast | Grey stratocumulus deck, flat light |
| drizzle | Low overcast, fine drizzle, 5 km visibility |
| showers | Post-frontal cumulus and cumulonimbus with sun between, rain curtains on the horizon |
| rain | Frontal nimbostratus, steady rain, 3 km visibility |
| storm | A squall line with lightning, thunder and heavy rain |
| sea mist | Still-morning fog on the water, the sun a pale disk |

- A moment link carries the weather. A link with no weather decodes as clear.
- **Ruling:** the weather is fixed over a session for now. Clouds still drift and change shape, but a front doesn't
  arrive mid-session; that is Phase W3.

## 4. How it renders

### 4.1 Where it hooks in

Every material already reads its light through one `Sky` object:
- `sunIlluminance`: the sun's light at the surface;
- `skyIrradiance`: the diffuse light from the whole sky;
- `radiance(dir)`: the sky seen along a direction, used for the dome and for reflections;
- `applyAerialPerspective`: the fade of distant objects into haze.

The weather changes what those four return, plus one new term, `sunVisibility(worldPos)` (the cloud shadow). The
water, land, heath, rocks and spray then respond without per-material weather logic.

### 4.2 Low and mid clouds: volumetric

Standard real-time volumetric clouds (Schneider/Guerrilla "Nubis", Hillaire/Frostbite 2016):
- **Weather map:** a 2D texture about 60 km across that sets coverage, cloud type and rain for each cell. It is built
  from the weather fields and the seed, and drifts with the wind aloft.
- **Density:** a height profile for the cloud type, times a 3D Perlin–Worley base shape (128³), eroded by a 3D Worley
  detail texture (32³) that drifts and curls, so the edges boil slowly. The noise textures are generated once, on the
  GPU, at start.
- **Light:**
  - sun transmittance from a short cone march toward the sun;
  - a two-lobe Henyey–Greenstein phase, for the silver lining around the sun;
  - a multiple-scattering approximation (Wrenninge's octaves, the soft bright interior of thick cloud);
  - the "powder" darkening at edges facing the sun;
  - ambient light from the atmosphere above and the sea below, so bases are grey-blue, not black.
- **The sun's colour at cloud height** comes from the existing transmittance table. The orange undersides at sunrise
  and sunset come out of the physics, with no extra tint.
- **Distant cloud** fades into the atmosphere's haze by its distance, so a bank 30 km out sits softly on the horizon.

### 4.3 High clouds: a thin 2D layer

Cirrus and cirrostratus are a textured layer at 9 km, lit by the phase function and the sun's colour. That is cheap,
and correct for clouds this thin. When dense, they add a halo-free milky veil around the sun.

### 4.4 The cloudy sky map

**Ruling (the main architectural call):** the clouds are raymarched into a **sky map**: a panorama around the camera.
They are not raymarched per pixel on screen. The dome, every reflection and the sky-light integration all read it.

- **Why:** reflections of cloud on the water are half of what makes a cloudy sea look real, and a per-pixel screen
  pass can't serve reflections.
- The clouds sit 300 m to 10 km away, so the camera's few metres of movement don't shift them.
- It turns and cuts with the camera for free, with none of screen-space reprojection's ghosting.
- The panorama is 2048 × 768, packed toward the horizon, where most of the view is.
- It is refreshed in a time-sliced checkerboard, 1/16 of its texels a frame. The clouds move a fraction of a texel in
  that time.
- Mip levels serve rough water's blurred reflections.
- **Output per texel:** the cloud's in-scattered light (RGB) and its transmittance (A). The sky is the atmosphere,
  times that transmittance, plus the cloud light.
- **Cost if wrong:** looking straight up at a nearby cloud, a texel covers about 3 screen pixels at 1080p, so cloud
  edges overhead may look soft. The fix would be a screen-space pass for the dome only, with the panorama kept for
  everything else. I'll judge it by eye at the lineup and the drone views.

### 4.5 Cloud shadows and the light at the surface

- **Shadow map:** a 512² texture covering 16 km around the break. It stores the sun's transmittance through the cloud
  layers, marched along the sun's direction, refreshed every few frames. `sunVisibility(worldPos)` samples it. The
  shadows sweep across the lineup, the beach and the dunes as the clouds drift.
- Every place that uses `sunIlluminance` multiplies it by `sunVisibility` at its own point. Those are the water's
  diffuse, spec and glitter, the land, heath, rocks, reef, spray and foam: 14 call sites.
- **Sky irradiance** is integrated from the cloudy sky map instead of the clear one. Overcast light then comes out
  grey-white and soft, with no sun term, by physics.
- **The sun disk** fades by the cloud's transmittance along its ray. It's a watery disk through cirrostratus and gone
  under overcast.

### 4.6 Exposure

- The auto-exposure reads the actual light at the camera (sun × visibility + sky), not only the sun's elevation, like
  a real meter.
- **Ruling:** it compensates about two-thirds of the difference. A real overcast day still reads darker and moodier
  than a sunny one, as it does to the eye and in photos. Cost if wrong: one constant.

### 4.7 Haze, mist and visibility

- `visibilityKm` adds a grey extinction to the aerial perspective (Koschmieder: σ = 3.9 / visibility). Sea mist also
  adds a low fog layer about 50 m thick, so the dunes and horizon fade while the lineup stays clear.
- The underwater view keeps its own optics, but its light comes from the new, dimmer surface light.

### 4.8 Precipitation (Phase W2)

- **Rain shafts:** under rain cells, the cloud march includes grey precipitation curtains from cloud base to sea. You
  see them standing on the horizon on shower days, and walking toward you.
- **Rain near the camera:** GPU streak particles in a volume that follows the camera, slanted by the wind and dense in
  proportion to the rain rate, lit by sky irradiance.
- **Rain on the sea:** an animated ring-and-splash normal texture in the water's normal, scaled by rate, with a hissing
  matte look in heavy rain. Small splash sprites near the camera.
- **Drops on the lens:** occasional drops on the camera lens in rain, reusing `lensWater`.
- **Lightning:**
  - a flash lights a cell inside the cloud map for 0.1–0.4 s;
  - a branching bolt is drawn in the distance on cloud-to-ground strikes;
  - the scene's sky light jumps with the flash.
- **Thunder:** comes after the flash by distance ÷ 343 m/s.
- **Sound:** rain on water, scaled by rate; gusts in squalls. The sound system already has voice and level machinery.

### 4.9 Phase W3 (later): weather over time

- Fronts and showers pass through during a session on a weather timeline.
- A "surprise me" button picks a plausible sky for the date from the Capes' climatology and the seed.
- Squall gusts roughen patches of the sea, on the ocean spectrum.

## 5. Phases

| Phase | Delivers |
|---|---|
| **W1: Clouds and light** | The weather state, presets, moment links and panel; volumetric low/mid clouds; the high layer; the sky map; cloud shadows; cloudy sky light; exposure; visibility and mist. Everything from clear to overcast, drizzle-grey and sea mist, without falling rain. |
| **W2: Rain and storms** | Rain shafts, falling rain, rain on the sea, lens drops, lightning and thunder, rain sound. |
| **W3: Weather over time** | The session timeline, the climatology "surprise me", squall gusts on the sea. |

- **Ruling:** build W1 first, then W2, and stop there for Andrew's review.
- The drizzle, showers, rain and storm presets exist from W1 with their skies, and gain falling rain in W2.

### Budget

The 12 ft scene runs at about 4.5–5.3 ms GPU on the RTX 4060 today.
- W1 must add at most **1.5 ms** in the worst preset (showers, with the cumulonimbus tallest).
- W2 must add at most **1.0 ms**.
- Measure with the same GPU timestamp sampling as the whitewater work.

## 6. Questions for Andrew (I've ruled; overturn any)

1. **Q1: The default sky.** I set fair-weather cumulus (first scattered: too much cloud shade on the lineup at 08:15). Clear, scattered or broken, if you'd rather.
2. **Q2: Should picking "storm" or "showers" also set the wind to match** (NW gusts before a front, SW after)? Ruled
   no: weather and wind stay independent, so you can have an offshore morning under showers. A preset could offer
   "typical wind" later.
3. **Q3: A weather change during a session** (a front arriving, showers passing): parked for W3.
4. **Q4: Reference skies.** Any photos of Ellensbrook or Gracetown skies you remember (overcast grey-green sea, a
   winter front coming in, post-frontal showers) would anchor the look the way your barrel references will.

## 7. Testing

- **Unit tests (CPU):**
  - the weather state: presets, sanitising, moment links (round-trip, and old links decode as clear);
  - the cloud height profiles and the density function, mirrored on the CPU;
  - the shadow map's projection;
  - the exposure metering;
  - Koschmieder visibility.
- **GPU self-tests** (`?selftest`):
  - the sky map's radiance against the CPU density march at a few directions;
  - shadow-map transmittance against the CPU;
  - sky irradiance falls and greys as cover rises;
  - the sun disk disappears under overcast;
  - no NaN or Inf anywhere in the sky map.
- **By eye:** a sheet of every preset at 08:15 from the lineup, the channel and the drone, plus showers at sunset, set
  beside Andrew's `lefthanders-sunset.webp`. Per the *wave shape by eye* lesson: pictures, not only numbers, before
  claiming a look is done.
- **Cost:** GPU timestamps for clear, scattered, showers and overcast.
