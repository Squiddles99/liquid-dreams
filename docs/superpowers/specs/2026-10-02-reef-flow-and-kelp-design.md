# The Womb's reef (build B): the water's flow, and the kelp that moves in it

Approved with Andrew in chat, 2026-10-02, section by section. Follows build A (`2026-10-02-womb-reef-design.md`, merged
to main d7a9d48), whose §6 named this build.

## 1. Why

- **The water doesn't move.** The waves only raise and lower the surface. Nothing in the game knows how fast or which way
  the water under a wave is moving, so nothing on the reef can react to a wave, and the surfer will have nothing to feel
  when riding physics comes (the "suck" up the face).
- **The reef is a painting.** Build A's weed is a colour on the rock (`bedLook.WEED_ALBEDO`). At take-off, looking down
  through the clear water build A gave us, nothing moves as a set stands up. At the real Womb you watch the kelp lean
  seaward toward the wave as it draws the water off the reef, then whip back as the crest passes.

## 2. What Andrew chose

- **What grows there:** short kelp beds. Kelp about 0.5–1 m tall on a short stalk with a mop of broad fronds, in dense
  beds that lean together like grass in wind. Not long stringy weed.
- **How the flow shows:** through the kelp only. No drifting specks, sand puffs or carried bubbles in this build.
- **How it's made:** approach 1. The flow is worked out from the waves the game already draws (not simulated, not faked),
  so it always matches the wave on screen and riding physics can read it later.
- **In the lulls:** true to the flow. Over the reef the game drops the FFT long swell and lets the set waves carry the
  swell (`WaterSurfaceModel.swellWeight`, 6–14 m), so between sets the kelp over the ledge is nearly still, deeper kelp
  sways slowly, and the set brings it alive. No added "always on" surge.
- **Grounded realism:** how hard the kelp moves comes from the flow, not from a hand-set sway.
- **Kelp as part of the reef (option 1, chosen at planning).** From above the water the game never draws the reef as a
  mesh: the water surface traces each pixel's refracted ray to the bed and shades the bed there (`seabedTerms`,
  `seabedShading.ts`), and the underwater view does the same march (`WaterVolume`). 3D kelp meshes would be hidden under
  the surface from the take-off. So the kelp is a canopy layer the trace meets on the weedy rock. It leans, streams and
  flattens with the flow, wobbles with the surface like the reef under it, covers the whole reef, and looks the same from
  underwater. Individual 3D plants for an underwater camera may come later if the canopy doesn't read up close.

## 3. Success criteria (agreed)

1. **The draw at take-off.** As a set wave stands up at the take-off, the water near the bed ahead of it runs seaward
   (toward the wave), and the kelp under the player leans seaward a beat after it.
2. **The shove.** Under the crest, and after the break under the whitewater, the water runs shoreward and the kelp swings
   shoreward, overshoots a little and settles.
3. **Scale with size.** Over the ledge, under the biggest set wave at mid tide:
   - **12 ft:** the near-bed flow reaches several m/s (measured: 4.7 m/s seaward in the draw, 8 m/s under the crest)
     and the kelp lies flat.
   - **4 ft:** about 1.5–2.5 m/s (measured while planning: 1.6 m/s seaward in the draw, 2.5 m/s under the crest), so
     the kelp leans hard but isn't flattened for long.
4. **The lulls.** Between sets, over the ledge, the kelp is close to still. In water deeper than the swell fade, it
   sways slowly with the background swell.
5. **It reads as the Womb.** Short dark olive-brown kelp in clumped beds, only where build A paints weed. None on the pale
   bare rock or in the sand pockets. Readable from the take-off and from underwater.
6. **Cost.** The flow and the kelp together cost at most 1.5 ms of GPU time per frame on the RTX. Measured at the take-off
   during a 12 ft set (`window.__ldGpuMs`). If it costs more, the reach shrinks before the look gets cheaper.

## 4. Design

### 4.1 The flow

- **One function.** It gives the water's horizontal velocity (m/s, a 2D vector in xz) at any point, any time, from the
  seabed up to the surface. It is written in the CPU model first (the source of truth, as for the waves, the foam and the
  surf), with a TSL mirror on the GPU.
- **Where it comes from.** Linear wave theory under each wave, along that wave's local travel direction:
  - **The shape:** u(y) = η · ω · cosh(k(h + y)) / sinh(k·h).
    - η: the wave's surface height at that point, including build A's breaking shape (the front's lean, the trough's
      drain, the bore).
    - ω: the swell's angular frequency.
    - k: the local wavenumber (the reef field's k).
    - h: the still-water depth.
    - y: the height in the water (−h at the bed, 0 at still water).
  - **In shallow water** this becomes the familiar u = c·η/h.
  - **Its direction:** positive is the direction the wave travels (shoreward), negative is toward the wave.
- **What that gives.**
  - **Ahead of a crest:** the trough's η is negative, so the water runs seaward, toward the wave. Build A's trough drains
    below sea level as the wave stands up, so the draw is strongest exactly when and where the wave is about to break.
  - **Under the crest, and under the bore after the break:** η is positive, so the water runs shoreward.
- **The set waves** contribute through the same per-wave terms `SetWaves.sumBreaking` and `setWaveModel.sumWaves` already
  evaluate. Each wave adds its own u.
- **The background swell.** Where the FFT long swell is present (its `swellWeight`), it adds its own u from its surface
  height, along the swell's mean direction. The CPU model has no FFT, so this term takes the background η as an input and
  is tested with given heights.
- **Limits.**
  - The speed is capped at the shallow-water wave speed √(g·(h + η)), so it never runs away in the shallows or where the
    trough nearly empties the water.
  - With no waves and no swell, the flow is exactly zero.
- **For later.** The function takes a height in the water. The kelp reads it at frond height. Riding physics will read it
  at the surface for the surfer's suck. Nothing for the surfer is built in this build.

### 4.2 The kelp

- **The canopy.** Western Australian–style short kelp, drawn as a canopy layer on the weedy rock, inside the bed's
  shading (`seabedRadianceNode`), so every view of the reef shows it: the look-through from above (the sheet and the
  breaking ribbon) and the underwater march.
  - **Standing height:** about 0.8 m (a 0.3–0.6 m stalk under a crown of strap fronds). The traced ray meets the canopy's
    top before the bed: a one-step parallax offset along the ray gives it depth.
  - **Fronds:** a frond pattern (noise, about 0.25 m strands) in a frame aligned with the kelp's lean, so they stream
    along the flow.
  - **Colour:** dark olive-brown. Over a weedy patch the canopy's mean tone stays within 20% of build A's weed colour
    (`bedLook.WEED_ALBEDO`), so the reef still reads as it did from the take-off. Gaps between plants show the rock in
    the canopy's shade.
- **Where it grows.**
  - **Only on weed:** coverage follows build A's weed weight (`Seabed.materialNode`'s weed). None on bare rock or sand.
  - **Clumped:** density modulated by a fixed noise (beds about 5 m across), not an even lawn.
  - **Fixed placement:** the pattern is in world space, so the same bed is always in the same place.
- **How it moves.**
  - **Reading the flow:** the kelp reads the flow 0.5 m above the bed.
  - **The steady lean:** for a flow speed u, the kelp's steady lean is tanh((u / 2.2 m/s)²) of flat, toward the flow: a
    quarter at 1 m/s, more than 0.9 from 3 m/s.
  - **The spring:** the lean follows that steady lean through a damped spring (natural period 1.5 s, damping ratio
    0.45). It lags the flow, overshoots once (about 20%) and settles.
  - **The shape:** as it leans, the canopy lies lower (its height × (1 − 0.8 × lean)), its fronds stretch along the flow
    and their tips move downstream, and the fronds catch more light lying flat. In strong flow the fronds flutter.
  - **Where its state lives:** a lean grid around the camera (1 m cells), stepped by a compute pass at the foam field's
    20 Hz sim-time ticks, and shown interpolated between ticks.

### 4.3 Reach, and following the camera

- **Reach.** The lean grid covers 128 m × 128 m centred on the camera (1 m cells). The motion fades out over its last
  8 m, and beyond it the kelp stands still and upright. From high up, the moving patch is under the camera, as from the
  take-off.
- **Following the camera.**
  - **Fixed cells:** the grid is anchored to world cells and wraps (a toroidal grid), so moving the camera keeps every
    cell's state. Only cells entering the window are new.
  - **No jolt:** new cells, and every cell after a jump in time (a moment link, new conditions), start at the steady lean
    for the flow there. A jump also replays the last 4 s of ticks, so the spring's lag is already right.
- **Cost.** 16,384 cells a tick, at 20 Hz, plus the canopy's few noise fetches in the bed's shading. Within 1.5 ms per
  frame (criterion 6). Over budget, the grid shrinks first.

## 5. Testing, and the gates

### 5.1 Tests on the CPU model

- **Still water:** zero flow everywhere, exactly (this is also the lull over the ledge: no set wave there, no flow).
- **Direction:**
  - Ahead of a set crest, the near-bed flow points seaward.
  - Under the crest, it points shoreward.
  - Under the bore after the break, it points shoreward.
- **Size:** at the peak under the biggest set wave at mid tide, near the bed: 12 ft draws 3–8 m/s seaward; 4 ft draws
  1–2.5 m/s seaward.
- **The lull:** over the ledge between sets the flow is small. Deeper, the background swell gives a slow sway.
- **Depth:** slower at the bed than at the surface, and the same as the shallow-water u = c·η/h in the shallow limit.
- **The cap:** never above √(g·(h + η)), and finite where the trough nearly empties the water.

### 5.2 Kelp tests

- **The steady lean:** a quarter of flat or less at 1 m/s, more than 0.9 at 3 m/s, never above 1, along the flow.
- **The spring:** it lags, overshoots once (15–25%) and settles. It stays finite and within flat at extreme speeds and
  frame times.
- **The grid:** the same world cell keeps its state when the camera moves. New cells and cells after a jump start at the
  steady lean. Beyond the window the lean is zero.

### 5.3 GPU checks

- **A self-test:** the GPU flow matches the CPU flow (a tolerance set in the plan) over points across the reef, sizes and
  times, including under a breaking wave.
- **The kelp's GPU step** matches the CPU spring, and its grid keeps a cell's state as the window moves.
- **The canopy's tone:** over a weedy patch its mean colour is within 20% of build A's weed.
- **The existing GPU self-tests** still pass.
- **Cost:** criterion 6, measured in the game.

### 5.4 Gates (stops for Andrew; break-shape and look changes are shown as pictures first)

1. **Gate 1, the flow, before any kelp:** drawings of the flow as arrows over the reef around the take-off, and as a slice
   through the wave (surface, bed, velocity by depth), before and as the crest passes, at 4 ft and 12 ft.
2. **Gate 2, the kelp:**
   - **From the take-off:** stills and a short clip looking down from the take-off as a set comes through, at 4 ft and
     12 ft, with the kelp off (build A) beside them.
   - **From underwater:** one still.
   - **Cost:** the GPU cost measured.

It ships on its own branch (`reef-build-b`) and merges to main only on Andrew's word.

## 6. Out of scope

- **The surfer:** feeling the suck. Riding physics reads the flow later.
- **Other flow cues:** drifting specks, sand puffs, bubbles carried under the whitewater.
- **Long stringy weed,** and kelp off the reef map.
- **Individual 3D kelp plants** (for an underwater camera up close): maybe later.
- **Rips, eddies or currents** not tied to a wave (approach 2's simulation was turned down).
- **An "always on" surge** in the lulls (Andrew chose true to the flow).
