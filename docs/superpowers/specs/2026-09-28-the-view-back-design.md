# Liquid Dreams Phase 4a ("The view back") Design

**Date:** 2026-09-28
**Authors:** Andrew and Claude
**Status:** Approved by Andrew 2026-09-28; implemented on `phase-4a-the-view-back` (plan `docs/superpowers/plans/2026-09-28-the-view-back.md`, rulings P1–P10). **Not merged.**
**Builds on:**
- the vision spec (`2026-09-25-liquid-dreams-first-light-design.md`), whose Phase 4 is "The land: beach, dunes, heath, rocks; Ellensbrook Bombie in the distance";
- Phase 1 (`2026-09-26-reef-and-sets-design.md`): the reef map, the 1D coast profile (`coastProfile.ts`, beach waterline `SHORE_X` = 190 m), the far field;
- the sky (`Sky.ts`: sun illuminance, sky irradiance, aerial perspective);
- Phase 3's whitewater (the foam map, the spray and the explosion, which the land's shadow must reach).

---

## 1. What this is

Until now there is no land. Landward of the waterline, 190 m east of the peak, a 0.5 m deep flat stands in for it, and looking back from the lineup you see sea and sky. Phase 4 builds the land in three parts, like Phase 3:

- **4a, "The view back" (this build):** the land's shape, from the waterline to the ridge and along the coast north and south; its cover and colour (sand, limestone, heath); its lighting; the ridge's shadow on the lineup at sunrise; the land in the water's reflections.
- **4b, the waterline:** swash running up the sand, the moving wet line, the shorebreak, surf lines along the distant beaches.
- **4c, up close:** individual bushes and rocks, walkable beach detail; Ellensbrook Bombie breaking in the distance.

**Andrew's answers (2026-09-28):**
- The land is mostly seen **from the lineup**: it must look right from 150 m to 15 km. Close-up detail is 4c.
- Looking back from the Womb, the skyline is **a big ridge well back**: the beach and a low foredune, then the heath climbing to a high ridge a few hundred metres inland, with the morning sun coming up over it.
- The shape comes from **real elevation data with a hand-shaped beach**.

## 2. What Andrew should see

From the lineup on the default morning (15 July, 08:15), looking east: the pale beach 190 m away with a rust-brown limestone band at the foot of the dune, then grey-green heath climbing steeply to a skyline about 7–8° high, dark and hazy against a bright sky, the sun just above it. Turning north, the coast runs away in a line of headlands and small bays toward Lefthanders, fading into sea haze; south, the same toward Ellensbrook.

Scrubbing back to 07:45, the lineup is in the land's shade: no glitter path, the water lit only by the sky, a glow along the ridge where the sun will come up. At about 08:05 the sun breaks over the ridge and the light arrives across the water. At sunset the land faces the sun and glows gold.

The water near the beach reflects the dark land below the skyline, not bright sky.

## 3. The data (findings, 2026-09-28)

**Source:** AWS Terrain Tiles (Tilezen, the `elevation-tiles-prod` open dataset, terrarium PNG: height = R·256 + G + B/256 − 32768 m). Downloaded with Andrew's permission into Claude's scratch folder, never committed:
- zoom 15 (≈ 3.97 m per pixel at this latitude): 63 tiles (x 26847–26853, y 19662–19670), 2.1 MB;
- zoom 14 (≈ 7.93 m): 20 tiles, 0.8 MB (a cross-check; not used for the bake);
- zoom 12 (≈ 31.7 m): 10 tiles (x 3355–3356, y 2456–2460), 0.18 MB, for the outer ring.

**What it shows:**
- The underlying data here is SRTM at about 30 m (smooth; no 5 m LiDAR detail). Good for the ridge and the coastline, too coarse for the beach.
- Over the sea the tiles carry a smeared band (heights between 0 and a few metres up to ~100 m offshore, and a false spit near z ≈ −1700 m). Nothing seaward of the real waterline is trusted.
- At the Womb's latitude (z = 0) the land reaches about 13 m at x = 220, 50 m at 420, 100 m at 700 and 160 m at 1260; the highest ground within the tiles is 150–200 m, 1.5–2.3 km inland.
- The real waterline is within about 10–20 m of x = 190 at z = 0. Along the coast it wanders by ±150 m over the nearest 2 km (small headlands and bays; the aerials show a headland about 2 km south), and 2–3 km north the coast swings west to about x = −500, with a bay about 3.7 km north.
- **Skyline from the lineup** (camera at (−30, 1.5, 20)): 7.9° due east (090°), 7.0° at 060°, 5.9° at 045° and 120°, 1–2° along the coast (000°–015°, 150°–165°).
- **Sunrise on 15 July:** the sun rises at about 07:28 at bearing 063° and clears the skyline (6.8° at 058°) at about **08:05**. The default 08:15 is ten minutes after the sunbreak.

## 4. Design

### 4.1 The world frame and extents

The world frame is unchanged: +X east, +Z south, y = 0 mean sea level, origin at the peak. Degrees of latitude and longitude map to metres by the local flat approximation (111,320 m per degree of latitude, × cos(lat₀) for longitude), which is exact enough over ±15 km for a view.

**Ruling L1, extents:**
- **Fine grid:** 4 m cells, x ∈ [100, 2400], z ∈ [−4000, 4000] (576 × 2001 samples).
- **Outer ring:** 32 m cells, x ∈ [−3000, 6000], z ∈ [−15000, 15000] (282 × 938 samples), used wherever the fine grid doesn't cover; the fine grid blends into it over its last 200 m.
- Beyond the outer ring there is no land; at 15 km along the coast the aerial perspective has already taken the land nearly to the haze colour. Seaward of the waterline the land is below the seabed (never drawn above the water).

### 4.2 The baked heightmap

A one-off Node script, `tools/bakeTerrain.ts`, reads the tiles from a folder given on the command line and writes `public/terrain/womb-land.bin`:
- a small header (magic, version, grid origins, spacings and sizes);
- the fine grid and the outer ring as 16-bit unsigned heights (0.05 m steps, so 0–3276 m);
- the fine grid's **real waterline** per row: x_real(z), the first x (going east from x = −800, on the zoom 15 data) where the DEM exceeds a threshold h_w, minus an offset δ. The smeared sea band (§3) rules out a low threshold: at 0.5 m the rule finds x = 80 at z = 0, about 110 m out to sea. The land behind the beach is too varied for a fixed high one: at 8 m it finds x ≈ 200 at the Womb but ≈ 500 at z = +1000, where there is a low flat behind the beach. **Ruling L8:** h_w and δ are chosen in the plan from the data so that x_real matches the satellite aerials within 30 m at three checkpoints: the Womb (x = 190 at z = 0), the small headland about 2 km south, and the bay about 3.7 km north. The checkpoints become tests of the bake.
- a text credit alongside, `public/terrain/CREDITS.md`: Tilezen/Mapzen terrain tiles, derived from SRTM (NASA) and other sources, with the tile set's attribution text.

The bake is deterministic (the same tiles give the same bytes; tested). The raw tiles are not committed.

### 4.3 The composed height

The land's height at (x, z) is composed on the CPU (`src/land/landHeight.ts`, the reference) and mirrored on the GPU (`src/land/landNodes.ts`):

1. **The waterline curve** x_s(z): the real waterline, low-passed (a 400 m moving average; no clamp, since the real coast swings about 700 m west within 3 km to the north), and pinned to exactly 190 m for |z − z_c| ≤ 600 m around the reef map's centre z_c = −75 (the reef map spans z ∈ [−450, 300]), blending over the next 400 m on each side with a smoothstep. Outside the fine grid it continues from the outer ring's own waterline, low-passed the same way.
2. **The distance inland** d = x − x_s(z).
3. **The hand-shaped beach** B(d), in metres above mean sea level (Ruling L2, from the aerials; tunable in a Land folder):
   - d < 0: below the sea (the seabed takes over, §4.4);
   - 0 ≤ d < 12: the wet sand, rising 0 → 0.8 m;
   - 12 ≤ d < 40: the dry beach, rising 0.8 → 2.5 m, gently concave;
   - 40 ≤ d < 55: the limestone band at the dune toe, a rough step up to about 6 m (noise-shaped, up to ±1.5 m);
   - 55 ≤ d < 120: the foredune face, climbing to meet the data.
4. **The data** D(x, z): the fine grid's bilinear height (or the outer ring's), with the smeared sea band removed: D is only used for d ≥ 40.
5. **The blend:** for d < 55 the height is B(d); from 55 to 120 it is mix(B, D, smoothstep(55, 120, d)); beyond 120 it is D. The result is floored at B(d) for d < 120 (the beach never dips below the sea) and is continuous everywhere (tested at every seam).
6. **Detail:** a small band-limited noise (amplitude up to 1.5 m on the heath, 0.15 m on the sand), so the 4 m and 32 m grids don't read as smooth plastic at 150–500 m.

**Ruling L3:** the real waterline is pinned straight near the Womb because the reef map, the 1D far field and the breaking model all assume the waterline at x = 190. A pin of up to ~60 m costs nothing visible from the lineup; further along the coast the real headlands and bays matter more than the pin.

### 4.4 The seabed beyond the reef map

Outside the reef map the seabed is `depthBg(x)` today, a function of x alone. Where the real coast recedes east (z = +1000: x_s ≈ 300), that would leave a 0.5 m deep lagoon in front of the land.

**Ruling L4:** outside the reef map the seabed follows the waterline curve: depth = depthBg(x − (x_s(z) − 190)). Inside the map nothing changes (x_s = 190 there by the pin). The shallows therefore always meet the sand. This change is for shading only (the seabed mesh and the water's depth-dependent colour); the wave model (the 1D far field, set waves, breaking) stays on its straight coast. Waves do not refract, break or reflect along the far coast in this build.

### 4.5 The mesh

**Ruling L5:** one static mesh, built once at load on the CPU from the composed height:
- a grid whose cell size grows with distance from the lineup (the peak): 2 m within 400 m of the beach near the Womb, 4 m to 1.5 km, 8 m to 4 km, 32 m in the outer ring;
- skirts between resolution bands (no cracks);
- heights in the vertex buffer, so the vertex stage samples no textures;
- normals from the composed height (central differences at the local cell size).

The camera moves only a few hundred metres, so a static mesh graded around the lineup is enough. The target is at most about 400k triangles.

### 4.6 The ground cover

A cover map is baked alongside the mesh (per vertex, no texture): four weights (wet sand, dry sand, limestone, heath) plus a blowout weight, from the distance inland d, the slope and noise:
- **wet sand:** d < 12;
- **dry sand:** 12 ≤ d < 40, and in blowouts;
- **limestone:** the dune-toe band (40–55), where the waterline meets rock (the inside-shelf aerial's rocks), and grey weathered outcrops on steep faces higher up (slope > 30°, noise-selected);
- **heath:** everywhere else inland;
- **blowouts:** pale sand scars where the dune face is steep and the noise says so, as in the aerials.

The fragment stage adds procedural detail (noise in world space, 1–8 m scale):
- **dry sand:** pale warm cream, low ripples of light and shade;
- **wet sand:** darker, with a faint sheen of sky (a Fresnel-weighted sky radiance);
- **limestone:** rust-brown and ochre in the toe band, weathered grey higher up, pitted;
- **heath:** a mottled mix of silver-grey (daisy-bush), olive green, pigface (green with orange tips), specks of pink (rice-flower) and dark gaps between bushes. At 2 km the mix settles into the dark olive-grey of the reference photos.

Colours are set by eye against `reference/place/` and tunable in the Land folder.

### 4.7 The lighting

The land is lit like the seabed and the water, in the same units:
- **Sun:** sunIlluminance × the sunlight map (§4.8) × a diffuse term.
- **Heath canopy:** the bushes shade each other. The heath's diffuse term darkens as the sun gets lower behind the surface as seen from the camera (a view- and sun-dependent canopy term), so the morning heath seen from the lineup, with the sun behind it, reads darker and moodier; the evening sun on its face makes it glow.
- **Sky:** skyIrradiance × the sky's visibility (a sky-view factor baked per vertex from the heightfield: gullies and hollows see less sky).
- **Aerial perspective:** the existing `applyAerialPerspective` with the fragment's distance.

### 4.8 The sunlight map (the land's shadow)

A 2D texture, the sun's visibility over the ground and the water:
- **Coverage:** x ∈ [−600, 2400], z ∈ [−4000, 4000] at 8 m (375 × 1000, r16float). Outside it the sun is unshadowed (the outer ring's shadows fall on sea too far away to matter at this resolution).
- **Content:** for each texel, march from the ground (or the sea surface) toward the sun through the composed height, up to 4 km; the visibility is the fraction of the sun's disc above the highest horizon found (the sun's angular radius plus a softening of one terrain cell's angle), so the shadow edge is soft.
- **When:** a GPU compute pass, rebuilt when the sun direction moves by more than 0.05° (about 12 s of sim time) or the conditions change. Cost target: ≤ 5 ms per rebuild.
- **Heights:** the pass marches the composed height from a height texture (the fine grid and the ring with the beach profile applied), built once at load.
- **Consumers:** the land; the water surface (sun glint and sunlit terms); the breaking ribbon's water shading; the seabed; the foam overlay; the spray and the explosion's per-puff lighting. Each multiplies its sun term by the map's value at its xz.

The CPU reference (`sunVisibility(x, z, sunDir)`) gives the tests: shade at the lineup until about 08:05 on 15 July, sun after.

### 4.9 The land in the water's reflections

The water's reflection currently samples the sky along the reflected ray. Near the beach, rays reflected below the skyline would hit the land.

**Ruling L6:** a **skyline table**, 360 entries (1° of bearing each) of (the skyline's elevation angle, the land's average radiance just below it), computed on the CPU from the composed height and the current lighting, relative to the camera's position. It is rebuilt when the camera moves more than 25 m, and its radiance is refreshed when the sun or the exposure changes. It is passed to the water as a **uniform array**, not a texture: the water's above-surface material already binds 13 of its 16 sampled textures (measured), and the sunlight map takes the 14th.

In the water's reflection: if the reflected ray's elevation is below the skyline at its bearing, the reflection takes the land's radiance (with aerial perspective for the skyline's distance), with a soft transition over 0.3° so the edge doesn't alias.

### 4.10 Depth precision

The camera's clip range is 0.05 m to 60 km on a standard depth buffer. Where the distant land meets the sea (5–15 km) the land and the water may fight for depth.

**Ruling L7:** first check it in captures. If the waterline flickers, enable three's reversed-depth option on the WebGPU renderer if the installed version has it; otherwise push the land's far outer ring a few centimetres up where it meets the sea (a polygon offset). The ruling and the measured result go in the as-built notes.

### 4.11 App, sliders and debug

- **The land:** `src/land/Land.ts`, a class owning the mesh, the material, the sunlight map and the skyline table; the App loads `womb-land.bin` at startup (fetched; the game still runs, landless, if it fails, with a console warning).
- **Land folder** (persisted with the look): the beach profile's widths and heights, the heath's mottling and colour mix, sand brightness, and `land shadow` on/off (for comparison captures).
- **Debug overlays:** `cover map` (false colours for the cover weights), `sunlight map` (the shadow over everything).
- **Reference moments:** add `sunbreak` (15 July, 08:05, facing east) and `in the shade` (07:45, facing east).

### 4.12 Cost

At the default 1080p view on the RTX 4060 Laptop, measured with the pane visible:
- the land's draw: ≤ 1 ms GPU;
- the sunlight map's rebuild: ≤ 5 ms, only when the sun moves;
- the skyline table: ≤ 5 ms CPU per rebuild, only when the camera moves 25 m or the light changes;
- the load: ≤ 1.5 s to fetch, compose and build the mesh.

**As built (measured, pane visible, RTX 4060 Laptop):**
- the land's draw: about 0.2 ms;
- the sunlight rebuild: 2.9 ms;
- the skyline rebuild: 3.7 ms;
- the load: 0.48 s;
- 641,762 triangles (plan ruling P6);
- the water's above fragment stage: 14 sampled textures, 4 uniform buffers.

All targets are met. At the default lineup the sun breaks over the ridge at 08:02.8 on 15 July (the estimate above said about 08:05).

**As built (other notes):**
- The real waterline comes from the DEM's own water-mask trough (plan ruling P2). The trough is searched only within 150 m of where the land rises; otherwise the rule takes the 3 m crossing.
- The rock toe is limestone in clumps with sand between (Andrew's inside-shelf aerial), not a continuous band.
- Reversed depth was already on; no depth fighting was seen at the far waterline (plan ruling P9).
- The existing bloom spreads the glitter path's brightness over the dark land under a low sun, as a straight-sided band. It's left for Andrew (the Picture folder).

**As built (after the final review):**
- **The sunlight map** covers x ∈ [−3000, 2408] and z ∈ [−6000, 6000] at 16 m, instead of §4.8's x from −600 and z ±4000 at 8 m. Before about 07:55 the ridge's shade reaches past x = −600, and the old edge drew a hard line on the water.
- **Past its edges,** the value fades to full sun over 1.5 km.
- **The march** reaches 6 km (56 steps), so the dawn shade covers the sea 3 km out.
- **Heights on the GPU** are full-precision, because half floats put a grazing sun's edge about 0.2° off.
- **Reflections:** water beyond a bearing's skyline point reflects no land.

**As built (Andrew's aerial review, 2026-09-28):**
- **The reef reaches the shore.** The seabed within 50–90 m of the waterline (at least 90 m along the reef map, meeting its shelf) is weedy limestone (`seabed/shoreReef.ts`), and the open coast beyond is mostly weedy rock, not sand. There are no turquoise shallows in front of the beach.
- **The waterline edge** is weedy rock along about three quarters of the coast.
- **The first dune rise** (35 m inland of the toe) is mostly sand, with about a third bush clumps and a few boulders, before the heath. The toe's clumps and the dune's bushes and boulders are drawn per pixel near the camera, so they don't follow the mesh's squares.

## 5. Files

- **New:**
  - `tools/bakeTerrain.ts` (+test), `public/terrain/womb-land.bin`, `public/terrain/CREDITS.md`;
  - `src/land/landData.ts` (+test): the file format and its parser;
  - `src/land/landHeight.ts` (+test): the waterline curve, the beach profile, the composed height;
  - `src/land/landMesh.ts` (+test): the graded mesh, the cover weights, the sky-view factor;
  - `src/land/sunlight.ts` (+test): the CPU sun visibility; `src/land/SunlightMap.ts`: the GPU pass;
  - `src/land/skyline.ts` (+test): the skyline table;
  - `src/land/landNodes.ts`, `src/land/landShading.ts`, `src/land/Land.ts`;
  - `src/land/land.selftest.ts`.
- **Changed:**
  - `coastProfile.ts` / `Seabed.ts`: the seabed follows the waterline outside the reef map;
  - `waterShading.ts`, `OceanSurface.ts`, `BreakingRibbon.ts`: the sunlight map and the skyline reflection;
  - `seabedShading.ts`, `SprayParticles.ts`, the foam overlay: the sunlight map;
  - `App.ts`, `DevPanel.ts`, `devSettings.ts`, `referenceMoments.ts`, the limits test.

## 6. Testing

**Unit tests (CPU):**
- the bake is deterministic and its header, sizes and credits are right;
- the waterline is exactly 190 m for |z − z_c| ≤ 600 m and follows the smoothed real waterline beyond;
- the beach rises steadily from the waterline and never dips below the sea;
- the height is continuous at every seam (the beach band into the data, the fine grid into the ring, mesh bands);
- the seabed outside the reef map meets the sand at every z (no lagoons), and inside the map it is unchanged;
- the sun visibility: shade at the lineup at 07:45 and sun at 08:15 on 15 July (the crossover within 08:00–08:10);
- the skyline from the lineup: 7–8.5° at 090°, 1–2.5° at 000° and 165°;
- the reflection chooses the land below the skyline and the sky above it.

**GPU self-tests:**
- the GPU composed height matches the CPU reference at sample points;
- the GPU sunlight map matches the CPU visibility at sample points;
- the limits: the land's material, the water's above and below materials, the ribbon's, the seabed's and the particles' stay within 8 storage buffers and 16 sampled textures per stage, and the sunlight map adds exactly one sampled texture to each consumer.

**Gallery** (`docs/superpowers/gallery/phase-4/`, captured with the offscreen capture):
- the lineup looking east at 07:45 (in the shade, the glow over the ridge), at 08:05 (the sunbreak) and at 08:15 (the default);
- looking north along the coast toward Lefthanders, and south;
- midday;
- sunset, the land lit gold;
- the beach and rock band from inside the reef;
- the costs.

## 7. Success criteria

- Looking back from the lineup, the land reads as the Womb's coast: pale beach, rust rock band, heath climbing to a high ridge, the coast running away north and south into haze.
- The lineup is in the land's shade until the sun clears the ridge (about 08:05 on the default date), and the light arrives across the water when it does.
- The water near the beach reflects the land below the skyline.
- The reef, the waves, the foam and the spray are unchanged apart from the land's shadow.
- The costs meet §4.12, and the texture and storage limits hold.

## 8. Not in this build

- The swash, the moving wet line, the shorebreak and surf lines along the distant beaches (4b).
- Individual bushes and rocks, walkable beach detail, Ellensbrook Bombie (4c).
- Waves refracting, breaking or reflecting along the far coast.
- The Cape to Cape track, clouds, wildlife.
