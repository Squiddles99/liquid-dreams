# The lip and tube look: a clear curtain, a glowing lip, light in the tube

Approved with Andrew in chat, 2026-10-03, part by part (approach A). The second of three barrel sub-projects:
1. the tube's size (2026-10-03-barrel-size-design.md, merged 400c92b);
2. the lip and tube look (this spec);
3. whitewater up close (the explosion, the spray).

## 1. Why

- **Andrew, 2026-10-03:** from the shoulder the barrel still doesn't read hollow. The lip draws as an opaque pale curtain,
  the inside as flat navy.
- **The target view** (Andrew's choice): the shoulder and the beach, judged against his "VERY Womb-like" photo, image10
  of `reference/wave/Aerial View.pptx` (Pipeline from the beach, iStock / Philip Thurston). The tube mouth reads round and
  dark, the curtain over it is clear water with white along its top and where it meets the water, and solid whitewater
  only where the tube has closed. Views from inside the tube wait for a surfer who can ride there.
- **Andrew's foam zones** (2026-09-29): the throwing lip is thick and streaked white along its outer top; the open tube is
  clean and glassy; full whitewater only past where it has imploded.
- **Cause 1, the foam.** `lipProfile.profilePoint` sets the lip's whole outside (segments `outer` and `cap`) to foam the
  moment it lands (`curlFoam = max(landed, spray·air)`, `landed = landing` on the lip). With the tube now held open
  `TUBE_HOLD_S` (1.5 s) after the landing, that solid white lip is the pale curtain. The ribbon-tint overlay confirms the
  curtain is the ribbon, not the sheet's whitewater.
- **Cause 2, the light.** `shadeWater`'s lip term lights the lip only by sun from behind it (`pow(dot(−v, l), 4)`) and a
  weak skylight term. At the 8:15 moment (seed 2002, 12 ft) the sun is behind the camera, so the lip, the tube mouth and the
  face all shade with the deep water's upwelling: one flat navy, no lit edge, no depth. Nothing shades the tube's inside:
  the face, the back wall and the ceiling under the lip are lit as if the lip were not there.

## 2. Scope

In: the ribbon's foam rule on the curl (CPU and GPU), the lip's glow, the light reaching the tube's inside, and the tests
and frames that check them.

Out:
- the tube's shape (stays as merged; `hollowFace.test.ts` and `barrelSize.test.ts` stay green);
- the unbroken face and shoulder (not lip; their look, including from the air, stays as it is);
- the whitewater explosion and the spray (sub-project 3);
- refraction through the lip (approach B: only if A's curtain still reads solid).

## 3. Part 1: foam

The rule in `lipProfile.profilePoint`, mirrored in `lipProfileNodes.profilePointNode`. σ is the existing position along
the lip's outside (0 over the tube's top, 1 at the tip; the cap is the tip).

| Zone | While thrown and held open | As the tube collapses |
|---|---|---|
| The lip's outside (`outer`), mid-curtain | Clear water | Foam climbs up from the landing line, reaching the top by the end of the collapse |
| The lip's top edge (σ near 0) and its tip (σ near 1, `cap`) | Streaks: `LIP_STREAK` (new, 0.45), so the foam pattern breaks into streaks, not a solid sheet | Solid as the climbing foam reaches it |
| The `front` just past the landing | Solid foam from the landing (as now) | Solid |
| The tube's inside (`face`, `wall`, `under`) | Clean (as now) | Fills with foam (as now: `filled`) |

- **R1.1** The streaks: at the tip (σ from `LIP_TIP_BAND` 0.85 to 1) and a top-edge band (σ below `LIP_TOP_BAND` 0.25,
  on the lip's band only), `LIP_STREAK` × the throw's progress ramp `LIP_SPRAY_PROGRESS`, × mix(weight, 1, landing):
  kept through the landing and the hold, not × `air` (they vanished when the lip landed). They replace `LIP_SPRAY` and
  `LIP_SPRAY_FROM`.
- **R1.2** The climb: on the outside, after the landing, foam = `landed` × smoothstep(1 − climb − `CLIMB_SOFT`,
  1 − climb, σ), climb = smoothstep(0, `LANDING_FOAM_RISE`, collapse), `CLIMB_SOFT` = 0.15. At collapse 0 (the hold) only
  the tip (σ above 0.85) is solid; at the end of the rise the whole outside is.
- **R1.3** Composed by `max` with the streaks; the `cap` follows σ = 1.
- **Tests (CPU, `lipFoam.test.ts`, new)** at 4, 8 and 12 ft × the three tides of `hollowFace.test.ts`:
  - during the hold (landed, collapse 0), every `outer` sample with σ ∈ [0.2, 0.8] has curlFoam < 0.1;
  - the tip (`cap`) and the `front` sample at the landing have curlFoam ≥ 0.5 once landed;
  - over the collapse, each `outer` sample's foam never falls, and it climbs: when the mid-curtain (σ nearest 0.5)
    first passes 0.5, the top (σ ≤ 0.1) is still below 0.5;
  - at the end of the foam rise every `outer` sample has curlFoam ≥ 0.9.
- **GPU:** `ribbon.selftest.ts` already compares the CPU and GPU curlFoam per vertex; it covers the mirror.

## 4. Part 2: the lip's glow

A thrown lip is aerated: fine bubbles scatter light, so it glows with the sun on any side (clear water would not).

- **R2.1** New optics parameter `lipBubbleScatter` (per metre, `WaterOpticsParams`, a uniform in
  `WaterOpticsUniforms`). The share of light entering the lip that scatters out: S = 1 − exp(−lipBubbleScatter ×
  thickness).
- **R2.2** The scattered glow, in `shadeWater` where `lip` is set:
  glow = lipColour(thickness) × (sun × sunVisibility × |n·l| + skyIrradiance) × S / π, where lipColour is the existing
  Beer–Lambert colour of the thickness (`exp(−a × transmissionThicknessM × thickness / LIP_REFERENCE_THICKNESS_M)`).
  |n·l|: the sun enters through whichever face it lights, the far face included.
- **R2.3** On the lip the deep water's light is replaced by the lip's own: the column term becomes
  mix(column, glow, lip). The thin lip is not a window onto deep water.
- **R2.4** The through-light (the sun from behind, `backlight`, and the skylight from beneath) stays as it is, added on
  top.
- **R2.5** The tip is the thinnest part, so it is the most turquoise (the least absorbed); with the sun behind it is also
  the brightest (the through-light). Lit by the sun in front, the glow rises with the thickness and levels off past about
  1 m (more bubbles to scatter, more water to absorb): no separate edge term.
- **R2.6** A CPU mirror of the glow in `waterOptics.ts` (`lipGlow(params, thicknessM, sunCos, sun, sky)` → RGB) for the
  tests; the shader and the mirror share the constants.
- **Tuning:** image10, measured (linear sRGB, 2026-10-03): the curtain over the tube (pixels 520–600 × 320–380) is
  dark teal, luminance 0.0126, about **2.0×** the face's (720–880 × 330–390, 0.0063), and greener (G/B 0.66 against
  0.78). Its mouth is hidden in spray. Set `lipBubbleScatter` so the 8:15 frame's curtain/face ratio is within 25% of
  2.0 (1.5–2.5).
- **Tests (CPU, `waterOptics.test.ts`):**
  - a thinner lip glows more turquoise (green and blue over red, as ratios);
  - the glow at the root's thickness (`tTop` of an ordinary 12 ft, about 1.5 m) is never darker than the deep water's
    upwelling under the same light;
  - the sun in front (|n·l| > 0, no backlight) gives a glow above zero;
  - the sun behind the lip gives more than the sun in front at the same |n·l|.

## 5. Part 3: light in the tube

For each ribbon vertex, two numbers from the lip's own side-on cross-section at its station (the profile plane: u along
the station's n, y up):

- **Where the sun comes from.** The sun's direction projected into the profile plane, angle a = atan2(l.y, l·n) (n
  points ahead of the wave). From the point p, the tip T (the cap's middle sample) is at angle aT and the lip's root R
  (the outer sample over the tube's top, σ = 0) at aR > aT. Directions below aT (out of the mouth) are open; between aT
  and aR the lip is in the way; beyond aR (behind the root, toward the wave's back) the wave's body is.
  - **Sun through the lip, sLip ∈ [0, 1]:** a inside (aT, aR), soft edges `TUBE_SHADE_SOFT_RAD` (4°).
  - **Sun behind the wave's body, sBody ∈ [0, 1]:** a beyond aR (soft edge as above). Through metres of water: dark.
  - sLip + sBody ≤ 1; the rest is direct sun.
- **Open sky, o ∈ [0, 1]:** clamp(aT, 0, π) / π, the share of the sky's half circle out of the mouth: deep in the tube
  little of the sky, at the mouth most of it.
- **The lip's mean thickness, tLip:** the mean of `tTop` and `tipE`, for the colour of light through it.
- **R3.1** All are scaled by the curl's weight (`frame.weight`, which carries (1 − collapse) and the presence fade):
  sLip, sBody → × weight, o → 1 − (1 − o) × weight. Before the throw and after the collapse every vertex is fully open, and
  nothing jumps.
- **R3.2** Only the tube's inside takes them: `face` and `wall` (every other sample: sLip = sBody = 0, o = 1). The ceiling
  (`under`) is the lip's own underside: its light is Part 2's, and near the tip its angles to the tip degenerate.
- **R3.3** A new compute pass (`light`: stations, frames, positions, lights = 4 storage buffers, within
  `MAX_STORAGE_BUFFERS_PER_STAGE`; added to `BreakingRibbon.limits.test.ts`) writes a new per-vertex attribute
  `ribbonLight` = vec4(sLip, o, tLip, sBody), after the develop pass (before the chop). The sun's direction is a uniform. The vertex pass, already
  at 8 buffers, is untouched.
- **R3.4** `shadeWater` takes an optional `tube: { sunLip, sunBody, skyOpen, lipThickness }` (absent: fully open, so the
  sheet and every other caller are unchanged):
  - sun factor (RGB) = (1 − sLip − sBody) + sLip × lipColour(tLip): the body light's sun term, the foam's sun term;
  - sky factor (RGB) = o + (1 − o) × lipColour(tLip) × `lipSkyTransmission`: the body light's sky term, the foam's sky
    term, and the sky reflection;
  - the sun glitter × (1 − sLip − sBody).
- **R3.5** A CPU reference `tubeLight(profile, sun)` in `lipProfile.ts` → per sample { sLip, sBody, o, tLip }; the GPU
  pass mirrors it.
- **R3.6** The ribbon recomputes when the sun moves (its sun direction joins App.updateRibbon's key), not only when the
  time or the camera does.
- **What the light will do:** at the 8:15 moment the sun is low and in front, so it shines partly straight into the
  mouth: lit near the mouth, dark deep in. The afternoon moment (sun behind the wave) shows the full green room: all the
  inside lit through the lip.
- **Tests (CPU, `tubeLight.test.ts`, new)** at 8 and 12 ft × the three tides (4 ft's tube is a few cm at the peak),
  the tube held open, at the back wall's middle sample:
  - the sun 10° below the direction to the tip (out of the mouth): sLip, sBody ≤ 0.05;
  - the sun along the direction half way between the tip and the root: sLip ≥ 0.95;
  - the sun 10° past the root (behind the wave): sBody ≥ 0.95;
  - o < 0.3 (deep in the tube), and o at the face sample nearest the tip is above o at the wall's middle;
  - every `front`, `back`, `cap` and `outer` sample: sLip = sBody = 0, o = 1;
  - before the throw (weight 0) and at the end of the collapse: sLip = sBody = 0, o = 1 at every sample;
  - over the throw, the hold and the collapse at 1/30 s steps (a fixed sun 45° high from in front), no sample's sLip,
    sBody or o changes by more than 0.3 per step.
- **GPU:** the `ribbon: GPU profile matches lipProfile` self-test also compares `ribbonLight` against `tubeLight` per
  vertex (tolerance 0.02 on sLip, sBody and o; 2 cm on tLip).

## 6. Amendment (2026-10-03, before the plan)

Two findings while planning, shown to Andrew with the plan: image10's curtain measured dark teal at about 2× the face
(the tuning target is that ratio, not a bright curtain); and a point on the tube's back wall with the sun behind the wave
is shaded by the wave's own body, not the lip, so Part 3 has three cases (direct, through the lip, behind the body).
Also: the front-lit glow is not brightest at the thin tip (R2.5 corrected), the ceiling takes Part 2's light, not Part 3's
(R3.2), and the light tests step at 1/30 s (the 1/60 s run was ~10 minutes of CPU profiles), allowing 0.3 a step.

## 7. Pictures before merge

- Shoulder and beach frames at the 8:15 moment (`close.b64`: seed 2002, 12 ft, t 1468.49–1470.49) and an afternoon
  moment (the same, timeOfDay 16.5: the sun behind the wave from the beach), before and after, next to image10.
- Andrew judges them. Any shape change is out of scope; if the look needs one, it comes back as a question.

## 8. Done when

- Parts 1–3 in, CPU and GPU, with their tests green; `hollowFace.test.ts`, `barrelSize.test.ts` and the full vitest suite
  green; the GPU self-tests green (the sound timing check run alone if it flakes, as before).
- The frames shown to Andrew, and merged only on his word.
