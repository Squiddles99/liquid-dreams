# Phase 3a gallery: the foam field

All frames use the reference set from `behind-the-wave` (4.65 ft, 15 s from 225°, seed 2002, 08:15, wind 22 km/h from 57°), paused, at the listed seconds after that moment. They use the default foam settings: a 10 s clear time and 0.4 m/s of drift. The captures render offscreen (`captureFrame`), so they are exact frames of the sim time.

## From above (camera 110 m over x 40, z 20, looking straight down; north is up, the beach is off to the right)

- `00-top-sequence-sheet.png`: the six frames below on one sheet.
- `01-top-minus-6s.png`: a wave throws along the reef's south-west edge. The previous wave's foam is still thinning inshore, top right.
- `02-top-minus-2s.png`: the section has collapsed into a bore, and dense foam trails behind it.
- `03-top-plus-2s.png`: the bore runs in over the shelf, leaving a wide field of foam behind it.
- `04-top-plus-6s.png`: the bore has gone north-east, and its foam stays behind on the water, breaking into patches as it thins.
- `05-top-plus-10s.png`: the next wave throws. The last wave's foam is mostly patches now, inshore.
- `06-top-plus-14s.png`: its bore collapses. The earlier foam is nearly gone, cleared about 10 s after the bore passed.
- `07-top-plus-6s-foam-map-overlay.png`: the `foam map` debug overlay (Reef folder). The map's density is tinted cyan under the pattern, and the box is tinted faintly everywhere inside it.

## From the water (camera 4 m up on the shelf at x 100, z −15, looking back out to sea)

- `08-shelf-plus-6s.png`: just after the bore has passed the camera. Its foam lies on the water between us and the break.
- `09-shelf-plus-10s.png`: 4 s later the foam has thinned to streaks and patches, and the next wave throws on the horizon.

## Cost (spec §3.4)

Measured in the Browser pane with the app rendering (RTX 4060 Laptop, 1236 × 1351):
- **Replay after a jump:** 240 ticks in 41 ms median (CPU 5 ms). The target is ≤ 200 ms.
- **One tick:** 0.17 ms. The target is ≤ 0.5 ms. At 60 fps one frame in three runs a tick.

The first measurements, at 160–600 ms, came from two things. Each tick sent its passes to the GPU as separate submissions, which is now one submission per tick. And the pane was hidden, which throttles the GPU.

## The active bore (camera 3 m up on the shelf at x 75, z −15, looking out towards the break)

- `10-bore-minus-3s-leftovers.png`: the next bore on the horizon, with the last wave's leftover foam fading on the water near us. The bore rolls through what is left of it.
- `11-bore-plus-2s.png`: the bore coming at the camera. Its white is the frame's own breaking foam on the water-anchored pattern, which boils rather than sliding with the crest (spec §3.2, for Andrew's eye), with the lingering foam band behind it.

About close pairs (spec §6): at the default 15 s swell, set waves arrive 13.5–16.5 s apart, so no wave breaks at the peak into the previous wave's foam. What happens is frame 10: each bore rolls through the thinning foam the last one left over the shelf. On a 10–12 s swell, or with a longer clear time, pairs break straight into leftovers.
