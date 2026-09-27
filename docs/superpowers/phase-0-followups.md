# Phase 0 follow-ups

Known issues and design items deliberately carried past Phase 0 (First Light, completed 2026-09-26). Each was judged invisible or acceptable from the lineup camera, or belongs to a later phase's scope. Pick them up when planning the phase named.

## Rendering

- **Distant-water band from elevated views** (Phase 1, when cliff/aerial views arrive). When the 35 m cascade's normals fade out (150–600 m) the lost slope variance only widens the GGX sun lobe; the sky reflection and Fresnel still see a flatter surface, so distant water reads lighter as a band. Visible from the 40 m `overview` camera, a sliver at the horizon from the 0.8 m lineup. Proper fix: Bruneton et al. 2010 "Real-time realistic ocean lighting using seamless transitions from geometry to BRDF" (mean Fresnel and filtered reflection from slope variance).
- **No mipmaps on the displacement/derivative textures**: 50–150 m sparkle (aliasing) from the free camera. Pairs with the item above (LEAN/variance mapping).
- **Crest light transmission is keyed to absolute height**, so it depends on swell phase rather than local crest thinness. Redefine it with the Phase 2 turquoise lip.
- **Sun aureole shape** is slightly peaked ("tent") rather than round near the horizon; possibly sky-view LUT resolution near the sun.
- **Thin orange horizon line**: a lead, not verified. Possible f32 cancellation in `raySphere` / `rMuFromTransmittanceUv` (`dot(ro, ro) − R²` near R = 6360 km). Hillaire-style `(r − R)(r + R)` forms avoid it.
- **Far 20 km disc edge** shows as a step from high (> 40 m) cameras.
- **noon-deep-blue** is flat looking down (little surface detail or glitter).

## Ocean

- **Foam comes from a per-cascade Jacobian**, not the combined surface.
- **ω·t precision in f32** degrades over multi-day sessions; fine for hours.

## App and dev tools

- **Frame pacing with the 60 fps cap** is uneven when 60 doesn't divide the refresh rate (e.g. 144, 165 or 75 Hz renders on a 2/3-refresh cadence). Snap the interval to a whole number of measured refreshes, or pace from the rAF timestamp.
- **Moment-link camera positions are unbounded**; clamp to about ±1e5 m.
- **`AtmosphereLuts` has no `dispose()`**.
- **Test gaps**: the probe self-tests don't measure the inversion residual; the FFT tests lack a lane-crosstalk test.

## Hardware lessons (owner's laptop: Acer Predator Helios Neo 16, i9-14900HX, RTX 4060 Laptop)

- **One WebGPU copy at a time.** The laptop hard-hung (black screen, audio buzz, no dump) while the app ran in Chrome on the RTX and in a second browser on the Intel iGPU, with a 2024 Intel driver. After updating both drivers (Intel 32.0.101.7092, NVIDIA 32.0.16.1714) and adding the 60 fps cap, it has been stable.
- **Chrome and the RTX.** Chrome ignores WebGPU's `powerPreference` here. Use the Windows per-app "High performance" setting and fully restart Chrome; the stats overlay names the adapter. The measured RTX budget: 0.68 ms GPU per frame at 240 fps uncapped.

# Phase 1 follow-ups

Carried past Phase 1 (Reef & Sets, completed 2026-09-27, approved by Andrew as "good enough to move on").

## Water and sky look (Andrew: "we'll fix the reflection properly later")

- **Sun glitter reads as a smooth, clipped white patch** (noon, facing the sun, big swell). Sub-pixel glitter is averaged into roughness and tone-mapped to white. Wants a sparkle model (glint distribution) plus a gentler highlight roll-off. Consider Beckmann (Cox–Munk Gaussian slopes) instead of GGX's long tail.
- **No Earth shadow or belt of Venus**: at sunrise/sunset the anti-solar horizon glows orange-gold, reflected in the water, so the west reads like a sunset. Should be a blue-grey shadow band under a pink band.
- **Reef look**: a bright aqua halo on the sand slope just outside the ledge, and a thin dark rim along the reef edge (weed face) from overhead; `looking-down` is soft, with little bed detail at 0.5 m resolution.

## Waves and the break (Phase 2)

- **Perf pass first**: GPU is 2.35 ms (pane) to 3.36 ms (Andrew's Chrome) at 2560×1600 on `reef-overhead`, against a 3 ms budget. Breaking will cost more.
- **The right closes out over only its first ~40 m**, then would peel where the south ledge bends east (full-ledge arrival spread 7.4 s at 225°). Andrew's drone reference shows a longer closeout.
- **Set waves read as gentle humps** (≈3 m trough to crest, steepness ≈0.017 at 4 ft): steepening and pitching are Phase 2. Re-time the set moments once waves stand up.
- Peel speed along the north ledge: 14.3 m/s at 225°, 12.6 m/s at 205°, 18.1 m/s at 245° (15 s).

## Performance and code

- **`buildBathymetry` takes ~0.55 s** on the main thread (363 ms before the reef warp; the plan's 300 ms target was already exceeded). Move it into the field worker or cache it; reef-slider edits hitch meanwhile.
- **No App-level tests** for the settings wiring (custom/default, visits, pagehide saves); the pure helpers are tested.
- `displacementWithSlopeNode` must never run in a compute shader; only a comment enforces it.
- A link opened in default mode leaves the visit flag set; a later default→custom time pick then carries over from the stored camera (no data loss).

# Phase 2 follow-ups (work in progress, written overnight 2026-09-27)

- **Waves stack on the previous wave's back (Andrew, 2026-09-27; next after the breaking-ribbon review).** The next wave in a set arrives before the reef has drained, so it rides on what's left of the previous wave instead of drawing the water off the ledge that gives it height and power. Suspected cause: the set-wave envelope (ENVELOPE_WIDTH 0.8 periods) still leaves a crest of about 21% one period behind each wave. Measure the water ahead of each wave first; then make each wave's leftovers die away within a period, and bring back the stacked "step" (Shipsterns-style) as an occasional event (an unusually close pair, or a big wave leaving water behind), not every wave.

- **Timings not measured.** GPU ms haven't been measured since Phase 1: the app window was hidden overnight, so frames were paused. Measure `barrel-peeling` at 2560×1600 with max fps 0. The levers are:
  - finite-difference normals only near breaking waves;
  - a per-vertex spatial "can break" bound. The per-wave flag (B8) saves nothing at the Womb: the field's breaking height is about 6 cm, because some shallow cell breaks almost anything;
  - hardware-filtered field textures;
  - `MARCH_STEPS` 14 → 12.
- **Distant lips alias.** A lip about 100 m away still looks spiky, because the lip's back window spans only about 1.2 grid cells there. The Break folder's "lip back reach" slider trades lip thickness against aliasing. A proper fix is a denser grid near waves, or filtering the lip weight by distance.
- **Whitewater is a placeholder.** The foam is noise-textured colour only. Phase 3 brings lip impact, spray and lingering foam.
- **Phase 3 foam must persist and drift (Andrew, 2026-09-27).** Foam is made where the break turns the wave inside out (the plunge and landing zone), then lingers, spreads and decays over tens of seconds, carried by the water. As a set rolls through, the foam a surfer sees on their wave is mostly what the previous waves left. That needs a persistent, advected foam field, not a per-wave weight (breaking-ribbon spec §8).
- **Where the dominant wave switches at a vertex,** the foam pattern can jump.
- **A section can "back off" over the shelf's deep pockets** (P9). The fix: a monotone running-min `depth/amp` field channel, already prototyped.
- **The biggest default wave at 4 ft barely peels** (about 15 m, P8). `barrel-peeling` is shot at 5 ft. Andrew's calibration: δ (drain), γ, and the ledge depth.
- **Face heights run above Andrew's feel.** The biggest default wave's face reads about 4.1–4.3 m (≈14 ft) at the peak. Check it with the face readout.
- **The GPU seabed clamp has no self-test** (the CPU test covers it). The total-surface clamp reads the bed at the undisplaced xz.
- **Lip faceting.** The lip's outer arc is stretched from a short strip of surface, so it can look faceted from 60 m.

