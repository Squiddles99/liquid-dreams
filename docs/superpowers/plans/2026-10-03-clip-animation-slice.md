# Clip Animation Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One real riding-stance motion clip plays on Shazza and T-Bone in the game, with fingers and feet planted on
the deck, behind a `motion: code / clip` switch. Andrew judges it against today's code pose.

**Architecture:**
- **The rig:** the Blender build stops trimming MPFB's 30 finger bones.
- **The bake:** a new Blender script maps one FBX clip onto each rider. For every frame it writes each bone's
  world-space rotation *from rest* (the same "D" that `solvePose` uses internally), plus the pelvis offset from the
  ankles, to git-ignored JSON.
- **In game:**
  - `clipPlayer` samples the clip;
  - `clipPose` places it on the board, applies the dials as corrections and pins the ankles with the existing two-bone
    IK;
  - it returns the same `SolvedPose` the stand already consumes.

**Tech stack:**
- TypeScript, three.js (`three/webgpu`), Vitest;
- Blender 5.2 + MPFB 2.0.17 (Python `bpy`, `mathutils`, numpy), driven by `tools/surfer/buildSurfers.ts`;
- Node 24 (runs `.ts` directly).

**Spec:** `docs/superpowers/specs/2026-10-03-clip-animation-slice-design.md`

## Global Constraints

- `src/surfer/poses.ts`, `src/surfer/solvePose.ts` and `src/surfer/ik.ts` are **not changed** (spec §2, §4.3).
- All existing `src/surfer` tests pass unchanged (311 at 7c075dd + c4c33d6) (spec §5).
- **Licensed clips are never committed** (spec §3.2):
  - `anim-source/` and `public/surfer/clips/` stay git-ignored (already in `.gitignore`, b00e6d8);
  - `tools/surfer/clips.json` *is* committed, and holds no licensed data.
- Tests never depend on the paid clip. A synthetic clip is built in code, and the real-clip test skips when nothing is
  built (spec §5).
- Body ≤ 30k triangles, ≤ 4 bone influences per vertex (spec §2; `manifest.test.ts`).
- `SurferParams.motion` defaults to `'code'` until Gate C rules (spec §4.2).
- Clips: 30 fps; loop seam blend 0.25 s (spec §3.3).
- Foot pin tolerance: 5 mm. Loop seam < 2°. Mirror twice = original within 1e-6 (spec §5).
- Imports in game code come from `'three/webgpu'`, like the surrounding files. Comment density and voice match
  `src/surfer/*.ts`: short JSDoc that says what and why, citing the spec section.
- **Work in the worktree** `C:/Dev/andrew-dev-personal-projects/ld-anim`, on branch `clip-slice` (Task 1, Step 0).
  Never commit on main. Merge only when Andrew says so.

**One refinement of the spec (§3.3 step 6):**
- The bake writes each clip once, in its source stance.
- The game makes the mirrored copy at load (`mirrorClip`, Task 6), cached.
- The effect the spec asks for is unchanged, and the mirror becomes testable in TypeScript.

## Review Focus

1. **A stale 23-bone `.glb`** (someone's old build, or a Grommet build that failed): the surfer must still load and pose.
   - The fingers are optional at load.
   - Tests: Task 1 (`manifestProblems` accepts a 23-bone manifest) and Task 2 (`fingerRestFromManifest` returns null).
2. **Vite's SPA fallback:** a missing `public/surfer/clips/x.clips.json` comes back as **200 `index.html`**, not a 404.
   That must read as "not built", not as a JSON crash. Test: Task 6.
3. **A clip baked against an older rig, or a malformed file** (unknown bones, wrong lengths, NaN): it is reported once
   by the loader and the stand falls back to code. It must never throw every frame. Test: Task 6.
4. **A mislabelled `noseSide`, or a clip with the lead foot behind:** the yaw alignment must not spin the rider 180°
   to face the wrong rail. Clamp the yaw to ±60°, so a mislabel shows as wrong-footed. Test: Task 7.
5. **A tilted or pitched board** (the stand rides the swell): board-frame joints must be identical for every board
   frame, so the feet stay pinned on a moving board. Test: Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/surfer/rig.ts` (modify) | `FINGER_BONES`, `FingerBone`, `FINGER_PARENT`; `manifestProblems` accepts 23 or 53 bones |
| `src/surfer/fingers.ts` (create) | finger rest from the manifest, palm normal, relaxed curl deltas, finger local rotations |
| `tools/surfer/rig_trim.py` (modify) | keep the finger bones and their weights |
| `src/surfer/manifest.test.ts` (modify) | the rebuilt riders skin to 53 bones; every finger carries weight |
| `src/surfer/Surfer.ts` (modify) | collect the finger bones; `applyPose(p, fingers?)` poses them (clip or relaxed) |
| `tools/surfer/clips.json` (create) | the clip list (no licensed data) |
| `src/surfer/clips.ts` (create) | clip types, validation, the loader, the mirror, `clipFor`, `POSE_CLIP` |
| `src/surfer/clipPlayer.ts` (create) | `sampleClip` |
| `src/surfer/clipFixture.ts` (create) | the synthetic test clip (imported by tests only) |
| `src/surfer/clipPose.ts` (create) | place, dials, balance and leg IK → `ClipSolved` |
| `tools/surfer/clips.py` (create) | the Blender bake + Gate B contact sheets |
| `tools/surfer/buildSurfers.ts` (modify) | the `--clips` mode |
| `package.json` (modify) | `build:clips` |
| `src/surfer/motion.ts` (create) | `chooseMotion`, `clipTime` |
| `src/surfer/surferParams.ts` (modify) | `motion` |
| `src/surfer/SurferStand.ts` (modify) | load the clips; pick code or clip; pass the fingers |
| `src/dev/DevPanel.ts` (modify) | the `motion` switch and the status readout |

---

### Task 1: Fingers in the skeleton contract

**Files:**
- Modify: `src/surfer/rig.ts`
- Test: `src/surfer/rig.test.ts`

**Interfaces:**
- Produces:
  - `FINGER_BONES: readonly FingerBone[]` (30, ordered so each finger's 01, 02, 03 are consecutive);
  - `type FingerBone` (e.g. `'index_02_l'`);
  - `FINGER_PARENT: Record<FingerBone, BoneName | FingerBone>`;
  - `manifestProblems` accepts exactly `BONES` or exactly `BONES ∪ FINGER_BONES`.

- [ ] **Step 0: Make the worktree** (once, before any task)

```bash
cd /c/Dev/andrew-dev-personal-projects/liquid-dreaming
git worktree add ../ld-anim -b clip-slice main
cd ../ld-anim && npm install --no-audit --no-fund
```

  - Use a real `npm install`, **not** a junctioned `node_modules`. A junction deletes main's `node_modules` when the
    worktree is removed (memory: worktree-node-modules-junction).
  - Add a launch config so the worktree's game can be previewed beside main's. Edit main's `.claude/launch.json`, but
    don't commit it (it's Andrew's local file):
    `{ "name": "ld-anim", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "../ld-anim", "run", "dev", "--", "--port", "5187", "--strictPort"], "port": 5187 }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/surfer/rig.test.ts`:

```ts
import { FINGER_BONES, FINGER_PARENT } from './rig';

describe('the fingers (clip slice spec §2)', () => {
  it('are MPFB’s 30, each finger base under its hand and each joint under the one before', () => {
    expect(FINGER_BONES.length).toBe(30);
    expect(FINGER_PARENT.index_01_l).toBe('hand_l');
    expect(FINGER_PARENT.index_02_l).toBe('index_01_l');
    expect(FINGER_PARENT.thumb_03_r).toBe('thumb_02_r');
    FINGER_BONES.forEach((f, i) => {
      const p = FINGER_PARENT[f];
      if (!p.startsWith('hand_')) expect(FINGER_BONES.indexOf(p as never)).toBeLessThan(i);
    });
  });
  const manifest = (withFingers: boolean): SurferManifest => ({
    name: 't', heightM: 1.7,
    bones: [
      ...BONES.map((name) => ({ name, parent: PARENT[name], head: [0, 0, 0], tail: [0, 0.1, 0] })),
      ...(withFingers ? FINGER_BONES.map((name) => ({ name, parent: FINGER_PARENT[name], head: [0, 0, 0], tail: [0, 0.02, 0] })) : []),
    ],
  } as unknown as SurferManifest);
  // Fixture: legs that point down and a head high enough, so only the bone list is under test.
  const fix = (m: SurferManifest): SurferManifest => {
    for (const b of m.bones) {
      if (/^(thigh|shin)_/.test(b.name)) { b.head = [0, 1, 0]; b.tail = [0, 0.5, 0]; }
      if (b.name === 'head') { b.head = [0, 1.6, 0]; b.tail = [0, 1.7, 0]; }
    }
    return m;
  };
  it('accepts a 23-bone build (Review Focus 1) and a 53-bone one', () => {
    expect(manifestProblems(fix(manifest(false)))).toEqual([]);
    expect(manifestProblems(fix(manifest(true)))).toEqual([]);
  });
  it('rejects a half set of fingers and a finger under the wrong parent', () => {
    const half = fix(manifest(true));
    half.bones = half.bones.filter((b) => !b.name.endsWith('_r') || !FINGER_BONES.includes(b.name as never));
    expect(manifestProblems(half).join()).toMatch(/contract/);
    const wrong = fix(manifest(true));
    wrong.bones.find((b) => b.name === 'index_02_l')!.parent = 'hand_l';
    expect(manifestProblems(wrong).join()).toMatch(/index_02_l: parent hand_l/);
  });
});
```

Also add `manifestProblems` to the file's existing import from `./rig`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/surfer/rig.test.ts`
Expected: FAIL, because `FINGER_BONES` is not exported.

- [ ] **Step 3: Implement**

In `src/surfer/rig.ts`, after `PARENT`:

```ts
/** MPFB's finger bones (the UE4 mannequin's), kept since the clip slice (spec 2026-10-03 §2): three per finger, each
 * finger's in order, so a parent always comes first. The solver never writes them; a clip or the relaxed curl does. */
export const FINGER_BONES = (['l', 'r'] as const).flatMap((s) =>
  (['thumb', 'index', 'middle', 'ring', 'pinky'] as const).flatMap((f) => ([1, 2, 3] as const).map((i) => `${f}_0${i}_${s}` as const)));
export type FingerBone = (typeof FINGER_BONES)[number];

export const FINGER_PARENT = Object.fromEntries(FINGER_BONES.map((b) => {
  const [f, n, s] = b.split('_');
  return [b, n === '01' ? `hand_${s}` : `${f}_0${Number(n) - 1}_${s}`];
})) as Record<FingerBone, BoneName | FingerBone>;
```

In `manifestProblems`, replace the bone-list check (the two lines from `const names = ...` through its `out.push`):

```ts
  const names = JSON.stringify([...byName.keys()].sort());
  const core = JSON.stringify([...BONES].sort()), full = JSON.stringify([...BONES, ...FINGER_BONES].sort());
  // 23 bones (a build from before the clip slice) or 53 with the fingers (spec 2026-10-03 §2); never a part set.
  if (names !== core && names !== full) out.push(`bones ${names} ≠ contract ${full}`);
```

After the existing `for (const b of BONES)` loop, add:

```ts
  for (const f of FINGER_BONES) {
    const mb = byName.get(f);
    if (!mb) continue;
    if (mb.parent !== FINGER_PARENT[f]) out.push(`${f}: parent ${mb.parent} ≠ ${FINGER_PARENT[f]}`);
    if (Math.hypot(mb.tail[0] - mb.head[0], mb.tail[1] - mb.head[1], mb.tail[2] - mb.head[2]) < 0.005) out.push(`${f}: shorter than 5 mm`);
  }
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run src/surfer/rig.test.ts src/surfer/manifest.test.ts && npx tsc --noEmit`
Expected: PASS. The existing 23-bone `.glb` files still satisfy `manifestProblems`.

- [ ] **Step 5: Commit**

```bash
git add src/surfer/rig.ts src/surfer/rig.test.ts
git commit -m "feat(rig): the finger bones in the skeleton contract, optional until the rebuild (clip slice §2)"
```

---

### Task 2: The relaxed hand (finger maths)

**Files:**
- Create: `src/surfer/fingers.ts`
- Test: `src/surfer/fingers.test.ts`

**Interfaces:**
- Consumes: `FINGER_BONES`, `FINGER_PARENT`, `FingerBone`, `Limb`, `SurferManifest` (Task 1).
- Produces:
  - `interface FingerRest { head: Record<FingerBone, Vector3>; tail: Record<FingerBone, Vector3>; hand: Record<Limb, Vector3> }`
  - `fingerRestFromManifest(m: SurferManifest): FingerRest | null`
  - `palmNormal(rest: FingerRest, s: Limb): Vector3`
  - `relaxedFingerDeltas(rest: FingerRest): Record<FingerBone, Quaternion>`: each finger's rotation from rest, before
    the hand's own.
  - `fingerDeltas(handD: Record<Limb, Quaternion>, relaxed: Record<FingerBone, Quaternion>, clip?: Partial<Record<FingerBone, Quaternion>>): Record<FingerBone, Quaternion>`
  - `fingerLocals(handWorld: Record<Limb, Quaternion>, D: Record<FingerBone, Quaternion>, restQ: Record<FingerBone, Quaternion>): Record<FingerBone, Quaternion>`

- [ ] **Step 1: Write the failing tests**

`src/surfer/fingers.test.ts`:

```ts
import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { type FingerRest, fingerDeltas, fingerLocals, fingerRestFromManifest, palmNormal, relaxedFingerDeltas } from './fingers';
import { BONES, FINGER_BONES, FINGER_PARENT, type FingerBone, PARENT, type SurferManifest } from './rig';

/** Two hands hanging at the sides in an A-pose: fingers down (-Y), spread front (+Z) to back, palms toward the body. */
function restHands(): FingerRest {
  const head = {} as Record<FingerBone, Vector3>, tail = {} as Record<FingerBone, Vector3>;
  const hand = { l: new Vector3(0.6, 0.9, 0), r: new Vector3(-0.6, 0.9, 0) };
  const spread = { thumb: 0.035, index: 0.02, middle: 0.005, ring: -0.01, pinky: -0.025 } as const;
  for (const s of ['l', 'r'] as const) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) {
    const k = s === 'l' ? 1 : -1;
    let at = hand[s].clone().add(new Vector3(0.02 * k, -0.08, spread[f]));
    for (let i = 1; i <= 3; i++) {
      const b = `${f}_0${i}_${s}` as FingerBone;
      head[b] = at.clone();
      at = at.clone().add(new Vector3(0, -0.03, 0));
      tail[b] = at.clone();
    }
  }
  return { head, tail, hand };
}
/** A finger tip's position after rotating each joint by its delta (forward kinematics on the chain). */
function tip(r: FingerRest, D: Record<FingerBone, Quaternion>, f: string, s: 'l' | 'r'): Vector3 {
  let at = r.head[`${f}_01_${s}` as FingerBone].clone();
  for (let i = 1; i <= 3; i++) {
    const b = `${f}_0${i}_${s}` as FingerBone;
    at = at.add(r.tail[b].clone().sub(r.head[b]).applyQuaternion(D[b]));
  }
  return at;
}

describe('the relaxed hand (clip slice spec §2)', () => {
  const r = restHands();
  it('finds the palm facing the body: -X for the left hand, +X for the right', () => {
    expect(palmNormal(r, 'l').x).toBeLessThan(-0.9);
    expect(palmNormal(r, 'r').x).toBeGreaterThan(0.9);
  });
  it('curls every finger toward its palm, 15°, 35° and 50° down the chain (the thumb lighter)', () => {
    const D = relaxedFingerDeltas(r);
    for (const s of ['l', 'r'] as const) for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) {
      const ident = Object.fromEntries(FINGER_BONES.map((b) => [b, new Quaternion()])) as Record<FingerBone, Quaternion>;
      const moved = tip(r, D, f, s).sub(tip(r, ident, f, s));
      expect(moved.dot(palmNormal(r, s)), `${f}_${s}`).toBeGreaterThan(0.005);
    }
    const angle = (q: Quaternion): number => (2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI;
    expect(angle(D.index_01_l)).toBeCloseTo(15, 6);
    expect(angle(D.index_03_l)).toBeCloseTo(50, 6);
    expect(angle(D.thumb_03_r)).toBeCloseTo(23, 6);
  });
  it('rides on the hand: a turned hand turns the curl with it, and a clip’s fingers win', () => {
    const relaxed = relaxedFingerDeltas(r);
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7);
    const D = fingerDeltas({ l: turn, r: new Quaternion() }, relaxed, { index_02_l: new Quaternion(0, 0, 1, 0) });
    expect(D.middle_01_l.angleTo(turn.clone().multiply(relaxed.middle_01_l))).toBeLessThan(1e-9);
    expect(D.middle_01_r.angleTo(relaxed.middle_01_r)).toBeLessThan(1e-9);
    expect(D.index_02_l.angleTo(new Quaternion(0, 0, 1, 0))).toBeLessThan(1e-9);
  });
  it('gives three’s local rotations: the parent’s world × local is the finger’s world', () => {
    const restQ = Object.fromEntries(FINGER_BONES.map((b, i) => [b, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.01 * i)])) as Record<FingerBone, Quaternion>;
    const hand = { l: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.3), r: new Quaternion() };
    const D = relaxedFingerDeltas(r);
    const local = fingerLocals(hand, D, restQ);
    const world = (b: FingerBone): Quaternion => D[b].clone().multiply(restQ[b]);
    for (const b of FINGER_BONES) {
      const p = FINGER_PARENT[b];
      const pw = p.startsWith('hand_') ? hand[p.slice(-1) as 'l' | 'r'] : world(p as FingerBone);
      expect(pw.clone().multiply(local[b]).angleTo(world(b)), b).toBeLessThan(1e-9);
    }
  });
});

describe('finger rest from a manifest', () => {
  it('is null for a 23-bone build (Review Focus 1)', () => {
    const m = { name: 't', heightM: 1.7, bones: BONES.map((name) => ({ name, parent: PARENT[name], head: [0, 0, 0], tail: [0, 0.1, 0] })) } as unknown as SurferManifest;
    expect(fingerRestFromManifest(m)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/surfer/fingers.test.ts`
Expected: FAIL, because `./fingers` doesn't exist.

- [ ] **Step 3: Implement** `src/surfer/fingers.ts`

```ts
import { Quaternion, Vector3 } from 'three/webgpu';
import { FINGER_BONES, FINGER_PARENT, type FingerBone, type Limb, type SurferManifest } from './rig';

const DEG = Math.PI / 180;
/** The relaxed hand (clip slice spec §2): the flex at each knuckle, base to tip; the thumb lighter. */
export const RELAXED_FLEX_DEG = { finger: [15, 20, 15], thumb: [5, 10, 8] } as const;
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;

/** The fingers' rest joints, character rest frame (glTF axes, metres). */
export interface FingerRest {
  head: Record<FingerBone, Vector3>;
  tail: Record<FingerBone, Vector3>;
  hand: Record<Limb, Vector3>;
}

/** From a body's manifest; null for a build without fingers (from before the clip slice). */
export function fingerRestFromManifest(m: SurferManifest): FingerRest | null {
  const byName = new Map(m.bones.map((b) => [b.name, b]));
  if (!FINGER_BONES.every((f) => byName.has(f)) || !byName.has('hand_l') || !byName.has('hand_r')) return null;
  const head = {} as Record<FingerBone, Vector3>, tail = {} as Record<FingerBone, Vector3>;
  for (const f of FINGER_BONES) {
    head[f] = new Vector3(...byName.get(f)!.head);
    tail[f] = new Vector3(...byName.get(f)!.tail);
  }
  return { head, tail, hand: { l: new Vector3(...byName.get('hand_l')!.head), r: new Vector3(...byName.get('hand_r')!.head) } };
}

/** Out of the palm. At rest the hands hang at the sides, palms to the thighs: toward the body's midline. */
export function palmNormal(rest: FingerRest, s: Limb): Vector3 {
  const h = rest.hand[s];
  const n = rest.head[`index_01_${s}`].clone().sub(h).cross(rest.head[`pinky_01_${s}`].clone().sub(h)).normalize();
  return n.x * h.x > 0 ? n.negate() : n;
}

/**
 * Each finger bone's rotation from rest for the relaxed curl, before the hand's own: every knuckle of a finger flexes
 * about that finger's hinge (its base's rest direction × the palm normal), so the finger curls toward the palm.
 */
export function relaxedFingerDeltas(rest: FingerRest): Record<FingerBone, Quaternion> {
  const out = {} as Record<FingerBone, Quaternion>;
  for (const s of ['l', 'r'] as const) {
    const n = palmNormal(rest, s);
    for (const f of FINGERS) {
      const base = `${f}_01_${s}` as FingerBone;
      const axis = rest.tail[base].clone().sub(rest.head[base]).normalize().cross(n);
      const flex = f === 'thumb' ? RELAXED_FLEX_DEG.thumb : RELAXED_FLEX_DEG.finger;
      let total = 0;
      for (let i = 0; i < 3; i++) {
        total += flex[i];
        out[`${f}_0${i + 1}_${s}` as FingerBone] = axis.lengthSq() < 1e-12 ? new Quaternion() : new Quaternion().setFromAxisAngle(axis.clone().normalize(), total * DEG);
      }
    }
  }
  return out;
}

/** Every finger's world rotation from rest: the clip's where it has one, else the relaxed curl carried by its hand. */
export function fingerDeltas(handD: Record<Limb, Quaternion>, relaxed: Record<FingerBone, Quaternion>, clip?: Partial<Record<FingerBone, Quaternion>>): Record<FingerBone, Quaternion> {
  const out = {} as Record<FingerBone, Quaternion>;
  for (const f of FINGER_BONES) out[f] = clip?.[f]?.clone() ?? handD[f.slice(-1) as Limb].clone().multiply(relaxed[f]);
  return out;
}

/** What three's Bone.quaternion takes: world = D × rest, local = the parent's world⁻¹ × world (parents first). */
export function fingerLocals(handWorld: Record<Limb, Quaternion>, D: Record<FingerBone, Quaternion>, restQ: Record<FingerBone, Quaternion>): Record<FingerBone, Quaternion> {
  const world = {} as Record<FingerBone, Quaternion>, local = {} as Record<FingerBone, Quaternion>;
  for (const f of FINGER_BONES) {
    world[f] = D[f].clone().multiply(restQ[f]);
    const p = FINGER_PARENT[f];
    const pw = p.startsWith('hand_') ? handWorld[p.slice(-1) as Limb] : world[p as FingerBone];
    local[f] = pw.clone().invert().multiply(world[f]);
  }
  return local;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run src/surfer/fingers.test.ts && npx tsc --noEmit`
Expected: PASS. (The thumb's 23° is 5 + 10 + 8.)

- [ ] **Step 5: Commit**

```bash
git add src/surfer/fingers.ts src/surfer/fingers.test.ts
git commit -m "feat(fingers): the relaxed hand: each finger curls toward its palm, carried by the hand (clip slice §2)"
```

---

### Task 3: Rebuild the riders with fingers (Blender), then Gate A turntables

**Files:**
- Modify: `tools/surfer/rig_trim.py`
- Modify: `src/surfer/manifest.test.ts`
- Modify: `.gitignore` (add `tools/surfer/previews-before/`)
- Regenerated: `public/surfer/{female,male,grommet}.glb`, `*.manifest.json`, `beachPile.glb`, `hairAtlas.*`

**Interfaces:**
- Consumes: `FINGER_BONES` (Task 1).
- Produces: built riders whose skin has 53 joints, with the finger bones under their MPFB names.

- [ ] **Step 1: Keep the "before" turntables for Gate A**

```bash
cp -r tools/surfer/previews tools/surfer/previews-before 2>/dev/null || (npm run build:surfers && cp -r tools/surfer/previews tools/surfer/previews-before)
printf 'tools/surfer/previews-before/\n' >> .gitignore
```

If `tools/surfer/previews/` is empty in the worktree, the second branch builds the current rig first. That's a
deliberate extra build, so "before" and "after" come from the same Blender.

- [ ] **Step 2: Write the failing test**

In `src/surfer/manifest.test.ts`:
- add `FINGER_BONES` to the `./rig` import;
- change the `skins to exactly the contract bones` assertion to
  `toEqual([...BONES, ...FINGER_BONES].sort())`, and rename it to `'skins to the contract bones and the fingers (clip slice §2)'`;
- add inside the `describe`:

```ts
    it('weights every finger to part of its hand (clip slice §2: fingers no longer merged into the hand)', () => {
      const path = `public/surfer/${name}.glb`, joints: string[] = gltf.skins[0].joints.map((i: number) => gltf.nodes[i].name);
      const used = new Set<string>();
      for (const mesh of gltf.meshes) for (const prim of mesh.primitives) {
        if (gltf.materials[prim.material].name !== 'body' || prim.attributes.JOINTS_0 === undefined) continue;
        const J = glbValues(path, gltf, prim.attributes.JOINTS_0), W = glbValues(path, gltf, prim.attributes.WEIGHTS_0);
        for (let i = 0; i < J.length; i++) if (W[i] > 0.3) used.add(joints[J[i]]);
      }
      expect(FINGER_BONES.filter((f) => !used.has(f))).toEqual([]);
    });
```

Run: `npx vitest run src/surfer/manifest.test.ts`
Expected: FAIL. The current builds skin to 23 joints and have no finger weights.

- [ ] **Step 3: Keep the fingers in `rig_trim.py`**

After `PARENT = {...}` add:

```python
# MPFB's finger bones, kept with their own weights since the clip slice (spec 2026-10-03 §2): a clip curls them.
FINGERS = [f"{f}_{i:02d}_{s}" for s in "lr" for f in ("thumb", "index", "middle", "ring", "pinky") for i in (1, 2, 3)]
```

In `trim()`:
- change `keep = set(BONE_MAP)` to `keep = set(BONE_MAP) | set(FINGERS)`;
- extend the `missing` check to the fingers:
  `missing = [s for s in [*BONE_MAP, *FINGERS] if s not in have and s != "Root"]`;
- change the final vertex-group cleanup to keep the fingers' groups:

```python
    for g in list(body.vertex_groups):
        if g.name not in PARENT and g.name != "root" and g.name not in FINGERS:
            body.vertex_groups.remove(g)
```

The finger bones keep MPFB's parenting (`hand_l` keeps its name through `BONE_MAP`), so nothing else in `trim()` changes.

Also update the module docstring and README step 3: *"The rig is trimmed to the game's 23-bone skeleton plus MPFB's
30 finger bones (clip slice spec §2)…"*.

- [ ] **Step 4: Rebuild every rider and run the tests**

```bash
npm run build:surfers
npx vitest run src/surfer && npx tsc --noEmit
```

Expected: everything passes: the new manifest tests, the triangle budget, and the ≤ 4 weights (`limit_weights` is
unchanged).
- If a garment/pack/pile step fails on the new bones, read its error. `clothes.py` and `pile.py` copy weights by
  vertex group name, and any list that enumerates the 23 contract names must also accept `FINGERS`.
- Fix the failing step at its source, not here.

- [ ] **Step 5: Commit**

```bash
git add tools/surfer/rig_trim.py tools/surfer/README.md src/surfer/manifest.test.ts .gitignore public/surfer
git commit -m "feat(build): the riders keep MPFB's finger bones and weights; rebuilt (clip slice §2)"
```

Gate A's in-game half needs Task 4, so the gate itself comes at the end of Task 4.

---

### Task 4: The surfer poses its fingers, then Gate A

**Files:**
- Modify: `src/surfer/Surfer.ts`

**Interfaces:**
- Consumes:
  - `FINGER_BONES`, `FingerBone` (Task 1);
  - `fingerRestFromManifest`, `relaxedFingerDeltas`, `fingerDeltas`, `fingerLocals` (Task 2).
- Produces: `Surfer.applyPose(p: SolvedPose, fingers?: Partial<Record<FingerBone, THREE.Quaternion>>): void`. Fingers
  come from the clip's world rotations from rest where given, otherwise the relaxed curl. A body without finger bones
  ignores them.

- [ ] **Step 1: Collect the finger bones**

In `Surfer.ts`:
- add `FINGER_BONES, type FingerBone` to the `./rig` import;
- add `import { fingerDeltas, fingerLocals, fingerRestFromManifest, relaxedFingerDeltas } from './fingers';`.

Fields beside `bones`:

```ts
  /** The finger bones (clip slice spec §2), when this build has them: posed by a clip, or curled relaxed. */
  private readonly fingerBones = {} as Partial<Record<FingerBone, THREE.Bone>>;
  private fingerRestQ: Record<FingerBone, THREE.Quaternion> | null = null;
  private relaxed: Record<FingerBone, THREE.Quaternion> | null = null;
```

In the constructor's traverse callback (line 104), also collect the fingers:

```ts
      if ((o as THREE.Bone).isBone && (FINGER_BONES as readonly string[]).includes(o.name)) this.fingerBones[o.name as FingerBone] = o as THREE.Bone;
```

After `this.rest = restFromManifest(manifest, restQ);`:

```ts
    // Fingers only when the build has them all (a 23-bone build from before the clip slice poses without them).
    const fingerRest = fingerRestFromManifest(manifest);
    if (fingerRest && FINGER_BONES.every((f) => this.fingerBones[f])) {
      this.fingerRestQ = Object.fromEntries(FINGER_BONES.map((f) => [f, this.fingerBones[f]!.getWorldQuaternion(new THREE.Quaternion())])) as Record<FingerBone, THREE.Quaternion>;
      this.relaxed = relaxedFingerDeltas(fingerRest);
    }
```

This must run where the rest pose is still in place, i.e. beside the existing `restQ` loop, before any pose.

- [ ] **Step 2: Pose them in `applyPose`**

```ts
  applyPose(p: SolvedPose, fingers?: Partial<Record<FingerBone, THREE.Quaternion>>): void {
    // ...existing body unchanged...
    if (this.relaxed && this.fingerRestQ) {
      const handD = {
        l: p.world.hand_l.clone().multiply(this.rest.restQ.hand_l.clone().invert()),
        r: p.world.hand_r.clone().multiply(this.rest.restQ.hand_r.clone().invert()),
      };
      const local = fingerLocals({ l: p.world.hand_l, r: p.world.hand_r }, fingerDeltas(handD, this.relaxed, fingers), this.fingerRestQ);
      for (const f of FINGER_BONES) this.fingerBones[f]!.quaternion.copy(local[f]);
    }
  }
```

- [ ] **Step 3: Check it builds and nothing regressed**

Run: `npx tsc --noEmit && npx vitest run src/surfer`
Expected: PASS (311 + the new tests).

- [ ] **Step 4: See it in the game**
  - Start the worktree's server: `preview_start` with `ld-anim` (port 5187).
  - Capture `surfer-lineup-sit` with pose `trim`, from the side at water level. Use the recipe in memory
    `small-fixes-light-process`:
    - build the moment with a throwaway vitest that dumps `findReferenceMoment('surfer-lineup-sit')`;
    - set `surfer.pose = 'trim'`;
    - run `npx electron tools/captureMoments.mjs --base=http://localhost:5187/ ...` with a `--pre` that re-applies
      `surferParams`;
    - put the camera 2.6 m off the surfer's right side at 0.7 m.
  - Expected: hands rest in a gentle curl, not flat and splayed.

- [ ] **Step 5: Commit**

```bash
git add src/surfer/Surfer.ts
git commit -m "feat(surfer): pose the fingers: a clip's, or the relaxed curl carried by the hand (clip slice §2)"
```

- [ ] **Step 6: GATE A — stop for Andrew**
  - Make side-by-side sheets: for each `tools/surfer/previews/<name>.png` with a twin in `previews-before/`, stack them
    (before above, after below) into `tools/surfer/previews/compare/<name>.png`:

    ```bash
    python -c "import glob,os;from PIL import Image;os.makedirs('tools/surfer/previews/compare',exist_ok=True);[(lambda a,b:(lambda o:(o.paste(a,(0,0)),o.paste(b,(0,a.height)),o.save('tools/surfer/previews/compare/'+os.path.basename(p))))(Image.new('RGB',(max(a.width,b.width),a.height+b.height))))(Image.open(p.replace('previews','previews-before',1)).convert('RGB'),Image.open(p).convert('RGB')) for p in glob.glob('tools/surfer/previews/*.png') if os.path.exists(p.replace('previews','previews-before',1))]"
    ```

  - Send Andrew the compare sheets for each rider's body, face and outfits, plus the in-game hand capture
    (SendUserFile).
  - Ask: *are faces, hair and outfits unchanged, and do the hands look relaxed?*
  - **Do not start Task 8 until he signs off.** Tasks 5–7 don't depend on the gate and may proceed.

---

### Task 5: Andrew gets the clip (manual; runs in parallel from the start)

**Files:**
- Create: `tools/surfer/clips.json`

**Interfaces:**
- Produces: `anim-source/trim.fbx` in the **main** checkout (`C:\Dev\andrew-dev-personal-projects\liquid-dreaming\anim-source\`),
  git-ignored. Also `tools/surfer/clips.json`.

- [ ] **Step 1: Send Andrew these steps** (as one message):
  1. Go to **epicgames.com → Download** and install the **Epic Games Launcher**. Sign in, or create an account
     yourself.
  2. In the launcher: **Unreal Engine → Library → +** to install the latest **Unreal Engine 5**. It's a large
     download; the default options are fine.
  3. On **fab.com**, watch the previews of:
     - **"Surfing Anim Pack"** by Jane Gintsar (about US$5–10);
     - **"Surfing Animation"** by NexaFrame (about US$15).

     Pick the one whose **riding / balancing** clip looks most like a real surfer trimming. Buy it yourself.

     Note on the listing page **which skeleton it uses** ("UE4 Mannequin" or "UE5 Manny/Quinn").
  4. In the launcher: **Unreal Engine → Library → Fab Library**. Find the pack and click **Add to Project**. If you
     have no project, first create one: **Games → Blank**, no starter content, name it `AnimExport`.
  5. Open `AnimExport`. In the **Content Browser**, open the pack's folder and find the riding/balancing animation (an
     **AnimSequence**, green icon).
     - Double-click it to check it's the right one.
     - Note **which foot is forward**: left foot forward is **regular**, right foot forward is **goofy**.
  6. Right-click the AnimSequence → **Asset Actions → Export…** → **FBX**. Save it as
     `C:\Dev\andrew-dev-personal-projects\liquid-dreaming\anim-source\trim.fbx`, creating the `anim-source` folder.
     Keep the default options.
  7. **Back up** `anim-source\` somewhere outside git (OneDrive is fine). It isn't in GitHub, on purpose.
  8. Tell me:
     - the pack you bought;
     - the skeleton (UE4 or UE5);
     - which foot is forward;
     - roughly where the clip's good loop starts and ends, if it isn't the whole clip.

- [ ] **Step 2: Record the clip list** — `tools/surfer/clips.json` (fill in from Andrew's answers):

```json
{
  "fps": 30,
  "clips": [
    { "name": "trim", "file": "trim.fbx", "start": null, "end": null, "sourceFps": null, "loop": true, "sourceSkeleton": "ue4", "noseSide": "left" }
  ]
}
```

- `noseSide`: `"left"` for left foot forward (regular), `"right"` for right foot forward (goofy).
- `start` / `end`: source frame numbers, or null for the whole action.
- `sourceFps`: null means use Blender's scene rate after import. Set it only if Gate B shows the wrong speed.

- [ ] **Step 3: Commit**

```bash
git add tools/surfer/clips.json
git commit -m "chore(clips): the clip list: the riding clip from Andrew's Fab pack (no licensed data)"
```

---

### Task 6: Clip format, loader, mirror and sampler

**Files:**
- Create: `src/surfer/clips.ts`, `src/surfer/clipPlayer.ts`, `src/surfer/clipFixture.ts`
- Test: `src/surfer/clips.test.ts`

**Interfaces:**
- Consumes: `BONES`, `FINGER_BONES`, `SkeletonRest`, `measures` (rig); `PoseName`; `Stance`.
- Produces (`clips.ts`):
  - `interface BakedClip { loop: boolean; frames: number; noseSide: 'left' | 'right'; pelvis: number[]; rot: Record<string, number[]> }`
  - `interface RiderClips { rider: string; fps: number; clips: Record<string, BakedClip> }`
  - `POSE_CLIP: Partial<Record<PoseName, string>>` = `{ trim: 'trim' }`
  - `riderClipsProblems(j: unknown): string[]`
  - `loadRiderClips(url: string, fetchFn?: typeof fetch): Promise<RiderClips | null>`
  - `mirrorClip(c: BakedClip): BakedClip`
  - `clipFor(rc: RiderClips, name: string, stance: Stance): BakedClip | null`
  - `clipDuration(rc: RiderClips, c: BakedClip): number`
- Produces (`clipPlayer.ts`):
  - `interface ClipSample { pelvis: Vector3; rot: Partial<Record<string, Quaternion>> }`
  - `sampleClip(c: BakedClip, fps: number, t: number): ClipSample`
- Produces (`clipFixture.ts`): `syntheticRiderClips(rest: SkeletonRest, opts?: { fingers?: boolean }): RiderClips`.
  A 2 s, 60-frame regular loop.

- [ ] **Step 1: Write the fixture** — `src/surfer/clipFixture.ts`

```ts
import { Quaternion, Vector3 } from 'three/webgpu';
import type { RiderClips } from './clips';
import { BONES, FINGER_BONES, type SkeletonRest } from './rig';

const DEG = Math.PI / 180;
const ax = (x: number, y: number, z: number, deg: number): Quaternion => new Quaternion().setFromAxisAngle(new Vector3(x, y, z), deg * DEG);

/**
 * A made-up riding loop for tests (clip slice spec §5): the paid clip isn't in git. 2 s at 30 fps, nose on the
 * character's left (regular): the thighs spread and bent forward, the shins near upright, the arms out, a 2 cm pelvis
 * bob and a wrist roll. `fingers` adds the finger bones (following their hands) to test that they pass through.
 */
export function syntheticRiderClips(rest: SkeletonRest, opts: { fingers?: boolean } = {}): RiderClips {
  const frames = 60, fps = 30;
  const h0 = 0.9 * (rest.joint.pelvis.y - rest.joint.foot_l.y);
  const pelvis: number[] = [], rot: Record<string, number[]> = {};
  const push = (b: string, q: Quaternion): void => { (rot[b] ??= []).push(q.x, q.y, q.z, q.w); };
  for (let i = 0; i < frames; i++) {
    const w = Math.sin((2 * Math.PI * i) / frames);
    pelvis.push(0, h0 + 0.02 * w, 0);
    const D: Record<string, Quaternion> = {};
    for (const b of BONES) D[b] = new Quaternion();
    D.thigh_l = ax(0, 0, 1, 14).multiply(ax(1, 0, 0, -30));
    D.thigh_r = ax(0, 0, 1, -14).multiply(ax(1, 0, 0, -30));
    D.shin_l = ax(0, 0, 1, 14).multiply(ax(1, 0, 0, 10));
    D.shin_r = ax(0, 0, 1, -14).multiply(ax(1, 0, 0, 10));
    for (const [s, k] of [['l', 1], ['r', -1]] as const) {
      D[`upperarm_${s}`] = ax(0, 0, 1, 40 * k);
      D[`forearm_${s}`] = ax(0, 0, 1, 40 * k);
      D[`hand_${s}`] = ax(0, 0, 1, 40 * k).multiply(ax(0, 1, 0, 10 * w));
    }
    for (const b of BONES) if (b !== 'root') push(b, D[b]);
    if (opts.fingers) for (const f of FINGER_BONES) push(f, D[`hand_${f.slice(-1)}`]);
  }
  return { rider: 'test', fps, clips: { trim: { loop: true, frames, noseSide: 'left', pelvis, rot } } };
}
```

- [ ] **Step 2: Write the failing tests** — `src/surfer/clips.test.ts`

```ts
import { Quaternion } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { syntheticRiderClips } from './clipFixture';
import { sampleClip } from './clipPlayer';
import { clipDuration, clipFor, loadRiderClips, mirrorClip, riderClipsProblems } from './clips';
import { referenceSkeleton } from './rig';

const rc = syntheticRiderClips(referenceSkeleton(1.7), { fingers: true });
const trim = rc.clips.trim;
const deg = (a: Quaternion, b: Quaternion): number => (a.angleTo(b) * 180) / Math.PI;
const fakeFetch = (status: number, body: string, type: string) => (async () => new Response(body, { status, headers: { 'content-type': type } })) as unknown as typeof fetch;

describe('baked clips (clip slice spec §3.3, §4.2)', () => {
  it('the synthetic clip is well formed', () => expect(riderClipsProblems(rc)).toEqual([]));
  it('names what is wrong: lengths, unknown bones, non-numbers (Review Focus 3)', () => {
    const bad = structuredClone(rc);
    bad.clips.trim.pelvis.pop();
    bad.clips.trim.rot.tail_l = [0, 0, 0, 1];
    bad.clips.trim.rot.head[0] = Number.NaN;
    const p = riderClipsProblems(bad).join(' | ');
    expect(p).toMatch(/pelvis/);
    expect(p).toMatch(/tail_l/);
    expect(p).toMatch(/head/);
    expect(riderClipsProblems({ fps: 30 }).length).toBeGreaterThan(0);
  });
  it('loads: a 404 or Vite’s index.html fallback is “not built”; a broken file throws, naming it (Review Focus 2, 3)', async () => {
    expect(await loadRiderClips('x.clips.json', fakeFetch(404, '', 'text/html'))).toBeNull();
    expect(await loadRiderClips('x.clips.json', fakeFetch(200, '<!doctype html>', 'text/html'))).toBeNull();
    expect(await loadRiderClips('x.clips.json', fakeFetch(200, JSON.stringify(rc), 'application/json'))).toEqual(rc);
    await expect(loadRiderClips('x.clips.json', fakeFetch(200, '{"fps":30}', 'application/json'))).rejects.toThrow(/x\.clips\.json/);
    await expect(loadRiderClips('x.clips.json', fakeFetch(500, '', 'text/plain'))).rejects.toThrow(/500/);
  });
  it('mirrors: left and right swapped, reflected in x = 0; twice is the original', () => {
    const m = mirrorClip(trim);
    expect(m.noseSide).toBe('right');
    expect(m.rot.thigh_r[0]).toBeCloseTo(trim.rot.thigh_l[0], 12);
    expect(m.rot.thigh_r[1]).toBeCloseTo(-trim.rot.thigh_l[1], 12);
    expect(m.pelvis[0]).toBeCloseTo(-trim.pelvis[0], 12);
    const back = mirrorClip(m);
    for (const [b, q] of Object.entries(trim.rot)) q.forEach((v, i) => expect(Math.abs(back.rot[b][i] - v)).toBeLessThan(1e-6));
  });
  it('picks the stance: regular plays a left-nosed clip as is, goofy its mirror (cached)', () => {
    expect(clipFor(rc, 'trim', 'regular')).toBe(trim);
    const g = clipFor(rc, 'trim', 'goofy')!;
    expect(g.noseSide).toBe('right');
    expect(clipFor(rc, 'trim', 'goofy')).toBe(g);
    expect(clipFor(rc, 'paddle', 'regular')).toBeNull();
    expect(clipDuration(rc, trim)).toBeCloseTo(2, 12);
  });
});

describe('sampling (clip slice spec §4.1 step 1)', () => {
  const q = (i: number, b = 'hand_l'): Quaternion => new Quaternion(...(trim.rot[b].slice(4 * i, 4 * i + 4) as [number, number, number, number]));
  it('is exact at frame times', () => {
    const s = sampleClip(trim, 30, 7 / 30);
    expect(deg(s.rot.hand_l!, q(7))).toBeLessThan(1e-6);
    expect(s.pelvis.y).toBeCloseTo(trim.pelvis[3 * 7 + 1], 9);
  });
  it('slerps between frames', () => {
    const s = sampleClip(trim, 30, 7.5 / 30);
    expect(Math.abs(deg(s.rot.hand_l!, q(7)) - deg(s.rot.hand_l!, q(8)))).toBeLessThan(1e-6);
  });
  it('loops with no jump at the seam (< 2°), and wraps negative times', () => {
    const end = sampleClip(trim, 30, 2 - 1e-6), start = sampleClip(trim, 30, 0);
    for (const b of Object.keys(trim.rot)) expect(deg(end.rot[b]!, start.rot[b]!), b).toBeLessThan(2);
    expect(deg(sampleClip(trim, 30, -0.5).rot.hand_l!, sampleClip(trim, 30, 1.5).rot.hand_l!)).toBeLessThan(1e-6);
  });
  it('holds the ends of a clip that doesn’t loop', () => {
    const once = { ...trim, loop: false };
    expect(deg(sampleClip(once, 30, 99).rot.hand_l!, q(59))).toBeLessThan(1e-6);
    expect(deg(sampleClip(once, 30, -3).rot.hand_l!, q(0))).toBeLessThan(1e-6);
  });
});
```

Run: `npx vitest run src/surfer/clips.test.ts`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 3: Implement `src/surfer/clips.ts`**

```ts
import type { PoseName } from './poseNames';
import type { Stance } from './presets';
import { BONES, FINGER_BONES } from './rig';

/**
 * One baked clip (clip slice spec §3.3), in the character rest frame (glTF axes: +Y up, +Z facing, +X the character's
 * left). Per frame: the pelvis joint from the ankles' midpoint (3 numbers, metres), and every bone's world rotation
 * from rest (4 numbers, x y z w), what solvePose calls D. Bones the source lacks (fingers, often) are absent.
 */
export interface BakedClip {
  loop: boolean;
  frames: number;
  /** Which side of the character the board's nose is on: 'left' for a regular-footed source. */
  noseSide: 'left' | 'right';
  pelvis: number[];
  rot: Record<string, number[]>;
}
export interface RiderClips {
  rider: string;
  fps: number;
  clips: Record<string, BakedClip>;
}

/** The poses a clip plays (§4.2): this slice has one. */
export const POSE_CLIP: Partial<Record<PoseName, string>> = { trim: 'trim' };

const KNOWN = new Set<string>([...BONES, ...FINGER_BONES]);
const REQUIRED = BONES.filter((b) => b !== 'root');
const finite = (a: unknown, n: number): boolean => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));

/** Everything wrong with a clips file (empty = fine): a stale bake or a hand edit must fail the load, not a frame. */
export function riderClipsProblems(j: unknown): string[] {
  const out: string[] = [];
  const o = j as Partial<RiderClips> | null;
  if (typeof o !== 'object' || o === null) return ['not an object'];
  if (typeof o.fps !== 'number' || !(o.fps > 0)) out.push('fps');
  if (typeof o.clips !== 'object' || o.clips === null) return [...out, 'clips'];
  for (const [name, c] of Object.entries(o.clips)) {
    if (!Number.isInteger(c.frames) || c.frames < 2) { out.push(`${name}: frames`); continue; }
    if (c.noseSide !== 'left' && c.noseSide !== 'right') out.push(`${name}: noseSide`);
    if (typeof c.loop !== 'boolean') out.push(`${name}: loop`);
    if (!finite(c.pelvis, 3 * c.frames)) out.push(`${name}: pelvis`);
    for (const b of REQUIRED) if (!(b in (c.rot ?? {}))) out.push(`${name}: no ${b}`);
    for (const [b, q] of Object.entries(c.rot ?? {})) {
      if (!KNOWN.has(b)) out.push(`${name}: unknown bone ${b}`);
      else if (!finite(q, 4 * c.frames)) out.push(`${name}: ${b}`);
    }
  }
  return out;
}

/**
 * A rider's baked clips (§4.2): null when not built. A 404, or the index.html Vite's dev server answers a missing file
 * with (Review Focus 2). Throws, naming the file, on anything else wrong.
 */
export async function loadRiderClips(url: string, fetchFn: typeof fetch = fetch): Promise<RiderClips | null> {
  const res = await fetchFn(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
  const j: unknown = await res.json();
  const problems = riderClipsProblems(j);
  if (problems.length) throw new Error(`${url}: ${problems.slice(0, 3).join('; ')}`);
  return j as RiderClips;
}

const otherSide = (b: string): string => (b.endsWith('_l') ? `${b.slice(0, -2)}_r` : b.endsWith('_r') ? `${b.slice(0, -2)}_l` : b);

/** The clip for the other foot forward (§3.3 step 6): left and right swapped, everything reflected in x = 0. */
export function mirrorClip(c: BakedClip): BakedClip {
  const rot: Record<string, number[]> = {};
  for (const [b, q] of Object.entries(c.rot)) rot[otherSide(b)] = q.map((v, i) => (i % 4 === 1 || i % 4 === 2 ? -v : v));
  return { ...c, noseSide: c.noseSide === 'left' ? 'right' : 'left', pelvis: c.pelvis.map((v, i) => (i % 3 === 0 ? -v : v)), rot };
}

const mirrored = new WeakMap<BakedClip, BakedClip>();
/** The named clip with the nose on the stance's side (regular: the character's left), mirrored once if need be. */
export function clipFor(rc: RiderClips, name: string, stance: Stance): BakedClip | null {
  const c = rc.clips[name];
  if (!c) return null;
  if (c.noseSide === (stance === 'regular' ? 'left' : 'right')) return c;
  let m = mirrored.get(c);
  if (!m) mirrored.set(c, (m = mirrorClip(c)));
  return m;
}

/** Seconds: a loop includes the step from its last frame back to its first. */
export const clipDuration = (rc: RiderClips, c: BakedClip): number => (c.loop ? c.frames : c.frames - 1) / rc.fps;
```

- [ ] **Step 4: Implement `src/surfer/clipPlayer.ts`**

```ts
import { Quaternion, Vector3 } from 'three/webgpu';
import type { BakedClip } from './clips';

/** A clip at one moment: the pelvis from the ankles' midpoint, and each bone's world rotation from rest. */
export interface ClipSample {
  pelvis: Vector3;
  rot: Partial<Record<string, Quaternion>>;
}

/** The clip at t seconds (§4.1 step 1): between frames, slerped; a loop wraps, a one-shot holds its ends. */
export function sampleClip(c: BakedClip, fps: number, t: number): ClipSample {
  let i0: number, i1: number, u: number;
  if (c.loop) {
    u = (((t * fps) % c.frames) + c.frames) % c.frames;
    if (!(u < c.frames)) u = 0; // float rounding at the wrap
    i0 = Math.floor(u);
    i1 = (i0 + 1) % c.frames;
  } else {
    u = Math.min(Math.max(t * fps, 0), c.frames - 1);
    i0 = Math.min(Math.floor(u), c.frames - 2);
    i1 = i0 + 1;
  }
  const f = u - i0;
  const P = (i: number): Vector3 => new Vector3(c.pelvis[3 * i], c.pelvis[3 * i + 1], c.pelvis[3 * i + 2]);
  const Q = (q: number[], i: number): Quaternion => new Quaternion(q[4 * i], q[4 * i + 1], q[4 * i + 2], q[4 * i + 3]);
  const rot: Partial<Record<string, Quaternion>> = {};
  for (const [b, q] of Object.entries(c.rot)) rot[b] = Q(q, i0).slerp(Q(q, i1), f);
  return { pelvis: P(i0).lerp(P(i1), f), rot };
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `npx vitest run src/surfer/clips.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/surfer/clips.ts src/surfer/clipPlayer.ts src/surfer/clipFixture.ts src/surfer/clips.test.ts
git commit -m "feat(clips): the baked clip format, loader, stance mirror and sampler (clip slice §3.3, §4.1-4.2)"
```

---

### Task 7: The clip on the board (`clipPose`)

**Files:**
- Create: `src/surfer/clipPose.ts`
- Test: `src/surfer/clipPose.test.ts`

**Interfaces:**
- Consumes:
  - `ClipSample` (Task 6);
  - `twoBoneIK`, `aimRotation`, `minReach` (`ik.ts`);
  - `BoardFrame`, `SolvedPose`, `boardQuaternion` (`solvePose.ts`);
  - `PoseDials` (`poses.ts`);
  - `Balance` (`balance.ts`);
  - `BoardSpec`, `BoardLayout` (`boardSpec.ts`).
- Produces:
  - `interface ClipPoseContext { spec: BoardSpec; layout: BoardLayout; stance: Stance; dials: PoseDials; balance: Balance | null }`.
    `dials.compression` already includes the balance's compression: `SurferStand` adds it, as for the code poses.
  - `interface ClipSolved extends SolvedPose { fingers: Partial<Record<FingerBone, Quaternion>> }`: the fingers' world
    rotations from rest.
  - `clipPose(rest: SkeletonRest, sample: ClipSample, ctx: ClipPoseContext, board: BoardFrame, lookAt: Vector3 | null): ClipSolved`
  - `CLIP_LEAN_MAX`, `CLIP_TWIST_DIAL`, `CLIP_COMPRESSION_DROP`.

- [ ] **Step 1: Write the failing tests** — `src/surfer/clipPose.test.ts`

```ts
import { Euler, Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { deckYAt, halfWidthAt, layoutFor, uAt } from '../board/boardSpec';
import { balanceAt } from './balance';
import { syntheticRiderClips } from './clipFixture';
import { sampleClip } from './clipPlayer';
import { type ClipPoseContext, clipPose } from './clipPose';
import { clipFor } from './clips';
import { flexDeg } from './ik';
import { PRESETS, type Stance, boardFor } from './presets';
import { BONES, LIMITS, measures, referenceSkeleton } from './rig';
import { type BoardFrame, boardQuaternion } from './solvePose';

const frame = (e: Euler, p = new Vector3(3, 1, -2)): BoardFrame => {
  const q = new Quaternion().setFromEuler(e);
  return { position: p, forward: new Vector3(1, 0, 0).applyQuaternion(q), up: new Vector3(0, 1, 0).applyQuaternion(q) };
};
const FLAT = frame(new Euler(0, 0, 0), new Vector3());
const FRAMES = [FLAT, frame(new Euler(0.3, 1.1, -0.5)), frame(new Euler(0, 0, 1.22)), frame(new Euler(1.05, 0.4, 0))];
const LEVELS = [-1, 0, 1];
const RIDERS = (['female', 'male'] as const).map((name) => ({ name, preset: PRESETS[name], rest: referenceSkeleton(PRESETS[name].heightM) }));
const STANCES: Stance[] = ['regular', 'goofy'];
const KINDS = ['thruster', 'stepUp'] as const;

function setup(name: 'female' | 'male', kind: (typeof KINDS)[number], stance: Stance) {
  const { preset, rest } = RIDERS.find((r) => r.name === name)!;
  const spec = boardFor(preset, kind), layout = layoutFor(spec, rest.heightM);
  const rc = syntheticRiderClips(rest);
  return { rest, spec, layout, rc, clip: clipFor(rc, 'trim', stance)! };
}
const ctxOf = (s: ReturnType<typeof setup>, stance: Stance, c = 0, l = 0, tw = 0, bal: ClipPoseContext['balance'] = null): ClipPoseContext =>
  ({ spec: s.spec, layout: s.layout, stance, dials: { compression: c, lean: l, twist: tw, reach: 0 }, balance: bal });

describe('the clip on the board (clip slice spec §4.1, §5)', () => {
  it('plants each ankle on its spot (≤ 5 mm), knees toward the toes and within limits, nothing through the deck: every rider, board, stance, time, dial and balance', () => {
    const worst: string[] = [];
    for (const { name } of RIDERS) for (const kind of KINDS) for (const stance of STANCES) {
      const s = setup(name, kind, stance), m = measures(s.rest);
      const lead = stance === 'regular' ? 'l' : 'r', trail = lead === 'l' ? 'r' : 'l', f = new Vector3(0, 0, stance === 'regular' ? 1 : -1);
      const want = { [lead]: new Vector3(...s.layout.spots.front).setY(s.layout.spots.front[1] + m.ankleH), [trail]: new Vector3(...s.layout.spots.back).setY(s.layout.spots.back[1] + m.ankleH) } as Record<'l' | 'r', Vector3>;
      for (let i = 0; i < 32; i++) {
        const t = (2 * i) / 32, sample = sampleClip(s.clip, s.rc.fps, t);
        for (const c of LEVELS) for (const l of LEVELS) for (const tw of LEVELS) for (const bal of [null, balanceAt(7, t, 1, 0.5)]) {
          const J = clipPose(s.rest, sample, ctxOf(s, stance, c, l, tw, bal), FLAT, null).joint;
          const tag = `${name}/${kind}/${stance}/t${t}/c${c}l${l}w${tw}${bal ? '/bal' : ''}`;
          for (const side of ['l', 'r'] as const) {
            const err = J[`foot_${side}`].distanceTo(want[side]);
            if (err > 0.005) worst.push(`${tag}: ankle_${side} ${(err * 1000).toFixed(1)} mm off`);
            const hip = J[`thigh_${side}`], knee = J[`shin_${side}`], ankle = J[`foot_${side}`];
            if (flexDeg(hip, knee, ankle) > LIMITS.kneeMaxDeg + 0.5) worst.push(`${tag}: knee_${side} over-bent`);
            if (knee.clone().sub(hip.clone().add(ankle).multiplyScalar(0.5)).dot(f) <= 0) worst.push(`${tag}: knee_${side} bends backwards`);
          }
          for (const b of BONES) {
            const p = J[b];
            if (b === 'root' || Math.abs(p.x) >= s.spec.lengthM / 2 || Math.abs(p.z) >= halfWidthAt(s.spec, uAt(s.spec, p.x))) continue;
            const clearance = p.y - deckYAt(s.spec, p.x, p.z), need = b.startsWith('shin') ? 0.04 : -0.005;
            if (clearance < need) worst.push(`${tag}: ${b} ${(clearance * 100).toFixed(1)} cm into the deck`);
          }
        }
      }
    }
    expect(worst.length, worst.slice(0, 3).join('; ')).toBe(0);
  });

  it('is the same on the board however the board is tilted (Review Focus 5)', () => {
    const s = setup('female', 'thruster', 'regular'), sample = sampleClip(s.clip, 30, 0.4);
    const inBoard = (fr: BoardFrame, v: Vector3): Vector3 => v.clone().sub(fr.position).applyQuaternion(boardQuaternion(fr).invert());
    const ref = clipPose(s.rest, sample, ctxOf(s, 'regular', 0.5, 0.5, 0.5), FLAT, null).joint;
    for (const fr of FRAMES.slice(1)) {
      const J = clipPose(s.rest, sample, ctxOf(s, 'regular', 0.5, 0.5, 0.5), fr, null).joint;
      for (const b of BONES) if (b !== 'root') expect(inBoard(fr, J[b]).distanceTo(ref[b]), b).toBeLessThan(1e-6);
    }
  });

  it('turns the dials into corrections: compression lowers the hips, lean tips toward the toes, twist turns the chest to the nose', () => {
    for (const stance of STANCES) {
      const s = setup('male', 'thruster', stance), sample = sampleClip(s.clip, 30, 0);
      const f = new Vector3(0, 0, stance === 'regular' ? 1 : -1);
      const at = (c: number, l: number, tw: number) => clipPose(s.rest, sample, ctxOf(s, stance, c, l, tw), FLAT, null);
      const base = at(0, 0, 0);
      expect(base.pelvisWorld.y - at(1, 0, 0).pelvisWorld.y, `${stance} compression`).toBeGreaterThan(0.1);
      expect(at(0, 1, 0).joint.spine_03.dot(f) - base.joint.spine_03.dot(f), `${stance} lean`).toBeGreaterThan(0.05);
      const chestFwd = (q: Quaternion): Vector3 => new Vector3(0, 0, 1).applyQuaternion(q);
      expect(chestFwd(at(0, 0, 1).world.spine_03).x - chestFwd(base.world.spine_03).x, `${stance} twist`).toBeGreaterThan(0.2);
    }
  });

  it('faces the rail for the stance: regular toward +z, goofy toward −z', () => {
    for (const stance of STANCES) {
      const s = setup('female', 'thruster', stance);
      const w = clipPose(s.rest, sampleClip(s.clip, 30, 0), ctxOf(s, stance), FLAT, null).world.pelvis;
      expect(new Vector3(0, 0, 1).applyQuaternion(w).z * (stance === 'regular' ? 1 : -1)).toBeGreaterThan(0.8);
    }
  });

  it('never spins a wrong-footed clip round to the other rail: the yaw is held to ±60° (Review Focus 4)', () => {
    // A mislabelled clip: facing the right rail but with the left (lead) foot crossed behind the right. Unclamped, the
    // ankle line points to the tail and the rider would turn 180° to face the wrong rail.
    const s = setup('female', 'thruster', 'regular'), sample = sampleClip(s.clip, 30, 0);
    const z = (deg: number): Quaternion => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (deg * Math.PI) / 180);
    sample.rot.thigh_l = z(-30); sample.rot.shin_l = z(-30);
    sample.rot.thigh_r = z(30); sample.rot.shin_r = z(30);
    const w = clipPose(s.rest, sample, ctxOf(s, 'regular'), FLAT, null).world.pelvis;
    expect(new Vector3(0, 0, 1).applyQuaternion(w).z).toBeGreaterThan(0.4); // cos 60° = 0.5; unclamped it'd be −1
  });

  it('passes the clip’s fingers through in world terms, and none when the clip has none', () => {
    const { rest, spec, layout } = setup('female', 'thruster', 'regular');
    const withF = syntheticRiderClips(rest, { fingers: true });
    const ctx: ClipPoseContext = { spec, layout, stance: 'regular', dials: { compression: 0, lean: 0, twist: 0, reach: 0 }, balance: null };
    const a = clipPose(rest, sampleClip(withF.clips.trim, 30, 0), ctx, FRAMES[1], null);
    expect(Object.keys(a.fingers).length).toBe(30);
    expect(a.fingers.index_01_l!.angleTo(a.world.hand_l.clone().multiply(rest.restQ.hand_l.clone().invert()))).toBeLessThan(1e-6);
    const b = clipPose(rest, sampleClip(syntheticRiderClips(rest).clips.trim, 30, 0), ctx, FRAMES[1], null);
    expect(Object.keys(b.fingers).length).toBe(0);
  });

  it('turns the head toward a look target on top of the clip', () => {
    const s = setup('female', 'thruster', 'regular'), sample = sampleClip(s.clip, 30, 0);
    const noLook = clipPose(s.rest, sample, ctxOf(s, 'regular'), FLAT, null);
    const look = clipPose(s.rest, sample, ctxOf(s, 'regular'), FLAT, new Vector3(10, 1.5, 2));
    const fwd = (q: Quaternion): Vector3 => new Vector3(0, 0, 1).applyQuaternion(q);
    expect(fwd(look.world.head).x).toBeGreaterThan(fwd(noLook.world.head).x + 0.2);
  });
});
```

Notes for the implementer:
- In the fingers test, `index_01_l` equals the hand's world delta because the fixture's finger rotations copy the
  hand's.
- `referenceSkeleton`'s `restQ` is identity, so `world` *is* D.

Run: `npx vitest run src/surfer/clipPose.test.ts`
Expected: FAIL, because `./clipPose` doesn't exist.

- [ ] **Step 2: Implement** `src/surfer/clipPose.ts`

```ts
import { Quaternion, Vector3 } from 'three/webgpu';
import type { BoardLayout, BoardSpec } from '../board/boardSpec';
import type { Balance } from './balance';
import type { ClipSample } from './clipPlayer';
import { aimRotation, minReach, twoBoneIK } from './ik';
import type { PoseDials } from './poses';
import type { Stance } from './presets';
import { BONES, type BoneName, FINGER_BONES, type FingerBone, LIMITS, type Limb, PARENT, type SkeletonRest, measures } from './rig';
import { type BoardFrame, type SolvedPose, boardQuaternion } from './solvePose';

const DEG = Math.PI / 180;
const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The dials' reach on a clip (§4.1 step 3), the code poses' own (poses.ts LEAN_MAX, TWIST_DIAL; standing()'s 0.42). */
export const CLIP_LEAN_MAX = 35 * DEG;
export const CLIP_TWIST_DIAL = 0.6;
export const CLIP_COMPRESSION_DROP = 0.42;
/** The balance layer's hand drift (m) as small chest roll and pitch (rad per m, and the caps; §4.1 step 3). */
const BAL_ROLL = 1.5, BAL_ROLL_MAX = 0.06, BAL_PITCH = 0.75, BAL_PITCH_MAX = 0.04;
/** A clip turned to put its feet along the board is held to ±60° (Review Focus 4): a wrong-footed clip shows as such. */
const YAW_MAX = 60 * DEG;

export interface ClipPoseContext {
  spec: BoardSpec;
  layout: BoardLayout;
  stance: Stance;
  /** As for the code poses; `compression` already carries the balance layer's (SurferStand adds it). */
  dials: PoseDials;
  balance: Balance | null;
}
export interface ClipSolved extends SolvedPose {
  /** The clip's finger bones' world rotations from rest; absent ones take the relaxed curl (Surfer.applyPose). */
  fingers: Partial<Record<FingerBone, Quaternion>>;
}

const SPINE_SHARE: Partial<Record<string, number>> = { spine_01: 1 / 3, spine_02: 2 / 3, spine_03: 1 };
const ABOVE_CHEST = new Set<string>(['neck', 'head', 'clavicle_l', 'upperarm_l', 'forearm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'forearm_r', 'hand_r', ...FINGER_BONES]);
const chestShare = (b: string): number => SPINE_SHARE[b] ?? (ABOVE_CHEST.has(b) ? 1 : 0);
const whole = (): number => 1;

/**
 * A clip's pose on the board (spec §4.1): the clip's rotations turned onto the board, its ankles' midpoint over the
 * stance spots' midpoint, the dials and the balance as corrections on top, then two-bone IK pinning each ankle on its
 * spot (the knee bending the clip's way, the hips giving way if a leg can't reach) and the head turned to `lookAt`.
 * Worked in the board frame, returned in world terms in solvePose's shape.
 */
export function clipPose(rest: SkeletonRest, sample: ClipSample, ctx: ClipPoseContext, board: BoardFrame, lookAt: Vector3 | null): ClipSolved {
  const m = measures(rest), regular = ctx.stance === 'regular';
  const f = new Vector3(0, 0, regular ? 1 : -1); // the toes' way
  const leanAxis = Y.clone().cross(f).normalize();
  const lead: Limb = regular ? 'l' : 'r', trail: Limb = regular ? 'r' : 'l';

  // The clip's rotations in the board frame: its character frame turned to face the stance's rail.
  const S = new Quaternion().setFromAxisAngle(Y, regular ? 0 : Math.PI);
  const D = {} as Record<BoneName, Quaternion>;
  for (const b of BONES) D[b] = b === 'root' ? new Quaternion() : S.clone().multiply(sample.rot[b] ?? new Quaternion());
  const F: Partial<Record<FingerBone, Quaternion>> = {};
  for (const g of FINGER_BONES) { const q = sample.rot[g]; if (q) F[g] = S.clone().multiply(q); }
  let P = sample.pelvis.clone().applyQuaternion(S);
  const turn = (q: Quaternion, share: (b: string) => number): void => {
    const by = (k: number): Quaternion => (k === 1 ? q.clone() : new Quaternion().slerp(q, k));
    for (const b of BONES) { const k = share(b); if (b !== 'root' && k > 0) D[b] = by(k).multiply(D[b]); }
    for (const g of Object.keys(F) as FingerBone[]) { const k = share(g); if (k > 0) F[g] = by(k).multiply(F[g]!); }
  };

  const offset = (b: BoneName): Vector3 => rest.joint[b].clone().sub(rest.joint[PARENT[b]!]);
  const restDir = (a: BoneName, b: BoneName): Vector3 => rest.joint[b].clone().sub(rest.joint[a]).normalize();
  const len = (a: BoneName, b: BoneName): number => rest.joint[a].distanceTo(rest.joint[b]);
  const J = {} as Record<BoneName, Vector3>;
  const fk = (b: BoneName): Vector3 => J[PARENT[b]!].clone().add(offset(b).applyQuaternion(D[PARENT[b]!]));
  const fkAll = (): void => {
    J.root = rest.joint.root.clone();
    J.pelvis = P.clone();
    for (const b of BONES) if (b !== 'root' && b !== 'pelvis') J[b] = fk(b);
  };

  // Feet along the board: turn about the vertical so the trail→lead ankle line runs to the nose (±60° at most).
  fkAll();
  const line = J[`foot_${lead}`].clone().sub(J[`foot_${trail}`]).setY(0);
  if (line.lengthSq() > 1e-8) {
    const yaw = new Quaternion().setFromAxisAngle(Y, clamp(Math.atan2(line.z, line.x), -YAW_MAX, YAW_MAX));
    turn(yaw, whole);
    P.applyQuaternion(yaw);
  }
  // The ankles' midpoint over the spots' midpoint.
  const ankleAt = { l: new Vector3(), r: new Vector3() };
  ankleAt[lead] = new Vector3(...ctx.layout.spots.front).add(new Vector3(0, m.ankleH, 0));
  ankleAt[trail] = new Vector3(...ctx.layout.spots.back).add(new Vector3(0, m.ankleH, 0));
  const pivot = ankleAt.l.clone().add(ankleAt.r).multiplyScalar(0.5);
  fkAll();
  P.add(pivot.clone().sub(J.foot_l.clone().add(J.foot_r).multiplyScalar(0.5)));

  // The dials and the balance, as corrections on top of the clip.
  P.y -= CLIP_COMPRESSION_DROP * m.legLen * clamp(ctx.dials.compression, -1, 1);
  const lean = clamp(ctx.dials.lean, -1, 1) * CLIP_LEAN_MAX;
  if (lean !== 0) {
    const q = new Quaternion().setFromAxisAngle(leanAxis, lean);
    turn(q, whole);
    P = P.sub(pivot).applyQuaternion(q).add(pivot);
  }
  const twist = (regular ? 1 : -1) * clamp(ctx.dials.twist, -1, 1) * CLIP_TWIST_DIAL;
  if (twist !== 0) turn(new Quaternion().setFromAxisAngle(Y.clone().applyQuaternion(D.pelvis), twist), chestShare);
  if (ctx.balance) {
    const { lead: bl, trail: bt } = ctx.balance;
    const roll = clamp((bl.y - bt.y) * BAL_ROLL, -BAL_ROLL_MAX, BAL_ROLL_MAX), pitch = clamp((bl.z + bt.z) * BAL_PITCH, -BAL_PITCH_MAX, BAL_PITCH_MAX);
    turn(new Quaternion().setFromAxisAngle(Z, roll).multiply(new Quaternion().setFromAxisAngle(leanAxis, pitch)), chestShare);
  }
  fkAll();

  // The legs: each knee keeps the clip's bend direction; each foot keeps the clip's angle on the deck.
  const pole = {} as Record<Limb, Vector3>, footDir = {} as Record<Limb, Vector3>;
  for (const s of ['l', 'r'] as const) {
    const p = J[`shin_${s}`].clone().sub(J[`thigh_${s}`].clone().add(J[`foot_${s}`]).multiplyScalar(0.5));
    pole[s] = p.length() > 0.01 ? p.normalize() : f.clone();
    const d = J[`toe_${s}`].clone().sub(J[`foot_${s}`]).setY(0);
    footDir[s] = d.lengthSq() > 1e-8 ? d.normalize() : f.clone();
  }
  const legs = (['l', 'r'] as const).map((s) => {
    const l1 = len(`thigh_${s}`, `shin_${s}`), l2 = len(`shin_${s}`, `foot_${s}`);
    return { s, l1, l2, maxR: (l1 + l2) * 0.995, minR: minReach(l1, l2, LIMITS.kneeMaxDeg) * 1.01, hipOffset: rest.joint[`thigh_${s}`].clone().sub(rest.joint.pelvis).applyQuaternion(D.pelvis) };
  });
  // Move the hips (never the feet) until each ankle is in reach: planted feet stay planted (as solvePose).
  for (let it = 0; it < 16; it++) {
    let moved = false;
    for (const g of legs) {
      const v = ankleAt[g.s].clone().sub(P).sub(g.hipOffset), d = v.length();
      if (d > g.maxR) { P.add(v.multiplyScalar((d - g.maxR + 1e-4) / d)); moved = true; }
      else if (d < g.minR) { P.add(d > 1e-6 ? v.multiplyScalar(-(g.minR - d + 1e-4) / d) : Y.clone().multiplyScalar(g.minR)); moved = true; }
    }
    if (!moved) break;
  }
  fkAll();
  for (const g of legs) {
    const th: BoneName = `thigh_${g.s}`, sh: BoneName = `shin_${g.s}`, ft: BoneName = `foot_${g.s}`, to: BoneName = `toe_${g.s}`;
    const ik = twoBoneIK(J[th], ankleAt[g.s], g.l1, g.l2, pole[g.s], LIMITS.kneeMaxDeg);
    D[th] = aimRotation(restDir(th, sh), Z, ik.mid.clone().sub(J[th]), pole[g.s]);
    J[sh] = fk(sh);
    D[sh] = aimRotation(restDir(sh, ft), Z, ik.end.clone().sub(J[sh]), pole[g.s]);
    J[ft] = fk(ft);
    const toe = ankleAt[g.s].clone().add(new Vector3(0, m.toeH - m.ankleH, 0)).add(footDir[g.s].clone().multiplyScalar(m.footLenH));
    D[ft] = aimRotation(restDir(ft, to), Y, toe.sub(J[ft]), Y);
    J[to] = fk(to);
    D[to] = D[ft].clone();
  }

  // The head turned toward lookAt on top of the clip's own (the neck takes 40%, as solvePose).
  const Qb = boardQuaternion(board);
  if (lookAt) {
    const dir = lookAt.clone().sub(board.position).applyQuaternion(Qb.clone().invert()).sub(J.head).normalize().applyQuaternion(D.head.clone().invert());
    const yaw = clamp(Math.atan2(dir.x, dir.z), -LIMITS.headYawMaxDeg * DEG, LIMITS.headYawMaxDeg * DEG);
    const pitch = clamp(Math.asin(clamp(dir.y, -1, 1)), -LIMITS.headPitchDownDeg * DEG, LIMITS.headPitchUpDeg * DEG);
    const look = new Quaternion().setFromAxisAngle(Y, yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -pitch));
    D.neck = D.neck.clone().multiply(new Quaternion().slerp(look, 0.4));
    D.head = D.head.clone().multiply(look);
    J.head = fk('head');
  }

  // Board frame → world, in solvePose's shape (root stays the skeleton's origin, as there).
  const toW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Qb).add(board.position);
  const joint = {} as Record<BoneName, Vector3>, world = {} as Record<BoneName, Quaternion>, local = {} as Record<BoneName, Quaternion>;
  for (const b of BONES) joint[b] = b === 'root' ? rest.joint.root.clone() : toW(J[b]);
  for (const b of BONES) world[b] = (b === 'root' ? new Quaternion() : Qb.clone().multiply(D[b])).multiply(rest.restQ[b]);
  for (const b of BONES) { const p = PARENT[b]; local[b] = p ? world[p].clone().invert().multiply(world[b]) : world[b].clone(); }
  const fingers: Partial<Record<FingerBone, Quaternion>> = {};
  for (const g of Object.keys(F) as FingerBone[]) fingers[g] = Qb.clone().multiply(F[g]!);
  return { pelvisWorld: toW(P), joint, world, local, fingers };
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/surfer/clipPose.test.ts && npx tsc --noEmit`
Expected: PASS. If a test fails, debug it with superpowers:systematic-debugging before changing anything. Likely
causes:
- **Twist sign:** positive twist must move the chest's forward toward +x (the nose) for both stances.
- **Lean sign:** positive lean must move `spine_03` toward the toes `f`.
- **Head look:** if the look test fails, check the yaw sign against `solvePose`'s identical maths.

Fix the code, not the expectation: the expectations are the spec.

- [ ] **Step 4: Run the whole surfer suite**

Run: `npx vitest run src/surfer`
Expected: PASS (the existing tests untouched).

- [ ] **Step 5: Commit**

```bash
git add src/surfer/clipPose.ts src/surfer/clipPose.test.ts
git commit -m "feat(clips): the clip on the board: placed on the stance spots, the dials and balance on top, ankles pinned by IK (clip slice §4.1)"
```

---

### Task 8: The Blender bake (`npm run build:clips`), then Gate B

**Depends on:** Gate A signed off (Task 4), and Andrew's `trim.fbx` plus the filled-in `clips.json` (Task 5).

**Files:**
- Create: `tools/surfer/clips.py`
- Modify: `tools/surfer/buildSurfers.ts`, `package.json`, `tools/surfer/README.md`
- Test: `src/surfer/clipsBuilt.test.ts` (skips when nothing is built)

**Interfaces:**
- Consumes:
  - `tools/surfer/clips.json` (Task 5);
  - `public/surfer/<rider>.manifest.json` and `.glb` (Task 3);
  - `rig_trim.BONE_MAP`, `rig_trim.FINGERS`; `previews._setup`, `previews.clay`, `previews.VIEW_W/VIEW_H`.
- Produces:
  - `public/surfer/clips/<rider>.clips.json` in the `RiderClips` shape (Task 6);
  - `tools/surfer/previews/clips/<clip>-<rider>.png`: the Gate B contact sheet, 8 frames, side and back.

- [ ] **Step 1: Add the runner**

In `tools/surfer/buildSurfers.ts`:
- add to the header comment
  `//   npm run build:clips              the motion clips → public/surfer/clips/ (clip slice spec §3.3)`;
- add a branch before `--atlas`:

```ts
if (process.argv.includes('--clips')) {
  // The licensed source clips live outside git (spec §3.2): anim-source/ here, or LD_ANIM_SOURCE (a worktree points at main's).
  const source = process.env.LD_ANIM_SOURCE ?? resolve('anim-source');
  mkdirSync(resolve('public/surfer/clips'), { recursive: true });
  mkdirSync(join(tools, 'previews', 'clips'), { recursive: true });
  run(blender, join(tools, 'clips.py'), [join(tools, 'clips.json'), source, resolve('public/surfer'), join(tools, 'previews', 'clips')]);
  process.exit(0);
}
```

`blender` must be found first, so place this after `const blender = findBlender();`.

In `package.json` scripts: `"build:clips": "node tools/surfer/buildSurfers.ts --clips"`.

- [ ] **Step 2: Write `tools/surfer/clips.py`**

```python
"""Bakes motion clips onto the riders (clip slice spec 2026-10-03 §3.3):
blender --background --python clips.py -- <clips.json> <anim-source dir> <public/surfer dir> <preview dir>

For each clip and each rider, per frame at 30 fps: every bone's world rotation from rest (what solvePose calls D) and
the pelvis from the ankles' midpoint, in the character rest frame (glTF axes), to <public/surfer>/clips/<rider>.clips.json;
and an 8-frame contact sheet (side and back) for Gate B."""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.append(os.path.dirname(__file__))
import previews  # noqa: E402
from rig_trim import BONE_MAP, FINGERS, PARENT  # noqa: E402

RIDERS = ("female", "male")
OUT_FPS = 30
BLEND_S = 0.25
CORE = ["pelvis", "spine_01", "spine_02", "spine_03", "neck", "head", "clavicle_l", "upperarm_l", "forearm_l", "hand_l",
        "clavicle_r", "upperarm_r", "forearm_r", "hand_r", "thigh_l", "shin_l", "foot_l", "toe_l",
        "thigh_r", "shin_r", "foot_r", "toe_r"]
# The game's bone → where to read it in the source (first present wins). The UE4 mannequin is MPFB's rig name for name;
# UE5's extra spine and neck bones fold onto ours: the chest reads the top spine bone (spine_05), the neck neck_01.
SOURCE = {dst: [src] for src, dst in BONE_MAP.items() if dst != "root"}
SOURCE["spine_03"] = ["spine_05", "spine_03"]
SOURCE.update({f: [f] for f in FINGERS})


def gl_q(q):  # Blender (x, y, z) → glTF (x, z, -y); w unchanged
    return [round(q.x, 6), round(q.z, 6), round(-q.y, 6), round(q.w, 6)]


def gl_v(v):
    return [round(v.x, 6), round(v.z, 6), round(-v.y, 6)]


def from_gl(a):  # glTF → Blender
    return Vector((a[0], -a[2], a[1]))


def imported(op, **kw):
    before = set(bpy.data.objects)
    op(**kw)
    new = [o for o in bpy.data.objects if o not in before]
    arms = [o for o in new if o.type == "ARMATURE"]
    if len(arms) != 1:
        raise SystemExit(f"expected one armature, got {[o.name for o in arms]}")
    return arms[0], new


def rot_of(m):
    return m.to_3x3().normalized().to_quaternion()


def facing(arm, names):
    """The rotation taking the source's world into ours: its left to +X and its up to +Z, so it faces -Y as MPFB does."""
    mw = arm.matrix_world
    h = lambda n: mw @ arm.data.bones[names[n]].head_local  # noqa: E731
    left = (h("thigh_l") - h("thigh_r")).normalized()
    up = h("head") - h("pelvis")
    up = (up - left * up.dot(left)).normalized()
    return Matrix((left, up.cross(left), up))  # rows: v ↦ (v·left, v·(up×left), v·up)


def target_rest(manifest):
    """The rider's rest heads and bone directions (Blender axes) from its manifest."""
    heads = {b["name"]: from_gl(b["head"]) for b in manifest["bones"]}
    dirs = {b["name"]: (from_gl(b["tail"]) - from_gl(b["head"])).normalized() for b in manifest["bones"]}
    return heads, dirs


def leg_len(head):
    return (head["shin_l"] - head["thigh_l"]).length + (head["foot_l"] - head["shin_l"]).length


def bake(clip, src_arm, names, N, manifest):
    """Per frame: D for every mapped bone (world rotation from rest, rest-aligned to ours) and the pelvis offset."""
    scene = bpy.context.scene
    heads, dirs = target_rest(manifest)
    Nq = N.to_quaternion()
    mw = src_arm.matrix_world
    rest_rot = {dst: Nq @ rot_of(mw @ src_arm.data.bones[src].matrix_local) for dst, src in names.items()}
    src_dir = {dst: (N @ (mw.to_3x3() @ (src_arm.data.bones[src].tail_local - src_arm.data.bones[src].head_local))).normalized() for dst, src in names.items()}
    # Rest alignment (§3.3 step 3): our bone aimed along the source's rest direction first, so a T-pose source fits our A-pose.
    align = {dst: dirs[dst].rotation_difference(src_dir[dst]) for dst in names}
    src_head = lambda n, pose: N @ (mw @ (src_arm.pose.bones[n].head if pose else src_arm.data.bones[n].head_local))  # noqa: E731
    src_leg = (src_head(names["shin_l"], False) - src_head(names["thigh_l"], False)).length + (src_head(names["foot_l"], False) - src_head(names["shin_l"], False)).length
    ratio = leg_len(heads) / src_leg

    action = src_arm.animation_data.action
    start = clip["start"] if clip["start"] is not None else int(action.frame_range[0])
    end = clip["end"] if clip["end"] is not None else int(action.frame_range[1])
    src_fps = clip["sourceFps"] or scene.render.fps / scene.render.fps_base
    frames = max(2, int(math.floor((end - start) / src_fps * OUT_FPS)) + 1)
    pelvis, rot = [], {dst: [] for dst in names}
    for k in range(frames):
        t = start + k * src_fps / OUT_FPS
        scene.frame_set(int(math.floor(t)), subframe=t - math.floor(t))
        mid = (src_head(names["foot_l"], True) + src_head(names["foot_r"], True)) / 2
        pelvis.append((src_head(names["pelvis"], True) - mid) * ratio)
        for dst, src in names.items():
            delta = (Nq @ rot_of(mw @ src_arm.pose.bones[src].matrix)) @ rest_rot[dst].inverted()
            rot[dst].append(delta @ align[dst])
    # The seam (§3.3 step 5): the last 0.25 s eased toward the first frame, so the loop wraps without a jump.
    if clip["loop"]:
        n = min(frames - 1, round(BLEND_S * OUT_FPS))
        for j in range(n):
            k, a = frames - n + j, (j + 1) / (n + 1)
            pelvis[k] = pelvis[k].lerp(pelvis[0], a)
            for dst in names:
                rot[dst][k] = rot[dst][k].slerp(rot[dst][0], a)
    return {
        "loop": clip["loop"], "frames": frames, "noseSide": clip["noseSide"],
        "pelvis": [c for p in pelvis for c in gl_v(p)],
        "rot": {dst: [c for q in qs for c in gl_q(q)] for dst, qs in rot.items()},
    }, (pelvis, rot)


def pose_target(arm, heads, pelvis, rot, k):
    """Poses the imported rider at frame k: each bone's world rotation D × rest, joints by FK from the pelvis."""
    mw_inv = arm.matrix_world.inverted()
    order = ["pelvis", *[b for b in CORE if b != "pelvis"], *FINGERS]
    parent = {**PARENT, **{f: (f"hand_{f[-1]}" if f[-4:-2] == "01" else f"{f[:-4]}{int(f[-4:-2]) - 1:02d}_{f[-1]}") for f in FINGERS}}
    D = {b: (rot[b][k] if b in rot else Quaternion()) for b in order}
    pos = {}
    ankle_mid = (heads["foot_l"] + heads["foot_r"]) / 2
    for b in order:
        if b not in arm.pose.bones:
            continue
        if b == "pelvis":
            pos[b] = ankle_mid + pelvis[k]
        else:
            p = parent[b]
            pos[b] = pos[p] + D[p] @ (heads[b] - heads[p])
        rest_w = rot_of(arm.matrix_world @ arm.data.bones[b].matrix_local)
        w = (D[b] @ rest_w).to_matrix().to_4x4()
        w.translation = pos[b]
        arm.pose.bones[b].matrix = mw_inv @ w
        bpy.context.view_layer.update()


def contact_sheet(name, rider, arm, meshes, heads, pelvis, rot, height, out_dir):
    """8 frames through the clip, from the side (top row) and from behind (bottom row): Gate B (§6)."""
    scene, cam = previews._setup()
    for m in meshes:
        if m.type == "MESH":
            previews.clay(m)
    W, H = previews.VIEW_W, previews.VIEW_H
    frames = len(pelvis)
    grid = np.zeros((H * 2, W * 8, 4), dtype=np.float32)
    tmp = os.path.join(out_dir, "_view.png")
    target = Vector((0, 0, height * 0.5))
    for i in range(8):
        pose_target(arm, heads, pelvis, rot, (i * frames) // 8)
        for row, at in enumerate((Vector((-height * 2.6, 0, height * 0.5)), Vector((0, height * 2.6, height * 0.5)))):
            cam.location = at
            cam.rotation_euler = (target - at).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tmp, check_existing=False)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
            bpy.data.images.remove(img)
            grid[(1 - row) * H:(2 - row) * H, i * W:(i + 1) * W] = px
    out = bpy.data.images.new(f"{name}-{rider}", W * 8, H * 2, alpha=True)
    out.pixels.foreach_set(grid.ravel())
    out.filepath_raw = os.path.join(out_dir, f"{name}-{rider}.png")
    out.file_format = "PNG"
    out.save()
    os.remove(tmp)


def main():
    clips_json, source_dir, surfer_dir, preview_dir = sys.argv[sys.argv.index("--") + 1:][:4]
    spec = json.load(open(clips_json, encoding="utf-8"))
    if spec["fps"] != OUT_FPS:
        raise SystemExit(f"clips.json fps {spec['fps']} ≠ {OUT_FPS}")
    out = {r: {"rider": r, "fps": OUT_FPS, "clips": {}} for r in RIDERS}
    for clip in spec["clips"]:
        for rider in RIDERS:
            bpy.ops.wm.read_homefile(use_empty=True)
            path = os.path.join(source_dir, clip["file"])
            if not os.path.exists(path):
                raise SystemExit(f"{path} is missing: export it from Unreal (plan Task 5) or set LD_ANIM_SOURCE")
            src_arm, _ = imported(bpy.ops.import_scene.fbx, filepath=path, use_anim=True, automatic_bone_orientation=False)
            names = {}
            for dst in [*CORE, *FINGERS]:
                hit = next((s for s in SOURCE[dst] if s in src_arm.data.bones), None)
                if hit:
                    names[dst] = hit
            missing = [b for b in CORE if b not in names]
            if missing:
                raise SystemExit(f"{clip['file']}: no source bone for {missing}; it has {sorted(b.name for b in src_arm.data.bones)}")
            manifest = json.load(open(os.path.join(surfer_dir, f"{rider}.manifest.json"), encoding="utf-8"))
            N = facing(src_arm, names)
            baked, (pelvis, rot) = bake(clip, src_arm, names, N, manifest)
            out[rider]["clips"][clip["name"]] = baked
            heads, _ = target_rest(manifest)
            arm, meshes = imported(bpy.ops.import_scene.gltf, filepath=os.path.join(surfer_dir, f"{rider}.glb"))
            src_arm.hide_render = True
            for o in bpy.data.objects:
                if o.parent == src_arm:
                    o.hide_render = True
            contact_sheet(clip["name"], rider, arm, meshes, heads, pelvis, rot, manifest["heightM"], preview_dir)
            print(f"baked {clip['name']} onto {rider}: {baked['frames']} frames")
    os.makedirs(os.path.join(surfer_dir, "clips"), exist_ok=True)
    for rider, data in out.items():
        with open(os.path.join(surfer_dir, "clips", f"{rider}.clips.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))


main()
```

`rig_trim.PARENT` uses contract names and `FINGERS` was added in Task 3, so both imports exist.

- [ ] **Step 3: Write the real-clip test** — `src/surfer/clipsBuilt.test.ts`

```ts
import { existsSync, readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { deckYAt, layoutFor } from '../board/boardSpec';
import { sampleClip } from './clipPlayer';
import { clipPose } from './clipPose';
import { type RiderClips, clipDuration, clipFor, riderClipsProblems } from './clips';
import { PRESETS, boardFor } from './presets';
import { BONES, type BoneName, type SurferManifest, measures, restFromManifest } from './rig';

/** The real baked clips, when built on this machine (spec §5): the paid clip isn't in git, so elsewhere this skips. */
for (const rider of ['female', 'male'] as const) {
  const path = `public/surfer/clips/${rider}.clips.json`;
  describe.skipIf(!existsSync(path))(`the baked clips for ${rider}`, () => {
    const rc: RiderClips = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { rider, fps: 30, clips: {} };
    const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${rider}.manifest.json`, 'utf8'));
    const rest = restFromManifest(man, Object.fromEntries(BONES.map((b) => [b, new Quaternion()])) as Record<BoneName, Quaternion>);
    it('is well formed', () => expect(riderClipsProblems(rc)).toEqual([]));
    it('loops without a jump (< 2°)', () => {
      for (const c of Object.values(rc.clips)) if (c.loop) {
        const d = clipDuration(rc, c), a = sampleClip(c, rc.fps, d - 1e-6), b = sampleClip(c, rc.fps, 0);
        for (const k of Object.keys(c.rot)) expect((a.rot[k]!.angleTo(b.rot[k]!) * 180) / Math.PI, k).toBeLessThan(2);
      }
    });
    it('plants the feet within 5 mm at every frame, both stances, dials at rest and at the extremes', () => {
      const spec = boardFor(PRESETS[rider], 'thruster'), layout = layoutFor(spec, rest.heightM), m = measures(rest);
      const bad: string[] = [];
      for (const stance of ['regular', 'goofy'] as const) {
        const c = clipFor(rc, 'trim', stance)!, lead = stance === 'regular' ? 'l' : 'r';
        for (let i = 0; i < c.frames; i += 3) for (const d of [-1, 0, 1]) {
          const J = clipPose(rest, sampleClip(c, rc.fps, i / rc.fps), { spec, layout, stance, dials: { compression: d, lean: d, twist: d, reach: 0 }, balance: null },
            { position: new Vector3(), forward: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) }, null).joint;
          const front = new Vector3(...layout.spots.front);
          const err = J[`foot_${lead}`].distanceTo(front.setY(deckYAt(spec, front.x, front.z) + m.ankleH));
          if (err > 0.005) bad.push(`${stance} f${i} d${d}: ${(err * 1000).toFixed(1)} mm`);
        }
      }
      expect(bad.length, bad.slice(0, 3).join('; ')).toBe(0);
    });
  });
}
```

- [ ] **Step 4: Bake and check**

```bash
LD_ANIM_SOURCE=../liquid-dreaming/anim-source npm run build:clips
npx vitest run src/surfer && npx tsc --noEmit
```

Expected:
- `baked trim onto female: N frames` and the same for male;
- `public/surfer/clips/*.clips.json` exist;
- the new `clipsBuilt` tests **run** (not skipped) and pass;
- `git status` shows no `public/surfer/clips` (it's ignored). Verify with `git status --short | grep clips`, which
  should print nothing.

If the FBX importer complains about the armature or the facing looks wrong at Gate B, check `facing()` against the
source's rest pose. Gate B is designed to catch exactly this; debug systematically, don't tweak blindly.

- [ ] **Step 5: Commit** (code only; the bake output is ignored)

```bash
git add tools/surfer/clips.py tools/surfer/buildSurfers.ts package.json tools/surfer/README.md src/surfer/clipsBuilt.test.ts
git commit -m "feat(clips): the Blender bake: clips mapped onto each rider, rest-aligned, looped, with Gate B sheets (clip slice §3.3)"
```

Add a README section, *"Motion clips (clip slice spec 2026-10-03)"*, covering:
- `npm run build:clips`;
- the `LD_ANIM_SOURCE` variable;
- that the output is git-ignored, and that `anim-source/` must be backed up outside git.

- [ ] **Step 6: GATE B — stop for Andrew**

Send `tools/surfer/previews/clips/trim-female.png` and `trim-male.png` (SendUserFile). Ask him:
- Does the motion look like the clip's preview on Fab?
- Are the arms twisted or the hands back to front?
- Does the pelvis slide or float?
- Is the speed right?

**Do not start Task 9's Gate C until he signs off.** A wrong speed means setting `sourceFps` in `clips.json`. A bad
limb means checking the rest alignment for that bone.

---

### Task 9: In the game: the motion switch, then Gate C

**Files:**
- Create: `src/surfer/motion.ts`
- Test: `src/surfer/motion.test.ts`
- Modify: `src/surfer/surferParams.ts`, `src/surfer/surferParams.test.ts`, `src/surfer/SurferStand.ts`,
  `src/dev/DevPanel.ts`

**Interfaces:**
- Consumes:
  - `POSE_CLIP`, `clipFor`, `clipDuration`, `loadRiderClips`, `RiderClips`, `BakedClip` (Task 6);
  - `sampleClip` (Task 6);
  - `clipPose` (Task 7);
  - `Surfer.applyPose(p, fingers?)` (Task 4).
- Produces:
  - `type Motion = 'code' | 'clip'`;
  - `chooseMotion(asked: Motion, pose: PoseName, loaded: { clips: RiderClips | null } | null, stance: Stance): MotionChoice`
    where `MotionChoice = { use: Motion; status: string; clip: BakedClip | null; rc: RiderClips | null }`;
  - `clipTime(play: boolean, simTime: number, phaseT: number, duration: number): number`;
  - `SurferParams.motion`;
  - `SurferStand.status.motion`.

- [ ] **Step 1: Write the failing tests** — `src/surfer/motion.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { syntheticRiderClips } from './clipFixture';
import { chooseMotion, clipTime } from './motion';
import { referenceSkeleton } from './rig';

const rc = syntheticRiderClips(referenceSkeleton(1.7));

describe('code or clip (clip slice spec §4.2)', () => {
  it('uses the code pose unless asked, and says why when a clip can’t play', () => {
    expect(chooseMotion('code', 'trim', { clips: rc }, 'regular')).toMatchObject({ use: 'code', status: 'code' });
    expect(chooseMotion('clip', 'trim', null, 'regular')).toMatchObject({ use: 'code', status: 'clip: loading' });
    expect(chooseMotion('clip', 'trim', { clips: null }, 'regular')).toMatchObject({ use: 'code', status: 'clip: not built' });
    expect(chooseMotion('clip', 'paddle', { clips: rc }, 'regular')).toMatchObject({ use: 'code', status: 'clip: none for this pose' });
  });
  it('plays the stance’s clip when one is loaded for the pose', () => {
    const r = chooseMotion('clip', 'trim', { clips: rc }, 'goofy');
    expect(r.use).toBe('clip');
    expect(r.status).toBe('clip: ready');
    expect(r.clip!.noseSide).toBe('right');
    expect(r.rc).toBe(rc);
  });
  it('runs on the sim clock when playing, else from the phase slider (a paused capture holds still)', () => {
    expect(clipTime(true, 12.5, 0.3, 2)).toBe(12.5);
    expect(clipTime(false, 12.5, 0.3, 2)).toBeCloseTo(0.6, 12);
  });
});
```

Append to `src/surfer/surferParams.test.ts`:

```ts
describe('motion (clip slice spec §4.2)', () => {
  it('defaults to code and repairs anything else to it', () => {
    expect(DEFAULT_SURFER_PARAMS.motion).toBe('code');
    expect(sanitizeSurferParams({ motion: 'clip' }).motion).toBe('clip');
    expect(sanitizeSurferParams({ motion: 'mocap' }).motion).toBe('code');
  });
});
```

Add `DEFAULT_SURFER_PARAMS` and `sanitizeSurferParams` to that file's import if they aren't already there.

Run: `npx vitest run src/surfer/motion.test.ts src/surfer/surferParams.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement `src/surfer/motion.ts`**

```ts
import { type BakedClip, POSE_CLIP, type RiderClips, clipFor } from './clips';
import type { PoseName } from './poseNames';
import type { Stance } from './presets';

/** The dev panel's switch (spec §4.2): the hand-made code pose, or the motion clip. */
export type Motion = 'code' | 'clip';
export interface MotionChoice {
  use: Motion;
  /** The panel's readout: what plays, or why a clip can't. */
  status: string;
  clip: BakedClip | null;
  rc: RiderClips | null;
}

/** A clip plays only when asked for, the pose has one, and the rider's clips loaded; otherwise the code pose. */
export function chooseMotion(asked: Motion, pose: PoseName, loaded: { clips: RiderClips | null } | null, stance: Stance): MotionChoice {
  const code = (status: string): MotionChoice => ({ use: 'code', status, clip: null, rc: null });
  if (asked === 'code') return code('code');
  if (loaded === null) return code('clip: loading');
  if (loaded.clips === null) return code('clip: not built');
  const name = POSE_CLIP[pose], clip = name ? clipFor(loaded.clips, name, stance) : null;
  if (!clip) return code('clip: none for this pose');
  return { use: 'clip', status: 'clip: ready', clip, rc: loaded.clips };
}

/** Seconds into the clip: the sim's clock when playing (as the paddle's), else the phase slider through one loop. */
export const clipTime = (play: boolean, simTime: number, phaseT: number, duration: number): number => (play ? simTime : phaseT * duration);
```

- [ ] **Step 3: Add `motion` to the params** (`src/surfer/surferParams.ts`)
  - Add the import `import type { Motion } from './motion';`.
  - In `SurferParams`, after `play`:

    ```ts
      /** Hand-made code poses or motion clips where a pose has one (clip slice spec §4.2); code until Gate C rules. */
      motion: Motion;
    ```

  - In `DEFAULT_SURFER_PARAMS`, add `motion: 'code',` after `play: true,`.
  - In `normalizeSurferParams`, after the `carrySide` line:
    `p.motion = oneOf(p.motion, ['code', 'clip'] as const, d.motion);`

- [ ] **Step 4: Wire the stand** (`src/surfer/SurferStand.ts`)

Imports to add:

```ts
import { clipDuration, loadRiderClips, type RiderClips } from './clips';
import { sampleClip } from './clipPlayer';
import { clipPose } from './clipPose';
import { chooseMotion, clipTime } from './motion';
import type { FingerBone } from './rig';
import { type BoardFrame, type SolvedPose, boardQuaternion, solvePose } from './solvePose'; // add SolvedPose to the existing import
```

Field changes:

```ts
  readonly status = { outfit: '', motion: '' };
  /** Each rider's baked motion clips (clip slice spec §4.2), fetched once; { clips: null } when not built. */
  private readonly clipLoader = new KeyedLoader<PresetName, { clips: RiderClips | null }>(
    (name) => loadRiderClips(`${import.meta.env.BASE_URL}surfer/clips/${name}.clips.json`).then((clips) => ({ clips })),
    (name, e) => console.warn(`The ${name} motion clips failed to load; the stand uses the code poses.`, e),
  );
```

Replace the two lines `const solved = solvePose(s.rest, t, state.board, state.lookAt);` and `s.applyPose(solved);` with:

```ts
    // Code or clip (clip slice spec §4.2). The code targets above still give the look and the carry.
    const choice = chooseMotion(p.motion, p.pose, this.clipLoader.get(p.preset), p.stance);
    this.status.motion = choice.status;
    let solved: SolvedPose, fingers: Partial<Record<FingerBone, THREE.Quaternion>> | undefined;
    if (choice.use === 'clip' && choice.clip && choice.rc) {
      const sample = sampleClip(choice.clip, choice.rc.fps, clipTime(p.play, simTime, p.phaseT, clipDuration(choice.rc, choice.clip)));
      const c = clipPose(s.rest, sample, { spec, layout, stance: p.stance, dials, balance: bal }, state.board, state.lookAt);
      solved = c;
      fingers = c.fingers;
    } else {
      solved = solvePose(s.rest, t, state.board, state.lookAt);
    }
    s.applyPose(solved, fingers);
```

`dials.compression` already includes `bal.compression` (the existing line builds `dials`), as `ClipPoseContext`
requires.

- [ ] **Step 5: The panel** (`src/dev/DevPanel.ts`)
  - `SURFER_OPTIONS`: add `motion: { 'code poses': 'code', 'motion clip': 'clip' },`.
  - Change the model type at line 52 to `surferStatus: { outfit: string; motion: string };`.
  - After the `for (const key of ['outfit', 'pose'] ...)` loop, add:

    ```ts
        surferFolder.addBinding(m.surfer, 'motion', { label: 'motion', options: SURFER_OPTIONS.motion }).on('change', h.onSurfer);
        readouts.add(surferFolder.addBinding(m.surferStatus, 'motion', { label: 'motion now', readonly: true, interval: 500 }));
    ```

- [ ] **Step 6: Run everything**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. `tsc` flags any object literal of `SurferParams` missing `motion`. `referenceMoments.stand()` spreads
`DEFAULT_SURFER_PARAMS`, so it's covered; fix any other literal it names by adding `motion: 'code'`.

- [ ] **Step 7: Verify in the browser**
  - `preview_start` `ld-anim` (5187).
  - Open `#ref=surfer-lineup-sit` and set pose `trim`.
  - Check the console for errors.
  - Flip `motion` to `motion clip`: the readout says `clip: ready` and the rider changes pose.
  - On a machine or worktree without the bake, it says `clip: not built` and stays on the code pose (Review Focus 2).

- [ ] **Step 8: Commit**

```bash
git add src/surfer/motion.ts src/surfer/motion.test.ts src/surfer/surferParams.ts src/surfer/surferParams.test.ts src/surfer/SurferStand.ts src/dev/DevPanel.ts
git commit -m "feat(stand): the motion switch: the riding clip plays on the stand, code poses everywhere else (clip slice §4.2)"
```

- [ ] **Step 9: GATE C — the verdict**
  - Capture code vs clip at 1080p for Shazza (regular) and T-Bone (goofy), pose `trim`, play on:
    - side camera: 2.6 m off the surfer's right side, eye 0.7 m, yaw facing them;
    - back camera: 2.6 m behind along the board, eye 1.1 m;
    - 8 sim times across one clip loop.
  - Use `tools/captureMoments.mjs` with `--pre` setting
    `Object.assign(window.liquidDreams.surferParams, {...surfer, motion: 'code' | 'clip'})`. Tile them as rows:
    code above clip.
  - Also record a short clip: the capture tool with `--run` and consecutive times 1/30 s apart, encoded with ffmpeg if
    present, else a 4 × 4 frame strip.
  - Send everything to Andrew, and invite him to flip the switch himself on http://localhost:5187.
  - Ask the spec's question: **does the clip clearly beat the code pose?**
  - **His answer decides whether sub-projects 2–4 go ahead.** Do not merge `clip-slice` to main until he says so.
  - After any merge, the baked clips live only in the worktree's ignored folder, so re-run `npm run build:clips` in
    the main checkout.

---

## Self-review notes

**Spec coverage:**

| Spec section | Where |
|---|---|
| §2 rig | Tasks 1, 3, 4 |
| §2 relaxed curl | Tasks 2, 4 |
| §3.1 source | Task 5 |
| §3.2 not in git | Global Constraints; Tasks 5, 8 |
| §3.3 bake steps 1–5, 7, 8 | Task 8 |
| §3.3 step 6 mirror | Task 6 (the refinement noted above) |
| §4.1 | Task 7 |
| §4.2 | Tasks 6, 9 |
| §4.3 files | as listed |
| §5 tests | Tasks 1–9 |
| §6 gates | Task 4 (A), Task 8 (B), Task 9 (C) |
| §7 risks | the gates, Review Focus |

**Types used across tasks:**
- `FingerBone`, `FINGER_BONES`, `FINGER_PARENT` (T1) are used in T2, T4, T6, T7 and T8;
- `ClipSample` (T6) is used in T7;
- `ClipSolved.fingers` (T7) is used in T9 → `applyPose` (T4);
- `RiderClips` / `BakedClip` / `clipFor` / `clipDuration` (T6) are used in T8 and T9;
- `Motion` (T9) is used in `surferParams` (T9).
