# Liquid Dreams Phase 2 Rework ("The breaking ribbon") Design

**Date:** 2026-09-27
**Authors:** Claude with Andrew Justice
**Status:** Approved by Andrew (2026-09-27). Plan: `docs/superpowers/plans/2026-09-27-breaking-ribbon.md`, whose plan-level rulings Q1–Q12 (from prototyping on the real field) refine this spec where they differ; see §14.
**Revises:** the Phase 2 spec (`2026-09-27-the-break-design.md`). This document **supersedes its §3.2 (the shape), §3.3 (normals), §3.5 (the turquoise lip) and §3.6 (foam)**, and plan corrections P3, P4, P10 (sharpening/curl part) and P11. Everything else in it stands: the breaking criterion and stage (§3.1, P1, P2, P5–P9), the probe (§3.4), the calibration readout (§3.7), the Break panel, the reference moments, persistence, the GPU budget, and the CPU-model/GPU-mirror testing rule.
**Branch:** `phase-2-the-break` (Phase 2 is not merged; the rework lands on the same branch).

---

## 1. Why

Andrew's review of the overnight build: the swell is realistic, but the break is not. The lip is jagged, the water surface gets holes in it, and from behind the wave the water looks wrong: flat "tabletop" backs ending in a cliff, stripy walls, and hard-edged turquoise patches.

The cause is structural. The ocean is one height-mapped sheet (a polar grid of 384 segments, about 0.5 m cells at 30 m and 1.6 m at 100 m). A sheet can't fold over itself, so bending it into a curl stretches, flips and tears triangles, and a 30–60 cm lip falls inside one or two cells. Tuning can't fix that.

## 2. What Andrew should see

- **From the channel, the lineup and behind (20–100 m):** a smooth, clean lip edge, with no steps, holes, folds or see-through patches from any angle. The back of the wave is a long rounded slope with no tabletop.
- **Up close (5–10 m, floating near the shoulder):** the lip throws over with a crisp, glassy edge and visible thickness. The tube is a real hollow, and the face under it goes concave.
- **The motion:** the lip leaves the crest and falls under gravity, landing ahead of the face, then the curl collapses into a foamy bore that rolls on across the shelf.
- **Unchanged from Phase 2:** where and when waves break, the drain, the left peeling at the field's rate, the right closing out, every wave different.
- **Inside the tube** (the eventual surfer's view) is **not** a target for this rework, but the design must allow it later by adding detail, without starting over.

Whitewater, spray, spit and a feathering lip remain Phase 3 (§8).

## 3. Decisions

**Made with Andrew (2026-09-27):**
- **D1:** draw the breaking part of each wave as its own purpose-built mesh, the **breaking ribbon**, instead of deforming the ocean sheet (approach A). Rejected: raymarching an implicit wave (too costly per pixel up close, and shaded differently from the ocean); a denser sheet (still can't overhang).
- **D2:** the lip's shape and timing come from a **gravity-thrown lip** (a ballistic jet), tuned to Andrew's photos. An offline 2D breaking simulation is a possible later upgrade (the profile is isolated in one module so its results could replace it).
- **D3:** the rework must hold up **from about 5 m**, and must not preclude inside-the-tube views later.
- **D4 (foam):** foam comes from the explosive energy of the break. It appears where the wave turns itself inside out (the plunge and landing zone), not on the throwing lip or on the clean face ahead. As a set rolls through, the foam a surfer sees on their wave is mostly residual foam left by the previous waves; that persistent foam is Phase 3 (§8).

**Claude's calls, for Andrew's review of this spec:** R1–R10 below, each marked where it appears.

## 4. Architecture

```
CPU, per frame                         GPU, per frame
─────────────────────────────          ─────────────────────────────────────────
ReefField + active waves + camera ─►   stations buffer ─► ribbon compute pass ─► ribbon vertex buffers
  crestTrace.ts: stations                                   (profile per station × sample)      │
  (lipProfile.ts: CPU reference)                                                                  ▼
                                       footprint pass ─► footprint mask ─► ocean sheet skips   ribbon mesh draw
                                                                            covered pixels     (water shading)
```

- **`src/breaker/crestTrace.ts` (new, pure CPU):** traces each wave's crest line into stations (§5).
- **`src/breaker/lipProfile.ts` (new, pure CPU):** the cross-section curve at a station: the source of truth for the ribbon's shape (§6). Tested on the CPU.
- **`src/breaker/lipProfileNodes.ts` (new):** the TSL mirror of `lipProfile.ts`, term by term (Phase 1 and 2 practice: one formula, CPU tests, GPU self-tests prove the mirror).
- **`src/breaker/BreakingRibbon.ts` (new):** owns the stations storage buffer, the compute pass that evaluates the profile into vertex buffers, the fixed index buffer, the ribbon mesh, and the footprint pass (§7).
- **`src/breaker/breaking.ts`:** keeps the criterion, stage, drain, bore and foam weights. Loses `curlDisplacement` and the lip mask. `BreakParams` changes as in §9.
- **`src/breaker/setWaveModel.ts` and `SetWaves.ts`:** the sheet's set-wave surface becomes the **probe variant everywhere**: Phase 1 plus drain plus bore, with no crest sharpening and no curl. So the sheet draws exactly what the height probe reads. The render-only `displacementWithBreakNormalNode` (finite-difference normals) is removed; the sheet uses Phase 1's analytic slope again.
- **`src/ocean/OceanSurface.ts`, `waterSurface.ts`, `waterShading.ts`:** the sheet is single-sided again, and skips pixels the footprint mask covers. The water shading is shared with the ribbon (one shading function, two meshes).
- **Removed:** the heightfield curl, the sheet's finite-difference normals, the double-sided material, and the sheet's lip mask.

## 5. Stations: tracing the crest (CPU, per frame)

For each active set wave, the crest line is where `ξ = 0` (`phaseXi` in `setWaveModel.ts`).

**Tracing.**
1. Seed on the crest nearest the peak with the existing crest lookup (Newton steps along the wave's travel direction).
2. March along the crest both ways. Each step moves along the crest tangent (perpendicular to the local travel direction) and re-projects onto `ξ = 0` with one or two Newton steps.
3. Stop a side when the crest leaves the field grid, reaches the Phase 1 crest taper, or has had `r < r_on` (§6.1) for 20 m.

**Spacing (R1).** The step is `clamp(0.008 × distance to camera, 0.08 m, 4 m)`: about 8 cm near the camera, a few metres far away. That is roughly 1000 stations per breaking wave with the camera 5 m from the lip. There is a hard cap of `MAX_STATIONS = 2048` over all waves; above it, the spacing scales up uniformly.

**Each station records:**
- crest position `(x, z)` (undisplaced) and arc length along the crest;
- unit travel direction;
- `H`, `hmin`, `depth`, `k`, crest speed `c = ω/k`;
- the breaking ratio `r` and the Phase 2 stage `s` (read at the crest, as P1);
- the ribbon weight `ρ` (§6.1);
- **time since onset `t_b`** (R2): how long ago this cross-section's crest first reached `r ≥ 1`. It is found by marching back along the ray (against the travel direction) over a look-back window of `c × (τ_land × (1 + collapseTime) + 1 s)`: the onset is the earliest point in travel order within the window where `r ≥ 1`, and `t_b` is the distance from there to the crest divided by the mean crest speed over it. If no point in the window has `r ≥ 1`, the section hasn't broken (pre-break, §6.1). To keep the CPU cost down, `t_b` is computed at key stations at most 2 m apart and interpolated between them.

Stations whose ribbon weight is 0 (not yet steep enough, or already handed back) are dropped and leave a gap entry, so they cost nothing on the GPU.

Using the real time since onset, not the stage, makes the lip truly ballistic. A thrown lip keeps falling and lands even if the crest then moves into deeper water, which removes P9's "never un-breaks only in the barrel zone" caveat for the ribbon.

**Determinism.** Stations are a pure function of the field, the waves, the time and the camera position, so moments replay exactly. The camera only moves station spacing, never the shape at a given point: a station's profile depends on its position only.

**Budget.** Tracing, including `t_b`, stays at or under 1 ms of CPU per frame at the Womb's defaults. A CPU test measures it.

## 6. The cross-section (`lipProfile.ts`)

Everything happens in the station's vertical plane: `u` forward along the travel direction from the crest's undisplaced position, `y` up from still water. The profile is a curve `C(v)`, with `v ∈ [0, 1]` running the water's surface outline in one line:

> front edge (trough ahead) → face → tube wall → underside of the lip → tip cap → outer surface of the lip → crest → back slope → back edge (trough behind).

Water is always on the same side of the curve, so normals are consistent and the ribbon is single-sided.

### 6.1 Before breaking (`t_b < 0`)

- **The ribbon fades in** with `ρ = smoothstep(r_on, r_full, r)`, where `r_on = 0.5` and `r_full = 0.7` (R3). From onset (`t_b ≥ 0`), `ρ = 1` whatever `r` does afterwards, until the hand-back (§6.3). While `ρ < 1`, the curve is exactly the sheet's unbroken profile (Phase 1 plus drain), sampled along its length. The ribbon and the sheet then describe the same surface, and the ribbon only adds resolution. That fixes the stripy walls on steep unbroken faces.
- **Steepening (ribbon only)**, for `r ∈ [r_full, 1]`: the face steepens towards vertical at onset and the crest sharpens slightly. The sheet can't draw this, and it doesn't need to: the footprint mask hides the sheet wherever `ρ > 0` (§7.2).

### 6.2 The throw (`0 ≤ t_b < τ_land`)

In the wave's frame the crest `K` sits at the top of the steepened face. The lip is the stream of water ejected forward from `K`.

- **Launch speed** relative to the wave: `v_j = throwStrength × c`, horizontal, with `throwStrength` defaulting to 0.35 (R4).
- **Water ejected at successive moments follows the same parabola.** So the lip's outer surface is the arc `y = K.y − ½ g (Δu / v_j)²` for `Δu ∈ [0, v_j t_b]`. The tip is `P = K + (v_j t_b, −½ g t_b²)`.
- **Landing** is when the tip reaches the drained trough level `y_T` ahead of the face: `τ_land = √(2 (K.y − y_T) / g)`. For a 2.5 m wave this is about 0.7 s and 1.5–2 m ahead of the face, consistent with the Phase 2 tuning target (0.6–1.5 s from onset to closure).
- **The underside** is the outer arc offset inward along its normal by the lip thickness. The thickness runs from `lipThickness × H` at the root (default 0.12) down to a tip thickness of `0.25 × lipThickness × H`, and the two meet in a semicircular tip cap. There is a minimum thickness of 2 cm so the lip never becomes a zero-width sheet.
- **The face and tube wall** run from the front foot `F` up to the underside's root: a smooth Hermite curve, tangent to the trough at `F` and to the underside at the root. It goes concave, then vertical, then overhanging near the top as the lip extends.
- **The back** runs from `K` to the back edge along the unbroken back slope, raised to meet `K` smoothly. It is never flat.

### 6.3 Landing and collapse (`t_b ≥ τ_land`)

- At `τ_land` the tip touches the trough and the tube closes.
- **The collapse** runs over `collapseTime × τ_land`, with `collapseTime` defaulting to 1.0. The whole curve eases towards the sheet's bore profile (Phase 2's β·hmin bore at this position).
- **The hand-back** runs over the next 0.5 s: the ribbon blends entirely into the sheet's surface, `ρ` falls to 0, and the sheet (drain plus bore plus Phase 2 foam) carries the bore across the shelf.

### 6.4 The edges and the background ocean

- **Edges.** The front edge sits at `u_front = max(faceWidth × H, u_land + 1 m)` ahead of the crest, clear of where the lip lands. The back edge is `backWidth × H` behind. Over the last 2 m before each edge (R5), the curve blends to the sheet's surface: exactly the sheet's height formula, swell and chop included. The heights meet by construction.
- **Background ocean.** The FFT swell and other set waves carry the ribbon. FFT cascades 0 and 1 (3000 m and 250 m, waves several metres long or more) apply in full across the whole cross-section. Cascade 2 (35 m chop) applies in full on the face and back slope and fades out over the lip, the tip cap and the underside, so the throwing lip stays glassy (R6). Other set waves' contributions add everywhere.

### 6.5 Self-intersection

For every `t_b < τ_land`, the curve must not cross itself. From landing on, self-contact is allowed: the tube has closed and the curve is collapsing under foam. The CPU tests check this on sampled stations and times, across the default conditions and the extremes (Phase 2's list).

### 6.6 Profile sampling (R7)

`M = 160` samples per station, spread by segment so detail sits where the eye goes:
- face and tube wall: 40
- underside: 28
- tip cap: 12
- outer lip: 40
- back slope: 40

Near the camera (8 cm station spacing), that gives lip samples a few centimetres apart. An inside-the-tube view later only raises `M` and lowers the spacing floor.

## 7. The ribbon on the GPU (`BreakingRibbon.ts`)

### 7.1 Mesh and compute

- **The stations** upload each frame into a storage buffer (at most `MAX_STATIONS` entries). A flagged gap entry separates waves.
- **A compute pass** evaluates the profile (`lipProfileNodes.ts`) for every station × sample. It writes position, normal, foam weight and lip-thickness into storage buffers, blending along the crest by the stations' interpolation.
- **The normal** is exact: the cross product of the curve's derivative in `v` with the along-crest derivative (from neighbouring stations), plus the FFT detail normal weighted as the chop in §6.4.
- **One fixed index buffer** covers the `MAX_STATIONS × M` grid. The draw range is set to the stations in use, and triangles touching a gap entry collapse to zero area.

### 7.2 Joining the sheet (the seam)

- **Footprint mask.** Each frame, a small top-down pass renders the ribbon's footprint wherever `ρ > 0` into an 8-bit mask over the field grid (0.5 m texels). The footprint is shrunk by 1 m inside each edge. The sheet's fragment stage discards pixels where the mask is set, so the sheet's unbroken wave never pokes up inside the tube or through the steepened face.
- **Overlap.** Between the shrunk footprint and the true edges (at least 1 m, within the 2 m edge blend), both surfaces draw the same height with the same shading, so any depth fighting there is invisible.
- **Skirt.** Each ribbon edge carries a 0.3 m strip tucked downward under the water, so any sliver between the two meshes shows water, not sky or seabed.
- **Along-crest ends.** Where `ρ → 0`, the ribbon's curve is the sheet's own surface (§6.1). It fades out with no step.

### 7.3 Shading

- **Shared water shading:** sky reflection, sun glitter (the existing GGX), depth colour and the seabed look-through. It is refactored so the sheet and the ribbon call the same function.
- **Turquoise lip:** the transmission is driven by the lip's real thickness from the profile. The thinner the lip and the more the sun is behind it, the more turquoise light comes through. This replaces Phase 2's lip mask. `lipSkyTransmission` stays in WaterOptics.
- **Inside the tube:** the underside and the tube wall are water shading, lit through the lip.
- **Foam placeholder (D4):** the ribbon's foam weight is 0 on the throwing lip and the face ahead. It rises at the landing point from `τ_land` and spreads over the collapsing curl, where the wave turns inside out. By the hand-back it matches the sheet's Phase 2 foam weight, so the foam continues onto the bore without a jump. It uses the same noise and contrast look as the sheet's foam.

### 7.4 The height probe and the camera

Unchanged (Phase 2 §3.4). The probe reads the unbroken surface (Phase 1 plus drain plus bore), which is now also exactly what the sheet draws. The sheet still outputs Phase 2's foam weight for the bore. The camera never rides the lip. The sheet's analytic normal (plan Q2) omits the field's gradients and the crest frame's variation along the crest, as Phase 1's normal already omits the field's gradients: it is a shading normal, not the exact derivative of the surface on the real reef.

## 8. Foam in Phase 3 (recorded, not built)

Andrew's point (D4) sets a Phase 3 requirement: **foam must persist and drift with the water.** Foam is generated where the break turns the wave inside out, then lingers, spreads and decays over tens of seconds. A later wave in the set rolls through, and rides over, the foam the earlier waves left. That needs a persistent foam field advected by the surface flow, not a per-wave weight. It is added to the Phase 3 list in `docs/superpowers/phase-0-followups.md`.

## 9. Dev tools, moments and persistence

- **Break panel.** Removed: `curl Θmax`, `pivot drop`, `pivot ahead`, `lip zone`, `lip back reach`, `curl start`, `curl end`, `steep end` and `back width` (plan Q6; the back sinking made the tabletop). Added: `throw strength (×c)` (0.1–1.5, default 0.55, plan Q3), `lip thickness (×H)` (0.03–0.3, default 0.12), `collapse time (×τ land)` (0.3–3, default 1.0) and `ribbon onset r` (0.3–0.9, default 0.5; full strength at +0.2, the steepening start floored at r = 0.95). `face width` stays: the sheet's front sharpening width and the face's foot (§6). All other Break sliders stay. `normalizeBreakParams` clamps the new fields, and stored settings holding removed fields load cleanly (the extra fields are dropped).
- **Debug overlay:** `ribbon tint` tints the ribbon so you can see where it starts and ends. It goes with the existing debug overlays.
- **New reference moments:**
  - `behind-the-wave`: Andrew's saved view (camera `[12, 3.5, -32]`, yaw 73.5°, pitch −13°, 4.65 ft, 15 s, from 225°, wind 22 km/h from 57°, seed 2002, 08:15), rebuilt as a 'set' moment on `REF_BIGGEST`.
  - `lip-close-up`: about 5 m from the lip at the peak as it throws.

  The existing `barrel-peeling`, `closeout-right` and `the-drain` stay.

## 10. The turquoise patches seen from behind (investigate first)

Andrew's `behind-the-wave` view shows hard-edged bright turquoise patches on the sheet between waves.

- **Refuted on the CPU (plan Q9):** in this moment the set-wave clamp engages at 0 of 17,161 sampled points, so the plan's Task 1 diagnoses on the GPU with pre-registered experiments. The original hypothesis, kept for the record: the drain pulls the surface below the reef, and the 5 cm seabed clamp pins the water to a skin, so the bright bed shows through with sharp edges. That would also run against the reference, where the reef at the peak reads dark navy.
- **The first plan task** confirms or refutes this with the dev overlays before the ribbon work.
- **If confirmed,** the hard clamp is replaced by a smooth, depth-limited drain: the drain's depth tapers as the local still-water depth runs out, so the surface can't approach the bed with a hard edge.
- **Acceptance:** in `behind-the-wave`, there are no hard-edged turquoise patches.
- **Result (plan Task 1, GPU, 2026-09-27):** the patches keep their shapes with the seabed look-through switched off (turning dark navy) and vanish with breaking off. They are the overnight sheet's curl-era shading: the finite-difference normal turning down near a breaking crest drives the tube-interior `underside` weight, which swaps the sky reflection for upwelling and the seabed. The tall walls are the sinking ahead of and behind the crest. Task 2 (one sheet, analytic normal, no underside, no back sinking) removes both, so there is no separate fix.

## 11. Performance

**Budget:** about 3 ms of GPU at 2560×1600 on Andrew's RTX (Phase 1 measured 2.35–3.36 ms).

- **The ribbon:** `MAX_STATIONS × M` = 2048 × 160 ≈ 330k vertices at most, typically 150–200k. One compute pass, one draw and one small footprint pass.
- **The sheet gets cheaper.** It drops the three-times-per-vertex finite-difference evaluation and the render-only sharpening.

**Levers, in order, if over budget:**
1. station spacing factor 0.008 → 0.012;
2. `M` 160 → 120;
3. the footprint mask at 1 m texels;
4. the Phase 2 levers.

**Measurement:** Andrew measures in his Chrome on `barrel-peeling` and `lip-close-up` with max fps 0. The pane can't time reliably while it's hidden.

## 12. Testing

**CPU (vitest):**
- **Profile:**
  - no self-intersection for `t_b < τ_land` at sampled stations and times (defaults and extremes);
  - the tip follows the ballistic arc and lands at `τ_land` (within 1%);
  - `τ_land` for the biggest default wave at the peak is in [0.6, 1.5] s;
  - for `ρ < 1`, the curve equals the sheet's unbroken profile (within 1 mm);
  - the edges equal the sheet's height (within 1 mm);
  - the lip's thickness never falls below 2 cm;
  - the collapse ends on the sheet's bore;
  - all values finite at the extremes.
- **Stations:**
  - every station lies on the crest (`|ξ| < 1 ms`);
  - spacing follows the camera-distance rule and the cap;
  - identical output for identical inputs;
  - `t_b` increases along the north ledge in the peel direction at the field's rate (8–20 m/s);
  - the south ledge's first 40 m has onset within 1.5 s (the Phase 2 peel and closeout tests, restated on stations);
  - tracing takes at most 1 ms of CPU at the defaults.
- **Params:** the new fields clamp and persist; old saved settings load.
- **Phase 2 tests that stay:** the criterion, stage, drain, bore, the Phase 1 reduction with breaking off, and the peak readout. Removed with the curl: the curl-displacement, lip-mask and finite-difference-normal tests.

**GPU self-tests (`?selftest`):**
- the compute pass's positions and normals match `lipProfile.ts` at sampled stations × samples during a breaking moment (tube, landing, collapse);
- the ribbon's edge heights match the sheet's GPU surface within 1 mm;
- the footprint mask covers the stations' `ρ > 0` footprint;
- the sheet with breaking on equals the probe variant.

The Phase 2 GPU self-tests that tested the curl are replaced.

**Acceptance (controller):**
- `?selftest` all pass;
- a gallery in `docs/superpowers/gallery/phase-2/` (numbered after the overnight shots): `barrel-peeling`, `behind-the-wave`, `lip-close-up`, `closeout-right`, plus one with the ribbon tint on;
- Andrew's review and GPU reading.

## 13. Risks

- **Seams between the ribbon and the sheet.** Mitigations: matched edge formulas, the overlap, the skirt, the tint overlay. The GPU self-test checks the heights.
- **The lip reads as a smooth plastic tube.** Mitigations: chop on the face and back, thickness taper, turquoise transmission. Real texture (feathering, spray) is Phase 3. Andrew's eye is the test.
- **Crest tracing breaks on odd field geometry** (the crest splitting around the reef, cusps). Mitigations: a stop when Newton fails to converge, which ends that side; a station test on the default reef across the swell directions the Womb gets.
- **Two waves' ribbons overlapping.** Set waves are a period (≥ 8 s) apart, so their ribbons (at most about 20 m wide) don't meet at the Womb. The footprint mask simply unions them.
- **The ballistic timing and Phase 2's stage disagree** (for example the sheet's bore arriving before the ribbon collapses). The hand-back blend hides small differences. A CPU test checks the ribbon hands back within 1 s of the sheet's stage reaching 1 at the peak.

## 14. Rulings for Andrew's review

- **R1:** station spacing `clamp(0.008·d, 8 cm, 4 m)`, capped at 2048 stations.
- **R2:** the lip is timed by the real time since onset along the ray, not by the stage.
- **R3:** the ribbon fades in over `r ∈ [0.5, 0.7]`, and steepens over `[0.7, 1]`.
- **R4:** throw strength defaults to 0.35 × crest speed; lip thickness to 0.12·H at the root.
- **R5:** 2 m edge blends to the sheet.
- **R6:** FFT cascades 0–1 carry the whole cross-section; the 35 m chop fades out on the lip.
- **R7:** 160 samples per station, weighted to the lip.
- **R8:** the sheet draws the probe variant (no sharpening, no curl), so the sheet and the probe are one surface.
- **R9:** a footprint mask (0.5 m texels, shrunk 1 m) plus a skirt joins the ribbon and the sheet.
- **R10:** the turquoise patches are investigated before the ribbon work, with a smooth depth-limited drain as the fix if the clamp is the cause.

**Plan-level rulings Q1–Q12** (prototyped on the real reef field while writing the plan; binding over the sections above where they differ; details in the plan):
- **Q1:** the sheet keeps a **front-only** crest sharpening (heights only), driven by the crest's breaking ratio, and the probe reads it too (sheet = probe). The back sinking is removed: it made the tabletop and the cliff Andrew saw from behind.
- **Q2:** the sheet's normal is analytic (sharpening, drain and bore derivatives), with no finite differences.
- **Q3:** the face's foot is at 1.9·faceWidth·H; the lip always lands 0.3 m clear of it; the default throw strength is 0.55 (the spec's 0.35 would be overridden by that floor). The biggest default wave's lip lands in 0.79 s, 3.1 m out.
- **Q4:** a broken section that backs off into deeper water relaxes to the sheet.
- **Q5:** the ribbon's edges are the sheet's own points (the 2 m blend is at least 2 m of pure-sheet samples).
- **Q6:** `backWidth` and `steepEnd` go; `faceWidth` stays.
- **Q7:** stations within 2 ms of the crest; CPU target 2 ms per frame (measured 1.4 ms).
- **Q8:** t_b = Infinity past the look-back window.
- **Q9:** §10's clamp hypothesis is refuted (the clamp engaged at 0 of 17,161 points), so Task 1 diagnoses on the GPU.
- **Q10:** gap rows are dead and discarded.
- **Q11:** ribbon normals come from central differences on its own grid.
- **Q12:** the peel is measured on one instant's crest: 11.8 m/s; closeout spread 0.4–0.6 s.

## 15. Andrew's second review: the break along the crest (2026-09-27)

**What he saw** (6.6 ft, barrel-peeling): square-edged channels running forward from the breaking section where the reef drains; the broken section sunk into a bowl with near-vertical walls either side of the peak; the Womb breaks like Pipeline (a long, fairly straight throwing lip), not a tight Teahupo'o bowl. GPU 4.10 ms, CPU 2.93 ms.

**Cause.** The sheet's three breaking weights switched within 1–3 m of crest: the sharpening over ~3.5 m, the drain over 1–2 m, the bore collapse in under a metre. Two things did it. First, the old ratio `H / (γ·max(hmin − δ·H, h_floor))` grows without bound as the drained depth nears its floor, which squeezes every window above r = 1 into a sliver of crest. Second, hmin jumps where one ray passed the reef's edge and its neighbour didn't. The drain's plateau (15–31 m ahead) and the sharpening's flat trough, extruded forward from each end of a section, drew the channels. The collapse dropping a broken section to its bore within half a second drew the bowl.

**Design (approved as a bounded change: "go ahead"; binding over §3.1's r and the stage windows where they differ):**
- **B1 The ratio.** `ρ = H / breakingHeight(hmin)`, where `breakingHeight = γ·max(hmin/(1+γδ), h_floor)`. It crosses 1 exactly where r did, and it is linear in H and in amp/hmin. So the thresholds stay put and the windows keep their widths along the crest.
- **B2 The breaking depth.** The field carries `hminBreak`: amp divided by amp/hmin, where amp/hmin is taken to its maximum within 6 m along the crest and then smoothed along the crest (Gaussian σ 6 m).
  - The ratio, stage and bore read it; the Phase 1 height cap still reads hmin.
  - It is along the crest only, so the right still closes out at once along the south ledge.
  - Taking the maximum first keeps the narrow wedge tip breaking at 1.29 × Hs. Smoothing alone (σ 10 m) lifted that to 1.6 × Hs.
  - It lengthens each section by 5–8 m: the longer, straighter line.
  - It rides in fieldB.w, so it costs no new texture or load.
- **B3 The drain** runs from the sharpening's start to ρ = 1 + drainEnd·Δ, beginning as the wave stands up. It is shaped as a hollow at the foot: sink(a) × a Gaussian over half a quarter wavelength, gone by half a wavelength (θ gate).
- **B4 The collapse** runs over ρ ∈ [1 + collapseStart·Δ, 1 + 2.5·Δ]. Whitewater stays nearly as tall as the wave and settles as it runs over the reef. The tube still closes on the stage (s ≥ 0.75 within 0.6–1.5 s of onset, §3.1).
- **B5 Defaults:** Δ 0.7, drainEnd 0.4, collapseStart 0.5, ribbon onset 0.7 with a 0.05 fade (sharpening from 0.75).
  - The onset sits above the deep-water ρ at 6.6 ft (~0.68). The ribbon then traces the reef's sections (110 stations) rather than every crest in the set (421).
  - A stored breaking from an older model is dropped for the defaults (BREAKING_MODEL 3).
- **B6 The lip's colour.**
  - No seabed shows through the thrown lip.
  - The ribbon's steep faces take the body's sunlight through their own normal, blended by the constructed weight, so where the ribbon is the sheet it shades as the sheet. They had read brown: dim flat-water light under a reflected sunrise horizon.

**Measured:** steepest change per wave height of crest, biggest set wave at 5 and 6.6 ft.

| Weight | Old | New |
|---|---|---|
| Sharpening | 1.4–2.0 | ≤ 0.94 |
| Drain | 2.4–5.0 | ≤ 0.6 |
| Collapse | 2.7–8.3 | ≤ 0.4 |

A test pins the new bounds at 1.0 / 0.7 / 0.6. vitest 421/421; GPU self-tests 29/29. The barrel-peeling and lip-close-up cameras moved down the shoulder for the longer sections.

**Not done here:**
- The GPU budget: 4.10 ms measured by Andrew, target 3 ms. The pane's timestamps are too coarse to measure it, so the station cut is the one lever taken; Andrew's reading decides whether more is needed.
- The wave-stacking follow-up.
