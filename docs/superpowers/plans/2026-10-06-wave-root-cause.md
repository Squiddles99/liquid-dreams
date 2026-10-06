# The Womb's wave: root causes and the fix (2026-10-06)

Written for Andrew to hand to the next session. Branch read: `claude/eager-darwin-d5a369-8bsax4` at f775358 (the handover),
plus main at 0863113. Andrew's references: a photo of the Womb's barrel (the lip lands on flat water about one face-height
in front of the wall; the tube is as wide as it is tall) and a Virtual Surfing left (one smooth body of water, flat sea in
front, the swell's own back behind).

## Ruling (Andrew, 2026-10-06): one surface

Andrew has chosen the one-surface wave over the two-part one. This is a decision, not a proposal: the next session does
not tune, smooth, re-blend or re-seat the join between the sea sheet and the drawn profile, because there is no join to
tune. Concretely:

- **Kept.** The reef field and its bake (where the swell arrives, how it bends, how big it is, where it first breaks, the
  step that sets hollowness); the sets; the crest trace (stations along ξ = 0); the GPU ribbon pipeline; the water
  shading and tube light; the ride standing on the sections; foam, spray, sound; the approved drawings (knots 3–11, the
  curl). The sheet stays as the open sea and as the *source* the profile's end knots are sampled from.
- **Gone, not tuned.** `BACK_BLEND_UNITS`, `FRONT_BLEND_UNITS`, `interiorWeight`, `frontHeight` and `FOOT_RUN_UNITS`,
  `seatScale`/`seatedY`'s stretch, the sheet's `leanPhase` with its flat plateau and `frontStanding`, `wombFrontMin`, ρ as
  a blend between two shapes (`sectionWeight`, `RHO_FULL_RATIO`, `standing`), `holdDownTheLine`, `wait` and `peelRatio`
  on the stations, and the footprint hiding the sheet beyond the ribbon's own last row.
- **New.** The profile's end knots sampled from the sheet (step 3); one advancing curl per wave side with a monotone
  clock (step 4); A from the onset height (step 1).

Steps 1 and 2 below are still done first: they are small, they are needed either way, and they make the one-surface
work easier to judge.

## Verdict

Nine rounds of fixes did not fail because the reef is drawn wrong. They failed because the wave is built from two
different surfaces stitched together, each on its own clock, and every symptom Andrew keeps seeing is a seam of that
stitch. No reef shape removes a seam. Separately, the speed problem is physics the reef *does* set, and the current reef
(20 m of water right up to the ledge) pins the peel at about 14 m/s by Snell's law, whatever is done downstream.

Four root causes, in order of how much they explain:

1. **Two surfaces.** The sea sheet (`setWaveModel`, a Stokes swell scaled by the period) and the drawn profile
   (`wombProfile`, scaled by the wave height) have different shapes everywhere except at the crest. They are blended by
   weights (`BACK_BLEND_UNITS`, `FRONT_BLEND_UNITS`, `rho`, `interiorWeight`, `frontHeight`, `seatScale`, the sheet's
   `leanPhase`). Every blend is a step: behind the crest, at the foot, in front of the face, and along the crest where the
   weights change.
2. **Per-ray clocks.** Each crest station reads its own time-since-onset from the eikonal onset record on its own ray,
   then smooths it along the crest with Gaussians (σ 8 m in `reefField.smoothOnsetTimes`, σ 4 m in
   `crestTrace.fillSections`). Smoothing a jumpy function makes it less jumpy; it does not make one curl. Steps sideways,
   twisted curls and pockets of barrel beside standing wall come from here.
3. **The tube's size follows the depth under it.** The ribbon's scale `A = H / 1.3` takes `Station.H = localHeight`,
   which is capped at 0.78 × the shallowest depth the ray has crossed. The tube's whole life (about 3 s, 20 m of travel
   at 6 ft) happens over the 4 m shelf with 1.5 m heads, so the drawn barrel shrinks 30–50% while it is still barrelling.
   The lip also never reaches the water (its tip knot sits 0.14 A below still water; the water in front is 0.42 A below).
4. **The peel speed is set offshore.** Along a straight ledge the curl's speed along the line is `c / sin θ` and Snell's
   law keeps that constant from wherever the swell enters. With 20 m of water in front of the face and the swell at 69°
   to the ledge, that is 14 m/s at every period (measured in the game: 13–17 m/s; the rider makes 10–11). Only the
   approach depth can change it. The drain term δ = 1 in the breaking criterion (`breakingHeight`, H breaks at
   0.44 × depth) is what forced the approach to be deep in the first place.

## Each symptom, and the seam it is

| Andrew sees | Where it comes from | Measured (6 ft set, H 3.3 m, A 2.54 m, 15 s) |
|---|---|---|
| A step behind the crest; a flat back with a step at 12 ft | The back blend (`BACK_BLEND_UNITS` 0.25–1.5 A). The drawing's back knot 2 is at 0.62 A; the sheet there is 0.84 A. The profile starts 0.26 m *above* the sheet at the blend's start and ends 0.58 m *below* it: an S-step. | 0.58 m at 6 ft, 1.2 m at 12 ft |
| A step or bench at the foot of the face | `frontHeight` takes `min(sheet, profile)` past the floor knot: a crease wherever the two cross. `seatScale` stretches the face 1.1–1.3× to reach the sheet's trough instead of moving the drawing's datum. | the bench was 0.2 m at 7 ft before the seat; the crease remains |
| A darker, smoother wedge in front of the face with a sharp far edge | The sheet's lean (`leanPhase`) squeezes the front to 1.8 A and then holds the water *flat at the trough level* out to half a wavelength (θ = −π, slope exactly 0): a 40–60 m plateau 0.42 A below still water, ending where the envelope lets go. Flat water shades flat. The handover's other candidate (the ribbon's 7 A footprint shaded with its own chop and normals) sits on top of it. | plateau ≈ 50 m long, −1.07 m |
| A V wedge in front of the curl, a diagonal step sideways | The same lean switches on along the crest over `STAND_LEAD_S` (2 s ≈ 30 m of crest): along those 30 m the sheet's trough moves from 45 m ahead to 4.6 m ahead. A diagonal ramp in plan. | 40 m of trough travel over 30 m of crest |
| Steps sideways, a twisted curl, barrel beside wall | Per-ray onset times (cause 2), ρ fading in and out along the crest with `r`, `standing` and `LINE_END_FADE_M`, and `holdDownTheLine` carrying waits. The ledge is also domain-warped ±5 m (`REEF_WARP`), so the breaking line wiggles every 12–35 m and the record's onset time along the crest is not monotone. | onset steps of 3.4 s over 4 m of crest reported in `reefField.ONSET_SMOOTHING_M` |
| Not big enough for the swell; the wall "doesn't extend very far" | Cause 3: A from the depth-capped H over the shelf. | cap 0.78 × (2–3 m) = 1.6–2.3 m against a 3.3 m wave |
| The barrel does not throw out onto the flats | The drawing throws 1.62 A (1.25 H), about right against the photo. What reads wrong is that the lip hangs 0.2–0.3 A above the water (tip at −0.14 A, water at −0.42 to −0.54 A) and the seat stretches the face taller without moving the tip out, so the tube is tall and narrow. | tip 0.2–0.3 A clear of the water |
| Faster than the surfer can ride | Cause 4. | 14.1 m/s at 20 m; 9.3 at 8 m; 8.1 at 6 m |

The peel numbers (swell from 225°, ledge from (0,0) to (28,−64), θ = 68.6°):

| Approach depth (m) | c (m/s) | peel = c/sin θ (m/s) |
|---|---|---|
| 30 | 15.6 | 16.8 |
| 20 (today) | 13.2 | 14.1 |
| 13 (before 2026-10-05) | 10.9 | 11.7 |
| 10 | 9.6 | 10.3 |
| 8 | 8.6 | 9.3 |
| 6 | 7.5 | 8.1 |

The period does not matter (12–17 s all give 9.2–9.3 m/s at 8 m). The swell direction barely matters: sin θ is already
0.93, and 1.0 is the most it can be. The `REFRACT_FLOOR_M` floor does not change it either: the floored arrival time runs
at the floored speed, so the conserved quantity is still the offshore one. The peel stretch was a way around this that
could not work: a held section runs on over the shelf, where the sheet caps it, and breaks small and fat (look 7).

## The fix, in order

Do these in order. Each is checkable on the CPU before Andrew looks. Nothing here changes the approved drawings except
the tip knot (step 2).

### 1. The tube keeps the size it broke at (small change, large effect)

`crestTrace.fillSections` / `wombSection.sectionNumbers`: A comes from the station's height at onset, not from the
depth-capped `Station.H` under it now. The record already carries it (`stationLipH` / `breaking.onsetHeight`, but note that
value is itself capped by the depth at onset; use the uncapped `heightM × amp` at the onset point, carried along the ray).
Hold it through the lip's flight, the hold and the collapse; only the white-water wall (phase 2) sinks toward the bore.
Check: the film strip (`tools/drawWombFilm.ts`) shows the same A from phase 0.5 to 1.5 along the first leg.

### 2. The lip lands

Apply the pending change in `wombProfile.PROFILE_KEYS`: the phase-1 hollow tip's y from −0.14 to −0.36 (and the drawn
knots at 1.25 as the handover notes), then `node tools/drawWombProfiles.ts --freeze`. With the seat this puts the tip at
the water. Andrew signs the drawing, as before.

### 3. One surface (the ruling): the profile *is* the wave, and its ends *are* the sheet

Stop blending two shapes. At every station and every phase:

- **Knots 0–2 (the back) and 12–13 (the front flat) are sampled from the sheet** at the knots' u positions, not taken
  from the keyframes. The Catmull–Rom then passes through the sheet's own points at both ends, and the drawing supplies
  only the curl (knots 3–11: crest, lip, ceiling, wall, floor, trough). There is no `BACK_BLEND_UNITS`,
  `FRONT_BLEND_UNITS`, `interiorWeight` or `frontHeight` (its `min()` is the crease at the foot).
- **Phase 0 is the sheet.** With the back and front sampled and the crest region's phase-0 knots set from the sheet's
  own crest, the section at phase 0 is the sheet within the Catmull–Rom's error. Then ρ is no longer a blend between
  two shapes and should go: the ribbon draws at full weight wherever it is traced; the phase alone carries the wave from
  swell to barrel. Keep only the fade at a traced line's cut end.
- **Seat by datum, not by stretch.** The drawing's "flat sea in front" means the water in front, which is the sheet's
  trough. Place the trough knot `SEAT_DIP_UNITS` under the sheet's level at the front knot and let the curve run into the
  sampled front knots; drop `seatScale`'s stretch (it is what makes the tube tall and narrow).
- **No plateau in front.** `leanPhase` must not hold θ at −π. The front should compress to the face's length and then
  rise smoothly back to still water as the swell's own quarter wave does (a monotone θ → th map with a continuous
  slope, no flat segment). With the profile's front knots sampled from this sheet, the face meets a continuously
  falling and rising sea.
- **End the ribbon mesh where it is the sheet, and zip it.** The ribbon's last row on each side (knots 0 and 13) must be
  the sheet's position, normal and chop sample exactly (the same cascade texel at the same world xz, not per-vertex
  chop at the ribbon's own spacing), and the footprint must hide the sheet only inside that row. Today positions are the
  sheet's past 4 A but shading is the ribbon's to 7 A.

Check (CPU): a cross-section through every station at phases 0, 0.5, 1, 1.5 differs from the sheet by < 1 cm beyond
knots 2 and 12, and the drawn height map has no slope discontinuity greater than the sheet's own anywhere within 60 m
of the curl. Commit the CPU render tool from look 4 (the session scratchpad lost it) under `tools/` so this is repeatable.

### 3c. The wall down the line (done 2026-10-06, Fable, on Opus's steps 1–3)

Andrew's ninth-look complaint after steps 1–3: "the breaking part of the wave bowling into almost a right-angle, instead of
seeing the extended wall of the yet to break wave, to plan how I ride the wave". Measured with `crestProbe.test.ts`
(`PROBE_FT=6 npx vitest run src/breaker/crestProbe.test.ts --silent=false`): the drawn wall stood 9 m past the curl and
the sea 6 m in front of the crest jumped 2 m over 3 m of crest where it ended, because the stand-up was keyed to the
breaking ratio, which on the deep basin only rises in the last 10 m before a point breaks (the crest crosses the ledge at
47°, so 20 m down the line it is in 20 m of water).

What changed:

- The reef record carries, per level, **how long until the section on each ray breaks** (`breaking.ONSET_UNTIL_OFFSET`,
  `onsetUntil`, baked by `reefField.fillUntil`: the onset march run backwards; `UNTIL_NEVER` where a ray never breaks;
  smoothed along the crest with the onset times). The GPU reads it from a third record texture (`SetWaves.onsetUntilTex`,
  `breakingNodes.onsetTimeNode.until`).
- `wombSection.wallWeight(until)` = (1 − until / `WALL_LEAD_S`)², `WALL_LEAD_S` 8 s: the stations' phase before onset is
  `STOOD_PHASE` × the larger of the ratio ramp and the wall, and the sheet's front shortens on the same weight
  (`setWaveModel.frontStanding`, `SetWaves`' `standing`), so the drawn face and the sea in front of it agree all along the
  wall. A held section (the peel stretch) stands up on the same weight over its last `WALL_LEAD_S`. The trace runs on down
  the line while `until` is within the lead (`crestTrace.traceWave`).
- Measured, 6 ft mid tide, the curl at the corner: the wall is steeper than 30° for 30 m past the curl and eases to the
  swell over the next 45 m; the sea 6 m in front of the crest falls from +1.6 m to −1.1 m over 60 m of crest, never more
  than 0.3 m per metre (it was 0.7). `wallDownTheLine.test.ts` pins this.
- The take-off: with the face arriving as a steep wall a second from breaking, the paddler at 8 m seaward was passed in
  0.4 s and went over the back. `takeoff.TAKEOFF_SEAWARD_M` 8 → 20, `ridePhysics.ASSIST_ACCEL` 8 → 12, `CATCH_RATIO`
  0.45 → 0.4; the ride test catches, pops up and rides 6 and 12 ft. These three are stand-ins for step 5: the take-off is
  on a 13 m/s crest in 16 m of water because δ = 1 breaks the wave there; once step 5 moves the break onto the face they
  should go back toward where they were.
- Known, left for step 5: at the ledge the unbroken wall stands at the local height (the shoaled sheet's, up to 4.2 m at
  6 ft) and the tube behind it at the height it broke at 25 m seaward (3.3 m), so the section shrinks about 10% as it
  breaks there. Opus's size test now measures from phase 0.55, past that hand-over.
- `BreakingRibbon.test.ts` had an unescaped quote (the storage-buffer guard was not running); fixed.

For Opus, on Andrew's PC, before anything else: `--filter=ribbon` and `--filter=breaker` self-tests (the sheet reads a new
texture; the GPU's `standing` must match the CPU's `frontStanding`), then a capture from inside the tube looking down the
line at 6 and 8 ft.

#### 3d. The fold in front of the face (2026-10-06, Fable, after Opus's captures of 3c)

Opus's 8 ft captures showed a raised ridge with a dark drop under it across the sea just inside the mouth; 6 ft looked
clean. Measured with the cross-section probe (`PROBE_FT=8 PROBE_DT=5 npx vitest run src/breaker/crestProbe.test.ts
--silent=false`): not the wall, not the sheet, but how step 3b built the drawn curve. Every sample was "the sheet at its
home plus the drawing's offset from it", and between the tube's floor knot and the trough knot the samples' homes run
across the sheet's own 4 m face, so the samples followed that drop before the offset caught up: at 8 ft the drawn floor
overshot 1.15 m below the trough knot (−3.3 m against −2.2 m) and the water then climbed 1.6 m to the flats. At 6 ft the
overshoot was 0.2 m.

Now each sample carries a sheet weight (`wombSection.SectionSample`, `sampleWeight`): 1 at the sheet knots, 1 − the curl's
weight at the curl knots, eased over the two join spans; its point is weight × the sheet at its home + A × (u − w·su, y −
w·sy). The sheet's stretches stay the sheet sample by sample (and the whole section at phase 0), the drawn curl at full
weight is the drawn curve itself. The GPU mirrors it (`wombSectionNodes` writes (a, home, w) per sample; the vertex pass
places w × sheet + A × a). After: at 8 ft the floor runs −1.2 → −2.2 m at the trough and climbs 0.5 m to the flats over
4 m (the seat's 0.12 A dip, by design). `wombSection.test` pins it on a sheet with the leaned face.

Also fixed: the underwater switch read the sheet under the barrel (1.45 m over an eye at 0.29 m inside a 6 ft tube);
`App.updateUnderwater` now reads the drawn surface where a section covers the eye (`WaterAt.onSection`).

For Opus: `--filter=ribbon` again (the samples' vec4 changed meaning), then the same 8 ft captures at t + 3 and t + 5.

### 4. One curl per wave, on one clock

Replace the per-station onset read with a curl that moves along the crest:

- For each traced wave line, the curl position s_c(t) is the farthest station along the line that the record says is
  broken, passed through a follower that **never retreats and has a bounded speed** (critically damped, max speed a dial,
  default well above the reef's own so it only filters noise).
- Each station's onset time is the time the curl passed it, stored per wave as the curl advances. That table is monotone
  by construction. Phase, hollowness and A are read from it, so neighbouring stations never jump, `holdDownTheLine`,
  `wait`, `peelRatio` and the ρ fades go.
- Hollowness and the onset height are read from the record *at the curl's position* when it passes, so a reef head
  neither shrinks the tube nor opens a pocket of barrel 20 m down the line.
- Take `REEF_WARP.ampM` (5 m) and `detailAmpM` (2 m) off the ledge line itself (keep them for the look of the rock): a
  breaking line that wanders ±5 m every 35 m is what makes the record's onset non-monotone in the first place.

This is also how Virtual Surfing and Kelly Slater's Pro Surfer do it: the wave is one scripted body, and the barrel is a
point that slides along the crest. Here the physics still decides where the curl starts and how fast it is allowed to go;
it just stops deciding it separately on every ray.

### 5. The peel speed: the approach, and δ

This is the reef change Andrew expected to make, and it is a real one, but it only works together with a breaking
criterion that breaks waves at a real depth:

- `DEFAULT_BREAK_PARAMS.delta` 1.0 → about 0.2. With δ = 1 a wave breaks at 0.44 × depth, half the real 0.78–0.9, which
  is why every shallower approach "broke 8 ft on its flat floor, soft" and why the basin had to be 20 m. At δ ≈ 0.2 a 6
  ft (3.3 m) wave breaks in about 4.2 m: on the face, above the ledge, where it should.
- Then the approach: 6–8 m of water for at least 150 m (a wavelength) seaward of the face, so the crest settles to that
  depth's angle before the ledge: `faceBaseDepthM` 7–8, `slopeDepthM` 8, `coastProfile.REEF_SURROUND_DEPTH_M` 8, with
  the coast easing to the 30 m far field beyond `FAR_RAMP_S` as now. The face from 8 m to 3.5 m over 10–15 m keeps the
  step at 2.3 (`STEP_PSI_POINTS` "heavy"). Expected peel on the first leg: 8–9.5 m/s at every period and size.
- Re-anchor hollowness after δ changes: `reefStep` reads the shallowest water within 2.5 breaking depths ahead *of
  where the wave breaks*, and with waves breaking twice as shallow as before every step reads smaller. Re-fit
  `STEP_PSI_POINTS` so the first leg at 6–8 ft reads hollow ≥ 0.8 (`reefReport.leftStretches`).
- Measure before Andrew looks: `leftStretches` at 4, 6, 8, 10, 12 ft at low, mid and high tide: peel, hollow, and the
  onset height along the first leg. Targets: first leg 7–10 m/s, 6 ft onset height ≥ 3.3 m, hollow ≥ 0.8 at 6–10 ft.

If after this some size still peels faster than the rider, the bounded curl speed from step 4 is the dial, and it will
only look right because step 1 keeps the wall ahead of the curl at its onset size.

### 6. Tests that guard this

Most of the 43 failing tests pin the old reef and should be retired with it. Add, and keep green:

- the section at phase 0 equals the sheet at every station (< 1 cm) and the ends equal the sheet at every phase;
- onset time along each traced line is monotone and continuous;
- A along the first leg is constant through phases 0.5–1.5 (within 5%);
- the first leg's peel at 6 and 8 ft, mid tide, is between 7 and 10 m/s;
- the lip's tip at phase 1 is within 0.05 A of the water under it.

## What not to do again

- Do not add another blend, smoothing σ, fade or `min()` between the sheet and the profile. Each one is a new seam.
- Do not report a seam fixed from a height map. Seams are slope and shading discontinuities; check slopes, and check a
  CPU render from Andrew's camera before claiming anything.
- Do not deepen the approach to make the wave bigger or the lines straighter. It buys size at the price of the peel, and
  the size problem is cause 3, not the basin.
- Do not hold sections to slow the peel. Slow the curl (step 4) over a reef whose approach already gives a makeable
  speed (step 5).
