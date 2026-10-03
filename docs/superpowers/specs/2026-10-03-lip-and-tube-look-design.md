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

- **R1.1** The streaks: the throw's existing spray (`LIP_SPRAY`, its σ ramp `LIP_SPRAY_FROM`, its progress ramp
  `LIP_SPRAY_PROGRESS`) at the tip, and a top-edge band, both capped at `LIP_STREAK` and kept through the landing and the
  hold (× the curl's weight, not × `air`, so they do not vanish when the lip lands).
- **R1.2** The climb: on the outside, after the landing, foam = `landed` × the share of the collapse that has reached σ
  from the tip end: `smoothstep` over σ ∈ [1 − climb, 1 − climb + `CLIMB_SOFT`], climb = smoothstep(0,
  `LANDING_FOAM_RISE`, collapse) × (1 + `CLIMB_SOFT`). At collapse 0 (the hold) only the tip's landing line is solid; at
  the end of the rise the whole outside is.
- **R1.3** Composed by `max` with the streaks; the `cap` follows σ = 1.
- **Tests (CPU, `lipFoam.test.ts`, new)** at 4, 8 and 12 ft × the three tides of `hollowFace.test.ts`:
  - during the hold (landed, collapse 0), every `outer` sample with σ ∈ [0.2, 0.8] has curlFoam < 0.1;
  - the tip (`cap`) and the `front` sample at the landing have curlFoam ≥ 0.5 once landed;
  - over the collapse, each `outer` sample's foam never falls, and never rises by more than 0.25 per 1/60 s step;
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
- **R2.5** The tip is the thinnest part, so it glows most: the lit edge round the mouth comes from this, no separate term.
- **R2.6** A CPU mirror of the glow in `waterOptics.ts` (`lipGlow(params, thicknessM, sunCos, sun, sky)` → RGB) for the
  tests; the shader and the mirror share the constants.
- **Tuning:** measure in image10 the luminance of the curtain over the mouth against the mouth and against the face
  (patches named in the plan); set `lipBubbleScatter` so the 8:15 frame's curtain/mouth and curtain/face ratios match
  image10's within 25%.
- **Tests (CPU, `waterOptics.test.ts`):**
  - a thinner lip glows brighter and more turquoise (green and blue over red);
  - the glow at the root's thickness (`tTop` of an ordinary 12 ft, about 1.5 m) is never darker than the deep water's
    upwelling under the same light;
  - the sun in front (|n·l| > 0, no backlight) gives a glow above zero;
  - the sun behind the lip gives more than the sun in front at the same |n·l|.

## 5. Part 3: light in the tube

For each ribbon vertex, two numbers from the lip's own side-on cross-section at its station (the profile plane: u along
the station's n, y up):

- **Sun through the lip, s ∈ [0, 1].** The sun's direction projected into the profile plane, l₂ = normalize(l·n, l.y).
  From the point p, the lip spans the arc of directions from its tip T (`frame.tip`) to its root R (the tube's top,
  `tubeUpper(tube, xiTop)`), the arc over the top. s is how far l₂'s angle lies inside that arc, with a soft edge of
  `TUBE_SHADE_SOFT_RAD` (4°).
- **Open sky, o ∈ [0, 1].** 1 − (the lip's arc seen from p, clipped to the upper half plane) / π: deep in the tube little
  of the sky, at the mouth most of it.
- **The lip's mean thickness, tLip:** the mean of `tTop` and `tipE`, for the colour of light through it.
- **R3.1** Both are scaled by the curl's weight (`frame.weight`, which carries (1 − collapse) and the presence fade):
  s → s × weight, o → 1 − (1 − o) × weight. Before the throw and after the collapse every vertex is fully open, and
  nothing jumps.
- **R3.2** Only the tube's inside takes them: `face`, `wall`, `under` (and `cap`/`outer` take s = 0, o = 1; the lip's own
  light is Part 2's).
- **R3.3** A new compute pass (`light`: stations, frames, positions, lights = 4 storage buffers, within
  `MAX_STORAGE_BUFFERS_PER_STAGE`; added to `BreakingRibbon.limits.test.ts`) writes a new per-vertex attribute
  `ribbonLight` = vec4(s, o, tLip, 0), after the vertex pass. The sun's direction is a uniform. The vertex pass, already
  at 8 buffers, is untouched.
- **R3.4** `shadeWater` takes an optional `tube: { sunThrough, skyOpen, lipThickness }` (absent: fully open, so the sheet
  and every other caller are unchanged):
  - sun factor (RGB) = mix(1, lipColour(tLip), s): the body light's sun term, the foam's sun term;
  - sky factor (RGB) = o + (1 − o) × lipColour(tLip) × `lipSkyTransmission`: the body light's sky term, the foam's sky
    term, and the sky reflection;
  - the sun glitter × (1 − s).
- **R3.5** A CPU reference `tubeLight(frame, p, sun2)` in `lipProfile.ts` → { s, o, tLip }; the GPU mirror
  `tubeLightNode` in `lipProfileNodes.ts`.
- **What the light will do:** at the 8:15 moment the sun is low and in front, so it shines partly straight into the
  mouth: lit near the mouth, dark deep in. The afternoon moment (sun behind the wave) shows the full green room: all the
  inside lit through the lip.
- **Tests (CPU, `tubeLight.test.ts`, new)** at 4, 8 and 12 ft:
  - a point on the back wall at mid-height, the tube held open, sun 60° high from behind the wave: s ≥ 0.95, o < 0.3;
  - the same point, sun 10° high from in front of the wave shining into the mouth: s ≤ 0.05;
  - a point on the face more than 2 m ahead of the tip's u: s = 0, o > 0.95;
  - before the throw (weight 0) and at the end of the collapse: s = 0, o = 1 at every sample;
  - over the throw, the hold and the collapse at 1/60 s steps, no sample's s or o changes by more than 0.2 per step.
- **GPU:** a `ribbon.selftest.ts` case comparing `ribbonLight` against `tubeLight` per vertex (tolerance 0.02 on s and o,
  2 cm on tLip).

## 6. Pictures before merge

- Shoulder and beach frames at the 8:15 moment (`close.b64`: seed 2002, 12 ft, t 1468.49–1470.49) and an afternoon
  moment (the same, timeOfDay 16.5: the sun behind the wave from the beach), before and after, next to image10.
- Andrew judges them. Any shape change is out of scope; if the look needs one, it comes back as a question.

## 7. Done when

- Parts 1–3 in, CPU and GPU, with their tests green; `hollowFace.test.ts`, `barrelSize.test.ts` and the full vitest suite
  green; the GPU self-tests green (the sound timing check run alone if it flakes, as before).
- The frames shown to Andrew, and merged only on his word.
