# Phase 4c-1: On the beach

Spec: `docs/superpowers/specs/2026-09-28-on-the-beach-design.md`. Plan: `docs/superpowers/plans/2026-09-28-on-the-beach.md`.

All shots are from the `on-the-beach` moment (walk mode, 10:30), captured offscreen with `captureFrame()` in a wide pane. The exceptions are noted.

| Shot | What it shows |
|---|---|
| `01-on-the-beach.png` | The moment itself: standing on the dry sand in front of the Womb at (210, −40), looking north along the beach. The swash, the rock clumps at the dune toe, the wind ripples at your feet (faded where they'd alias). |
| `02-up-the-dune-face.png` | At the toe (224, −40), looking up the dune face to the east: rust limestone boulders with grounding shadows, grey boulders scattered up the rise. |
| `03-shore-rocks-in-the-swash.png` | Near the water's edge, looking out: a weed-green shore rock in the swash. |
| `04-morning-rock-shadows.png` | 09:15 at the toe, looking north: a boulder's long morning shadow across the rippled sand. Before about 09:00 the dune still shades the beach. |
| `05-lineup-unchanged.png` | `surf-from-the-lineup` at 10:30: the view from the water is as it was. The rocks 200 m away have shrunk into 4a's painted cover. |
| `00-sheet.png` | All of the above. |

## Measured cost

RTX 4060 Laptop, pane visible, at `on-the-beach`.

**GPU** (fenced frame time with each mesh hidden, median of 60 frames):
- **The fine patch:** 0.33 ms (target ≤ 0.5).
  - The first build read 0.72 ms. The coarse land cuts its square out by discarding pixels, so without the patch's depth already in place, the land and the water under the beach shaded those pixels first.
  - The patch now draws first, and its sand detail reuses the land material's noises.
- **The rocks:** 0.13 ms (target ≤ 0.5). There are about 860–890 instances in view at density 1, and about 1,490 at density 2.
- **The lineup:** the land with the hole costs the same as without it when the patch is hidden (1.31 ms, `surf-from-the-lineup` at noon).

**CPU** (browser timer resolution is 0.1 ms):
- **A patch recentre** (after 8 m of walking) costs about 1.7 ms against a target of ≤ 3: grids 0.6 ms (only the samples the new square doesn't share), shadows 0.6 ms, and the 8-bit upload 0.5 ms.
- **The rock list** is relaid every 2 m: 0.45 ms warm, and 26 ms the first time an area is entered. Frames without movement cost 0.00 ms.

**Bindings:**
- the patch uses 4 sampled textures in its vertex stage and 3 in its fragment stage, with 2 uniform buffers per stage;
- the rocks use 2 sampled textures in their fragment stage and 3 uniform buffers in their vertex stage;
- limits: 16 sampled textures and 12 uniform buffers per stage.

## Tuning points for Andrew

- **Ripples:** 0.2–0.8 cm from crest to trough, not the spec's 1.5 cm, because at 1.5 cm the sand read as corduroy. They're one constant in `landShading.ts`.
- **Rock numbers:** set by each kind's share of the cover's rock weight (toe 0.6, dune face 1, shore 0.35) in `rocks.ts`, on top of the `rock density` slider.
- **Rock look:**
  - **Undersides:** a little of the rounded underside can show on the bigger toe rocks, because the sinking is the spec's 15–30%.
  - **Lighting:** the rocks gain light bounced off the sand (`GROUND_BOUNCE` 0.45); without it, faces turned away from the sun read black.

## What it isn't

- No 3D bushes (4c-2) and no Ellensbrook Bombie (4c-3).
- No footprints, no body, no sound.
- No rock-on-rock shadows, and no rock shadows beyond the 64 m patch.
- Rocks can be stood on but not bumped into.
