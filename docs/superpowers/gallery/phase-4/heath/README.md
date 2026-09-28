# Phase 4c-2: The heath

Spec: `docs/superpowers/specs/2026-09-28-the-heath-design.md`. Plan: `docs/superpowers/plans/2026-09-28-the-heath.md`.

Captured offscreen with `captureFrame()` in a wide pane.

| Shot | What it shows |
|---|---|
| `01-on-the-beach.png` | 10:30 from the dry sand at (210, −40), looking north-east up past the toe rocks: shrub clumps on the dune rise, and the heath along the top. |
| `02-up-the-dune.png` | The `up-the-dune` moment at 08:45: the rise still in the dune's shadow, dark shrub clumps and pink rice-flower mounds on it, and the sunlit heath along the skyline. |
| `03-top-of-the-rise.png` | 10:30, standing among the plants at the top of the rise (285, −40), looking inland. Up close (the spec's target is from the beach), the shrubs are ragged-edged lumps: sage daisy-bushes, green shrubs, a dark litter floor. |
| `04-doctor-afternoon.png` | 16:00 with a 9 m/s south-westerly, from partway up the rise. The shrubs sway (not visible in a still). The straight dark band down the sand looks like a coarse cell of 4a's sunlight map under the low western sun; it isn't from this branch, and I didn't investigate it. |
| `05-lineup-unchanged.png` | `surf-from-the-lineup` at 10:30: the view from the water is as it was (plants beyond 200 m aren't drawn). |
| `00-sheet.png` | All of the above. |

## Measured cost

RTX 4060 Laptop, pane visible. GPU is fenced frame time with the plants hidden and shown, median of 60 frames.

| View | Plants drawn | Plants' GPU cost |
|---|---|---|
| `on-the-beach` | 15,900 | 0.07–0.13 ms |
| `up-the-dune` | 19,800 | 0.26–0.33 ms |
| Inland, 60 m up | 52,000 | 0.33 ms |

The target is ≤ 1.0 ms.

- **The lineup:** 1.376 ms at noon, against 4c-1's 1.311 ms. That's +0.065 ms, probably the heath floor's noise, which is evaluated for every land pixel.
- **CPU:**
  - **A plant refresh** (every 3 m) costs about 3.1 ms at `up-the-dune`: 1.4 ms to gather the nearby plants and 1.7 ms to lay out 25,500 instances. That's over the 2 ms target, because the capture-driven density (one shrub per 3 m²) added about 60% more plants.
  - **First entry** into an area is 51–57 ms (Node).
- **Bindings:** the plant material uses 2 sampled textures and at most 3 uniform buffers per stage. The far level's 6,000-instance meshes keep their matrices in instanced vertex attributes.

## Tuning points for Andrew

- **Density:** one shrub per 3 m² (the shrubs nearly touch) and one low plant per 12 m², in `plants.ts`.
- **Colours:**
  - daisy-bush sage (0.17, 0.2, 0.14), because 4a's silver-grey read as stone in 3D;
  - the heath floor is mostly dark litter.
- **Ragged edges:** the cut's strength and scale are in `PlantMeshes.ts` (`raggedKeepNode`, `edgeN`).
- **The `up-the-dune` moment:** stands at (234, −38), because rocks blocked the view from (228, −40).

## What it isn't

- No branches for close-up detail.
- You can't walk into or around bushes.
- Bushes don't shadow each other or the coarse land.
- The grey heath outcrops stay painted.
- No Ellensbrook Bombie (4c-3).
