# Liquid Dreams Phase 4c-3 ("The Bombie") Design

**Date:** 2026-09-28
**Authors:** Andrew and Claude
**Status:** Approved by Andrew (2026-09-28); built on branch `phase-4c3-the-bombie` (Native execution). See §8 for the as-built notes and the gallery at `docs/superpowers/gallery/phase-4/bombie/`.
**Builds on:**
- **Phase 3:** the water surface model (`WaterSurfaceModel.displacement`), the sets (`sets.ts`), and the spray system (`SprayParticles`, impact kind).
- **Phase 4a:** the sunlight map and the land.
- **Phase 4b** (`2026-09-28-the-waterline-design.md`): the surf model (`surfModel.ts`: the far field's arrival times along the coast, the set and lull heights).
- **Phase 4c-2** (`2026-09-28-the-heath-design.md`).

---

## 1. What this is

The vision spec's Phase 4 ends with "Ellensbrook Bombie in the distance". The Bombie is the big-wave reef just south-west of the Womb, the one "you walk past from the car park" (the "big wave spot"). It holds 15–20 ft, breaks left and right, and needs a big swell.

In the game it is **atmospheric background**. On a big day, out past the Womb's lineup, the odd wave explodes into white water and spray. It is never surfable.

**Andrew's answers (2026-09-28):**
- **Position:** look it up. The sources put it about 400 m south of the Womb. Andrew confirmed it breaks **400–500 m from the Womb's peak, and well out to sea**.
- **Look:** white water only, with no face or lip.
- **When:** only on big days (6 ft and up).
- **Timing:** "typically you wouldn't see it at the same time as a Womb set": the Bombie is broken by different waves.
- **Approach B:** a separate white-water mesh (not the coastal surf shader, and not the foam field).
- **Never surfable:** it's atmospheric background.

**Sources (2026-09-28):**
- [SurfSpots.co: The Womb](https://www.surfspots.co/spot/the-womb): the Womb is "approximately 400 metres north of Ellenbrook Bombie".
- [FreoLongBlack's spot list](https://freolongblack.com/?page_id=5416): the Bombie is "capable of throwing up waves in the 15-20 foot range", breaks left and right, and suits south-west or west swell with an easterly wind.
- [surf-forecast](https://www.surf-forecast.com/breaks/Ellensbrook).

## 2. What Andrew should see

**From the Womb's lineup on an 8 ft morning, looking south-west:** every so often, and not with the Womb's sets, a wave out on the horizon line bursts white.
- The burst is a patch of white water 30–60 m wide, with spray thrown 5–15 m up (about 2° tall at 450 m).
- The offshore easterly blows the spray back out to sea.
- The white water then rolls toward the shore as a thinning band and is gone within about 40 s.

**At 4 ft:** nothing, just the dark shape of the reef from above.

**At 12 ft:** it goes off on about half the waves.

## 3. Design

### 3.1 The place

- **Position:** the reef is centred at (−300, +340) in world metres (x east, z south; the Womb's peak at the origin). That's about 450 m south-west of the peak and about 490 m off the beach, well outside the lineup.
- **Shape:** an oval limestone mound about 80 × 50 m, its long axis across the incoming swell (along the crests). Its crest is 5 m below mean sea level, rising from the surrounding bed (15–18 m deep there).
- **Seabed:** the mound is added to the seabed height outside the Womb's reef map (`bedHeightAt` and the seabed's rendering there), so it reads as a dark patch in overhead and drone views.
- **Nothing else changes:** the far field, the Womb's breaking and 4b's surf band stay as they are. The Bombie doesn't refract the swell.

### 3.2 Its waves (`src/bombie/bombieModel.ts`, pure)

- **Arrival:** wave n reaches the Bombie at τ_B + n·T. τ_B is the far field's arrival time at the Bombie; T is the swell period.
- **Size:** each wave n has its own size factor, drawn from its own hash (independent of the sets): f_n = exp(0.35 · g_n), with g_n a standard normal. Most waves sit near 1; the odd one is much bigger.
- **The break rule:** wave n breaks when Hs · f_n ≥ 1.8 × Hs(threshold). Hs(threshold) is the significant height of a `bombie threshold` swell, 6 ft by default. The result:
  - never below the threshold;
  - about 5% of waves at 6 ft (roughly one every five minutes at T = 15 s);
  - about half at 12 ft.
- **Keeping off the Womb's sets:** a wave that the surf model marks as a Womb set wave never breaks the Bombie.
- **`burstAt(t)`** returns the latest break within the last 40 s: `{ ageS, heightM }`, with heightM = 0.55 · Hs · f_n (the surf model's breaking-height factor), or null.
- **Deterministic:** the same waves whatever the camera, from the conditions' seed and the sim time.

### 3.3 The white water (`src/bombie/BombieMesh.ts`)

- **Geometry:** a 180 × 180 m grid (64 × 64 cells, ~2.8 m) around the reef, extending shoreward (toward the east-north-east).
- **Riding the sea:** the vertices use the ocean's displacement node (`WaterSurfaceModel.displacement`), the same as the Womb's breaking wave, lifted 5 cm.
- **The material:** transparent foam that doesn't write depth and draws after the sea. Its coverage is a function of the burst's age and height:
  1. **The burst:** an oval of white water over the reef, growing to its full width in 3 s. Full width is 30 m at a 6 ft-threshold wave, up to 60 m at twice that height.
  2. **The roll:** a band moving shoreward at 4 m/s from the reef's inshore edge, thinning and breaking up as it goes.
  3. **The fade:** out by 40 s.
- **Edges and texture:** two-scale noise breaks up the edges and the interior.
- **Lighting:** lit like the water's foam (sun × the land's sunlight map, sky, aerial perspective).
- **Idle cost:** the mesh is hidden when there's no burst, and underwater.

### 3.4 Spray

At each burst's start, the existing spray system's impact kind fires along the burst's line across the reef:
- the count and launch speed scale with the wave height, giving plumes 5–15 m high;
- × `bombie size`;
- the wind carries them, as it does the Womb's spray.

### 3.5 App, sliders, debug

- **The App:**
  - asks the model for the current burst each frame;
  - drives the mesh's uniforms;
  - feeds the spray at a burst's start through the existing spray tick.
- **A new `Bombie` folder:**
  - `bombie` (on/off, default on);
  - `bombie size` (0.5–2, default 1): scales the white water and the spray;
  - `bombie threshold (ft)` (4–10, default 6).
- **Two new reference moments:**
  - `bombie-from-the-lineup`: the Womb's lineup at 08:15, facing south-west, 8 ft swell, the sim time chosen 4 s after a Bombie break;
  - `bombie-close`: a free camera 30 m up, 120 m inshore of the reef, facing it, 10 ft swell, 3 s after a break.

### 3.6 Cost

On the RTX 4060 Laptop, pane visible:
- **GPU:** ≤ 0.3 ms during a burst, 0 when idle.
- **CPU:** the per-frame burst query ≤ 0.05 ms.
- **Limits test:** still passes (≤ 8 storage buffers, ≤ 16 sampled textures, ≤ 12 uniform buffers per stage).

## 4. Files

- **New:**
  - `src/bombie/bombieModel.ts` (+test);
  - `src/bombie/BombieMesh.ts`;
  - `src/bombie/bombie.selftest.ts`;
  - `src/bombie/bombieParams.ts` (+test).
- **Changed:**
  - `seabed/bathymetry.ts` (the mound outside the reef map) and its seabed rendering;
  - `app/App.ts`, `dev/DevPanel.ts`, `dev/referenceMoments.ts`;
  - the spray emitters (a Bombie burst source);
  - settings persistence (the Bombie params);
  - the limits test.

## 5. Testing

**CPU:**
- **Breaking:**
  - never below the threshold;
  - the break fraction rises with the swell (2–10% at 6 ft, 35–65% at 12 ft over many waves);
  - never on a Womb set wave;
  - deterministic.
- **`burstAt`:** the latest break for 40 s, then null; its height is 0.55 · Hs · f_n.
- **The mound:**
  - 5 m below mean sea level at the crest;
  - no effect beyond its edge;
  - `bedHeightAt` includes it outside the reef map.
- **The params:** normalised, defaults, and in the panel.

**GPU self-test:** the mesh's vertex heights match the ocean displacement at sample points.

**Limits:** the Bombie material.

**Gallery** (`docs/superpowers/gallery/phase-4/bombie/`):
- `bombie-from-the-lineup`;
- the roll 15 s later;
- `bombie-close`;
- overhead (the dark reef);
- a 4 ft day (nothing);
- the costs.

## 6. Success criteria

- On a big day, from the Womb's lineup, the Bombie reads as a heavy reef going off out past the lineup: white bursts and spray on their own waves, not the Womb's sets.
- On a small day nothing breaks there.
- The Womb, its surf and the lineup views are otherwise unchanged.
- The costs meet §3.6.

## 7. Not in this build (or ever)

- A wave face or lip at the Bombie.
- Surfing it: it is atmospheric background.
- The Bombie refracting or shadowing the Womb's swell.
- Sound (a later phase).

## 8. As built

- **The bed:** at the Bombie it is about 25 m deep (the coast profile), not 15–18 m, so the mound rises from about 25 m to 5 m.
- **Threshold:** "never below the threshold" is a hard cut-off.
- **The white water stands up** (captures): a flat sheet 450 m away lies behind the swell crests from the lineup's eye. The mesh's vertices lift with the foam:
  - a plume of 2.5 × the break height, rising in 0.6 s and falling by 5 s;
  - a foam pile of 0.5 × the break height, decaying by 20 s;
  - a bore of 0.35 × the break height on the roll.
  
  That's still white water only, with no face or lip.
- **Look** (captures):
  - the foam floats 0.3 m above the sea;
  - it's lit by its own facing (screen-space normal, wrapped diffuse);
  - the burst starts at 40% of its width, with a noise-roughened outline;
  - the roll leaves from the burst's edge, trailing broken foam;
  - shape and noise add, so it frays and thins with age.
- **The moments** break at 188.5 s (8 ft) and 128.5 s (10 ft) at the default field; `bombie-from-the-lineup` is at 192.5 s and `bombie-close` at 131.5 s.
- **Cost (measured):** 0.07–0.13 ms GPU during a burst up close, 0 when idle; 0.009 ms CPU per query.

