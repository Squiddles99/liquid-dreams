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
- [ ] The game still runs on the old reef, where the 6 ft take-off's sections are 0–0.2 hollow (soft, open): switch to the reshaped reef (round 2: 0.16–0.66 there).
- [ ] The set's earlier waves inshore are drawn as clean swell lines; after their collapse they should be white water rolling in (the ribbon keeps the bore instead of handing back).
- [ ] From the shoulder the curl looks twisted, and a crease showed near the shoulder end in one frame: to look at on the reshaped reef.

### 3e. Andrew's look (his PC)

- [ ] Captures of the left at 6, 8 and 10 ft, mid tide, from the lineup and the ride camera. His sign-off before step 4 removes the old code.
- [ ] Watch (Andrew, 2026-10-05, from the film strip): "the edges seem a little sharp after the barrel": the white water's steep front as the tube caves in (phases 1.25–2). Judge in the game before changing the collapse keys.
