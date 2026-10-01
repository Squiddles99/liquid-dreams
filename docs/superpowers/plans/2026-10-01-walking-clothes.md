# Walking Clothes and Backpacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The crew's walking clothes, packs and thongs, a standing carry pose on land with the board under the arm,
the beach pile, and a mockup image of the three on the dune crest with their names in a surfy hand.

**Architecture:**
- **Blender build:** the build makes garment shells from each body, as the boardies already are: a tee that hangs
  straight from the chest, Shazza's cutoffs, and the bikini straps at her neck. It also builds hats, hair squashed
  under them, thongs and packs, all skinned to the 23-bone skeleton and exported in each rider's glb as their own
  meshes and materials.
- **Game:** a `walking` outfit shows them. An on-land placement stands the rider on the land's height. A `carry`
  pose puts the board under one arm, and the board is anchored to the solved hand.
- **Pile:** a separate Blender run makes `beachPile.glb` from the three riders' glbs.
- **Mockup:** a dev lineup of all three, captured and lettered in the page.

**Tech Stack:**
- three 0.186.1 WebGPU with TSL;
- vitest (Node);
- Blender 5.2.2 with MPFB 2.0.17 (`npm run build:surfers -- --only <name>`);
- tweakpane 4;
- Google Fonts (SIL OFL) for the mockup lettering.

**Spec:** `docs/superpowers/specs/2026-10-01-walking-clothes-design.md` (approved by Andrew 2026-10-01, with its
three assumptions).

**Ruling (plan form, as in step 2):** steps name the files, the interfaces and the tests with their assertions. Code
is written in full where a later task or a test depends on its shape: the pure game modules, the carry geometry, and
the shell "curtain". The Blender shapes are then tuned against renders, as the spec's gate requires.

**Ruling (the carry's arm):** the spec says "deck against the hip and forearm, the hand under the far rail". This plan
builds the real under-arm carry instead:
- the upper arm runs out over the top rail, which is tucked under the armpit;
- the forearm runs down the board's bottom face;
- the fingers reach under the lower rail;
- the deck rests against the hip.

An arm between the board and the body would be hidden on that side, against "everything renders". Grommet's
bodyboard is 51 cm wide, so his hand may only reach its bottom face (§4, "tucked under one arm"). The tests allow
that for the bodyboard. Cost if wrong: the arm's side is a constant in `carry()`.

## Global Constraints

- Assets are CC0 or project-made (Steam). The fonts are SIL OFL or Apache, checked on Google Fonts before use.
- `reference/` is never committed or published. Gate images go to `tools/surfer/previews/` (git-ignored).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No merge to main without Andrew. Check with the sibling sessions before any merge. Push the branch
  `walking-clothes` to origin.
- "Be careful everything renders": every limb is visible in every pose, for all three. No limb is buried in the
  board.
- The 23-bone skeleton contract is unchanged. WebGPU allows 8 vertex buffers per mesh. The body already uses all 8,
  so garments are separate meshes with at most 6 (position, normal, uv, color, joints, weights).
- Old moment links and saved settings still open: sanitisers take unknown or missing keys.
- T-Bone and Grommet walk in the exact boardies mesh and colours they surf in (Andrew).
- Outside `walking`, every walking part is hidden: no glasses in the water.
- Step 6 must keep carried boards from passing through the other riders. The mockup avoids it by placement, and a
  test pins that.

## Review Focus

1. **`walking` or `carry` with `onLand` off** (an old link, or a hand-set panel) would put glasses or a carried
   board in the water. Expected: the sanitiser falls back to `season` and `sit` when not on land (Task 1 tests).
2. **A preset switch while walking:** Shazza has no hat, and T-Bone and Grommet have no dry or hat hair, or both.
   Expected: the hair shown is always one that exists: the hat hair if the rider has a hat, else the dry hair, else
   the wet hair (Task 1 `hairShown` table).
3. **On land before the land has loaded** (`land.height` is null). Expected: the rider stands at the fallback
   height (the tide), with no NaN and no throw (Task 2 test).
4. **A sloping spot:** a level frame on a slope floats one foot or buries it. Expected: the dune crest finder picks
   ground with a slope under 0.15 (Task 2 test). Elsewhere it's within a few cm, which the gate judges.
5. **The longest board on the tallest rider, and the bodyboard on the shortest** (T-Bone's 80" step-up, Grommet's
   bodyboard), on either side. Expected: the board is clear of the legs, the hip and both arms, and the hand reaches
   it (Task 3 sweep over every rider, board and side).

---

### Task 1: The walking outfit, land-only poses and params (pure)

**Files:**
- Modify:
  - `src/surfer/presets.ts`: `Outfit` gains `walking`; `SurferPreset.walking`.
  - `src/surfer/wardrobe.ts`;
  - `src/surfer/poseNames.ts`;
  - `src/surfer/rideState.ts`;
  - `src/surfer/faceControl.ts`: `EXERTION.carry = 0`;
  - `src/surfer/surferParams.ts`;
  - `src/dev/DevPanel.ts`: the outfit and carry-side options;
  - `src/surfer/Surfer.ts`: callers of `landLook` and `hairShown` compile; the behaviour lands in Task 7.
- Test: `src/surfer/wardrobe.test.ts`, `src/surfer/surferParams.test.ts`, `src/dev/DevPanel.test.ts` (if it
  enumerates options)

**Interfaces (produced):**

```ts
// presets.ts
export type Outfit = 'boardies' | 'bikini' | 'springsuit' | 'rashieAndBottoms' | 'shortArmSteamer' | 'rashieAndBoardies' | 'walking';
export type SurfOutfit = Exclude<Outfit, 'walking'>;
export type WalkingPart = 'tee' | 'shorts' | 'straps' | 'hat' | 'hatTrim' | 'pack' | 'packTrim' | 'thongs' | 'towel' | 'neoprene' | 'fins';
export interface WalkingLook {
  /** The swimwear under the clothes (Andrew: the boys' exact boardies). */
  under: SurfOutfit;
  hat: 'cap' | 'bucket' | null;
  /** The arm the board goes under by default (the panel can override). */
  carrySide: 'l' | 'r';
  colors: Partial<Record<WalkingPart, RGB>>;
}
// SurferPreset gains: walking: WalkingLook
//   female:  { under: 'bikini',   hat: null,     carrySide: 'l', colors: { tee: [0.3, 0.38, 0.28], shorts: [0.12, 0.2, 0.38], straps: <= fabric>, pack: [0.45, 0.36, 0.22], packTrim: [0.18, 0.1, 0.05], thongs: [0.55, 0.18, 0.22], towel: [0.7, 0.35, 0.08] } }
//   male:    { under: 'boardies', hat: 'cap',    carrySide: 'r', colors: { tee: [0.07, 0.07, 0.075], hat: [0.02, 0.03, 0.09], hatTrim: [0.75, 0.75, 0.72], pack: [0.04, 0.04, 0.045], packTrim: [0.3, 0.05, 0.03], thongs: [0.03, 0.03, 0.03], neoprene: [0.02, 0.02, 0.025] } }
//   grommet: { under: 'boardies', hat: 'bucket', carrySide: 'l', colors: { tee: [0.75, 0.55, 0.02], hat: [0.35, 0.3, 0.17], pack: [0.02, 0.03, 0.12], packTrim: [0.5, 0.05, 0.03], thongs: [0.02, 0.15, 0.45], fins: [0.03, 0.03, 0.035] } }
//   Shazza's straps are her bikini's colour (preset.fabric). Grommet's tee is his bodyboard deck's yellow.

// wardrobe.ts
export type OutfitChoice = 'season' | Outfit;
export const presetOutfits = (p: SurferPreset): Outfit[] => [...new Set<Outfit>([...Object.values(p.outfits), 'walking'])];
/** What the body's masks and the boardies mesh show: the swimwear under the walking clothes. */
export const bodyOutfit = (p: SurferPreset, o: Outfit): SurfOutfit => (o === 'walking' ? p.walking.under : o);
export const wearsClothes = (o: Outfit): boolean => o === 'walking';
/** Dry on land or in clothes; the glasses only with the walking clothes (walking spec §4: never in the water). */
export const landLook = (onLand: boolean, o: Outfit): { wet: number; glasses: boolean } => ({ wet: onLand || o === 'walking' ? 0 : 1, glasses: o === 'walking' });
/** The hair that shows, always one the build made: under the hat when walking in one, else dry on land, else wet. */
export function hairShown(onLand: boolean, o: Outfit, has: { dry: boolean; hat: boolean }): 'wet' | 'dry' | 'hat' {
  if (o === 'walking' && has.hat) return 'hat';
  return (onLand || o === 'walking') && has.dry ? 'dry' : 'wet';
}
export const outfitMasks = (o: SurfOutfit): OutfitMasks => ({ ...(MASKS as Record<SurfOutfit, OutfitMasks>)[o] });
// OUTFIT_LABELS: Record<Outfit, string> gains walking: 'walking clothes'.

// poseNames.ts
export type PoseName = /* existing */ | 'carry';
/** Poses only on land (walking spec §4). */
export const LAND_POSES: readonly PoseName[] = ['carry'];
export const ALL_POSES = [...new Set([...STAND_POSES, ...BODYBOARD_POSES, ...LAND_POSES])];
export const posesOn = (kind: BoardKind, onLand: boolean): readonly PoseName[] => (onLand ? [...posesFor(kind), ...LAND_POSES] : posesFor(kind));

// rideState.ts: POSE_PHASE.carry = 'sit', POSE_ZONE.carry = 'flats'
//   Ruling: no new Phase value: nothing downstream reads phases on land yet.

// surferParams.ts
//   SurferParams gains: carrySide: 'auto' | 'l' | 'r' (default 'auto': the preset's)
//   normalizeSurferParams, after the existing repairs:
//     p.carrySide = oneOf(p.carrySide, ['auto', 'l', 'r'] as const, 'auto');
//     p.pose = oneOf(p.pose, posesOn(p.board, p.onLand), 'sit');
//     if (p.outfit === 'walking' && !p.onLand) p.outfit = 'season';
export const carrySideOf = (p: SurferParams): 'l' | 'r' => (p.carrySide === 'auto' ? PRESETS[p.preset].walking.carrySide : p.carrySide);
```

- [ ] **Tests first:**
  - **`wardrobe.test.ts`:**
    - `presetOutfits` of every preset contains `walking`;
    - `outfitFor(p, 'walking', date)` is `walking`;
    - `outfitFor(p, 'season', d)` never returns `walking` for any month;
    - `bodyOutfit`:
      - female walking → `bikini`;
      - male and grommet walking → `boardies`, which `showsBoardies` (Andrew's continuity);
      - `bodyOutfit(p, 'springsuit')` is `springsuit`;
    - the `landLook` table:
      - `(false, 'boardies')` → wet 1, no glasses;
      - `(true, 'boardies')` → wet 0, no glasses (the old `landLook(true)` glasses test changes here: the glasses
        are now in the bag outside `walking`);
      - `(true, 'walking')` → wet 0, glasses;
      - `(false, 'walking')` → wet 0, glasses;
    - the `hairShown` table, all 2 × 2 × 2 × (walking or not): `hat` only when walking with a hat; never `dry`
      when `has.dry` is false; never `hat` when `has.hat` is false (Review Focus 2).
  - **`surferParams.test.ts`:**
    - an old link without `carrySide` gets `auto`, and junk gets `auto`;
    - `{ pose: 'carry', onLand: false }` → `sit`, and `{ pose: 'carry', onLand: true }` keeps `carry` (on any
      board, Grommet's bodyboard too);
    - `{ outfit: 'walking', onLand: false }` → `season`, and with `onLand: true` it stays `walking` (Review
      Focus 1);
    - `carrySideOf` with `auto` gives Shazza `l`, T-Bone `r`, Grommet `l`, and an explicit side wins.
- [ ] Run `npx vitest run src/surfer/wardrobe.test.ts src/surfer/surferParams.test.ts`. Expected: FAIL (`bodyOutfit`
  and `carrySideOf` are missing; `walking` isn't an outfit).
- [ ] Implement as in the interfaces.
  - `Surfer.ts` calls `landLook(on, this.lastOutfit)` and `hairShown(...)` with `{ dry, hat: false }` until Task 7.
  - `setOutfit` maps through `bodyOutfit`.
  - Add `walking clothes: 'walking'` to `SURFER_OPTIONS.outfit`. The pose options come from `ALL_POSES`, so they
    include `carry`.
  - Add a `carry side` list (`auto`, `left`, `right`) to the Surfer folder.
- [ ] Run the same tests, then `npx vitest run src/surfer src/dev` and `npx tsc --noEmit`. Expected: PASS, with the
  existing sweeps unchanged (they iterate `posesFor`, which has no `carry`).
- [ ] Commit: `feat(wardrobe): the walking outfit over each rider's swimwear, land-only carry pose, carry side`.

### Task 2: Standing on land (pure placement and spots)

**Files:**
- Modify: `src/surfer/placement.ts`
- Test: `src/surfer/placement.test.ts`

**Interfaces (produced):**

```ts
/** Thong soles under the feet when walking (tools/surfer/clothes.py builds them 12 mm thick). */
export const SOLE_M = 0.012;

/** Feet on the land (walking spec §4): a level frame at the spot turned to the heading, on the land's height (or the
 * fallback while the land loads), lifted by the soles; the water isn't probed. */
export function groundFrame(p: Placement, groundY: number | null, fallbackY: number, liftM: number): BoardFrame {
  const { fwd } = headingAxes(p.headingDeg);
  const y = (groundY !== null && Number.isFinite(groundY) ? groundY : fallbackY) + liftM + p.heightNudgeM;
  return { position: new Vector3(p.x, y, p.z), forward: new Vector3(fwd[0], 0, fwd[1]), up: new Vector3(0, 1, 0) };
}

export interface LandSurface { heightAt(x: number, z: number): number; waterlineAt(z: number): number }
export interface LandSpot { x: number; z: number; headingDeg: number }
/** The Womb's lineup z (DEFAULT_SURFER_PARAMS.z): "above the Womb" is straight inland of it. */
export const WOMB_Z = 45;

/** Named spots (walking spec §4): the dune crest above the Womb, facing inland (east, toward the camera), and the dry
 * sand in front of it, facing the sea. Sampled along the line inland of the lineup. */
export function landSpots(land: LandSurface, beach: { wetWidthM: number; dryWidthM: number }, z = WOMB_Z): { duneCrest: LandSpot; beach: LandSpot } {
  const xs = land.waterlineAt(z), toe = xs + beach.wetWidthM + beach.dryWidthM;
  let crest = toe, top = -Infinity;
  for (let x = toe; x <= toe + 250; x += 0.5) {
    const h = land.heightAt(x, z);
    if (h > top) { crest = x; top = h; } else if (top - h > 1.5) break; // past the crest: the land falls away
  }
  // Onto ground flat enough to stand on: under 0.15 across a stride, stepping back toward the sea if the top is sharp.
  const slope = (x: number): number => Math.abs(land.heightAt(x + 1, z) - land.heightAt(x - 1, z)) / 2;
  let x = crest;
  for (let i = 0; i < 16 && slope(x) > 0.15; i++) x -= 0.5;
  return { duneCrest: { x, z, headingDeg: 90 }, beach: { x: xs + beach.wetWidthM + 0.6 * beach.dryWidthM, z, headingDeg: 270 } };
}
```

- [ ] **Tests first (`placement.test.ts`):**
  - **`groundFrame`:**
    - at ground 7.2 with lift `SOLE_M` puts the frame at y 7.212, level (up = +Y);
    - its forward at heading 90 is +x;
    - a `null` or `NaN` ground uses the fallback (Review Focus 3);
    - the height nudge adds.
  - **`landSpots`, on a synthetic land** (waterline 190; rising 0.1/m from the toe to a 22 m crest at x 300, then
    falling 0.05/m):
    - the crest is at x 300 ± 1, with heading 90;
    - the beach spot is at 190 + 12 + 0.6 × 28 = 218.8, with heading 270;
    - slope check: a land whose top is a 1 m-wide spike gets a crest spot where `slope < 0.15` (Review Focus 4);
    - land rising all the way gets the far end (toe + 250);
    - flat land gets the toe.
- [ ] Run `npx vitest run src/surfer/placement.test.ts`. Expected: FAIL (`groundFrame` and `landSpots` are
  missing).
- [ ] Implement.
- [ ] Run it again. Expected: PASS.
- [ ] Commit: `feat(placement): stand on the land's height; the dune crest and beach spots from the land`.

### Task 3: The carry pose and the board under the arm (pure)

**Files:**
- Create: `src/surfer/carry.ts`, `src/surfer/carry.test.ts`
- Modify: `src/surfer/poses.ts`:
  - `PoseContext.carrySide?: Limb`;
  - `PoseTargets.carry?: CarryBoard`;
  - a `case 'carry'`.

**Interfaces (produced):**

```ts
// carry.ts
import { Vector3 } from 'three/webgpu';
import type { Limb } from './rig';
import { type BoardFrame, type SolvedPose, boardQuaternion } from './solvePose';

/** Limb radii for clearance, as fractions of height (measured off the built bodies; tuned at the gate). */
export const LIMB_RADIUS = { thigh: 0.045, shin: 0.032, torso: 0.075, upperarm: 0.026, forearm: 0.022 } as const;
/** The palm and fingers below the hand joint, as a fraction of height: how far the fingers reach under a rail. */
export const HAND_REACH = 0.075;

export interface CarryBoard {
  side: Limb;
  /** The board's frame in the ground frame (+x the heading, +y up, +z the character's right). */
  board: BoardFrame;
  /** The carrying hand's target in the ground frame (the wrist). */
  hand: Vector3;
}

/** The carried board in the world (walking spec §4: it follows the arm, not the feet): the pose's board moved by
 * however far the solved hand sits from its target. */
export function carriedBoard(c: CarryBoard, ground: BoardFrame, solved: SolvedPose): BoardFrame {
  const Q = boardQuaternion(ground);
  const toW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Q).add(ground.position);
  const shift = solved.joint[`hand_${c.side}`].clone().sub(toW(c.hand));
  return { position: toW(c.board.position).add(shift), forward: c.board.forward.clone().applyQuaternion(Q), up: c.board.up.clone().applyQuaternion(Q) };
}

/** The shortest distance from segment a–b to a box given in a frame (centre, axes, half sizes); 0 inside. Sampled
 * (24 steps), which is plenty for clearances of centimetres. */
export function segmentBoxDistance(a: Vector3, b: Vector3, box: { centre: Vector3; axes: [Vector3, Vector3, Vector3]; half: [number, number, number] }): number;

/** The board's bounding box in the world from its frame and spec (length × thickness incl. rocker × width). */
export function boardBox(frame: BoardFrame, spec: BoardSpec): { centre: Vector3; axes: [Vector3, Vector3, Vector3]; half: [number, number, number] };
```

`carry()` in `poses.ts`, in full:

```ts
const CARRY_NOSE_DOWN = 8 * DEG;

/** On land (walking spec §4): standing relaxed facing +x, weight on the leg away from the board; the board on its rail
 * under the carrying arm, deck to the hip, nose forward and 8° down; the upper arm over the top rail, the forearm down
 * the bottom face, the fingers under the lower rail (bodyboard: on its bottom face); the free arm hangs. */
function carry(ctx: PoseContext, r: Rider): PoseTargets {
  const side: Limb = ctx.carrySide ?? 'r', free: Limb = side === 'l' ? 'r' : 'l', k = side === 'l' ? -1 : 1;
  const rest = ctx.rest, H = rest.heightM, m = r.m, spec = ctx.spec;
  const foot = (s: Limb, fwd: number, out: number): FootTarget => {
    const sz = s === 'l' ? -1 : 1, at = V(fwd, 0, sz * (m.hipHalf + out));
    const dir = V(Math.cos(0.15), 0, sz * Math.sin(0.15));
    return { ankle: add(at, sc(Y(), m.ankleH)), toe: add(at, sc(dir, m.footLenH), sc(Y(), m.toeH)), pole: V(1, 0, sz * 0.15).normalize(), instep: Y() };
  };
  const feet = { [side]: foot(side, 0.06, 0.03), [free]: foot(free, 0, 0) } as Record<Limb, FootTarget>;
  const pelvis = V(0.01, m.ankleH + 0.975 * m.legLen + m.hipDrop, -k * 0.025);

  const t = spec.thicknessM, halfW = spec.maxWidthM / 2;
  const sh = rest.joint[`upperarm_${side}`], latS = Math.abs(sh.x), yS = sh.y;
  const deckLat = m.hipHalf + LIMB_RADIUS.thigh * H + 0.02, outerLat = deckLat + t;
  const elbowLat = outerLat + LIMB_RADIUS.upperarm * H + 0.01;
  const dx = Math.min(Math.max(elbowLat - latS, 0.02), 0.8 * m.upperArmLen);
  const elbowY = yS - Math.sqrt(m.upperArmLen ** 2 - dx * dx);
  // The upper arm's height where it passes over the bottom face; the top rail tucks a limb's width under it.
  const crossY = yS - (Math.max(0, outerLat - latS) / dx) * (yS - elbowY);
  const topY = crossY - 1.3 * LIMB_RADIUS.upperarm * H - 0.01, botY = topY - 2 * halfW;
  const wrist = V(0.02, elbowY - 0.97 * m.forearmLen, k * (elbowLat - 0.01));
  const board: BoardFrame = {
    position: V(0.02, (topY + botY) / 2, k * outerLat),
    forward: V(Math.cos(CARRY_NOSE_DOWN), -Math.sin(CARRY_NOSE_DOWN), 0),
    up: V(0, 0, -k),
  };
  const fsh = rest.joint[`upperarm_${free}`], reach = m.upperArmLen + m.forearmLen;
  const hands = {
    [side]: boardHand(wrist, V(-0.2, 0, k)),
    [free]: boardHand(V(0.03, fsh.y - 0.96 * reach, -k * (Math.abs(fsh.x) + 0.06)), V(-1, 0, -k * 0.2)),
  } as Record<Limb, HandTarget>;
  return {
    pelvis, pelvisUp: Y(), pelvisForward: X(), chest: { bend: 0.04, twist: 0, side: 0 },
    feet, hands, look: add(X(), sc(Y(), -0.03)), carry: { side, board, hand: wrist },
  };
}
```

- [ ] **Tests first (`carry.test.ts`), each over every preset × each of its boards × each side:** use `boardsFor`,
  so T-Bone's 80" step-up and Grommet's bodyboard are covered (Review Focus 5). Use both the reference skeleton and,
  where present, the built rest from the manifest.

  Each case solves with `solvePose(rest, t, ground, lookAt)` on a ground frame at an arbitrary heading, then:
  - the solved carrying hand is within 2 cm of its target;
  - **surfboards:** the hand joint is within `HAND_REACH × H + 0.02` of the board's lower rail line, so the fingers
    reach under it (the spec's "within 2 cm" of the rail). **The bodyboard:** within that reach of its bottom face
    (ruling above);
  - clear of the board's box (`segmentBoxDistance`) by at least their radius (`LIMB_RADIUS × H`):
    - the torso (pelvis → spine_03);
    - both thighs and shins;
    - the carrying upper arm and forearm, with a 5 mm allowance for the forearm resting on the bottom face;
    - the free arm;
  - the nose is ahead of the hand, and lower than the tail;
  - the knees bend at most 25° (standing), and both ankles are within 1 cm of their targets;
  - an idle head yaw of ±20° (`lookAt` turned) doesn't move the board: `carriedBoard` is the same within 1 mm;
  - `carriedBoard` follows the hand: shifting the solved hand by 5 cm moves the board by 5 cm.
- [ ] Run `npx vitest run src/surfer/carry.test.ts`. Expected: FAIL (the module is missing).
- [ ] Implement `carry.ts` and `carry()`, and wire `case 'carry'` in `poseTargets`. If a rider or board fails
  clearance, tune `deckLat`'s 2 cm and the elbow's 1 cm. The tests' radii are the contract. Ledger any constant
  changed.
- [ ] Run `npx vitest run src/surfer`. Expected: PASS, with the existing pose sweeps unchanged.
- [ ] Commit: `feat(poses): carry: the board under the arm on land, anchored to the solved hand`.

### Task 4: Garment shells, straps and thongs (Blender)

**Files:**
- Create:
  - `tools/surfer/geom.py`: the `_tube` sweep moved from `glasses.py`, and `curtain()`;
  - `tools/surfer/clothes.py`.
- Modify:
  - `tools/surfer/glasses.py`: imports `geom._tube`;
  - `tools/surfer/build.py`;
  - `tools/surfer/export.py`: `checks` gains `garmentsOutside`;
  - `tools/surfer/previews.py`: a `walking` sheet per rider;
  - the three presets: a `walking` block.
- Test: `src/surfer/manifest.test.ts`

**Preset block (each rider; values tuned at the gate):**

```json
"walking": {
  "tee": { "fit": "oversized", "push": [0.015, 0.03], "hemAboveCrotch": 0.09, "sleeveT": 0.6, "knot": "l" },
  "shorts": "cutoffs",
  "straps": true,
  "hat": null,
  "pack": "rucksack"
}
```

- **T-Bone:** tee `{ "fit": "plain", "push": [0.012, 0.022], "hemAboveCrotch": 0.07, "sleeveT": 0.5 }`, shorts
  `"boardies"`, hat `"cap"`, pack `"surf"`.
- **Grommet:** tee `{ "fit": "big", "push": [0.025, 0.045], "hemAboveCrotch": 0.0, "sleeveT": 0.85 }`, shorts
  `"boardies"`, hat `"bucket"`, pack `"school"`.

**The curtain, in full (the shape the tee depends on):**

```python
def curtain(body, coords, region, top_z, step=0.02, bins=48):
    """Cloth hangs straight down from whatever is widest above it (walking spec §3): for each angle around the torso's
    axis and each 2 cm row from `top_z` down, the largest radius of any torso vertex at or above that row. Arms and the
    head are left out, so nothing hangs off them. Returns radius(angle, z) and the axis centre at z."""
    torso = [v.co.copy() for v, (b, _) in zip(body.data.vertices, coords) if b in region]
    zs = sorted({round(c.z / step) for c in torso})
    centre = {}
    for row in zs:
        pts = [c for c in torso if round(c.z / step) == row]
        centre[row] = Vector((sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), 0))
    best = {}
    for c in torso:
        row = round(c.z / step)
        a = int((math.atan2(c.y - centre[row].y, c.x - centre[row].x) + math.pi) / (2 * math.pi) * bins) % bins
        r = math.hypot(c.x - centre[row].x, c.y - centre[row].y)
        best[(row, a)] = max(best.get((row, a), 0.0), r)
    hang = {}
    for a in range(bins):
        run = 0.0
        for row in sorted(zs, reverse=True):
            if row * step <= top_z:
                run = max(run, best.get((row, a), 0.0))
            hang[(row, a)] = run
    def radius(angle, z):
        row = min(zs, key=lambda q: abs(q * step - z))
        a = int((angle + math.pi) / (2 * math.pi) * bins) % bins
        return hang.get((row, a), 0.0), centre[row]
    return radius
```

**`clothes.py` functions:**
- `tee(body, rig, coords, weights, H, L, spec, name)`:
  - A copy of the body (as `wardrobe.boardies`) is kept over:
    - the torso;
    - the clavicles;
    - the neck below a round collar (drop vertices within 7.5 cm of the neck base's axis above the neck joint less
      2 cm);
    - the upper arms to `sleeveT`.
  - It's cut at `crotch_z + hemAboveCrotch × H`.
  - Every vertex is pushed out along its normal by `push[0]` at the chest, rising to `push[1]` at the hem.
  - Torso vertices below the chest (`z < chest_z`, from the bikini top's line, 0.72 H) are pushed out to at least
    the curtain's radius plus the push, so the tee hangs straight from the chest and the shoulder blades.
  - Sleeves are pushed out a further 1 cm (2 cm for `big`) and flared 1 cm at the hem.
  - The knot (`knot: "l"`) pulls the bottom 12 cm toward a point on that hip, 3 cm above the hem, by up to 35 %,
    falling off with the angle from the knot. A flattened 3.5 cm UV sphere is added there for the knot, skinned to
    the pelvis.
  - The mask UV layers are dropped and the body's `UVMap` kept, for the weave.
  - `COLOR_0` is written as r crease, g occlusion and b distance to the hem:
    - **Crease (r):** fold noise over UV, plus rest-pose wrinkle bands at the elbows (a sleeve's last 3 cm), the waist
      and the knot.
    - **Hem distance (b):** 0 at the hem, 1 at 3 cm up.
  - Material `tee`.
- `cutoffs(...)`:
  - **Shell:** the `under_boardies` region cut at thigh `t ≤ 0.32`, pushed 8 mm, and 6 mm more at the hem.
  - **Fray:** `COLOR_0.b` is the distance to the hem (0 at the hem, 1 at 2.5 cm), for the shader's fray.
  - Material `denim`.
- `bikini_straps(rig, body, L, H, name)`:
  - Two thin tubes (`geom._tube`, radius 2.5 mm) run from the bikini top's upper edge at x ±0.06 up beside the neck
    and meet behind it, 6 mm off the skin (BVH-pushed).
  - Skinned to `spine_03` (lower half) and `neck`.
  - Material `straps`.
- `thongs(body, rig, coords, name)`:
  - **The sole:** the footprint of each foot's vertices below 2 cm, offset 1 cm outward, extruded 12 mm below the
    sole (`SOLE_M`).
  - **The Y strap:** a tube from between the first two toes to either side of the foot at mid-arch.
  - Skinned to `foot_*` (the sole's front third to `toe_*`).
  - Material `thongs`.
- `outside_check(garments, body)`: True when no tee or shorts vertex is more than 1 mm inside the body (BVH nearest,
  as in `glasses._inside`). It's written to `checks.garmentsOutside`.
- `bake_ao(obj, others, reach=0.04)`: rays against the garment and the body into `COLOR_0.g`, so the under-layers
  darken (step 2's method).

- [ ] **Tests first (`manifest.test.ts`, per rider):**
  - the manifest has meshes with the materials `tee` and `thongs`;
  - Shazza has `denim` and `straps`;
  - T-Bone and Grommet still have `boardies`, and no `denim`;
  - `checks` keep `blinkCovers` and `eyesOpen`, and gain `garmentsOutside: true`. The existing `toEqual` becomes
    `toMatchObject` plus explicit keys;
  - **skinning:** every vertex weight above 0.01 goes to the allowed bones (read `JOINTS_0` with `glbValues`):
    - the tee: pelvis, spine_01–03, neck, clavicles, upper arms and forearms;
    - denim: pelvis, spine_01, spine_02 and thighs;
    - straps: spine_03, neck and clavicles;
    - thongs: feet and toes;
  - **shape:**
    - the tee's lowest vertex is below the pelvis joint by at least 0.04 H for T-Bone, and below the boardies'
      waistband for Grommet;
    - the tee's widest point below the chest is at least the chest's: it hangs, not hugs;
    - the thong soles' lowest point is −0.012 ± 0.002 (glTF y);
  - the budget test still holds: ≤ 260k triangles in all.
- [ ] Run `npx vitest run src/surfer/manifest.test.ts`. Expected: FAIL (no `tee` material).
- [ ] Implement.
  - Build Shazza (`npm run build:surfers -- --only female`) and look at the `walking` sheet. The tee should hang
    from the chest and be knotted at the left hip, the cutoffs fray, and the straps show at the collar.
  - Then build `male` and `grommet`.
- [ ] Run the tests again. Expected: PASS.
- [ ] Commit, with the rebuilt glbs: `feat(build): walking clothes: tees hung from the chest, cutoffs, bikini straps,
  thongs`.

### Task 5: Hats, and hair squashed under them (Blender)

**Files:**
- Modify:
  - `tools/surfer/clothes.py`: `cap`, `bucket_hat`, and `hat_band(L, style)` returning the band's plane;
  - `tools/surfer/hair.py`: the `capped` and `bucket` styles take `below=band`;
  - `tools/surfer/build.py`: the `hairHat` mesh and material;
  - `tools/surfer/export.py`: `checks.hatHairUnder`.
- Test: `src/surfer/manifest.test.ts`

**Shapes:**
- **The band:** a plane through the forehead at `eye_z + 0.045` and the back of the head at `eye_z + 0.005`. The cap
  sits 1 cm lower than the bucket hat.
- **The cap:**
  - **Crown:** the scalp vertices above the band, pushed out along the normals by 7 mm (hair pressed flat). The rim
    is a 1 cm band. Material `cap`, with the front two panels as material `capFront`.
  - **Peak:** a curved plate 7 cm deep from the band's front third, curved down 1.5 cm at the edges and tilted 10°
    down. Material `cap`.
- **The bucket hat:**
  - **Crown:** pushed out 1.2 cm (soft, a few mm of noise sag).
  - **Brim:** a ring from the band outward 5.5 cm, sloping down 30°, with a 1 cm rolled edge.
  - Material `bucketHat`.
- **Skinning:** both are skinned to the `head`.
- **The hat hair:**
  - **`capped` (T-Bone):** `_tousled` locks rooted only on scalp vertices below the band, at the sides and back
    (none at the front, which is under the peak). They grow downward (`DOWN` 0.5) and hug within 6 mm of the scalp.
  - **`bucket` (Grommet):** `_curl` locks rooted below the band, with the radius halved under the brim. They spring
    outward below the brim's line, and the fringe curls under the brim's front stop above the glasses.
  - **The band rule:** any point above the band is projected below it.
  - Built with `hair.build(..., {"style": ..., "below": band})`, material `hairHat`, and the AO baked against the
    body and the hat.
- **`checks.hatHairUnder`:** True when every `hairHat` vertex is below the band plane, or the hat is hit by a ray
  from the head's centre through the vertex.

- [ ] **Tests first:**
  - T-Bone has `cap`, `capFront` and `hairHat`;
  - Grommet has `bucketHat` and `hairHat`;
  - Shazza has none of them;
  - every hat and `hairHat` vertex is skinned only to `head`;
  - the hat's lowest crown vertex is above the eyes' landmark y;
  - the peak and brim are in front of the eyes (the cap) or around them;
  - `checks.hatHairUnder` is true;
  - the hat hair's highest vertex is below the hat's highest vertex.
- [ ] Run them. Expected: FAIL.
- [ ] Implement.
  - Rebuild `male` and `grommet`.
  - Make close-up sheets of the heads, front, side and back, with and without the hat. The hair should show below
    the band at the back and sides, and Grommet's curls should spill out under the brim.
- [ ] Run them again. Expected: PASS.
- [ ] Commit, with the glbs: `feat(build): T-Bone's trucker cap and Grommet's bucket hat, hair pressed under them`.

### Task 6: Packs (Blender)

**Files:**
- Create: `tools/surfer/packs.py`
- Modify: `tools/surfer/build.py`
- Test: `src/surfer/manifest.test.ts`

**Shapes:**
- **The pack:** a bevelled box (bevel 3 cm) set 1 cm off the back at `spine_03`'s height. Its back is pushed off a
  BVH of the body and the tee. Sizes in m (w × h × d):
  - rucksack 0.30 × 0.42 × 0.16, canvas, with a top flap;
  - surf pack 0.32 × 0.48 × 0.18, worn black, with side compression straps;
  - school bag 0.30 × 0.38 × 0.22, inflated 2.5 cm in the middle (stuffed), with a front pocket.

  Material `pack`, with zips, buckles and the pocket edge as `packTrim`.
- **Straps:** `geom._tube` flattened to a 4 × 0.6 cm band. Each runs from the pack's top corners over the shoulders,
  1 cm outside the tee (BVH), down the chest to the pack's bottom corners at the sides. Material `packTrim`.
- **Skinning:** the box to `spine_03`. The straps go 50/50 to `spine_03` and the clavicle over the shoulders, and to
  `spine_03` elsewhere.
- **Details:**
  - **Shazza:** a rolled towel (a cylinder 6 cm in radius and 34 cm long, with a striped `COLOR_0`) strapped under
    the pack's bottom. Material `towel`.
  - **T-Bone:** a wetsuit, a rolled body (a cylinder 7 cm × 30 cm) on top of the pack, with one sleeve (a flattened
    tube 4 cm in radius) hanging down through the right strap to the hip. Material `neoprene`.
  - **Grommet:** two swim fins (blades 45 × 20 cm with foot pockets) clipped flat to the bag's right side. Material
    `fins`.

  All of them are skinned to `spine_03`.

- [ ] **Tests first:**
  - per rider, a `pack` and a `packTrim` mesh, plus `towel` (Shazza), `neoprene` (T-Bone) or `fins` (Grommet);
  - skinning only to spine_03 and the clavicles;
  - the pack's front face (the min glTF z of the `pack` material) is behind the back: behind the spine_03 joint by
    at least 0.08 H;
  - the straps reach in front of the chest: the max z of `packTrim` is greater than the spine_03 joint's z + 0.06.
- [ ] Run them. Expected: FAIL.
- [ ] Implement.
  - Rebuild all three.
  - Make the back, side and three-quarter sheets: no strap through the tee, and the towel, wetsuit and fins read.
- [ ] Run them again. Expected: PASS.
- [ ] Commit, with the glbs: `feat(build): the crew's packs: Shazza's rucksack and towel, T-Bone's surf pack and
  wetsuit, Grommet's stuffed school bag and fins`.

### Task 7: In the game: walking parts, cloth shading, standing and carrying on land

**Files:**
- Modify:
  - `src/surfer/surferShading.ts`: `clothMaterial`;
  - `src/surfer/Surfer.ts`: walking parts, the hat hair, and `meshesWith(material)`;
  - `src/surfer/SurferStand.ts`: on-land placement, the carry, and the ground;
  - `src/app/App.ts`: passes the ground, and the spot buttons;
  - `src/dev/DevPanel.ts`: `On land` sub-folder.
- Create: `src/surfer/walking.selftest.ts` (registered in `src/dev/selfTests.ts`)
- Test: the self-tests, the vitest suite, and `src/dev/DevPanel.test.ts`

**Interfaces:**

```ts
// surferShading.ts
export type Cloth = 'cotton' | 'denim' | 'canvas' | 'neoprene' | 'rubber' | 'towel';
/** Garments (walking spec §3): the colour, a weave from the body's UV visible up close (faded with distance by its
 * derivative), the baked creases (COLOR_0.r) as a bump, the baked occlusion (COLOR_0.g); denim fades and frays at the
 * hem (COLOR_0.b, alpha-tested with noise); rubber and neoprene get a soft sheen. */
export function clothMaterial(sky: Sky, color: RGB, cloth: Cloth, sv?: (xz: N) => N): THREE.MeshBasicNodeMaterial;

// Surfer.ts: materials gain
//   tee → cotton(colors.tee); denim → denim(colors.shorts); straps → cotton(preset.fabric);
//   cap → cotton(colors.hat); capFront → cotton(colors.hatTrim); bucketHat → cotton(colors.hat);
//   hairHat → hairMaterial; pack → canvas(colors.pack); packTrim → canvas(colors.packTrim);
//   thongs → rubber(colors.thongs); towel → towel(colors.towel); neoprene → neoprene(colors.neoprene); fins → rubber(colors.fins)
//   (a missing colour falls back to [0.3, 0.3, 0.3], never a throw).
// Every mesh carrying one of these is a walking part: shown only when wearsClothes(outfit).
// The hair shown: hairShown(onLand, outfit, { dry: hairDry.length > 0, hat: hairHat.length > 0 }).
// The glasses: landLook(onLand, outfit).glasses.
meshesWith(material: string): readonly THREE.Mesh[];
readonly walkingLift: number; // SOLE_M when wearing the thongs (walking), else 0

// SurferStand.update(p, simTime, dateISO, seed, probe, tideM, ground?: (x: number, z: number) => number | null)
//   on land: frame = groundFrame(p, ground?.(p.x, p.z) ?? null, tideM, surfer.walkingLift); no probes.
//     carry: the board placed by carriedBoard(t.carry, frame, solved); the leash and the deck contacts hidden.
//     any other pose: the board lies on the sand (frame lowered by bottomYAt(spec, 0, 0)).
//   in the water: as before.
//   PoseContext.carrySide = carrySideOf(p).
```

**App and panel:**
- `App` passes `ground = (x, z) => this.land.height ? Math.max(lh.heightAt(x, z), rockField?.topAt(x, z) ?? -Infinity) : null`.
- An `On land` sub-folder gets two buttons, `dune crest` and `beach`. Each sets `x`, `z` and `headingDeg` from
  `landSpots(lh, lh.profile)` and sets `onLand`, `outfit: 'walking'` and `pose: 'carry'`. Both are disabled until
  the land loads.

- [ ] **Self-tests first (`walking.selftest.ts`):** use a flat-colour render. Surfer meshes get unlit materials by
  `meshesWith`: tee red, body blue, hair (all three hair meshes) green, hats yellow, the rest black. Use an ortho
  camera and a 96 × 96 float target, as `grommet.selftest` reads its target.
  1. *"walking: the tee covers the torso"*: T-Bone, Shazza and Grommet in `walking`, front view. The 24 × 24 px at
     the sternum (between spine_03 and the neck) are ≥ 95 % red.
  2. *"surf gear: the tee is gone and the swimwear shows"*: the same riders in `boardies` or `bikini`. The sternum
     region has 0 % red. At the hips, T-Bone's boardies mesh has ≥ 80 % of its own flat colour.
  3. *"the cap hides the crown's hair"*: T-Bone in `walking`, top-down over the head. The central 24 × 24 px have
     ≤ 1 % green and ≥ 90 % yellow. The same for Grommet's bucket hat.
- [ ] Load `/?selftest=walking` in the preview (`ld-step2`, worktree `ld-surfer`). Expected: 3 FAIL (no
  `meshesWith`; the walking parts aren't shown).
- [ ] Implement `clothMaterial`, the Surfer's walking parts, the stand's land path and the panel.
  - Add vitest for the stand's pure helpers where they're factored out.
  - The `DevPanel.test` binding ranges stay exact.
- [ ] Run `/?selftest=walking` again. Expected: 3 PASS. Then run `/?selftest=` (all). Expected: as main, i.e. the
  underwater and sound-timing failures already known on main, and no new ones.
- [ ] In the preview:
  - T-Bone on the `dune crest` in `carry`, from the front, three-quarter, side and back: the board under his right
    arm, both arms and legs visible, the cap and the pack read;
  - the same for Shazza (left) and Grommet (left).

  Fix what doesn't render, ledgering each fix.
- [ ] Run `npx vitest run`, `npx tsc --noEmit` and `npm run build`. Expected: green.
- [ ] Commit: `feat(surfer): walking clothes in the game: cloth shading, standing on land, the board under the arm`.

### Task 8: The beach pile

**Files:**
- Create:
  - `tools/surfer/pile.py`: run as `blender --background --python pile.py -- public/surfer public/surfer/beachPile.glb tools/surfer/previews`;
  - `src/surfer/BeachPile.ts`, `src/surfer/pile.test.ts`.
- Modify:
  - `tools/surfer/buildSurfers.ts`: `--pile`, and after a full build;
  - `src/surfer/surferParams.ts`: `pile`, `pileX`, `pileZ`, `pileHeadingDeg`;
  - `src/app/App.ts`;
  - `src/dev/DevPanel.ts`: `beach pile` toggle and `Place pile ahead`.

**The pile build:**
- **Inputs:** the three rider glbs, imported in rest pose (glTF import, transforms applied).
- **From the riders' glbs:**
  - **Packs:** the three packs slumped open. Each is squashed 20 % in height, tipped back 70° onto the sand, and its
    flap or top opened by a 30° rotation of its top 6 cm.
  - **Hats:** the cap and the bucket hat, lying crown-up.
  - **Thongs:** the soles laid in pairs.
  - **Glasses:** Grommet's glasses resting on his school bag, arms folded (rotated 80° about the hinge points).
- **Built here:**
  - **Tees:** three dropped, half-folded tees: a T-shaped plate in each rider's tee size, folded once at 40 %,
    displaced by fold noise of ±2 cm.
  - **Shorts:** Shazza's cutoffs as a folded rectangle.
  - **Towels:** two lying in loose folds, in Shazza's towel stripes and T-Bone's plain blue.
- **Materials:** `pile_<part>_<preset>`, e.g. `pile_tee_male`. The glasses keep `glasses` and `lens`.
- **Placement:** everything sits within a 1.6 × 1.2 m footprint, resting on y = 0 (no vertex below −1 mm).
- **Outputs:** a `beachPile.manifest.json` listing the parts, and a preview sheet.

**Runtime:**
- `BeachPile.load(sky, sv)` maps `pile_<part>_<preset>` to `clothMaterial` with that preset's walking colour.
  Grommet's glasses use the plastic and lens materials.
- `update(p, ground)` places it at `pileX` and `pileZ`, with its heading, on the ground (`groundFrame` with a lift
  of 0), shown when `pile`.

- [ ] **Tests first (`pile.test.ts`, on the glb and manifest):**
  - every listed part is present: 3 tees, 1 shorts, 2 hats, 3 packs, 2 towels, 6 thong soles and the glasses;
  - every material name parses to a known part and preset (or is `glasses` or `lens`);
  - the minimum y is ≥ −0.001 and the footprint is ≤ 1.6 × 1.2 m;
  - the glasses' lowest point lies on the school bag's top (within 3 cm);
  - `sanitizeSurferParams` gives the defaults for the pile keys on old links, and junk is repaired.
- [ ] Run them. Expected: FAIL.
- [ ] Implement.
  - Run `npm run build:surfers -- --pile`.
  - Place the pile on the `beach` spot in the preview and look at it from 1.5 m and 4 m.
- [ ] Run them again. Expected: PASS. Run `npx tsc --noEmit`.
- [ ] Commit, with the glb: `feat(pile): the crew's clothes and packs dropped on the sand`.

### Task 9: The gang mockup

**Files:**
- Create:
  - `src/surfer/gang.ts`, `src/surfer/gang.test.ts`;
  - `src/surfer/GangLineup.ts`;
  - `src/dev/gangCard.ts`, `src/dev/gangCard.test.ts`.
- Modify:
  - `src/surfer/surferParams.ts`: `gang: boolean`;
  - `src/app/App.ts`: when `gang` is on, the lineup updates instead of the single stand;
  - `src/dev/DevPanel.ts`: `the gang (mockup)` toggle and `Gang camera` button.

**Interfaces:**

```ts
// gang.ts
/** The mockup's lineup (walking spec §6): Grommet in the middle, Shazza on his left, T-Bone on his right, all facing
 * the heading; the outer two carry on their outside arms, Grommet on his left. */
export const GANG_SPACING_M = 1.05;
export interface GangPlace { preset: PresetName; x: number; z: number; headingDeg: number; carrySide: 'l' | 'r' }
export function gangPlaces(centre: LandSpot): GangPlace[];
/** The camera: in front of the line at its centre, `distM` out, at the riders' chest height less 0.15 m (a little
 * below them), looking back along the line's heading tilted up 3°: the lineup and the horizon behind them. */
export function gangCamera(centre: LandSpot, groundY: number, distM = 5.5): CameraPose;

// gangCard.ts
export interface NameAnchor { x: number; y: number; nickname: string; realName: string }
/** Where each name goes: above each head (anchor = the head joint + 0.3 m, projected), centred, kept inside the frame
 * with a 4 % margin and pushed apart so no two names overlap; sizes as fractions of the frame's height. */
export function nameLayout(anchors: NameAnchor[], w: number, h: number): { x: number; y: number; angleDeg: number; nickSize: number; realSize: number }[];
/** The card: the frame, then each name: the nickname in Knewave (SIL OFL), sun-bleached cream with a teal drop and a
 * sunset-orange edge, slightly rotated, worn by a speckle knock-out (a hand-painted surf-wax look); the real name small
 * in Caveat Brush (SIL OFL) underneath. */
export function drawGangCard(frame: CanvasImageSource, w: number, h: number, anchors: NameAnchor[]): HTMLCanvasElement;
```

- [ ] **Tests first:**
  - **`gang.test.ts`:**
    - `gangPlaces` puts Grommet at the centre, Shazza at −z for heading 90 (his left) and T-Bone at +z;
    - Shazza carries left, T-Bone right and Grommet left;
    - **clearance:** solve each rider's carry at their place, using the built rest from each manifest. Each
      carried board (`boardBox`) is clear of the other two riders' limb capsules, at least `LIMB_RADIUS × H` for the
      torso, thighs, shins and arms. This pins the step 6 requirement for the mockup;
    - `gangCamera` is in front of the line, along the heading, below the riders' chest height, looking back at
      them.
  - **`gangCard.test.ts`** (the pure layout):
    - three anchors at 1920 × 1080 give boxes inside the 4 % margin, with no overlaps;
    - two anchors 20 px apart are pushed apart;
    - the nickname size is 7.5 % of the height and the real name's is 3.3 %.
- [ ] Run them. Expected: FAIL.
- [ ] Implement.
  - `GangLineup` owns three `SurferStand`s and updates each with params derived from the panel's (preset, place,
    `onLand`, `walking`, `carry`, carry side).
  - `drawGangCard` loads the two fonts through a Google Fonts `<link>` in the dev page (`document.fonts.load`).
    Check each font's licence on fonts.google.com first. If one isn't OFL or Apache, swap in an OFL brush face and
    ledger it.
  - In dev builds, expose `window.__gang = { anchors(), card }` for the capture script.
- [ ] Run them again. Expected: PASS. Run `npx tsc --noEmit`.
- [ ] Capture:
  - Load the `dune crest` spot with the gang on and the gang camera, at late morning with the sun from the side.
    Tune the time and conditions in the preview.
  - Capture two variants: the idle faces as they come, and all three smiling (manual face, smile 0.8).
  - Compose each with `__gang.card` and save as `tools/surfer/previews/gang-mockup-idle.png` and
    `gang-mockup-smiles.png`.
- [ ] Commit (the code; the PNGs are ignored): `feat(dev): the gang mockup: the three on the dune crest with their
  names`.

### Task 10: Tuning, the gate pack, docs, review and push

- [ ] **Tuning by eye:** tune by eye in the game, near and far, for all three:
  - the tee's drape and the knot;
  - the fray;
  - the hats on the hair;
  - the packs' fit;
  - the colours (`presets.ts`, the preset JSON).

  Commit each round with what changed.
- [ ] **The "everything renders" sweep:** for `carry`, all three, both sides and each board, from the front, the
  back, both sides and above. Check that every limb is visible and nothing is buried in the board, and fix what
  isn't.
- [ ] **The gate pack** (in `tools/surfer/previews/`), sent to Andrew:
  - turntables (8 views) of each rider walking;
  - close-ups of the hats with the hair;
  - the pile at 1.5 m and 4 m;
  - the two gang mockups.
- [ ] **Docs:**
  - `tools/surfer/README.md`: the walking clothes, the packs, the pile, `--pile`;
  - `public/surfer/LICENSES.md`: everything project-made; the fonts aren't bundled (the mockup only).
- [ ] **Checks:** run the full `npx vitest run`, `/?selftest=`, `npx tsc --noEmit` and `npm run build`.
- [ ] **Final review:** a fresh reviewer on the most capable model, then one fix pass (each fix RED → GREEN).
- [ ] **Push:** push the branch `walking-clothes`. Don't merge; Andrew signs off at the gate.
