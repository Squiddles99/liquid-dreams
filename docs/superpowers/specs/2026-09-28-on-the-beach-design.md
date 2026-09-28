# Liquid Dreams Phase 4c-1 ("On the beach") Design

**Date:** 2026-09-28
**Authors:** Andrew and Claude
**Status:** Approved by Andrew (2026-09-28); built on branch `phase-4c1-on-the-beach` (Native execution). See §8 for the as-built notes and the gallery at `docs/superpowers/gallery/phase-4/on-the-beach/`.
**Builds on:**
- Phase 4a (`2026-09-28-the-view-back-design.md`): the land's composed height (`LandHeight`), its cover (`coverAt`: wet, sand, rock, heath, rockGrey, weed, the toe/dune bands), the land material (`createLandMaterial`), the sunlight map;
- Phase 4b (`2026-09-28-the-waterline-design.md`): the wet line and the swash;
- the camera rig (`CameraRig`: the lineup and free modes, `Input`, `floatSpring`).

---

## 1. What this is

4a and 4b built the land as seen from the water. Up close it doesn't hold up: the land mesh is 2 m cells at the beach, the rocks are painted onto the ground, and there's no way to stand on the sand.

Phase 4c is "up close", split in three:
- **4c-1, "On the beach" (this build):** a walking camera, a fine ground patch that follows you, and real 3D limestone rocks that cast grounding shadows;
- **4c-2:** the heath's bushes in 3D;
- **4c-3:** Ellensbrook Bombie.

**Andrew's answers (2026-09-28):**
- Close-land detail comes before the Bombie.
- The close views that matter are from **standing on the beach**.
- The split above, starting with 4c-1.
- Procedural shapes, not downloaded 3D assets.

## 2. What Andrew should see

Press `C` until you're walking, and you're standing on the sand in front of the Womb, eye 1.7 m above it:
- dry sand with fine wind ripples, grit and shell flecks;
- the wet band and the swash from 4b washing up the beach;
- the rust limestone boulders at the dune toe, 1–3 m across, casting soft morning shadows on the sand;
- weed-green rocks at the waterline;
- grey boulders scattered up the dune face.

You can walk along the beach, climb the dune face, step up onto a boulder, and wade into the swash up to your waist. From the lineup nothing changes: the rocks fade into 4a's painted ground beyond 150–250 m.

## 3. Design

### 3.1 The walking camera

- **A new mode, `walk`,** joins `lineup` and `free`. `C` cycles lineup → free → walk → lineup.
  - **Entering from free:** you drop onto the ground directly below. If the water there is deeper than the wading limit, you go to the lineup instead.
  - **From walk to lineup:** you're set down in the water at your position, as free → lineup does today.
- **The ground** under you: groundAt(x, z) = max(the land's composed height, the top of any rock there). Seaward of the land's waterline, the land height is the seabed (4b made them one surface there).
- **Height:**
  - the eye sits 1.7 m above the ground;
  - it follows the ground through the existing critical spring (`stepCriticalSpring`, ω = 10), so steps onto rocks and down slopes are smooth, not jumps;
  - Space (the rise key) does nothing in walk mode.
- **Movement:**
  - WASD at 1.4 m/s, Shift (the fast key) 3×;
  - mouse-look as the other modes.
- **Wading limit (Ruling B1):** you can't walk where the still water over the ground is deeper than 1.2 m. A step that would go there is refused along that axis, so you slide along the edge. This limit is enough to stand in the swash; deeper is surfing, which is a later phase.
- **Poses and links:** `CameraMode` gains `'walk'`, and moment links parse it. A walk pose's y is informational: the height always comes from the ground.

### 3.2 The ground at your feet

- **The fine patch (Ruling B2):** a 64 m square grid at 0.25 m (257 × 257 vertices) centred on the camera, snapped to a 4 m grid so it doesn't swim. It's drawn only in walk mode, or whenever the camera is within 3 m of the ground.
- **Heights:**
  - The CPU fills a 65 × 65 texture of the land's composed height at 1 m for the square, refreshing when the camera has moved 8 m (4,225 `heightAt` calls, about 1 ms).
  - The vertex stage takes the bilinear height plus procedural detail:
    - **dry sand:** wind ripples 12 cm apart and 1.5 cm high, their crests running along the beach and wavering with noise;
    - **wet sand:** the ripples flattened by the wet share;
    - **rock or heath ground:** rougher detail, up to 4 cm.
  - The detail fades to zero within 4 m of the square's edge.
- **Hiding the coarse mesh:**
  - the land material discards its own fragments inside the square, less 0.5 m;
  - the patch has a 0.5 m skirt dropping from its edges, so the two meshes never show a crack;
  - on the edge band both are drawn, and the patch wins by depth: its detail is zero there, and it gets a tiny polygon offset toward the camera.
- **Its material:**
  - It's 4a's land material, generalised: the cover, detail and zones come from small textures for the square (65 × 65, filled from `coverAt` with the heights) instead of vertex attributes.
  - The same colours, Land folder, wet line and sunlight map apply.
  - In the fragment stage:
    - fine grit (world-space noise at 1–2 cm, a few percent of brightness);
    - shell flecks (sparse bright specks on dry sand);
    - a ripple normal, from the same ripple function as the vertex stage.

### 3.3 The rocks

- **Shapes (Ruling B3):** eight boulder meshes are generated at load. Each is:
  - a subdivided icosphere (about 640 triangles);
  - displaced by ridged noise for the limestone's lumpy, stepped look;
  - pitted by fine cellular noise;
  - flattened on the bottom 20%, and squashed vertically to 0.55–0.8 of its width.
  
  Each shape is one `InstancedMesh`.
- **Placement:**
  - a hashed grid of 4 m cells within 260 m of the camera;
  - each cell is generated from its own hash, so a rock is always in the same place, and cells are cached;
  - in each cell, up to two candidate points, each kept with probability = the rock weight there × `rock density`.
- **The kinds**, from the cover at the point:
  - **Toe clumps** (the toe band): 1–3 m across, rust to ochre;
  - **Dune-face boulders** (the dune band's boulders and 4a's outcrops): 0.5–1.5 m, grey (by `rockGrey`);
  - **Shore rocks** (weed > 0.5): 0.6–1.8 m, weed-green on top and rust beneath.
  
  Each rock gets a random shape, yaw, a small tilt, and a sinking of 15–30% of its height into the ground.
- **Look:**
  - **Colour:** the kind's colour, varied per instance, times a world-space noise;
  - **Surface:** the pitting darkens its cavities;
  - **Light:** the sun (× the sunlight map at the rock) and the sky. The bases and undersides see less sky (a base-occlusion term from local height);
  - **Haze:** aerial perspective at a distance.
- **Distance:** instances within 150 m draw fully, and from 150 to 250 m they shrink into the ground. Beyond that the painted cover (4a) stands. Only the rock bands (the toe, the dune face and the waterline, about 60 m of the coast's width) produce rocks, so there are about 1,000–1,500 instances.
- **Standing on them:** each rock's top is an ellipsoid cap (its footprint radius and height), which `groundAt` uses.

### 3.4 Grounding shadows

- **A shadow texture** for the fine patch's square: 256 × 256 (0.25 m), one channel.
- **Refreshed** whenever the patch recentres, or the sun moves more than 0.5°.
- **For each rock within the square (plus a 10 m margin):**
  - **a contact ring:** darkening within 1.3 × its footprint radius, strongest at the base;
  - **a sun shadow:** its ellipsoid projected along the sun onto the ground, with the length h / tan(elevation) capped at 12 m and a soft edge.
  
  Each rock is drawn only over its own bounding box, so it's cheap.
- **Applied:** the patch material multiplies its sun term by (1 − shadow) and its sky term by (1 − 0.5 × contact ring).
- **Not in this build:** shadows on the coarse land beyond the square, and rocks shadowing each other.

### 3.5 App, sliders, debug

- **`src/beach/`:** `walk.ts` (the walking step, pure), `groundPatch.ts` (the CPU grids), `GroundPatch.ts` (its mesh and material), `rocks.ts` (the shapes, placement and rock tops, pure), `Rocks.ts` (the instanced meshes and material), `rockShadows.ts` (the shadow texture, pure).
- **The App:**
  - builds these when the land has loaded;
  - updates the patch and the rocks each frame from the camera;
  - passes `groundAt` to the camera rig.
- **The Land folder** gains `rock density` (0–2, default 1).
- **A new reference moment,** `on-the-beach`: walk mode on the dry sand in front of the Womb at (210, −40), 10:30, facing north along the beach.

### 3.6 Cost

At the default view on the RTX 4060 Laptop, pane visible:
- the fine patch ≤ 0.5 ms GPU;
- the rocks ≤ 0.5 ms GPU;
- the patch refresh (heights, cover, shadows) ≤ 3 ms CPU per recentre;
- the rock cells ≤ 1 ms CPU per frame when the camera moves (new cells only; cells are cached).

The limits test still passes (≤ 8 storage buffers, ≤ 16 sampled textures, ≤ 12 uniform buffers per stage).

## 4. Files

- **New:** `src/beach/walk.ts` (+test), `groundPatch.ts` (+test), `GroundPatch.ts`, `rocks.ts` (+test), `Rocks.ts`, `rockShadows.ts` (+test), `beach.selftest.ts`.
- **Changed:**
  - `camera/CameraRig.ts`, `dev/momentLink.ts` (the walk mode);
  - `land/landShading.ts` (cover from textures; the discard square);
  - `land/Land.ts`, `land/landParams.ts` (rock density);
  - `app/App.ts`, `dev/DevPanel.ts`, `dev/referenceMoments.ts`;
  - the limits test.

## 5. Testing

**CPU:**
- **Walking:**
  - follows the ground (the eye settles 1.7 m above it);
  - climbs onto a rock;
  - refuses a step into water deeper than 1.2 m and slides along the edge;
  - `C` cycles the three modes;
  - from free over deep water, it goes to the lineup;
  - a walk pose round-trips through a moment link.
- **The patch:**
  - it snaps to 4 m and refreshes only after an 8 m move;
  - its height grid equals `heightAt` at its samples;
  - its cover grid equals `coverAt`.
- **The rocks:**
  - placement is deterministic per cell and independent of the camera;
  - there are no rocks where the rock weight is 0;
  - the kinds follow the cover;
  - density scales the count;
  - the rock top is highest at the centre and meets the ground at the footprint's edge.
- **The shadows:** a texel behind a rock, away from the sun, is shadowed; a texel on the sunward side is not; the contact ring is strongest at the base; a sun below the horizon casts none.

**GPU self-tests:** the patch's vertex heights without detail match the CPU grid; the land material's discard square hides the coarse mesh inside the square only.

**Limits:** the patch's and the rocks' materials, and the land's with the discard square.

**Gallery** (`docs/superpowers/gallery/phase-4/on-the-beach/`):
- `on-the-beach`;
- looking up the dune face at the toe boulders;
- close to the weed-green shore rocks in the swash;
- low sun and long rock shadows (08:30–09:00: until then the dune shades the beach);
- from the lineup (unchanged);
- the costs.

## 6. Success criteria

- You can walk the beach, climb onto boulders and wade into the swash.
- The sand holds up at your feet.
- The limestone boulders look like the reference: rust clumps at the toe, grey on the dune face, green at the waterline, with soft shadows on the sand.
- The lineup view is unchanged.
- The costs meet §3.6.

## 7. Not in this build

- 3D bushes (4c-2), Ellensbrook Bombie (4c-3).
- Footprints, sound, a visible body.
- Rock-on-rock and far-land shadows.
- Sliding down dunes, and rock collision other than standing on top.

## 8. As built

- **Files:** the GPU classes live in `GroundPatchMesh.ts` (class `GroundPatch`) and `RockMeshes.ts` (class `Rocks`). `GroundPatch.ts` and `Rocks.ts` would collide with `groundPatch.ts` and `rocks.ts` on Windows' case-insensitive filesystem.
- **Rocks (§3.3):**
  - **Count:** keep probability = rock weight × `rock density` × a per-kind share (toe 0.6, face 1, shore 0.35), in a band from 10 m seaward to 100 m inland of the waterline. Without the shares, the shore platform and the toe saturated at about 2,000 rocks, and density couldn't double them.
  - **Seating:** each rock sits on the lowest ground under its footprint, so none floats on a slope.
  - **Light:** the rock material adds light bounced off the sand.
- **The patch (§3.2):**
  - **Ripples:** in the shading normal only, since a 25 cm grid can't carry 12 cm ripples. They're 0.2–0.8 cm from crest to trough, patchy, and faded where a pixel spans half a ripple (`fwidth`) and beyond 30 m.
  - **Grit and flecks:** from one shared noise, faded by 20 m.
  - **Draw order:** the patch draws before the land (`renderOrder` −1), so the land's discard doesn't shade the pixels twice.
  - **Recentring:** a recentre reuses the samples the old square shares.
  - **Shadows:** the shadow texture is RG8 (sun shadow, contact ring).
- **App:**
  - the rocks are relaid every 2 m of camera movement;
  - a walk link opened before the land loads is walked into once the ground exists.
- **Cost (measured):** patch 0.33 ms and rocks 0.13 ms GPU; a patch recentre about 1.7 ms CPU; a rock relay 0.45 ms warm.

