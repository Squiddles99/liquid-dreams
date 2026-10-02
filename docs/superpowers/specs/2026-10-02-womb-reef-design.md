# The Womb's reef (build A): its depths, its rock, and seeing it

Approved with Andrew in chat, 2026-10-02. Build B (weed and kelp moving with the water's flow, and the flow itself)
follows this one and gets its own spec.

## 1. Why

- **12 ft feels small and tame.** At 12 ft the biggest set waves start breaking 100–250 m south-west of the peak (at mid
  tide; earlier at low tide) and reach the barrel zone as settling whitewater. Cause: seaward of the ledges the bed rises
  gently from 13 m to the 6 m ledge over 145 m (the barrel-from-maths "softened ramp", `rampShape` v², `ledgeWidthM`
  145), so a big wave feels the bottom and breaks far out on it.
- **At the real Womb (Andrew):** a 12 ft swell breaks "a touch further, but basically the same spot", never on the outer
  reef. Out the back the bed deepens steadily over a long distance, deeper than ours (not a cliff). With optimal wind,
  swell direction and tide, 12 ft throws a huge barrel ("you could drive a small truck through"); at 12 ft it mostly
  closes out.
- **The left no longer peels from the peak.** The softened ramp rounded the depth contours off the A-frame: the left's
  first 40 m north of the peak close out before it peels (~11 m/s; the old ledge peeled 14 m/s from the peak).
- **The bed reads wrong.** The real reef is dark weed-covered rock almost everywhere and reaches two to three times
  further seaward than our ledge line (Andrew's satellite views, `reference/place/womb-correct-*.webp`). Sand shows only
  as scattered pockets. A continuous olive weedy rock platform, 10–20 m wide, runs from the beach's waterline into the
  reef with no sand strip. Past about 200 m off the beach the water is uniform deep navy. The game still has large sandy
  areas, and from the water the bed reads as uniform navy: the player can't see the reef at take-off.

## 2. Success criteria (agreed)

1. **Where it breaks.** For every swell size up to 12 ft, at every tide, the first section to break does so at the
   take-off spot or within 30 m seaward of it, never further out on the deep reef.
2. **The peel.** The left peels from the peak itself again (measured from the peak, not from 23 m north of it), at a speed
   in the existing 8–20 m/s band. The right still closes out along the south ledge.
3. **The barrel by conditions** (Andrew's taxonomy, `overturn.psiState`):
   - 12 ft with an ideal tide, swell and offshore wind reaches state 6, thrown out (the truck-sized tube).
   - 12 ft in ordinary conditions mostly closes out along the line.
   - Smaller days keep today's states: an oval at mid tide, the cylinder when conditions are ideal.
4. **The bed.**
   - **Depth:** out the back it deepens steadily from the 6 m take-off to about 20 m some 200 m seaward, then eases into
     the open sea's 30 m as now.
   - **Material:** dark weedy rock is the default everywhere on the reef, including down the deep slope. Bare rock shows in
     patches and on the reef heads. Sand appears only in scattered pockets, placed from the satellite views.
   - **The shore:** the weedy platform runs from the waterline to the reef.
5. **Seeing the reef.** Looking steeply down from the face at take-off, the bed is readable to roughly 12–15 m: rock,
   weed patches and sand pockets, darker and bluer with depth. Past ~20 m it fades to the deep navy of the photos. At a low
   grazing angle the sea still reads as sea.

## 3. The shape

- **Inside the ledges (the shelf):** unchanged. That covers the 6 m take-off corner (`ledgeDepthM`), the reef heads, the
  pockets' depths, the two ledges (`NORTH_LEDGE`, `SOUTH_LEDGE`) and the domain warp. The warp stays tapered to zero
  within 15 m of the peak.
- **Seaward of the ledges** (`buildBathymetry`'s `sd < 0` branch; `v` = distance seaward of the ledge line):
  - Replace the 145 m v² ramp with a two-part profile: a steep reef face rising from about 11–12 m to the 6 m ledge over
    the last 30–40 m, then a steady deepening to about 20 m by ~200 m out.
  - That profile meets the coast's background, so the deep water around the reef deepens to match. Today's
    `REEF_SURROUND_DEPTH_M` is 13 m; the `nearReef` term in `buildBathymetry` is where the change goes.
  - Beyond the reef the far field is untouched (`depthBg`, `FAR_DEPTH_M` 30 m, `coastFarField`), and the map still meets
    it seamlessly at its edges.
  - The exact curve (face height and width, slope beyond) is tuned against §2.1–2.3 with the reef field's onset record,
    not by eye. It replaces `rampShape`, `ledgeWidthM` and `deepDepthM` in `ReefParams`; the new parameters are named for
    the face and the slope.
- **The rock reef's extent:** down the deep slope the bed stays rock (material, not shallowness), out to two to three
  times our ledge line's distance seaward, following the satellite views. It is deep there, so it doesn't change where
  waves break.
- **The barrel's calibration:** ψ₀ (`reefField`'s onset record) comes from the slope where each section breaks, so the new
  face changes it everywhere. `SHEET_POINTS` and any ψ-keyed constants are re-checked against §2.3. The peak's ψ₀ at
  12 ft mid tide is no longer pinned at 0.065; the states in §2.3 are the targets.

## 4. The look

- **Material** (`buildBathymetry`'s sand and weed channels; `shoreReef`):
  - Weedy rock is the default on and off the shelf, out to the reef's extent.
  - `SAND_POCKETS` is re-placed from the satellite views as scattered pockets; the large sandy areas go.
  - The open coast outside the map keeps `OPEN_COAST_MATERIAL`.
  - The shore platform (`shoreReefWidth`) joins the reef with no sand strip anywhere along the map's stretch of coast.
- **Seeing it** (`waterOptics`, `seabedShading`):
  - The water's absorption and backscatter, and the seabed's shading and weed colour, are tuned so §2.5 holds from a
    take-off camera on the face and from the lineup.
  - The tuning targets Andrew's aerials and the earlier observation that the bed is dark weed-covered limestone and the
    water in front of the peak deep navy, not turquoise. The turquoise is the foam's.

## 5. Process and checks

1. **Drawings first, for Andrew's sign-off** (feedback "wave shape by eye"): side-on depth profiles along the peak's ray
   and the north ledge, old against new, each marked with where 4, 6, 8 and 12 ft first break at low, mid and high tide,
   and each wave's tube state there. Plus in-game stills from his usual cameras (the lineup, his 12 ft camera at the
   peak) and a take-off camera on the face. No tuning ships before he has seen them.
2. **Tests (vitest), RED first:**
   - first-break distance seaward of the peak ≤ 30 m for set waves 4–12 ft at three tides;
   - the left's peel measured from the peak;
   - tube states for the §2.3 cases;
   - the bed's material rules (the rock fraction, sand only in pockets, the platform reaching the reef);
   - the depth profile's shape (steady, monotonic seaward of the face, meeting the far field at the map's edges).
3. **GPU mirrors:** `Seabed`'s TSL nodes (`depthBgNode`, `shoreReefWidthNode`, material) and the reef field's textures stay
   exact; the breaker and seabed self-tests (`?selftest=breaker`, `?selftest=seabed`) pass.
4. Existing behaviour tests that pin the softened ramp's numbers are updated, each named in the plan with its reason.

## 6. Out of scope (build B)

Water velocity under the wave (the draw seaward and up the face, the shove shoreward after the break), and weed and kelp
on the reef that sway and stream with it, visibly pulled toward the wave at take-off. The same flow later lets the surfer
feel the wave suck them up the face.
