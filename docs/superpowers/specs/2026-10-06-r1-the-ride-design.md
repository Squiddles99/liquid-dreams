# R1, the ride: a wave you can catch and make (2026-10-06)

Orchestrated by Fable, executed by Opus, judged by Andrew. Brainstormed with Andrew on 2026-10-06; every section below was
approved by him that day. Supersedes step 5 of `docs/superpowers/plans/2026-10-06-wave-root-cause.md` (its approach-depth
table is wrong, see §1). Steps 4 and 6 of that plan are R2, not this.

## Why

Andrew, 2026-10-06, with the weekly reset: "The camera angles are impossible, especially taking off, and the takeoff is
also currently seemingly impossible." Measured the same day on main 264c4f0 at his saved conditions (7 ft, 15 s, 225°,
mid tide), with `crestProbe.test.ts` and Electron captures:

- The 7 ft wave is declared broken 20 m seaward of the ledge, in 17.8 m of water, and the curl runs 15 m/s. The catch
  rule needs the paddler at 40 % of that. No human gets there; the bot ride test passes only because `ASSIST_ACCEL` 12
  reacts instantly.
- The paddle camera sits behind her looking at the beach. The wave arrives from behind the camera.
- The "second wave" Andrew marked is the seat's 0.12 A dip: the drawn trough sits 0.33 m below the sea in front and
  climbs back over 3 m, a rim that catches the sun along the whole foot of the face.

Virtual Surfing's Steam reviews (Andrew's cherry-pick, kept out of the repo) rank camera and feel above wave looks. The
negative ones are "looking at the back of the wave", "bouncy", "controls". R1 is the first of three segments: R1 the
ride, R2 one body (one curl per wave on one clock, the ribbon zipped to the sheet, the lip look), R3 feel (weight, damping,
bots). Each segment ends with a handover file for Opus and one for Fable (§8).

## Constraints (Andrew)

- **Rideability first, individuality kept.** Every wave in a set keeps its own height, its own drain after the wave
  before it, and the reef's own irregularity. Nothing in R1 scripts a canned wave; what changes is where and how fast the
  physics lets it break.
- The reef is a design variable (2026-10-05 mandate). Colour, kelp, sand pockets and the rock's look stay.
- No new blend, fade, σ or `min()` between the sheet and the profile (the root-cause plan's rule still holds).
- Nothing claimed fixed without the checks in §7 pasted into the commit or the handover.

## 1. The basin runs to the far field

**Finding (2026-10-06, `_peelExperiment`, deleted after use).** Along a straight ledge the curl's speed is c / sin α, and
Snell's law conserves it from wherever the swell's direction is set. In our field that is the coast's own ramp (30 m far
field to the 20 m surround, contours north–south), which turns every swell toward east before the reef. So:

| Approach tried (δ 0.2) | 6 ft first-leg peel | 8 ft | note |
|---|---|---|---|
| today, 20 m basin, 30 m far field | 12.1 m/s | 12.9 | breaks in 10–14 m of water |
| 8 m shelf, 200 m, 30 m far field | 12.2 | 14.9 | shelf refracts the swell square-on |
| 6 m shelf | 71 (closeout) | closeout | |
| **15 m basin to the far field** | **9.7, hollow 1.0** | **10.1, hollow 1.0** | second leg 12.7–13.0 |
| 12 m basin to the far field | 9.4, hollow 1.0 | 10.4, hollow 1.0 | 12 ft trips in the basin |

A shallower shelf never slows the peel; a basin at one depth from the far field to the face does, because the swell arrives
unbent (travel bearing 45° at the basin, measured) and travelling nearly along the ledge. This is also the Womb's real
character: deep water right up to a slab, a fast short ride.

**Design.**
- `coastProfile.FAR_DEPTH_M` 30 → 15 and `REEF_SURROUND_DEPTH_M` 20 → 15: one depth from the map's west edge to the face.
  The inshore coast (shallows to the surround over the first 140 m off the sand) is unchanged.
- `wombReef.DEFAULT_REEF_PARAMS`: `faceBaseDepthM` 15, `faceWidthM` 15, `slopeDepthM` 15, `slopeEndM` as now. The face
  rises 15 → 3.5 m over 15 m (step ratio stays "heavy").
- The second section is expected at 12–13 m/s ("the faster second section is accurate", Andrew 2026-10-05). On a 12 ft
  day the first section may close out until §2 lands; after §2 it must break on the face.
- Target, measured by `reefReport.leftStretches` at mid tide: first section peel 9–11 m/s at 6 and 8 ft, hollow ≥ 0.8;
  4 ft soft is acceptable; 12 ft first section ≤ 16 m/s or an honest closeout, never both legs.

## 2. The break starts on the ledge

**Finding.** Two things declare the wave broken 20 m too far out: `DEFAULT_BREAK_PARAMS.delta` 1.0 (a wave breaks at
0.44 × depth, half the real 0.78–0.9), and the bake's spreading of the breaking gain, `maxAlongCrest(BREAK_REACH_M 6) →
smoothAlongCrest(6) → max with the tail (BREAK_TAIL_M 20) → smoothAlongTravel(8)`, which lifts a deep-water node's gain to
its shallow neighbours' and so moves the onset seaward (and sideways along a crest that meets the ledge at 21°).

**Design.**
- δ → about 0.2, tuned so H / depth at onset is 0.75–0.85 on the face at 6–8 ft mid tide.
- The spread becomes shoreward-only along the travel, and along the crest it may never raise a node's gain above what
  its own depth gives unless that node is already on the face. The onset's seaward edge is the reef's, not the filter's.
  Behind the onset the spread may do what it does now (the bore, the pile, the drain are untouched).
- `reefStep` reads within 2.5 breaking depths of where the wave breaks; with waves breaking twice as shallow every step
  reads smaller. Re-fit `STEP_PSI_POINTS` so the first section at 6–8 ft reads hollow ≥ 0.8.
- `takeoff.takeoffSpot` and the ride tests read the record, so they follow.

Target (`reefReport.firstBreak` and the depth there): 6 ft mid tide within 5 m seaward of the ledge in ≤ 5 m of water;
8 ft ≤ 6 m; 12 ft ≤ 9 m. At low and high tide the same within ±1 m. Onset time along the first 40 m of the north ledge
monotone in the report (R2 makes it monotone by construction; R1 only must not make it worse).

## 3. The takeoff is a late drop

**Finding.** With the curl at 13–15 m/s and `CATCH_RATIO` 0.4 the rule asks a paddler for 5–6 m/s. A slab's take-off is
not matching the crest's speed: the face stands up under you in a second and gravity takes you down it.

**Design.**
- **Spot.** `takeoffSpot`: on the ray through `TAKEOFF_ANCHOR`, `TAKEOFF_SEAWARD_M` (new value, about 8) seaward of the
  first onset point, which is now on the face. Bigger waves break a little further out on the face and the spot follows.
- **Lead.** The ride starts so the crest reaches the spot about 6 s later: `start = arrival − (τ_peak − τ_spot) − 6`,
  read from the field, instead of a fixed `RIDE_LEAD_S` before the peak.
- **Catch.** Caught when, for 0.2 s, the board is on the front face with the nose downhill (`liftAt` > 0.3 as now) and the
  face slope under the board is at least `CATCH_SLOPE` (about 0.35, 19°), regardless of speed; or the old speed rule, kept
  for small soft days. Once caught, gravity along the face is what accelerates her; the assist is a forgiveness, not
  the engine.
- **Experience setting** (Andrew's suggestion). A player setting "Experience": beginner, intermediate (default), expert.
  It scales the paddle assist (`ASSIST_ACCEL` about 8 / 4 / 1.5) and eases `CATCH_SLOPE` for beginners (about 0.28 /
  0.35 / 0.42). Lives in `FrontSettings` beside the other player settings, read at `startRide`. Nothing else reads it in R1.
- **Pop-up** stays 0.4 s. The "too soon" hint stays.

Target: a live keyed run (`tools/_takeoffLive.mjs` logic, paddling from the wave's real arrival at the spot − 3 s, pop on
caught + 0.4 s real) catches and rides the first section at 6 and 8 ft on intermediate; the bot ride test catches at 6
and 12 ft with the assist at the intermediate value; a run that never paddles is not caught.

## 4. The takeoff camera

**Design.** While she paddles and until she stands, the camera sits down the line on the shoulder side (the side the left
peels toward: along the crest, the direction the existing `lineSign` resolves once she rides; before that, the reef's peel
direction at the spot), about 7 m along, 2.5 m seaward of her, 2 m up, looking at her chest. The wall stands up behind her
and the camera sees it coming side-on. On pop-up it blends over about 0.6 s into the existing along-the-line ride camera
(`RIDE_BACK_M` 4 / `RIDE_UP_M` 1.8 / `RIDE_SHORE_M` 1, look 8 m ahead), which is unchanged. The beach-facing paddle chase
goes. Steering stays board-relative, so the camera's angle does not change what left and right do.

Andrew: happy to try; if it makes the controls feel wrong at the drop it changes. The live run's frames at caught, pop-up
and +1 s are the evidence.

## 5. The rim

`wombSection` seat: the dip under the sheet at the trough (`SEAT_DIP_UNITS` 0.12 A) → 0. The drawn trough is the sea in
front of it; whatever recovery to still water exists is the sheet's own quarter wave, never within metres of the face.

Target (`PROBE_FT=7 PROBE_DT=3 npx vitest run src/breaker/crestProbe.test.ts --silent=false`): beyond the trough knot the
drawn surface is within 2 cm of the sheet and has no local rise greater than 5 cm within 10 m of the trough; the GPU
ribbon self-test green; a capture from down the line (camera (30, 3, −75), yaw 200°, pitch −3°, arrival + 3 s at 7 ft)
shows no bright line along the foot of the face. The sparkly footprint shading beyond the curl (the ribbon's chop to 7 A
over the sheet) is noted for R2, not fixed here.

## 6. Tests

44 of 1860 tests fail on main today; most pin the 20 m basin or the old breaking. Opus triages them in one commit before
the work: a test that pins a number this spec changes is retired or re-pinned with the spec's target; a test that fails
for another reason is listed in the handover, not silently retired. New guards, kept green:

- first-break depth per size and tide (§2 targets);
- first-section peel and hollowness per size at mid tide (§1 targets);
- the catch: caught by slope with no paddle speed on a 6 ft face, not caught on flat water, not caught facing seaward;
- the camera: during paddle the wave's crest line is inside the frustum; after pop-up the pose is the ride camera's;
- the rim: drawn − sheet beyond the trough < 2 cm at 6, 8, 12 ft.

## 7. Evidence before Andrew looks

Pasted into the final commit message or the handover, in this order:

1. `npx vitest run` summary (files, tests, failures named).
2. The reef report: 4, 6, 8, 10, 12 ft × low, mid, high: first-break distance and depth; first and second section peel
   and hollowness.
3. The 7 ft cross-section probe at the curl, arrival + 3 s.
4. `--filter=ribbon` and `--filter=breaker` GPU self-tests on Andrew's PC.
5. Bot-ride frames (`tools/captureRide.mjs`, its bot paddling from the wave's real arrival at the spot − 3 s) at 6 and
   8 ft: −3, caught, pop-up, +1, +3, +6 s.
6. One live keyed run's log and frames at 7 ft, intermediate.

## 8. Handover (every segment)

Two files in `docs/superpowers/handover/`, written when the segment's last task lands:
- `<date>-r1-opus.md`: what landed (commits), what the evidence showed, what is open, the exact next command to run.
- `<date>-r1-fable.md`: the decisions and their reasons, numbers measured, what surprised us, what the next segment's
  first question is. Fable's memory is updated from it.

## Out of R1

One curl per wave on one clock and the ribbon zipped to the sheet (R2); the lip's streaked look and the tube interior
(R2); board weight, damping and the pose snaps (R3); bots and Grommet's bodyboard (later); quality tiers (later).
