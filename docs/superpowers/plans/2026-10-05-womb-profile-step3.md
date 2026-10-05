# Womb Profile, Step 3: the New Shape in the Game

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every crest station's cross-section is the approved profile family (`wombProfile`) for that station's numbers, drawn by the ribbon mesh on the GPU and stood on by the ride on the CPU, over the reshaped reef (spec 2026-10-05-womb-profile-design §2, §4, §7 step 3).

**Architecture:**
- `src/breaker/wombSection.ts` (new, pure) turns a station (H, c, r, tb, ψ, the swell period) into the profile's numbers:
  - phase, from the onset ratio before breaking and the time since onset after;
  - hollowness, `reefReport.hollowFromPsi`;
  - the scale A (crest height above sea level);
  - the ribbon weight ρ (in from the sheet as the wave stands up, back to it after the white-water wall).

  It places the station's 160 samples in the station's (u, y) plane, front edge to back edge (the mesh's order), blended into the sheet over the profile's last 3 A at each end. It also gives the points the spray, impact and sound read: crest, tip, lip, landing, the tip's speed.
- The GPU mirrors it (TSL) in the frame pass: one invocation per station writes its 160 samples to a buffer. The vertex pass places them; the normal, develop, light and chop passes keep their jobs.
- The ride's CPU water samples the same sections where the ribbon draws.

**Spec:** `docs/superpowers/specs/2026-10-05-womb-profile-design.md`

## Global Constraints

- The approved shapes are `wombProfile.approved.json`; nothing here changes `wombProfile.ts`'s keyframes.
- Collapse time grows with the wave's power (Andrew, 2026-10-05): bigger H and longer period hold the tube longer.
- The reshaped reef (`RESHAPED_REEF_PARAMS`) becomes the default in the same change that switches the ribbon to `wombSection`.
- Foam and spray settings are not tuned in this step (Andrew).
- WebGPU's 8 storage buffers per stage (`BreakingRibbon.limits.test.ts`).
- The cloud has no GPU. GPU self-tests run on Andrew's PC (`npx electron tools/_selftest.mjs --base=http://localhost:5173/ --filter=ribbon`), and he pastes the report back.
- Commit and push to `claude/eager-darwin-d5a369-8bsax4` as work lands (Andrew, 2026-10-05). Never merge.

## Tasks

### 3a. Station numbers (CPU, cloud)

- [x] `sectionPhase(input, p)` (wombSection.ts):
  - before onset: 0 → 0.5 as r rises from `ribbonOnset` to 1;
  - after onset: 0.5 → 1 over the lip's flight (`landingEstimate`);
  - held at 1 for the tube's hold;
  - 1 → 2 over the collapse.

  Hold and collapse grow with H·T. Clamp at 2.
- [x] `stationHollow(psi)` = `hollowFromPsi`. Scale A = H / 1.3 (the profile at onset stands 1.3 units crest to trough).
- [x] ρ: in over r ∈ [ribbonOnset, 0.9], out over `HAND_BACK_S` after phase 2.
- [x] Tests: monotone phase in time; the hold and collapse longer for a bigger, longer-period wave; ρ 0 on a wave that never stands up; continuous at onset.

### 3b. The section on the CPU (cloud)

- [x] `wombSection(station, sheet(u), p)`: 160 points, front → back; the blend to the sheet; the emitters' points.
- [ ] Tests:
  - on a flat sheet it is A × `profileCurve` (reversed) exactly;
  - its ends are the sheet;
  - neighbouring stations' sections differ smoothly;
  - no self-crossing on the real reef at 6–12 ft, at every tide.
- [x] Pictures for Andrew: the game's own slices down the reshaped left, through time (a film strip), the anti-"held at one slice" check.

### 3c. The GPU (cloud writes, Andrew runs)

- [x] TSL mirror of `profileKnots`, the Catmull–Rom, the rounded tip and the arc-length resample, in the frame pass. Write 160 samples per station to a new `sections` buffer (2048 × 160 vec2), replacing the frame's pile knots and `lipProfileNodes`' sample table in the vertex pass.
- [x] Vertex pass: place the samples. Normal, develop, light (tip and root samples from the knots) and chop passes adapted.
- [x] Self-test "ribbon: GPU section matches wombSection" (5 mm), and the existing footprint, gap-row and normal tests adapted.
- [ ] Andrew runs the self-tests and a timing capture; pastes the report.

### 3d. Gameplay (cloud)

- [x] Ride water: where a station's ribbon draws (ρ > 0), `water(x, z)` is the section's height and slope there (nearest stations, interpolated along the crest); elsewhere the sheet.
- [x] Spray, impact, spit and sound read `wombSection`'s points in place of `profileFrame`'s.
- [x] The tube cover reads the section's phase and hollowness in place of tb and ψ.
- [ ] Switch the default reef to the reshaped one; the dev panel's reef ranges widened to it.

### Found in Andrew's first look (2026-10-05)

- [x] The stations' numbers jumped between neighbours over reef heads: smoothed along the crest (crestTrace.fillSections, σ 4 m).
- [x] A held wall stood at the pitching stage all along the line ("an unrealistic lip across the entire length of the wall",
  "vertical the whole way"): a held section stands up only over its last STAND_LEAD_S (2 s) before its turn.
- [x] Neighbouring back edges cross behind a tightly curving crest and turned stations inside out: oriented by the crest.
- [x] The surfer sank: the ride stands on the sections (ride/sectionWater).

### Found in Andrew's second ride (2026-10-05)

- [x] The drawn-sea offset was matched against the sections water while the probe reads the sheet: wipeouts from nothing, the board straightening out. Matched against the sheet alone.
- [x] "A swell bump before the real swell hits … a second swell bump" behind, and the wall in front "doesn't extend very far": the profile is drawn about still water, blended out only at its ends (±7 A), so it dipped under the swell's higher back and stood a ledge over its lower trough. First handed to the swell nearer the curl (0.5–4 A behind, 2.3–4 A in front); in the game the swell's broad hump then stood behind the narrow crest as a second wave (Andrew's third look: "the 2 waves are still very much there"; wanted "a smooth gradient returning down to sea level"). Now: the profile runs its full width, lifted to the sheet's level at each end (wombSection.endLift, the GPU's frame pass samples the two ends), blended to the sheet over its last unit.
- [x] The second wave in front, and the ride standing on it ("you are actually surfing the higher of the 2 waves"): the sheet's own whitewater pile, built where its lip lands, ran 5 to 7.5 m ahead of the ribbon's crest from 2 s after onset. The game's sheet (SetWaves, the ride's water, CPU and GPU) is drawn without the pile; its lean and drain stay (they keep the swell peaked, with a flat trough ahead). Measured on the 6 ft set: the sheet's crest within 1 m of the ribbon's at every stage; the bump ahead of the face 0.05 m on average, the ridge behind 0.08 m.
- [x] Down the line a held section was drawn at full weight in the unbroken key, whose crest (0.55 A) stands a metre under the shoaled swell: ρ now comes in over the same last STAND_LEAD_S as the phase.
- [x] The over-shoulder camera and the lens water never came on: the tube cover required a hollow section (the take-off's are middling on the present reef) and a window of phases. It now reads the drawn section: water over her head with room to stand under it.

### Found in Andrew's fourth look (2026-10-05): "an absolute disaster"

- [x] A ridge in front of the wave and a long band down the line (his screenshot), and his GPU self-test 6/7 ("GPU section matches wombSection", 1.56 m near the front end). The frame pass wrote the sheet's end levels into the frame's third vec4, which the tip and crest knots (two vec2) already filled: TSL dropped them (its console: "Length of parameters exceeds maximum length of function 'vec4()'"), and the vertex pass lifted each end by the crest knot's coordinates (up to ~1 m), a slab with a cliff where each end met the sheet. BreakingRibbon.limits.test now fails on any TSL complaint while building the passes.
- [x] The lift itself was the wrong idea: the profile's gentle back stands well under the shoaled swell's (0.2 A against 0.6 A four units behind the crest), so lifting its ends to the swell left a flat dip 3–6 A behind the crest and a rise at the join (measured 0.2 m; Andrew's red line). Now the back is the swell's own from just behind the crest (BACK_BLEND_UNITS, 0.25–1.5 A behind the crest knot) and the front the swell's past the trough (FRONT_BLEND_UNITS, 2.3–4 A): no lift, no end levels.
- [x] A traced line can stop where its wave is still drawn breaking (a run started at ρ 1 on the 6 ft set): its cut cross-section stood as a wall. ρ fades over each line's last LINE_END_FADE_M (6 m).
- [x] Process: a CPU render of what the GPU draws (the sheet without the pile, the ribbon from sectionOf as the vertex pass places it, the footprint) from the reference moments' cameras, in the session scratchpad; it reproduced the slab from the bug and shows it gone. (Headless Chromium's SwiftShader WebGPU loses its device within minutes here, so the GPU self-tests stay on Andrew's PC.)

### Found in Andrew's fifth look (2026-10-05): "there are waves going in everywhere"

His reference: a left-hand barrel from the beach (one crest line from the shoulder through the peak and the pocket to the white water; a tall concave face under a thick lip; flat water in front; white water exploding where the lip lands) and from inside the tube. Checked from now on with a ridge map from above (every crest marked) and renders from his angles, in the session scratchpad.

- [x] The sheet still broke its waves itself (steepening, drain, collapse, bore) beside the ribbon: the sheet is now the swell's shape under the ribbon (BreakOptions.shape 'lean', SetWaves { shape: 'lean' }), its foam and stage still reported.
- [x] The sheet's front was a long cosine front (13 m on the 6 ft set) ahead of the ribbon's 5 m face: where the ribbon handed the front back, the sheet still stood 1–2 m high, a second wave in front. Its front now shortens to the profile's face (WOMB_FRONT_UNITS of A) on the ribbon's own clock (frontStanding: over a section's last STAND_LEAD_S, and held through the collapse), and stays the swell's longer front down the line. Squeezed from the start, the face passed under a paddling surfer in a third of a second and the 6 ft ride test never caught the wave.
- [x] The inside reef was a field of short ridges: the rays' amplitude, direction and depth cap (hmin, the shallowest depth so far, which dips in a streak behind every reef head) streak and kink there. The game's field is smoothed for drawing (ReefFieldRequest.smooth: smoothFieldAmplitude, σ 6 m; τ σ 4 m) with every breaking ratio unchanged.
- [x] The game ran on the old reef, where the 6 ft set's barrel sections are 0–0.2 hollow (soft, open): it now starts on the reshaped reef (round 2), 0.77–1.00 hollow along the first section; the settings stamp (BREAKING_MODEL 8) resets a saved reef to it; the panel's reef face and outer slope ranges widened to it.
- [ ] After the collapse the broken section is drawn as a clean swell line; it should be white water rolling in, lower, its front short and ahead of the crest line. A first try (the sheet settling into a bore on each point's own onset record) drew seams where the record jumps between neighbours: backed out. Needs its own design (smooth along the crest, as the ribbon's numbers are).
- [x] After the collapse the broken section was drawn as a clean swell line. Now the sheet settles into the white water's bore behind the curl (wombSection.boreWeight: its height × BORE_SHARE 0.52 over the collapse, on the ribbon's clock), CPU and GPU, from the onset record's time smoothed along the crest (reefField.smoothOnsetTimes, σ 8 m) so it draws no seams.
- [ ] From the shoulder the curl looks twisted, and a crease showed near the shoulder end in one frame: to look at on the new reef.

### Found in Andrew's sixth look (2026-10-05): "the wave goes into a right angle"

From the lineup a breaking section ran off from the peak square to the main swell line and broke into it. The reef's left edge (round 2, bearing 40°) ran along the swell's own travel (49°): the swell slid along it, bent round onto the shelf (the first-arrival solve turned it a right angle at the 25 m → 3.5 m face) and broke along the bend. Andrew drew the reef as it is (his overhead screenshot; Google Earth with measurements) and chose to move it in and to slow the curl.

- [x] The reef is his satellite line (wombReef.SATELLITE_NORTH_LEDGE / SOUTH_LEDGE, in the game's frame, whose beach runs north–south): from the corner the left runs 24° for 70 m then bends to run along the beach; the south edge runs a little seaward of south. Deep water up to the face (offshoreBand from SHORE_X).
- [x] Moved in: the take-off 100–110 m off the sand ("from all the imagery"): SHORE_X 190 → 94. The land follows the pinned waterline (landHeight), back to the real coast over 600–1000 m along it; the shore platform on the reef's stretch is 40 m (SHORE_REEF_AT_MAP_M), the shelf meeting it (SHELF_INNER_X); the beach moments, the pile spot, the rain's coastline and the land mesh's 2 m level moved with it; the front end's break map re-baked on the live reef. BREAKING_MODEL 9 resets a saved reef.
- [x] One crest line: the game's swell bends as over 10 m at least (REFRACT_FLOOR_M), τ rounded over 12 m (TAU_SMOOTHING_M): the crest turns gently at the ledge.
- [x] One curl: down the line past a held section the crest waits too (crestTrace.holdDownTheLine); a second breaking section stood 60–80 m down the line. The curl runs ~9–10 m/s on the 6 ft set (Andrew chose to slow it from the reef's ~15 m/s; the ride is shorter, about 8–10 s).
- [x] Take-off: the swell reaches the south edge before the corner, so the left stands up first 40 m south of it: RIDE_START (4, 40). The ride test pops up once the face under the board is steep (as a surfer waits for it) and rides 9 s+.
- [ ] Tests that pinned the old reef (its shelf now runs onto the beach) to re-measure on the new one: breakingField, reefCriteria, barrelSize, hollowFace, peakFace, reshapedReef (round 2), bathymetry, coastProfile, shoreReef, surfModel, foamStep, landHeight, skyline, sunlight, sprayEmitters and others (58 at this commit).
- [ ] GPU self-test on Andrew's PC, including the new one for the game's sheet with the white water (breaker filter).

### Found in Andrew's seventh look (2026-10-05): "the wave is TINY for a 6 to 8 ft swell... it does the same at 12 ft"

The 6 ft set's biggest wave (3.17 m out at sea) stood ~2 m at the curl, ψ 0.03 (oval), and 12 ft the same. Two causes, measured along the left: the 25–30 m basin in front of the reef, ringed by the coast's 13 m, spread the swell out (it reached the face at 0.6–0.85× its open-sea height; round 2's narrow point focused it to ~1.1×); and the peel stretch held each section up to 6 s, in which it ran 20–40 m on over the flat 3.5 m shelf, where the sheet caps a crest at 0.78 × the depth (~2.7 m, less over heads) and the step reads 1 (oval). Without the hold the reef breaks the wave on its face, in 7–15 m of water.

- [x] The peel stretch is off (BreakParams.peel 1); a 1.4 stretch held only 1.5 s still made the take-off oval. The curl runs at the reef's own speed: 11–18 m/s on the first leg at 4–8 ft (the surfer's top speed is 18); 10–12 ft at low and mid tide break further out, where the swell runs faster, 19–25 m/s.
- [x] The basin is 20 m (faceBaseDepthM, slopeDepthM 20, not 25/30): the wave reaches the face at ~1× its open-sea height.
- [x] The step looks STEP_AHEAD 2.5 depths ahead, not 1.5: a 12 ft wave starts breaking 25–45 m out from the edge over the face's 18 m foot, and 1.5 depths never reached the ledge.
- [x] Measured (biggest wave of the set, mid tide): 6 ft curl 3.3–4.1 m, 12 ft 5.3–7.9 m, hollow 1 the length of the first leg; 3 ft stays soft. BREAKING_MODEL 10 resets a saved peel and reef.
- [x] Take-off: G puts you 8 m seaward of where the wave starts breaking on the ray through the south ledge's take-off mark (ride/takeoff.ts), since bigger waves break further out. The ride test rides 6 and 12 ft for 10 s+.
- [ ] The shading Andrew circled at 12 ft, overcast (a flat beige patch on the water, a dark green ellipse): needs his moment link.

### Found in Andrew's eighth look (2026-10-05, 7 and 12 ft, his screenshots in the session's scratchpad 7–11.webp)

GPU self-tests after da616ab: to rerun (breaker 11/12 and ribbon 5/7 before it: two tests had nothing to check, one front sample 2.6 cm off).

1. From the lineup a swell line still bends at a right angle on the south side (fading before it breaks), and a kink at
   the north end of the breaking section. Overhead, the curl's end turns a right angle instead of lining up into a wall,
   and as it breaks the plan shape is a V wedge. Measured (τ and amp maps, scratchpad tau_cmp3.png): the 20 m basin
   (25–30 before) is ringed by the coast's 13 m; the first-arrival swell races through it and bends hard at its south wall
   (z ≈ 200–300) and at the ledge (shelf read as 10 m), with a 0.5× shadow and caustic streaks south of the corner. A 14 m
   basin, about the coast's own, gives near-straight lines and amp ~1.0–1.1 (the old 6 ft test: amp 1.03–1.07, first leg
   ~15.8 m/s). Floor 20 straightens the grid but tears at its south edge. Also a seam at the reef grid's south edge
   (z = 300) near the shore. Plan: basin 14 m (re-measure size, hollowness with STEP_AHEAD 2.5, peel); the grid-edge seam;
   then the north-end kink (the front's lean switching on along the crest).
2. Inside the 7 ft barrel: still a step at the foot, and the barrel should be rounder and more hollow. The profile's foot
   (floor knot −0.30, trough −0.36 units) stands above the sheet's trough in front (−0.45 to −0.6 units): the water drops
   off a bench in front of the foot. Plan: stretch the profile's under-sea part so its trough is the sheet's trough
   level (the foot the lowest point, the water drawn up the face from it); compare the tube's shape with his photos.
3. An "ugly blob" just past where the lip lands (inside view), and a white streak at right angles to the crest from the
   lip's end (overhead): to find (impact spray or foam placement).
4. 12 ft from the shoulder: the back of the wave is nearly flat, at sea level, with a slight step, instead of a crest
   standing above sea level. Suspect: the sheet behind the profile's crest is capped by the shelf's depth and lowered by
   the bore, so the back hands over to a much lower sheet. To measure (cross-sections at 12 ft).
5. He could not get the rider to stand up at 7 ft. The bot catches and rides 6 and 12 ft from takeoffSpot. To find out
   which event stops him (tooSoon: not caught; or wipeout at once: foam or a face past WIPEOUT_SLOPE after the pop-up).
6. Still open: the shading at 12 ft overcast (needs his moment link); the wall easing off down the line (his G-Land
   photo); 40 old tests to re-measure.

#### Done on the eighth look (2026-10-05)

- [x] GPU self-tests: breaker 12/12 after da616ab; ribbon 6/7, one front sample 5.2 mm off at ψ 0.03 phase 1.9 (the floor's
  mark one sample apart, the sample at the mark just past the floor knot): the front now starts one sample before the mark
  on both (wombSection.FRONT_FROM_MARK), 63f11a2. To rerun on ac88408 (both filters: the bore and the seat are new GPU code).
- [x] Right-angle swell line: the coast offshore is 20 m (coastProfile.REEF_SURROUND_DEPTH_M, was 13), the reef basin's own
  depth, so the deep water in front of the reef is open to the sea; the reef's cap near the beach deepens from the coast's
  own depth there. A 14 m basin also straightened the lines but 6–8 ft broke over its flat floor short of the ledge, soft
  (low tide 6 ft hollow 0.42, 8 ft 0.18). With the coast at 20 m: first leg hollow 1 at 6 and 8 ft every tide, 13–17 m/s;
  10 ft barrels at mid and high tide. BREAKING_MODEL 11; break map re-baked. fdd0988.
- [x] V wedge in front of the curl: the bore scaled the whole wave, raising the trough in front of the broken section; it
  now keeps the swell's troughs (setWaveModel.boreSettle, CPU and GPU). 8–24 m in front of the wave the water stepped
  0.9 m along the crest at the curl; now 0.4 m over ~20 m. fdd0988.
- [x] The bench at the foot: the drawing's flats are about still water, the sheet's water in front is the swell's trough
  0.4–0.5 A down; the profile is seated on it (wombSection.seatScale/seatedY: stretched down from the crest so the trough
  knot lies 0.12 A under the sheet's water at the front knot), CPU, GPU (fourth frame vec4) and the ride's water. The foot
  is the lowest water, the face and tube 10–30% taller. ac88408.
- [ ] The lip never lands in Andrew's drawing (its tip 0.23–0.32 A over the water under it through the barrel). Proposed:
  the round barrel's tip at −0.36 (was −0.14), landing 0.02–0.08 clear from phase 0.95 to 1.05; lowered at 1.25 too, the
  tip rose through the closing pocket at 1.4. Patch and before/after drawing in the session's scratchpad; needs Andrew's
  sign-off (and then `node tools/drawWombProfiles.ts --freeze`).
- [ ] Pop-up at 7 ft: the ride bot stands up and rides from G's spot on fdd0988 and on the build Andrew tested (da616ab),
  with and without the 33 km/h offshore wind, pressing at the catch (5.4 s after G) or up to 0.5 s after; the board is
  "caught" for only ~0.5 s, before that a press is "Not yet". Ask Andrew which message he saw.
- [ ] A band of focused swell from the reef's corner runs through the take-off (crest height +15% along one ray, a ridge on
  the wave's back behind the curl). The drawn field's smoothing at σ 18 m spreads it without changing the sizes (7 ft local
  H max 5.56 → 5.30 m) but did not clearly remove anything Andrew pointed at: held.
- [ ] The white-water block after the collapse (phase 1.3–1.6: a flat-topped hump 1.6 m high at 7 ft with a steep front):
  Andrew's "ugly blob"? To look at on the new build.
- [ ] Tide (Andrew's Copilot notes): high tide fat and not barrelling, mid standing up, low the hollow slab. The model
  barrels at high tide from 6 ft. Andrew to decide.
- [ ] Tests moved by the deeper coast, to re-measure with the 40 older ones: breakingField slurp (12 ft: the far shoulder's
  water 0.1 m lower than the near one's; the peak 0.94 of the shoulders, wants 0.95), the pile never growing (1 cm),
  overturnProfile's lip growth, tubeLight 8 ft low tide.

### 3e. Andrew's look (his PC)

- [ ] Captures of the left at 6, 8 and 10 ft, mid tide, from the lineup and the ride camera. His sign-off before step 4 removes the old code.
- [ ] Watch (Andrew, 2026-10-05, from the film strip): "the edges seem a little sharp after the barrel": the white water's steep front as the tube caves in (phases 1.25–2). Judge in the game before changing the collapse keys.
