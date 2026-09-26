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
