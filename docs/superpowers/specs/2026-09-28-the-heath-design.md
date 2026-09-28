# Liquid Dreams Phase 4c-2 ("The heath") Design

**Date:** 2026-09-28
**Authors:** Andrew and Claude
**Status:** Approved by Andrew (2026-09-28); built on branch `phase-4c2-the-heath` (Native execution). See §8 for the as-built notes and the gallery at `docs/superpowers/gallery/phase-4/heath/`.
**Builds on:**
- **Phase 4a** (`2026-09-28-the-view-back-design.md`):
  - the land's cover (`coverAt`: `heath`, `duneBand`, `bushes`);
  - the painted heath mottling and dune-rise bush clumps in `createLandMaterial`;
  - the sunlight map.
- **Phase 4c-1** (`2026-09-28-on-the-beach-design.md`):
  - walk mode;
  - the fine ground patch and its shadow picture (`buildRockShadows`);
  - the rock field and its placement machinery (hashed cells, cached, density).

---

## 1. What this is

4c-1 put the beach and its rocks up close. Behind them, the heath and the first dune rise are still painted: 4a's land material mottles silver daisy-bush, olive, pigface, rice-flower and dark gaps, and draws the rise's bush clumps per pixel. Nothing stands up out of the ground.

Phase 4c-2 makes the heath's plants 3D, as seen from the beach.

**Andrew's answers (2026-09-28):**
- The bushes need to hold up **from the beach**: standing on the sand or at the toe, looking up the dune rise and into the heath, within about 150 m. Standing among the bushes is not the target.
- In scope:
  - the rounded shrubs;
  - pigface mats and rice-flower mounds;
  - the dune rise's bush clumps.
  
  The grey outcrops on the steep heath stay painted.
- Approach A: lumpy procedural hulls with ragged silhouettes. Not leaf cards, and not a hull with a card shell.

## 2. What Andrew should see

Standing at `on-the-beach` and looking up past the rust boulders:
- **The dune rise:** clumps of rounded shrubs, a third of its sand.
- **The heath beyond:** crowded with knee- to waist-high silver-grey and green bushes, and the odd taller dark shrub. Their outlines are broken and twiggy against the sky, not smooth blobs.
- **Between the bushes:** pigface mats and small pink-flecked rice-flower mounds, with sandy and dark gaps.

At 08:45 from the toe (`up-the-dune`), the heath is backlit. The bushes are dark with glowing rims, and still in the dune's shadow lower down. On a Doctor afternoon they sway gently.

From the lineup, nothing changes: beyond 150–200 m, 4a's painted heath stands.

## 3. Design

### 3.1 The plants

Five kinds, from `reference/place/coastal-heath-flora.webp`:

| Kind | Height | Width | Look |
|---|---|---|---|
| Silver daisy-bush | 0.6–1.4 m | 1–2.5 m | Rounded, silver-grey, the most common shrub |
| Green shrub | 0.5–1.2 m | 0.8–2 m | Dense, bright to olive green |
| Tall shrub | 1.5–2.5 m | 2–3.5 m | Darker olive, occasional (about 1 in 15 heath shrubs), weighted up the heath (more with distance inland) |
| Pigface mat | 0.1–0.25 m | 1–3 m | Low, sprawling, scalloped edge, green with orange tips |
| Rice-flower mound | 0.3–0.5 m | 0.5–1 m | Small tight dome, green with pink flower specks |

### 3.2 Where they grow

- **The heath:** placed by the cover's heath weight net of the dune-rise bushes (`heath − bushes`).
  - Shrubs nearly touch, with sand and dark gaps between them: on average one shrub per ~5 m² of full heath.
  - The shrub mix is about 50% daisy-bush, 43% green shrub and 7% tall shrub.
  - The low layer (pigface and rice-flower, half each) fills some gaps: about one per ~12 m².
- **The dune rise:** placed by the cover's `bushes` weight, which 4a already clumps at a 7 m noise scale, so shrubs come in groups like the aerial's dark clumps on the pale rise.
  - Daisy-bush and green shrub only, with pigface around them.
  - No plants on the beach, the wet band, the toe's rock band or the shore platform (where these weights are 0).
- **Placement machinery** (as 4c-1's rocks):
  - 4 m hashed cells;
  - each cell generated from its own hash (so a plant is always in the same place) and cached;
  - several candidates per cell (shrubs and low plants separately), each kept with probability = its cover weight × share × `bush density`.
- **Avoiding the rocks:** a candidate inside a 4c-1 rock's footprint (plus 0.2 m) is dropped.
- **Each plant gets:**
  - a random shape (of its kind's four) and yaw;
  - a size within its kind's range;
  - ±15% colour variation;
  - a sinking of 15% of its height.
  
  It sits on the lowest ground under its footprint (the true height and the coarse mesh, as the rocks do).
- **Range:** 3D plants within 150 m of the camera, shrinking into the ground from 150 to 200 m. Beyond that the painted heath stands.
- **Expected numbers:** about 5,000–8,000 plants in view at `on-the-beach` and `up-the-dune` at density 1. The heath starts 50–70 m inland of those spots, so it fills about 15,000–20,000 m² of the 150 m circle.

### 3.3 Shapes

- **Generated at load:** four shapes per kind. Each is an icosphere displaced by two noises: foliage lobes (3–6 per shrub, so it isn't one ball) and small bumps. The bottom is flattened, and the shape is squashed to the kind's height/width ratio.
  - **Pigface:** a flat, wide mat with a scalloped rim.
  - **Rice-flower:** a tight dome.
  - **Tall shrub:** a taller, irregular crown.
- **Levels of detail:** three per shape, each an icosphere displaced by the same function.
  - 320 triangles (subdivision 2) within 25 m;
  - 80 triangles (subdivision 1) within 70 m;
  - 20 triangles (the base icosahedron) out to 200 m.
- **Instancing:** one `InstancedMesh` per kind × shape × level (60). Their capacities are sized for density 2. Overflow is dropped and reported in the dev readout.

### 3.4 Look

- **Ragged silhouettes:** the fragment stage discards pixels by a 3D world-space noise, the more the surface turns edge-on to the camera. The outline breaks into twiggy, leafy edges while the crown facing you stays solid. Off beyond 100 m (the edge is under a pixel).
- **Sun:**
  - a wrapped diffuse term, `max((n·l + 0.4) / 1.4, 0)` (foliage passes light round its edge);
  - times the land's sunlight map at the plant, so the dune's morning shadow falls on the bushes;
  - times self-shading: the side away from the sun and the lower interior darken, so the base reads dark and woody and the crown bright.
- **Backlight:** looking toward a low sun, light through the thin edges: a warm rim glow where the view looks into the sun and the surface is edge-on.
- **Sky and bounce:** sky light from above, less toward the base; a little bounce from the ground.
- **Sheen:** a soft silvery sheen on the daisy-bush, whose hairy leaves are why it looks grey.
- **Colour:**
  - per-kind albedo from 4a's painted palette, so near and far agree: silver-grey, olive, bright green, pigface green with orange tips, rice-flower green with pink specks;
  - per-plant variation;
  - leaf-scale noise at 5–20 cm, fading with distance.
- **Distance:** aerial perspective, as the land.
- **Wind:** a gentle sway, growing toward the crown and scaled by the conditions' wind speed (none on glass).

### 3.5 The painted layer and grounding

- **The painted layer near the camera:** the land material's painted dune-rise bush clumps and the heath's shrub mottling (silver, pigface, rice-flower) fade to a ground colour (sand, litter, dark gaps) within the plants' range, full by 150 m and gone by 200 m. That way the 3D plants don't double over painted ones. Beyond 200 m the painting is unchanged.
- **Grounding on the fine patch:** plants join 4c-1's shadow picture as shadow casters of strength 0.6 (rocks 1): a contact ring and a soft sun shadow. Pigface and rice-flower cast only the contact ring.
- **Beyond the patch:** the darker near-camera ground colour grounds them.

### 3.6 Walking

Plants don't block walking. The ground height ignores them, and you walk through them. That's enough for views from the beach.

### 3.7 App, sliders, debug

- **`src/heath/`:**
  - `plants.ts` (pure): the kinds, the shape generator, placement, and `PlantField` (cache, near, rock avoidance);
  - `PlantMeshes.ts`: the instanced meshes and the plant material.
- **The App:**
  - builds the `PlantField` when the land has loaded;
  - refreshes the plant instances every 3 m of camera movement (distance, shrink and level of detail picked on the CPU);
  - adds plants near the patch to its shadow picture.
- **The shadow picture:** `rockShadows.ts` generalises to shadow casters with a strength. Rocks keep 1.
- **The Land folder:** gains `bush density` (0–2, default 1).
- **A new reference moment,** `up-the-dune`: walk mode at the toe (about 228, −40), 08:45, facing east up the rise into the backlit heath.

### 3.8 Cost

At `up-the-dune` and `on-the-beach` on the RTX 4060 Laptop, pane visible:
- **GPU:** plants ≤ 1.0 ms.
- **CPU:**
  - plant refresh ≤ 2 ms (every 3 m);
  - first entry into an area ≤ 60 ms;
  - the patch's shadow refresh with the plants ≤ 3 ms.
- **Limits test:** still passes (≤ 8 storage buffers, ≤ 16 sampled textures, ≤ 12 uniform buffers per stage).
- **Lineup:** frame time within noise of 4c-1's.

## 4. Files

- **New:**
  - `src/heath/plants.ts` (+test);
  - `src/heath/PlantMeshes.ts`;
  - `src/heath/heath.selftest.ts`.
- **Changed:**
  - `beach/rockShadows.ts` (shadow casters with strength);
  - `land/landShading.ts` (the near-camera fade of the painted plants);
  - `land/landParams.ts` (bush density);
  - `app/App.ts`, `dev/DevPanel.ts`, `dev/referenceMoments.ts`;
  - the limits test.

## 5. Testing

**CPU:**
- **Placement:**
  - deterministic per cell and independent of the camera;
  - none on the beach, the wet band, the toe's rock band or the shore platform;
  - shrubs on the dune rise only where `bushes` > 0, clumped;
  - heath density as specified (shrubs per m² within ±25% of full heath);
  - the kind mix within ±5 points;
  - density scales the count (0 gives none, 2 gives more than 1.4×);
  - no plant inside a rock's footprint;
  - plants seated below the true ground and the coarse mesh.
- **Shapes:**
  - closed;
  - the triangle counts of each level of detail;
  - flattened bottoms;
  - each kind's height/width ratio.
- **The shadow picture:** a plant casts at 0.6 of a rock's strength; low plants cast only the contact ring; rocks are unchanged.

**GPU self-test:** the ragged-edge cut keeps a camera-facing surface solid (no discards at n·v = 1) and discards a large share at grazing angles.

**Limits:** the plant material.

**Gallery** (`docs/superpowers/gallery/phase-4/heath/`):
- `on-the-beach` looking up the dune rise;
- `up-the-dune` (backlit, 08:45);
- from the top of the rise looking inland;
- a Doctor afternoon;
- from the lineup (unchanged);
- the costs.

## 6. Success criteria

- From the beach, the dune rise and the heath read as the reference photo's heath: rounded silver and green shrubs with broken outlines, pigface and rice-flower between them.
- The backlit morning heath has glowing rims.
- Near and far agree in colour, and the hand-off to the painted heath at 150–200 m isn't noticeable.
- The lineup view is unchanged.
- The costs meet §3.8.

## 7. Not in this build

- Branch structure for close-up detail (under 3 m).
- Walking into or around bushes.
- Bushes shadowing each other or the coarse land.
- The grey heath outcrops in 3D.
- Ellensbrook Bombie (4c-3).

## 8. As built

- **Shapes:** plants are cut flat at y −0.35 of the unit sphere (every level of detail reaches it), so they are two-thirds domes.
- **Density (captures):** one shrub per 3 m² (six candidates per cell), not one per 5 m², because "nearly touch" won and one per 5 m² read as bushes dotted on sand. Above density 1, a second pass of candidates is kept at (density − 1) × the weights. The far level's meshes hold 6,000 instances.
- **Look (captures):**
  - daisy-bush sage (0.17, 0.2, 0.14);
  - a leaf-clump normal jitter and stronger leaf noise;
  - a stronger ragged cut;
  - the heath floor mostly dark litter;
  - near the camera, the dune rise's floor follows the per-vertex bush share, the same values the CPU placement reads, so the floor lies under the 3D clumps.
- **`up-the-dune`:** stands at (234, −38), pitch 8.
- **Performance:** the instance refresh writes in place and uploads only the used instances. Each plant stores its yaw's cosine and sine.
- **Final review fixes:**
  - **Shadows:** only plants within 12 m of the camera cast on the fine patch, with shadows capped at 4 m. Beyond that, the dark floor grounds them, as §3.5 already does beyond the patch. With every plant in the square casting, a rebuild on the heath took 12–35 ms.
  - **Cache:** the plant cell cache trims to 220 m once it holds 12,000 cells.
  - **Land edits:** the plant field re-places only when the rocks actually changed.
- **Cost (measured):**
  - plants 0.07–0.33 ms GPU;
  - refresh about 3.1 ms CPU every 3 m, over the 2 ms target because of the density;
  - the patch's shadow rebuild with plants 0.7–2.6 ms at a 20–45° sun, up to 3.4 ms at 5° (Node);
  - the lineup +0.065 ms.

