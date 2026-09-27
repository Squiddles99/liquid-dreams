# Phase 2 gallery (work in progress, captured overnight 2026-09-27)

Rendered on the RTX in the browser pane. Default morning (08:15), with the swell at 5 ft so that the set's biggest wave peels.

- `01-first-barrel-from-shoulder.png`: the first barrel, before visual tuning. Foam fills the tube and the collapsed section looks like a smooth peach "sausage".
- `02-barrel-peeling.png`: the `barrel-peeling` moment after tuning. The lip is thinner, the tube's inside is water rather than foam, and the foam is broken up.
- `03-the-line-lips-throwing.png`: looking down the line, with two sections throwing and the collapsed section between them.
- `04-aftermath-foam.png`: a few seconds later, the broken wave's foam (the Phase 3 whitewater stand-in).

- `05-barrel-after-fix-round.png`: after fix round 1. The lip's back edge is wider (no sawtooth up close) and the foam contrast is stronger.
- `06-two-sections-throwing.png`: two sections throwing. The right one curls over a tube, and the foam between them now has holes and streaks. The far-left lip, about 100 m away, still looks spiky; the Break folder's "lip back reach" slider controls that.
- `07-lip-peeling-past.png`: the lip peeling past the camera, with broken foam behind.

Frames were captured by pressing the screenshot key and then forcing a frame, because the app window was hidden overnight. More shots, and an animated sequence, will come after Andrew's review.

## The breaking ribbon (rework after Andrew's review, 2026-09-27)

The curl is now drawn by the breaking ribbon, a separate fine mesh (breaking-ribbon spec). The ocean sheet is a single surface again. All shots are 1280×720, taken in the browser pane on the RTX.

- `08-barrel-ribbon.png`: the `barrel-peeling` moment (5 ft). A gravity-thrown lip curls over a hollow tube. The edges are smooth, with no holes or stepped lip, and the unbroken face runs towards the camera.
- `09-behind-the-wave.png`: the new `behind-the-wave` moment, from Andrew's camera. It shows the reference set's biggest wave, 7.2 s after it passes the peak.
- `09b-andrews-behind-view-after.png`: Andrew's own saved behind-the-wave link, re-rendered. The tall walls and flat tabletop backs are gone (the back of the crest is no longer sunk). So are the hard-edged turquoise patches: they were gaps in a placeholder foam that trailed about 55 m behind each crest, now shortened and softened.
- `10-lip-close-up.png`: the new `lip-close-up` moment, from the unbroken shoulder about 15 m down the line from the lip as it throws. Known flaw: the lip still ends in a fairly straight vertical edge on the shoulder side.
- `11-closeout-right.png`: the `closeout-right` moment, looking from over the shelf at the right section breaking along the south ledge. Known flaw: the thrown lip picks up a brown seabed colour, because the seabed look-through shading still applies to the lip.
- `12-ribbon-tint.png`: `barrel-peeling` with the dev overlay `ribbon tint` on. Magenta marks the ribbon's extent (face, lip, tube and a margin in front); the rest is the ocean sheet.

## The break along the crest (Andrew's second review, 2026-09-27)

Andrew's review found square-edged channels running forward from the break, and the broken section sunk into a right-angled bowl. The break now fades in and out along the crest over wave heights (spec §15). Same capture setup as above.

- `13-channels-before.png`: Andrew's viewpoint at 6.6 ft, before the fix. The collapsed section is a sunken white bowl, and hard channel edges run toward the camera from both ends of it.
- `13b-channels-after.png`: the same frame after the fix. The section stays at wave height and throws along a long, level lip, with no sunken bowl. The water in front is continuous, with only a soft hollow at the foot of the face.
- `14-barrel-peeling-longer-line.png`: the `barrel-peeling` moment, from its new camera further down the shoulder. The lip throws over the tube, and the unbroken shoulder tapers off smoothly with no vertical end.
- `15-closeout-lip-colour.png`: `closeout-right` after the lip-colour fix. The lip reads as water with a soft sunrise reflection, no longer brown.

## The lines behind a broken wave (Andrew, 12 ft)

Andrew's moment at 12 ft (camera [60, 12, 0], yaw 231°, pitch −12°), 3 s before the link's time: we look out to sea from over the reef, just after a wave has broken underneath. Every point behind a broken crest shares that crest's bore. The bore read a breaking depth that spikes wherever the reef focuses the swell at the crest, and each spike drew a trench back along the wave's travel. The bore is now a smooth share of the crest's height (addendum B10).

- `16-bore-lines-before.png`: before the fix. A V of bent ripples runs from the incoming crest toward the camera over a trench up to 1.3 m deep, and the incoming crest carries small bumps.
- `16b-bore-lines-after.png`: the same frame after the fix. The water behind the broken wave is continuous, and the incoming crest is level.

## Waves no longer stack (Andrew)

- `17-set-trace.svg`: the water height 100 m seaward of the peak as one 5 ft set passes, before and after. With the old Gaussian envelope, every wave rode on the one ahead: crests stood 1.27–1.44× the wave's own crest, and small bumps led and trailed the set. Now each wave has one crest at its own height (1.00–1.01×) with deeper troughs either side. The wave behind a long-tail wave (about 1 in 12) steps on its leftover, at 1.18×.

## Underwater (Andrew)

The camera below the surface, at the `the-drain` moment's time. The surface is seen from below with Snell's window, the reef shows through the water, and the water fades to its own blue with distance (spec `2026-09-27-underwater-view-design.md`). GPU time was not measured: the pane's GPU timestamps are too coarse (65 µs steps), so Andrew's perf reading decides it. Above water nothing changes: the sheet's above-water material is untouched and the water volume is hidden.

- `18-underwater-window.png`: 3 m under the channel north of the peak, looking straight up. The sky fills Snell's window, brightening toward its rim where the horizon sky is squeezed in, and the low morning sun sits at the top left. At the right edge, the ripples tip the surface past the 48.6° rim into total internal reflection.
- `19-underwater-reef.png`: 3 m deep over the north ledge, looking along it. The ledge fades into the blue, and the rippled surface overhead mirrors the reef below.
- `20-underwater-wall.png`: 9 m deep over the 13 m shelf, 20 m west of the ledge, looking east. The reef wall rises above eye level, and above it Snell's window is a bright ellipse with the low sun in it. (The reviewer caught that level and rising rays saw through the reef; the march now runs in any direction.)
- `21-underwater-drain.png`: the `the-drain` camera moved 1.5 m under the surface. The reef edge runs off into the channel, under the mirror of the surface.
