# R1.5, the crest carries her: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A take-off she makes: once the face stands up under her, the crest's water carries her to nearly its speed, so
she drops down the face instead of being lifted over the back, and the live run rides the first section at 6, 7 and 8 ft.

**Architecture:** One addition to `stepRide`'s paddle/pop-up physics (a relaxation of her velocity toward `CREST_CARRY × c`
along the wave's travel while the face under her is at least the catch slope), gated so the ride after pop-up, the
water model and the wave are untouched. Then the R1 evidence list re-run and the handovers.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU/TSL, vitest 5, Electron capture tools under `tools/`.

**Spec:** `docs/superpowers/specs/2026-10-06-r1-5-crest-carry-design.md` (read it first; the plan argues from it).

**Written by:** Fable (orchestrator), 2026-10-06, for Opus (executor). Work on branch `r1-the-ride` (checked out, pushed,
not merged); push at the end; do not merge without Andrew's say-so.

## Global Constraints

- No change under `src/breaker`, `src/seabed`, `src/ocean`, nor to `flowFromEta`; no change to `PLANE_DRAG`, `RAIL_KEEP`,
  `STALL_*`, `WIPEOUT_*`, `POPUP_S`, or `ridePose.ts`.
- The carry is not in `RideTuning`: the same for beginner, intermediate and expert.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx tsc --noEmit` clean at every commit. Scratch probes in the session scratchpad or `tools/_*.mjs`, never `src/_scratch`.
- Targets are acceptance, not dials: `CREST_CARRY` 0.85 and `CARRY_TAU_S` 0.15 are tried once; if the ride test is still
  under 5 s, Task 1 Step 6 says what to record, and you stop there rather than searching the dials.

## Review Focus

1. She turns while caught (steer held during paddle): the carry is along the wave's travel, not her heading, so a
   board angled along the line is still carried shoreward and then runs along the line from the rail. (Task 1: "carried
   along the wave's travel whatever her heading".)
2. A 12 ft day: c at the spot is 10.8 m/s; 0.85 c is 9.2, under `MAX_SPEED` 18, and the ride test at 12 ft must still
   not wipe out on the lip's slope. (Task 1: the 12 ft ride case, kept.)
3. She is caught and never pops up: the wave passes, lift falls to 0, the carry stops and `caught` clears; she is left
   prone on the back at a few m/s, not propelled across the flat. (Task 1: "the carry stops when the face has passed".)
4. The speed-rule catch on a soft day (0.2 face, 0.5 c) is not carried. (Task 1: "a speed-rule catch is not carried".)
5. The bot pops up the same frame it is caught (`captureRide.mjs`): the carry must act through the pop-up phase or the
   bot never gets it. (Task 1: "carried through the pop-up".)

---

### Task 0: Merge main, baseline

**Files:** none edited by hand.

- [ ] **Step 1: Merge.** On `r1-the-ride`: `git merge main` (brings 6d14a35, the async-pipeline prewarm; expected a clean
  merge: it touches `src/render`, `src/app/loadingScreen.ts` and the ocean/sky/weather pipeline files, none of which R1 changed
  except `App.ts`, in different regions). If there is a conflict in `App.ts`, keep both sides: R1's `rideArriveS` /
  `experience()` / `catchSetWave` and main's prewarm calls.
- [ ] **Step 2: Typecheck and the ride suite.** `npx tsc --noEmit` clean; `npx vitest run src/ride` → 4 failed
  (rideOnSections ×4, by ride length 1.1–2.8 s), everything else passing. If anything else fails, stop and report.
- [ ] **Step 3: Baseline the suite.** `npx vitest run 2>&1 | tail -5`. Expected about 43 failed / 1828 passed / 17 skipped
  (the R1 handover's lists plus whatever 6d14a35 brings). Keep the failing names (`grep FAIL`) in the scratchpad for Task 3.

---

### Task 1: The crest carries her

**Files:**
- Modify: `src/ride/ridePhysics.ts` (constants near `CATCH_HOLD_S` :87-88; the drag block :212-233; the paddle case :287-300)
- Test: `src/ride/ridePhysics.test.ts` (extend, after the "late drop" describe), `src/ride/rideOnSections.test.ts` (unchanged; must go green)

**Interfaces:**
- Produces in `ridePhysics.ts`: `export const CREST_CARRY = 0.85; export const CARRY_TAU_S = 0.15;` and
  `export function carrying(b: RideBody, tune: RideTuning): boolean` (true while the carry acts). `stepRide`'s signature
  is unchanged.

- [ ] **Step 1: Write the failing tests** (append to `ridePhysics.test.ts`; `slope`, `run`, `DT`, `TUNING` are already in the file).

```ts
describe('the crest carries her (R1.5 §1)', () => {
  const shoreHeading = 90, idle: RideControls = { paddle: false, steer: 0, crouch: 0, popup: false };
  it('caught on a 0.5 face, a still prone board reaches 0.75 × CREST_CARRY × c within 0.5 s', () => {
    const w = slope(0.5, 0, 9), b = startBody(0, 0, shoreHeading, w);
    run(b, idle, () => w, CATCH_HOLD_S + 0.5);
    expect(b.caught).toBe(true);
    expect(b.vx).toBeGreaterThanOrEqual(0.75 * CREST_CARRY * 9);
    expect(b.vx).toBeLessThanOrEqual(CREST_CARRY * 9 + 1); // gravity on the face adds a little over the carry
  });
  it('carried along the wave\'s travel whatever her heading', () => {
    const w = slope(0.5, 0, 9), b = startBody(0, 0, shoreHeading + 40, w);
    run(b, idle, () => w, CATCH_HOLD_S + 0.5);
    expect(b.caught).toBe(true);
    expect(b.vx).toBeGreaterThanOrEqual(0.75 * CREST_CARRY * 9);
    expect(Math.abs(b.vz)).toBeLessThan(0.3 * b.vx);
  });
  it('carried through the pop-up: popping the frame she is caught still gets her to speed', () => {
    const w = slope(0.5, 0, 9), b = startBody(0, 0, shoreHeading, w);
    run(b, (_t, bb) => ({ ...idle, popup: bb.caught }), () => w, CATCH_HOLD_S + 0.5);
    expect(b.phase === 'popup' || b.phase === 'ride').toBe(true);
    expect(b.vx).toBeGreaterThanOrEqual(0.75 * CREST_CARRY * 9);
  });
  it('a face the expert tuning does not catch (0.3) does not carry', () => {
    const w = slope(0.3, 0, 9), b = startBody(0, 0, shoreHeading, w);
    for (let i = 0; i < 60; i++) stepRide(b, idle, w, DT, TUNING.expert);
    expect(b.caught).toBe(false);
    expect(b.vx).toBeLessThan(0.5 * CREST_CARRY * 9); // gravity alone over 1 s on 0.3: ~2.5 m/s
  });
  it('a speed-rule catch on a soft 0.2 face is not carried', () => {
    const w = slope(0.2, 0, 8), b = startBody(0, 0, shoreHeading, w);
    b.vx = 4; // 0.5 c
    run(b, { ...idle, paddle: true }, () => w, 0.5);
    expect(b.caught).toBe(true);
    // paddling with the assist on a 0.2 face settles near 4 m/s against the prone drag; carried she would be near 6.8
    expect(b.vx).toBeLessThan(CREST_CARRY * 8 - 1.5);
  });
  it('the carry stops when the face has passed (lift 0): she is left prone on the back', () => {
    const face = slope(0.5, 0, 9), back = flatWater(0), b = startBody(0, 0, shoreHeading, face);
    run(b, idle, () => face, CATCH_HOLD_S + 0.3);
    const vAtCrest = b.vx;
    expect(vAtCrest).toBeGreaterThan(4);
    run(b, idle, () => back, 1);
    expect(b.caught).toBe(false);
    expect(b.vx).toBeLessThan(vAtCrest); // drag, no carry
  });
});
```

  Add `CATCH_HOLD_S`, `CREST_CARRY` to the import from `./ridePhysics` at the top of the file.

- [ ] **Step 2: Run them.** `npx vitest run src/ride/ridePhysics.test.ts`. Expected: FAIL (`CREST_CARRY` undefined).
- [ ] **Step 3: Implement.** In `ridePhysics.ts`, after `CATCH_HOLD_S`:

```ts
/**
 * The crest carries her (R1.5 §1): a crest about to break runs its water at nearly its own speed c (the breaking
 * criterion), and a surfer caught at the crest is in that water. The ride's water model is linear theory (flowFromEta:
 * about a third of c at the take-off spot) and its drag is tuned against still water, so the carry is applied to her
 * here, while she is caught and prone and through the pop-up, as long as the face under her is at least the catch
 * slope and lifting her. Her velocity relaxes toward CREST_CARRY × c along the wave's travel with time constant
 * CARRY_TAU_S. 0.85: c at the spot is 8.9 m/s at 6 ft and the crest slows to ~6.1 m/s by the onset, so 7.6 m/s keeps her
 * ahead of it into the break. 0.15 s: the face is under her for about 0.3 s, and 0.15 reaches 86 % of the way in that.
 * Without it she reached 3–5 m/s and was lifted over the back (R1's ride test: 1.1–2.8 s at every Experience level).
 */
export const CREST_CARRY = 0.85;
export const CARRY_TAU_S = 0.15;

/** Whether the crest's water is carrying her this step: caught (or popping up) on a face at least the catch slope, lifting her. */
export function carrying(b: RideBody, tune: RideTuning): boolean {
  if (!(b.phase === 'popup' || (b.phase === 'paddle' && b.caught && b.catchT > 0))) return false;
  const w = b.water;
  return Math.hypot(w.slopeX, w.slopeZ) >= tune.catchSlope && liftAt(w, b.headingDeg) > 0;
}
```

  `carrying` must sit after `liftAt` in the file (it is a function declaration, so order does not matter for the
  runtime, but keep the read order). In `stepRide`, the drag block today starts

```ts
  const ux = w.ux, uz = w.uz;
  const relX = b.vx - ux, relZ = b.vz - uz;
```

  The carry is the water she is in, so the drag is taken against it too (otherwise the prone drag, 0.6 v + 0.3 v²
  against still water, fights the relaxation and holds her near 0.7 c). Change those two lines to

```ts
  // Carried (R1.5 §1), the water she is in is the crest's, running at CREST_CARRY × c: the drag is against that.
  const carried = carrying(b, tune), vc = CREST_CARRY * w.c;
  const ux = carried ? w.dirX * vc : w.ux, uz = carried ? w.dirZ * vc : w.uz;
  const relX = b.vx - ux, relZ = b.vz - uz;
```

  and after the drag block ends (`b.vz = uz + fz * along + rz * side;` and the `bail` shove), before `const sp = speedOf(b);`:

```ts
  if (carried) {
    // ... and it takes her with it, over CARRY_TAU_S (the prone drag alone couples too slowly at small relative speeds).
    const k = 1 - Math.exp(-dt / CARRY_TAU_S);
    b.vx += (ux - b.vx) * k;
    b.vz += (uz - b.vz) * k;
  }
```

  Also extend the existing comment above the drag ("Against the water itself, not the wave …") with one sentence: "Except
  while the crest carries her (carrying): then the water is the crest's, see CREST_CARRY."

  `b.catchT > 0` in `carrying` is what separates the slope catch from the speed-rule catch: the paddle case sets
  `catchT` to 0 whenever the face is under the catch slope, and the speed rule can set `caught` with `catchT` 0.
  `w` here is `b.water` from the start of the step (the same the forces used), which is what `carrying` reads.
  Expected equilibrium on a 0.5 face at c 9: the relaxation holds her at 0.85 c plus what gravity adds against it
  (about 0.6 m/s), so 7.6–8.3 m/s.

- [ ] **Step 4: Run them.** `npx vitest run src/ride/ridePhysics.test.ts`. Expected: PASS, all cases including the old
  "late drop" describe. If "a speed-rule catch … is not carried" fails because `catchT` is > 0 on the 0.2 face at the
  intermediate slope 0.35: it cannot be (0.2 < 0.35); check the gate.
- [ ] **Step 5: The ride test.** `npx vitest run src/ride/rideOnSections.test.ts` (up to 5 min). Expected: 4 passed
  (6 ft beginner / intermediate / expert and 12 ft intermediate: caught, popup, no wipeout, ridden > 5 s).
- [ ] **Step 6: If a case is still under 5 s**, do not change `CREST_CARRY` or `CARRY_TAU_S`. Instrument that case once
  (a `console.log` inside the test loop, removed before the commit) printing every 0.1 s from the catch: `t − arrive`,
  `phase`, `speedOf(b)`, `Math.hypot(under.slopeX, under.slopeZ)`, `liftAt(under, b.headingDeg)`, `under.c`,
  `b.y − under.y`, and the event. Paste those rows into the commit message under "R1.5 MISS", and say in one line which
  of these it is: (i) carried to ≥ 0.75 c but still over the back (then the face is shorter than 0.3 s even at c and
  the spot must move: handover), (ii) carried but wiped out on the lip (`steep > WIPEOUT_SLOPE`: handover, the lip's
  slope at the pop-up spot), (iii) stalled after the drop (`speed < STALL_SPEED` for 0.6 s: handover, the ride's run
  along the line). Leave the case failing. Go on to Task 2 regardless, the frames are evidence either way.
- [ ] **Step 7: Typecheck and commit.**

```bash
npx tsc --noEmit && git add src/ride/ridePhysics.ts src/ride/ridePhysics.test.ts
git commit -m "feat(ride): the crest's water carries her once caught, through the pop-up, so the drop is made (R1.5 §1)"
```

  Paste into the message: the ridePhysics cases' names, the four ride-test times (seconds ridden) before and after,
  tsc.

---

### Task 2: Evidence on Andrew's PC

**Files:**
- Modify: `tools/captureRide.mjs:51` (pass the tuning)

- [ ] **Step 1: The bot's tuning.** In `tools/captureRide.mjs` the bot's step is
  `P.stepRide(b, {...}, a.rideWater(t), 1 / 60)`; make it `P.stepRide(b, {...}, a.rideWater(t), 1 / 60, P.TUNING.intermediate)`.
  `P` is the ride physics module the page exposes (check the `window.__bot` setup at :39 for where `P` comes from; if it
  is `a.ride`'s module import, `TUNING` is exported from the same module as `stepRide`). Run the capture once to see it
  still steps.
- [ ] **Step 2: Bot rides.** Dev server on 5173. Output directory `C:\Dev\andrew-dev-personal-projects\liquid-dreams-captures\r1-5-2026-10-0X\`
  (outside the repo; the day's date).

```
npx electron tools/captureRide.mjs --base=http://localhost:5173/ --out=<dir>/r15-6ft- --at=-6,-4,-3,-2,-1,0,1,3,6 --cond="{\"swell\":{\"sizeFt\":6,\"periodS\":15,\"directionDeg\":225},\"tideM\":0}"
npx electron tools/captureRide.mjs --base=http://localhost:5173/ --out=<dir>/r15-8ft- --at=-6,-4,-3,-2,-1,0,1,3,6 --cond="{\"swell\":{\"sizeFt\":8,\"periodS\":15,\"directionDeg\":225},\"tideM\":0}"
```

  Expected in each log: `caught` then `popup` before the peak, `phase` `ride` from pop-up through +6 s, `v` 7–14 while
  riding, no `wipeout`, no `kickout` before +6. In the frames at caught, pop-up, +1, +3: she is on the face, the wall in
  frame, moving along the line (x, z changing along the ledge, not shoreward only).
- [ ] **Step 3: Live keyed runs.** Three, intermediate:

```
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live6/ --ft=6 --aim=30
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live7/ --ft=7 --aim=30
npx electron tools/_takeoffLive.mjs --base=http://localhost:5173/ --out=<dir>/live8/ --ft=8 --aim=30
```

  Expected in `log.json`: `caught`, `popup` 0.4 s real later, `phase` `ride` for ≥ 5 s before any `kickout`/`wipeout`;
  `v` rising past 6 m/s within 0.5 s of the catch. Frame `2-caught.png` shows her and the wall (the R1 review's
  sight-line lift; if it is still all water, note it as open: camera, not physics). Frames `3-turn`, `4-ride-1.5`,
  `5-ride-0.5` show her on the face along the line.
- [ ] **Step 4: Look at the frames yourself** before writing anything: name, for each size, the frame that best shows the
  drop and the one that shows the worst problem. Those two lines per size go in the handover.
- [ ] **Step 5: Commit the tool change.**

```bash
git add tools/captureRide.mjs && git commit -m "tools(ride): the capture bot steps with the intermediate tuning explicitly (R1.5 §3)"
```

---

### Task 3: Suite, handovers, push

- [ ] **Step 1: The suite.** `npx vitest run 2>&1 | tail -5` and the failing names. Diff against Task 0 Step 3: the only
  change expected is rideOnSections ×4 leaving the list. Anything newly failing is a regression: fix it before going on.
  `npx tsc --noEmit` clean.
- [ ] **Step 2: The handovers.** Two files in `docs/superpowers/handover/`, dated the day written:
  - `<date>-r1-5-opus.md`: the merge commit, Task 1's commit and the ride-test times; the suite summary and the failing
    list's diff; the capture paths; the two frame lines per size from Task 2 Step 4; what is open; the exact commands.
  - `<date>-r1-5-fable.md`: the carry's behaviour as measured (speed at the catch, 0.3 s later, at pop-up, for 6, 7, 8 ft
    live), anything that surprised you, whether the drop *looks* like a drop (her height above the trough at pop-up and
    1 s later), and the first question R2 should answer.
- [ ] **Step 3: Commit and push.**

```bash
git add docs/superpowers/handover && git commit -m "docs(handover): R1.5 for Opus and for Fable" && git push
```

  Tell Andrew: the branch, the two handover paths, and the one frame to look at first (the live 7 ft frame at +1.5 s of
  riding).
