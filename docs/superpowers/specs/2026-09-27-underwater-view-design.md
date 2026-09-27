# Underwater view: design

**Status:** implemented 2026-09-27 (plan: `docs/superpowers/plans/2026-09-27-underwater-view.md`). Approved by Andrew 2026-09-27.

## 1. What Andrew asked for

Below the surface the camera shows the sky dome's upper half and its black lower half, and nothing else. The ocean sheet is drawn from above only, the seabed exists only as a look-through term in the surface shader, and there is no water volume.

Andrew chose **a proper view**:
- the surface seen from below, with Snell's window: the sky through a bright circle overhead, mirror-like beyond it;
- the reef and seabed visible;
- water that fades to its own blue-green with distance.

Not in scope: sun shafts, caustics, bubbles, a split view at the waterline, and special shading for the lip's underside.

## 2. Success criteria

- No black anywhere underwater, over the reef or in open water, at any time of day the sky supports.
- Looking up: a circle of sky, 48.6° in half-angle about the surface normal, bright at its centre and darkening to its rim, with the sun inside it when the sun is high enough. Beyond the rim, total internal reflection shows the water below.
- Looking along or down: the reef and sand within the existing seabed march's reach, fading into the water's own colour, with no seam where the reach ends.
- The water matches the surface's own sliders (absorption, backscatter, body scale): the colour below is the colour you see into from above.
- Above the water, rendering and GPU cost are unchanged. The new work runs only while the eye is below the surface.

## 3. Design

### 3.1 When the view is underwater

App already probes the water height under the camera every frame (`HeightProbe`, slot 0, one frame behind). The view is underwater while `camera.y < water height − 0.05 m`, and above water again when `camera.y > water height + 0.05 m` (hysteresis, so a camera riding the surface doesn't flicker). On a change App calls:

- `oceanSurface.setUnderwater(on)`: the sheet's cull side and its shading branch (§3.3);
- `sky.dome.visible = !on` and `waterVolume.mesh.visible = on` (§3.4);
- `ribbon.setUnderwater(on)`: the fog on the lip (§3.5).

There is no split view: the whole frame switches as the eye crosses the surface.

### 3.2 The optics (new `src/ocean/underwaterOptics.ts`, CPU reference plus TSL mirror)

- **Refraction out of the water:** `refract(−v, n_down, n_w)` with n_w = 1.333 (`WATER_IOR`). The critical angle is asin(1/n_w) = 48.6°. Beyond it the ray reflects completely.
- **Fresnel from inside:** the exact unpolarised dielectric reflectance for a ray leaving water. It is 0.02 at normal incidence and rises to 1 at the critical angle; it is 1 beyond. (Schlick from inside is wrong near the critical angle, where the window's rim is.)
- **The water's own colour at depth d:** `L∞(d) = upwelling × exp(−extinction·d)`. `upwelling` is the term the surface shader already uses for deep water (albedo × (sky irradiance + sun × max(sun·up, 0)) / π × body scale), and extinction is the same uniform the seabed look-through uses. So the colour below is the colour seen into from above, dimming with depth.
- **Along a path of length s:** `L = L_end·T + L∞·(1 − T)`, with T = exp(−extinction·s).

### 3.3 The surface from below (`OceanSurface`, `waterShading`)

- The sheet's material side is set from the underwater state: `FrontSide` above water (as now), `BackSide` below. Above water the pipeline and nodes are exactly today's, so the look and cost cannot change there. The first switch compiles a second pipeline once (a single hitch the first time you go under).
- A new `shadeWaterFromBelow(i, sky, u)` runs in the `underwater` uniform's branch (uniform control flow):
  - normal flipped to face down, into the water;
  - the transmitted ray's sky radiance × (1 − R), plus the water below × R. The water below is what the reflected ray sees: the same seabed march as §3.4, from the surface point, so beyond the rim the surface mirrors the reef and sand. (First built as L∞ alone, the mirror read as flat dark navy over shallow reef.);
  - foam blocks the window: the result mixes toward the lit foam colour at 0.6× by the foam weight;
  - then the path from the camera to the surface point (§3.2), with no aerial perspective (the sky through the window already has it).

### 3.4 The water volume and seabed (new `src/ocean/WaterVolume.ts`)

- A sphere around the camera like the sky dome (`BackSide`, no depth write, drawn first), visible only underwater. Every pixel the sheet and ribbon don't cover shows it.
- For a view direction d:
  - a march along d in any direction (`marchBedAlongNode`; rising rays stop at the still surface). On a hit, the seabed's radiance (§3.4.1) through the path; on a miss, L∞. The reach fade (`REACH_FADE_DIST_M`) fades the bed into L∞ before the cutoff, as it does from above.
  - **As built (final review):** the draft marched downward rays only (the look-through's `marchSeabedNode`), so a reef wall at or above eye level was invisible from a diver's eye. The sheet from below also checks the same march between the eye and the surface point (`reefInFrontNode`), so the reef hides the surface behind it.
- **§3.4.1 The seabed's lighting** moves out of `seabedTerms` into `seabedRadianceNode(hitPos, seabed, sky, u)`, shared by the view from above and from below, so the reef is lit the same either way. `seabedTerms` calls it unchanged, so the view from above is the same code.

### 3.5 The ribbon

**As built (plan ruling):** underwater, the ribbon is hidden and the sheet ignores its footprint. The ribbon is drawn single-sided, so from below it is mostly culled. Meanwhile the sheet cuts itself away under the ribbon's footprint, so from below the surface would show a hole. A proper underside look for the lip is out of scope.

**As built (plan ruling):** the view from below is a second sheet material that App swaps in, not a branch in one shader, so the above-water shader is untouched.

### 3.6 Exposure

Auto-exposure is set by the sun for a scene with the bright sky in it. At the same exposure, the reef read 4.6× darker underwater than from above. So underwater the exposure is × `UNDERWATER_EXPOSURE_GAIN` = 5 (`src/render/exposure.ts`), measured so the reef reads 0.93× as bright as from above (a gain of 3 left it 1.5× darker; the tone map compresses the gain).

## 4. Files

- New: `src/ocean/underwaterOptics.ts` (+ `underwaterOptics.test.ts`), `src/ocean/WaterVolume.ts`, `src/ocean/underwater.selftest.ts`.
- Changed:
  - `src/ocean/OceanSurface.ts` (`setUnderwater`, side and branch);
  - `src/ocean/waterShading.ts` (`shadeWaterFromBelow`);
  - `src/seabed/seabedShading.ts` (`seabedRadianceNode` extracted);
  - `src/breaker/BreakingRibbon.ts` (fog when underwater);
  - `src/app/App.ts` (state, hysteresis, visibility).

## 5. Testing

- **CPU unit tests:**
  - the critical angle is 48.6°;
  - R is 0.02 at normal incidence, rises monotonically to 1 at the critical angle, and is 1 beyond;
  - the transmitted ray bends away from the normal (e.g. 30° in water → 41.8° in air);
  - the path blend returns L_end at s = 0 and tends to L∞ as s grows;
  - L∞ dims with depth.
- **GPU self-test:** the TSL underside shading and volume terms match the CPU reference over a sweep of directions (inside the window, at its rim, beyond it) and depths.
- **Above water unchanged:** the existing 30 self-tests and 429 unit tests still pass, and the sheet uses `FrontSide` with the above-water branch whenever the underwater flag is off.
- **Gallery captures:** looking straight up (Snell's window), along the reef at 3 m depth, down at the reef from mid-water, and from the channel at the drain moment. Each has its GPU time noted.

## 6. Known limits

- No split view at the waterline: the frame switches as the eye crosses the surface.
- No sun shafts, caustics or bubbles; the reef is lit by the same smooth sunlight as from above.
- The lip seen from below is fogged, not specially shaded.
- The probe is one frame behind, so a fast plunge switches a frame late.
