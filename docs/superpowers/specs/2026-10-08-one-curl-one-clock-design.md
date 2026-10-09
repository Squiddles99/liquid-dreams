# Wave form step 4: one curl per wave, on one clock — design

**Written by:** Fable (orchestrator), 2026-10-08, for Opus (executor). Branch `one-curl` from `main` (f8857e5).
Parent ruling: `docs/superpowers/plans/2026-10-06-wave-root-cause.md` §4 (Andrew, 2026-10-06: one surface; steps 1–3
and 3c/3d done, main 264c4f0; step 5 superseded by the ride segments). Benchmarks: Virtual Surfing (2021) and Kelly
Slater's Pro Surfer: one body of water, one barrel point sliding along the crest.

Also in this segment, as Task 0 of the plan: the boot picture's water appearing ~4 s after everything else on the
select screen (Andrew, 2026-10-08). §7.

## 1. Goal

Along each set wave's crest there is **one curl per side**, advancing from the peak outward, never retreating, and
**every reader of the break agrees on when each section broke**: the ribbon's stations, the CPU sheet the ride stands
on, and the GPU sheet. No pocket of barrel opens beside standing wall; no section twenty metres down the line breaks
before the curl reaches it; a reef head neither shrinks the tube nor opens a second curl.

## 2. The clock today: one record, three readers, two patches

The reef bake (`reefField.computeOnsetRecord`) marches the field in arrival order and writes, per node and per wave
level, the time since onset (`tb`, negative while a section is held for its turn by the peel stretch), the delay, the
throw height, the size and ψ at onset, and (`fillUntil`, a reverse march) the time until onset for unbroken nodes.
Three readers interpolate that record: `crestTrace.stationOnset` (the ribbon's stations, the ride, the spray),
`setWaveModel.crestAt` (the CPU sheet) and `SetWaves.sampleOnset` + `breakingNodes.lifecycleNode` (the GPU sheet).
They agree point by point because they read the same texels.

What makes it *not* one curl: the record's onset time is a function of position on a grid, built ray by ray. Where the
ledge line wanders (`REEF_WARP.ampM` 5 m, `detailAmpM` 2 m, read at the warped point in `bathymetry.ts`) or a reef
head stands, neighbouring rays break seconds apart and a ray further down the line can break *earlier* than one
nearer the peak. Two patches hide it: the bake smooths onset times along the crest (`smoothOnsetTimes`, σ 8 m) and
the trace smooths the section numbers (`SECTION_SMOOTHING_M` 4 m); the trace also carries a held section's wait down
the line (`holdDownTheLine`) because the record only knows a hold where the reef has already broken the wave. Smoothing
a non-monotone function leaves it non-monotone; the carry is a fourth clock.

Wave-root-cause §4 asked for a *follower* on the stations. A per-frame follower on the CPU stations would put the
stations on a clock the sheet does not have: a seam between the drawn section (sheet(home) + offset) and the sheet the
ride and the GPU read, the very thing the one-surface ruling forbids. So the curl goes **into the record**, where all
three readers get it for free.

## 3. Design

### 3a. The curl pass, in the bake (between the two marches)

`computeOnsetRecord` already runs the march twice when the peel stretch is on: the first finds every onset node's
physical onset time `T` and groups them into breaking lines per level (`peelLines`: union-find over nodes within
`PEEL_NEIGHBOUR_CELLS`, each line with its first break `T₀`); the second march stretches each ray's onset from `T₀`.
The curl pass runs on those lines, for every level `k`:

1. **Order the line from its first break.** From the node with `T = T₀`, a breadth-first walk over the line's own
   nodes (the same neighbourhood as `peelLines`), accumulating the Euclidean distance `s` along the walk (cells ×
   `cellM`). Nodes are processed in increasing `s`.
2. **One curl, bounded speed, never retreating.** With `Tₛ` the peel-stretched time, `Tₛ = T₀ + (peel − 1)·(T − T₀)`
   as today, each node's curl time is

   `T′(i) = max( Tₛ(i), min over j ∈ N⁻(i) of ( T′(j) + d(i, j) / curlMaxMs ) )`

   where `N⁻(i)` is the node's already-processed neighbours (smaller `s`) and `d` the distance between them. The first
   break keeps `T′ = T₀`. The `max` makes the curl never retreat (a pocket that would break early waits for the curl);
   the `min … + d / v` is the speed floor (the curl reaches a node no sooner than from its nearest inboard neighbour at
   `curlMaxMs`). The hold is capped as the stretch's is: `d = min(T′ − T, PEEL_MAX_HOLD_S)` (6 s; a held wall never runs
   on into the shallows). The cap breaks monotonicity only where the reef would hold a section longer than 6 s; Task 3
   counts how often.
3. **Carried along the rays as `T₀` is.** The second march reads, back along each ray, the *curl time* `T′` of the
   onset node it came from, bilinear over the corners that carry one (as `lineStartBack` carries `T₀`), and sets
   `d = clamp(T′ − T_ray, 0, PEEL_MAX_HOLD_S)`, `T_ray = τ − tb_physical`. The stretch's own `delayOf` goes: the
   stretch is already inside `Tₛ`.

Nothing else in the record changes: the throw height, size and ψ keep their "held measures as unbroken until its turn"
rules, now on the curl's turn.

### 3b. One hold channel: `until` carries the hold

Today a held node has `tb < 0` and `until = 0`, so the stations need `wait = −tb` and `holdDownTheLine` to stand the
wall up ahead of a hold. In `fillUntil`, a node whose level has broken sets `until = max(0, −tb)` (0 once its turn has
come) instead of 0; the reverse march then carries it back along the ray with the arrival time, so along every ray
`until` falls continuously to 0 at the section's *turn*, not at its physical break. The readers then need only `until`:

- `crestTrace`: `Station.wait`, `stationOnset`'s `wait`, `holdDownTheLine` and `wombSection.standing` go;
  `sectionPhase` reads `wallWeight(s.until)`. `peelRatio` (the ratio capped at 1 while held, fading in after the turn)
  **stays**: it mirrors the GPU's `rTurned` and is a ratio, not a clock.
- `SetWaves` / `breakingNodes`: unchanged code; `untilLo/Hi` now carry the hold, so the GPU wall stands up over
  `WALL_LEAD_S` before a held section's turn exactly as the stations do (today it stands at r = 1 the moment the reef
  breaks it: the "waiting" branch stays for that).
- `setWaveModel.crestAt`: unchanged (reads `onsetUntil`).

### 3c. The breaking line stops wandering

`bathymetry.buildBathymetry` reads the ledge signed distance at the warped point (`sd = lattice(sdf, xw, zw)`), so the
face, the ledge and the shelf's depth profile wander ±5–7 m every 35 m. The depth profile reads `sd` at the **unwarped**
point (`x, z`); the reef heads, sand pockets, rock reach and weed keep the warped point (the look of the rock). The
ledge lines are the spec's polylines (`NORTH_LEDGE`, `SOUTH_LEDGE`), which are not straight: the bends Andrew drew stay.

### 3d. Dials

- `BreakParams.curlMaxMs` (new, dev panel with the other break params): the curl's top speed along the crest, m/s.
  Default **20** (the reef's own first-leg peel is 8–14 m/s: the default only filters noise). `normalizeBreakParams`
  clamps it to [4, 40].
- `BreakParams.peel` unchanged (the stretch composes before the curl pass).
- `PEEL_MAX_HOLD_S` 6 (reused as the curl's hold cap).
- `ONSET_SMOOTHING_M` 8 and `SECTION_SMOOTHING_M` 4 stay as they are in this segment; Task 4 measures what they now
  cost (the phase profile along the crest at one instant, σ as is vs halved) and Fable rules on a reduction after.

## 4. What this removes

`Station.wait`, `holdDownTheLine`, `wombSection.standing` and the `wait` field of `SectionInput`; `delayOf` in the
bake. Tests that pin them (`crestTrace.test.ts` "a held section reads as unbroken to the stations", "a held section's
station carries the held ratio", and any `breaking.test.ts` case built on `wait`) are retired and replaced by §5's.

## 5. Tests and gates

Kept green or added (wave-root-cause §6, now reachable):

1. **The curl pass, in isolation** (`reefField.curl.test.ts`, synthetic lines): a line whose `T` dips down the line
   (a pocket) comes out non-decreasing in `s` on each side; a line with a far-ahead early node is reached no sooner
   than `d / curlMaxMs` after its inboard neighbour; the first break keeps `T₀`; the hold is capped at
   `PEEL_MAX_HOLD_S`; `curlMaxMs = ∞` with a monotone input returns it unchanged.
2. **Onset time along each traced line is monotone** (`crestTrace.test.ts`, the real field at 6, 8 and 12 ft, mid
   tide, the biggest set wave, three instants): along each side from the station with the largest `tb`, `tb` is
   non-increasing station to station (tolerance 0.05 s, the record's bilinear), and `until` is non-decreasing beyond
   the curl.
3. **`until` is the hold** (`reefField.test.ts`): at a held onset node `until = −tb`; one cell back along its ray,
   `until` is larger by the arrival time between.
4. **A along the first leg is constant**: the existing step-1 test's bar tightens from 8 % to **5 %** (the plan said
   step 4 would).
5. **Reef**: `bathymetry.test.ts` "holds ledge depth along both ledges" stays; a new case: the depth along a line 3 m
   seaward of `NORTH_LEDGE` varies by less than 0.3 m over 100 m (the face no longer wanders).
6. **The ride is unchanged in what it can do**: `src/ride` suite green except R3's known 6 ft expert red; the R3 live
   bot's `heldS` per case within ±0.5 s of main's (the clock moved, so a small shift is expected; a case lost is not).
   `PROBE_RIDE_STATIONS=1` still reads `lazy (R9)` 0.00 cm (exactness of the ride's water against the sheet, not the
   sums, which may change with the record).

Andrew's gate (captures, Task 5): at 6, 8 and 12 ft, t + 3 and t + 5 s after the peak's break, from the standard
capture camera and from his lineup moment: one curl per side, the wall ahead of it standing up over the lead, no
barrel pocket beside standing wall, no second breaking section down the line. Fable reads the frames before Andrew.

## 6. Out of scope (carried)

The peel speed and δ (wave-root-cause §5, superseded by the ride's take-off work); the smoothing σ reductions (§3d,
measured here, ruled after); the ribbon zipped to the sheet and the lip's streaked look (the old "one body" items
after this one); lineup truth; blocky patches; R4.

## 7. Task 0: the boot picture's water (bounded; design for Andrew's yes)

**Seen:** on a fresh boot, the select screen's picture shows land, sky and crew, and the water appears ~4 s later.

**What the code says:** the boot cover dissolves when `SmoothFramesGate` opens: 10 frames under 33 ms, or
`SMOOTH.giveUpMs` 4000 ms after the last stage. A frame drawn with `asyncPipelines.pending > 0` feeds the gate
`Infinity` (`App.reportLoading`), so with a build still pending the gate can only open by the give-up, and the picture
is shown with that object missing: three skips an object whose pipeline is still building (`asyncPipelines.ts`'s own
note). Opus saw exactly this at the select screen on a loaded machine in the ride-stall segment (4c: a
`MeshBasicNodeMaterial (output)` build left over from boot). The 4 s matches the give-up. The ocean surface's material
is the heaviest to build, and `setField` (the reef field arriving after `prewarm`) refreshes its textures, so it is the
likely late build; but that is a guess until the log says so.

**Design:** (1) diagnose with the instruments from ride-stall: one Playwright boot with `frameLog.on` from the first
frame and `AsyncPipelines.inflight()` logged at the boot dissolve (`loadingScreen.dissolve` → a `console.info` of the
labels, kept: it is dev-only and names what the player would have missed), plus 0.5 s screenshots over the dissolve.
(2) Fix by cause: if a pending build, the **boot** gate no longer gives up while builds are pending: `SmoothFramesGate`
gets a `blocked` input (`frame(dtMs, nowMs, blocked)`): while `blocked`, the give-up clock does not run, up to a hard
cap `BOOT_BUILD_CAP_MS` 15 000 after which it opens anyway (and the log names what was pending). The paddle-out cover
keeps today's 4 s give-up (ride-stall 4c: its builds are slow, not stuck, and the ride can start). If it is not a
pending build (the FFT's first spectrum, a texture upload), Opus reports and Fable rules. Gate: three fresh boots, the
water present in the first frame after the dissolve (screenshot), boot cover no more than 2 s longer than today's
(`[loading]` log lines).

## 8. Constraints

- `src/ride` untouched. The GPU shaders untouched except where §3b's `until` semantics need a comment. No new blend,
  smoothing σ, fade or `min()` between the sheet and the profile (wave-root-cause "what not to do").
- The record's layout (`ONSET_RECORD_LENGTH`, offsets) unchanged: the GPU textures read as before.
- Probes in `tools/_*.mjs` or env-gated tests; `npx tsc --noEmit` clean at every commit; commit + ledger + push after
  every task (`.superpowers/sdd/2026-10-08-one-curl/progress.md`). Every commit message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The field is built at load (no offline bake file): a reef or record change needs no asset step, but the full suite's
  field fixtures rebuild, so baseline the suite first and name new reds by file.
