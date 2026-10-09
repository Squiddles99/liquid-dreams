# Shazza, hero build (bikini) — design

Date: 2026-10-10. Branch `shazza-hero` (from `quiet-captures`, from main d48d7c9).
Sub-project 1 of "AAA characters" (Andrew, 2026-10-10: "absolute likeness to each character, including their various
attire ... AAA quality 3d renders ... full bone structure ... to be put in the many positions required ... surfing").
Approach A, his pick: upgrade the MPFB pipeline. Order, his pick: Shazza in the bikini first; it sets the bar.

Andrew went to sleep after approving the direction; the spec and plan gates are mine tonight (overnight delegation).
Every decision I made for him is marked **Ruling** and can be undone.

## 1. What this delivers

- Shazza in the bikini, built from the painting `art/riders/female/bikini.png`: red triangle top with halter tie, red
  tie-side bottoms (bows and dangling strings at the hips), pink thongs, low loose braids with sun-bleached ends and
  flyaways, centre part, freckles across nose and cheeks, blue-grey eyes, warm tan, athletic slim build.
- **Hero** variant (~60k triangles, 4K texture sets) for the select screen and close-ups, and a **game** variant
  (~27k triangles, 2K) for the ride. Both from one build.
- Cycles renders beside the painting at every gate.
- Not wired into the game in this sub-project (that is sub-project 5, with the other characters).

## 2. Build layout

- New folder `tools/hero/`, run by `npm run build:hero -- female`. It reuses `tools/surfer/mpfb_bridge.py`,
  `rig_trim.py` and `expressions.py` by import (no copies). The old build is untouched and stays the game's source
  until sub-project 5.
- Outputs to `build/hero/female/` (git-ignored): `.blend`, textures, `.glb`s. They are reproducible from the
  scripts. Gate renders (small JPEGs) are committed under `docs/superpowers/specs/2026-10-10-shazza-hero-gates/`.
- **Ruling:** outputs git-ignored until sub-project 5 decides texture compression (KTX2) and the size budget; a 4K
  hero `.glb` risks GitHub's 100 MB file cap.

## 3. Likeness (Gate 1a, on clay)

The likeness is decided on untextured clay, before any expensive work.

1. **Reference marks.** `tools/hero/ref/female.json`: landmarks on the painting in its own pixels — face (brows,
   eye corners, lids, iris centres, nose bridge/tip/alae/subnasale, mouth corners, lip midlines, chin, jaw, cheekbones,
   hairline, ears) and body (shoulders, armpits, elbows, wrists, waist, hip, crotch, knees, ankles), plus the
   painting's alpha silhouette. **Ruling:** I mark the landmarks by eye on zoomed, gridded crops and check them by
   drawing them back over the painting; a detector would need a model download overnight and struggles with painted
   faces.
2. **Model marks.** The same landmarks as MPFB base-mesh vertex indices (stable across targets), picked once by
   raycasting from a front render.
3. **Fit.** All candidate MPFB targets (macros' neighbours, face detail targets, body measure targets) loaded as
   shape keys; their deltas exported as a matrix. A bounded least-squares fit (scipy, outside Blender) of the target
   weights to the marks under a scaled-orthographic camera (scale + offset fitted jointly), face and body weighted
   separately, with a pull toward zero so the unconstrained depth stays plausible. Silhouette widths at the body
   rows join the fit as extra rows.
4. **Residual warp.** What targets can't reach, a smooth RBF warp of the head moves in the image plane only (depth
   kept), capped at 4 mm, so the marks land.
5. **Gate 1a:** clay front render over/beside the painting with the marks drawn on both, plus 3/4, side and back.
   A number: mean face-mark error as a percentage of inter-ocular distance (target < 3 %).

**Ruling (views):** the painting is front only. Profile, nose bridge depth, jaw depth and the back of the head come
from MPFB's late-teen-female prior. The fitter takes any number of views (each = image + marks + its own camera), so
Andrew's extra views (left profile, 3/4, back, face close-up front and side; asked for 2026-10-10) drop straight in.

## 4. Mesh

- MPFB base mesh baked with the fitted weights, helpers deleted, scaled to 1.65 m (as today).
- Hero: one Catmull-Clark level on the body (~55k tris), the head kept whole. Game: the existing decimation to ~27k.
- UVs: MPFB's own body UV layout (one 0–1 tile), kept through subdivision; the game variant's UVs come along through
  the decimation (decimate keeps UVs).

## 5. Skin (Gate 1b)

- Texture sets baked in Blender: base colour, normal (tangent space), roughness, and an SSS/thickness mask. Hero 4K,
  game 2K.
- Base colour: a procedural skin authored in Blender's nodes (tan, redder cheeks/nose/knees/knuckles/elbows, paler
  palms and soles, the freckle field matched to the painting's spread), then baked to the UV tile. **Ruling:** not a
  projection of the painting — its light is painted in and it covers the front only; colours are sampled from it
  instead.
- Normal: pores, fine wrinkles at the eyes and knuckles, lip lines, nails, knee and ankle creases; baked from a
  displacement-detail high-res copy.
- Cycles: Principled BSDF random-walk subsurface, skin radius per channel, a dual-lobe sheen on the shoulders/nose.

## 6. Eyes and mouth

- Eyeball meshes with a separate cornea (refractive bulge), a procedural blue-grey iris (radial fibres, limbal ring,
  darker collarette) and pupil, wet tear line strip, eye-occlusion shell. Teeth and tongue as today's `teeth.py`
  (even), with a gum and wetness pass.

## 7. Hair

- Hero: Blender hair curves, groomed by script: centre part, swept front sections framing the face, two low
  three-strand plaits (real over/under weaving of three strand bundles, each bundle many curves), elastics, frayed
  plait ends, flyaways and baby hairs at the hairline. Principled Hair BSDF (Chiang), melanin from the painting:
  honey blonde roots to sun-bleached ends.
- Game: hair cards converted from the curves into the existing atlas route (`hair_atlas.py`), so the game shader keeps
  working.

## 8. Bikini and thongs

- Separate garment meshes from the body surface (offset shells cut by curves): triangle cups with a hem binding, the
  halter tie behind the neck with a bow and tails, the under-bust band and back tie; tie-side bottoms with bows and
  hanging strings at each hip. Cloth sim settles the ties and strings against the body in the rest pose; they are
  skinned (and the braids and strings get bones, §9) for posing.
- Fabric: nylon-lycra red with sheen, a baked knit normal and binding stitches. Thongs: pink EVA sole with a
  Y-strap, as in the painting.

## 9. Skeleton (Gate 1c)

- Today's contract stays: 23 game bones + 30 finger bones, MPFB expression morphs.
- Added: twist bones (upper arm, forearm, thigh, shin; each side) carrying a share of the child's roll, toe bones,
  a 4-bone chain per braid, and 2-bone chains for the bikini's hip strings.
- Pose-space correctives (shape keys) for knee and elbow deep flexion, shoulder raise, hip flex/deep squat and the
  wrist, each tied to its joint angle (driver in Blender; the game drives them in sub-project 5).
- Weights: ≤ 4 per vertex in the game variant; the hero may use 8.
- **Gate 1c:** five posed Cycles renders — prone paddle, pop-up, low bottom turn, tube crouch, duck dive — checked for
  candy-wrapper twists, intersections and anything poking through.

## 10. Checks run on every build

- Face-mark error vs the painting (% inter-ocular), body-mark error (% height).
- Garments outside the body (ray check, as `clothes.outside_check`).
- Max bone weights per vertex, bone count, triangle counts per variant, texture sizes.
- Every limb visible in every gate pose (Andrew's standing rule: "be careful everything renders").

## 11. Gates

- **1a** likeness on clay (§3). **1b** textured Cycles renders beside the painting: front, 3/4, side, back, face
  close. **1c** posed renders (§9). Each gate's pack goes to Andrew; overnight I may pass a gate on my own judgement
  and record why, but he signs off 1a and 1b himself before the other characters start.

## 12. Out of scope

- The other outfits and characters (sub-projects 2–4); the game swap, LOD switching, KTX2 and frame-rate checks
  (sub-project 5); a wet-skin look (later, with the game).
