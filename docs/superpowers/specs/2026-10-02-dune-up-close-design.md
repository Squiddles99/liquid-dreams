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

## 10. As built (rulings made overnight, 2026-10-02, under Andrew's delegation)

- **The sink's reach (§4.1, §7.2).** 4 cm sinking to nothing at 1.5 × a 0.45 m half-width can't stay within 1 cm per
  25 cm. The sink eases out over 1.5 m from a corridor's centreline (1.2 m beyond the clearing). The worn mask keeps
  the 1.5× shoulders.
- **Leaves (§4.2 step 3).** Solid leaf meshes of 4–12 triangles can't fill a crown within L0's caps: 2,000 two-centimetre
  leaves cover about a tenth of a daisy bush's outline. So the leafy kinds carry **leaf sprays** instead, as shipped
  games do.
  - Each spray is a card (2 triangles) showing a Blender render of 10–26 of the kind's real leaf meshes on a twig,
    from the atlas.
  - The sprays fill whatever triangles the wood and the flowers leave under the cap.
  - Their normals bend out from the crown's middle, so a bush shades as a mass.
  - **Pigface** keeps solid fleshy fingers: three-sided pyramids, 5–8 cm.
  - L0 covers its hull's outline 85–99% from the top and the side.
  - A dead shrub's bare twigs cover about 40%.
  - Pigface covers 75% from above and 55% from the side: its fingers stand 5–10 cm off trailing stems under the
    hull's 17 cm dome.

### 10.1 The full ruling log (2026-10-03)

Every decision the executor made on Andrew's behalf, as ledgered (`Task N: Ruling: <what> — <why> — <cost if wrong>`),
then the final review's rulings and deferred minors.

- Task 2: Ruling: the plan's test land added its along-coast swell only past the toe (a 0.4 m step at d = 55, which a path crossing it measured as grade 0.46) — eased the swell in over 10 m so the fixture is continuous like heightAt — cost if wrong: none to the game; the router never saw a real step
- Task 3: Ruling: spec §4.1 (4 cm sink, shoulders to 1.5× half-width) and §7.2 (≤ 1 cm per 25 cm) conflict: 4 cm over 0.68 m averages 1.5 cm/25 cm — the sink eases out to SINK_REACH_M 1.5 m from a centreline and 1.2 m beyond the clearing, while the worn (visible) mask keeps the 1.5× shoulders — cost if wrong: the dip reads a touch wider than the path; a constant to change
- Task 6: Ruling: dead shrubs grew where heath had any weight on rise-dominated ground — dead keeps only where heathW > riseW (spec: never on the dune rise) — cost if wrong: fewer dead shrubs at the rise/heath margin
- Task 6: Ruling: the mid-LOD hull capacity overflowed (1041 > 1000 on the inland heath) — LOD_CAPACITY [400, 1300, 11000] per the plan's 1.2× rule — cost if wrong: a little GPU buffer memory
- Task 7: Ruling: the plan's WorkQueue piled duplicate re-seat/LOD pushes behind the first fill (256k queued, never drained) — CellQueue keyed by cell (latest change wins, keeps its place); rings re-diff only after 2 m — cost if wrong: none found
- Task 7: Ruling: a fresh fill at 2 ms/frame took ~160 frames — over 1000 queued cells lay at 8 ms/frame (layBudgetMs), ~30 frames; walking stays 2 ms — cost if wrong: an 8 ms CPU frame for under a second after the land arrives, a teleport or a slider edit
- Task 7: Ruling: Review Focus 5's 'within 12 m in one frame' only bites after a teleport — the ring orders adds within 50 m first, then drops, then the rest; the test teleports 500 m and checks the first frame (modelled full fill 43 frames, guard 50) — cost if wrong: the far heath fills outward over ~0.7 s
- Task 7: Ruling: the plantScale shrink moved into the shader (per frame, by each instance's base: plantOrigin vec3) so far cells are laid once; three applies instancing before positionNode, so the shrink scales about the base — GPU self-test 'a plant 175 m away draws at its own base' RED (0 px) → GREEN (0.5 px off) — cost if wrong: none
- Task 7: Ruling: TrackNetwork.sinkAt returns 0 without sampling when beyond the sink's reach + 2 lattice cells (tested equal to sinkAtSlow) — heightAt with tracks had cost 3× baseHeightAt
- Task 9: Ruling: pipe-model radii made pigface's trailing stems log-thick — a per-kind max_r cap (pigface 8 mm … tall 5 cm); pipe_ok exempts capped branches — cost if wrong: none (real trailing stems don't thicken)
- Task 9: Ruling: wood alone exceeded the L0 caps (daisy 7k, rice 4.2k, dead 3.8k) — fewer, longer steps per kind and every-other-node rings on thin twigs: wood now daisy 3.7k, green 2.3k, tall 3.2k, pigface 1.4k, rice 1.4k, dead 1.8k — cost if wrong: coarser twig curves, judged at gate 1
- Task 10: Ruling: solid 4–12-triangle leaves covered ~10% of a crown within the caps (daisy 0.49 by surface) — leafy kinds carry 2-triangle spray cards showing atlas renders of real leaf meshes (SpeedTree-style), filling the triangles the wood leaves; pigface keeps solid 3-triangle fingers; spec §10 records it — cost if wrong: alpha-tested cards instead of geometry at 2–5 m (judged at gate 1)
- Task 10: Ruling: kit test thresholds — dead shrub silhouette ≥ 0.3 (bare twigs), pigface ≥ 0.75 top / 0.5 side (fingers 5–10 cm under a 17 cm hull) — cost if wrong: a looser seam check for those two kinds
- Task 10: Ruling: coverage samples each triangle's surface (a barycentric grid), not only vertices — cost if wrong: none
- Task 11: Ruling: no normal atlas (heathAtlasNormal.png) — sprays and cards shade with normals bent out from the crown's middle — cost if wrong: flatter-lit cards; add a normal pass later
- Task 11: Ruling: L1 cluster cards are rendered per kind (4 tiles, in the variant-0 slots), from many solid leaf meshes over a disc thinning to its rim, not per variant from L0 — cost if wrong: the four variants share their mid-band card looks
- Task 12: Ruling: Review Focus 3 as planned (no near kit with the patch hidden) would leave the ground bare inside the hull ring's 37 m hole — the kit always draws, seated by plantSeatY on whichever surface shows; test: 'lays near plants whether or not the patch shows' — cost if wrong: none
- Task 12: Ruling: the atlas's mips averaged spray/card alpha under the 0.5 cut (far cards vanished) — the kit's alpha is raised with the sampled mip level (×(1 + 0.35·mip)) — cost if wrong: slightly fuller far cards
- Task 12: Ruling: L1 for pigface is short crossed upright cards (flat ones vanished edge-on); the dead shrub's L1 gets bold grey twig cards over its tips (bare wood was sub-pixel at 25 m) — GPU self-test 'every kit variant draws' least 60 px — cost if wrong: none
- Task 13: Ruling: daisy bush — FIX: reads as a twiggy, sparse, dark skeleton; the photo is a dense silver-sage mass of upright shoots — bigger, denser needle sprays, lighter silver, more upright — cost if wrong: one rebuild
- Task 13: Ruling: cushion fanflower — APPROVED (dense bright mound; good up close)
- Task 13: Ruling: coast tea-tree — APPROVED with a greyer green (it reads a touch brown against the photo)
- Task 13: Ruling: pigface — FIX: reads as a dry starfish of stems with few small dark fingers; the photo is a dense mat of fat, bright, upright fingers — fatter upright fingers, brighter, more, thinner stems, bigger flowers — cost if wrong: one rebuild
- Task 13: Ruling: pink rice flower — APPROVED (small cushion); dead shrub — APPROVED (grey twig skeleton)
- Task 13: Ruling: morning backlight glowed yellow-brown — leaf translucency toned down (0.35, albedo × 1.2)
- Task 13: Ruling: candidate kinds — ADD coast cushion bush (silver-white wiry mound: distinctive, coastal) and sea spinach (low green fleshy mat); LEAVE OUT cutleaf hibbertia and cockies tongue (at 2–5 m they read like fanflower and tea-tree; each kind costs ~2.3 MB of kit) — cost if wrong: two kinds to add later
- Task 13: Ruling: tufts confirmed — knobby club-rush, coast sword-sedge, coast tussock-grass (photos 10–12)
- Task 15: Ruling: the seam test compared the wrap to the first column's step only; limestone's sharp pits step anywhere — it now compares to the largest step inside the tile — cost if wrong: none (tileable by construction)
- Task 15: Ruling: the normal/height/roughness PNG at 1024² was 12.9 MB (noise compresses poorly) — 512² (4 mm/px); colour stays 1024² — ground layers 6.9 MB — cost if wrong: softer fine relief normals
- Task 14: Ruling: gate 1 re-sheet — daisy bush APPROVED after the fix (dense silver-sage mass; sprays of 130 thicker needles, paler); coast cushion bush APPROVED (silver-white woolly mound); sea spinach APPROVED (yellow-green fleshy mat, like photo 6); pigface ACCEPTED AS IMPROVED (a denser mat of upright fingers with magenta flowers) — deferred polish: fatter, prism-shaped fingers (3× the triangles)
- Task 14: Ruling: the kit glb was 19.4 MB with 32 variants — Draco compression in the export (level 7; positions 14 bits, normals 10, UVs 12, colours 10) and three's DRACOLoader (decoder copied to public/draco: three.js's own MIT code) — 4.9 MB — cost if wrong: ~100 ms of WASM decode at load
- Task 14: Ruling: leaves keep at least half their light inside a crown (AO floor 0.5 for leaves: silver and fleshy leaves read too dark) — cost if wrong: crowns a touch flatter
- Task 17: Ruling: tracks mask 256² over the whole 64 m patch (plan: 128² over 32 m) — beyond 16 m the GPU would have lost the sink the CPU's heightAt keeps — cost if wrong: 512 KB of float texture
- Task 17: Ruling: the sink fades out at the patch's edge with the relief (CPU mirror too) — the coarse land it meets has none, so no step — cost if wrong: a track 30+ m away is 0–4 cm less sunk on screen than under a rider's feet there
- Task 17: Ruling: the mask rebuild cost 16.8 ms (4 lattice samples × 2 searches a texel) — one exact search a texel (texels are lattice points), cells no track reaches skipped, and an 8 m recentre copies the shared seven-eighths: 0.34 ms in vitest (budget 0.5); identical to a full build (test) — cost if wrong: none
- Task 17: Ruling: the track layer read as light sand — darkened to the aerial views' tan-brown (linear 0.25, 0.175, 0.105)
- Task 18: Ruling: the footprint tile's foot spanned a quarter of its width (3 cm in the 11 cm decal; 15 px in the self-test) — the foot fills the tile; GPU self-test 'footprints draw' passes — cost if wrong: none
- Task 20: Ruling: tufts take their colour from per-species colour strips in the atlas (greens across u, a brown band for heads, straw; darker at the base) — the kit's vertex colour holds AO/wind data — cost if wrong: none
- Task 21: Ruling: testLand stays in src/land/testLand.ts (created in Task 5); the scatter context's land is an interface (heightAt, waterlineAt, profile, trackNetwork) so the tests run on it — cost if wrong: none
- Task 22: Ruling: the scatter re-lays per frame from a near list (~2,100 items within 20 m, rebuilt per 1 m from cached cells) with per-item culling, like the kit, rather than per-cell slot blocks — cost if wrong: a little CPU per frame (measured at Task 25)
- Task 22: Ruling: the kit's material became kitMaterial (exported, band edges configurable) so plants, tufts and items share it — cost if wrong: none
- Task 23: Ruling: castSilhouette's yaw sign fixed to the plant instance's (local x = cos·dx − sin·dz) — the brief didn't pin it; a mirrored canopy would cast its gaps in the wrong place — cost if wrong: dapples mirrored per plant (invisible at a glance). Shadow rebuild with 240 casters 1.3 ms.
- Task 24: Ruling: the colour test compares the levels where they meet (L0 vs L1 at 12 m, L1 vs hull at 39 m), not L0 at 6 m vs the hull — L0 never meets a hull, and L0's red tips and flowers are what L1 must average — cost if wrong: a 6 m L0-vs-hull difference goes unchecked (it no longer matters on screen).
- Task 24: Ruling: the far heath keeps its brightness (the hull anchors: it matches main's far look and the painted land past 200 m); the hull takes the kit's hue through KIT_CALIBRATION, not the manifest leafColour, and the kit's L0 and L1 take per-kind gains — the kit's own levels disagreed by up to 3x, so there was no single "near colour" for the hull to take — cost if wrong: near plants are brighter than at gate 1 (L0 gains: daisy 1.27, green 2.23, tall 1.43, pigface 2.52, rice 1.93, spinach 1.79; dead 0.66, cushion 1.07); calibrated under one sun.
- Task 24: Ruling: three bugs found by the self-tests fixed in this task (they made the colour and pop tests meaningless otherwise): black atlas fringes (bleed.py, atlas re-bled in place and the build runs it), per-fragment band weights (now the plant's base), the sin-hash dither (now IGN), the alpha test behind a short-circuited dither (derivatives undefined) — cost if wrong: none known; all six heath self-tests pass.
- Task 24: Ruling: L1 gets a per-kind alpha cut sliding 12 m→40 m (KIT_L1_CUT, fitted by ?fit=1) floored at 0.45 — at 0.2 and 0.03 daisy and cushion cards drew their halo and read as grey stones — six measured allowances in the pop test (dead@12 39%, green/tall/cushion@40 12–14%, daisy/rice@12 11%) — cost if wrong: a slight thinning/thickening across a 3 m dithered band for those kinds.
- Task 24: Ruling: forceBand stays the existing 0/1 switch (not the brief's uniform(-1)) — KitMeshes and ScatterMeshes already used 0/1 — cost if wrong: none.
- Task 25: Ruling: the GPU timing is a dev harness (src/dev/duneBudget.ts, run from the console in the game) not a ?selftest — it needs the land, the tracks and every part as the game has them — cost if wrong: not in the self-test suite; re-run by hand after changes.
- Task 25: Ruling: L0 hands to L1 at 10 m, not the spec's 12 m (NEAR_M) — L0 is the costliest per plant; the Conditions camera's L0 0.66 → 0.26 ms — cost if wrong: cards rather than leaves at 10–12 m (calibrations re-fitted; the six coverage allowances re-measured at 10 m).
- Task 25: Ruling: the total (≤ 2.0 ms, Andrew's "about 2 ms") governs, met at all six poses; the plants' 1.0 sub-cap (1.18–1.64, of which the hulls' ~0.4 is main's own cost) and the beach patch's 0.5 (1.51, of which 1.38 is the patch as on main) stay over — cost if wrong: per-part caps unmet; next levers deferred (thinner L1 cards in the kit build, MID_M 40 → 35, the patch's base shading).
- Task 26: Ruling: gate-2 fix a6df4f7 — the tracks' soil colour drew a brown stripe down the dune and across the beach; on sand a trodden path is now the sand churned 10% darker, soil only through the heath — no automated test (a shader albedo; verified by re-captured frames foredune-1230 and far-beach) — cost if wrong: a path on sand reads fainter than Andrew wants.
- Task 26: Ruling: the far "before" frames (main ac2a94f) were not captured — starting a dev server for a temporary main worktree was denied by the permission classifier; the worktree and my launch.json entry were removed (junction first, main's node_modules intact) — cost if wrong: Andrew compares the far views against main himself.
- Task 26: Ruling: gallery frames saved as JPEG (quality 88, 26 frames, ~9 MB) rather than PNG — 26 1080p PNGs would add ~45 MB to the repo — cost if wrong: re-export as PNG.
- Final: Ruling: I1 the stand spot and clearing sit on a 25° bank (2.6 m drop across 7×5 m) — not fixed overnight: benching the clearing or a flatness-aware junction (which moves the stand spot) is a terrain design call for Andrew, before step 4 frames its beats — cost if wrong: step 4's crew stand on a slope.
- Final: Ruling: I2 the tracks exceed §7.2's 0.35 grade on the real land (beach path 0.73 by the junction; Cape to Cape 0.95 far south at z ≈ −3300) — not fixed overnight: it follows I1's choice (a bench or a moved junction re-routes the path); with it, a grade check on the baked land and a router that enforces it — cost if wrong: steps 5–6 walk down a 36° drop.
- Final: Ruling: (reviewer declined) the canopy silhouette's axes against the atlas and glTF — the yaw sign is derived (Task 23) and the dapple frames read plausibly; not render-verified — cost if wrong: each plant's dapples mirrored, invisible at a glance.
- Final: Ruling: (reviewer declined) the 629 ms kit prewarm if the kit arrives after play starts — the kit loads at start-up alongside the land, so the build lands in the load — cost if wrong: one 0.6 s hitch on a slow connection.
- Final: Ruling: (reviewer declined) the Blender pipeline Python beyond ground_layers.py — its output is held by kit.test's manifest checks and the GPU self-tests — cost if wrong: a rebuild could regress unseen until gate review.
- Final: Ruling: (reviewer, weaker ruling) §5's "from the lineup: frame time within noise of today's" was not measured — from the lineup (~330 m) none of the kit, scatter, footprints or patch draws; the hulls and painted land are main's — cost if wrong: an unmeasured lineup cost.
- Final: minor (deferred): the CPU surface mirror reads the nearest layer texel between vertices (rms 0.5 cm, max ~3 cm) and cached scatter cells keep heights from the patch they were laid on.
- Final: minor (deferred): any Land-folder edit, gang toggle or rider placement clears every hull; the far heath refills over ~10 frames (flicker while dragging a slider).
- Final: minor (deferred): the gang camera can sit inside Grommet when the gang is off the tracks (reach 0) — fall back to 5.5 m.
- Final: minor (deferred): three toe boulders sit in the beach path (RockField ignores the tracks).
- Final: minor (deferred): above bush density 1.45 club-rush takes every twig and stone roll on heath (1.75 for sword-sedge by limestone).
- Final: minor (deferred): stale "12 m" comments (KitMeshes.ts:10, :218; kit.ts:38) since NEAR_M became 10.
- Final: minor (deferred): no test of §7.2's "the junction sees the lineup over the laid-out plant tops" (the reviewer measured 2.4 m of clearance).
- Final: minor (deferred): plant shadows rebuild only on an 8 m recentre or a sun move, so shrubs ahead get their dapples late (pre-existing; the silhouettes make it more visible).
- Final: minor (deferred): the crew lineup's three empty placeholder meshes draw with 0 indices (a Chrome warning; from the crew work on main).
- Final: minor (deferred): the kit's L1 cards — dead, green, tall and cushion are 12–39% fuller than their neighbours at a band edge (six measured allowances); thinner cards in the kit build would close them; MID_M 40 → 35 is the next GPU lever.

### 10.2 After gate 2 (Andrew, 2026-10-03)

- **"Lift colour."** The heath floor is pale grey sand (0.32, 0.31, 0.28) with litter patches (0.13, 0.115, 0.085),
  the soil layer as detail over it. The tracks and the clearing are packed sand (0.27, 0.235, 0.18) with the track
  layer's detail, where they had been brown soil.
- **"Move the junction to flatter ground."** Of the Cape to Cape's points within 40 m of the lineup that see it, the
  junction takes the flattest clearing (a metre nearer the lineup worth 0.002 of grade). On the baked land it moved
  from (302, 45), clearing grade 0.47, to (305, 49.8), grade 0.14; the crew's ground is 0.09. Nothing on the Cape to
  Cape near the Womb is flatter that also sees the break.
- **The beach path is walkable on the real land:** at most 0.35 over any 2 m walked along it (from 0.57). Its router
  costs each step by its steepest metre, moves by knight's moves too, lays to 0.30, and keeps its switchbacks'
  hairpins when smoothed. Each foot's prints stride along its own lane.

