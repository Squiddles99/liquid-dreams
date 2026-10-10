# Whitewater, spray, foam and spit: the wave's air and its leftovers

**Author:** Fable 5.1 (orchestrator), 2026-10-10, with Andrew. **Executor:** Opus 5.5. **Branch:** `whitewater` from main
9b5e7e2, worktree `../ld-whitewater` (own `npm install`; never a junctioned node_modules). **Status:** design approved by
Andrew in chat 2026-10-10 (classification architectural; approach A "evolve what's there"); the written spec awaits his review,
then the plan.

**Andrew's brief:** "get the whitewater, spray, foam and spit looking good … the final feature to make the wave look almost
real-life … we have to be creative in how we generate these effects to sell the effect cheaply. Depending on the breeze the
barrel may be relatively clean, or full of spray." References: `reference/wave/whitewater/1–5` (git-ignored, third-party
photos; see §2). Rulings in chat: both views (ride camera and beach), **the beach is the acceptance test**; **look only**
this segment (the mound's physics for the surfer is R4's, later); the whitewater's height at the landing is **impact energy,
not crest height** (a pitching lip on the flats surges far above the barrel, a crumbling lip does not).

## 1. What exists, and what is dead

Live (from the 2026-10-10 survey): `SprayParticles` (one class, two instances: offshore mist; impact explosion + spit +
Bombie bursts), 32,000-slot GPU pools, CPU emitters along the crest trace at 3 m (`sprayEmitters.ts`, 14.0 ms per 20 Hz
tick after shelf-polish's exact cull), wind-gated 1→6 m/s offshore; `FoamField` (530×750 texels at 1 m, 20 Hz, drifts
0.4 m/s shoreward, clears linearly in 10 s, 0.03 ms a tick); the Worley lace (`setFoamPattern`), the Bombie and shore
foam. Wind is already a select-screen condition (`sessionSetup.WIND_ROWS`: Glassy 1 kn … Blown out 22 kn, with direction)
and already feeds the spray and the lip's shape (`overturn.ts`). No new condition is needed.

Dead: the whitewater **pile and churn** (`pile: false` since 6459b56, 2026-10-05: it stood 5–7 m ahead of the crest as a
second wave); the curl's **foam zones** (`extras.z` hardwired 0 since 26d49a0). The broken section today is the profile
family's own collapse (phase 1 → 2 over `collapseSpan`, the 0.47 A white-water wall) handed back to the sheet's bore
(`BORE_SHARE` 0.52) — one surface, the right height, but no surge, no tumbling front, and shaded as smooth water with
white paint.

Budget facts the design is built on: the board's water is ~40 ms of a ~64 ms riding frame and is not touched; spray
births are the biggest non-water CPU item; the pools' GPU cost is small; per-pixel sprite lighting cost 5 ms (so lighting
is per vertex).

## 2. What Andrew should see (the five photos)

| # | Reference | Effect | Driver |
|---|---|---|---|
| 1 | SUP in front of a clean barrel | plume of spray fanned up and back over the wave, taller than it; dense boiling whitewater to the right | offshore wind × the lip's throw; the landing |
| 2 | dark backlit barrel | the plume glowing against the sun; spit blasting out of the mouth; lace from earlier waves across the whole foreground | wind, tube compression, foam that lingers for minutes |
| 3 | strong offshore, wide | the whole unbroken crest line smoking before it breaks; big plume behind the broken section | strong offshore wind only |
| 4 | drone over a small wave | a crumbling wave's whitewater as a tumbling bore, lumpy front, streaks of foam left on the flat water | the collapse, no surge; the foam map |
| 5 | bodyboarder, side-on | **timing:** the lip clean and translucent to its tip; the tip's edge feathers as a thin white fringe tracking diagonally down the curtain to the flats, the barrel behind still revealed; only after the tip lands does the whitewater explode upward behind the curtain | the throw, then the landing |

The glue that makes 1 and 2 read as real rather than white blobs: mist in the air near the break and light through it.

## 3. The mound (the broken section)

Four changes, all in the ribbon and the profile family; none in the sheet, the ride or the reef.

**3.1 The surge.** A term on the closed-tube knots at the landing (profile keys between phases 1 and 1.5): height above the
family's curve = `SURGE × A × hollow × pulse(t − τ_land)`. SURGE ≈ 0.5 (half a wave height above the crest for a fully
pitching lip; a dial, measured against photo 1's right side), `hollow` from ψ (`hollowFromPsi`) so a crumbling lip gets
none, the pulse rising over 0.3 s after the landing and falling over ~1.5 s × the wave's power (the H×T rule
`collapseSpan` uses). It sits forward of the landing, never on the face: `hollowFace.test` stays green. CPU family and GPU
mirror both carry it (`wombProfile`/`wombSectionNodes`). The impact explosion's rise reads the same `SURGE × hollow`
(`IMPACT_RISE_H` becomes a function of it), so burst and mound agree.

**3.2 The tumbling front.** `pileChurn` is re-gated on the section's bore weight × fresh-foam weight instead of the pile:
amplitude ∝ A, fading with the section's age (a low boil by 50 m), lumps leaning forward and steeper on the front than on
the back. Render-only vertex displacement on the ribbon, as it is today.

**3.3 Whitewater shading.** Fresh foam (weight > 0.75) is lit as a foam volume, not water: albedo ~0.9, diffuse plus a soft
wrap so it glows backlit, self-shadowed hollows from the churn's normal, the sky's blue in the shadows, no water specular.
Thinning foam blends to today's lace over water. Shares `mistLight` (§6.3).

**3.4 Foam on the curl, with photo 5's timing.** The curl's foam zones come back as a per-vertex weight from (phase, knot):
the **tip's edge only** is white from the throw (a diagonal fringe down the curtain), the lip's face and the tube's inside
are clean (face foam 0 before phase 1.2), foam climbs from the tip as the tube caves in. The impact window starts at τ_land
(plus ~0.2 s to the first burst), not at first contact.

Not here: the sheet's bore shape and its decay over distance (ride physics, R4); the lace left behind (§5).

## 4. Wind → spray

**Driver.** `w_off` = the offshore component of `conditions.wind` on the crest normal (`offshoreFactor` exists), plus the
along-crest component `w_along` for shear. The seven wind rows become seven looks (approved table):

| Wind row | Lip veil | Plume over the back | Crest feathering | Spit |
|---|---|---|---|---|
| Glassy 1 kn | none | none | none | clean, short |
| Light offshore 6 kn | thin | low, falls back | none | yes |
| Strong offshore 18 kn | full | tall (1–2 H), blown back | whole line (photo 3) | held back, dense |
| Cross-offshore 10 kn | yes | leaning along the line | near the curl only | sheared |
| Cross / onshore / blown out | ragged mist forward over the face | none | none | blown forward |

**4.1 The plume.** No new system. A third particle kind `PLUME_KIND` (`particleKinds.ts`), born from the same
`breakEmitters` at the throwing tip into the spray pool, sharing the per-tick cap: fewer, bigger (2 → 6 m over life),
longer-lived (3–5 s), launched with the lip's throw plus an updraft `v = k · w_off · (up + back over the crest)`, drag to
the wind (the pool has it). Strength ∝ smoothstep(3, 9 m/s, w_off) × the lip's weight × A. The sprite dissolves by an
animated noise threshold with age (erosion), not a uniform fade. Lit per vertex (sun HG + sky) with the isotropic share
raised so it glows backlit without going grey side-on.

**4.2 Feathering.** Emitters along the unbroken crest ahead of the curl (the trace already carries the standing wall):
small, short-lived mist blown back off the crest where `wallWeight > 0.6`, strength ∝ smoothstep(5, 10 m/s, w_off). They
read **no section frame** (the frame is the expensive part): the crest point from the station's own x, z, H. Capped at
2 ms per tick CPU, measured with `_rideCost --spray`.

**4.3 Spit.** Stays; a denser, wider horizontal blast (larger sprites, opacity 0.3 → 0.5, reach from `SPIT_SPEED`), held back
or sheared by the wind vector.

**Guards.** Total births ≤ `SPRAY_BIRTH_CAP` per tick (the plume takes slots from the veil, not on top); plume sprites ≤ 6 m;
the near-camera fade keeps big quads off the tube cam; GPU overdraw at the tube cam at strong offshore ≤ +1 ms.

## 5. The foam map (lace left behind)

**5.1 Two lives.** `.r` stays density; `.g` becomes age since fresh. Density: dense → lace fast (exponential, half-life
~4 s, a bore is lace by ~10 s — Andrew's 2026-09-27 "gone in ~10 s" was about the dense whitewater), then the lace floor
decays slowly (linear, `LACE_LIFE` 75 s, dial 30–120). The lace shader already draws low weights as threads; only how long
it stays there changes.

**5.2 Advection.** Three pushes summed in the same compute pass: the existing shoreward drift; the bore's push where the foam
is fresh (∝ density × the bore's speed, so lace streams out behind the broken section — photo 2's foreground); the wind,
surface foam drifting at ~2 % of the wind vector (streaks line up with the wind — photo 5).

**5.3 Look.** The pattern's long axis follows the drift direction (today: the swell's travel). Fresh density gets §3.3's
foam-volume shading; aged lace stays thin and bright over water with the existing crease shading. On the inside the map's
lace meets `CoastalSurf`'s foam at the waterline through a blend band, as the map already does at its box edge.

**5.4 Replay.** A link/jump replays the map's history: 75 s = 1500 ticks ≈ 0.4 s. The replay runs the oldest 65 s at 2 Hz
(Δ 0.5 s; decay and drift are linear there, bilinear sampling stable) and the last 10 s at 20 Hz (~ +30 ms). A test pins
replay to live play within 2 % density at 10 s and 60 s.

## 6. Mist and light

No depth-buffer reads (there is no depth prepass; adding one is its own budget item).

**6.1 The mist slab.** The foam map's `.b` channel = mist density: written where a lip lands (× the surge) and where the
plume is born (× wind), decaying in ~3 s, drifting with the wind. Every material near the water — sheet, ribbon, board,
rider, the particles — samples it at its xz and applies fog with a slab of height ~1.5 A: transmittance
`exp(−density × path length through the slab)`, colour sky-lit white with a Henyey–Greenstein forward lobe on view·sun so
mist between the camera and the sun glows (photos 1, 2). One texture read; exactly zero when calm. From the beach it wraps
the broken section in haze; from the tube cam it softens the far wall through spit and explosion.

**6.2 Soft particles without depth.** Each puff fades by its height above the water it was born over (the emitter knows
it): alpha × smoothstep(0, 0.5 m, y − y_water). One float per birth. The near-camera fade stays.

**6.3 One light.** `mistLight(viewDir, sunDir, sky)` in TSL, shared by the sprites, the slab and §3.3's foam volume: sun ×
phase (HG g 0.75 mixed with isotropic, as `sprayLook` today) + sky × 1/π + a ground bounce from the water's colour (the
turquoise in the spray's shadows, photo 1). Sprites keep per-vertex lighting.

Not doing: rainbows in backlit spray, the plume's shadow on the water, depth-sorted particles (unsorted premultiplied
blend; the plan carries a "sort by tick" fallback at a known cost if ordering shows).

## 7. Testing and the frame gate

**Frame gate** (same machine and method as shelf-polish: `_rideProfile.mjs --sim-t=300`, 5 runs interleaved main vs
branch, the machine's state stated):
- riding median at 7 ft Pumping, **strong offshore 18 kn**, ≤ main's fresh median × 1.10; p90 is not a bar (±25 % spread);
- CPU per 20 Hz tick (`_rideCost --spray`): births ≤ today's 14.0 ms; feathering ≤ 2 ms on top is the one allowed growth;
- GPU at 1080p, tube cam and beach, strong offshore: all sections together ≤ +2.5 ms, the slab ≤ +1.5 of it; the foam map's
  tick < 0.1 ms;
- calm identity: Glassy with no break in the box → pixel-identical to main; Glassy with a break → differs only in the
  ribbon's broken section and the foam (regions named); the spray pools empty.

**Unit and self-tests** (CPU reference ↔ GPU mirror, the house rule): surge ∝ hollow, 0 at hollow 0, never on the face
(`hollowFace.test` green); the lip's timing (tip fringe from the throw, face foam 0 before phase 1.2, impact window from
τ_land); churn amplitude by age (0 at age 0's clean tube, < 0.2 A by 50 m); the two-stage decay (a dense patch < 0.25 by
12 s, > 0 at 60 s) and the summed drift vector; replay ≡ live within 2 % at 10 s and 60 s; slab transmittance; births per
wind row match §4's table (no plume at Glassy, no feathering under 5 m/s offshore); every existing self-test and the suite
at baseline.

**Acceptance — the beach, by Andrew's eye.** Five deterministic moments (links), captured at 1080p from the lookout/beach
camera, each beside its photo:

| Photo | Conditions |
|---|---|
| 1 plume + clean barrel | 10 ft, strong offshore, mid-morning sun from the side |
| 2 plume backlit, lace foreground | 12 ft, strong offshore, low sun behind the wave, 60 s into a set |
| 3 whole line feathering | 8 ft, strong offshore, wide from the beach |
| 4 crumbling bore | 4 ft low tide, light offshore, high camera |
| 5 tip fringe → explosion | 8 ft, light offshore, side-on, three frames 0.3 s apart |

Fable reviews Opus's captures and numbers against this spec; Andrew rules on the look.

## 8. Process

Task order: mound (§3) → foam map (§5) → wind spray (§4) → mist (§6) → captures, perf, handovers (§7). STOPs for Andrew's
eye after the mound and after the spray. Off-limits: the reef/shelf reads and crest-trace edges the three nice-to-have
branches own (`reefField`, `breaking.ts`'s level read, the closeout edges: branches `level-read`, `inner-shelf`,
`closeout-edges`); the surge lives in the profile keys, which none of them touch. The ride's hot path
(`sectionFrameKnots`, `sumWaves`, the board's water) is untouched. Every segment ends with
`docs/superpowers/handover/<date>-whitewater-{opus,fable}.md`; the ledger is `.superpowers/sdd/2026-10-10-whitewater/progress.md`.
