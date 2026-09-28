# Phase 4a: The view back

Spec: `docs/superpowers/specs/2026-09-28-the-view-back-design.md`. Plan: `docs/superpowers/plans/2026-09-28-the-view-back.md`.

Shots are from the default lineup (−25, 0.8, 45) on the default date (15 July) unless noted, captured offscreen with `captureFrame()`. This is the second set, after Andrew's aerial review. The reef platform now reaches the shore, and the first dune rise is mostly sand. The pane was wider for these, so the frames are wider than the first set's, and `03` has the sun in view.

| Shot | What it shows |
|---|---|
| `01-in-the-shade.png` | 07:45, facing east. The lineup is in the ridge's shade: no glitter, the water lit only by the sky, a glow along the skyline. |
| `02-sunbreak.png` | 08:05, facing the sun. The sun has just cleared the ridge (at the lineup it breaks at 08:02.8) and the glitter path is back. The bright straight-sided band over the land under the sun is the existing bloom spreading the glitter path's brightness, not the land (it goes with bloom strength 0). |
| `03-default-facing-east.png` | 08:15, the default moment, turned to face the land (the sun, just over the ridge, is in the wider frame). |
| `04-north-to-lefthanders.png` | 08:15, facing north. Lefthanders' headland ends the view (the coast recedes into Cowaramup Bay behind it). The speckled strip on the water is the headland's reflection at grazing angles; it stops sharply at the headland's bearing. |
| `05-south-to-ellensbrook.png` | 08:15, facing south along the coast toward Ellensbrook. |
| `06-midday-east.png` | 12:30, facing east: the pale beach, rust limestone in clumps at the dune foot, the sandy first dune rise with bush clumps, then the heath climbing to a ridge 7–8° high. |
| `07-golden-hour-land.png` | 16:50, facing east. The evening sun on the land's face: gold heath, warm sand and rock, and the land's warm reflection in the wave faces. (At 17:25 the sun is too low to light it.) |
| `08-beach-from-inside.png` | 10:30, a free camera 3 m up over the inside shelf. The shallows read weed-green: the reef platform reaches the shore (it was turquoise sand in the first set). Close-up detail is 4c. |
| `09-shadow-off.png` | `01` with the Land folder's `land shadow` off, for comparison: the glitter path appears though the land hides the sun. |
| `10-drone-over-the-beach.png` | 11:00, a free camera 140 m up over the shelf, looking down at the beach: the view to compare with Andrew's aerial. |
| `00-sheet.png` | All of the above. |

## Measured cost

RTX 4060 Laptop, pane visible, 1236 × 1351 canvas.

- **The land's draw:** about 0.2 ms (fenced frames 4.48 ms with the land vs 4.30 ms without; noisy). Target ≤ 1 ms.
- **The sunlight map's rebuild:** 2.8–3.2 ms (fenced; an empty pass costs 2.6 ms of that), only when the sun moves 0.05°. Target ≤ 5 ms. After the final review, the map covers x from −3 km and z ±6 km at 16 m and marches 6 km toward the sun.
- **The skyline table's rebuild:** 3.7 ms CPU, only when the camera moves 25 m. Target ≤ 5 ms.
- **The load:** 0.48 s (fetch, decode, compose, mesh, march heights). Target ≤ 1.5 s.
- **The mesh:** 641,762 triangles.
- **Bindings:** the water's above-surface fragment stage goes from 13 to 14 sampled textures (limit 16) and from 3 to 4 uniform buffers (limit 12).

## Data

The land's shape comes from the AWS Terrain Tiles (SRTM here); see `public/terrain/CREDITS.md`.
