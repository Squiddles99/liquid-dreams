# Womb Profile, Step 1: the Shape Rule in the Game's Code

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Andrew's approved side-on profile family exists as one TypeScript module in `src/breaker`, with a sixth stage (collapse) drafted. His drawings are regenerated from that module and nothing else. A test pins the approved shapes so they cannot drift. Nothing in the game changes yet (spec §7 step 1).

**Architecture:** `src/breaker/wombProfile.ts` has no imports and is pure. It holds the keyframe point sets (units of H, crest base at u = 0, u toward the beach) and `profileKnots(phase, hollow)`, which moves between keyframes with a smoothstep. Each keyframe has two point sets, the most hollow and the least hollow ("open"); hollowness blends between them. That keeps every in-between shape well formed, and at phase 1 it reproduces the mockup's approved hollow 0, 0.5 and 1 exactly. It also has `profileCurve(phase, hollow, n)`, a centripetal Catmull–Rom through the knots resampled to n points evenly by arc length (the fixed sample count the ribbon mesh will need in step 3). `tools/drawWombProfiles.ts` loads the module through vite's `runnerImport`, as `tools/bakeBreakMap.ts` does, and writes the drawings page. The approved shapes are frozen in `src/breaker/wombProfile.approved.json` and checked by vitest.

**Tech Stack:** TypeScript, vitest, vite `runnerImport` for the tool. No GPU.

**Spec:** `docs/superpowers/specs/2026-10-05-womb-profile-design.md`

## Global Constraints

- Drawings use viewpoint A: beach on the right, the lip throwing left to right. Shapes are drawn at equal horizontal and vertical scale.
- Phase runs from 0 to 2:
  - 0 swell
  - 0.25 standing up
  - 0.5 lip pitching
  - 0.75 throwing
  - 1 round barrel (approved 2026-10-05)
  - 1.5 caving in
  - 2 white-water wall (drafts until Andrew signs them)
- Hollow runs from 0 to 1. Either input outside its range is clamped.
- At phase ≤ 1 the keyframes and the hollowness rule are exactly the approved mockup's (`profiles.py`, 2026-10-05): the regenerated pictures must match the ones Andrew approved.
- `wombProfile.ts` imports nothing, so steps 3–4 can mirror it in TSL line for line.
- Commit and push only on Andrew's word. Never merge.
- Code style: match the surrounding comments (prose, Andrew's words quoted with dates), names and idioms.

## As built (2026-10-05)

- The lip's end is rounded: the tip knot becomes three, the point pulled in. The approved drawings had a pointed tip, so Andrew needs to look at this.
- Samples are spread by length plus 0.15 H per radian of turning, so the lip's end and the tube get more of them than the straight back.
- The collapse adds a key at 1.25 (tube filling). At 1.5 and 2 the tube's cavity is the 1.25 cavity shrunk to 1% of its size and turned 30°. The mesh keeps its samples, so the cavity can't vanish; shrinking it whole closes it without the curve ever folding through itself.

## Review Focus

- The curve never crosses itself anywhere in (phase, hollow), including the collapse drafts.
- The lip leaves from the crest: from phase 0.5 on, the tube's ceiling stays high (the "tears out of the face" bug must be impossible by construction).
- Arc-length resampling keeps the tip's samples dense enough for a thick, round tip on the mesh. Check the spacing at the tip against the spacing on the back.

---

### Task 1: The shape rule

**Files:**
- Create: `src/breaker/wombProfile.ts`
- Test: `src/breaker/wombProfile.test.ts`

**Interfaces:**
- Produces: `type P2 = readonly [number, number]`; `KNOTS = 14`; `PROFILE_KEYS: readonly { phase: number; points: readonly P2[] }[]`; `STAGES` (named phases); `profileKnots(phase: number, hollow: number): P2[]`; `profileCurve(phase: number, hollow: number, n?: number): P2[]` (default n = `CURVE_SAMPLES` = 160).

- [x] **Step 1: Write the failing tests** (`wombProfile.test.ts`):
  - ends: the first and last knots are at y = 0, u = ∓7, for every phase and hollow;
  - keyframes: `profileKnots(k.phase, 1)` equals `k.points` exactly for every key;
  - no self-crossing: `profileCurve` over phase 0..2 step 0.02 × hollow 0..1 step 0.1 has no two non-adjacent segments intersecting;
  - continuity: between phase p and p + 0.01, no sample moves more than 0.05 (units of H), for all p and hollow ∈ {0, 0.5, 1};
  - the lip pitches from the crest: for phase ∈ [0.5, 1] and any hollow, the tube's ceiling (knots 7–8) stays above 0.5 × the crest's height (knot 3);
  - the target: at phase 1, hollow 1, the barrel floor (knot 10) and the trough (knot 11) are below sea level. The cavity (curve samples between the tip and the floor) is round, its width/height between 0.7 and 1.4;
  - resampling: neighbouring samples of `profileCurve(·, ·, 160)` are spaced within ±25% of the mean spacing.
- [x] **Step 2: Run** `npx vitest run src/breaker/wombProfile.test.ts`. Expect it to fail (no module).
- [x] **Step 3: Implement** `wombProfile.ts`:
  - port `KEYS`, `LIP`, `DIP`, `smooth`, `station` and `catmull` from `docs/superpowers/specs/2026-10-05-womb-profile-mockup/profiles.py`, unchanged for phase ≤ 1;
  - add the two collapse keys:
    - 1.5, caving in: the lip landed, the tube filled, a rounded hump with a steep front;
    - 2, white-water wall: about 0.5 H, the front rounded and steep, the back long and low;

    Collapse keeps 14 knots: the tube's knots fold onto the front. Hollowness at phase > 1 scales the remaining hump's height (a thicker wave stays taller);
  - add `profileCurve`: sample the Catmull–Rom densely (24 per span), then resample to n points evenly by arc length.
- [x] **Step 4: Run** the test file. Expect it to pass. Then run `npx vitest run src/breaker` and `npm run typecheck`. Expect both green.

### Task 2: Freezing the approved shapes

**Files:**
- Create: `src/breaker/wombProfile.approved.json`
- Modify: `src/breaker/wombProfile.test.ts`

- [x] **Step 1:** Write the fixture from the module, `{ approved: "2026-10-05", n: 160, shapes: [{ phase, hollow, curve }] }`, holding the eight shapes Andrew saw:
  - phases 0, 0.25, 0.5, 0.75 and 1 at hollow 1;
  - hollows 0 and 0.5 at phase 1.

  The collapse is not in it until he signs.
- [x] **Step 2:** Add the drift test. Every fixture shape equals `profileCurve(phase, hollow, 160)` within 1e-4 H per sample.
- [x] **Step 3: Run** the test. Expect it to pass. Then break a keyframe value by 0.01 and check that the test fails, and restore it.

### Task 3: The drawings from the game's code

**Files:**
- Create: `tools/drawWombProfiles.ts`
- Replace: `docs/superpowers/specs/2026-10-05-womb-profile-mockup/profiles.html` (regenerated)
- Delete: `docs/superpowers/specs/2026-10-05-womb-profile-mockup/profiles.py` (superseded; the module is now the source)

- [x] **Step 1:** Port the page (same layout, CSS, plan view and A/B panels) from `profiles.py`. Draw every curve with `profileCurve` loaded through `runnerImport('/src/breaker/wombProfile.ts')`. Add a row for the collapse (phases 1.25, 1.5, 1.75, 2) marked "draft, for your judgement". Add a strip of four at phase 1, hollow 1, at 4, 8 and 12 ft, drawn to one scale, to show that height only scales the shape.
- [x] **Step 2: Run** `node tools/drawWombProfiles.ts`. Screenshot the page with the pre-installed Chromium (headless `--screenshot`). Compare it by eye with the approved page: the phase ≤ 1 shapes must look the same.
- [x] **Step 3:** Run `npx vitest run src/breaker` and `npm run typecheck`. Expect both green.

### Task 4: Andrew's sign-off

- [x] **Step 1:** Send Andrew the regenerated page. Ask him:
  - (a) do the approved shapes look unchanged?
  - (b) does the collapse look right: how fast the tube fills, and how tall the white-water wall stands?
- [x] **Step 2:** Redraw the collapse keys until he signs them. Then add phases 1.5 and 2 at hollow 1 to the fixture with his sign-off date.
- [x] **Step 3:** On his word, commit and push to `claude/eager-darwin-d5a369-8bsax4` (PR #3). Do not merge.
