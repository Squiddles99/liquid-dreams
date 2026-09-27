# Liquid Dreams Phase 2 ("The break") Design

**Date:** 2026-09-27
**Authors:** Claude, delegated by Andrew Justice
**Status:** Implemented overnight on the `phase-2-the-break` branch (2026-09-27); awaiting Andrew's review. Plan-level rulings P1–P11 are in the plan. Not merged.
**Builds on:** the vision spec (`2026-09-25-liquid-dreams-first-light-design.md`) and Phase 1 (`2026-09-26-reef-and-sets-design.md`). Their world conventions, "one source of truth for water height", deterministic moments, CPU-model/GPU-mirror testing and GPU budget all still apply.

---

## 1. What Andrew should see

He wakes up, double-clicks the launcher and calls a set (`N`). The set waves stand up on the ledge as before, but now the biggest ones **break**:

- **The drain.** As a set wave reaches the ledge, the water in front of it drains off the reef and the trough deepens. The face grows taller and steeper than the swell alone would make it.
- **The throw.** At the peak the crest pitches forward and the lip throws out over the face.
- **The barrel.** The lip curls over and lands ahead of the face, leaving a tube. The break **peels left (north) along the reef edge**, about 14 m/s at the default swell, because the Phase 1 field already brings the crest along that edge in order. Behind the peel the wave has collapsed; ahead of it is the steep unbroken shoulder.
- **The right closes out.** South of the peak the wave reaches the south ledge almost everywhere at once, so it pitches along a long section together and doesn't peel.
- **The turquoise lip.** Where the lip is thin and the sun is behind it, light shines through it turquoise.
- **Whitewater (placeholder).** Where the lip has landed, the broken wave turns white and rolls on across the shelf as a bore. Real whitewater, spray and spit are Phase 3. Here it is foam colour only.
- **Every wave unique.** Smaller set waves may not break on the ledge at all. They stand up and roll through, or break later over the shallower shelf. Tide changes where waves break and how hard.

Phase 2 is still eye-candy plus physics. There is no surfer, no board and no gameplay yet.

## 2. Scope

**In:**
- breaking onset;
- the drain and the step;
- throw, curl and tube;
- collapse to a bore;
- the peeling left and the closing-out right (both emergent from the reef field);
- turquoise lip transmission;
- a foam placeholder;
- surfer-feet calibration readout;
- dev tools, reference moments and GPU self-tests;
- a performance pass.

**Out:**
- lip impact splash, spray, spit, and foam that lasts and dissolves (all Phase 3);
- sound (Phase 5);
- land (Phase 4);
- refraction of the scene through the barrel (the inside of the tube uses the existing water shading);
- a surfer.

## 3. How the break works

### 3.1 Where and when a wave breaks (Ruling R1: a local breaking criterion driven by the field)

Each set wave already has a local unbroken height `H = min(Hwave · amp, …)`, and the field carries `hmin`, the minimum still-water depth met along its ray, which never increases as the ray travels shoreward. The drain lowers the depth the crest actually feels. With effective depth

`h_eff = max(hmin − δ · H, h_floor)`

the wave breaks where

`r = H / (γ · h_eff) ≥ 1`

The constants:
- `γ = 0.78`, the classic breaker index;
- `δ = 1.0`, the drain: water sucked off the ledge. Andrew: "20 ft deep… when a wave comes and slurps the water up, it goes to about 4 foot deep";
- `h_floor = 0.3 m`.

With these values a wave breaks once `H ≥ 0.44·hmin`. That puts breaking at about **2.6 m over the 6 m ledge**, so the default 4 ft set waves (2.3–3.1 m at the peak) break there, and smaller ones don't.

**Breaking stage.** The stage is `s = smoothstep(1, 1 + Δ, r)`, where Δ (the "stage span") sets how far the crest travels while the lip curls. `hmin` never increases along the ray and H grows while the wave shoals, so s only rises as the crest moves shoreward. A section never un-breaks.

**Why this peels and closes out without being scripted.** Along the north ledge each cross-section reaches `r = 1` when the crest reaches the ledge, and the field already delivers the crest along that edge in order, at the 14 m/s peel. Along the south ledge the crest arrives almost at once (Phase 1: first 40 m within about 0.8 s), so a long section breaks together and the right closes out. Andrew's drone shot shows a longer closeout. The reef shape is his main lever for that; see the follow-ups list.

**Tuning target (acceptance).** At the peak, the biggest default wave takes **0.6–1.5 s** from onset (s > 0) to tube closure (s ≥ 0.75). Δ is tuned to hit that.

### 3.2 The shape (Ruling R2: a curl rotation on the existing wave profile)

**The frame.** Each set wave is a single crest (Phase 1 model). In the vertical plane along the wave's local travel direction, a surface point has an unbroken position: `u` ahead of the crest and height `η`, from the Phase 1 Stokes profile plus pitch. Breaking adds displacement in that plane only, driven by s:

**1. Steepen and drain, s ∈ [0, 0.25].**
- Pitch grows, so the crest leans forward, reusing the Phase 1 pitch term with a larger cap while breaking.
- The trough just ahead of the crest deepens by up to `δ·H·drain(s)`, localised in front of the face. This is the drain, and the step appears where it meets the face.

**2. Throw and curl, s ∈ [0.15, 0.8].**
- Points in the upper part of the wave rotate forward and down about a **pivot** on the front face.
- Lip weight: `w(η) = smoothstep(η_lip, A, η)`. The lip zone is roughly the top 40% of the wave height.
- Rotation angle: `θ = Θmax · curl(s) · w(η)`, with `Θmax ≈ 160°`.
- Points near the crest swing furthest, so the lip throws out and down over the face and leaves a tube underneath.
- The pivot sits on the front face, about 0.35·H below the crest and a little ahead of it. All constants are named and tunable.

**3. Collapse, s ∈ [0.75, 1].**
- The lip has landed. The curled geometry relaxes back towards a low, rounded **bore** profile.
- The wave's height decays towards `H_bore = β·hmin`, with β ≈ 0.4, over the post-break distance.
- The foam mask rises to 1 behind and at the crest.

**No self-intersection.** For every stage, the cross-section curve must not cross itself, except the tube-closing contact where the lip tip reaches the trough ahead (s ≈ 0.75). The CPU tests check this on sampled cross-sections.

**Along the crest.** s varies smoothly along the crest because r does. One wave shows all stages at once: collapsed behind the peel, a tube at the peel, a steep shoulder ahead. That is the barrel.

### 3.3 Normals (Ruling R3: finite differences in the vertex stage)

The curled lip overhangs, and the analytic slope from Phase 1 can't represent a normal that faces down under the lip. So the vertex stage evaluates the set-wave displacement, including the curl, at the vertex and at two neighbours `ε` away along x and z, with ε scaled to the polar grid's local cell size. The normal comes from the cross product of the displaced tangents, which handles overhangs correctly.

The result replaces the analytic set-wave slope varying. The FFT detail normal is still added as in Phase 1.

- **Cost:** three set-wave evaluations per vertex. They're cheap away from waves thanks to the Phase 1 envelope early-out and activeCount gating.
- **Fallback if over budget:** use finite differences only where a breaking wave is near (s > 0 in any active wave), and the analytic slope elsewhere.

### 3.4 Height probe (Ruling R4: the probe reads the unbroken surface)

The camera and probe ride the **unbroken** set-wave surface: the Phase 1 displacement plus the drain, but no curl. An overhanging lip has no single height at a point. The probe keeps using the shared displacement function with a flag that leaves the curl out, so there is still one formula.

### 3.5 The turquoise lip (Ruling R5)

Crest transmission, a Phase 0 follow-up that was keyed to absolute height, now uses a **lip mask**: thin lip geometry that is curling, `sin(θ)·w(η)`, raised during the throw. It uses the existing transmission colour and backlight term. Where the backlit, curling lip faces the viewer, it glows turquoise.

### 3.6 Foam placeholder (Ruling R6)

The set-wave sum outputs a foam weight, rising with s over [0.75, 1] and trailing behind the crest. That weight is combined with the FFT foam using `max`. Phase 3 replaces it with real whitewater.

### 3.7 Surfer-feet calibration (Ruling R7)

The Sets folder reads out the biggest wave currently breaking at the peak: its **face height**, crest to drained trough, in feet and metres, and whether it is breaking. `SURFER_FT_TO_HS_M` stays as it is. With the drain, the default 4 ft sets break at the peak with faces of about 2.5–3.5 m. Andrew calibrates the dial against his feel of the Womb using that readout.

## 4. Architecture

- **`src/breaker/breaking.ts` (new, pure CPU):**
  - `BreakParams`, with defaults for γ, δ, h_floor, Δ, Θmax, pivot, lip zone, β, and the drain and collapse spans;
  - `breakingRatio`, `breakingStage`;
  - `curlDisplacement(u, η, A, s, p) → { du, dy }`;
  - `drainDepth`, `lipMask`, `foamWeight`, `boreHeight`.
  - It is the documented source of the shape. The CPU tests live here.
- **`src/breaker/setWaveModel.ts`:** `waveAt` and `sumWaves` apply the breaking terms (with an `includeCurl` option) and return `du/dy` along travel plus `foam` and `lip`. They keep the Phase 1 results when no wave breaks (s = 0 everywhere): an exact reduction, which is tested.
- **`src/breaker/SetWaves.ts`:** the TSL mirror, term by term, with break uniforms. Additions:
  - a render-only `displacementWithBreakNormalNode`, which gives displacement plus a finite-difference normal plus foam plus lip through varyings;
  - the probe path, which uses displacement without the curl.
- **`src/ocean/waterSurface.ts`, `OceanSurface.ts`, `waterShading.ts`:** carry the new varyings. The normal combines the finite-difference set-wave normal with the FFT detail. Transmission is keyed to the lip, and foam uses `max`.
- **Dev:** a **Break** panel folder (γ, δ, Δ, Θmax, β, and a "breaking" toggle to compare with Phase 1) and the Sets readout from §3.7. Break params persist with the other look params (Phase 1 persistence).
- **Reference moments:**
  - `barrel-peeling`: a drone in the channel north-west of the peak, looking south-east down the line as the biggest wave peels towards it;
  - `closeout-right`: the south ledge section;
  - `the-drain`: the lineup camera low, looking at the face as it drains.
  All are 'set' kind moments, timed from `REF_BIGGEST`.

## 5. Performance (Ruling R8: start with a performance pass)

The budget is still about 3 ms at 2560×1600 on Andrew's RTX; Phase 1 finished at 2.35–3.36 ms. Two changes come first:
- gate the seabed lighting on a march hit, the final review's Minor 6;
- make sure the break costs nothing when no wave is breaking.

Measure after the break lands. The levers, in order:
1. finite-difference normals only near breaking waves;
2. `MARCH_STEPS` 14 → 12;
3. fewer FFT normal cascades near the horizon.

## 6. Testing

- **CPU (vitest):**
  - stage monotonicity along a ray;
  - the exact Phase 1 reduction when r < 1 everywhere;
  - cross-section curves free of self-intersection at sampled stages;
  - drain and bore heights finite and bounded;
  - onset along the north ledge peels at the field's rate (the time of first s > 0 increases along the ledge, at 8–20 m/s);
  - the south ledge's first 40 m breaks within ≤ 1.5 s;
  - a 1.3·Hs wave does not break at the ledge while a 1.8·Hs wave does (default conditions);
  - extremes (12 ft / 25 s / −1.5 m tide; 0.5 ft) stay finite;
  - the tuning target in §3.1.
- **GPU self-tests:** the curl displacement, foam and lip on the GPU match the CPU at sampled points during a breaking moment, including the tube and the collapse. The count goes to 19 or more.
- **Acceptance (controller):**
  - `?selftest` all pass;
  - GPU ms at full resolution on `barrel-peeling`;
  - a screenshot gallery saved to `docs/superpowers/gallery/phase-2/`, committed so Andrew can view it on GitHub.

## 7. Risks

- **The curl looks like a rigid rotation.** Mitigation: w(η) smooth, curl(s) eased, and the pivot moving with s. Andrew's review is the real test.
- **Finite-difference normals cost too much.** Mitigation: the §5 levers.
- **Grid resolution at the lip.** Polar grid cells are about 1.6 m at 100 m, so a 1 m-thick lip seen from 100 m is under-resolved. The reference views sit within about 60 m of the barrel, and the risk is accepted for Phase 2.
- **Transitions at the envelope edges** are handled by the Phase 1 envelope, and the stage is per-wave.

## 8. Rulings made without Andrew

R1 the breaking criterion and constants (including δ = 1.0 for the drain); R2 the curl rotation; R3 finite-difference normals; R4 the probe reading the unbroken surface; R5 the lip mask for transmission; R6 foam as a placeholder; R7 the calibration readout instead of changing the surfer-ft mapping; R8 the performance pass first. The plan may be less prescriptive than Phase 1's, with interfaces, formulas and tests instead of complete code, so that opus implementers can handle the open-ended shader work.

**Plan-level corrections P1–P11** (found by prototyping the formulas on the real Phase 1 field while writing the plan; recorded in `docs/superpowers/plans/2026-09-27-the-break.md` and binding over the sections above where they differ):
- **P1:** the stage is read at the crest.
- **P2:** H in the criterion is uncapped.
- **P3:** steepening sharpens the heights, and the pivot is 0.65·H below and 0.65·H ahead of the crest.
- **P4:** the lip is windowed to the crest.
- **P5:** the visible drain is 0.35·δ·H. The biggest default wave's face is about 4.1–4.3 m, not 2.5–3.5 m.
- **P6:** Δ = 1.0 (tube closes in 0.78 s).
- **P7:** a 1.1·Hs wave doesn't break at the ledge; 1.3·Hs and 1.8·Hs waves do.
- **P8:** the peel test uses a 1.8·Hs wave, and `barrel-peeling` is shot at 5 ft.
- **P9:** "never un-breaks" holds in the barrel zone only.
- **P10:** the normal's neighbours reuse the vertex's field sample; the probe variant leaves out the sharpening and the curl.
- **P11:** crest transmission is replaced by the lip mask, and the material is double-sided.

