# Liquid Dreams Phase 1 ("Reef & Sets") Design

**Date:** 2026-09-26
**Authors:** Andrew Justice & Claude
**Status:** Phase 1 complete (2026-09-27)
**Builds on:** `docs/superpowers/specs/2026-09-25-liquid-dreams-first-light-design.md` (the vision and architecture spec; its world conventions, "one source of truth for water height" and deterministic-moments principles apply unchanged)

> **Review note for Andrew:** sections 1–7 were discussed and agreed in conversation. Sections **8 (seeing the reef)** and **9 (dev tools, reference moments)** were drafted while you were away, following the direction we'd agreed — please read those two closely.

---

## 1. Why this phase, and what changed in the roadmap

Andrew wants to see the Womb break as soon as possible. The breaking wave depends on the reef, so the original Phase 1 ("The place": reef plus beach, dunes, heath, rocks) and Phase 2 ("The wave") are regrouped. The work is split into two parts, each with its own spec, plan and build:

- **Phase 1, "Reef & sets" (this spec):** the reef depth map, tide, a visible seabed, swell arriving in sets, and set waves that slow, bend and stand up on the reef without breaking.
- **Phase 2, "The break" (next spec):** breaking onset, the throwing lip, the barrel, the drain off the ledge with the step in the face, the right closing out, the turquoise lip, and calibrating surfer feet against the breaking face.

Land visuals (beach, dunes, heath, rocks above water) move to a later phase. The revised roadmap is recorded in the vision spec (§3).

## 2. Corrections to the Phase 0 description of the break

Andrew corrected two facts on 2026-09-26 with new satellite references (`reference/place/womb-correct-*.webp`):

1. **Location.** The peak is at **-33.895216, 114.983359**, about **190 m** off the beach (measured 189 m and 192 m). The Phase 0 coordinates (-33.8972366, 114.9832508) were about 225 m too far south. The world origin moves to the corrected peak. Sun position changes negligibly.
2. **The opposing section.** The Womb is an **A-frame**. At the peak the wave splits: the **left peels north** along the reef edge (the ride) and an **unridable right runs south from the same peak and closes out**. The Phase 0 phrase "the left collides with a short section breaking the opposite way at the end of the ride" was wrong.

The vision spec (§2) is updated to match.

## 3. The experience at the end of Phase 1

You sit in the deep water just south-west of the Womb's peak on the default morning: a 4 ft SW groundswell and a light easterly offshore.

- Looking down, you see dark limestone ledges and reef heads, weed, and turquoise sand pockets under clear water. South and seaward it all falls away into deep blue.
- In the lulls, the background sea keeps you rising and falling.
- Every **10–20 minutes** a set of **4–8 waves** arrives. Lines darken on the south-west horizon and grow. As each wave reaches the reef it slows, bends around the wedge and stands up tall and peaky. The peak line swings north along the reef edge (where the left will peel in Phase 2) while the south edge stands up all at once (where the right will close out).
- Every wave is slightly different; sets are seeded, so a moment link replays the same set exactly.
- Lower tide makes waves stand up harder and earlier; higher tide softens them.

**Honest compromise:** waves this size would break on the ledge. In Phase 1 each wave rises to the edge of breaking, then loses height as it crosses the shallow shelf (its height is capped by the local depth), so it fades down instead of breaking. Phase 2 replaces the fade with the break.

## 4. Decisions

| Decision | Choice | Source |
|---|---|---|
| Split | Phase 1 reef & sets, then Phase 2 the break, each done properly | Andrew |
| Reef depth at the peak | About **6 m (20 ft)** still water; a passing set wave draws the trough down to about **1.2 m (4 ft)** (that drain belongs to Phase 2) | Andrew |
| Reef shape | A **wedge** pointing out to sea with the peak at its tip: north edge (left peels), short south edge (right closes out), a patchy reef/sand shelf spreading north and inshore, an inner rock platform, the beach about 190 m east | Andrew confirmed the plan view |
| Seeing the reef | A rendered seabed beneath the water, with depth-based colour and haze; **no caustics yet** | Andrew |
| Set rhythm | Sets every **10–20 min**, **4–8 waves**, the **biggest mid-set** | Andrew |
| Lineup | **Deep water just south-west of the peak**, looking across as waves stand up and the peak line runs north | Andrew (exact spot to confirm on screen) |
| Wave approach | **Layered:** the Phase 0 FFT ocean stays as the background sea; a reef-aware set-wave layer adds individual waves shaped by a precomputed refraction and shoaling field | Andrew chose approach 1 of 3 |
| Background swell over the reef | Fade the FFT ocean's long-swell cascade out over shallow water (keeping chop); set waves carry the swell there | Andrew agreed |

## 5. Architecture

New modules follow the vision spec's module table:

| Module | Purpose |
|---|---|
| `seabed/` | The Womb's bathymetry and material mask, built from named features; tide-adjusted depth queries (CPU) and GPU textures |
| `swell/` | Seeded set generator: a deterministic timeline of individual wave events |
| `breaker/` | The reef wave field (arrival time, direction, amplification, depth cap) computed in a Web Worker, and the set-wave surface function shared by rendering and the height probe. Phase 2 adds breaking here. |

Data flow:

```
Conditions (tide, swell, seed) + tuning params
  │
  ├─► seabed/  ── depth + material textures ─────────────┐
  │       └─► breaker/ field worker ── field textures ───┤
  ├─► swell/  ── active wave events (≤ 12, per frame) ───┤
  │                                                      ▼
  └─► ocean/ (FFT, long swell faded over shallow water) ─► water surface = FFT + Σ set waves
                                                          ├─► renderer (water + seabed seen through it)
                                                          └─► HeightProbe ─► lineup camera
```

- **One source of truth.** The set-wave height and displacement function is written once in TSL and used by both the rendered surface and the GPU height probe, exactly as the FFT sampling is shared today.
- **Pure maths stays testable.** Bathymetry construction, the set generator, dispersion, the eikonal and amplitude solvers and the depth cap are plain TypeScript with Vitest tests. GPU code consumes their outputs.
- **Determinism.** Everything random derives from `Conditions.seed`. Given the same conditions, tuning parameters and simulation time, the sea and the sets are identical.

## 6. The reef (`seabed/`)

**Extent and resolution.** A depth map covering x ∈ [−400, +250] m, z ∈ [−450, +300] m around the peak (650 × 750 m; +X east, +Z south). Resolution: **0.5 m** (1300 × 1500 texels, half-float) plus a material mask (reef, weed, sand) at the same resolution. Around the reef the seabed sits on a continuous 1D coast profile that deepens to **30 m** at the map's west edge; near the map's edges the reef fades back to that profile, and outside the map the profile continues (30 m to the west, a 0.5 m flat landward of the waterline). The far-field waves use the exact 1D Snell solution over that profile, so they match the wave field at every edge.

**Built from named features, not painted pixels.** One data file (`seabed/wombReef.ts`) describes:

- the **north ledge**: a polyline from the peak running north-north-west about 260 m along the shelf's seaward edge;
- the **south ledge**: a short (~40 m) polyline from the peak running south-east;
- the **ledge profile**: depth across the edge, rising from deep water to the shelf over about 15 m horizontally;
- the **shelf**: a base depth with seeded, domain-warped noise shaping reef heads and sand pockets, plus the major sand pockets traced from the corrected satellite images;
- the **inner rock platform** and the slope up to the beach waterline, about 190 m east of the peak.

The builder is deterministic and runs once at startup (target under 300 ms), producing the textures and a CPU copy for bilinear depth queries.

**Depths.** 6 m still-water depth at the peak is Andrew's figure. The rest are estimates, all tunable in the dev panel:

| Feature | Still-water depth |
|---|---|
| Deep water outside the ledge | 12–15 m |
| Ledge at the peak | 6 m |
| Reef shelf | 2–6 m, reef heads up to ~1.5 m |
| Sand pockets | 4–7 m |
| Inner rock platform | 0–2 m |

**Tide.** `Conditions.tideM` (already stored since Phase 0) now takes effect: the mean water surface sits at y = tideM and depth = tideM − seabed height. Default mid tide (0 m). The dev slider covers ±1.5 m, matching the sanitizer's guard (assumption: Margaret River's actual tidal range is about a metre). The FFT ocean and set waves ride on the tide level.

**Origin.** `WOMB_LOCATION` becomes the corrected peak coordinates.

## 7. Sets and the reef wave field

### 7.1 The set timeline (`swell/`)

- **Slots.** Time is divided into slots of the mean set interval (default 15 min). Slot *k* holds one set whose start is seeded within ±150 s of the slot's centre, giving 10–20 min between sets. Any set is computable directly from the seed and its slot index: no history, O(1) random access, and exact replay from moment links.
- **Waves in a set.** 4–8 waves (seeded), spaced one swell period apart with ±10% jitter. Heights follow a mid-set-peaked envelope with ±15% per-wave variation; each wave also varies by a few degrees in direction and a few percent in period.
- **Strays.** Between sets, an occasional smaller stray wave (tunable rate and size, default 1–2 per lull at 50–70% of set height).
- **Heights.** Set waves are the biggest waves of the swell: deep-water height ≈ **1.3–1.8 × Hs**, where Hs comes from the swell dial through the existing provisional mapping (Hs = 0.4 m × surfer feet). At 4 ft that is about 2–3 m. Phase 2 recalibrates surfer feet against the breaking face.
- **Energy.** The FFT ocean's swell component is scaled down (tunable "lull factor", default 0.5) so sets and background don't double-count. Wind sea is unchanged.
- **Output.** For any simulation time, the list of waves within their travel window, each with: arrival time at the peak, deep-water height, period, direction, and a seeded crest-length taper.

### 7.2 The reef wave field (`breaker/`, Web Worker)

Computed on a 1 m grid over the reef map for the current swell direction, period and tide; recomputed in the background (debounced) when they change; the new field replaces the old one immediately (it only changes on dev edits, since tide is static within a moment in Phase 1).

- **Local wave speed** from the linear dispersion relation ω² = g·k·tanh(k·h) at each cell (h = tide-adjusted depth).
- **Arrival time** τ(x) from the eikonal equation |∇τ| = 1/c(x), solved by fast sweeping from a deep-water plane wave arriving from the swell direction. Lines of equal τ are the crest lines; refraction around the wedge falls out of it.
- **Height amplification** from energy-flux conservation along rays (shoaling × refraction), solved upwind in τ order, with light smoothing along crests where rays converge at the wedge tip (standing in for diffraction).
- **Depth cap.** Local wave height is limited to **0.78 × local depth**. Over the shallow shelf this cap removes height progressively: the Phase 1 "fade". Phase 2 turns the cap-crossing into breaking.
- **Outputs (textures):** τ, local wave direction and wavenumber, amplification, and a steepness factor.
- **The A-frame emerges.** Along the south ledge τ is nearly constant (the right stands up all at once); along the north ledge τ increases steadily northward (the left's peel). The **peel speed** along the north ledge is a measured, tested property of the reef.

### 7.3 Rendering set waves

- Each active wave's crest sits where τ(x) = t − (its arrival time), so it slows, bends and wraps around the wedge exactly as the field dictates. Beyond the field, waves are evaluated from the exact 1D coast solution (30 m water to the west), so sets are visible all the way to the horizon with no seam at the field's edge.
- **Profile:** a single crest with a long, flat trough. Crest sharpness and forward pitch grow with local steepness and shallowness (Ursell-number driven), with horizontal displacement bounded so the surface never folds (Jacobian kept above a safe minimum). The exact profile is fixed in the plan, with tests for continuity and no self-intersection.
- **Crest length:** seeded between 300 and 600 m, with a smooth taper at the ends in deep water; near the reef the crest spans the whole break.
- **Water surface = FFT background + Σ set waves**, at most 12 active at once (a whole 8-wave set is in flight together, plus strays).
- **Background over shallow water:** the FFT's long-swell cascade (3000 m) is weighted by `smoothstep(6 m, 14 m, depth)`: full over the deep water outside the ledge, gone over the shelf. The 250 m and 35 m cascades (chop and ripples) remain everywhere. Both thresholds are tunable.
- **Height probe and camera:** the shared set-wave function is added to the probe, so the lineup camera rises and falls with the sets.

## 8. Seeing the reef (drafted while Andrew was away — please review)

**Approach: ray-march the seabed from the water shader.** For water fragments over the reef map, the view ray refracts at the (moving) surface and is marched through the depth texture to find the seabed. This keeps everything in the one water shader, gets refraction through the waves right, and avoids a separate seabed pass. (The alternative, drawing a seabed mesh and refracting a screen capture of it, needs an extra pass and breaks at grazing angles.)

- **Water column.** The Phase 0 deep-water upwelling becomes a finite-depth blend: `L = L_seabed · T + L_body · (1 − T)`, with `T = exp(−(a + b_b) · (path down + path up))`. With no seabed in reach (deep water, or outside the map) it reduces exactly to the Phase 0 result — tested.
- **Seabed lighting.** Sunlight transmitted through the surface (Fresnel transmission, refracted direction) and attenuated down the water column, plus diffuse sky light. No caustics and no reef self-shadowing in Phase 1.
- **Materials (procedural, no image textures):** limestone (grey-brown, pitted), weed/kelp (dark olive, patchy), sand (pale cream). Pale sand under a few metres of water turns turquoise physically, as red is absorbed.
- **Cost control.** Adaptive step count by distance, early exit when attenuation makes the seabed invisible (< 1%), and no march outside the map.
- **Free camera below the surface:** out of scope.

## 9. Dev tools, reference moments, testing and performance (drafted while Andrew was away — please review)

### 9.1 Dev tools

- **Sets** panel folder: mean interval, jitter, waves per set, height factor, stray rate and size, lull factor.
- **Call a set now** button (and hotkey `N`): jumps simulation time to 45 s before the next set's first wave reaches the peak.
- **Readout:** "next set in m:ss", "wave *i* of *n*".
- **Tide** slider (±1.5 m) and **reef depth** controls (deep, ledge, shelf offsets).
- **Debug overlays:** depth contours and arrival-time lines (crest lines) drawn on the water, for tuning the peel and the closeout.

### 9.2 Reference moments

- The default lineup position moves to about **25 m west and 45 m south of the peak**; existing moments keep their times and headings.
- New moments, with simulation times chosen from the set timeline so each is guaranteed to contain its wave:
  - `set-arriving`: morning, facing south-west as a set appears;
  - `set-on-the-reef`: the biggest wave of a set standing up on the ledge, facing north along the peel;
  - `low-tide-set` and `high-tide-set`: the same wave at −0.5 m and +0.5 m;
  - `looking-down`: late morning, looking down at the reef below the lineup;
  - `reef-overhead`: free camera about 60 m above the reef at noon.

### 9.3 Testing

- **Unit (Vitest):**
  - bathymetry features (6 m at the peak, ledge profile, determinism);
  - set timeline (10–20 min spacing, 4–8 waves, biggest mid-set, determinism, O(1) slot access);
  - dispersion solver against tabulated values;
  - eikonal on constant depth (plane wave) and straight parallel contours (Snell's law);
  - shoaling on a planar slope (linear theory);
  - the 0.78 × depth cap;
  - on the actual reef: the south ledge's arrival times nearly equal (closeout) and the north ledge's increasing (peel), with the peel speed in a plausible range.
- **GPU self-tests (`?selftest`):** field textures match the CPU solve; the rendered set-wave height at the peak matches the CPU prediction; the finite-depth water blend reduces to Phase 0 in deep water.
- **Visual:** a gallery of the new and existing reference moments, reviewed by Andrew — one GPU copy at a time.

### 9.4 Performance

- 60 fps (the Phase 0 cap). Target GPU time on the RTX 4060: **≤ 3 ms** (Phase 0 measured 0.68 ms), with the seabed ray-march as the main new cost.
- Reef map build ≤ 300 ms at startup; wave-field solve ≤ 1 s in the worker, never blocking frames.

## 10. Out of scope (and where it goes)

- **Phase 2:** breaking, the lip, the barrel, the drain and step, the right's closeout as breaking, spray, surfer-feet calibration, the turquoise lip.
- **Later:** caustics, whitewater and foam from breaking, the beach/dunes/heath/rocks above water, audio, a surfer.
- Shallow-water simulation (the layered approach keeps the door open to swap it in later).

## 11. Assumptions to confirm on screen

- Deep water 12–15 m outside the ledge; shelf, sand-pocket and platform depths (§6).
- Tide range ±1.5 m.
- Lineup spot about 25 m west and 45 m south of the peak.
- Set-wave height 1.3–1.8 × Hs; background lull factor 0.5.
- The left's ride length (~40–50 m along the north ledge before it backs off).
