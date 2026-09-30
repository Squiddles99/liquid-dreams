# Close-up Detail and Idle Life: Design

**Date:** 2026-10-01 · **Branch:** `closeup-and-idle` (worktree `ld-surfer`) · **Status:** written overnight under
Andrew's delegation ("You have to do your best and work autonomously and complete step 2 with amazing detail. Make sure
you make the female pretty."). Every call marked **Ruling** is mine, taken while he slept; each is his to overturn.

## 1. What this is

Step 2 of the front-door roadmap (grommet spec §1): lift all three riders (Shazza, T-Bone, Grommet) to close-up
quality, and give them idle life. The select screen (step 4) and the intro cinematic (step 5) will hold the camera a
metre from their faces, and on the stand today a face close-up shows mannequins:
- Shazza's hair is a helmet of wide planks with a hard hairline;
- her skin is one flat orange;
- her eyes are small and lashless;
- her lip paint is an ellipse that spills past the lips;
- her jaw is square under a tall forehead.

**Andrew's one explicit ask:** make Shazza pretty. The tone stays the project's: grounded realism, a pretty late-teen
surfer girl, never glamour or cartoon.

Carried in from earlier specs:
- **Grommet spec §8:** pores, the lens magnification, breathing, blinks and the jaw.
- **Grommet spec, steps 2–3:** dry hairstyles for Shazza and T-Bone.
- **The deferred minor:** gate the rebuild that repaints Shazza's and T-Bone's mouths. This step rebuilds all three,
  and the gate is Andrew's morning review.

## 2. The approach

**Ruling (approach):** keep the scripted Blender + MPFB pipeline (CC0), and add three things to it:
1. **MPFB's expression units** (CC0 MakeHuman targets, found in MPFB's `data/targets/expression/units/caucasian`),
   baked as glTF **morph targets**:
   - eye closure (blinks);
   - mouth-open (the jaw);
   - the corner-puller (a smile);
   - the brow raisers;
   - the eye slit (squinting into the sun);
   - nostril dilation.
2. The base mesh's own **eyelash helper strips**, kept as lashes. They ride the blink morphs because the expression
   targets move them.
3. The head kept at **full resolution** through decimation.

Everything else is in the shaders, drawn per fragment and anchored to the unskinned surface as Grommet's freckles are:
pores, subsurface-tinted wrap lighting, blush, stubble, brow strands, eyes, and anisotropic hair.

Idle life is a small pure-TS model ticked by the stand. It drives the morph weights, the eyes' gaze and the head's look
target.

Two alternatives were set aside:
- **Hand-sculpted morphs** or a face rig: not scriptable, not reproducible.
- **Baked skin textures:** licence risk (MPFB's bundled skin masks aren't clearly CC0), plus a UV pipeline we don't
  have.

## 3. Shazza, pretty (the headline)

- **Face shape (MPFB face targets, tuned by eye at the gate):**
  - a smaller, narrower jaw and a softer V chin;
  - a lower forehead;
  - fuller cheeks with higher cheekbones;
  - larger almond eyes with a slight upward tilt at the outer corners;
  - a small straight nose with a lifted tip;
  - fuller lips with a clear cupid's bow.
- **Eyes:**
  - eyeballs sized and placed from MPFB's own eye helper (ours were 11.5 mm spheres in a socket built for ~12.5 mm, so
    they read small and sunken);
  - a crisp per-fragment iris with a limbal ring, fibres and a catchlight;
  - the upper lid's shadow on the eyeball;
  - **real lashes**, upper and lower.
- **Brows:** fuller, groomed arches drawn as fine strands, not a flat stripe.
- **Lips:** painted from MPFB's `lips` vertex group (the exact vermilion) with a soft edge, a natural rose tint and a
  gloss. The spill goes.
- **Skin:**
  - a natural light tan with warm subsurface in the terminator;
  - a soft blush on the cheeks and nose;
  - fine pores;
  - a satin sheen, oilier down the T-zone.
- **Hair:**
  - **wet** (in the water): a slicked-back ponytail again, rebuilt from many fine cards with a soft hairline;
  - **dry** (on land): long loose beach waves past the shoulders, framing the face.
- **Expression:** a soft resting smile, never a grin.

## 4. Close-up detail for all three

### 4.1 Build (Blender)
1. **Expressions.** After the macro and face targets are baked, the expression units load as shape keys. Their deltas
   are stored as float-vector vertex attributes, which survive the helper deletion, the height scale (the deltas are
   scaled with it) and decimation (collapse interpolates vertex data). After decimation they become shape keys again,
   and the glb is exported with `export_morph=True`. The morphs, by name:
   - `blinkL`, `blinkR`: `eye-left-closure`, `eye-right-closure`;
   - `jawOpen`: `mouth-open`;
   - `smile`: `mouth-corner-puller`;
   - `browsUp`: the two `eyebrows-*-up`;
   - `browsInner`: the two `eyebrows-*-inner-up`;
   - `squint`: the two `eye-*-slit`;
   - `nostrils`: the two `nose-*-dilatation`;
   - `breathe`: our own, the chest and upper belly pushed out along the normals, peaking at 6 mm (§5.3).
2. **The head at full resolution:** decimation is weighted by a vertex group, so the head (and the lashes) keep every
   vertex. **Ruling:** the triangle budget rises from ~21,000 to what the head keeps plus the decimated rest, capped at
   30,000. A modern GPU draws three such bodies trivially.
3. **Lashes:**
   - the upper and lower lash helper strips (`helper-*-eyelashes-2` / `-1`) are kept in the body mesh with their own
     material, `lashes`;
   - they are lengthened and curled outward per character (Shazza longest);
   - they are skinned to the head, and ride `blinkL` / `blinkR` / `squint`.
4. **Eyes:**
   - spheres fitted to MPFB's eye helper: centre at the helper's centroid, radius the median distance minus the cornea
     (≈12–12.5 mm);
   - 32 × 24 segments for a smooth silhouette;
   - the manifest records each eye's centre, so the shader draws the iris toward a gaze vector.
5. **Teeth for all three:**
   - Shazza and T-Bone get even upper and lower rows (`style: "even"`);
   - Grommet keeps his buck upper row and gains a lower row;
   - the lower row carries a `jawOpen` morph, the mean motion of MPFB's lower-teeth helper under `mouth-open`, so it
     drops with the jaw.
6. **Lips:** the paint comes from the `lips` group (captured before the trim drops non-bone groups), limited to the
   front surface and feathered one ring out.
7. **Blink check:** the build applies `blinkL` / `blinkR` at 1 and casts rays at each eye from in front. The closed lid
   must hit before the eyeball. The result is written to the manifest (`checks.blinkCovers`), and a test pins it.
8. **Dry hair:**
   - each preset may name a `dryHair` style, built as a second card mesh with material `hairDry`;
   - the game shows `hair` in the water and `hairDry` on land;
   - Grommet's dry look is his curls without the wet pull, so he needs no second mesh;
   - long dry hair is skinned from the head at the roots, blending to the neck and upper spine at the tips, so it
     follows the shoulders rather than cutting through them.

### 4.2 Shading (TSL)
- **Pores:** a bump from a Worley pit field (~0.5 mm cells) plus fine noise, perturbing the normal with the
  screen-derivative bump method (Mikkelsen 2010):
  - strongest on the nose and cheeks, medium on the forehead and chin, faint on the body, none on the lips;
  - faded out where a pore falls under a pixel, so it never shimmers.
- **Subsurface feel:** `litColor` gains an optional per-channel `scatter` tint for the wrap term, so red light reaches
  further past the terminator than blue. Rocks and other callers are unchanged.
- **Colour zones (per character):**
  - a blush on the cheeks, nose tip and ears;
  - a faint orbital shadow;
  - the lips' tint and gloss;
  - T-Bone's **stubble** (a fine dark speckle over the jaw, chin and upper lip, from landmarks);
  - Grommet's freckles, sunburn and pimples as before.
- **Brows:** the painted mask broken into strands by noise stretched along the brow.
- **Eyes:**
  - sclera, iris, limbus and pupil drawn per fragment from the angle to the gaze direction (crisp at any distance);
  - the iris gets radial fibres, a darker rim, and a lighter ring by the pupil;
  - the sclera is pinker toward the corners;
  - a wet highlight;
  - the upper lid's shadow across the top.
- **Lashes:** alpha-tested strands, dark with a slight warm tint.
- **Hair:**
  - a Kajiya–Kay anisotropic highlight along the strands (the tangent from the cards' UV derivatives), with a second,
    tinted highlight;
  - darker toward the scalp for depth.
- **Grommet's lenses (ruling: geometry, not screen refraction).** His minus lenses make his eyes look smaller:
  - while the glasses are on, the eye, lash and eyelid-skin vertices inside each lens's footprint are drawn about 12%
    toward the lens's axis (the eyes' material and the body's `positionNode`, faded to zero by the rim);
  - the thick frames hide the fade;
  - screen-space refraction would depend on the post pipeline's passes, where a viewport copy isn't guaranteed.

## 5. Idle life

### 5.1 The model (`src/surfer/idleLife.ts`, pure, seeded, testable)
`IdleLife` holds per-surfer state and `tick(dtS, ctx) → FaceState`:
- **Blinks:**
  - intervals drawn from 2–6 s, with occasional double blinks (1 in 6);
  - each blink closes in 70 ms, holds 40 ms, and opens in 140 ms;
  - left and right are equal (a real blink is bilateral);
  - a blink also comes with each large gaze shift.
- **Gaze:** saccades every 0.6–3 s to small offsets (≤ 8° yaw, ≤ 5° pitch) around the look target, reached in 40 ms.
  On land, now and then a glance at the camera.
- **Head:** a slow look-around (every 4–9 s, ≤ 20° yaw, ≤ 8° pitch). The eyes lead and the head follows over ~0.6 s.
  It applies only in still poses (`sit`) and on land; while paddling or riding the head keeps the pose's own look.
- **Breathing:**
  - 14 breaths a minute at rest, up to 30 after exertion;
  - the depth rises with exertion;
  - exertion rises while paddling or popping up and eases back over ~20 s;
  - drives `breathe` and `nostrils`, and opens `jawOpen` a little when breathing hard.
- **Expression:**
  - a per-character resting mood: Shazza a soft smile (0.3), T-Bone a relaxed half smile (0.15), Grommet a goofy grin
    (0.5) with his buck teeth showing;
  - it drifts slowly, with an occasional bigger smile and brow lift;
  - squinting rises with how directly the sun faces the eyes.

`FaceState` is:
```ts
{ blinkL, blinkR, jawOpen, smile, browsUp, browsInner, squint, nostrils, breathe: number;
  gazeYawDeg, gazePitchDeg, headYawDeg, headPitchDeg: number }
```

### 5.2 Wiring
- `Surfer.setFace(f)` sets the morph influences on every mesh that has them, and the gaze uniform on the eyes.
- `SurferStand.update` ticks `IdleLife`:
  - it turns the lookAt point by the head offsets before `solvePose`;
  - it feeds the sun's direction for the squint;
  - it passes `simTime` deltas, so paused captures are repeatable.
- A dev-panel **Face** sub-folder:
  - `idle life` on/off;
  - manual dials that override each channel (for the gate and for testing);
  - a `blink now` button.
  These persist with the Surfer folder (sanitised; old links open unchanged).

### 5.3 The breathe morph
Built in Blender, not from MPFB:
- torso vertices weighted to `spine_02` / `spine_03` move out along their normals;
- the move peaks at 6 mm over the sternum and upper belly and fades to zero at the arms, neck and pelvis;
- the collarbones lift 2 mm.

No bone moves for breathing, so the pose sweeps (no buried hands, the drop-knee spot) are untouched.

## 6. Testing

- **Pure (vitest):**
  - `idleLife` blink intervals and durations over a long run: seeded, in range, bilateral, deterministic;
  - saccade amplitudes are bounded;
  - breathing rate and depth rise with exertion and recover;
  - the head holds still while riding;
  - `FaceState` values stay in [0, 1] and within the angle bounds.
- **Manifest and glb (vitest):**
  - all three glbs have the nine morph names on the body;
  - the lashes' material and the teeth exist, and the lower teeth carry `jawOpen`;
  - `checks.blinkCovers` is true;
  - the head has at least 5,000 triangles;
  - landmarks exist for all three;
  - the dry-hair mesh exists where the preset names one.
- **GPU self-tests:**
  - **the blink closes the eye:** iris pixels on an eye close-up vanish at `blinkL = blinkR = 1`;
  - **pores:** the cheek's local contrast rises with pores on against off;
  - **the smile shows teeth:** Grommet's teeth pixels appear at his resting grin;
  - **the lens minifies:** Grommet's iris spans fewer pixels with glasses on.
- **Existing:** every pose sweep, and "everything renders" in every pose, for all three.

## 7. Gate (Andrew, in the morning)

- Face sheets per rider: front, three-quarter and profile; wet and dry; a strip of a blink, a smile and the jaw.
- An animated idle loop per rider (GIF).
- In-game shots on the stand.

Nothing merges without his sign-off. The branch is pushed.

## 8. Out of scope

- Walking clothes, backpacks, the glasses packed away: step 3.
- The select screen: step 4.
- Lip-sync and dialogue (Shazza's line in the intro): step 5.
- Wind in the hair and hair physics.
- Screen-space refraction.

## 9. Rulings (all mine, overnight)

1. **Approach:** MPFB expression units as glTF morphs, with shader detail (§2).
2. **Budget:** the triangle budget rises to at most 30,000 per body, to keep the head whole.
3. **Grommet's lenses:** minified by geometry, not screen refraction.
4. **Breathing:** a morph, not bones, so the pose sweeps are untouched.
5. **Shazza's wet hair:** a ponytail; her dry hair is long, loose waves. T-Bone's dry hair is tousled short.
6. **Resting moods:** Shazza 0.3 smile, T-Bone 0.15, Grommet a 0.5 grin.
7. **Scope:** idle head motion only in still poses and on land.
8. **Rebuild:** all three bodies are rebuilt, which repaints the mouths; Andrew's review is the gate the deferred minor
   asked for.
