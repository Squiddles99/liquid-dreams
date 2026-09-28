# Liquid Dreams Phase 4b ("The waterline") Design

**Date:** 2026-09-28
**Authors:** Claude, under Andrew's delegation ("use your superior understanding to do this based on your own decisions")
**Status:** Written, ruled and implemented by Claude under Andrew's delegation on `phase-4b-the-waterline` (plan `docs/superpowers/plans/2026-09-28-the-waterline.md`). Every decision marked **Ruling** is Claude's, for Andrew to review. **Not merged.**
**Builds on:**
- Phase 4a (`2026-09-28-the-view-back-design.md`): the land, the waterline x_s(z), the seabed shift (`Seabed.shiftNode`), the shore reef platform (`seabed/shoreReef.ts`, width W(z)), the sunlight map;
- Phase 1/2: the swell period, the set events (`swell/sets.ts`, `wavesNear`), the reef field's arrival time τ (`reefField.sampleField`, which falls back to the coast's far field outside the map);
- Phase 3a: the water's foam look (`setFoamPattern`, `waterFoamFrame`, `shadeWater`'s foam path).

---

## 1. What this is

After 4a the whole coast meets calm water. The Womb's set waves are the Womb's alone: their crests taper out 250–500 m from the peak (`TAPER_NEAR_M`/`TAPER_FAR_M`), and the FFT swell fades away in water shallower than 6 m. Andrew's aerial of the Womb's beach, and every reference photo of this coast, shows white water breaking over the shore reef and surf lines along every beach.

4b builds **the waterline**: the surf along the whole coast, the swash running up the sand, and the wet line it leaves.

**Ruling W0, the approach:** a deterministic **coastal surf model**, not an extension of the breaking-wave physics. Extending the set waves, the ribbon and the foam field 30 km along the coast would cost far more than the view needs; seen from the lineup, the coastal surf is 150 m to 15 km away. The model is analytic, evaluated in the shaders from small uniform tables that the CPU fills. It has a CPU mirror for the tests, like the rest of the project.

## 2. What Andrew should see

From the lineup, looking back at the beach:
- white water rolls across the shore platform toward the sand, one bore per swell period;
- the bores run up the beach as a thin sheet and drain back;
- the sand is darker up to where the last swashes reached, and dries back over a minute or two;
- when a set comes through the Womb, bigger bores follow along the beach, and the swash runs further up.

Looking north and south along the coast, a white surf band lines every beach and headland, thicker when a set passes, fading into the haze. It's the same moment every time: the surf is deterministic.

## 3. Design

### 3.1 The coastal wave train

- **Period:** the swell's period T (`conditions.swell.periodS`).
- **Wave n** reaches the Womb's peak at t_n = n·T, the same reference as the set events' arrival times (τ = 0 at the peak).
- **Where it breaks:** at the platform's outer edge, W(z) seaward of the waterline (`shoreReefWidth`), so the surf breaks where the seabed becomes reef.
- **When it breaks:** t_break(n, z) = t_n + τ_coast(z), where τ_coast(z) = τ(190 − W(z), z) is the reef field's arrival time at the break point in field coordinates. The field's coast is straight at x = 190; the seabed shift moves it to x_s(z), so the break point in field coordinates is 190 − W whatever the shift. Along an oblique swell the breaker therefore peels along the coast at the swell's along-coast speed, and the sets reach each beach in step with the Womb.
- **The τ table (Ruling W1):** the CPU samples τ_coast every 25 m of z over z ∈ [−15000, 15000] (1201 entries). It's a uniform array, not a texture, like 4a's skyline table and waterline shift. It's rebuilt when the field changes.
- **Heights (Ruling W2):** each wave n has a breaking height H_n (m):
  - between sets, 0.45 · Hs · U(0.8, 1.2) from a hash of n (Hs = `surferFeetToHs(sizeFt)`);
  - a wave that's a set wave at the Womb (the set event whose arrival rounds to n·T) breaks at 0.55 × its heightM, since the wide platform takes more out of a wave than the Womb's ledge;
  - all × `surf amount`.
  
  The CPU fills a 256-entry table, H for wave indices n_base … n_base + 255, covering every wave that can be breaking or swashing anywhere on the coast at the current time. Along 30 km of coast τ_coast spans about 1,400 s on the default swell, about 180 waves at T = 8 s, plus the last six arrivals' history. It's refreshed each frame (it only changes when the time crosses into a new wave, or when conditions change). Indices outside the table clamp to its ends.

### 3.2 The bores and the surf's foam

- **Movement:** each wave's bore starts at the break line when it breaks and runs shoreward at c_b = 3.5 m/s (Ruling W3: √(g·h) over about 1.25 m of water). Its front is at d_f = W − c_b·(t − t_break); it lives from breaking until d_f = 0, when it becomes swash.
- **Strength:** s = (H_n / 1.5 m) · (1 − 0.6·(1 − d_f/W)). A bore loses about 60% of its strength crossing the platform.
- **Foam, at d metres seaward of the waterline:**
  - a bright front, exp(−((d − d_f)/2.5)²);
  - plus a trailing carpet seaward of it, 0.6·exp(−(d − d_f)/12);
  - both × s;
  - a burst at the break line, just as it breaks, over its first 1.5 s;
  - a lingering lace over the surf zone, 0.25 × the mean strength of the last two bores.
- **Where it applies:** only d ∈ [−5, W + 30]. Everywhere else it's skipped.
- **The look:** it feeds the water's existing foam path (`setFoamPattern` coverage, water-anchored, then `shadeWater`), combined with max against the other foam. It's lit by the sun (with the land's shadow) like all foam.
- **At a distance (Ruling W4):** once a pixel spans more than about 3 m of d (`fwidth`), the per-bore pattern aliases, so it blends to its time-average: a steady band, strength × duty cycle. From the lineup the far beaches show a white surf band rather than flicker.
- **Which bores are evaluated:** the three most recent breaks at the pixel's z. That's enough: the platform is at most 90 m wide, a bore crosses it in at most 26 s, and T ≥ 8 s.

### 3.3 The swash

- **The runup:** when a bore reaches the sand, at t_arrive = t_break + W/c_b, it runs up the beach to a height R_n = 0.25·H_n + 0.05 m above the tide (Ruling W5).
- **Its shape in time:** it rises over the first quarter of the swash time T_s = 0.6·T, then drains back over the rest. The water level at the shoreline is r(z, t) = the max over the two most recent arrivals.
- **The moving waterline (Ruling W6):** the ocean sheet is lifted by r·(1 − smoothstep(0, 40, d)) near the shore (vertex stage). The sheet already extends under the land, so the lifted water climbs the sand and the waterline moves with each swash. On the 1:10–1:15 beach, a 0.3 m runup is 3–4 m of beach.
- **The bed under the swash (Ruling W7):** today, landward of the waterline, the seabed the water shader looks through is a 0.5 m flat (Phase 1's stand-in for the missing land). Landward of x_s (d < 0), the bed now follows the beach profile's first part (`beachHeight`, default profile) in the GPU `Seabed.bedHeightNode` and its CPU mirror `bedHeightAt`. The swash is then a thin film over sand, not half a metre of water. The wave model's arrays (bathymetry, far field) are unchanged; only the shading's bed changes.
- **The bed's material:** landward of the waterline it's sand, where 4a's shore reef material would otherwise say weedy rock. The swash runs up sand, and the weedy rock stays seaward of the waterline.
- **The swash's edge:** where the lifted water is under 0.1 m deep over the bed near the shore, the water shows a foam lace, the leading edge of the swash.

### 3.4 The wet line

- **The wet level:** w(z, t) = the max over the last six arrivals of R_n · exp(−(t − t_arrive,n)/90 s) (Ruling W8: sand dries back over a minute or two).
- **In the land's material:** sand is wet where its height is below tide + w, with a 0.12 m soft edge. The dry-to-wet mix applies to all sand, so the wet band follows the swash and the tide. It replaces 4a's fixed 12 m wet strip: the cover's wet weight now only means sand in the intertidal zone.
- **Evaluated where:** per pixel from the same tables, with no textures.

### 3.5 App, sliders, debug

- **`CoastalSurf`** (`src/surf/CoastalSurf.ts`) owns the uniform tables and the TSL nodes. It's built in the App before the ocean surface and the land, and passed to both.
- **Each frame:** `surf.update(simTime, conditions, events, field)`, which rebuilds the τ table only when the field changes.
- **A Surf folder** (persisted with the look): `surf amount` 0–2 (default 1), and `surf` on/off for comparison captures.
- **The overlay:** the Reef folder's `foam map` overlay also shows the surf zone faintly.
- **A new reference moment:** `surf-from-the-lineup`, 08:15 facing the beach during a set's arrival at the shore.

### 3.6 Cost

The targets:
- the ocean fragment ≤ +0.3 ms at the default view;
- the vertex stage ≤ +0.1 ms;
- the land ≤ +0.1 ms;
- the tables ≤ 0.2 ms of CPU per frame, and the τ table ≤ 5 ms per field change.

Uniform buffers stay ≤ 12 per stage and sampled textures don't grow (the limits test checks both).

## 4. Files

- **New:**
  - `src/surf/surfModel.ts` (+test): the CPU model: the τ table, heights, bores, runup, the wet level;
  - `src/surf/CoastalSurf.ts`: the uniform tables and the TSL nodes;
  - `src/surf/surf.selftest.ts`.
- **Changed:**
  - `seabed/Seabed.ts`, `seabed/bathymetry.ts`: the beach bed landward of the waterline, and sand there;
  - `ocean/OceanSurface.ts`: the swash lift, the surf foam, the swash lace;
  - `land/landShading.ts`, `land/Land.ts`: the wet line;
  - `app/App.ts`, `dev/DevPanel.ts`, `dev/devSettings.ts`, `dev/referenceMoments.ts`;
  - the limits test.

## 5. Testing

**CPU:**
- the τ table follows the field (equal to `sampleField` at the break points) and is continuous along z;
- the heights: set waves map to the right indices; lulls vary within ±20%; `surf amount` scales them;
- the bores: a bore starts at the break line when it breaks, reaches the sand after W/c_b, and never appears seaward of the break line or before breaking; foam is 0 outside the surf zone;
- the swash: 0 before arrival, peaks at R_n, back to 0 by T_s;
- the wet level: at least the latest runup right after an arrival, decaying after, never negative;
- the bed: landward of the waterline it follows the beach profile; seaward it's unchanged.

**GPU self-tests:** the TSL nodes (bore foam, swash level, wet level) match the CPU model at sample points and times.

**Limits:** the ocean's and the land's materials within 8 storage buffers, 16 sampled textures and 12 uniform buffers per stage, with no new sampled textures.

**Gallery (`docs/superpowers/gallery/phase-4/waterline/`):**
- the beach from the lineup as a set's bores roll in;
- the swash on the sand, close;
- the wet line;
- north and south along the coast (the surf band);
- surf off, for comparison;
- the costs.

## 6. Success criteria

- Bores roll across the platform to the beach once per swell period, bigger in sets, in step with the Womb's sets.
- The swash visibly runs up and drains back, and the wet line follows it.
- A white surf band lines the coast north and south, steady at a distance.
- The Womb's waves, the land and the shadow are unchanged apart from the surf.
- The costs meet §3.6.

## 7. Not in this build

- Breaking wave faces along the coast (the coastal surf is white water only; seen from the lineup the faces are hundreds of metres to kilometres away).
- Wave setup, rips, sandbar dynamics.
- Foam deposited on the sand; surf sound (Phase 5); spit (3d); Ellensbrook Bombie (4c).

## 8. As built

**Tuned in captures (rulings in the plan ledger):**
- **Bore fronts:** 4 m wide and ×1.8 brighter (§3.2 said 2.5 m and ×1), so even a between-sets front reads as solid white water.
- **The far band's grazing boost:** clamp(0.08/|view y|, 1, 5). From low views a flat band is squashed to a sliver, while real white water stands about 1 m tall.
- **Runup:** 0.5·H + 0.1 m (Ruling W5 said 0.25·H + 0.05). That's the Stockdon-type estimate for long-period swell on a steepish beach; at the smaller value the wet band was a 2 m strip.
- **`surf-from-the-lineup`'s camera:** 5 m above the lineup. From the lineup's 0.8 m eye height the surf zone, 125–215 m away, is about 2 px and nearby crests hide it (true to life: surfers see the shore break from the tops of swells).

**Other:**
- **The seabed's waterline table** went from 50 m to 25 m samples. With the beach bed landward of the waterline, the coarser table put the bed's waterline up to about 2.5 m off the land's.
- **The land** now builds its material once and disposes of the one it replaces (4a's deferred minor).

**Measured:**
- CPU: 0.0005 ms steady per frame; 0.24 ms for the τ table.
- GPU: within noise (the switch only zeroes the result).
- No new textures; 5 uniform buffers per stage.
- 594 unit tests; 48 GPU self-tests (the surf's GPU nodes match the CPU model exactly).

**After the final review:**
- **The height table (I1):** 2048 entries, packed four per vec4 (8 KB). On the real coast τ spans 1300–2500 s, so 256 entries didn't cover short periods. It's now tested against the real far field at T = 4–20 s and swells from 180°–330°.
- **The water's edge (I2):** where the tide meets the beach or seabed (`waterEdgeOffset(tide)`). It anchors the bores' run, the swash, the lift and the lace, so at low tide the bores reach the water out on the platform, and at high tide the white water reaches the sand. The intertidal sand stays damp whatever the swash.
- **Bores per pixel (I3):** 10, not 3, so every bore reaches the water's edge at short periods.
