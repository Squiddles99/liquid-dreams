# Liquid Dreams: the barrel from the maths — Design

**Date:** 2026-09-30
**Authors:** Andrew (the brief, the states, the sign-off on the maths), Claude (the design)
**Status:** Andrew approved the direction ("PERFECT") and the reef softening, 2026-09-30. Awaiting his review of this
written design before the revised plan.
**Replaces:** §3.1–3.3 of `2026-09-30-condition-driven-barrel-design.md` (the step, the intensity sum and the three
calibrated anchors). Its §3.4 (where it lives), §3.5 (cost) and §6 (not in this build) carry over except where this
document says otherwise. Plan Tasks 1–7 are built and pushed; this design changes what Tasks 8–11 build, and some of 1–7.
**Mockups Andrew signed off:** `barrel-from-maths.html` (the three states from the equations) and
`womb-barrel-examples.html` (the equations on our reef), in `reference/wave/traces/` in the main checkout (gitignored),
with the interactive versions `barrel-maths.html` and `barrel-examples.html`; the papers are in `reference/wave/`.

---

## 1. What changed, and why

Three rounds of hand-built barrel shapes didn't satisfy Andrew: flat tube floors that met the face at a step, tubes carved
back behind the face, lips hovering over the water. Andrew set out what real waves do (his six states, below) and asked
for the shape to follow published science: "no one can argue with maths".

The literature has it. The overturning tube of a breaking wave has been measured, simulated and fitted, and its size,
shape and tilt follow **one number**, ψ₀, set by how steep the seabed is where the wave breaks and how big the wave is for
the water it arrives in. Wind changes it by a measured amount. Applied to our reef, the maths gave Andrew's states, and it
also showed why every earlier attempt fought the reef: the Womb's ledge was 1 in 2, five times steeper than any seabed in
the studies, which makes every wave that breaks on it a slab. Andrew chose to soften the ledge.

## 2. Andrew's states (his words, 2026-09-30)

1. **Doesn't break:** the swell isn't big enough, or the tide is too high.
2. **Crumbling at the lip:** typically onshore wind; a messy face with unpredictable sections breaking. (B, later.)
3. **Crumbles, then barrels:** crumbles in deeper water, and barrels where it passes over shallow sections, "slurping" the
   water in front of it. (B and C, later.)
4. **An oval tube:** the lip throws over only slightly and meets the face about half way down. Mid tide, or a slightly
   unideal swell or wind direction.
5. **A cylindrical barrel, top to bottom:** perfect tide, swell and wind.
6. **The lip thrown out beyond the face:** as 5, with the swell at the top end of what the break sees.

There is (almost) never a step in front of the lip, and no pocket behind the face: the face is one smooth concave curve,
and it is the back of the tube. Any tide and swell combination can land in any state: gentle, normal and heavy are shapes,
not tides.

## 3. The maths

### 3.1 The number that sets the shape

> **ψ₀ = s / (H₀/h₀)^¼** (Pick & Feddersen 2026, eq. 3.5)

- **s**: the seabed slope where the wave breaks.
- **H₀/h₀**: the wave's height over the depth of the water it arrives in, before the reef rises.

A steeper reef raises ψ₀. A bigger wave for the same water lowers it, gently (the ¼ power). Their fits cover
0 < ψ₀ < 0.1 (slopes 1:100 to 1:10); our states read:

| ψ₀ | State | What it looks like |
|---|---|---|
| < 0.02 | 1–2 | no tube (A's lower limit; B takes over) |
| ≈ 0.02–0.05 | 4 | a thin teardrop tilted ~50°, the lip meeting the face 60–75% of the way down |
| ≈ 0.05–0.08 | 5 | a larger tube, the lip landing at the bottom |
| ≈ 0.08–0.1 | 6 | a fat tube tilted ~20°, the lip thrown out onto the water in front |
| > 0.1 | 6+ | a slab: the tube a flat-bottomed foil on the water it lands on (their Fig. 5a); past the fits |

### 3.2 The tube at the moment the lip lands

The tube's outline is Longuet-Higgins' (1982) curve, along (x′) and across (z′) its long axis:

> **z′/W = ± (3√3/4) · √(x′/L) · (x′/L − 1)**, 0 ≤ x′ ≤ L

A teardrop, round at the back (x′ = 0, up under the crest), pointed where the lip meets the water (x′ = L). Area
(2√3/5)·W·L. Its size, shape and tilt, with H the wave height at impact (Pick & Feddersen 2026, eqs 3.7–3.10):

| | Equation | Fit |
|---|---|---|
| Tube area | A_O / H² = 5.319 ψ₀ − 0.043 | r² 0.990 |
| Lip area | A_J / H² = 37.072 ψ₀² − 0.587 ψ₀ + 0.020 | r² 0.997 |
| Width ÷ length | W / L = 1.661 ψ₀ + 0.298 | r² 0.943 |
| Tilt | θ = −5746.4 ψ₀² + 225.2 ψ₀ + 48.4° | r² 0.982 |

Placed on the wave:
- The tube's round back sits just ahead of the crest's vertical, its top a lip's thickness under the crest.
- **The lip** is the tube's upper side thickened outward: thickest over the tube's top, tapering to nothing where it lands
  (their Fig. 6b), just thick enough to hold A_J.
- **The face** below the landing point carries the tube's floor on down and eases flat into the water in front. The face
  from the trough, up the tube's back and out along the lip's underside is one smooth concave curve.
- **Where the lip lands is not an input.** It follows from the tube's size and tilt: two thirds of the way down in state 4,
  at the bottom in 5, out on the water in 6.
- **Past ψ₀ = 0.1** the size and tilt are held at 0.1 and the roundness is taken from Mead & Black's surf-reef line (below),
  and the tube's bottom is the water it lands on (a foil). This is the one extrapolation, and it is labelled as such.

**The cross-check from real surf reefs** (Mead & Black 2001, photos of breaks on seabed gradients 1:8 to 1:40, 1:X):
tube length ÷ width = 0.065 X + 0.821. It agrees with the fits on gentle reefs (1:30 gives W/L 0.36 from both); on steep
ones real reefs give rounder tubes.

### 3.3 The lip in the air

The lip falls freely (Peregrine 1983), so the existing ballistic clock stays: it lands when a free fall from the crest top
reaches the landing point. Over the throw the tube grows along its own axis on that clock; at every moment the lip's
underside is the tube's upper side and the face under it is the tube's lower side, carried down to the trough. Nothing is
ever a corner.

### 3.4 After it lands

Unchanged from the collapse work Andrew approved (commits 8572c8f, 23c43b0): the tube stands about 1.5 s, the whitewater
fills it from below as it collapses, the tip stays in the water where it landed, and the ribbon hands back to the sheet.

### 3.5 Wind (measured, not a dial)

Feddersen et al. (2023) measured overturns at field scale at the Surf Ranch, with the cross-wave wind U (16 m up) from
offshore to onshore, against the wave speed C:

| U / C | Tube area A/H² | Width ÷ length |
|---|---|---|
| offshore, below −0.4 to −0.5 | ≈ 0.40 (it levels off) | ≈ 0.48 |
| calm, 0 (read between the two ends) | ≈ 0.33 | ≈ 0.40 |
| onshore, +0.75 | ≈ 0.20 | ≈ 0.25 |

So the tube area and the width ÷ length from §3.2 are each multiplied by a wind factor, piecewise-linear through those
points relative to calm: area ×1.2 at U/C ≤ −0.4, ×1 at 0, ×0.6 at +0.75; width ÷ length ×1.2 at U/C ≤ −0.5, ×1 at 0,
×0.62 at +0.75; held past the ends. U is the wind's component against the wave's travel, C the crest speed where it
breaks. Onshore wind also breaks the wave further out (their Fig. 9); that and the crumble are B's.

### 3.6 What leaves

- **Period.** None of the fits depend on it. The old period term goes. (A longer period still makes a bigger wave at the
  reef through the sheet, which does enter ψ₀.)
- **The calibrated anchors** (`ANCHORS`, `barrelShape`, the calibration search, `TARGETS`): the equations replace them.
- **The step and the intensity sum** (§3.1–3.2 of the old design): ψ₀ replaces the step; the sum's wind term becomes §3.5.

### 3.7 What stays as game rules (labelled, not from the papers)

- **This wave's drain** (the gap since the last wave): a wave after a long lull ×1.1 on ψ₀, one stacking close behind
  ×0.8, normal spacing ×1. Andrew wanted wave-to-wave variation from physics; this is the one physical effect the papers
  don't cover, kept small.
- **The random dial** (starts at 0, up to ±15% on ψ₀) and **the nudge** (Break panel, starts at 0): tuning dials.

## 4. The reef: softening the ledge

**Today:** outside the shelf the bed rises from the 13 m flat to the 6 m ledge over `ledgeWidthM` = 15 m on a smoothstep,
steepest (about 1 in 1.4) in the middle.

**New:** the rise runs over about 125 m, **steepest at its deep edge and easing toward the top**:
- depth = 6 m + 7 m × (1 − u)², u from 0 at the deep edge to 1 at the ledge line, with the first few metres blended from
  the flat so there's no crease;
- that's about 1:9 at the deep edge (ψ₀ ≈ 0.12 for a big wave breaking there: just past state 6), 1:18 half way up, 1:40
  or gentler near the top. (A 1:6 edge would read ψ₀ ≈ 0.2, twice past the fits: slabs again.)

**Why this shape:** a bigger swell, or a lower tide, reaches its breaking depth further out, on the steeper part, so it
throws heavier; a higher tide breaks further in, on the gentler part, and throws lighter; a swell too big for the reef
breaks on the flat before the rise, in state 4 or crumbling (it washes through, as Andrew said). Andrew's brief falls
out of the physics.

**What doesn't move:** the ledge lines themselves (`NORTH_LEDGE`, `SOUTH_LEDGE`), the shelf, the reef heads and pockets,
the take-off corner at (0, 0) at 6 m. Only the seaward ramp changes.

**The one number the plan sets:** the ramp's width (about 125 m), so that **12 ft at mid tide at the peak reads ψ₀ ≈ 0.065 (state 5)**.
The plan then checks the whole tide × size table (below) and shows it to Andrew.

**What it touches, and the plan re-verifies:** where waves start to break along the ledge (further out), the peel speed
along the left, the onset record, the slurp and the "peak stays tallest" test, the too-big-breaks-outside test, and the
seabed look (the ledge face's weed band).

## 5. Where it lives

- **`reefField.ts`:** the onset record's third value per level (today the step) becomes **ψ₀ for that level**: the
  mean seabed slope over ±1 onset depth along the ray around the onset, over (that level's local wave height ÷ the
  deepest still-water depth within 3 onset depths seaward)^¼. Same layout, same carry along the rays, same crest
  smoothing.
- **`breakIntensity.ts`** becomes **`overturn.ts`**: `psiAt` (ψ₀ with the wind factor, drain, dial and nudge),
  `overturnShape(ψ, H, U/C)` → {A_O, A_J, W, L, θ, foil}, and the wind factors. Pure functions, the CPU source of truth.
- **`lipProfile.ts`:** the tube, lip and face built from `overturnShape` (§3.2–3.3); the collapse as it is. Its GPU mirror
  `lipProfileNodes.ts` term by term.
- **`seabed/`:** the softened ramp (§4).
- **`BreakParams` / the Break panel:** the throw, lip thickness, wall and trough-drain sliders go; the nudge and random
  dial stay. The Sets panel's readout shows ψ₀ and the state at the peak.
- **`sets.ts` / `SetWaves.ts`:** as built (each wave's drain and draw); the period uniform goes.

## 6. Testing

**Tests first:**
- **The equations:** `overturnShape` reproduces each fit exactly; the LH82 area identity holds; the wind factors hit their
  table points; ψ below 0.02 gives no tube; past 0.1 gives the foil.
- **The profile at landing**, measured back off the drawn curve, matches `overturnShape` (tube area, lip area, W/L, tilt)
  within a few percent, across ψ 0.02–0.15 and H 2–9 m.
- **Smooth face:** from the trough to the lip's root the face only ever turns one way, the lip's contact point excepted;
  never a pocket behind the crest (as in the smooth-face test already written).
- **Never crosses itself** before it lands; the contact graze ≤ 5 cm (as now).
- **The reef:** the ramp's profile and its slopes at the deep edge, half way and near the top; the ledge lines and the
  take-off corner unchanged.
- **The table on the real reef**, at the peak, biggest set wave:
  - 12 ft mid tide reads state 5 (ψ₀ 0.055–0.075);
  - at the same size, low tide ≥ mid tide ≥ high tide, up to the size where it breaks outside;
  - too big at low tide breaks outside the rise and reads state 4 or lower;
  - small at high tide reads state 4 or lower.
- **Wind:** onshore shrinks the tube, offshore grows it up to the cap, at the same wave.
- **After landing:** the existing collapse tests (tip in the water, no horn, no step, floor rises evenly).
- **GPU mirror:** the ribbon and breaker self-tests cover the new terms.

**By eye (Andrew's gate, before any GPU work):** the examples page redrawn on the softened reef, from the code (not a
separate mockup): the tide × size table at the peak, each case side on over its seabed, plus the collapse frames.

**Performance:** GPU frame time at 12 ft barrel-peeling against today's; the frame pass gains no more than a few sheet
samples per station.

## 7. Success criteria

1. Andrew signs off the redrawn examples on the softened reef.
2. In the game: a low-tide set throws heavier than mid tide, mid than high, at the same size; onshore wind shrinks the tube;
   too big washes through.
3. No step, pocket, horn or square part anywhere in the lip's life.
4. All tests pass, CPU/GPU self-tests included; the GPU frame costs at most 0.2 ms more than before.

## 8. Sources

- Pick, K. & Feddersen, F. (2026) Scaling the shape of shoaling and overturning solitary waves. *J. Fluid Mech.* 1040, A8.
  doi:10.1017/jfm.2026.11869
- Longuet-Higgins, M. S. (1982) Parametric solutions for breaking waves. *J. Fluid Mech.* 121, 403–424.
- Feddersen, F. et al. (2023) Cross-shore wind-induced changes to field-scale overturning wave shape. *J. Fluid Mech.* 958,
  A4. doi:10.1017/jfm.2023.40
- Mead, S. & Black, K. P. (2001) Predicting the breaking intensity of surfing waves. *J. Coastal Res.* SI 29, 51–65.
- Moideen, R. & Behera, M. R. (2022) Numerical investigation of breaking focused waves… *J. Mar. Sci. Eng.* 10, 768.
  doi:10.3390/jmse10060768 (Andrew's find: the concave face, the weak plunge landing half way down)
- Peregrine, D. H. (1983) Breaking waves on beaches. *Annu. Rev. Fluid Mech.* 15, 149–178.
