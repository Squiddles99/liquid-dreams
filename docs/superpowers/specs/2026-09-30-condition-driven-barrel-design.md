# Liquid Dreams: the condition-driven barrel (A: how hard the lip throws) — Design

**Date:** 2026-09-30
**Authors:** Andrew (the brief, every answer below), Claude (the design)
**Status:** Written after a brainstorm with Andrew. Awaiting his review before the implementation plan.
**Builds on:**
- the barrel and whitewater pile (`2026-09-29-barrel-and-whitewater-design.md`, on this branch): the lip's cross-section
  (`lipProfile.ts`, mirrored in `lipProfileNodes.ts`), `barrelMetrics`, and the pile with its surge;
- the one-clock fix (`13a7719`): the onset record in the reef field, carried along the rays;
- Andrew's reference deck (`reference/wave/Aerial View.pptx`) and the traces made from it (`reference/wave/traces/traces.html`,
  with the reef measurements in `reference/wave/traces/reef-step-measurements.txt`). The `reference/` folder is gitignored,
  so these live only in the main checkout.

---

## 1. What this is

The Womb's barrel stops being one shape. The reef stays the same, but every wave throws its lip according to the
conditions and to its own circumstances. In Andrew's words, what makes this worthy of a 2026 surfing sim is that the
break's DNA stays consistent while each wave is slightly different, and the barrel is a big part of that.

Andrew's brief:

- **Low tide, clean offshore, huge swell:** the lip throws out furthest.
- **Higher tide:** still barrels with a nice offshore, but doesn't throw out like it does at lower tides.
- **Smaller waves:** may not make a barrel a surfer can ride under.
- **Onshore wind:** the wave crumbles. The main break point stays, but other parts of the face break early.
- **A slight change in swell direction:** a section of the left's wall throws out as it hits the reef. The surfer surfs
  around it, rides the barrel through it, or it closes out and they bail.
- **The explosion's surge** can go above +30%, but not on every wave.

This is too much for one build, so it's split into three. The later two build on this one:

- **A (this spec):** how hard the lip throws, from one number, the **break intensity**, measured at each point along the
  crest as it breaks.
- **B (later):** crumbling. It reads the low end of the same intensity: spilling instead of plunging, and early breaks along
  the face in onshore wind.
- **C (later):** sections from swell direction. Intensity already varies along the crest with the reef, so C only has to
  make each wave's direction change where the reef makes it break.

**Andrew's answers during the brainstorm, which the design keeps to:**
- **Anchors.** The cyan tube (slide 2, "Very Womb-like") is the heavy day. Andrew's 29 Sep side-on markup is a normal good
  day. High tide is gentler.
- **Too big.** At low tide it breaks further out and wide, and the whitewater washes through. It's unrideable.
- **Wave-to-wave variation is physics only:** each wave's height, its small direction change, and how drained the reef is
  when it arrives. A seeded random nudge is kept as a dial that starts at zero.
- **Approach:** intensity comes from the reef where each point breaks (not one number per wave, and not measured off the
  face's own shape).
- **Tubes are never taller than wide.** Andrew accepted this correction to his 8 × 10 m target: the normal anchor keeps his
  lip height, reach, thickness and trough, but its back wall rises under the crest. Gentler means longer and lower, not
  rounder.
- **The peel edge.** Seen from in front, the lip's end falls from crest to water over 0.66–0.94 face heights along the
  line. We'll test with these figures.

## 2. What Andrew should see

- **At low tide**, with offshore wind and a big set, the Womb throws its heaviest barrel: a thick lip landing far out, and
  a tube wider than tall with a flat ceiling, like the cyan tube.
- **At mid tide**, a normal good day: the shape of his 29 Sep markup, about 13 m wide by 10 m tall at 12 ft.
- **At high tide**, still a barrel, but a longer and lower one, thrown less far.
- **Small waves** make the same proportions scaled down, too small to stand in.
- **Too big at low tide:** it starts breaking out over the flat bottom before the ledge.
- **Within a session**, the first wave after a long lull throws a little harder, and a wave close behind the last one a
  little less.
- **Onshore wind** lowers intensity. The full crumble is B's.

## 3. Design

### 3.1 The step: what the reef gives each breaking point

Mead & Black (2001) found a straight-line relationship between reef slope and tube shape at world-class breaks: the
steeper the reef, the rounder and heavier the tube. The Womb is a true ledge. Along the peak's line the bottom sits flat at
about 13 m, rises to about 6 m over roughly 15 m (about 1 in 2), and runs onto a flatter reef top at 4–6 m (depths at mid
tide).

Plain slope at the breaking point gets tide backwards at some sizes: a wave can start breaking a few metres earlier at low
tide, at the foot of the ledge, where the measured slope is flatter. So the measure is the **step**:

> **step** = the still-water depth where a section starts to break ÷ the shallowest still-water depth over the next
> 1.5 × that depth along its ray, clamped to [1, 3].

"Where a section starts to break" is the onset the record already finds for each breaking level. What the step comes to
at the Womb's peak:

| Case | Where it breaks | Step | Reads as |
|---|---|---|---|
| Low tide, well overhead | on the ledge | ≈ 2.6 | heavy |
| Mid tide, 12 ft | on the ledge | ≈ 2.2 | normal good day |
| High tide | on the ledge | ≈ 1.9 | less throw |
| Small, high tide | on the reef top | ≈ 1.1–1.3 | gentle |
| Too big, low tide | over the flat 13 m | ≈ 1.0 | breaks outside (B's) |

**Re-fitted after the bake (Andrew's ruling, 2026-09-30).** Baked from the real reef, with the crest smoothing, the step
at the peak for the biggest set wave is lower and compressed:

| | 4 ft | 6 ft | 8 ft | 10 ft | 12 ft | 15 ft |
|---|---|---|---|---|---|---|
| Low tide (−1.5 m) | 1.79 | 2.22 | 2.16 | 1.91 | 1.48 | 1.05 |
| Mid tide | 1.33 | 1.71 | 1.95 | 2.07 | 1.80 | 1.48 |
| High tide (+1.5 m) | 1.22 | 1.35 | 1.58 | 1.80 | 1.85 | 1.80 |

Each tide has its own best size (low 6–8 ft, mid ~10 ft, high 12 ft and up); past it the set breaks outside over the flat.
12 ft at low tide is already too big. "Low throws heavier than mid, mid than high" holds up to about 8 ft; above that a
bigger swell wants more tide. The step → intensity points below are re-fitted to this range.

**How it's stored:**
- The onset record gets one more value per breaking level: the step where that level broke. It's carried along the rays in
  the same march as the time since onset and the throw's height, so it never jumps backward along a ray.
- A record sample grows from 1 + 2 × 12 = 25 values to 1 + 3 × 12 = 37.
- The step is smoothed along the crest as the breaking depth already is (`BREAK_SMOOTHING_M`), so small reef bumps don't
  make the lip ragged.
- Tide already rebuilds the field, so tide changes the step with nothing more.
- A point with no record reads the normal anchor.

### 3.2 Break intensity

One number per crest point, built in this order:

1. **The reef:** a piecewise-linear map from step to intensity through step 1.3 → 0, 1.85 → 1, 2.25 → 2 (re-fitted to the
   baked reef; first drafted as 1.25 / 2.2 / 2.8). Below 1.3 it goes negative, which A treats as 0 and B will use. This is
   the calibration. The plan checks it on the real field: 12 ft at mid tide reads 1 ± 0.15 at the peak.
2. **Wind:** + 0.25 × clamp(offshore speed ÷ 8 m/s, −1, 1). The offshore speed is the wind speed times the cosine of the
   angle between where the wind blows toward and against the waves' travel. Onshore is negative, cross-shore about 0.
3. **Period:** + 0.15 × clamp((T − 12 s) ÷ 6 s, −1, 1). Longer groundswell hits harder.
4. **This wave's drain:** + 0.1 × smoothstep(T, 2T, gap) − 0.3 × (1 − smoothstep(0.6T, T, gap)). The gap is the time
   since the previous wave reached the peak. It gives a small bonus after a lull, a penalty for stacking close behind, and
   about 0 at normal set spacing (T ± 10%). It's worked out once per wave when the wave is scheduled.
5. **The random dial:** + dial × a seeded uniform in [−1, 1] per wave. The dial starts at 0 and goes up to 0.3.
6. **The nudge:** + an overall intensity offset from the Break panel, starting at 0.

The result is clamped to [0, 2] for the shape.

The default conditions (3 m/s offshore, 15 s) land about here: mid tide ≈ 1.17 (normal), low tide ≈ 1.8, low tide with
8 m/s offshore ≈ 2.0 (heavy), high tide ≈ 0.85.

### 3.3 The barrel's shape from intensity

The three anchors are **measured targets**, taken at the lip's landing on the peak for the biggest 12 ft set wave. The
lengths are × H, measured with `barrelMetrics`:

| | Gentle (0) | Normal (1) | Heavy (2) |
|---|---|---|---|
| Tube width ÷ height (`tubeRatio`) | ~2 | ~1.3 | ~1.1 |
| Lip lands ahead of the crest (`landAhead`) | ~1.0 | ~1.7 | ~2.0 |
| Lip thickness at the root (`rootThickness`) | ~0.1 | ~0.2 | ~0.3 |
| Face drawn below still water (`troughBelow`) | ~0.2 | ~0.55 | ~0.7 |
| Explosion surge above the lip (`pileSurge`) | 0 | +30% | +45% |

**How the shape is built:**
- For each anchor, the plan calibrates the profile's inputs to hit that row: the throw (jet speed ÷ crest speed), the root
  thickness, the back wall's position (today's `WALL_BACK_H`), the trough drain and the surge.
- `barrelShape(I)` blends the calibrated inputs between the anchors, smoothstep-eased, so nothing jumps.
- The tip-to-root thickness ratio stays 0.4.
- A small wave gets the same proportions at a smaller H. Whether a surfer fits is a matter of size, not a special case.
- Each crest point's shape comes from its own intensity. Along a peeling wave the shape follows the reef, which C builds
  on.
- The lip's end seen from in front (the peel edge) is checked against the traces, falling from crest to water over
  0.66–0.94 face heights along the line.

### 3.4 Where it lives

- **`breakIntensity.ts` (new):** the CPU source of truth. `stepToIntensity`, `offshoreSpeed`, `drainBonus`,
  `breakIntensity` (the sum in §3.2) and `barrelShape` (the anchors and their blend). Pure functions.
- **`breakIntensityNodes.ts` (new):** its GPU mirror, term by term, the same pattern as `lipProfileNodes.ts`.
- **`reefField.ts` / `breaking.ts`:**
  - The step in the onset record, with the layout constants and an `onsetStep` reader that interpolates like `onsetTime`
    and `onsetHeight`.
  - The throw strength, lip thickness, trough drain and pile surge leave `BreakParams`. Two new entries take their place:
    `intensityNudge` and `randomDial`.
- **`sets.ts` / `SetWaves.ts`:**
  - Each wave carries its drain bonus and random draw, in the spare slots of its existing 8-value GPU record.
  - Wind's offshore speed and the period become uniforms.
  - The onset texture grows to fit 37 values.
- **`setWaveModel.ts`:** `crestAt` reads the step and works out the intensity and shape. The sheet's trough drain and the
  pile's surge read the crest point's shape instead of the global parameters.
- **`lipProfile.ts` / `lipProfileNodes.ts`:** `LipParams` takes its throw, thickness, wall and drain from the crest point's
  shape.
- **The Break panel:** the throw, lip thickness, trough drain and surge sliders become the intensity nudge and the random
  dial. The Sets panel adds an "intensity at the peak" readout next to "face at the peak".

Left for C: each wave's small direction change still doesn't move where the reef makes it break, because the field is
built for the session's swell direction.

### 3.5 Cost

- **GPU per frame:** a few more texture reads and a short sum per crest point. Target: at most +0.2 ms at 12 ft
  barrel-peeling (4.9 ms today).
- **Memory:** 12 more values per record sample.
- **The reef build:** one more depth search per level along each ray, done at build time, not per frame.

## 4. Testing

**Tests first, for each part:**
- **The step:**
  - On made-up profiles, a ledge gives the right deep ÷ shallow ratio, a flat bottom gives 1, and the value is smooth along
    the crest.
  - On the real field, low tide gives a bigger step than high tide at the same size.
  - A too-big wave at low tide reads about 1.
  - It never jumps backward along a ray.
- **Intensity:**
  - Offshore > calm > onshore, and long period > short.
  - A wave after a long gap scores higher than one close behind.
  - Normal set spacing adds almost nothing (under 0.05).
  - With the dial at 0, the same session gives the same waves every time.
  - The calibration points hold on the real field.
- **Shape:**
  - Each anchor reproduces its row of §3.3 within tolerance (`tubeRatio` ± 0.15, the others ± 10%).
  - The inputs change smoothly with intensity (no step between neighbouring intensities larger than a set bound).
  - The profile never crosses itself (`crossings` = 0) anywhere from 0 to 2.
- **GPU mirror:** the self-tests (`ribbon.selftest.ts`, `breaker.selftest.ts`) cover the new terms, CPU against GPU.
- **Existing tests** that pin today's single-shape defaults are rewritten to check the anchors.

**By eye, before any tuning (the rule from the canyon):**
1. **Side-on drawings.** The profile viewer draws the three anchors side-on: heavy over the cyan trace, normal over
   Andrew's 29 Sep markup, gentle on its own. It also draws a front-on view of the lip's end against the two front-on
   traces. Andrew marks them up and signs off before any number is tuned.
2. **In the game.** Screenshots from the lineup and the shoulder at the low-tide-set, barrel-peeling and high-tide-set
   moments, to compare against the photos.

**Performance:** GPU frame time at 12 ft barrel-peeling, measured against today's.

## 5. Success criteria

1. Andrew signs off the three side-on anchors and the front-on peel edge against his traces.
2. In the game, low tide throws visibly heavier than mid tide, mid tide heavier than high tide, and onshore wind lowers the
   throw, with no other setting changed.
3. Within one session, the throw differs wave to wave, and more after a long lull.
4. All tests pass, including the CPU/GPU self-tests.
5. The GPU frame costs at most 0.2 ms more than before.

## 6. Not in this build

- **B, crumbling:** spilling breakers and early breaks along the face in onshore wind. The low end of intensity is there,
  but A only uses 0 to 2.
- **C, sections:** each wave's direction moving where the reef makes it break.
- **The look:** flow-aligned streaks on the face and tube, and offshore spray along the whole crest line. Both are in the
  reference deck; they're later look work.
- **The surfer:** whether a surfer fits, and the suck on the paddle-in.
