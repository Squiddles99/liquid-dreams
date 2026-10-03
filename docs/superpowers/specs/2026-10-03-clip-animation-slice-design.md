# Clip animation, slice 1: one riding-stance clip — design

**Date:** 2026-10-03
**Status:** approved in conversation (sections 1–5), awaiting Andrew's review of this written spec
**Parent:** the animation pipeline (sub-project 1 of 4, below)

## 0. Why

Tiny pose fixes were costing days. The root cause: every surfer pose is joint targets written by hand in code
(`src/surfer/poses.ts` → `solvePose` → two-bone IK), on a skeleton trimmed to 23 bones with no fingers, and there are
zero animation clips. No shipped game animates this way: motion comes from capture or animators, and code only corrects
contact. Andrew's goal is Kelly Slater: Pro Surfer quality or better, with fluid, responsive animation and the crew
surfing beside him as NPCs. That needs real motion.

The animation pipeline is four sub-projects, each with its own spec → plan → build:

1. **This slice:** fingers back, plus one real riding-stance clip in the game, with code planting the feet.
2. Clip blending (paddle → pop-up → ride stances), with contact and lean corrections.
3. A repeatable way to get surf motion (packs, skate/snow proxies, video-to-motion).
4. Replacing the code poses one by one. The code poses stay as fallbacks until each is replaced.

## 1. Goal and scope

**Goal:** prove real motion clips are the way forward. One riding-stance clip plays on Shazza and T-Bone in the
game, with the feet planted on the deck and the hands alive down to the fingers. Andrew judges it by eye, side by side
with today's code pose, and it must be clearly better.

**In:**
- the finger bones restored;
- a Blender step that maps a clip onto our riders;
- a clip player in the game;
- a thin correction layer that plants the feet and applies the lean, compression and twist dials and the balance
  wobble;
- a dev-panel switch, `motion: code / clip`.

**Out (later sub-projects):**
- blending between clips;
- paddle, pop-up and turns;
- video-to-motion;
- Grommet and the bodyboard;
- NPC crew;
- riding physics. The board stays on the stand, so "responsive" here means the dials, not a controller;
- protecting the clips from extraction in the packaged Steam build (noted for the Steam work).

**Success:**
1. At Gate C, Andrew says the clip beats the code pose at 1080p, from the side and from the back.
2. No foot leaves or sinks into the deck at any dial setting through the whole loop (a test).
3. Every existing code pose is unchanged: all existing surfer tests pass as they are.

## 2. The rig with fingers

MPFB's `game_engine` rig is the UE4 mannequin, name for name (`tools/surfer/api-probe.txt`). It has 53 bones: our 23,
plus `thumb|index|middle|ring|pinky_01..03_l|r`. There are no twist bones.

- **`tools/surfer/rig_trim.py`**
  - The finger bones are no longer cut. They keep their MPFB names and MPFB's own skin weights; today those weights
    are merged into the hand.
  - `limit_weights` still caps each vertex at 4 influences.
  - The triangle budget is unchanged.
- **`src/surfer/rig.ts`**
  - `BONES` (the 23-bone core) and `PARENT` are unchanged.
  - A new `FINGER_BONES` list (30 names), with its own parent map, sits under `hand_l` and `hand_r`.
  - `SurferManifest` / `manifestProblems` accept the finger bones and require them on rebuilt riders.
  - The rest pose for the fingers comes from the manifest, like every other bone.
- **`poses.ts` and `solvePose.ts` are not touched.** The solver never writes finger bones.
- **Relaxed curl at rest:** when no clip drives the fingers, `Surfer.applyPose` sets each finger joint to a small
  constant flex about its own hinge axis (from the rest pose): about 15°, 20° and 15° from base to tip, with a lighter
  thumb. Every existing pose gets relaxed hands instead of flat, splayed ones.
- **Rebuild:** `npm run build:surfers` regenerates `public/surfer/{female,male,grommet}.glb` and their manifests.
  `grommet` gains fingers too: same pipeline, same skeleton.

**Risk:** the rebuild regenerates every character file. Gate A (§6) compares turntables before and after, so faces,
hair and outfits are confirmed unchanged before anything else proceeds.

## 3. Getting a clip onto our riders (Blender)

### 3.1 Source (Andrew)

Andrew gets the clip from a Fab surf pack:
- *Surfing Anim Pack* (Jane Gintsar, about US$5–10), or *Surfing Animation* (NexaFrame, about US$15). He chooses from
  the previews.
- He exports it from Unreal as FBX. The plan will give click-by-click steps.
- If neither pack's riding/balancing clip is good enough, the fallback is the free CMU #134 skateboard lean-turn
  (BVH), with a bone map for that skeleton.

The Fab licence allows engines other than Unreal. It forbids sharing the raw files or letting end users extract them.

### 3.2 Not in git (Andrew's decision: the repo stays public)

- Source clips live in `anim-source/` at the repo root. It is git-ignored.
- Baked clips are written to `public/surfer/clips/`, also git-ignored.
- **Backup:** the source FBX files are the irreplaceable part, because the bake can always rebuild the baked clips
  from them. Andrew keeps a copy outside git (OneDrive or similar).
- `tools/surfer/clips.json` **is** committed. It lists clip names, file names, frame ranges, the source skeleton and
  the source stance. It holds no licensed data.
- Vite copies `public/` into the build, so the clips do reach the Steam build.

### 3.3 The bake: `tools/surfer/clips.py`, run as `npm run build:clips`

Blender runs in the background, like `build:surfers`. For each entry in `clips.json` and each rider (`female`, `male`):

1. **Import the FBX.** Drop root motion: the board frame drives where the rider is, so only the pelvis position
   relative to the feet is kept.
2. **Map bones by name.**
   - UE4 → our rig is identity on MPFB names, then `rig_trim.BONE_MAP` to the contract names.
   - For UE5-mannequin sources, `spine_04` and `spine_05` fold onto `spine_03`, `neck_02` folds onto `neck`, and twist
     bones are ignored.
3. **Match the rest poses.** The source may rest in a T-pose and ours in an A-pose. First, each target bone is aimed
   along its source bone's rest direction. Then each frame transfers the **world-space rotation from rest**:
   `target_world = Δ_source × target_rest_aligned`, converted to local rotations. Bone lengths are never copied, so
   nobody stretches.
4. **Scale the pelvis.** Pelvis translation is scaled by target leg length ÷ source leg length.
5. **Loop.** The clip is cut to its frame range. The last 0.25 s is blended into the first frames, so the seam matches
   in rotation and pelvis position.
6. **Mirror.** A goofy copy is made from a regular source, or the reverse: l/r bones are swapped and every rotation
   is reflected across the body's sagittal plane.
7. **Write `public/surfer/clips/<rider>.clips.json`:**
   - `fps` (30);
   - per clip and stance (`trim_regular`, `trim_goofy`): `loop`, `frames`, `pelvis` (positions), and `rot` (bone →
     flat local quaternions, all 53 bones). The quaternions are in the same convention as three's `Bone.quaternion`
     on our rig.
   - This is JSON, not glTF animation: it is small (about 25k floats per clip), easy to test and has no naming
     ambiguity.
8. **Write a contact sheet** for Gate B into `tools/surfer/previews/clips/`: 8 frames through the loop, from the side
   and from the back.

## 4. In the game

### 4.1 Per frame

This path runs for a rider whose pose has a clip, with `motion = clip`, when the clip is loaded.

1. **Sample** (`src/surfer/clipPlayer.ts`):
   - `sampleClip(clip, t)` → local quaternions for all 53 bones, plus the pelvis position;
   - it slerps between frames and wraps when looping;
   - `t` is taken from the clock that drives Play (`playPhase`), so a paused capture holds still.
2. **Place on the board** (`src/surfer/clipPose.ts`):
   - forward kinematics on the sampled pose in the character frame;
   - the line between the two ankles is aligned with the board's long axis;
   - their midpoint is placed over the midpoint of the `front` and `back` stance spots, which `standing()` in
     `poses.ts` already uses.
3. **Dials and balance**, as small corrections on top of the clip, so its own motion still shows:
   - `compression` lowers the pelvis, on the scale `standing()` uses;
   - `lean` tips the body about the rail line by `lean × LEAN_MAX`;
   - `twist` turns the chest about the spine, shared over the three spine bones like `chestRotation`;
   - `balanceAt`'s compression is added, and its lead/trail offsets become small extra chest roll and pitch. There are
     no hand targets, because the arms belong to the clip.
4. **Plant the feet:**
   - `twoBoneIK` (from `ik.ts`) pins each ankle on the deck at its spot, `ankleH` above `deckYAt`;
   - the knee's pole is taken from the clip's own knee direction, so knees never reverse;
   - the foot is aimed so the toe lies along the deck;
   - if the clip's leg can't reach, the pelvis moves as `solvePose` does: the feet stay put and the hips give way.
5. **Output a `SolvedPose`** (the same shape as `solvePose` returns), plus `fingers` (local quaternions):
   - `SurferStand`'s board contacts, leash, head-look and face read it unchanged;
   - the head-look is applied after the clip, as today.

### 4.2 Choosing code or clip

- **`SurferParams.motion`** (`'code' | 'clip'`, default `'code'` until Gate C rules) is persisted like the other
  params.
- `POSE_CLIP` maps pose → clip name. In this slice the only entry is `trim → 'trim'`.
- `SurferStand` uses the clip path only when all of these hold: `motion === 'clip'`, the pose has a clip, and the
  rider's clips loaded. Otherwise it uses today's code path.
- **Loading:** `<rider>.clips.json` is fetched once per rider. A 404 means "not built", which is not an error.
- **The dev panel's Surfer folder** gains:
  - the `motion` switch;
  - a status line: `clip: ready`, `clip: not built` or `clip: none for this pose`.

### 4.3 Files

| File | Role |
|---|---|
| `src/surfer/clips.ts` | the types and the loader (missing file → `null`) |
| `src/surfer/clipPlayer.ts` | sampling |
| `src/surfer/clipPose.ts` | placing, dials, balance and the foot IK → `SolvedPose` plus fingers |
| `src/surfer/SurferStand.ts` | the code/clip choice (small change) |
| `src/surfer/Surfer.ts` | `applyPose` also takes finger rotations, or the relaxed curl |
| `src/surfer/surferParams.ts`, `src/dev/DevPanel.ts` | `motion` and the status line |

`poses.ts`, `solvePose.ts` and `ik.ts` are not changed (`ik.ts` is reused as is).

## 5. Tests

- **Rig:** the manifest has 53 bones; the fingers are under the correct hand; every vertex has 4 or fewer
  influences; the existing `manifest.test.ts` passes.
- **No regressions:** all existing `src/surfer` tests pass unchanged (311 at 7c075dd + c4c33d6).
- **Synthetic clip fixture:** the paid clip is not in git, so the tests build a small clip in code (a stance with a
  gentle pelvis bob, a knee flex and a wrist roll). They run on any machine.
- **Sampler:**
  - exact frame values at frame times;
  - slerp between frames;
  - the loop wraps with no jump: the first frame and the wrapped last frame differ by less than 2°.
- **Clip pose sweep:** riders `female` and `male`; both stances; 32 times through the loop; dial levels
  {-1, 0, 1}³ for lean, compression and twist; balance on and off. In every case:
  - each ankle is within 5 mm of its deck spot;
  - knee flex is within `LIMITS.kneeMaxDeg`, and the knee is on the clip's side (not reversed);
  - nothing passes through the board, using the existing sinks-through-the-board check.
- **Mirror:** mirroring a clip twice gives the original, within 1e-6.
- **Fallback:** with no clips file, the stand picks the code pose and the status reads `clip: not built`.
- **Real clip (skipped unless it is built):** the same sweep, run on `public/surfer/clips/*.clips.json` when present.

## 6. Gates and order of work

1. **Rig with fingers, then Gate A:** turntables of each rider before and after the rebuild. Faces, hair and outfits
   are unchanged, and the fingers rest in a relaxed curl. Andrew signs off before anything else proceeds.
2. **Andrew, in parallel with step 1:**
   - installs the Epic Games Launcher and Unreal Engine;
   - watches the two packs' previews, then buys one;
   - exports the riding/balancing clip as FBX into `anim-source/`, following the plan's steps.
3. **The bake (`clips.py`), then Gate B:** contact sheets of the clip on Shazza and T-Bone from Blender. They catch a
   bad mapping (twisted arms, a sliding pelvis) before any game work.
4. **The clip player, `clipPose`, the switch and the tests, then Gate C:** code vs clip in the game at 1080p, from
   the side and from the back. Andrew gets a strip of frames through the loop plus a short clip, and flips the switch
   live on 5173. **His verdict decides whether sub-projects 2–4 go ahead.**

## 7. Risks

- **Clip quality is unknown until Andrew sees the previews.** Fallback: CMU skate, then a different pack.
- **Bad retarget from a rest-pose mismatch.** Mitigation: the rest alignment in §3.3 step 3, caught at Gate B.
- **Knee pop when the IK pins feet the clip spaced differently.** Mitigation: the knee pole comes from the clip, and
  the pelvis gives way. The sweep enforces both.
- **The finger rebuild changes the bodies' look.** Mitigation: Gate A's before/after turntables.
- **The clips are on one machine only.** Mitigation: back up `anim-source/` outside git, and `build:clips` rebuilds
  the rest.
