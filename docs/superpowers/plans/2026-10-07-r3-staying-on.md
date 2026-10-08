# R3, staying on the wave: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ride test that only passes when she rides in front of the crest, a table of what decides whether she stays
there after the pop-up, the one fix that table points at, and the three in-tube bails named from their rows.

**Architecture:** Make the gate honest first (Task 1: a surfer's line and `heldS` ≥ 5 s with `ahead` > 0; expected red).
Measure (Task 2: the R2 probe gains line and pop-delay dials and prints `along` beside `c`). Then, only if the table's
`behind` row says she is on the face, lifting and slower than c, the one-way push of R2 §2 applies in `ride` phase on the
drawn face (Task 3, `ridePhysics.ts`, the push only: the drag's reference stays the sheet's water). The live bot logs
foam / steep / onSection / settle and the three bails are named (Task 4). Evidence and handovers (Task 5).

**Tech Stack:** TypeScript, three.js 0.186 WebGPU/TSL, vitest 5, Electron capture tools under `tools/`.

**Spec:** `docs/superpowers/specs/2026-10-07-r3-staying-on-design.md` (read it first; the plan argues from it).

**Written by:** Fable (orchestrator), 2026-10-07, for Opus (executor). Branch `r3-staying-on` from `main` (44e1377 or
later). Push at the end; do not merge without Andrew's say-so.

## Global Constraints

- Nothing under `src/seabed`; nothing to `breaking.ts`'s parameters, `flowFromEta`, `sets.ts`, `crestTrace.ts`,
  `sectionWater.ts` (Task 4's single exception, only on its stated condition). No new blend, fade, σ or `min()`.
- In `ride` phase the drag stays against the sheet's water (`w.ux/uz`): `carrying()`, the `ux/uz` line and the drag block
  in `stepRide` are untouched. `PLANE_DRAG`, `RAIL_KEEP`, `STALL_*`, `WIPEOUT_*`, `POPUP_S`, `CREST_CARRY`, `CARRY_TAU_S`,
  `MAX_SECTION_SLOPE`, `ridePose.ts`, the camera: unchanged.
- No new numeric constant without the probe row that sets it. Dials tried once; a miss leaves its trace in the commit.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx tsc --noEmit` clean at every commit. Probes in env-gated vitest files or `tools/_*.mjs`, never `src/_scratch`.
- The full suite times out ~20 tests under load; they pass alone. Baseline on a quiet machine and re-run only the files
  that newly fail before calling anything a regression.

## Review Focus

1. **The gate cannot be passed from behind the wave**: `ahead` > 0 is the only thing `heldS` counts; a section's back
   (`onSection` true, `ahead` < 0) does not count. (Task 1: the gate's definition; Task 3's "section face with lift 0 is
   not pushed" test covers the physics side.)
2. **The face carry never brakes and never acts on the sheet**: at 0.95 c along the travel on a section it adds nothing;
   on the same slope without `onSection` it adds nothing. (Task 3 tests.)
3. **Going over the back stays possible**: at the top (lift 0) the push is off, so a rider who climbs out of the face is
   left to gravity and the stall rule. (Task 3 test: section face, nose along the crest, slope across her.)
4. **12 ft speed**: with the push in `ride` on the face, her speed must stay under `MAX_SPEED` 18 and off
   `WIPEOUT_SLOPE` on the lip. (Task 3 Step 6: the 12 ft case's max speed and max slope recorded in the commit.)
5. **The `ride` drag is unchanged**: her along-the-line speed on the sheet in `ride` decays by `PLANE_DRAG` only, with
   or without the flag. (Task 3 test, the R2 pop-up-line test's twin for `ride`.)

---

### Task 0: Branch and baseline

- [ ] **Step 1:** `git checkout main && git pull && git checkout -b r3-staying-on`. `npx tsc --noEmit` clean.
- [ ] **Step 2:** `npx vitest run src/ride src/breaker/crestTrace.test.ts` → ride files all green; `crestTrace.test.ts`
  6 failing (right closes out, lipH, fixed spacingM, tube size, over the shelf, lip end: all baseline).
- [ ] **Step 3:** Full suite on a quiet machine: `npx vitest run 2>&1 | tail -5`; keep the failing names in the
  scratchpad (expected 39 failed / 1846 passed after R2). Re-run any file that fails only by timeout, alone.

---

### Task 1: The honest ride test

**Files:**
- Create: `src/ride/rideLine.ts`
- Modify: `src/ride/rideOnSections.test.ts`

**Interfaces:**
- Produces: `LINE_OFF_DEG` (35) and `aheadOf(live, w, x, z): number | undefined` in `src/ride/rideLine.ts` (a module,
  not the test file, so Task 2's probe can import them without registering the ride test's cases); the test's `heldS`.

- [ ] **Step 1: The helper module.** Create `src/ride/rideLine.ts`:

```ts
import type { Station } from '../breaker/crestTrace';
import { MAX_ALONG_M } from './sectionWater';
import type { WaterAt } from './water';

/**
 * The line a surfer holds, degrees off the swell heading toward the left (R3 §1). To hold a place on the face her speed
 * along the wave's travel must be c; at 12 m/s against c 10 that is 33° off it. (The ride test's 88°, R1–R2, left her
 * ~0.3 m/s along the travel: over the back within a second of the pop-up.)
 */
export const LINE_OFF_DEG = 35;

/**
 * Metres in front of her wave's nearest live station along its normal (+ shoreward of the crest line), measured from the
 * water's Lagrangian label as the R2 probe does; undefined when no station is within MAX_ALONG_M along the crest.
 */
export function aheadOf(live: readonly Station[], w: WaterAt, x: number, z: number): number | undefined {
  const lx = w.lx ?? x, lz = w.lz ?? z;
  let best: { al: number; ah: number } | null = null;
  for (const s of live) {
    const dx = lx - s.x, dz = lz - s.z, al = Math.abs(-dx * s.nz + dz * s.nx);
    if (al <= MAX_ALONG_M && (!best || al < best.al)) best = { al, ah: dx * s.nx + dz * s.nz };
  }
  return best?.ah;
}
```

- [ ] **Step 2: Change the line and add the gate.** In `rideOnSections.test.ts` add
  `import { LINE_OFF_DEG, aheadOf } from './rideLine';` and replace the body from `let herLive = 0;` down to the end of
  the `it` with:

```ts
    // Her wave's live stations at the last step traced (the ride test reads `ahead` from them).
    let herStations: Station[] = [];
    const waterAtT = (t: number, cx: number, cz: number): WaterFn => {
      const events = wavesNear(t, c, DEFAULT_SET_PARAMS), waves = events.map(toActiveWave);
      const mine = events.findIndex((e) => Math.abs(e.arrivalS - big.arrivalS) < 1e-6);
      const sheet: WaterFn = (x, z) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
      const entries = traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM });
      herStations = entries.filter((e): e is Station => !e.gap && e.wave === mine);
      return withSections(sheet, entries, c.tideM);
    };
    const { x: sx, z: sz } = takeoffSpot(field, big.heightM, P);
    let t = big.arrivalS - takeoffLeadS(field, { x: sx, z: sz });
    // The crest reaches the spot TAKEOFF_ARRIVE_S after the start; the rider waits, then paddles for the last PADDLE_FROM_S
    // (paddling from the start carried her 8–9 m in, onto the onset itself: the R1 review).
    const arrive = t + TAKEOFF_ARRIVE_S, PADDLE_FROM_S = 2;
    const start = waterAtT(t, sx, sz)(sx, sz);
    const swellHeading = Math.atan2(start.dirX, -start.dirZ) / (Math.PI / 180);
    const b = startBody(sx, sz, swellHeading, waterAtT(t, sx, sz));
    // A surfer's line (R3 §1): LINE_OFF_DEG off the swell toward the left. To hold a place on the face her speed along the
    // travel must be c; at 12 m/s against c 10 that is 33° off it. (88°, R1–R2, left her ~0.3 m/s along the travel: over the
    // back within a second of the pop-up, and the "ride" was the board coasting behind the wave.)
    const line = swellHeading - LINE_OFF_DEG;
    const dt = 1 / 60, events: RideEvent[] = [], aheadAt: Record<string, number | undefined> = {};
    let popped = false, rodeS = 0, heldS = 0;
    for (let k = 0; k < 60 * 20; k++) {
      t += dt;
      const water = waterAtT(t, b.x, b.z);
      if (b.phase === 'paddle' && !popped) b.headingDeg = swellHeading;
      const err = ((b.headingDeg - line + 540) % 360) - 180;
      const under = water(b.x, b.z);
      const popup = b.phase === 'paddle' && b.caught && !popped && Math.hypot(under.slopeX, under.slopeZ) > 0.6;
      if (popup) popped = true;
      const ev = stepRide(b, { paddle: b.phase === 'paddle' && t > arrive - PADDLE_FROM_S, steer: popped ? Math.max(-1, Math.min(1, -err / 30)) : 0, crouch: 0, popup }, water, dt, TUNING[experience]);
      if (ev) events.push(ev);
      const ahead = aheadOf(herStations, b.water, b.x, b.z);
      if (ev === 'popup') aheadAt.popup = ahead;
      if (b.phase === 'ride') {
        rodeS += dt;
        if (ahead !== undefined && ahead > 0) heldS += dt;
        for (const s of [1, 2, 3]) if (Math.abs(rodeS - s) < dt / 2) aheadAt[`ride+${s}`] = ahead;
      }
      if (ev === 'wipeout' || ev === 'kickout') break;
    }
    const last = b.water;
    console.log(`${ft} ft ${experience}: line ${LINE_OFF_DEG}°, held ${heldS.toFixed(2)} s of ${rodeS.toFixed(2)} s, end ${events[events.length - 1]} (foam ${last.foam.toFixed(2)}, section ${!!last.onSection}), ahead ${JSON.stringify(aheadAt)}`);
    expect(events).toContain('caught');
    expect(events).toContain('popup');
    expect(events).not.toContain('wipeout');
    expect(rodeS).toBeGreaterThan(5);
    // The ride is in front of the crest (R3 §1): 5 s or more of riding with her wave's nearest station behind her. A section's
    // back does not count (onSection is true there too), and a wave still traced while she coasts behind it does not count.
    expect(heldS).toBeGreaterThan(5);
    // A real end: the wave's (foam, or on a drawn section at the last step) or the window's. A stall behind the wave is not.
    expect({ foam: last.foam, onSection: !!last.onSection, rodeS, real: last.foam > 0 || last.onSection === true || rodeS >= 15 }).toMatchObject({ real: true });
  });
});
```

  Update the describe's doc comment's last sentence: "then steers to hold a surfer's line, LINE_OFF_DEG off the swell
  toward the left, and is gated on riding in front of the crest." The old `herLive` goes; the `Station` import stays
  (it types `herStations`).

- [ ] **Step 3: Run it.** `npx vitest run src/ride/rideOnSections.test.ts --silent=false`. Record the four console lines
  (line, held, rode, end, ahead at popup / +1 / +2 / +3). Expected: some or all red on `heldS` or the real end. Green 4/4
  means the line was the whole problem: say so in the commit and skip Task 3 (Task 2 still runs: the table is R4's input).
- [ ] **Step 4: Commit, red or green.** `git add src/ride/rideLine.ts src/ride/rideOnSections.test.ts && git commit -m "test(ride): the ride test rides a surfer's line and is gated on being in front of the crest (R3 §1)"`
  with the four lines in the message and which assertions are red.

---

### Task 2: The table: line × pop delay

**Files:**
- Modify: `src/ride/takeoffProbe.test.ts`

**Interfaces:**
- Consumes: `aheadOf` and `LINE_OFF_DEG` from `src/ride/rideLine.ts` (Task 1).

- [ ] **Step 1: The dials.** After `const LEVELS …` add:

```ts
/** Lines off the swell heading (deg, toward the left) and pop-up rules ('slope' = the test's slope > 0.6, or seconds after caught, sim). */
const LINES = (process.env.PROBE_RIDE_LINE ?? String(LINE_OFF_DEG)).split(',').map(Number).filter((n) => Number.isFinite(n));
const POPS = (process.env.PROBE_RIDE_POP ?? 'slope').split(',').map((s) => (s === 'slope' ? 'slope' : Number(s))).filter((p) => p === 'slope' || Number.isFinite(p)) as ('slope' | number)[];
```

  Make the loop `for (const ft of SIZES) for (const experience of LEVELS) for (const lineOff of LINES) for (const pop of POPS)`,
  with `const line = swellHeading - lineOff;` and, in the loop, `caughtAt` recorded at the `caught` event
  (`if (ev === 'caught') caughtAt = t;`) and the pop-up rule:

```ts
      const popup = b.phase === 'paddle' && b.caught && !popped && (pop === 'slope' ? Math.hypot(under.slopeX, under.slopeZ) > 0.6 : t - caughtAt >= pop - 1e-9);
```

  (`caughtAt` declared `let caughtAt = Infinity;` with the other lets; `t - Infinity` is −Infinity, so a numeric pop
  never fires before the catch.) The header line of each block names `line` and `pop`.
- [ ] **Step 2: The columns.** Add **along** (`b.vx * w.dirX + b.vz * w.dirZ`, 1 decimal, printed right after `c`) and
  **held** (cumulative riding seconds with `ahead` > 0, after `n`), and a `behind` row: keep `let wasAhead = false;`
  and after the step, `const ahead = aheadOf(live, b.water, b.x, b.z); if (ahead !== undefined && ahead > 0) wasAhead = true; const behind = wasAhead && ahead !== undefined && ahead <= 0 && !saidBehind; if (behind) saidBehind = true;`
  and print a row whenever `behind` (event column `behind`), in addition to the existing row rule. Rows every 0.5 s for
  the first 4 s of riding: change the `rodeS - 1` / `rodeS - 3` check to `[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].some((s) => Math.abs(rodeS - s) < dt / 2)`.
  The `end:` line gains `held`.
- [ ] **Step 3: Run it in the background** while writing Task 4's logging:

```
$env:PROBE_RIDE_FT='6,8'; $env:PROBE_RIDE_LINE='30,45,88'; $env:PROBE_RIDE_POP='0,0.4,slope'; npx vitest run src/ride/takeoffProbe.test.ts --silent=false > <scratch>/r3-table-int.txt
```

  (`LEVELS` is all three; to keep it to intermediate + 6 ft beginner, gate with `PROBE_RIDE_LEVEL` the same way as the
  other dials, default all. Then run `6,8` × `intermediate` and `6` × `beginner`.) 27 runs; about an hour.
- [ ] **Step 4: Read it, three sentences in the scratchpad (spec §2):** (i) the line that holds `ahead` > 0 longest at
  each size, and whether 35 is right for the test; (ii) the pop delay's effect at the pop-up row: `up`, `along` vs `c`,
  slope; (iii) the `behind` row's signature: **face** (`sec` y, slope ≥ `catchSlope`, lift > 0, `along` < `c`), **top**
  (`up` ≥ 0.5, lift 0), or **sheet** (`sec` n). Name which one each case shows. This decides Task 3.
- [ ] **Step 5: Commit.** `git add src/ride/takeoffProbe.test.ts && git commit -m "probe(ride): line and pop-delay dials, along-travel speed beside c, the row she falls behind (R3 §2)"`
  with the three sentences in the message. The trimmed table (pop-up row, `behind` row or "stayed", end) goes in the
  handover.

---

### Task 3: The face carries her riding (only on the **face** signature)

**Files:**
- Modify: `src/ride/ridePhysics.ts` (the `if (carried)` push block, :255-266, and the `CREST_CARRY` doc comment)
- Test: `src/ride/ridePhysics.test.ts` (a new describe)

**Interfaces:**
- Produces: `export function faceCarrying(b: RideBody, tune: RideTuning): boolean`.

If Task 2's (iii) is **top** or **sheet** for every red case, skip to Step 7 (write-up only).

- [ ] **Step 1: Write the failing tests** (a new describe after "the crest carries her (R1.5 §1)"; `slope`, `run`, `DT`
  exist at the top of the file):

```ts
describe('the face carries her riding (R3 §3)', () => {
  const shoreHeading = 90, idle: RideControls = { paddle: false, steer: 0, crouch: 0, popup: false };
  /** A 0.5 face running +x at c, flagged as the drawn section (sectionWater.withSections sets onSection where a section is the surface). */
  const face = (c: number, onSection: boolean | undefined = true): WaterFn => (x) => ({ y: -0.5 * x, slopeX: -0.5, slopeZ: 0, foam: 0, ux: 0, uz: 0, c, dirX: 1, dirZ: 0, onSection });
  const riding = (w: WaterFn, headingDeg: number, vx: number, vz = 0): RideBody => {
    const b = startBody(0, 0, headingDeg, w);
    b.phase = 'ride'; b.phaseT = 1; b.vx = vx; b.vz = vz;
    return b;
  };
  it('riding the drawn face slower than the crest along its travel, she is pushed up to CREST_CARRY × c', () => {
    const w = face(10), b = riding(w, shoreHeading, 0.5 * 10);
    run(b, idle, () => w, 0.3);
    // Gravity on the 0.5 face alone (~3.9 m/s²) would add ~1.2 m/s; the push takes her most of the way to 8.5 in 2 τ.
    expect(b.vx).toBeGreaterThan(0.5 * 10 + 2);
  });
  it('the same slope on the sheet (no section under her) is not a face: gravity and drag only', () => {
    const w = face(10, undefined), b = riding(w, shoreHeading, 0.5 * 10);
    run(b, idle, () => w, 0.3);
    expect(b.vx).toBeLessThan(0.5 * 10 + 1.5);
  });
  it('not lifted (nose up the face, heading seaward over the back), it is off: she can go over the back', () => {
    // liftAt is 0 only with the nose pointing uphill (downhill ≤ −0.02): along the crest it still reads ~0.1.
    const w = face(10), b = riding(w, 270, 0.5 * 10); // nose −x, up the face; 5 m/s shoreward along the travel
    expect(liftAt(w(0, 0), 270)).toBe(0);
    run(b, idle, () => w, 0.3);
    expect(b.vx).toBeLessThan(0.5 * 10 + 1.5); // gravity down the face only (~1.2 m/s in 0.3 s); the push would have added ~3
  });
  it('already faster than CREST_CARRY × c along the travel, it adds nothing', () => {
    const w = face(10), b = riding(w, shoreHeading, 0.95 * 10);
    run(b, idle, () => w, 0.3);
    expect(b.vx).toBeLessThan(0.95 * 10 + 1.5); // gravity only; two-way it would have pulled her toward 8.5
    expect(b.vx).toBeGreaterThan(0.95 * 10);
  });
  it("the ride's drag is still against the sheet's water: her speed along the line on the drawn face decays by PLANE_DRAG alone", () => {
    const w = face(10), b = riding(w, shoreHeading, CREST_CARRY * 10, -4);
    b.headingDeg = Math.atan2(b.vx, -b.vz) / (Math.PI / 180); // nose along her velocity: no side slip
    run(b, idle, () => w, 0.3);
    // PLANE_DRAG (lin 0.03/s, quad 0.012) takes ~4 % of her run in 0.3 s; gravity's shoreward pull rotates her velocity off
    // the fixed nose a little and the rail grips that. ~12 % margin. (The R2 pop-up-line test lost 45 % to the carried drag.)
    expect(Math.abs(b.vz)).toBeGreaterThan(3.5);
  });
});
```

  Add `liftAt` and `RideControls`/`RideBody`/`WaterFn` to the imports if not already there.
- [ ] **Step 2: Run them.** `npx vitest run src/ride/ridePhysics.test.ts` → the first case FAILS (vx ≈ 6.2), the other
  four PASS already (they pin what must not change). If the "drag against the sheet" case fails now, stop: something
  else is wrong; report.
- [ ] **Step 3: Implement.** In `ridePhysics.ts`, after `carrying()`:

```ts
/**
 * Whether the drawn face is carrying her riding (R3 §3): standing on a section (sectionWater.withSections: the drawn
 * wave, not the sheet), on a face at least the catch slope, lifted by it. The same water the catch rides (CREST_CARRY):
 * near the crest it runs with the wave, and a board slower than it along the travel is pushed up to it. One-way, so a
 * bottom turn or a cutback loses nothing to it; at the top (not lifted) or on the sheet it is off, so going over the back
 * is still possible. It gates the push only: the ride's drag stays against the sheet's water (Andrew 2026-10-04).
 */
export function faceCarrying(b: RideBody, tune: RideTuning): boolean {
  if (b.phase !== 'ride' || b.water.onSection !== true) return false;
  const w = b.water;
  return Math.hypot(w.slopeX, w.slopeZ) >= tune.catchSlope && liftAt(w, b.headingDeg) > 0;
}
```

  and change the push block's condition from `if (carried)` to `if (carried || faceCarrying(b, tune))`, with one more
  comment line: `// Riding the drawn face (faceCarrying, R3 §3), the same push: her along-the-line speed is the drag's business.`
  `vc` is already computed above the drag block. Update the `CREST_CARRY` doc comment: after "…through the pop-up", add
  "and, riding, on the drawn face (faceCarrying, R3 §3)".
- [ ] **Step 4: Run** `ridePhysics.test.ts`: all green including the six R1.5 cases and the two R2 cases.
- [ ] **Step 5: The ride test.** `npx vitest run src/ride/rideOnSections.test.ts --silent=false`. Target 4/4 with
  `heldS` > 5 and a real end. Record the four lines. A red case keeps its Task 2 row in the commit message; no value
  search (`CREST_CARRY`, `CARRY_TAU_S` are not dials here).
- [ ] **Step 6: Review Focus 4.** Add to the ride test's loop a running `maxSpeed = Math.max(maxSpeed, speedOf(b))` and
  `maxSlope` from `b.water`, printed in the console line. 12 ft: speed < 18, slope < 2.5. Record in the commit.
- [ ] **Step 7: Commit.** `git add src/ride && git commit -m "feat(ride): the drawn face carries her riding: the one-way push applies on a section she is lifted by, the drag unchanged (R3 §3)"`
  with the four ride-test lines before/after and the 12 ft numbers. If Task 3 was skipped: a docs-only commit is not
  needed; the handover carries the (iii) finding and the test's steer note.

---

### Task 4: The in-tube bails, named

**Files:**
- Modify: `tools/_takeoffLive.mjs` (the per-row log and the bail trace)

- [ ] **Step 1: Log more per row.** In the loop, import nothing (the page has `window.liquidDreams`): extend `near` and
  the row. Replace the `near` loop and the `log.push` with:

```js
      let near = null;
      for (const s of a.ribbonStations) { if (s.gap) continue; const dx = (b.water.lx ?? b.x) - s.x, dz = (b.water.lz ?? b.z) - s.z, al = Math.abs(-dx * s.nz + dz * s.nx); if (!near || al < near.al) near = { al, ah: dx * s.nx + dz * s.nz, tb: s.tb, until: s.until, H: s.H, psi: s.psi, A: s.section.A, settle: window.__settle(s.H) }; }
      const w = b.water, steep = Math.hypot(w.slopeX, w.slopeZ);
      log.push({ real: +real.toFixed(2), sim: +sim.toFixed(2), scale: +(a.clock.scale ?? 1).toFixed(2), phase: b.phase, caught: b.caught, y: +b.y.toFixed(2), cam: [+(cam.x - b.x).toFixed(1), +(cam.y - b.y).toFixed(1), +(cam.z - b.z).toFixed(1)], take, cover: +a.rideCover.toFixed(2), pov: +pov.toFixed(2), lens: +a.tubeLensWet.toFixed(2), foam: +w.foam.toFixed(2), steep: +steep.toFixed(2), sec: !!w.onSection, near: near && { al: +near.al.toFixed(1), ah: +near.ah.toFixed(1), tb: near.tb === null ? null : +near.tb.toFixed(2), until: near.until === null ? null : +near.until.toFixed(2), H: +near.H.toFixed(1), psi: +near.psi.toFixed(3), A: +near.A.toFixed(2), settle: +near.settle.toFixed(2) }, head: Math.round(b.headingDeg), v: +Math.hypot(b.vx, b.vz).toFixed(1) });
```

  `window.__settle` is set once before the loop by an `await import('/src/breaker/breaking.ts')` in the same
  `executeJavaScript` as the field wait (make that block `async`, as `captureRide.mjs` does):
  `const B = await import('/src/breaker/breaking.ts'); window.__settle = (H) => B.settleSpan(H, a.breakParams);`.
  (If `a.breakParams` is not exposed on `window.liquidDreams`, `captureRide.mjs` reads it, so it is; check the name there.)
  When `b.phase === 'bail'` first appears, push into `snaps` `'bail' + sim.toFixed(1)` so a frame is saved.
- [ ] **Step 2: Three runs** against 5173 (output `C:\Dev\andrew-dev-personal-projects\liquid-dreams-captures\r3-<date>\`):

```
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/bail6/ --ft=6 --aim=30 --until=20
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/bail7/ --ft=7 --aim=30 --until=20
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/bail8/ --ft=8 --aim=30 --until=20 --pop=0
```

  (These are Task 5's intermediate runs too; if Task 3 landed first, they double as evidence. If not, run them now and
  again in Task 5.)
- [ ] **Step 3: Name each bail** from its last three rows, by the spec's rule: **closeout** (`near.tb` ≥ `near.settle`,
  or `foam` > 0.5 with `sec` true), **thrown on the sheet** (`sec` false, `steep` > 2.5, `tb` < `settle`), or
  **other** (write the rows). Three lines in the scratchpad for the handover. No code change unless all three are
  "thrown on the sheet" by the same cause and it is one rule in `sectionWater.ts`; then write the trace, one test, one
  change, in a separate commit, with the R2 §4 cap constraints.
- [ ] **Step 4: Commit.** `git add tools/_takeoffLive.mjs && git commit -m "tools(ride): the live bot logs foam, steepness, the section under her and the station's settle span, and snaps the bail (R3 §4)"`
  with the three named bails in the message.

---

### Task 5: Evidence, suite, handovers, push

**Files:**
- Create: `docs/superpowers/handover/<date>-r3-opus.md`, `docs/superpowers/handover/<date>-r3-fable.md`

- [ ] **Step 1: Live runs** (after Task 3, or now if Task 3 was skipped), against 5173, output `<dir>` as Task 4:

```
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live6/  --ft=6 --aim=30 --until=20
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live7/  --ft=7 --aim=30 --until=20
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live8/  --ft=8 --aim=30 --until=20
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live6b/ --ft=6 --aim=30 --until=20 --experience=beginner
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live8pop0/  --ft=8 --aim=30 --until=20 --pop=0
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live6bpop0/ --ft=6 --aim=30 --until=20 --experience=beginner --pop=0
```

  Expected in each `log.json`: `ah` > 0 on every `ride` row from the pop-up to the end (no "left behind": no `paddle`
  row after `ride` with `ah` < −10); the end a named closeout (Task 4's rule) or the window. For each run: ride seconds,
  max speed, the end and its name, and whether `ah` ever went ≤ 0 while riding (the row).
- [ ] **Step 2: Frames.** Per run the best frame and the worst, two lines each, as R2. Look at the beginner's +1 s
  frame and the 8 ft 0.4-s-pop +1.4 s frame first: those are R2's two failures.
- [ ] **Step 3: The suite** on a quiet machine: `npx vitest run 2>&1 | tail -5`; diff the failing names against Task 0.
  Only `rideOnSections` names may change (they go red in Task 1 and green in Task 3, or stay red with their rows).
  Nothing new. Re-run timeouts alone before judging.
- [ ] **Step 4: Handovers.**
  - `<date>-r3-opus.md`: the commits; Task 1's four lines before and after; Task 2's trimmed table and the three
    sentences; Task 3's diff and the 12 ft numbers (or why it was skipped); Task 4's three named bails with their rows;
    Task 5's runs (table: run, ride s, max v, end + name, `ah` ≤ 0 while riding?); frames; suite diff; open items; commands.
  - `<date>-r3-fable.md`: what decides staying on (line vs pop delay, from the table, in two sentences); whether the
    face carry was needed and what it did to the 12 ft ride; whether any ride still falls off the back and when; the
    in-tube bails: closeouts or throws; your view of R4's first question (the pop-up's hint and timing for the player,
    one body, the camera, or feel).
- [ ] **Step 5: Commit and push.** `git add docs/superpowers/handover && git commit -m "docs(handover): R3 for Opus and for Fable" && git push -u origin r3-staying-on`.
  Tell Andrew: the branch, the two handover paths, and the one frame to look at first (the 8 ft 0.4-s-pop run at +1.4 s,
  R2's `live8/8-ride1.4.png` retaken).
