# R2, the take-off finished and the wave she keeps: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The take-off made at every Experience level (6 ft beginner included), the instant pop-up forgiven, and a ride
that lasts as long as the wave does instead of ending when the ribbon drops her wave.

**Architecture:** Measure first (Task 1, a probe that prints where she is in the wave's frame and how many stations her
wave has). Then three small fixes, each gated by a test: the carry made one-way (Task 2, `ridePhysics.ts`); the rule
that ends a wave's trace fixed so her wave is traced while she rides it (Task 3, `crestTrace.ts`); the sheet's pre-onset
wall capped as a section's would be so the slope rule cannot throw her in the frame before the section draws (Task 4,
`sectionWater.ts`). Then the evidence and the handovers.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU/TSL, vitest 5, Electron capture tools under `tools/`.

**Spec:** `docs/superpowers/specs/2026-10-07-r2-take-off-finished-design.md` (read it first; the plan argues from it).

**Written by:** Fable (orchestrator), 2026-10-07, for Opus (executor). Branch `r2-take-off` from `main` (118b878 or
later). Push at the end; do not merge without Andrew's say-so.

## Global Constraints

- Nothing under `src/seabed`; nothing to `breaking.ts`'s parameters, `flowFromEta`, `sets.ts`. `crestTrace.ts` changes
  only in the rule Task 3 finds. No new blend, fade, σ or `min()` between the sheet and the profile.
- `PLANE_DRAG`, `RAIL_KEEP`, `STALL_*`, `WIPEOUT_*`, `POPUP_S`, `CREST_CARRY`, `CARRY_TAU_S`, `ridePose.ts`, the camera:
  unchanged.
- Dials tried once. A fix that does not pass its test at the first value is left with its trace in the commit message;
  do not search.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx tsc --noEmit` clean at every commit. Probes in env-gated vitest files or `tools/_*.mjs`, never `src/_scratch`.
- The full suite times out ~20 tests under load; they pass alone. Baseline on a quiet machine and re-run only the files
  that newly fail before calling anything a regression.

## Review Focus

1. **The one-way carry at 12 ft** (c 10.8 at the spot, 0.85 c 9.2): with gravity now free to add to it, her speed into
   the pop-up must stay under `MAX_SPEED` 18 and she must not trip `WIPEOUT_SLOPE` on the lip. (Task 2: the 12 ft ride
   case, kept.)
2. **The carry pushes but does not pull**: a board already at 0.95 c along the travel loses speed only to drag. (Task 2
   test.)
3. **Her line survives the pop-up**: velocity across the travel set during `popup` decays by `PLANE_DRAG` only. (Task 2
   test.)
4. **Task 3 must not keep dead waves alive**: a wave whose crest has left the reef, or whose every section has collapsed
   to the bore, still ends. (Task 3 test: the count goes to 0 *after* collapse or departure, not before.)
5. **Task 4's cap is the section's cap, nowhere else**: the sheet far from any about-to-break station keeps its own slope
   (a steep sheet with no ribbon in reach still wipes out at > 2.5). (Task 4 test.)
6. **The ride test at 6 ft beginner is the gate for Task 2**, 12 ft intermediate ≥ 15 s or a real end is the gate for
   Task 3, the bot's instant pop-up at 6 and 8 ft is the gate for Task 4.

---

### Task 0: Branch and baseline

- [ ] **Step 1:** `git checkout main && git pull && git checkout -b r2-take-off`. `npx tsc --noEmit` clean.
- [ ] **Step 2:** Ride suite: `npx vitest run src/ride` → only `rideOnSections` 6 ft beginner failing (3.0 s).
- [ ] **Step 3:** Full suite on a quiet machine: `npx vitest run 2>&1 | tail -5`; keep the failing names in the
  scratchpad (expected about 41 failed, the R1 lists minus the three ride cases). Re-run any file that fails only by
  timeout, alone, and record which names are real.

---

### Task 1: The probe: where she is, in the wave's frame

**Files:**
- Create: `src/ride/takeoffProbe.test.ts`

The probe is `rideOnSections`' loop with its own station trace alongside (the loop already calls `traceStations` inside
`waterAtT`; the probe calls it once more per step for the row, which is fine for a probe).

- [ ] **Step 1: Write it.**

```ts
import { it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_REEF_PARAMS } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesBetween, wavesNear } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS as P } from '../breaker/breaking';
import { type Station, minRibbonHeight, traceStations } from '../breaker/crestTrace';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from '../breaker/reefField';
import { breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { withSections } from './sectionWater';
import { type WaterFn, waterAt } from './water';
import { type Experience, TUNING, liftAt, speedOf, startBody, stepRide } from './ridePhysics';
import { TAKEOFF_ARRIVE_S, takeoffLeadS, takeoffSpot } from './takeoff';

/**
 * A probe, not a test (R2 §1): where she is in the wave's frame through the take-off, at each size and Experience level.
 * `PROBE_RIDE_FT=6,7,8 npx vitest run src/ride/takeoffProbe.test.ts --silent=false`. Skipped otherwise.
 * Columns: t−arrive, phase, speed, c, slope under her, lift, ahead (m in front of her wave's nearest live station along
 * its normal; + is shoreward of the crest line), up (height above still water / that station's H), n (live stations of
 * her wave), near (m along the crest to the nearest), dy (board − water), foam, onSection, event.
 */
const SIZES = (process.env.PROBE_RIDE_FT ?? '').split(',').map(Number).filter((n) => n > 0);
const LEVELS: Experience[] = ['beginner', 'intermediate', 'expert'];

it.skipIf(SIZES.length === 0)('probe: her position in the wave through the take-off', { timeout: 1_800_000 }, () => {
  const lines: string[] = [];
  for (const ft of SIZES) for (const experience of LEVELS) {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = ft;
    const field = computeReefField({ bed: downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: P.peel, smooth: true, refractFloorM: REFRACT_FLOOR_M });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const set = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8);
    const big = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const }, minHeightM = minRibbonHeight(fieldBreakingHeight(field, P), P);
    const stationsAt = (t: number, cx: number, cz: number) => {
      const events = wavesNear(t, c, DEFAULT_SET_PARAMS), waves = events.map(toActiveWave);
      const mine = events.findIndex((e) => Math.abs(e.arrivalS - big.arrivalS) < 1e-6);
      return { waves, mine, entries: traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM }) };
    };
    const waterAtT = (t: number, cx: number, cz: number): { water: WaterFn; live: Station[] } => {
      const { waves, mine, entries } = stationsAt(t, cx, cz);
      const sheet: WaterFn = (x, z) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
      const live = entries.filter((e): e is Station => !e.gap && e.wave === mine);
      return { water: withSections(sheet, entries, c.tideM), live };
    };
    const { x: sx, z: sz } = takeoffSpot(field, big.heightM, P);
    let t = big.arrivalS - takeoffLeadS(field, { x: sx, z: sz });
    const arrive = t + TAKEOFF_ARRIVE_S, PADDLE_FROM_S = 2;
    const start = waterAtT(t, sx, sz).water(sx, sz);
    const swellHeading = Math.atan2(start.dirX, -start.dirZ) / (Math.PI / 180);
    const b = startBody(sx, sz, swellHeading, waterAtT(t, sx, sz).water);
    const line = swellHeading - 88;
    const dt = 1 / 60;
    let popped = false, rodeS = 0, nextRow = -Infinity, ended = '';
    lines.push(`\n=== ${ft} ft ${experience}: H0 ${big.heightM.toFixed(2)} m, spot (${sx.toFixed(1)}, ${sz.toFixed(1)}), arrive ${arrive.toFixed(2)}`);
    lines.push('  t-arr  phase   v     c   slope lift  ahead   up    n  near    dy  foam sec  event');
    for (let k = 0; k < 60 * 25; k++) {
      t += dt;
      const { water, live } = waterAtT(t, b.x, b.z);
      if (b.phase === 'paddle' && !popped) b.headingDeg = swellHeading;
      const err = ((b.headingDeg - line + 540) % 360) - 180;
      const under = water(b.x, b.z);
      const popup = b.phase === 'paddle' && b.caught && !popped && Math.hypot(under.slopeX, under.slopeZ) > 0.6;
      if (popup) popped = true;
      const ev = stepRide(b, { paddle: b.phase === 'paddle' && t > arrive - PADDLE_FROM_S, steer: popped ? Math.max(-1, Math.min(1, -err / 30)) : 0, crouch: 0, popup }, water, dt, TUNING[experience]);
      if (b.phase === 'ride') rodeS += dt;
      const row = ev !== null || t >= nextRow || (b.phase === 'ride' && (Math.abs(rodeS - 1) < dt / 2 || Math.abs(rodeS - 3) < dt / 2));
      if (row) {
        nextRow = Math.max(nextRow, Math.floor(t) + 1);
        const w = b.water, lx = w.lx ?? b.x, lz = w.lz ?? b.z;
        let near: { al: number; ah: number; H: number } | null = null;
        for (const s of live) { const dx = lx - s.x, dz = lz - s.z, al = Math.abs(-dx * s.nz + dz * s.nx); if (!near || al < near.al) near = { al, ah: dx * s.nx + dz * s.nz, H: s.H }; }
        const f = (v: number, d = 2, wd = 6) => (Number.isFinite(v) ? v.toFixed(d) : '-').padStart(wd);
        lines.push(`${f(t - arrive)} ${b.phase.padEnd(6)} ${f(speedOf(b), 1, 5)} ${f(w.c, 1, 5)} ${f(Math.hypot(w.slopeX, w.slopeZ))} ${f(liftAt(w, b.headingDeg))} ${near ? f(near.ah) : '     -'} ${near ? f((b.y - c.tideM) / near.H) : '     -'} ${String(live.length).padStart(4)} ${near ? f(near.al, 1, 5) : '    -'} ${f(b.y - w.y)} ${f(w.foam)} ${w.onSection ? ' y ' : ' n '} ${ev ?? ''}`);
      }
      if (ev === 'wipeout' || ev === 'kickout') { ended = `${ev} at +${(t - arrive).toFixed(2)}, rode ${rodeS.toFixed(2)} s`; break; }
    }
    lines.push(`  end: ${ended || `window, rode ${rodeS.toFixed(2)} s`}`);
  }
  console.log(lines.join('\n'));
});
```

  If `wavesNear`'s events do not carry the same `arrivalS` as `wavesBetween`'s (check `sets.ts`: both build from
  `wavesOfSet`, so they should), match by `heightM` instead.

- [ ] **Step 2: Run it.** `PROBE_RIDE_FT=6,7,8 npx vitest run src/ride/takeoffProbe.test.ts --silent=false` (PowerShell:
  `$env:PROBE_RIDE_FT='6,7,8'; npx vitest run …`). Nine blocks. Save the whole output to the scratchpad; it goes in the
  handover verbatim (trimmed to the rows at caught / popup / +1 / +3 / the last three rows before the end).
- [ ] **Step 3: Read it before touching anything, and write three sentences in the scratchpad:**
  (i) the beginner at 6 ft: `ahead` and `up` at `caught` vs the intermediate's (this is Task 2b's gate if needed);
  (ii) for every case that ends in a kickout at 10–14 s: does `n` (her wave's live stations) go to 0 in the row before,
  with `sec` flipping to n and `dy` jumping? (That is Task 3's (a)/(c) vs (b): if `n` hits 0 on the CPU with the
  camera at her, it is not the `MAX_STATIONS` cut.)
  (iii) the drop's depth: `up` at popup vs 1 s later, at each size (R3's camera question; just record it).
- [ ] **Step 4: Commit.** `git add src/ride/takeoffProbe.test.ts && git commit -m "probe(ride): where she is in the wave's frame through the take-off, per size and Experience (R2 §1)"`
  with the three sentences in the message.

---

### Task 2: The carry is one-way

**Files:**
- Modify: `src/ride/ridePhysics.ts` (the `if (carried)` block, :256-261, and the comment above `CREST_CARRY`)
- Test: `src/ride/ridePhysics.test.ts` (extend the "the crest carries her (R1.5 §1)" describe)

- [ ] **Step 1: Write the failing tests** (inside the R1.5 describe; `slope`, `run`, `DT`, `idle`, `shoreHeading` exist there).

```ts
  it('already faster than the carry along the travel, she is not slowed by it (R2 §2: one-way)', () => {
    const w = slope(0.5, 0, 9), b = startBody(0, 0, shoreHeading, w);
    b.caught = true; b.catchT = CATCH_HOLD_S;
    b.vx = 0.95 * 9;
    run(b, idle, () => w, 0.3);
    expect(b.caught).toBe(true);
    // Gravity on the 0.5 face (~4 m/s²) adds ~1.2 m/s; the drag against the crest's water takes back a little. Two-way, she
    // would have been pulled to ~0.87 c (7.8).
    expect(b.vx).toBeGreaterThan(0.95 * 9);
  });
  it('the line she sets during the pop-up survives it: her speed across the travel decays by drag alone', () => {
    const w = slope(0.5, 0, 9), b = startBody(0, 0, shoreHeading, w);
    b.phase = 'popup'; b.phaseT = 0;
    b.vx = CREST_CARRY * 9; b.vz = -3; // 0.85 c shoreward and 3 m/s along the line
    b.headingDeg = Math.atan2(b.vx, -b.vz) / (Math.PI / 180); // nose along her velocity: no side slip to grip
    run(b, idle, () => w, 0.3);
    // Two-way the relaxation took 86 % of vz in 0.3 s (|vz| ≈ 0.4); one-way, PLANE_DRAG's 0.03/s leaves it near 3.
    expect(Math.abs(b.vz)).toBeGreaterThan(2.5);
    expect(b.vx).toBeGreaterThanOrEqual(CREST_CARRY * 9 - 0.1);
  });
```

- [ ] **Step 2: Run them.** `npx vitest run src/ride/ridePhysics.test.ts` → the two new cases FAIL (vx ≈ 7.8; |vz| ≈ 0.4),
  the rest pass.
- [ ] **Step 3: Implement.** Replace the `if (carried)` block with

```ts
  if (carried) {
    // ... and it takes her with it, over CARRY_TAU_S: one-way (R2 §2). The crest's water pushes her up to its speed along
    // its travel; it never pulls her back to it (gravity down the face is hers to keep), and across its travel the drag
    // alone acts (the line she sets in the pop-up survives it). Two-way, she was matched to the crest and rode its top
    // (6 ft beginner, R1.5), and the pop-up's line was stripped ~93 % in 0.4 s.
    const k = 1 - Math.exp(-dt / CARRY_TAU_S);
    const dv = vc - (b.vx * w.dirX + b.vz * w.dirZ);
    if (dv > 0) {
      b.vx += w.dirX * dv * k;
      b.vz += w.dirZ * dv * k;
    }
  }
```

  Update the `CREST_CARRY` doc comment's "Her velocity relaxes toward…" sentence to "…is pushed up to CREST_CARRY × c
  along the wave's travel (one-way, R2 §2) with time constant CARRY_TAU_S".

- [ ] **Step 4: Run them.** `ridePhysics.test.ts` all green, including the six R1.5 cases (the first one's upper bound
  `CREST_CARRY × 9 + 1` still holds: gravity adds ~0.6 m/s over the 0.3 s she is on the face in that test; if it fails by
  a few tenths, raise that bound to `+ 1.5` and say so in the commit).
- [ ] **Step 5: The ride test.** `npx vitest run src/ride/rideOnSections.test.ts`. Target 4/4. Record the four times.
- [ ] **Step 6: If 6 ft beginner still misses: Task 2b.** Otherwise skip to Step 7.

  **2b.** From Task 1's table, pick the gate: the beginner's `up` at `caught` (likely −0.1 to +0.1 H, high on the face)
  vs the intermediate's (lower, more negative), and `ahead`. Add to `WaterAt` (`water.ts`) two optional fields:

```ts
  /** Where a ribbon section is the surface (sectionWater.withSections): metres in front of its station's crest line along
   * the normal (+ shoreward), and the station's local height H (m). Undefined on the sheet. */
  aheadM?: number;
  stationH?: number;
```

  set in `withSections`' return (`aheadM: (x - best.x) * best.nx + (z - best.z) * best.nz, stationH: best.H`). In
  `ridePhysics.ts` add `export const CARRY_UP_GATE = <value from the table>;` (fraction of H above still water; she is
  carried only at or below it) and in `carrying()`: `if (w.stationH !== undefined && (b.y - still) / w.stationH > CARRY_UP_GATE) return false;`
  where `still` is the tide: `stepRide` has no tide, so instead gate on `b.y - w.y`? No: use `aheadM` instead if the
  table separates on it (`CARRY_AHEAD_GATE_M`, carried only when `w.aheadM === undefined || w.aheadM >= CARRY_AHEAD_GATE_M`).
  Choose the one the table separates on; one value; one run of the ride test. Test in `ridePhysics.test.ts`: a `slope`
  water with `aheadM` below the gate does not carry; at or above it does. If 2b is also short, revert 2b, leave the
  beginner failing, write the trace.
- [ ] **Step 7: Commit.** `git add src/ride && git commit -m "feat(ride): the crest's carry is one-way along its travel: it pushes her up to 0.85 c, never pulls her back, and leaves her line to the drag (R2 §2)"`
  with the ride-test times before/after and tsc in the message.

---

### Task 3: The wave she keeps

**Files:**
- Modify: `src/breaker/crestTrace.ts` (the rule found)
- Test: `src/breaker/crestTrace.test.ts` (one new case), `src/ride/rideOnSections.test.ts` (the end-of-ride assertion)

- [ ] **Step 1: Diagnose from Task 1's table.** If `n` goes to 0 in the row before the kickout (CPU, camera at her): it
  is (a) the seed or (c) `alive`. If `n` stays > 0 on the CPU: it is (b) the `MAX_STATIONS` cut, live only. Then one probe
  step to split (a) from (c): in `traceStations`, temporarily `console.log` per wave and per call the seed's `xi`,
  `inGrid(field, seed.x, seed.z)` and `sides.length`, and run the 12 ft ride case alone. (a) shows `sides.length` 0 for
  her wave at the kickout time; (c) shows a full line whose every station fails `alive`. Remove the log.
- [ ] **Step 2: Write the failing test** in `crestTrace.test.ts` (the file's `field`, `ctx`, `p`, `waves` helpers exist;
  read its first 40 lines for their names):

```ts
  it('her wave is traced for as long as it breaks on the reef: live stations from its onset at the take-off spot until its collapse there or its crest leaves the reef (R2 §3)', () => {
    // The set's biggest wave at 12 ft; sample every 0.5 s from 2 s before its arrival at the spot for 20 s.
    const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 12;
    const big = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8).reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const spot = takeoffSpot(field, big.heightM, p);
    const minHeightM = minRibbonHeight(fieldBreakingHeight(field, p), p);
    let seenLive = false, gone: number | null = null;
    for (let dt = -2; dt <= 20; dt += 0.5) {
      const t = big.arrivalS - takeoffLeadS(field, spot) + TAKEOFF_ARRIVE_S + dt;
      const events = wavesNear(t, c, DEFAULT_SET_PARAMS), mine = events.findIndex((e) => Math.abs(e.arrivalS - big.arrivalS) < 1e-6);
      const live = traceStations(field, events.map(toActiveWave), t, ctx, { cameraX: spot.x, cameraZ: spot.z, params: p, minHeightM }).filter((e): e is Station => !e.gap && e.wave === mine);
      if (live.length > 0) seenLive = true;
      else if (seenLive && gone === null) gone = dt;
      if (gone !== null) {
        // Once gone it may only be because every section had collapsed (tb past its settle span) or the crest left the reef:
        // check the last live set's tb against settleSpan(H) at the station nearest the spot.
      }
    }
    expect(seenLive).toBe(true);
    expect(gone === null || gone >= 12).toBe(true); // at 12 ft the first section's tube lasts > 12 s on the ledge (R1 handover: 13.7 s ridden to a kickout, not a collapse)
  });
```

  Keep the assertion honest: the number 12 is the R1.5 measured ride (13.67 s to a kickout) minus a margin. If the
  wave genuinely collapses earlier at the spot (`tb` ≥ `settleSpan(H, p)` at the nearest station when `live` empties),
  the test must accept that: compute it in the loop and assert `gone === null || collapsedBefore(gone)`.
- [ ] **Step 3: Run it** → FAIL at the kickout time (expected `gone` ≈ 8–11).
- [ ] **Step 4: Fix the rule found, and only it.**
  - (a) the seed: `traceWave` seeds at `project(field, w, t, ctx, 0, 0, …)` from the origin, and returns `[]` when the
    seed misses (`|xi| ≥ CREST_TOLERANCE_S` or off-grid). A crest 60 m shoreward of the origin at t = arrival + 8 can
    fail that from (0, 0). Seed from the wave's own expected position instead: start the projection from the point the
    crest passed the origin's ray at, advanced by c × (t − arrival) along the travel (`ctx.travelX/Z`), clamped to the
    grid; or try the origin first and, on a miss, the advanced point. No change to the trace itself.
  - (b) the cut: before the retries, order the waves so the one with the smallest |arrivalS − t| (the one most likely
    ridden) is traced first, so a cut drops the far ones; or raise nothing, just order. `App.updateRibbon` passes
    `events` in arrival order; the fix is in `traceStations` (sort a copy by |arrival − t| for the trace, restore
    drawing order after).
  - (c) `alive`: a station whose section still has a lip (`tb` finite and below its settle span) must not fail
    `curlWeight > ALIVE_RHO`; find why `curlWeight` reads 0 for a live section and fix the read (a `rho` or `phase`
    jump), not the threshold.
- [ ] **Step 5: Run** `crestTrace.test.ts` (the new case and the old ones, which pin spacing, gaps, determinism: all must
  stay green), then `rideOnSections.test.ts`. Expected: the 6 and 12 ft intermediate cases now ride ≥ 15 s or end with
  `foam` > 0 / `onSection` true at the last step. Add that assertion to `rideOnSections.test.ts`: after the loop,
  `expect(rodeS >= 15 || lastWater.foam > 0 || lastWater.onSection === true).toBe(true)` where `lastWater` is `b.water`
  at the break (a real end, not a vanished wave). Keep the `> 5` assertion too.
- [ ] **Step 6: GPU self-test unchanged?** The ribbon's GPU path reads the same stations; run
  `npx vitest run --filter=ribbon` if such a filter exists in `package.json` scripts (check), else skip and note it.
- [ ] **Step 7: Commit.** `git add src/breaker src/ride && git commit -m "fix(breaker): her wave is traced for as long as it breaks: <the rule> no longer drops every station at once mid-ride (R2 §3)"`
  with the diagnosis ((a)/(b)/(c), the evidence line) and the ride-test times in the message.

---

### Task 4: The instant pop-up is forgiven

**Files:**
- Modify: `tools/captureRide.mjs` (the wipeout trace), `src/ride/sectionWater.ts` (the cap before the section draws)
- Test: `src/ride/sectionWater.test.ts` (one new case)

- [ ] **Step 1: Instrument the bot.** In `captureRide.mjs`'s step loop, when `ev === 'wipeout'`, push into `events` also
  `foam=…, steep=…, sec=…, tb=…, until=…, wait=…, A=…` from `b.water` (steep = hypot of its slopes, `sec` =
  `onSection`) and the nearest non-gap station of `a.ribbonStations` to `(b.water.lx ?? b.x, b.water.lz ?? b.z)` (as
  `_takeoffLive.mjs` :53 finds it). Run the 6 ft bot once against 5173:

```
npx electron tools/captureRide.mjs --base=http://localhost:5173/ --out=<dir>/r2-6ft-pre- --at=-4,-3 --cond="{\"swell\":{\"sizeFt\":6,\"periodS\":15,\"directionDeg\":225},\"tideM\":0}"
```

  Expected: `wipeout@-3.1x foam=0.00 steep=2.6–4 sec=false until=0.1–0.5` (or `wait` > 0). If instead `sec=true` or
  `foam` > 0.5, stop: write what it says in the handover and skip Step 2–4 (the spec's "if the trace shows something else").
- [ ] **Step 2: Write the failing test** in `sectionWater.test.ts` (read its helpers first: it builds a `Station` and a
  sheet by hand):

```ts
  it('a sheet standing steeper than a section can, under the ribbon\'s reach of a station about to break, is read at the section\'s cap (R2 §4: the instant pop-up is not thrown by the pre-onset wall)', () => {
    // A station 2 m away along the crest, unbroken, breaking in 0.3 s (until 0.3, tb null, section A 0: no curve yet).
    const s = station({ x: 0, z: 0, nx: 1, nz: 0, tb: null, until: 0.3, section: { A: 0, phase: 0, hollow: 0, rho: 0 } });
    const steepSheet: WaterFn = (x) => ({ ...flatWater()(x, 0), y: -3 * x, slopeX: -3, slopeZ: 0 }); // |∇y| 3 > WIPEOUT_SLOPE
    const w = withSections(steepSheet, [s], 0)(0.5, 1);
    expect(Math.hypot(w.slopeX, w.slopeZ)).toBeLessThanOrEqual(MAX_SECTION_SLOPE + 1e-9);
    // Far from any station the sheet keeps its own slope (Review Focus 5).
    const far = withSections(steepSheet, [s], 0)(0.5, 20);
    expect(Math.hypot(far.slopeX, far.slopeZ)).toBeCloseTo(3, 5);
  });
```

  Adjust the helper's name/shape to the file's existing one.
- [ ] **Step 3: Run** → FAIL (the pre-onset station has `curlWeight` 0 so `withSections` filters it out and returns the
  sheet: slope 3).
- [ ] **Step 4: Implement** in `withSections`: keep a second list, `pending`, of entries that are not live but are about to
  break (`!e.gap && e.tb === null && ((e.until !== null && e.until <= WALL_LEAD_S) || (e.wait !== null && e.wait > 0))`,
  `WALL_LEAD_S` from `wombSection`). In the returned function, when no live station is in reach (`!best`) but a pending
  one is within `MAX_ALONG_M` along its crest and within `EDGE_OUTER_UNITS × max(A, H)` across (A is 0 before onset:
  use `H`), return the sheet's water with its slope **capped to `MAX_SECTION_SLOPE` in magnitude, direction kept**:

```ts
      const m = Math.hypot(w.slopeX, w.slopeZ);
      if (m > MAX_SECTION_SLOPE) { const f = MAX_SECTION_SLOPE / m; return { ...w, slopeX: w.slopeX * f, slopeZ: w.slopeZ * f }; }
      return w;
```

  This is the cap the section already imposes, applied in the moment before the section exists; no height change, no
  blend, `onSection` stays false. Document it in the file's header paragraph (one sentence).
- [ ] **Step 5: Run** `sectionWater.test.ts`, `ridePhysics.test.ts`, `rideOnSections.test.ts` (unchanged results expected)
  and the bot at 6 and 8 ft (`--at=-6,-4,-3,-2,-1,0,1,3,6`, output `<dir>/r2-6ft-`, `<dir>/r2-8ft-`). Expected: no
  `wipeout` in the first 6 s; `phase` `ride` from pop-up on; speed 7–14.
- [ ] **Step 6: Commit.** `git add src/ride tools/captureRide.mjs && git commit -m "fix(ride): the sheet's pre-onset wall under the ribbon's reach is read at the section's cap, so the instant pop-up is not thrown (R2 §4)"`
  with the Step 1 trace line and the bot's events before/after in the message.

---

### Task 5: Evidence, suite, handovers, push

**Files:**
- Modify: `tools/_takeoffLive.mjs` (`--experience=`)
- Create: `docs/superpowers/handover/<date>-r2-opus.md`, `docs/superpowers/handover/<date>-r2-fable.md`

- [ ] **Step 1: `--experience`.** In `_takeoffLive.mjs` read `const experience = arg('experience') ?? 'intermediate';` and
  write it into the same front-settings `localStorage` item as `takeoffSlowMo` (`App.experience()` reads
  `sanitizeFrontSettings(...).experience` from `liquid-dreams.front-settings.v1`). Update the header comment.
- [ ] **Step 2: Live runs** against 5173, output `C:\Dev\andrew-dev-personal-projects\liquid-dreams-captures\r2-<date>\`:

```
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live6/ --ft=6 --aim=30
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live7/ --ft=7 --aim=30
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live8/ --ft=8 --aim=30
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live6b/ --ft=6 --aim=30 --experience=beginner
```

  Expected in each `log.json`: `caught`, `popup`, `ride` ≥ 5 s; no row where `near.al` jumps from < 3 to > 20 while
  `phase` is `ride` (the §3 signature); the ride ends with the window (`sim` ≥ 12) or a bail with `cover` > 0 / foam.
  Set `window.__until` higher (the tool's default 12) if the rides now outlast it: pass `--until=20` (add the arg).
- [ ] **Step 3: Look at the frames.** For each run name the best drop frame and the worst problem frame (two lines each),
  as R1.5 did. Note whether the beginner's run reads as a drop.
- [ ] **Step 4: The suite** on a quiet machine: `npx vitest run 2>&1 | tail -5`; diff the failing names against Task 0.
  Expected to leave the list: `rideOnSections` 6 ft beginner. Nothing new. Re-run timeouts alone before judging.
- [ ] **Step 5: Handovers.**
  - `<date>-r2-opus.md`: the commits; the Task 1 table (trimmed); Task 3's diagnosis and the rule changed; Task 4's trace
    line; the ride-test times; the suite diff; capture paths and the two frame lines per run; open items; commands.
  - `<date>-r2-fable.md`: what the table said about where she is at the catch per level and about the drop's depth; what
    surprised you; whether Task 2 alone fixed the beginner or 2b was needed (and the gate value); whether the wave now
    ends on her (collapse) or still vanishes anywhere; your view on the next segment's first question (one body vs camera
    vs feel).
- [ ] **Step 6: Commit and push.** `git add docs/superpowers/handover tools && git commit -m "docs(handover): R2 for Opus and for Fable" && git push -u origin r2-take-off`.
  Tell Andrew: the branch, the two handover paths, and the one frame to look at first (the 6 ft beginner's +1 s frame).
