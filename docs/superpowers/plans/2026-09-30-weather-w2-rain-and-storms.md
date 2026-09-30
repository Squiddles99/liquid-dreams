# Weather W2: Rain and Storms, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rain that falls where it realistically falls:
- mostly once the clouds have crossed the coast, over the land;
- often not at all at the lineup under the same grey sky (Andrew, 2026-09-30).

Rain is seen as shafts on the horizon and over the dunes. At the camera it brings falling streaks, rings on the sea,
drops on the lens, lower visibility and a hiss. Storms add lightning and thunder.

**Architecture:**
- A rain field (CPU reference `rainModel.ts`, GPU mirror in `cloudNodes.ts`): the rate at world xz is the preset's
  `rain` × a rain mask × a coastal factor. The mask is cells for convective skies and broad patches for stratiform ones;
  it drifts with the weather map, and it needs cloud overhead. The coastal factor is low over the sea and full over the
  land.
- The sky march adds rain shafts below the cloud base.
- A one-thread pass writes the rate at the camera into the meter's buffer. It is read back as the exposure already is,
  and drives the haze, the particles, the lens and the sound.
- Lightning is a seeded strike schedule (CPU). A strike lights the cloud around it in the sky, lifts the sky light for
  a moment and, for cloud-to-ground strikes in view, draws a bolt. Its thunder is heard after distance / 343 m/s.

**Spec:** `docs/superpowers/specs/2026-09-30-weather-and-sky-design.md` §4.8 (with the rain-placement rule) and §5.

## Global constraints

- **No rain, no change:** with `rain = 0` and `storm = 0` every frame renders exactly as W1 does, and a self-test
  checks it.
- **The coast:** the beach runs north–south at world x ≈ 200 m (land to +x, east). Rain over the sea is at most 0.3 ×
  the rate over the land.
- **The clocks:** everything is driven by the sim clock, so moment links reproduce a strike and the rain.
- **Budget:** at most **+1.0 ms** GPU at 12 ft in the storm preset.
- **Repo rules:** commit trailer required. Branch weather-w2-rain in ../ld-weather2, port 5175. Coordinate with the
  barrel-reference session: no src/breaker, ld-barrel or reference/ edits. No merge without Andrew.

## Review focus

1. **Moving in and out of a shower:** the particles, rings, haze and sound fade in and out; they never pop.
2. **Looking at the sky while it rains:** shafts must not hide the whole dome.
3. **A strike while paused or scrubbing:** it is deterministic by sim time, with no double flash.
4. **Underwater during rain:** no rain streaks under the surface; the hiss is muffled.
5. **Cost:** particle count scales with the rate, with nothing drawn when dry.

---

### Task 1: The rain field (CPU reference)

- **Files:** create `src/weather/rainModel.ts` and its test.
- **Produces:**
  - `COAST_X_M = 200` and `SEA_RAIN = 0.3`;
  - `coastFactor(x)`: SEA_RAIN out at sea, rising across the coast (−2.5 km … +1.5 km) to 1;
  - `rainMask(cellNoise, coverage, convection)`:
    - cells (smoothstep 0.55–0.9 of the cell noise) for convective skies;
    - broad patches (smoothstep 0.3–0.7) for stratiform ones;
    - both times the cloud coverage;
  - `rainRate(w, x, cellNoise, coverage)`;
  - `rainExtinctionPerM(rate)`: 2e-3 · rate^0.6 (a downpour leaves about 2 km of visibility, drizzle about 5 km);
  - `strikesBetween(seed, storm, t0, t1)`: a seeded Poisson schedule of `{ t, bearingDeg, distanceM, cloudToGround }`;
  - `thunderDelayS(distanceM) = distance / 343`.
- **Tests:**
  - zero rain or zero coverage gives 0;
  - the land rains more than the sea (≥ 3.3×);
  - the factor is monotonic across the coast;
  - convective masks are patchier than stratiform ones;
  - extinction is 0 at rate 0 and gives about 2 km visibility at rate 1;
  - strikes are deterministic by seed;
  - the strike count is about proportional to storm and the interval, with none at storm 0;
  - strikes split exactly at any t (t0..t1 = t0..tm ∪ tm..t1);
  - the thunder delay is right.
- Commit: `feat(weather): the rain field and the storm's strikes (CPU reference)`.

### Task 2: Rain shafts, the rain at the camera, and the haze in rain

- **Files:** `cloudNodes.ts` (the `rainRateNode` mirror, and the shaft march in `marchSkyNode`), `Clouds.ts` (the
  camera rain pass into a meter buffer), `cloudMeter.ts` (reads it: `rainHere`, eased), `Sky.ts` (the haze adds the
  rain's extinction at the camera), `clouds.selftest.ts`.
- **Shafts:** between the camera and the cloud base, 16 steps:
  - density = `rainRateNode(xz) × σ_shaft`;
  - the in-scatter is the cloudy sky light / π × 0.9 plus the sun through the cloud above;
  - it composes behind the cloud march, in front of the atmosphere.
- **Self-tests:**
  - the rain rate on the GPU matches the CPU with the noise held flat;
  - with rain = 0 the sky map is identical to W1's (shafts add nothing);
  - showers put shafts on the horizon (A > 0.2 below the base in some directions, not all).
- **Vitest:** the meter eases the rain at the camera (no pops).

### Task 3: Rain on the sea

- **Files:** `src/weather/rainRipples.ts` (the TSL ring function), `OceanSurface.ts`, `waterShading.ts` (a normal
  perturbation and a roughness lift from the rain at the point).
- The rings:
  - a 2D cell grid (0.25 m cells, three offset layers);
  - each cell rings once a period at a hashed phase: an expanding ring (radius 0–12 cm) with a decaying sine profile;
  - density ∝ the rate;
  - roughness lifts slightly (the matte, hissing sea of heavy rain).
- **Self-test:** zero rain leaves the normal and the roughness exactly unchanged. By eye: rings in the near water.

### Task 4: Falling rain

- **Files:** `src/weather/RainStreaks.ts` (instanced quads in a 40 m box following the camera), App wiring.
- Each streak's position comes from its index hash and the sim time (no state): falling at 7 m/s, slanted by the
  surface wind, stretched along its motion over a 1/60 s exposure.
- Lit by the sky light, with a faint glint toward the sun. It fades where the rain field fades, and the count is
  `rainHere` × 6000, none when dry.
- Hidden under water.

### Task 5: Drops on the lens

- **Files:** `render/lensWater.ts` (a rain state: drops that land at a rate ∝ rainHere × facing into the rain, and drip
  off).
- **Vitest:** the drop count rises with rain and facing, and falls to 0 after rain stops.

### Task 6: Lightning and thunder

- **Files:**
  - `src/weather/Lightning.ts`: strikes from the schedule within the frame's sim interval; a flash envelope
    (0.2 s with 2–3 flickers);
  - `Sky.ts`: a glow term in `radiance` toward the strike, the cloud lit from inside, and a sky-light boost;
  - `src/weather/Bolt.ts`: a branching emissive line strip for cloud-to-ground strikes;
  - sound: a thunder event.
- **Vitest:** the flash envelope; the schedule over a scrub gives no double strikes.

### Task 7: Rain and thunder sound

- **Files:** `soundModel.ts` (`rain: { level, brightness }` from `rainHere` and whether the camera is over water,
  `thunder` events delayed by distance), `SoundSystem.ts` / `AudioEngine.ts` (a pink-noise loop voice for the hiss; a
  thunder one-shot: a crack for near strikes, then a long brown-noise rumble low-passed by distance).
- **Vitest:** the rain level is 0 when dry and rises with the rate; it is muffled under water; the thunder delay and
  its low-passing follow distance.

### Task 8: The look pass, the cost and the review

- Presets:
  - drizzle: stratiform, 0.2;
  - rain: stratiform, 0.5;
  - showers: convective, 0.6;
  - storm: convective, 1.
- Captures: a shower passing the lineup, rain over the dunes from the lineup, a storm at 17:00 with a strike, and
  looking down at rain on the sea.
- Cost: GPU timestamps for the storm preset.
- The full vitest suite, `?selftest` and tsc, then the final whole-branch review and its fix pass. Push, send the sheet
  to Andrew, and update memory.
