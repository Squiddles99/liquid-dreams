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

- [ ] Ride water: where a station's ribbon draws (ρ > 0), `water(x, z)` is the section's height and slope there (nearest stations, interpolated along the crest); elsewhere the sheet.
- [ ] Spray, impact, spit and sound read `wombSection`'s points in place of `profileFrame`'s.
- [ ] The tube cover reads the section's phase and hollowness in place of tb and ψ.
- [ ] Switch the default reef to the reshaped one; the dev panel's reef ranges widened to it.

### 3e. Andrew's look (his PC)

- [ ] Captures of the left at 6, 8 and 10 ft, mid tide, from the lineup and the ride camera. His sign-off before step 4 removes the old code.
- [ ] Watch (Andrew, 2026-10-05, from the film strip): "the edges seem a little sharp after the barrel": the white water's steep front as the tube caves in (phases 1.25–2). Judge in the game before changing the collapse keys.
