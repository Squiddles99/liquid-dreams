# Close-up Detail and Idle Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All three riders at close-up quality (Shazza made pretty), with blinks, gaze, breathing, the jaw and moods
alive on the stand.

**Architecture:** The Blender build bakes MPFB's CC0 expression units into glTF morph targets, keeps the lash helpers
and the head at full resolution, fits the eyes to MPFB's eye helper, adds teeth for all three, and builds dry
hairstyles. The game adds a pure `IdleLife` model that drives the morphs and gaze, and TSL detail: pores, scatter,
zones, per-fragment eyes, lashes and anisotropic hair.

**Tech Stack:**
- three 0.186.1 WebGPU with TSL;
- vitest;
- Blender 5.2.2 with MPFB 2.0.17 (`npm run build:surfers`);
- tweakpane 4.

**Spec:** `docs/superpowers/specs/2026-10-01-closeup-and-idle-design.md`

**Ruling (plan form):** the executor is also the author, overnight. Steps name the files, the interfaces and the tests
with their assertions. Code is written in full where a later task depends on its shape; the rest is tuned against
renders, as the spec's gate requires.

## Global Constraints

- Assets are CC0 or project-made (Steam).
- `reference/` is never committed or published.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No merge to main without Andrew. Push the branch `closeup-and-idle` to origin.
- "Be careful everything renders": every limb is visible in every pose, for all three.
- The 23-bone skeleton contract is unchanged.
- Old moment links and saved settings still open (sanitisers take unknown or missing keys).

## Review Focus

1. **A morph index/name mismatch between meshes.** Setting a face must address each mesh's own
   `morphTargetDictionary`, never assume indices.
2. **Morph deltas lost or garbled by decimation or scaling** (a blink that tears the lid). Pinned by
   `checks.blinkCovers` and the blink self-test.
3. **Idle head motion fighting the pose's look in riding poses.** Pinned by the idle test: head offsets are zero
   unless the pose is still.
4. **A surfer loaded mid-idle, or a preset switch, reusing stale idle state.** The idle state lives per Surfer.
5. **Dry hair visible in the water, or wet hair on land, on a preset without dry hair.** Pinned by the Surfer
   visibility test (pure helper).

---

### Task 1: IdleLife (pure)

**Files:**
- Create: `src/surfer/idleLife.ts`, `src/surfer/idleLife.test.ts`

**Interfaces:**
- Produces:
  - `FACE_CHANNELS = ['blinkL','blinkR','jawOpen','smile','browsUp','browsInner','squint','nostrils','breathe'] as const`;
  - `type FaceChannel`, `interface FaceState` (channels plus gaze and head angles);
  - `class IdleLife { constructor(seed: number, mood: Mood); tick(dtS: number, ctx: IdleContext): FaceState; }`;
  - `interface IdleContext { still: boolean; exertionTarget: number; onLand: boolean; sunFacing: number }`;
  - `MOODS: Record<PresetName, Mood>`.

- [ ] Tests first:
  - over 10 minutes at 60 Hz: the blink count sits between 600/6 and 600/2 × 1.2 (doubles allowed);
  - every closure's duration (blink > 0.5) is between 0.03 and 0.2 s;
  - `blinkL === blinkR` always;
  - the same seed gives an identical sequence;
  - gaze stays within ±8° yaw and ±5° pitch of the look target;
  - head offsets are 0 when `still` is false, and head yaw is ≤ 20° when still;
  - breaths per minute are ≈14 at rest and ≥ 24 after 30 s of `exertionTarget` 1;
  - exertion falls below 0.3 within 40 s of rest;
  - every channel stays in [0, 1];
  - the squint follows `sunFacing`.
- [ ] Run them and watch them fail (the module is missing).
- [ ] Implement with a small seeded PRNG (mulberry32), per-channel timers, smoothed moods, and a breathing phase
  integrated from the rate.
- [ ] Green; commit.

### Task 2: Expression morphs through the build

**Files:**
- Create: `tools/surfer/expressions.py`
- Modify: `tools/surfer/build.py`, `tools/surfer/rig_trim.py` (decimate with a protect group), `tools/surfer/export.py`
  (`export_morph=True`, morph names and checks in the manifest)
- Test: `src/surfer/manifest.test.ts`, `src/surfer/glbData.ts` (read primitive targets and `extras.targetNames`)

**Interfaces:**
- `expressions.load(body, scale_fn)` stores the deltas as vertex attributes `xp_<name>` (FLOAT_VECTOR, POINT).
- `expressions.breathe(body, weights)` adds `xp_breathe`.
- `expressions.to_shape_keys(body)`, after decimation, turns the `xp_*` attributes into shape keys in `MORPHS` order.
- `rig_trim.scale_to_height` scales the `xp_*` attributes by the same factor.
- `rig_trim.decimate(body, triangles, protect="keep_detail")`.
- Manifest: `morphs: string[]` per mesh; `checks: { blinkCovers: boolean }`.

- [ ] Tests first:
  - `manifest.test.ts` asserts that each of the three glbs' body primitives carry nine targets named per the spec, in
    `extras.targetNames`;
  - the manifest lists them;
  - the body's head has ≥ 5,000 triangles (manifest `headTriangles`).
- [ ] Watch them fail against the current glbs.
- [ ] Implement, rebuild the female, check her deltas in Blender (the max blink delta is ≈16 mm × the scale), then
  rebuild all three.
- [ ] Green; commit with the rebuilt glbs.

### Task 3: Eyes, lashes, lips, teeth, the blink check

**Files:**
- Modify: `tools/surfer/hair.py` (`eyes()` fitted to the helper), `tools/surfer/rig_trim.py` (keep the lash helpers in
  the body with material `lashes`), `tools/surfer/face.py` (lips from the group; lash UVs),
  `tools/surfer/teeth.py` (the even style, the lower row, the `jawOpen` morph), `tools/surfer/build.py`, the presets
  (`teeth` for all three, `lashes` length)
- Test: `src/surfer/manifest.test.ts`

- [ ] Tests first:
  - every manifest has `checks.blinkCovers === true`;
  - eye radius between 0.0115 and 0.0135 (manifest `landmarks.eyeRadius`);
  - a `lashes` material on the body;
  - a teeth mesh with material `teeth` whose lower half carries a `jawOpen` target;
  - landmarks for all three.
- [ ] Watch them fail.
- [ ] Implement; rebuild all three; inspect the face sheets.
- [ ] Green; commit.

### Task 4: Hair: fine wet cards, dry styles

**Files:**
- Modify: `tools/surfer/hair.py` (`ponytail` with fine cards, `waves` long dry, `tousled` short dry, the root
  hairline fade, tip weights to the neck and spine), `tools/surfer/build.py` (`dryHair` → `hairDry` material), the
  presets
- Test: `src/surfer/manifest.test.ts`

- [ ] Tests first:
  - female and male manifests have a mesh with material `hairDry`; Grommet's doesn't;
  - hair cards per wet mesh ≥ 2,500 for Shazza.
- [ ] Watch them fail.
- [ ] Implement; rebuild; inspect.
- [ ] Green; commit.

### Task 5: Runtime: the face on the Surfer, the stand's idle, the panel

**Files:**
- Modify: `src/surfer/Surfer.ts` (`setFace`, lashes / hairDry / eyes gaze, `hairVisibility`),
  `src/surfer/SurferStand.ts` (tick `IdleLife`, the head offset into lookAt, the sun facing),
  `src/surfer/surferParams.ts` (the `face` block: `idle: boolean`, `overrides` per channel −1 = auto),
  `src/dev/DevPanel.ts` (the Face sub-folder), `src/surfer/wardrobe.ts` (`hairShown(onLand, hasDry)`)
- Test: `src/surfer/surferParams.test.ts`, `src/surfer/wardrobe.test.ts`, `src/dev/DevPanel.test.ts`

- [ ] Tests first:
  - `sanitizeSurferParams` fills `face` defaults, clamps the overrides to [−1, 1], and keeps old links
    (no `face` key) valid;
  - `hairShown(true, true) = 'dry'`, `hairShown(true, false) = 'wet'` (Grommet's curls dry in the shader),
    `hairShown(false, x) = 'wet'`;
  - the panel's face ranges match the sanitiser's.
- [ ] Watch them fail.
- [ ] Implement.
- [ ] Green; commit.

### Task 6: Shading: skin, eyes, lashes, hair

**Files:**
- Modify: `src/render/litSurface.ts` (optional `scatter`), `src/surfer/surferShading.ts` (pores bump, zones: blush,
  orbital, stubble; brow strands; lips gloss; per-fragment eyes with gaze; `lashesMaterial`; the anisotropic hair;
  gums), `src/surfer/skinDetail.ts` (zones for all three), `src/surfer/presets.ts` (per-rider look numbers)
- Create: `src/surfer/face.selftest.ts`
- Test: `src/surfer/skinDetail.test.ts`, `src/dev/selfTests.ts` (import)

- [ ] Tests first:
  - `skinDetail.test.ts`: zones exist for all three manifests, and the stubble zone only where `stubble > 0`;
  - self-tests "the blink closes the eye" (iris pixels at blink 1 < 5% of those at blink 0) and "pores add local
    contrast" (cheek local contrast with pores > 1.3× without).
- [ ] Watch them fail.
- [ ] Implement.
- [ ] Green (vitest and `?selftest=face`); commit.

### Task 7: Grommet's lenses minify; his grin shows his teeth

**Files:**
- Modify: `src/surfer/surferShading.ts` (a `lensPull` on the eyes and the body `positionNode`), `src/surfer/Surfer.ts`
- Test: `src/surfer/face.selftest.ts`

- [ ] Tests first:
  - "the lens minifies": his iris width in pixels with glasses on < 0.93× off;
  - "his grin shows his teeth": teeth-coloured pixels in his mouth box at mood 0.5 > 0.
- [ ] Watch them fail.
- [ ] Implement.
- [ ] Green; commit.

### Task 8: Tuning pass (Shazza pretty; all three by eye)

- [ ] In-game close-ups (front, three-quarter, profile; wet and dry) of all three.
- [ ] Tune Shazza's face targets, colours and hair until she reads as a pretty late-teen surfer.
- [ ] Check T-Bone's and Grommet's upgrades.
- [ ] Run the "everything renders" sweep: every pose × every rider, limbs visible.
- [ ] Commit each round with what changed.

### Task 9: Gate pack, docs, push

- [ ] Face sheets, blink/smile/jaw strips, and idle GIFs for all three, in `tools/surfer/previews/` (git-ignored).
  Send them to Andrew.
- [ ] README (Building the surfers: expressions, lashes, dry hair) and `public/surfer/LICENSES.md` (MPFB expression
  units, CC0).
- [ ] Full vitest, `?selftest=`, typecheck and build.
- [ ] Final review (fresh reviewer); fix pass.
- [ ] Push the branch.
