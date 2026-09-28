# Phase 4c-3: The Bombie

Spec: `docs/superpowers/specs/2026-09-28-the-bombie-design.md`. Plan: `docs/superpowers/plans/2026-09-28-the-bombie.md`.

Captured offscreen with `captureFrame()` in a wide pane. The first breaks at the moments' conditions are wave 15 at 188.5 s (8 ft) and wave 11 at 128.5 s (10 ft).

| Shot | What it shows |
|---|---|
| `01-bombie-from-the-lineup.png` | `bombie-from-the-lineup` 1 s into a burst: from the Womb's lineup (0.8 m eye), 450 m to the south-west, a small pale burst on the horizon line. It's honest for the distance: 30 m of white water at 450 m is a few pixels tall, and the swell hides the flat parts. |
| `02-the-roll.png` | `bombie-close` 15 s after the break: the white water rolling toward shore (to the right), leaving broken foam behind it back to the reef. |
| `03-bombie-close.png` | `bombie-close`, 3 s after the break: the burst over the reef from 30 m up and 120 m inshore. The 08:15 sun behind the camera lights it peach. |
| `04-overhead.png` | Noon, 250 m above the reef before the break: the mound shows as a teal oval through the water. The straight edge across the frame is the Womb's reef-map border at z = 300 (the seabed's material changes there), not the Bombie. |
| `05-small-day.png` | `bombie-from-the-lineup` at 4 ft: nothing breaks. |
| `00-sheet.png` | All of the above. |

## Measured cost

RTX 4060 Laptop, pane visible.

- **GPU** (fenced, median of 60 frames, the mesh shown versus hidden during a burst):
  - 0.07–0.13 ms at `bombie-close` (target ≤ 0.3);
  - no measurable difference at `bombie-from-the-lineup`;
  - 0 when idle (hidden).
- **CPU:** the Bombie's waves plus `burstAt` take 0.009 ms per query (target ≤ 0.05). There's one query per frame, plus one per spray tick.
- **Bindings:**
  - vertex stage: 8 sampled textures (the ocean's cascades), 3 uniform buffers and 1 storage buffer;
  - fragment stage: 2 sampled textures and 2 uniform buffers;
  - within the limits.

## Behaviour checked in the browser

- **Scrubbing time:** the burst appears and disappears exactly across a break.
- **Threshold:** at 10 ft, few bursts; at 4 ft, many.
- **The Womb's sets:** 103 bursts over 48 minutes of sim time, none on a Womb set wave.
- **Underwater:** hidden.
- **Period change** (15 → 11 s): the reef field rebuilds and τ_B follows (−36.5 → −38.5 s).

## Tuning points for Andrew

- **How it stands up** (`BombieMesh.liftNode`):
  - a plume of 2.5 × the break height that rises and falls within 5 s;
  - a foam pile of 0.5 × the break height;
  - a bore of 0.35 × the break height.
- **Break-up** (the opacity threshold and the two noise scales in `BombieMesh`): patchier or more solid.
- **How often it breaks** (`bombieModel`): the spread (0.35) and the ratio (1.8) set the odd-wave frequency. The `bombie threshold (ft)` slider moves the start.
- **Colour:** the white water is lit by its own facing. In the low morning sun it goes peach, like the rest of the scene.

## What it isn't

- No wave face or lip.
- Not surfable (atmospheric background).
- It doesn't refract the Womb's swell.
- No sound.
