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

## 3. Success criteria (agreed)

1. **The draw at take-off.** As a set wave stands up at the take-off, the water near the bed ahead of it runs seaward
   (toward the wave), and the kelp under the player leans seaward a beat after it.
2. **The shove.** Under the crest, and after the break under the whitewater, the water runs shoreward and the kelp swings
   shoreward, overshoots a little and settles.
3. **Scale with size.** Over the ledge, under the biggest set wave at mid tide:
   - **12 ft:** the near-bed flow reaches several m/s and the kelp lies nearly flat.
   - **4 ft:** around 1 m/s, so the kelp leans hard but stays standing.
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

- **The plant.** Western Australian–style short kelp:
  - **Stalk:** 0.3–0.6 m.
  - **Fronds:** a crown of 4–6 strap-like fronds, 0.5–0.8 m long.
  - **Colour:** dark olive-brown, matching build A's weed colour.
  - **Variety:** a few base shapes, varied per plant in size, lean, rotation and shade.
  - **How it's drawn:** as instanced meshes, the way the heath's plants are drawn (`src/heath/PlantMeshes.ts`).
- **Where it grows.**
  - **Only on weed:** where build A's material map says weed, with density following the weed weight.
  - **Clumped:** in clumped beds (density modulated by a fixed noise), not an even lawn.
  - **Never** on the pale bare rock or in the sand pockets.
  - **Fixed placement:** the reef's own seed, never `Conditions.seed`, so the same plant always grows in the same spot.
- **How it moves.**
  - **Reading the flow:** each plant reads the flow at its frond height, at its base position.
  - **The pull:** the push grows with the flow speed squared (drag) and saturates, so the plant lies nearly flat from
    about 2–3 m/s.
  - **The spring:** each plant carries a damped spring (natural period about 1.5 s, under-damped). It lags the flow,
    overshoots once and settles.
  - **The shape:** the stalk bends from its base, and the fronds stream further and flutter a little in strong flow.
  - **Where its state lives:** a GPU buffer, stepped by a compute pass each frame.
- **How it looks.**
  - Shaded like the reef rock: lit, then `seenThroughWaterNode` (as `RockMeshes` uses), so it sits in the same water
    colour and haze as the bed from above and from underwater.
  - It never pokes through the surface or below the bed.

### 4.3 Reach, and following the camera

- **Reach.** 3D kelp within about 40 m of the camera, thinning from about 25 m. Beyond that, build A's painted weed, the
  same colour, so the hand-off doesn't show. From high up (a 75 m free camera) almost nothing is within reach and the
  painted weed carries the reef.
- **Following the camera.**
  - **Plant cells:** the plants live in world cells around the camera. A cell's plants are fixed in the world. Cells
    entering the reach are filled, and cells leaving it are freed.
  - **No jolt:** plants entering the reach start at rest in the current flow (their spring at its steady lean), so nothing
    pops or jolts.
- **Cap.** About 30,000 plants, a few dozen triangles each. Over the cap, the reach shrinks.

## 5. Testing, and the gates

### 5.1 Tests on the CPU model

- **Still water:** zero flow everywhere.
- **Direction:**
  - Ahead of a set crest, the near-bed flow points seaward.
  - Under the crest, it points shoreward.
  - Under the bore after the break, it points shoreward.
- **Size:** over the ledge under the biggest set wave at mid tide, 12 ft gives several m/s and 4 ft around 1 m/s. The
  exact bands are set in the plan from measured values.
- **The lull:** over the ledge between sets the flow is small. Deeper, the background swell gives a slow sway.
- **Depth:** slower at the bed than at the surface, and the same as the shallow-water u = c·η/h in the shallow limit.
- **The cap:** never above √(g·(h + η)), and finite where the trough nearly empties the water.

### 5.2 Kelp tests

- **The spring:** it lags, overshoots once and settles. It lies nearly flat at about 3 m/s. It stays finite and in range
  at extreme speeds and frame times.
- **Placement:**
  - None on sand or bare rock, with density following the weed weight.
  - The same plant in the same spot after the camera leaves and comes back.
  - Nothing beyond the reach, and never more than the cap.

### 5.3 GPU checks

- **A self-test:** the GPU flow matches the CPU flow (a tolerance set in the plan) over points across the reef, sizes and
  times, including under a breaking wave.
- **The kelp's GPU step** matches the CPU spring.
- **The existing GPU self-tests** still pass.
- **Cost:** criterion 6, measured in the game.

### 5.4 Gates (stops for Andrew; break-shape and look changes are shown as pictures first)

1. **Gate 1, the flow, before any kelp:** drawings of the flow as arrows over the reef around the take-off, and as a slice
   through the wave (surface, bed, velocity by depth), before and as the crest passes, at 4 ft and 12 ft.
2. **Gate 2, the kelp:**
   - **From the take-off:** stills and a short clip looking down from the take-off as a set comes through, at 4 ft and
     12 ft.
   - **From underwater:** one still.
   - **Cost:** the GPU cost measured.

It ships on its own branch (`reef-build-b`) and merges to main only on Andrew's word.

## 6. Out of scope

- **The surfer:** feeling the suck. Riding physics reads the flow later.
- **Other flow cues:** drifting specks, sand puffs, bubbles carried under the whitewater.
- **Long stringy weed,** and kelp off the reef map.
- **Rips, eddies or currents** not tied to a wave (approach 2's simulation was turned down).
- **An "always on" surge** in the lulls (Andrew chose true to the flow).
