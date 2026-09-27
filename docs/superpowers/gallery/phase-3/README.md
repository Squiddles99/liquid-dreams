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

## Offshore spray (Phase 3b, `spray/`)

All frames use the `behind-the-wave` conditions (wind 22 km/h from 57°, offshore; 08:15), paused, 6.4 s before that moment unless noted. At that point the reference set's biggest wave has just thrown at the peak. They use the default settings: `spray amount` 1 and `spray life` 2 s.

- `00-sheet.png`: the frames below on one sheet.
- `01-backlit-from-lineup.png`: from the lineup seaward of the peak (camera [-22, 1.8, 2], looking east into the morning sun). The veil rises gold off the back of the breaking wave and drifts toward us on the offshore wind.
- `02-side-on.png`: along the crest from the north (camera [5, 3, -60], looking south). A faint haze trails behind the lip, side-lit.
- `03-from-behind.png`: the `behind-the-wave` camera 3 s before that moment. We are inside the spray field; puffs within 3–10 m fade out so they don't cover the eye.
- `04-front-lit.png`: frame 01 at 16:30, with the sun behind the camera. The veil is a faint white haze.
- `05-glassy-none.png`: frame 01 with no wind. No spray.
- `06-onshore-none.png`: frame 01 with 30 km/h from 250° (onshore). No spray.
- `07-spray-tint.png`: frame 01 with the `spray tint` overlay (puff age, green to red).

**Cost** (Browser pane visible, RTX 4060 Laptop, 1236 × 1351):
- a replay after a jump: 58 ticks in 87 ms (CPU 80 ms);
- per tick: 1.38 ms CPU and 0.13 ms GPU;
- drawing a close full veil: within measurement noise, about 0 ms.

The first measurements were over target (a 181 ms replay, 2.96 ms of CPU per tick, 5.2 ms to draw a close veil). They came down after three changes:
- emitters 3 m apart (the spec's lever 1);
- the lip maths from the station's own wave;
- lighting computed per puff, not per pixel.
