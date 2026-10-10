# Plan: whitewater, spray, foam and spit

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (Opus 5.5 executes task by task; Fable reviews at the STOPs). Steps use checkbox syntax for tracking.

**Goal:** the broken wave reads as a boiling mound that surges where a pitching lip lands; the wind decides whether the barrel is clean or smoking; the lace a set leaves lingers for a minute; mist and one light tie it together — judged from the beach against the five photos, at today's frame rate.

**Architecture:** approach A, evolve what's there. The mound is the ribbon's own collapsed section (the profile family) plus a surge term, re-gated churn and foam-volume shading; the spray is the existing two GPU pools with a per-particle kind (veil, plume, feather, spit); the lace is `FoamField` with two decay lives and three drifts; the mist is the foam map's `.b` channel read as a fog slab by every material that already applies aerial perspective. No new particle system, no depth prepass, nothing in the ride's hot path.

**Tech stack:** TypeScript, Three.js WebGPU + TSL (CPU reference ↔ GPU mirror), vitest, Electron capture/profile tools.

**Spec:** `docs/superpowers/specs/2026-10-10-whitewater-spray-design.md` (read first; the plan argues from it). References `reference/wave/whitewater/1–5` (git-ignored).

Executor: Opus 5.5 on branch `whitewater` from main 6b67f6f, worktree `../ld-whitewater` (the `liquid-dreaming/` checkout stays on `main` for Andrew's launcher). Ledger `.superpowers/sdd/2026-10-10-whitewater/progress.md` (git-ignored), one line per verified step; commit after every task; push when a task's gate is green. Evidence `docs/superpowers/evidence/whitewater/`; captures `../liquid-dreams-captures/whitewater-2026-10-10/`.

Process rules that held: measure before theorising; never `cat > file` without a heredoc; no scratch in `src/` (probes are `tools/_*.ts`, deleted or kept deliberately); `node_modules` in the worktree is a junction (`cmd /c mklink /J ..\ld-whitewater\node_modules ..\liquid-dreaming\node_modules`) removed with `cmd /c rmdir` before any `git worktree remove`; the breaker suite takes > 10 min, run it idle; GPU self-tests run in Electron (`npx electron tools/_selftest.mjs --base=http://localhost:<port>/ --filter=<substring>`) against `npm run dev` on a port nobody else serves (check 5173 first; use 5174); an UNFOCUSED window runs ~8× slower (the profiler forces focus; captures must too).

## Global constraints (spec §7, §8)

- Riding median at 7 ft Pumping, **strong offshore 18 kn from 90°**, ≤ main's fresh median × 1.10 (same session, interleaved, machine state stated). p90 is not a bar.
- `_rideCost --spray` per 20 Hz tick: births ≤ main's 14.0 ms (re-measure); feathering ≤ +2 ms on top is the one allowed growth.
- GPU at 1080p, tube cam and beach, strong offshore: all tasks together ≤ +2.5 ms; the mist slab ≤ +1.5 ms of it; the foam map's tick < 0.1 ms.
- Calm identity: Glassy (1 kn) with no break in the box → a frame pixel-identical to main. Glassy with a break → differs only in the ribbon's broken section and the foam (regions named); both spray pools empty.
- One surface: the section curve never crosses itself (the `wombProfile` "never crosses itself" test, extended to the surge's full dial); the tube stays open through its hold.
- Look only: `sectionFrameKnots`, `sumWaves`, `src/ride/*` untouched. Off-limits: `reefField.ts`, `breaking.ts`'s level read, the crest trace's closeout edges (branches `level-read`, `inner-shelf`, `closeout-edges`).
- Determinism: every random draw is a hash of (tick, waveId, arc, salt), as `sprayEmitters` does; a replayed link equals live play.
- Every CPU rule has its GPU mirror and a test that compares them (unit for pure functions, `*.selftest.ts` for the GPU).

## Review focus (what the spec implies but no photo shows)

1. **Glassy with a break:** the plume, feathering and veil are all exactly 0 (no stray births from the `kind` default); the mist slab stays 0 except at the landing. → Task 5/6 tests "no births at Glassy", Task 7 "slab zero at Glassy away from the landing".
2. **A link into the middle of a 75 s lace history** replays in bounded time and equals live play. → Task 4 "mixed-rate replay ≡ live within 2 %" and a timing line in the ledger.
3. **Onshore / blown out:** the plume is 0, the veil is blown forward over the face (not back), spit blown forward; nothing goes NaN at wind 0 (`offshoreFactor` at speed 0, normalising a zero vector). → Task 5 tests.
4. **Gap rows and run ends on the ribbon:** `extras.z` (the curl's foam) and the surge are 0 on gap rows and at the traced line's cut ends, so no white streak hangs in the air. → Task 2 test on gap rows; Task 1 surge 0 at ρ 0.
5. **A crumbling lip (hollow 0, 4 ft low tide):** no surge, no impact rise above the base, the mound at or under the crest, the tip fringe still present (a crumbling lip still foams at its edge). → Task 1/2 tests at hollow 0.

## Task 0: set up, baseline

**Files:** modify `tools/_rideProfile.mjs` (lines 60–62 force the swell; add `--wind=<kn>,<fromDeg>` setting `c.wind = { speedMs: kn * 0.5144, directionDeg }`), `tools/_rideCost.ts` (line 79 uses `DEFAULT_CONDITIONS.wind`; same flag), `tools/captureMoments.mjs` (window 1600×900 → `--size=1920x1080` like `captureLookout.mjs`).

1. Worktree + branch + junction as above. `npx tsc --noEmit` clean. Copy `.superpowers/sdd/2026-10-10-shelf-polish/` suite-names baseline into this ledger dir.
2. The three tool flags above; `--wind=18,90` must show in each report's line 1.
3. Baselines, idle, same session: `_rideProfile --ft=7 --sim-t=300 --wind=18,90` ×3 on main's code and on the worktree (identical code today: the spread is the measurement) → `frames-baseline.txt`; `_rideCost --ft=7 --spray --wind=18,90` → `ridecost-baseline.txt`; `src/whitewater` + `src/breaker` + `src/ocean` unit tests idle → `unit-baseline-names.txt`; GPU self-tests `--filter=foam`, `--filter=spray`, `--filter=ribbon` → counts in the ledger.
4. Two moment links for A/B through the segment (encode with `src/dev/momentLink.ts`'s `encodeMoment`; `#m=` hash): **M-beach** = lineup camera at the lookout, 10 ft, tide 0, seed 2002, wind 18 kn from 90°, 09:30, simTime at a set wave's landing (find one with `_retuneMoments`-style scan or `_lookoutSets.mjs`); **M-tube** = the ride camera's behind/tube view at the same moment. Save both in `evidence/whitewater/moments.md`. Capture both on main's code → `ab-main-*.png`.

Gate: tables and links in the ledger; commit "chore(whitewater): tools take --wind; baselines".

## Task 1: the surge (spec §3.1)

**Files:** modify `src/breaker/wombSection.ts` (SectionNumbers, sectionNumbers, sectionFrameKnots line 238), `src/breaker/wombSectionNodes.ts` (sectionNumbersNode line 58, drawnNode line 86), `src/breaker/breakingNodes.ts:24` (uniform `surge`), `src/breaker/breaking.ts` (BreakParams `surge`, default 0.5, range 0–1), `src/dev/DevPanel.ts:188` (`BREAK_BINDINGS.surge`, beside churnSize), `src/breaker/wombSection.test.ts`, `src/breaker/wombProfile.test.ts`. The CPU family `profileKnots` stays pure; the surge is a term after it.

**Interfaces.** `SectionNumbers` gains `surge: number` ([0, 1], the pulse × hollow). New pure exports in `wombSection.ts`:
```ts
/** The heave where a pitching lip landed: 0 until the tube starts to fill (phase 1.25), full by 1.5, gone over
 *  SURGE_FALL_BASE_S + SURGE_FALL_PER_M × power after that; × hollow (a crumbling lip heaves nothing). */
export const SURGE_FALL_BASE_S = 1.0, SURGE_FALL_PER_M = 0.25;
export function surgeWeight(s: SectionInput, phase: number, hollow: number): number;  // [0, 1]
/** Lift (units of A) per profile knot m at surge w and dial k: knots 5–10 translate up k·w, knot 11 by 0.5·k·w, others 0. */
export function surgeLift(m: number, w: number, k: number): number;
```
GPU: `sectionNumbersNode` returns `surge` too; `drawnNode(numbers: { phase; hollow; surge }, keys, u: { surge })` adds `surgeLiftNode(m, w, k)` to each knot's y after line 108. Callers (`sheetReadHomeNode`, `curlReadHomeNode`, `wombFrameNode`) pass numbers through unchanged.

Why these knots and this timing (so the one-surface rule holds): through the hold (phase 1–1.25) the tube is round and open; any lift on the trough/front knots then crosses the lip's outside or ceiling (checked on the phase-1 key: a line from the floor (0.7, −0.3) to a lifted trough passes through the lip's body). From 1.25 the cavity knots 6–10 sit as a small pocket at the landing and translate up rigidly with knot 5; the explosion's first second is the impact particles (Task 2), the mound's heave takes over as the tube fills. Andrew judges the result at the STOP; `surge` is a dial.

- [ ] 1. Test first (`wombSection.test.ts`): `surgeWeight` is 0 for tb null, 0 at phase ≤ 1.0, > 0.9 at phase 1.5 for hollow 1 at 6 ft/15 s, 0 at hollow 0 for every phase, and falls below 0.1 by `1.25-phase time + SURGE_FALL_BASE_S + SURGE_FALL_PER_M × power(H, T) + 0.5 s`; 0 again at ρ 0 (tb → ∞). `surgeLift` is 0 for m ≤ 4 and m ≥ 12, k·w for 5–10, 0.5·k·w for 11.
- [ ] 2. Extend `wombProfile.test.ts` "never crosses itself": for phase in [1.25, 2] step 0.05, hollow in HOLLOWS, w in {0.5, 1}, k = 1 (the dial's max), the knot polyline with `surgeLift` applied has no self-intersection (reuse the test's existing segment-intersection helper). Run: fails (functions undefined).
- [ ] 3. Implement; `sectionFrameKnots` applies the lift to `k[m][1]` right after `profileKnots` (line 238) from `numbers.surge` alone. `sectionFrameKnots` has no params, so the dial is folded in upstream: `SectionParams` gains `surge: number` (the dial) and `sectionNumbers(s, p)` computes `surge: surgeWeight(s, phase, hollow) * p.surge`; `surgeLift(m, numbers.surge, 1)` then needs no dial. The GPU mirror does the same in `sectionNumbersNode` from the `surge` uniform.
- [ ] 4. Impact rise follows the surge: `ImpactEmitter` gains `hollow: number` (`hollowFromPsi(s.psi)`); `impactBirths` kick = `sqrt(2·IMPACT_G·IMPACT_RISE_H·(1 + SURGE_RISE × hollow)·max(H, 0.5))` with `SURGE_RISE = 1.0` (a 1 H burst on a crumbling lip, 2 H on a pitching one; the surge dial scales the mound, not the burst — one number Andrew can turn). Test in `sprayEmitters.test.ts`: kick at hollow 1 = √2 × kick at hollow 0.
- [ ] 5. GPU: `ribbon.selftest.ts` "GPU section matches wombSection" at a station with tb in the surge window — add such a station to the self-test's cases (phase 1.4, hollow 1, surge 0.8) and assert within its existing tolerance. Run `--filter=ribbon`.
- [ ] 6. `_rideCost --ft=7 --spray --wind=18,90`: unchanged within noise (the surge is one add per knot).

Gate: tests green, self-test green, A/B of M-beach (`ab-task1-*.png`) beside main's showing the heave. Commit "feat(ribbon): the surge where a pitching lip lands".

## Task 2: the lip's timing: tip fringe, clean curtain, delayed burst (spec §3.4)

**Files:** create `src/whitewater/curlFoam.ts` (+ `.test.ts`), modify `src/breaker/BreakingRibbon.ts:780–786` (extras.z), `src/whitewater/sprayEmitters.ts` (IMPACT_DELAY_S), `src/whitewater/sprayEmitters.test.ts`.

**Interfaces.**
```ts
// curlFoam.ts — CPU reference; curlFoamNode mirrors it in TSL (same file, same constants)
export const FRINGE_WIDTH = 0.12;      // of the lip's reach (tip → crest), the white edge
export const FACE_FOAM_PHASE: readonly [number, number] = [1.2, 1.5];  // foam climbs the lip's face as the tube caves in
export const CLEAN_TUBE = 0.8;         // how much of the sheet's foam the open tube's inside hides (negative zone)
/** Signed foam at a ribbon sample: + its own foam (tip fringe, then the caving lip), − the clean tube's share.
 *  offOverReach = |j − tip| / reach; inside = 1 on the tube's inside samples (j past the tip toward the floor), else 0. */
export function curlFoamAt(phase: number, offOverReach: number, inside: number, curl: number): number;
export function curlFoamNode(phase: N, offOverReach: N, inside: N, curl: N): N;
```
Rules: fringe = `(1 − smoothstep(0, FRINGE_WIDTH, offOverReach)) × thrown(phase)` (thrown as the ribbon's line 780: in at 0.4–0.55, out at 1.2–1.45); face = `smoothstep(1.2, 1.5, phase) × (1 − smoothstep(0, 1, offOverReach)) × (1 − inside)`; clean = `−CLEAN_TUBE × inside × (1 − smoothstep(1.2, 1.5, phase))`; result `(max(fringe, face) + clean) × curl`.

- [ ] 1. Tests: face foam 0 at phase < 1.2 for offOverReach 0.5; fringe ≥ 0.9 at phase 0.8, off 0.02; fringe present at hollow-independent inputs (the function has no hollow: a crumbling lip's tip still foams); inside samples negative while the tube is held (phase 1.0) and ≥ 0 by phase 1.5; `curl` 0 → 0 (gap rows and cut ends carry curl 0).
- [ ] 2. Implement; the ribbon's vertex pass computes `inside` from `j` vs the tip and floor marks (`f1.x`, `f1.z`: inside = samples strictly between tip and floor) and writes `extras.z = curlFoamNode(phase, off/reach, inside, curl)`. The material already reads `curlFoam = vExtra.z` (lines 609–612); confirm the sign convention matches (`curlOwn` positive, `clean` negative).
- [ ] 3. `IMPACT_DELAY_S = 0.2`: the impact window is `[τ_land + 0.2, τ_land + 0.2 + IMPACT_WINDOW_S)`; spit's `SPIT_PULSE_S` measured from the same delayed landing. Test: no impact births at tb = τ_land + 0.1, births at + 0.3.
- [ ] 4. Capture M-tube three frames 0.3 s apart (`captureMoments --times`) → `fringe-*.png`: the fringe tracks down the curtain, the face clean, the burst after.

Gate: tests + ribbon self-test green; frames in evidence. Commit "feat(ribbon): the tip's fringe, the clean curtain, the burst after the landing".

## Task 3: the tumbling front and the foam volume (spec §3.2, §3.3) — then STOP

**Files:** create `src/whitewater/mistLight.ts` (+ `.test.ts`), modify `src/whitewater/pileChurn.ts` (the gate and the lump shape), `src/breaker/BreakingRibbon.ts:582–599` (the churn's input), `src/ocean/waterShading.ts:166–176` (foam volume), `src/whitewater/pileChurn.test.ts` (create if absent), `src/dev/DevPanel.ts:188` (`churnSize` default 0.25, label "churn size (× A)").

**Interfaces.**
```ts
// mistLight.ts — one light for spray, slab and foam volume (spec §6.3). CPU reference + TSL node.
export const MIST_ALBEDO = 0.9, MIST_WRAP = 0.5, MIST_GROUND_BOUNCE = 0.25;
export function mistLightCpu(i: { sunIlluminance: number; skyIrradiance: number; cosView: number; nDotL: number; sunVisibility: number; isotropic: number; groundTint: [number, number, number] }): [number, number, number];
export function mistLightNode(i: { cosView: N; nDotL: N; sunVisibility: N; isotropic: N; groundColour: N }, sky: Sky): N;
// = sun × vis × ( wrapDiffuse(nDotL, MIST_WRAP) × (1 − isotropic) + sprayPhase(cosView, isotropic) ) × MIST_ALBEDO
//   + sky × MIST_ALBEDO / π + groundColour × MIST_GROUND_BOUNCE
// pileChurn.ts
export function churnHeightNode(boil: N, frame: N, time: N, u: { churnSize: N; churnSpeed: N }): N;  // was pile
export function churnSlopeNode(boil: N, frame: N, travel: N, time: N, u): N;
export const CHURN_FADE_S = 6;   // the boil is a low simmer by ~50 m (c × 6 s)
/** The ribbon's boil at a station: boreWeight × fresh foam × (1 − smoothstep(0, CHURN_FADE_S, tb − τ_land)) × A. */
export function boilWeight(tb: number | null, H: number, periodS: number, foam: number): number;  // CPU reference
export function boilWeightNode(tb: N, H: N, periodS: N, foam: N): N;
```
Lump shape: the front is steeper than the back. `frame.x` is metres behind the crest, so `h = noise × boil × churnSize × (1 + 0.5 × smoothstep(0, 2, −frame.x))` makes the lumps within 2 m ahead of the crest line half again as tall. Keep the gate `boil > 1e-3`.

- [ ] 1. Tests: `boilWeight` 0 before the landing, 0 at foam 0, rises with `boreWeight`, < 0.2 × its peak at tb − τ_land = CHURN_FADE_S + 2; `mistLightCpu` backlit (cosView → 1) brighter than side-lit by ≥ 3× at isotropic 0.3; sky-only (sun 0) = sky × 0.9/π + bounce; `mistLightNode` ≡ CPU in `spray.selftest.ts` (add a case).
- [ ] 2. Ribbon: the `churn` Fn (line 582) computes `boil = boilWeightNode(tb, H, periodS, vSetFoam) × A` from the station (stations buffer `[H, c, r, tb]`, `periodS` from `model.sets`'s uniform) and passes it where `b.pile` went (lines 588, 599). The sheet's own path (`SetWaves.displacementWithSetFoamNode`) keeps `s.pile` (0): churn is the ribbon's only, as the spec says.
- [ ] 3. `shadeWater`: `foamVolume = smoothstep(0.6, 0.9, i.foam)`; `foamSeen = mix(foamSeen_today, mistLightNode({ cosView: dot(viewDir, sunDir), nDotL, sunVisibility: sv, isotropic: 0.6, groundColour: column }), foamVolume)`; the churn's normal already reaches `normal` via `setSlope`. `shadeWaterFromBelow` unchanged.
- [ ] 4. Calm identity check: Glassy, no break → `captureMoments` of a flat-sea moment on main vs branch, `tools/_pixelDiff` (write it if there is none: PNG diff count + bbox) = 0 pixels.
- [ ] 5. A/B M-beach and M-tube → `ab-task3-*.png`; `_rideProfile --wind=18,90` ×3 interleaved with main → `frames-task3.txt`.

Gate: tests + self-tests green; calm identity 0 pixels; frames within the bar. Commit "feat(whitewater): the boiling front and the foam volume". **STOP: Andrew's eye on the mound** (surge dial, churn size, foam volume) with the A/B pairs; Fable reviews the evidence. Carry Andrew's dial values into the defaults before Task 4.

## Task 4: the foam map's two lives and three drifts (spec §5)

**Files:** modify `src/whitewater/foamStep.ts` (params, `stepFoam`, `FoamSchedule`), `src/whitewater/FoamField.ts` (step pass, bilinear `.xy`, `dtS` uniform, mixed-rate replay), `src/ocean/OceanSurface.ts:73` (`waterFoamFrame` axis), `src/breaker/SetWaves.ts` (a `pushNode(xz)`: the crest speed where the foam is fresh), `src/dev/DevPanel.ts` + `DevPanel.test.ts` + `src/dev/devSettings.ts:71` (`laceLifeS`), `src/app/App.ts:360–363` (the sources), tests `foamStep.test.ts`, `foamField.selftest.ts`.

**Interfaces.**
```ts
export interface FoamParams { clearTimeS: number; driftMps: number; laceLifeS: number }   // laceLifeS default 75, range 30–120
export const LACE_LEVEL = 0.25;        // dense foam is "lace" below this; it reaches it exactly clearTimeS after the source stops
export const WIND_DRIFT_SHARE = 0.02;  // surface foam drifts at this × the wind vector
export const BORE_PUSH = 0.5;          // fresh foam is carried at this × the crest speed
/** One texel's next (density, age): density decays exponentially above LACE_LEVEL (half-life clearTimeS·ln2/ln(1/LACE_LEVEL))
 *  and linearly below it (LACE_LEVEL/laceLifeS per s); age resets to 0 where the source ≥ 0.75, else + dt. */
export function decayFoam(density: number, age: number, source: number, dtS: number, p: FoamParams): [number, number];
export function stepFoam(prev: Float32Array /* 2 floats per texel */, g: FoamGrid, t: number, dtS: number, p: FoamParams, src: FoamSourceCpu & { push(x, z, t): [number, number]; wind: [number, number] }): Float32Array;
export interface FoamPlan { clear: boolean; coarse: number[] /* ticks stepped with dt = COARSE_TICKS × FOAM_TICK_S */; ticks: number[] }
export const COARSE_TICKS = 10;        // 2 Hz for the oldest part of a replay; the last FINE_REPLAY_S at 20 Hz
export const FINE_REPLAY_S = 10;
```
Drift per texel = `dir × driftMps + dir × c × BORE_PUSH × smoothstep(0.5, 0.9, density) + wind × WIND_DRIFT_SHARE`; `c` from `SetWaves.pushNode(xz)` = the nearest crest's speed × the breaking foam weight there (use the frame the `breakSampleNode` sum already has: its `stage`/crest speed; if the sum has no `c` out, add it beside `foamFrame`).

- [ ] 1. Tests (`foamStep.test.ts`): a texel at 1.0 with no source is < LACE_LEVEL by 12 s (clearTimeS 10) and > 0 at 60 s, exactly 0 after laceLifeS + clearTimeS; age 0 under a source ≥ 0.75, growing after; drift vector = the sum (a fresh texel moves faster than an old one); a coarse step of 0.5 s equals ten fine steps within 2 % for a decaying, drifting patch (no source); `FoamSchedule.plan` after a jump returns coarse ticks covering `laceLifeS + clearTimeS − FINE_REPLAY_S` then fine ticks for the last 10 s, and `coarse.length × COARSE_TICKS + ticks.length ≈ replayTickCount`.
- [ ] 2. Implement CPU, then GPU: the step pass takes `dtS` (uniform), stores `vec4(density, age, mist /* Task 7, 0 for now */, 1)`, bilinear reads `.xy`; `advance` runs `coarse` with `dtS = 0.5` then `ticks` with `0.05`; `sampleNode` returns `{ density, age, inside }`.
- [ ] 3. The pattern's axis: `OceanSurface` and the ribbon pass `driftDir` (a uniform App sets per frame: normalise(meanTravel × driftMps + wind × WIND_DRIFT_SHARE)) to `waterFoamFrame` in place of `meanTravel`. Aged lace (`age` > clearTimeS) thins the Worley width by `× 0.7` so old lace is threads, fresh is clumps.
- [ ] 4. GPU self-tests: "GPU step matches the CPU reference" extended to (density, age) and to a coarse step; "replay matches live" at 10 s and at 60 s after a breaking set within 2 % density (the spec's bar); the replay's wall time for a 75 s jump in the ledger (bar: ≤ 100 ms on this machine).
- [ ] 5. Dial: `laceLifeS` through all five places (params/defaults/ranges; `FOAM_BINDINGS`; `DevPanel.test`; `devSettings`; `App.onFoam`).
- [ ] 6. Capture M-beach + 60 s (`captureMoments --times`) → `lace-60s.png` beside photo 2's foreground.

Gate: tests + self-tests green; replay time in the ledger; capture. Commit "feat(foam): lace that lingers; carried by the bore and the wind".

## Task 5: the plume, the veil and the spit under wind (spec §4.1, §4.3)

**Files:** modify `src/whitewater/particleKinds.ts` (PLUME_KIND, SPIT_KIND, `KIND_INDEX`), `src/whitewater/sprayEmitters.ts` (SprayBirth fields, `plumeBirths`, PLUME_* constants, spit wind shear, `offshoreFactor` at speed 0), `src/whitewater/SprayParticles.ts` (12-float birth record, per-particle kind in `meta.y`, `yWater` in `meta.z`, erosion), `src/whitewater/sprayStep.ts` (CPU reference per kind), `src/app/App.ts:1000–1006` (births lists), `src/dev/DevPanel.ts` (+ `SPRAY_BINDINGS.plume`, `SprayParams.plume` default 1, range 0–3), tests `particleKinds.test.ts`, `sprayEmitters.test.ts`, `sprayStep.test.ts`, `spray.selftest.ts`.

**Interfaces.**
```ts
export const PLUME_KIND: Readonly<ParticleKind> = { dragTauS: 2.0, gravityMs2: 0.3, sizeM: [2, 6], opacity: 0.12, isotropic: 0.5 };
export const SPIT_KIND:  Readonly<ParticleKind> = { dragTauS: 0.8, gravityMs2: 3, sizeM: [1, 4], opacity: 0.5, isotropic: 0.6 };
export const KIND_INDEX = { spray: 0, plume: 1, impact: 2, spit: 3 } as const;   // meta.y; the pool's constructor kind is the default (0 or 2)
export interface SprayBirth { x; y; z; vx; vy; vz; life; strength; kind: number; yWater: number }  // 12 floats = 3 vec4: (x,y,z,life) (vx,vy,vz,strength) (kind,yWater,0,0)
export const PLUME_RATE = 4;            // per m of throwing lip per s at strength 1
export const PLUME_WIND_MS: readonly [number, number] = [3, 9];   // strength ∝ smoothstep over w_off
export const PLUME_UPDRAFT = 0.8, PLUME_BACK = 0.4;  // v = 0.6·throw + w_off·(PLUME_UPDRAFT·up − PLUME_BACK·n)
export const PLUME_LIFE_S: readonly [number, number] = [3, 5];
export function plumeBirths(emitters: readonly SprayEmitter[], tick: number, p: SprayParams, wOff: number): SprayBirth[];
```
`SprayEmitter` gains `wOff: number` (the offshore speed on its normal, m/s; signed) and `yWater: number` (the tip's home water height = the sheet at the station, which `sectionFrame` already has as the floor/crest points' origin: `tideM + sheet(0)`). The pool's step and material select `dragTauS, gravityMs2, sizeM, opacity, isotropic` by `meta.y` from a 4-entry constant table (TSL `select` chain), so one pool draws every kind. Erosion: `shape × smoothstep(th, th + 0.2, mx_noise_float(uv × 2 + seed))` with `th = ageFrac × 0.8` for plume and spit only (seed = `meta.w` = a hashed per-birth float). Onshore (`wOff < 0`): the veil's velocity gets `+ |wOff| × 0.5 × n` (forward over the face), the plume strength 0.

- [ ] 1. Tests: no plume births under w_off 3 m/s, full at 9; 0 at Glassy for every kind; onshore gives veil births with `vx·nx + vz·nz > 0` and no plume; `offshoreFactor` at speed 0 and `windToVector` at any bearing finite; total births per tick ≤ `SPRAY_BIRTH_CAP` with the veil before the plume; `sprayStep` per kind matches the kinds' constants (drag and settle for PLUME_KIND); replay ≡ live with mixed kinds.
- [ ] 2. Implement the birth record and kinds (CPU reference first, `sprayStep.ts`), then TSL; `spray.selftest.ts` "GPU birth and step match the CPU reference" extended to all four kinds.
- [ ] 3. `sprayBirthsAt(k)` = `[...sprayBirths(spray), ...plumeBirths(spray, k, params, wOff)].slice(0, CAP)`; `impactBirthsAt` tags spit births `kind: KIND_INDEX.spit`. `setMaxLifeS` from `max(1.2 × lifeS, PLUME_LIFE_S[1])`.
- [ ] 4. Spit: `SPIT_OPACITY → 0.5`, velocity `+ wind × 0.5`; the plan's table row "held back, dense" is the drag doing the rest.
- [ ] 5. Per-row captures from M-beach's camera for the seven `WIND_ROWS` (`captureLookout.mjs`-style CASES with the moment's conditions) → `wind-<row>.png`; tube cam overdraw: `_rideProfile --wind=18,90` cam median vs Task 3's (bar ≤ +1 ms).

Gate: tests + self-tests green; the seven captures match spec §4's table by inspection; cam cost within the bar. Commit "feat(spray): the plume, the veil forward in onshore wind, dense spit".

## Task 6: crest feathering (spec §4.2) — then STOP

**Files:** modify `src/whitewater/sprayEmitters.ts` (`FeatherEmitter`, `featherBirths`, the loop at line 241), `src/app/App.ts` (births list), tests.

**Interfaces.**
```ts
export interface FeatherEmitter { x; y; z; nx; nz; strength; waveId; arc }
export const FEATHER_WALL = 0.6;                       // wallWeight above which the standing crest smokes
export const FEATHER_WIND_MS: readonly [number, number] = [5, 10];
export const FEATHER_RATE = 6, FEATHER_LIFE_S: readonly [number, number] = [0.6, 1.2];
/** The standing crest's height from the station alone (no sheet read): A(H) × the crest knot's y at phase STOOD_PHASE × wallWeight. */
export function standingCrestY(H: number, until: number, hollow: number, tideM: number): number;
export function featherBirths(emitters: readonly FeatherEmitter[], tick: number): SprayBirth[];   // kind spray, v = wOff·(0.3·up − 0.5·n)
```
In `breakEmitters`, stations with `tb === null` and finite `until` no longer `continue` at line 241 when `wallWeight(until) > FEATHER_WALL` and `smoothstep(FEATHER_WIND_MS…, wOff) > 0`; they push a `FeatherEmitter` and **never call `sectionFrame`**.

- [ ] 1. Tests: no feather emitters under 5 m/s offshore or at wallWeight ≤ 0.6; present on the standing wall at 10 m/s; `standingCrestY` equals `sectionFrame`'s crest y within 0.1 m at a test station (the cheap formula vs the real one); emitters at Glassy: none.
- [ ] 2. Implement; `_rideCost --ft=7 --spray --wind=18,90` before/after → `ridecost-feather.txt`: the feathering's own cost ≤ 2 ms per tick (bar), births total ≤ Task 0's baseline + 2 ms.
- [ ] 3. Capture photo 3's moment (8 ft, strong offshore, wide from the beach) → `feather-wide.png`.

Gate: tests green; cost within the bar; capture. Commit "feat(spray): the crest line feathers in a strong offshore". **STOP: Andrew's eye on the spray** (the seven wind rows + photo 3); Fable reviews the costs.

## Task 7: the mist slab and soft particles (spec §6)

**Files:** create `src/whitewater/mistSlab.ts` (+ `.test.ts`), modify `src/whitewater/FoamField.ts` (the `.b` channel: source, decay, wind drift), `src/whitewater/foamStep.ts` (CPU mirror of the mist channel), `src/breaker/SetWaves.ts` (`mistSourceNode(xz)`), every material that calls `sky.applyAerialPerspective` (grep: the sheet above/below, the ribbon, the sprites, the surfer and board, the Bombie, the shore surf, the kelp — list them in the ledger) applies `mistSlabNode` after it, `src/whitewater/SprayParticles.ts` (soft fade by `yWater`).

**Interfaces.**
```ts
export const MIST_DECAY_S = 3, MIST_SLAB_A = 1.5, MIST_SIGMA = 0.35;   // extinction per unit density per m
/** Transmittance through a slab of height h (m) above the water at the pixel's xz, density d, for a view ray of elevation sinE: path = min(h / max(|sinE|, 0.05), 60 m). */
export function mistTransmittance(d: number, h: number, sinE: number): number;
export function mistSlabNode(colour: N, worldPos: N, viewDir: N, sampleDensity: N, A: N, sky: Sky, sunVisibility: N): N;
// = mix(mistLightNode({ cosView: dot(viewDir, sunDir), nDotL: 1, sunVisibility, isotropic: 0.5, groundColour: colour }), colour, T)
```
Mist source per texel = `impact share × surge-weighted landing foam` (the breaking foam weight where `tb − τ_land ∈ [0.2, 1.2]` × `(1 + SURGE_RISE × hollow)`) `+ plume share × smoothstep(PLUME_WIND_MS, wOff) × the throwing lip's foam`; `.b' = max(.b_adv × exp(−dt/MIST_DECAY_S), source)`, advected by `wind × 0.3` (mist rides the wind more than foam does). Materials read `foamField.sampleNode(xz).mist` (the slab's `A` is the nearest station's, or a uniform of the set's mean A — take the uniform; the slab's height is a look, not a measurement).

- [ ] 1. Tests: `mistTransmittance` 1 at d 0; monotone in d and in path; the grazing cap holds; CPU mist channel decays to < 5 % in 3 × MIST_DECAY_S; slab 0 at Glassy away from the landing (the plume share is 0; the impact share only within 1.2 s of a landing).
- [ ] 2. Implement the channel (CPU then GPU; the foam self-test extends to `.b`), the slab node, and apply it in each listed material after aerial perspective; the sprites fade `× smoothstep(0, 0.5, y − yWater)` (soft particles).
- [ ] 3. GPU cost: `_rideProfile --wind=18,90` cam median at the tube cam and M-beach's camera, vs Task 6 → `frames-task7.txt` (bar: slab ≤ +1.5 ms; everything since Task 0 ≤ +2.5 ms). If over, the first lever is to skip the slab read where `sampleNode(...).inside` is 0 (outside the box) and in the far materials (kelp, shore surf).
- [ ] 4. Captures: photo 2's moment (12 ft, strong offshore, low sun behind, +60 s) → `backlit-plume.png`; M-tube → `ab-task7-tube.png`.

Gate: tests + self-tests green; costs within the bars; captures. Commit "feat(whitewater): the mist slab and one light".

## Task 8: close — the five moments, the frame gate, handovers

1. The five acceptance moments (spec §7's table) as `#m=` links in `evidence/whitewater/moments.md`, each captured at 1920×1080 from the lookout/beach camera (`captureMoments --size=1920x1080`), photo 5's as three frames 0.3 s apart; each PNG named `accept-<n>-<what>.png`; a README pairing each with its photo's filename (the photos themselves are never committed).
2. The frame gate: `_rideProfile --ft=7 --sim-t=300 --wind=18,90` ×5 interleaved main vs branch, idle, state stated → `frames-final.txt`; `_rideCost --spray --wind=18,90` → `ridecost-final.txt`; GPU cam medians from the tube cam and the beach.
3. Calm identity on main vs branch (Task 3's flat-sea moment): 0 pixels; Glassy with a break: the diff's bbox named.
4. Full unit suite idle, names diffed against Task 0's; GPU self-tests `foam`, `spray`, `ribbon`, `breaker` counts; `npx tsc --noEmit`.
5. Handovers `docs/superpowers/handover/2026-10-10-whitewater-{opus,fable}.md`: commits table, every measured number vs its bar, Andrew's dial values, deferred items, the rulings wanted; memory note for Fable per `orchestrator-mode`.

Gate: everything above in the evidence dir; push. Commit "docs(whitewater): evidence, handovers".

## Where Fable rules

- Task 3 STOP (the mound) and Task 6 STOP (the spray): Fable reviews the A/B pairs and costs; Andrew rules on the look and sets the dials.
- Any bar missed: STOP with the measurement and the next-cheapest change's cost in looks (one line), as shelf-polish did; never move a bar silently.
- Any need to touch `sectionFrameKnots`, `sumWaves`, `src/ride`, or the off-limits files: STOP first.
