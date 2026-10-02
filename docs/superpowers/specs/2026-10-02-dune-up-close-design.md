# The dune up close: heath, ground and tracks at 2–5 m (before front-door step 4)

**Date:** 2026-10-02
**Authors:** Andrew and Claude
**Status:** draft for Andrew's review, 2026-10-02.
**Builds on:**
- **Phase 4a** (`2026-09-28-the-view-back-design.md`):
  - the terrain bake and the composed height (`heightAt`);
  - the cover (`coverAt`);
  - the land material.
- **Phase 4c-1** (`2026-09-28-on-the-beach-design.md`):
  - walk mode;
  - the fine ground patch;
  - the rocks and the grounding shadows.
- **Phase 4c-2** (`2026-09-28-the-heath-design.md`):
  - the plant hulls;
  - the hashed 4 m cell placement;
  - the clearings.
- **Walking clothes** (`2026-10-01-walking-clothes-design.md`): the land spots and the gang lineup.

**Comes before:** the dune select screen (`2026-10-02-dune-select-design.md`, step 4). Both of that spec's gates are judged
over the environment this one builds. Steps 5 and 6 (the intro, walking down to the water) reuse it.

---

## 1. What this is

At the 2–5 m where the select screen holds its cameras, the crest reads as crude.
- **The ground:** a 64 m patch whose 25 cm vertices carry only 1 m data. The heath floor and the rock have nothing finer
  than about 1 m, and no normal detail at all.
- **The plants:** lumpy closed hulls with leafiness faked by shader noise. 4c-2 built them to hold up from the beach out
  to ~150 m, and said standing among them was not the target.
- **Missing:** leaves, branches, grass and sedge, soil, tracks and footprints.

This spec makes the dune hold up wherever the camera goes on it. That covers:
- real shrubs with leaves and branches;
- grasses and sedges;
- sand, soil and limestone with real surface detail;
- the walking tracks, footprints, and fallen twigs and leaves.

### 1.1 Andrew's answers (2026-10-02)

- **Reach: everywhere near the camera**, not a set-piece. It is a close-range layer that streams around the camera
  anywhere on the dune and heath, so steps 5 and 6 get it for free.
- **References:** Andrew supplies photos in `reference/dune/` (git-ignored, never committed or published). Until they
  arrive, there is `reference/place/coastal-heath-flora.webp`:
  - silver-grey daisy bushes;
  - green and orange succulent mats;
  - pink rice-flower cushions;
  - bare grey dead twigs everywhere between the shrubs;
  - a sandy track with limestone showing through.

  Andrew also gave two Google Earth views (layout only, never traced). The heath rises in one long even slope from the
  back of the beach to a ridge. The Cape to Cape runs along the slope, parallel to the beach, and the clearing is a
  tan-brown patch on it where several paths branch. Below it, sand blowouts and grey limestone outcrops line the back of
  the beach. The tracks are tan-brown soil, not white beach sand.
- **Interaction: worn tracks, no bending.**
  - Sandy footpaths are worn into the heath with footprints in them.
  - Plants keep clear of the tracks.
  - Plants move only in the wind.
  - No brushing aside, and no live footprints.
- **Budget: about 2 ms GPU** in total for the dune up close, on the RTX at 1080p. Today's ground patch and plants together
  cost about 0.7 ms.
- **Approach A:**
  - a Blender-built plant kit;
  - a ground material set;
  - a streamed near scatter.

  Not runtime-generated plants (B), and not CC0 photoscans (C). There are no scans of WA heath species, so scanned
  plants would look photoreal and wrong.
- **The walk to the Womb.** Andrew showed the real route on an aerial view. It is a layout reference only and is never
  traced (see §4.1).
  - The crew walk north up the **Cape to Cape Walk Track**, a sandy track behind the dune line.
  - They stop at a **bare sandy clearing** where a **beach path** branches west.
  - The beach path winds down through dense heath and a band of dark limestone, through a sandy gully with rock showing,
    then crosses the beach to the water's edge where they paddle out.
  - Seen from above, the heath is almost closed; sand shows only on the tracks and in blowouts.
- **The junction clearing replaces the dune crest** as the crew's spot for the select screen. §8 lists what changes in
  the step-4 spec.
- **Pristine:** no rubbish anywhere. Fallen twigs and leaves, shell fragments and loose stones are part of the place and
  stay.

### 1.2 Not in this build

- Plants bending as riders pass, and footprints that follow the riders.
- Rubbish of any kind.
- Seasons, and flowers that open and close.
- Changes to the far land beyond 200 m, other than retuning the painted heath's palette if the gate frames show it no
  longer matches (§6.2).
- Rocks other than limestone. The rust boulders on the beach keep their look.

## 2. What Andrew should see

**In the junction clearing**, at the select screen's cameras (3.8 m back and 2.3 m up; 2.35 m away at 0.95 m; 2.1 m
away at 1.35 m):
- **The clearing:** bare, packed tan-brown sandy soil scuffed with bare-foot and thong prints, a few pitted limestone stones, and
  the Cape to Cape running through it.
- **The heath round it:**
  - waist-high shrubs whose silver-grey and green leaves you can make out;
  - grey dead branches showing between the leaves;
  - a dark sandy soil under the crowns, strewn with fallen leaves and twigs;
  - knobby club-rush tussocks in the gaps;
  - pigface trailing over the ground, and rice-flower cushions in pink-white flower.
- **The view:** past the crew, down the beach path to the break.

**Walking the beach path:**
- the heath closes in on both sides;
- the path drops into a sandy gully where limestone steps break through and sword-sedge grows against the rock;
- then the foredune with coast tussock-grass;
- then open sand, prints thinning, to the water's edge.

**From the water and the beach**, the heath looks as it does today or better. The far plants take the near plants'
colours, so nothing reads as two different heaths.

Nothing pops as you walk. Shrubs gain leaves and the ground gains grain smoothly as they come closer.

## 3. Architecture

### 3.1 Offline and runtime

**Offline: Blender.** The scripts live in `tools/heath/`, following the `tools/surfer/` pattern. The launcher is
`npm run build:heath` (`tools/heath/buildHeath.ts`). It writes to `public/heath/`, and the output is committed, so
nobody needs Blender to run the game or the tests.
- **`heathKit.glb`:** every plant variant at every LOD, and every scatter item.
- **`heathKit.manifest.json`:** each variant's size, bounds, LOD triangle counts, average leaf colour, and the build
  checks (§7.1).
- **`heathAtlas.png`:** 2048². Bark, leaf colour variations, the L1 cluster cards and tuft cards (colour, normal and
  opacity), and each variant's top-down canopy silhouette.
- **Ground layers:** `groundLayers.colour.png` and `groundLayers.nrh.png`. Each holds the layers stacked 1024² apiece
  (colour; normal, height and roughness). Plus `groundLayers.height.bin`, the height channel at 256² per layer for the
  CPU.

Before Blender runs, the launcher exports today's displaced hull for every kind and shape (`plants.ts`) as JSON. The
Blender build grows each variant inside its hull (§4.2).

**Runtime: three distance bands round the camera.**

| Band | Range | Plants | Ground | Scatter |
|---|---|---|---|---|
| Near | 0–12 m | L0: full branches and every leaf | 25 cm relief, material layers, tracks, footprints | every item |
| Mid | 12–40 m | L1: main branches and leaf-cluster cards | material layers fading to today's look by 30 m | tufts as cards to 20 m |
| Far | > 40 m | L2: today's hulls (keeping their 70 m LOD switch), recoloured from the kit | today's land | none |

- Each band boundary cross-fades over 3 m with a dithered fade, so nothing pops.
- Every placement carries one kit variant, so a plant is the same plant in every band.

### 3.2 Units

| Unit | Does | Depends on |
|---|---|---|
| `src/heath/kit.ts` | loads the glb, manifest and atlas; gives each variant's LOD geometries and sizes | GLTFLoader |
| `src/heath/KitMeshes.ts` | one instanced mesh per variant and LOD; the band fades; wind; per-cell culling | `kit`, `layout` |
| `src/heath/plants.ts` (extended) | the hashed 4 m cell placement, now with a variant per plant, closed-cover density and incremental re-lay | `coverAt`, `tracks` |
| `src/heath/PlantMeshes.ts` (changed) | today's hulls, now far-band only and recoloured from the manifest's leaf colours | `kit` manifest |
| `src/heath/nearScatter.ts` | places tufts and ground items in hashed 2 m cells from the ground context | `coverAt`, `tracks`, ground heights |
| `src/heath/ScatterMeshes.ts` | the scatter's instanced meshes, culling and wind | `kit`, `nearScatter` |
| `src/land/tracks.ts` | routes the Cape to Cape, the junction and the beach path; corridor distance, the sink and the clearing | `heightAt` (base), lineup |
| `src/beach/groundDetail.ts` | the material-layer nodes for the patch: height-blended layers, vertex relief, the tracks mask | ground layers, `tracks` |
| `src/beach/Footprints.ts` | the footprint decals along the tracks and in the clearing | `tracks`, ground layers |
| `src/beach/groundHeights.ts` | the CPU copy of the layers' heights, and the patch relief exactly as the GPU computes it | `groundLayers.height.bin` |

## 4. Design

### 4.1 Tracks and the stand spot

`tracks.ts` routes three pieces once, in the land-build worker (`landBuild.ts`), with least-cost paths on a 2 m grid
over our own terrain. The cost is grade (steep is dear) plus a preference for each piece's band.

- **Never traced.** The route is rebuilt by rule from the aerial view's layout, never measured or digitised from it.
- **The Cape to Cape:**
  - runs the length of the playable coast (the 8 km fine grid's z range) behind the dune line;
  - prefers the band 50–90 m inland of the dune toe, along gentle grades;
  - is a sandy track 1.0 m wide.
- **The junction:**
  - It is on the Cape to Cape, within ±40 m in z of the lineup (`WOMB_Z`). There, eye height 1.6 m above the clearing
    sees the lineup over the laid-out heath tops: the sightline clears every plant's top by at least 0.2 m.
  - If no point qualifies, it takes the highest ground in that stretch.
  - **The clearing:** an ellipse 7 m along the Cape to Cape by 5 m across, worn bare. The riders stand on its seaward
    half, where the beach path leaves. The select screen's cameras stand inside it or over a corridor (§8).
- **The beach path:**
  - runs from the clearing down to the waterline, ending within 5 m in z of the lineup;
  - is 0.9 m wide;
  - crosses the limestone band in a sandy gully: the cover there switches to rock steps either side of the path's sand;
  - then runs straight across the beach to the water.
- **Data:**
  - each piece is a polyline with 1 m points, smoothed;
  - `tracks.distance(x, z)` gives the distance to the nearest corridor centre and the corridor's half-width;
  - `tracks.inClearing(x, z)` tests the clearing.
- **The sink:**
  - A corridor sinks 4 cm at its centre, with soft shoulders out to 1.5× its half-width. The clearing sinks 3 cm.
  - The sink is added to the CPU `heightAt` and to the GPU patch, so feet and the drawn ground agree.
  - Routing reads the height before the sink.
- **Replacing the crest:**
  - `landSpots().duneCrest` becomes the junction clearing. It is renamed `standSpot`, with `duneCrest` kept as a
    deprecated alias until step 4 lands.
  - The heading faces inland, away from the lineup, as `duneCrest`'s does: the gang faces its camera with the break
    behind them, and the select screen's beats set their own headings.
  - The crest finder (`placement.ts:101–135`) is retired.
  - The gang camera (`gang.ts`) stands on the Cape to Cape behind the riders instead of 5.5 m into the heath.
  - The gang's plant clearings are replaced by the corridors and the clearing.

### 4.2 The plant kit

**Species.** These are chosen from the Atlas of Living Australia's records near the Womb (-33.898, 114.986): within
1 km where it has them, otherwise within 5 km, keeping only the coastal limestone heath and leaving out the inland forest
and orchids. They are provisional, and confirmed at gate 1 (§6.1) against Andrew's close-ups.

| Kind (`plants.ts`) | Species | Read |
|---|---|---|
| `daisy` | coastal daisy bush (*Olearia axillaris*) | silver-grey needle leaves 1–2.5 cm; dense twiggy grey stems |
| `green` | thick-leaved fan-flower (*Scaevola crassifolia*) | bright fleshy leaves 2–4 cm with rounded tips, on a mound |
| `tall` | coast tea-tree (*Leptospermum laevigatum*), recorded within 1 km | small grey-green oval leaves 1–2.5 cm; twisted, shaggy grey trunks; 1.5–2.5 m tall |
| `pigface` | pigface (*Carpobrotus virescens*) | stems trailing over the sand; triangular fleshy fingers 4–8 cm, green going orange-red; pink flowers |
| `rice` | pink rice flower (*Pimelea ferruginea*) | a small cushion of tiny paired leaves; pink-white flower heads |

**Candidate kinds**, added only if gate 1 earns them a place. Each new kind gets its own far hull and placement weights
in `plants.ts`, like today's five.

| Kind | Species | Read |
|---|---|---|
| `hibbertia` | cutleaf hibbertia (*Hibbertia cuneiformis*) | a bright green shrub, wedge-shaped toothed leaves, yellow flowers |
| `cushion` | coast cushion bush (*Leucophyta brownii*) | a silver-white cushion of wiry stems |
| `templetonia` | cockies tongue (*Templetonia retusa*) | a grey-green shrub with rounded leaves, on limestone |
| `spinach` | sea spinach (*Tetragonia decumbens*) | a fleshy mat going orange-red; it may be the orange-green mat in the flora photo |

**Dead wood.**
- Every shrub variant carries 10–30% bare grey branches.
- One extra kind, `dead`, is a leafless grey skeleton.
- `dead` grows at 1 per 25 m² on heath. It is placed like the low plants but is never on the dune rise.

**Building a variant.** There are 4 per kind (matching `PLANT_SHAPES`) and 4 `dead`.
1. **Crown.** The variant's hull from the JSON is the crown envelope. Attractor points fill it, and branches grow into
   them by space colonisation. `pigface` grows flat: its stems trail along the ground plane, rooting at nodes, inside the
   flattened hull.
2. **Branches.** Branches are tapered tubes, 6 sides at the base down to 3 at the twigs. Radii follow the pipe model:
   r_parent² = Σ r_child². They use custom smooth normals, as the braids do.
3. **Leaves.** Leaves are small solid meshes on the twig tips, set in a spiral (`rice`: opposite pairs).

   | Kind | Leaf | Triangles |
   |---|---|---|
   | `daisy` | a narrow needle | 4 |
   | `green` | a fleshy round-tipped blade | 8 |
   | `tall` | a small oval | 6 |
   | `pigface` | a three-sided prism | 12 |
   | `rice` | a tiny leaf | 4 |

   Flowers: `rice` heads (a small dome of 16 triangles) and `pigface` flowers (a 24-triangle star).
4. **Baking.**
   - Per-vertex ambient occlusion, so the inside of the crown is darker.
   - In vertex colours: the distance from the root along the branches, normalised, for the wind. The flutter phase is
     hashed per leaf.

**Levels of detail.**

| Level | Contents | Triangle cap per plant |
|---|---|---|
| L0 | every branch and leaf | 8,000 for shrubs (`daisy`, `green`, `tall`); 6,000 for a `pigface` mat; 3,000 for `rice`; 2,000 for `dead` |
| L1 | branches thicker than 1 cm, with the leaves replaced by alpha-tested cluster cards that Blender renders from L0's leaves into the atlas | 800 |
| L2 | today's hull | 80 / 20 |

**Shading** (`KitMeshes`). One material for all variants, reading the atlas (one texture slot).
- the existing wrap lighting and backlit rim;
- thin-leaf translucency when backlit: leaves pass light through tinted by their colour;
- the baked AO;
- per-instance colour jitter of ±6% in value and ±3% in hue;
- cards use alpha to coverage, and their normals come from the atlas.

**Wind.** The sway grows with the root distance cubed, so the trunk is stiff and the tips move. A flutter on the leaves
uses the leaf phase. Both are driven by the existing wind uniform.

**Culling.** Instances are written in per-cell blocks. Every frame, a padded frustum (+15°) tests each 4 m cell, and the
visible blocks are compacted into the instance buffers. Only the ranges that changed are uploaded.

**Far recolour.** `PlantMeshes` takes each kind's leaf colour from the manifest, the leaf-area-weighted average of its L0
leaves, in place of today's hand-picked colours.

### 4.3 The ground

**The material layers** (`groundDetail.ts`). There are five layers, each 1024² tiling every 2 m. They are made by us
(baked in Blender from procedural sculpts) or CC0, and each layer's source and licence is recorded in
`public/heath/LICENSES.md`.
1. dry sand (today's ripples, grit and shell flecks carry on over it);
2. dark sandy soil with fine leaf fall;
3. pitted grey limestone cap rock with dark lichen;
4. packed track soil: tan-brown, the colour of the tracks seen from above, not white beach sand;
5. footprints: an atlas of bare-foot and thong prints, used only by the decals.

**Texture slots.** The layers are two texture arrays, colour and normal-height-roughness. With the tracks mask, the patch
gains three slots. Plan task 1 measures the patch's current count against the cap of 16 before anything else.

**Height-blended transitions.** The 1 m cover weights (wet, sand, rock, heath, and the heath floor) map to layers: sand →
1, heath floor → 2, rock → 3, corridor → 4. Where two or more have weight, each pixel takes the layer whose height plus
its weight is highest, with a 2 cm soft band. Soil then crumbles into sand at its edges, and sand pools in the
limestone's pits.

**Relief.**
- The vertex stage reads the winning layer's height and moves the 25 cm vertices by ±2.5 cm.
- Everything finer comes from the layers' normals.
- Relief fades to zero inside corridors and the clearing, which are worn smooth.
- Full detail holds to 16 m and fades to today's look by 30 m.
- `groundHeights.ts` mirrors the relief exactly on the CPU, from `groundLayers.height.bin`, for placing scatter.

**The heath floor.** Under and between shrubs, the floor is layer 2. Each L0/L1 plant's canopy silhouette sharpens the
floor mask to 0.25 m, so it darkens under each crown.

**The tracks mask.**
- On the CPU, the corridors and the clearing are rasterised into a 128² R8 mask at 0.25 m round the patch centre (32 m).
- It is rebuilt on recentre, in under 0.5 ms.
- Inside the mask, the cover becomes layer 4 and the sink applies.

**Footprints** (`Footprints.ts`).
- Prints are instanced decals: small quads conformed to the patch surface, with a depth offset, drawing layer 5's normal
  and a slight darkening.
- **Placement:** two lanes per corridor, about 2 prints per metre per lane, jittered in stride (0.6–0.8 m) and yaw (±12°).
  In the clearing, a dense scuff of 30–50 prints in random directions.
- **Ageing:** each print has a hashed age; older prints are shallower and softer at the edge.
- **Cap:** at most 600 in range.

**Limestone rocks.** The 3D rocks (`RockMeshes.ts`) within 16 m sample layer 3 by triplanar projection (projected from
all three axes), so outcrops and cap rock read as one stone. Beyond 16 m they keep today's shading.

### 4.4 The near scatter

`nearScatter.ts` lays items in hashed 2 m cells round the camera: tufts to 20 m, ground items to 12 m. Every item comes
from the kit. Items sit on `groundHeights`, sunk 1–2 cm, and take a yaw and a slope tilt from the ground's normal.

**Tufts.** 40–120 bent blades, each 3–5 segments. L0 is at most 1,200 triangles; L1 is a card from 12 to 20 m.

| Species | Read | Where |
|---|---|---|
| knobby club-rush (*Ficinia nodosa*) | round dark stems 0.3–0.8 m, brown knob heads | between shrubs on heath |
| coast sword-sedge (*Lepidosperma gladiatum*) | flat blades up to 1 m | in the gully and within 2 m of limestone |
| coast tussock-grass (*Poa poiformis*) | fine blue-grey blades in a dense tussock, 0.3–0.7 m | on sand: the foredune and the beach path's sandy end |

**Ground items:**
- fallen twigs, 10–40 cm, some branched (`daisy` and `tall` wood);
- fallen-leaf clumps of `daisy` needles and `tall` leaves;
- shell fragments on sand within 60 m of the waterline;
- loose pitted limestone stones, 3–20 cm.

**What grows where:**

| Place | Items |
|---|---|
| under a shrub crown | dense fallen leaves and twigs |
| between shrubs | club-rush, twigs, the odd stone |
| a corridor's shoulders (0.5–1.5× the half-width) | twigs and leaves kicked aside |
| a corridor's centre | bare; a stone or twig per ~10 m |
| the clearing | bare packed sand; 3–6 stones |
| the gully | sword-sedge and limestone stones |

**Drawing.** One instanced mesh per item variant, with the same per-cell culling and band fade as the plants. Tufts sway
like the leaves, more at their tips. Cells are re-laid as they enter the ring, a share per frame.

### 4.5 Plants: layout, density, re-lay and shadows

- **Variant.** Each placement hashes a variant 0–3 for its kind. Every band reads the same placement.
- **Density.**
  - Shrub candidates per 4 m cell rise until cover is near closed, as in the aerial view: about 1 shrub per 1.6 m² on
    heath (today 1 per 3 m²). The dune rise and blowouts keep today's.
  - Corridors and the clearing hold no plants.
  - The scrub sound's density reference (sound spec) is rescaled so the sound doesn't jump.
- **Incremental re-lay.** Today the whole field is re-laid every 3 m, at 3.1 ms. Instead, only cells entering a band's
  ring are laid, and cells leaving it are dropped. The work is spread over frames, with at most 2 ms in any frame.
- **Shadows.**
  - The grounding-shadow pass stamps each plant's canopy silhouette from the atlas, offset along the sun and scaled by
    the plant's height, so the near plants drop dappled shade.
  - Plants within 12 m cast, as today, and shadows are capped at 4 m.
  - The rebuild budget stays at 3 ms.

### 4.6 Loading and prewarm

- The kit loads with the land. Until it arrives, today's hulls cover every band.
- Every new material is prewarmed in the scene pass, not by `compileAsync`, which misses it.
- Every instanced mesh starts with real geometry, never empty (shader-prewarm lessons).
- **Disk:** at most 30 MB for `public/heath/` in total.

## 5. Budgets

On the RTX 4060 Laptop at 1080p, from the select-screen cameras in the clearing and from three points on the beach path
(the gully, the foredune, the beach):

| | Cap |
|---|---|
| Plants, all bands | 1.0 ms GPU |
| Ground patch | 0.5 ms GPU |
| Scatter | 0.4 ms GPU |
| Footprints | 0.1 ms GPU |
| **Total, dune up close** | **2.0 ms GPU** |
| Re-lay and culling, worst frame | 2 ms CPU |
| Tracks mask on recentre | 0.5 ms CPU |
| Track routing, at land build (worker) | 500 ms |
| Shadow rebuild | 3 ms CPU |
| From the lineup | frame time within noise of today's |

## 6. Gates

### 6.1 Gate 1: the species sheet (before the full kit)

- **What's built:** one variant per species and per tuft species, at L0, plus the dead skeleton.
- **What Andrew sees:** a sheet that renders each at 1–3 m in morning and midday light, beside his `reference/dune/`
  photos.
- **Outcome:** he approves or redirects each one, which also settles the species list. The rest of the kit is built only
  after this gate.

### 6.2 Gate 2: the dune up close (the end)

1080p frames from:
- the step-4 beat cameras in the clearing;
- the beach path's gully, foredune and beach;
- the Cape to Cape 20 m either side of the junction;
- morning, midday and late light.

Beside them, before-and-after frames of the far view from the lineup and from the beach.

It passes when Andrew judges the dune no longer crude and reading as the pristine heath of his photos, with the far view
no worse.

## 7. Testing

### 7.1 Build checks

These are written into `heathKit.manifest.json` by the Blender build and asserted by `src/heath/kit.test.ts`.

**For every variant:**
- **Triangle caps:** L0 and L1 are within their caps (§4.2).
- **Leaves attached:** every leaf's base is within 1 cm of a twig.
- **Pipe model:** no branch is thinner than √(Σ r_child²) − 0.5 mm.
- **Silhouette:**
  - L0 covers at least 85% of its hull's top and side projections;
  - at most 5% of L0's vertices lie outside the hull grown by 10%.
- **Normals:** none are NaN or zero length; the shared-split share is under 0.001, as the surfer `normalSplit` check is.
- **AO:** the baked occlusion is in [0.15, 1].

**For every tuft and item:** its triangle cap, and its bounds within its spec.

### 7.2 Unit tests (vitest)

- **`tracks.test.ts`:**
  - routing is deterministic for the same land;
  - the corridor grade is at most 0.35 (walkable) over any 2 m;
  - the junction sees the lineup at 1.6 m over the laid-out plant tops, clearing each by at least 0.2 m;
  - the beach path ends within 5 m in z of `WOMB_Z` at the waterline;
  - the sink in `heightAt` changes by no more than 1 cm per 25 cm;
  - `standSpot` is in the clearing and faces inland, away from the lineup.
- **`plants.test.ts` (extended):**
  - each placement's variant is the same whichever band asks;
  - density is within ±25% of target, and closed cover on heath;
  - no plant's trunk is in a corridor or the clearing;
  - an incremental re-lay over a 200 m walk gives exactly the full re-lay's layout;
  - no frame lays more than its share of cells.
- **`nearScatter.test.ts`:**
  - each item appears only in its places (§4.4 table);
  - corridor centres are bare beyond 1 item per 10 m;
  - each item's height matches `groundHeights` within 2 cm of its sink.
- **`groundHeights.test.ts`:** the CPU relief matches a reference decode of the layer PNG within 1 mm.
- **`Footprints.test.ts`:**
  - stride and lane spacing;
  - at most 600 in range;
  - none outside a corridor or the clearing.
- **Limits (`BreakingRibbon.limits.test.ts`, extended):** the patch, land, kit and scatter shaders stay within 16 sampled
  textures, 12 uniform buffers and 8 storage buffers per stage.
- **`placement.test.ts` (changed):** the crest-finder cases give way to the stand-spot cases above.

### 7.3 GPU self-tests (`?selftest=heath`)

- **Everything renders:** every variant, tuft and item at every LOD draws pixels.
- **Heights:** the patch heights, with the new relief and the sink, match the CPU within ±1 mm (extending
  `beach.selftest.ts`).
- **No pop:** a plant's rendered coverage changes by at most 10% across each band boundary, measured 0.5 m either side.
- **Colour match:** each kind's L0 average rendered colour and its recoloured hull differ by at most 0.05 in each
  channel, rendered at the same distance and light.
- **Timing:** GPU timestamps per part against §5, at the beat cameras and the three beach-path points.

## 8. Changes to the step-4 spec (`2026-10-02-dune-select-design.md`)

These are applied when this spec is approved.
- **§1:** "footprints and litter" becomes "footprints, and fallen twigs and leaves (no rubbish: the place is pristine)".
  The spot becomes the junction clearing on the Cape to Cape above the Womb.
- **§4:**
  - "the gang lineup on the dune crest (`landSpots().duneCrest`)" becomes "in the junction clearing
    (`landSpots().standSpot`)";
  - the three shots keep their distances and heights;
  - the Conditions shot's camera (3.8 m behind the riders) stands in the clearing or over the Cape to Cape.
- **§15 tests (`beatCamera`):** "outside the heath" becomes "the camera's ground point is inside the clearing or a
  corridor (`tracks`)".

## 9. Files

- **New, tools:** `tools/heath/`:
  - the launcher `buildHeath.ts`;
  - `build.py`, `grow.py` (space colonisation and the pipe model), `leaves.py`, `lods.py`, `tufts.py`, `items.py`,
    `ground_layers.py`, `atlas.py`, `export.py`;
  - `README.md`.
- **New, assets:** `public/heath/` (§3.1) and its `LICENSES.md`.
- **New, src:**
  - `src/heath/kit.ts`, `KitMeshes.ts`, `nearScatter.ts`, `ScatterMeshes.ts`;
  - `src/land/tracks.ts`;
  - `src/beach/groundDetail.ts`, `groundHeights.ts`, `Footprints.ts`;
  - and their tests.
- **Changed:**
  - `src/heath/plants.ts`, `PlantMeshes.ts`, `clearings.ts`;
  - `src/beach/GroundPatchMesh.ts`, `groundPatch.ts`, `RockMeshes.ts`, `rockShadows.ts`;
  - `src/land/landHeight.ts`, `landBuild.ts`, `landShading.ts`;
  - `src/surfer/placement.ts`, `gang.ts`;
  - `src/app/App.ts`, `src/dev/DevPanel.ts` (the spot button);
  - `package.json` (`build:heath`).
