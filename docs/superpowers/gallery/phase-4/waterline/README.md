# Phase 4b: The waterline

Spec: `docs/superpowers/specs/2026-09-28-the-waterline-design.md`. Plan: `docs/superpowers/plans/2026-09-28-the-waterline.md`.

All shots use the reference set of `surf-from-the-lineup` (the biggest wave's bores reaching the shore), captured offscreen with `captureFrame()`. The pane was wide.

| Shot | What it shows |
|---|---|
| `01-surf-from-the-lineup.png` | 10:30, 5 m above the lineup (the top of a swell), facing the beach: a band of white water along the whole beach, the Womb's own breaking foam on the left. At the moment's own 08:15 the sun is in frame and the beach is in the dune's shade. |
| `02-swash-close.png` | 10:30, a free camera 2 m up over the platform just off the beach: a bore arriving, white swash at the sand. |
| `03-wet-line.png` | The same camera 8 s later: the water back, the swash film and the wet band along the sand. |
| `04-north-surf-band.png` | 08:15 from 5 m up, facing north: the surf band at the foot of Lefthanders' headland. |
| `05-south-surf-band.png` | The same facing south. |
| `06-surf-off.png` | `01` with the Surf folder's `surf` off: calm water to the sand. |
| `07-drone-over-the-surf.png` | 10:30, the 4a drone view: the swash lace along the waterline, foam across the platform. |
| `08-oblique-over-the-platform.png` | 10:30, 22 m up over the shelf: white water over the platform toward the beach. |
| `00-sheet.png` | All of the above. |

## Measured cost

RTX 4060 Laptop, pane visible.

- **CPU:** the surf's per-frame update is 0.0005 ms steady (0.04 ms when the height table rebuilds on a new wave or an edit); the τ table is 0.24 ms per field change. Targets ≤ 0.2 ms and ≤ 5 ms.
- **GPU:** not separately measurable. The `surf` switch only zeroes the result (the shaders still evaluate), and fenced frames with it on and off differ by 0.06 ms, within noise. The whole frame at noon facing the beach read about 1.25 ms on the overlay.
- **Bindings:** the water's above-surface material stays at 8 (vertex) and 13 (fragment) sampled textures, and goes to 5 uniform buffers per stage (limit 12).

## What it isn't

White water only: no breaking faces along the coast; no rips, setup or sandbars; no foam left on the sand; no sound.
