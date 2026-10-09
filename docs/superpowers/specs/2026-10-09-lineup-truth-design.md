# Lineup truth: the coast, the four breaks and the swell's arrival — design

**Written by:** Fable (orchestrator), 2026-10-09, for Opus (executor). Branch `lineup-truth` from `main` (3095079).
Andrew's brief (2026-10-07, paused R4): "the lineup's swell angle and everything-breaks look" → "swell wrap +
bathymetry with the four real breaks". Confirmed 2026-10-09: the four breaks between South Point and Ellensbrook are
**Lefthanders, The Womb, Ellensbrook Bombie and Ellensbrook**; Andrew will export whatever Seamap Australia data is
asked for. References: `reference/place/new-sattelite-and-bathymetry-references/1–7.png` (never in a public repo).

## 1. Goal

From the lineup at the Womb, and from the dune lookout on the select screen, a south-west swell looks like the real
place: set lines march in **unbroken** over the shelf's 10–30 m of water, stand up and break **only** at the four
breaks, each in its character, with a modest shore-break along the beach. Nothing closes out along the whole inside.

| break | where (game metres: +x east, +z south, origin the Womb's peak) | character |
|---|---|---|
| Lefthanders | 1 666 m north of the Womb (z ≈ −1 666), a reef left on the shelf edge | breaks at every size, peels left (north) |
| The Womb | the existing reef map, unchanged | as today |
| Ellensbrook Bombie | 360 m offshore of Ellensbrook, ≈ (x −280, z +1 020) | a bombora in deep water: breaks only when the sets are big (8 ft and up), as a wide A-frame |
| Ellensbrook | the beach at z ≈ +1 080, a sand bar | a beach break, closes out at size |

(Distances from Andrew's measured map, image 1: South Point → Cobblestones 1 330 m, → Lefthanders 509 m, → the Womb
1 666 m, → Ellensbrook 1 080 m; the Bombie 360 m off Ellensbrook. The Bombie's offshore bearing is read from image 1
as west-south-west of the beach point; Task 1 places it from the data.)

## 2. Today, and why it looks wrong

The coast is one dimension: `coastProfile.depthBg(x)` (0.5 m at the sand → 1.5 m at 30 m → 15 m at 140 m, flat to
260 m, 15 m to the map's west edge) and `coastFarField` is the exact 1-D refraction over it; the GPU draws every set
wave outside the reef map from that 1-D table (`SetWaves.farA/farB`), infinite along the coast. So every wave of
every set arrives at one angle everywhere, stands up on the 15 → 1.5 m ramp at the same offshore distance along the
whole coast, and closes out as one straight line: "waves going in everywhere". The real shelf (image 7: 1 m contours
near the Womb) slopes from 1 m at the sand to 10 m about 300 m out and 20 m near 700 m, smoothly and nearly parallel
to the beach, with the reefs as features on it: on it, a 6 ft set passes unbroken until a feature stands it up. The
swell's bend around the capes is kilometres away and is what the swell-direction dial already describes; the local
bend is over the shelf and the features.

## 3. Design

### 3a. The data (revised 2026-10-09: no export; traced)

Andrew's check of the Seamap bathymetry (image 8, `reference/place/new-sattelite-and-bathymetry-references/8-contours-gracetown-to-ellensbrook.webp`)
shows the survey **stops 300–500 m short of the beach**: its innermost "1 m" line is the survey's edge, not the sea's,
and all four breaks sit in the unsurveyed strip. So the data's value is the **outer slope only**: from about 10 m
(≈ 400–500 m offshore) out to 30–40 m, where the contours are sound and nearly parallel to the coast. That is the
water the swell bends over, which is what the lineup's "swell angle" needs.

Sources, by zone:
1. **Outer shelf (depth ≥ 10 m):** the contours **traced by hand** from images 7 (right panel) and 8 into
   `src/seabed/coastContours.ts` as polylines with depths, in local metres about the Womb's peak (the scale bars:
   image 8 is 1:31 691 with a 500 m bar; image 7's right panel is the 1 m-contour zoom). Tracing accuracy ±30 m along
   the coast, ±1 m in depth, is enough: the eikonal at 4 m cells cannot see finer.
2. **Inner shelf (the beach to ~450 m out):** a hand-built profile: the Womb's own reef map inside its footprint
   (unchanged), elsewhere the satellite's reef/sand reading (dark = reef, teal = sand; images 2–3) as the substrate,
   with depths from the reef map's own ledge/shelf figures (`DEFAULT_REEF_PARAMS`) and the features of §3b: the
   inner shelf 2–8 m over reef, sand gutters 4–7 m, the shore-break slope as `depthBg` today near the sand.
3. **Join:** a smoothstep over 100 m between the inner profile's outer edge (~8–10 m) and the traced 10 m contour.
No Seamap export, no `geotiff` dependency, no `reference/place/seamap/`.

### 3b. The coast map (`src/seabed/coastMap.ts`)

A coarse depth grid in the game's frame: `COAST_GRID = { x0: −1500, z0: −2100, cellM: 4, nx: 438, nz: 875 }`
(x to +250 m, z to +1 400 m: 1.75 × 3.5 km, 383 k cells), built **once at boot in the worker** from:
- the traced outer contours (§3a.1), rasterised by interpolation between the two nearest contours along the
  offshore direction; the inner profile (§3a.2) inside them, joined over 100 m;
- the **four features** laid over it where the data's resolution cannot carry them (named, parametric, like
  `wombReef.ts`): Lefthanders' ledge (a polyline along the shelf edge at z ≈ −1 666, a ledge profile like the Womb's,
  default 5 m ledge over 12 m water); the Bombie (a mound: top depth `BOMBIE_TOP_M` 5, radius 60 m, in 12–15 m);
  Ellensbrook's bar (a sand bar 1.5–2.5 m deep, 60–100 m off the beach, over 300 m of coast); the beach waterline
  from the satellite along the whole map (the dune shift as today near the Womb);
- **the Womb's own reef map, unchanged**: inside `REEF_GRID`'s footprint the coast map takes the reef map's depths,
  downsampled 8×, so the two agree where they overlap.
`depthBg(x)` stays as the background outside the coast map only. Deterministic and built from code and the traced
tables at boot in the worker (under a second at 383 k cells; no baked file: the inputs are TypeScript).

### 3c. The coast field (`src/breaker/coastField.ts`)

The worker solves the **eikonal on the coast grid first** (the same `solveEikonal`, flux march and smoothing as the
reef field, factored into a function both call), seeded on the coast grid's west edge and ends by the 1-D far field
(`farSample`) where it is deep (≈ 25–30 m at x = −1 500). Output `CoastField = { grid, tau, dirX, dirZ, k, amp, hmin,
depth, omega }`, with `tau` normalised so τ(peak) = 0 as the far field is. The **reef field is then seeded from the
coast field at its boundary** instead of from the 1-D far field (`farAt` → `coastAt` in `computeReefField`), so the
lines arriving at the Womb carry the shelf's bend. The onset record stays reef-only: the ribbon, the ride, the spray
and the foam field keep working only at the Womb. The other three breaks break by **ratio alone** (the sheet's
lifecycle with `hasRecord` false, which exists today), so they stand up, pile and turn to white water where
`H ≥ 0.78 × depth`, without a tube.

### 3d. The GPU sheet (`SetWaves`)

Outside the reef grid, the sheet reads the **coast field's textures** (two RGBA32F, 438 × 875: τ, amp, hmin, k /
dirX, dirZ, depth, breaking depth) instead of the 1-D `farA/farB`; beyond the coast grid, the 1-D far field as today.
The field sampler's `inside` / `useGrid` select gains one tier. The CPU twin (`sampleField` outside the reef grid →
`coastSample`) mirrors it, so the ride's water and the lineup camera read the same sea. The far breaks' white water is
the sheet's pile and the ocean's foam shading; the **foam field is not extended** in this segment (its grid is the
reef's). If the far white water reads thin in the captures, a coarse far foam layer is the follow-up, not this spec.

### 3e. What the player sees (the gates' pictures)

- From the lineup looking north: Lefthanders' white water on a 6 ft set at 1.7 km, the lines between unbroken.
- From the lineup looking south: Ellensbrook's beach break; the Bombie standing up only at 8 ft and above.
- From the lookout (the select screen's Conditions beat): set lines on the shelf, white water only at the breaks and
  along the sand.
- The Womb itself unchanged: the reef map and its record are the same, the lines reach it through the shelf instead
  of a flat 15 m basin, so the arrival angle and peel may move a little (gate: the ride still catches; §4).

### 3f. Cost

The worker's build grows by the coast eikonal (383 k cells against the reef's 487 k: about +70 % of the eikonal and
flux time; measured in Task 2, budget ≤ +4 s on Andrew's machine at boot, behind the cover). The GPU sheet outside
the reef grid pays 8 texture loads per sample instead of 4 (1-D); cam-mode frame time is the gate (±10 %).

### 3g. Dials (dev panel, "Coast")

`BOMBIE_TOP_M` (3–8), Lefthanders' ledge depth (3–8), Ellensbrook's bar depth (1–3) and offshore distance; all in
`DEFAULT_COAST_PARAMS`, normalised as the reef's are. The swell-direction dial keeps its meaning (the direction at the
coast map's west edge).

## 4. Tests and gates

1. **The map** (`coastMap.test.ts`): deterministic; depth at 20 points on the traced contours equals the contour's
   depth within 0.5 m; inside the reef footprint equal to the reef map downsampled (< 1 cm); the four features at their places
   (Lefthanders' ledge 5 m at z −1 666; the Bombie's top 5 m at its centre and ≥ 11 m 150 m from it; Ellensbrook's bar
   ≤ 2.5 m at its line); monotone deepening offshore away from features.
2. **The coast field reduces to the far field** (`coastField.test.ts`): with the coast bed set to `depthBg(x)`, τ and
   direction on the coast grid match `farSample` within 1 % and 1° everywhere.
3. **The reef field is the reef field**: with the same flat coast bed, `computeReefField` seeded from the coast field
   equals the old (far-field-seeded) field within 0.02 s in τ and 1 % in amp at every reef node; the onset record
   identical to 1e-3.
4. **No closeout** (`coastBreaking.test.ts`, the real coast map): at 6 ft, the set of coast cells where a set wave's
   ratio reaches 1 is contained in: the four breaks' footprints (each a named polygon) and a shore band within 60 m
   of the waterline; at 4 ft the Bombie's footprint has no cell at ratio 1; at 10 ft it has, and the ratio-1 locus
   there spans ≥ 80 m of crest (an A-frame, not a spot).
5. **The ride**: `src/ride` green except R3's known red; `heldS` within ±0.3 s of main's per case; the probe `lazy
   (R9)` 0.00 cm. If the Womb's arrival angle moved the peel out of 9–12 m/s on the first leg, say so (Andrew decides).
6. **Frame time**: `_rideProfile --ft=6 --sim-t=300` cam median within ±10 % of main's same session; the worker's
   field build time logged before and after.
7. **Captures** (Andrew's gate, Fable first): lineup north and south at 6 and 10 ft, t at a set's third wave; the
   lookout shot at 6 ft; the existing down-the-line Womb frames at 6 ft for "unchanged".

## 5. Out of scope (carried)

Land beyond the current terrain (the far breaks are seen as water and sky; the dune backdrop is the select screen's
painting); riding any break but the Womb; a far foam layer; the capes' wrap (the dial); Cobblestones and South Point
(beyond Lefthanders, 2 km+); the ocean FFT's swell component unchanged.

## 6. Constraints

`src/seabed/bathymetry.ts` (the Womb's reef) and `src/ride` untouched; `wombReef.ts` untouched. Zero budget: nothing
to download; no new dependency. Probes in `tools/_*` or
env-gated tests; `tsc` clean; commit + ledger (`.superpowers/sdd/2026-10-09-lineup-truth/progress.md`) + push per
task; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `reference/` never in a
public repo; the traced contour tables are derived data and may ship.
